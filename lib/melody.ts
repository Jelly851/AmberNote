// Turning a wobbly pitch trace into discrete notes.
//
// Lifted out of components/PitchDisplay.web.tsx so three callers share one
// definition of what counts as a sung note: the web display, the iOS display,
// and the MIDI export. Before this, the segmentation existed only inside a
// web-only drawing file, which is why a sung take could be seen but never
// exported.

import type { PitchFrame } from './yin';

export interface NoteSegment {
  midi: number;
  start: number; // seconds
  end: number;   // seconds
}

export const CONF_THRESHOLD = 0.45;
export const MIN_NOTE_MS = 80; // ignore segments shorter than this (noise / transitions)

export function detectNoteSegments(
  frames: PitchFrame[],
  threshold: number = CONF_THRESHOLD,
): NoteSegment[] {
  const raw: NoteSegment[] = [];
  let current: NoteSegment | null = null;

  for (const f of frames) {
    if (f.midi === null || f.confidence < threshold) {
      if (current) raw.push(current);
      current = null;
      continue;
    }
    const midi = Math.round(f.midi);

    if (!current) {
      current = { midi, start: f.time, end: f.time };
    } else if (Math.abs(midi - current.midi) > 1) {
      raw.push(current);
      current = { midi, start: f.time, end: f.time };
    } else {
      current.end = f.time;
    }
  }
  if (current) raw.push(current);

  return raw.filter(seg => (seg.end - seg.start) * 1000 >= MIN_NOTE_MS);
}

/** Vertical range to draw, padded and snapped outward to whole octaves. */
export function computeRange(frames: PitchFrame[]): { midiMin: number; midiMax: number } {
  const midis = frames
    .filter(f => f.midi !== null && f.confidence >= CONF_THRESHOLD)
    .map(f => f.midi!);

  if (midis.length === 0) return { midiMin: 48, midiMax: 72 }; // C3–C5

  const paddedMin = Math.min(...midis) - 3;
  const paddedMax = Math.max(...midis) + 3;
  let midiMin = Math.floor(paddedMin / 12) * 12;
  let midiMax = Math.ceil(paddedMax / 12) * 12;

  if (midiMax - midiMin < 12) midiMax = midiMin + 12; // at least one octave
  midiMin = Math.max(midiMin, 24);
  midiMax = Math.min(midiMax, 108);

  return { midiMin, midiMax };
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// Warm → cool around the chromatic scale so adjacent notes stay distinct
export const PITCH_CLASS_COLORS = [
  '#E05252', '#E07A52', '#E0A352', '#D4BC52',
  '#A8C252', '#52C252', '#52C28F', '#52B8C2',
  '#5291C2', '#5265C2', '#7A52C2', '#B052C2',
];
