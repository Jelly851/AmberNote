// A sung take, out as a MIDI file.
//
// Both halves of this already existed and had never been joined: lib/yin.ts
// finds the notes in a recording, and lib/exportSong.ts can write a Standard
// MIDI File. This connects them, so humming an idea produces a melody that
// opens in a DAW rather than a picture of one.

import { Platform } from 'react-native';

import { encodeTrack, str, vlq, TPQ, type MidiEvent } from './exportSong';
import { detectNoteSegments, type NoteSegment } from './melody';
import type { PitchFrame } from './yin';

function header(trackCount: number): number[] {
  return [
    0x4d, 0x54, 0x68, 0x64,       // MThd
    0x00, 0x00, 0x00, 0x06,       // header length
    0x00, 0x01,                   // format 1 — one meta track plus parts
    (trackCount >> 8) & 0xff, trackCount & 0xff,
    (TPQ >> 8) & 0xff, TPQ & 0xff,
  ];
}

/** Sung note segments to a Standard MIDI File. Seconds become ticks through
 *  the tempo, so the exported notes land where they were actually sung. */
export function melodyToMidi(
  segments: NoteSegment[],
  bpm: number,
  title: string,
): Uint8Array {
  const tempo = bpm && bpm > 0 ? bpm : 120;
  const ticksPerSecond = (TPQ * tempo) / 60;
  const name = title || 'Melody';

  const meta: MidiEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(str(name).length), ...str(name)] },
    {
      tick: 0,
      order: 1,
      bytes: (() => {
        const us = Math.round(60000000 / tempo);
        return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
      })(),
    },
    { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
  ];

  const melody: MidiEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(6), ...str('Melody')] },
  ];

  for (const seg of segments) {
    const on = Math.round(seg.start * ticksPerSecond);
    const off = Math.max(on + 1, Math.round(seg.end * ticksPerSecond));
    melody.push({ tick: on, order: 1, bytes: [0x90, seg.midi & 0x7f, 90] });
    melody.push({ tick: off, order: 0, bytes: [0x80, seg.midi & 0x7f, 0] });
  }

  return new Uint8Array([...header(2), ...encodeTrack(meta), ...encodeTrack(melody)]);
}

function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : chars[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : chars[c & 63];
  }
  return out;
}

/** Write the melody out and hand it to the user: a download on web, the share
 *  sheet on device. Mirrors how exportSongToZip delivers its file. */
export async function shareMelodyMidi(
  frames: PitchFrame[],
  bpm: number | null | undefined,
  title: string,
): Promise<number> {
  const segments = detectNoteSegments(frames);
  if (segments.length === 0) throw new Error('No notes detected in this take');

  const safe = (title || 'Melody').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 60);
  const bytes = melodyToMidi(segments, bpm ?? 120, safe);
  const fileName = `${safe}.mid`;

  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, toBase64(bytes), { encoding: 'base64' as any });
    await Sharing.shareAsync(uri, { mimeType: 'audio/midi', dialogTitle: `Export ${safe}` });
  }

  return segments.length;
}
