// ─── DAW Export ───────────────────────────────────────────────────────────────
// Bundles a song as a DAW-ready zip:
//   SongName/
//     Audio/01 Verse 1/Line 2 - melody - Idea 3.m4a   (every attached layer)
//     MIDI/SongName.mid                                (melody + chords + tempo)
//     Lyrics.txt
//     Song Info.txt                                    (key, BPM, chord chart)
// Web: downloads the zip. Native: opens the system share sheet.

import JSZip from 'jszip';
import { Platform } from 'react-native';

import {
  getAllRecordings, getAudioLayers, getChordCells, getLines, getRhythmCells, getSections, getSongs,
} from '@/lib/db';
import type { ChordCell, Line, NoteValue, Recording, RhythmCell, Section, Song } from '@/lib/types';

export interface ExportOptions {
  stems: boolean;
  midi: boolean;
  lyrics: boolean;
}

const NOTE_VALUE_BEATS: Record<NoteValue, number> = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25,
  'dotted-half': 3, 'dotted-quarter': 1.5, 'dotted-eighth': 0.75,
  'half-triplet': 4 / 3, 'quarter-triplet': 2 / 3, 'eighth-triplet': 1 / 3, 'sixteenth-triplet': 1 / 6,
};

const SEMITONES: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function safeName(s: string): string {
  return (s || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// ─── Song data snapshot ───────────────────────────────────────────────────────

interface LineBundle {
  line: Line;
  chords: ChordCell[];
  rhythm: RhythmCell[];
}

interface SectionBundle {
  section: Section;
  lines: LineBundle[];
}

function collect(songId: string): { song: Song; sections: SectionBundle[] } | null {
  const song = getSongs().find(s => s.id === songId);
  if (!song) return null;
  const sections = getSections(songId).map(section => ({
    section,
    lines: getLines(section.id).map(line => ({
      line,
      chords: getChordCells(line.id),
      rhythm: getRhythmCells(line.id),
    })),
  }));
  return { song, sections };
}

// ─── Lyrics + song sheet ──────────────────────────────────────────────────────

function buildLyricsTxt(song: Song, sections: SectionBundle[]): string {
  const out: string[] = [song.title, ''];
  for (const { section, lines } of sections) {
    out.push(`[${section.label.toUpperCase()}]`);
    for (const { line } of lines) {
      if (line.text.trim()) out.push(line.text);
    }
    out.push('');
  }
  return out.join('\n');
}

function chordName(c: ChordCell): string {
  return `${c.root}${c.quality === 'maj' ? '' : c.quality}${c.slashBass ? '/' + c.slashBass : ''}`;
}

function buildSongInfoTxt(song: Song, sections: SectionBundle[]): string {
  const out: string[] = [
    song.title,
    `Key: ${song.key ?? '—'}`,
    `BPM: ${song.bpm ?? '—'}`,
    `Time signature: ${song.timeSignature ?? '4/4'}`,
    '',
    'Exported from AmberNote',
    '',
    '── Chord chart ──',
  ];
  for (const { section, lines } of sections) {
    out.push('', `[${section.label.toUpperCase()}]`);
    for (const { line, chords } of lines) {
      if (chords.length === 0 && !line.text.trim()) continue;
      const chordStr = chords
        .sort((a, b) => a.position - b.position)
        .map(chordName)
        .join('  ');
      if (chordStr) out.push(`  (${chordStr})`);
      if (line.text.trim()) out.push(`  ${line.text}`);
    }
  }
  return out.join('\n');
}

// ─── MIDI writer ──────────────────────────────────────────────────────────────

export const TPQ = 480; // ticks per quarter note

export function vlq(n: number): number[] {
  // variable-length quantity
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}

export function str(s: string): number[] {
  return Array.from(s).map(c => c.charCodeAt(0) & 0x7f);
}

export interface MidiEvent { tick: number; order: number; bytes: number[] }

export function encodeTrack(events: MidiEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let lastTick = 0;
  for (const ev of sorted) {
    data.push(...vlq(Math.max(0, Math.round(ev.tick - lastTick))), ...ev.bytes);
    lastTick = ev.tick;
  }
  data.push(...vlq(0), 0xff, 0x2f, 0x00); // end of track
  const len = data.length;
  return [
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
    ...data,
  ];
}

function pitchToMidi(pitch: string): number | null {
  const m = pitch.match(/^([A-G]#?)(\d)$/);
  if (!m) return null;
  const semi = SEMITONES[m[1]];
  if (semi === undefined) return null;
  return (parseInt(m[2]) + 1) * 12 + semi;
}

const CHORD_INTERVALS: [string, number[]][] = [
  ['maj7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['add9', [0, 4, 7, 14]],
  ['m7',   [0, 3, 7, 10]],
  ['m6',   [0, 3, 7, 9]],
  ['dim',  [0, 3, 6]],
  ['aug',  [0, 4, 8]],
  ['m9',   [0, 3, 7, 10, 14]],
  ['9',    [0, 4, 7, 10, 14]],
  ['m',    [0, 3, 7]],
  ['min',  [0, 3, 7]],
  ['7',    [0, 4, 7, 10]],
  ['6',    [0, 4, 7, 9]],
];

function chordToMidi(c: ChordCell): number[] {
  const rootSemi = SEMITONES[c.root ?? 'C'] ?? 0;
  const root = 48 + rootSemi; // around C3
  const q = (c.quality ?? '').toLowerCase();
  let intervals = [0, 4, 7]; // default major
  for (const [suffix, iv] of CHORD_INTERVALS) {
    if (q.includes(suffix)) { intervals = iv; break; }
  }
  const notes = intervals.map(i => root + i);
  if (c.slashBass && SEMITONES[c.slashBass] !== undefined) {
    notes.unshift(36 + SEMITONES[c.slashBass]);
  }
  return notes;
}

/**
 * Lays lines out sequentially: each line starts on the bar after the previous
 * line's content ends (minimum one bar per line with content). Sections get
 * MIDI markers so the DAW timeline mirrors the song structure.
 */
function buildMidi(song: Song, sections: SectionBundle[]): Uint8Array {
  const bpm = song.bpm && song.bpm > 0 ? song.bpm : 120;
  const [numStr, denStr] = (song.timeSignature ?? '4/4').split('/');
  const num = parseInt(numStr) || 4;
  const den = parseInt(denStr) || 4;
  const beatsPerBar = num * (4 / den); // in quarter-note beats
  const barTicks = Math.round(beatsPerBar * TPQ);

  const meta: MidiEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(str(song.title).length), ...str(song.title)] },
    { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03, ...(() => { const us = Math.round(60000000 / bpm); return [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]; })()] },
    { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, num, Math.round(Math.log2(den)), 24, 8] },
  ];
  const melody: MidiEvent[] = [{ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(6), ...str('Melody')] }];
  const chords: MidiEvent[] = [{ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(6), ...str('Chords')] }];

  let cursor = 0; // ticks

  for (const { section, lines } of sections) {
    const hasContent = lines.some(l => l.rhythm.length > 0 || l.chords.length > 0);
    meta.push({ tick: cursor, order: 3, bytes: [0xff, 0x06, ...vlq(str(section.label).length), ...str(section.label)] });
    if (!hasContent) continue;

    for (const { line, chords: lineChords, rhythm } of lines) {
      if (rhythm.length === 0 && lineChords.length === 0) continue;
      const resolution = Math.max(1, line.chordResolution || 8);
      const cellTicks = barTicks / resolution;
      const offsetTicks = Math.round((line.beatOffset ?? 0) * TPQ);
      const lineStart = cursor;
      let lineEnd = lineStart;

      for (const cell of rhythm) {
        if (!cell.pitch) continue;
        const midi = pitchToMidi(cell.pitch);
        if (midi === null) continue;
        const start = Math.round(lineStart + cell.position * cellTicks - offsetTicks);
        if (start < 0) continue;
        const dur = Math.max(30, Math.round((NOTE_VALUE_BEATS[cell.noteValue] ?? 1) * TPQ));
        melody.push({ tick: start, order: 10, bytes: [0x90, midi, 96] });
        melody.push({ tick: start + dur, order: 5, bytes: [0x80, midi, 0] });
        lineEnd = Math.max(lineEnd, start + dur);
      }

      const sortedChords = [...lineChords].sort((a, b) => a.position - b.position);
      sortedChords.forEach((cell, i) => {
        const start = Math.round(lineStart + cell.position * cellTicks);
        // chord rings until the next chord or the end of its bar
        const nextStart = i + 1 < sortedChords.length
          ? Math.round(lineStart + sortedChords[i + 1].position * cellTicks)
          : Math.ceil((start - lineStart + 1) / barTicks) * barTicks + lineStart;
        const dur = Math.max(60, nextStart - start);
        for (const n of chordToMidi(cell)) {
          chords.push({ tick: start, order: 10, bytes: [0x91, n, 80] });
          chords.push({ tick: start + dur, order: 5, bytes: [0x81, n, 0] });
        }
        lineEnd = Math.max(lineEnd, start + dur);
      });

      // next line starts on the next bar
      const usedBars = Math.max(1, Math.ceil((lineEnd - lineStart) / barTicks));
      cursor = lineStart + usedBars * barTicks;
    }
  }

  const tracks = [encodeTrack(meta), encodeTrack(melody), encodeTrack(chords)];
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, // MThd len 6
    0, 1,                               // format 1
    0, tracks.length,
    (TPQ >> 8) & 0xff, TPQ & 0xff,
  ];
  return Uint8Array.from([...header, ...tracks.flat()]);
}

// ─── Audio stems ──────────────────────────────────────────────────────────────

function extFromPath(p: string): string {
  const m = p.split('?')[0].match(/\.(\w{2,4})$/);
  return m ? m[1] : (Platform.OS === 'web' ? 'webm' : 'm4a');
}

async function readAudio(filePath: string): Promise<{ data: ArrayBuffer | string; base64: boolean } | null> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(filePath);
      if (!res.ok) return null;
      return { data: await res.arrayBuffer(), base64: false };
    }
    const FileSystem = await import('expo-file-system/legacy');
    const b64 = await FileSystem.readAsStringAsync(filePath, { encoding: 'base64' as any });
    return { data: b64, base64: true };
  } catch {
    return null;
  }
}

async function addStems(zip: JSZip, root: string, sections: SectionBundle[]): Promise<number> {
  const recordings = new Map<string, Recording>(getAllRecordings().map(r => [r.id, r]));
  let added = 0;
  for (let si = 0; si < sections.length; si++) {
    const { section, lines } = sections[si];
    for (let li = 0; li < lines.length; li++) {
      const layers = getAudioLayers(lines[li].line.id);
      for (const layer of layers) {
        const rec = recordings.get(layer.recordingId);
        if (!rec) continue;
        const audio = await readAudio(rec.filePath);
        if (!audio) continue;
        const folder = `${root}/Audio/${String(si + 1).padStart(2, '0')} ${safeName(section.label)}`;
        const name = `Line ${li + 1} - ${layer.layerType} - ${safeName(rec.title ?? 'memo')}.${extFromPath(rec.filePath)}`;
        zip.file(`${folder}/${name}`, audio.data as any, audio.base64 ? { base64: true } : {});
        added++;
      }
    }
  }
  return added;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export interface ExportResult { files: number; skippedAudio: boolean }

export async function exportSongToZip(songId: string, opts: ExportOptions): Promise<ExportResult> {
  const data = collect(songId);
  if (!data) throw new Error('Song not found');
  const { song, sections } = data;

  const zip = new JSZip();
  const root = safeName(song.title);
  let files = 0;
  let audioAdded = 0;

  if (opts.lyrics) {
    zip.file(`${root}/Lyrics.txt`, buildLyricsTxt(song, sections));
    zip.file(`${root}/Song Info.txt`, buildSongInfoTxt(song, sections));
    files += 2;
  }
  if (opts.midi) {
    zip.file(`${root}/MIDI/${root}.mid`, buildMidi(song, sections));
    files += 1;
  }
  if (opts.stems) {
    audioAdded = await addStems(zip, root, sections);
    files += audioAdded;
  }

  if (files === 0) throw new Error('Nothing selected to export');

  const zipName = `${root}.zip`;

  if (Platform.OS === 'web') {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const b64 = await zip.generateAsync({ type: 'base64' });
    const uri = `${FileSystem.cacheDirectory}${zipName}`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' as any });
    await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: `Export ${song.title}` });
  }

  return { files, skippedAudio: opts.stems && audioAdded === 0 };
}
