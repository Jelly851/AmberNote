import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { PitchFrame } from '@/lib/pitch';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_H = 130;
const LABEL_W = 26;   // left margin for note labels
const CONF_THRESHOLD = 0.45;
const MIN_NOTE_MS = 80; // ignore note segments shorter than this (noise / transitions)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

// ─── Pitch-class colors (one per semitone, C through B) ──────────────────────
// Warm → cool around the chromatic scale so adjacent notes are visually distinct
const PITCH_CLASS_COLORS = [
  '#E05252', // C   – red
  '#E07A52', // C#  – red-orange
  '#E0A352', // D   – orange
  '#D4BC52', // D#  – amber
  '#A8C252', // E   – yellow-green
  '#52C252', // F   – green
  '#52C28F', // F#  – teal-green
  '#52B8C2', // G   – teal
  '#5291C2', // G#  – sky blue
  '#5265C2', // A   – blue
  '#7A52C2', // A#  – indigo
  '#B052C2', // B   – purple
];

// ─── Note-segment detection ───────────────────────────────────────────────────
// Collapses the raw, wobbly frame-by-frame pitch trace into discrete sung/played
// notes (onset → offset), the way a piano roll would show it.

interface NoteSegment {
  midi: number;
  start: number; // seconds
  end: number;   // seconds
}

function detectNoteSegments(frames: PitchFrame[], threshold: number): NoteSegment[] {
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

// ─── Auto-scale helpers ───────────────────────────────────────────────────────

function computeRange(frames: PitchFrame[]): { midiMin: number; midiMax: number } {
  const midis = frames
    .filter(f => f.midi !== null && f.confidence >= CONF_THRESHOLD)
    .map(f => f.midi!);

  if (midis.length === 0) {
    // Default: middle two octaves (C3–C5) when nothing to show
    return { midiMin: 48, midiMax: 72 };
  }

  const rawMin = Math.min(...midis);
  const rawMax = Math.max(...midis);

  // Pad 3 semitones above and below, then snap outward to the nearest C note
  const paddedMin = rawMin - 3;
  const paddedMax = rawMax + 3;
  let midiMin = Math.floor(paddedMin / 12) * 12; // snap down to C
  let midiMax = Math.ceil(paddedMax / 12) * 12;  // snap up to C

  // Always show at least one full octave so there are at least 2 C labels
  if (midiMax - midiMin < 12) midiMax = midiMin + 12;

  // Hard clamp to sane absolute range
  midiMin = Math.max(midiMin, 24);  // no lower than C1
  midiMax = Math.min(midiMax, 108); // no higher than C8

  return { midiMin, midiMax };
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function draw(
  canvas: HTMLCanvasElement,
  frames: PitchFrame[],
  duration: number,
  cssW: number,
  accentColor: string,
  bpm?: number | null,
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = CANVAS_H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const W = cssW;
  const H = CANVAS_H;
  const drawW = W - LABEL_W;

  const { midiMin, midiMax } = computeRange(frames);
  const semitoneH = H / (midiMax - midiMin);

  const midiToY = (midi: number) =>
    H - ((midi - midiMin) / (midiMax - midiMin)) * H;
  const timeToX = (t: number) =>
    LABEL_W + (duration > 0 ? (t / duration) * drawW : 0);

  // ── Background ──
  ctx.fillStyle = '#F6F3EE';
  ctx.fillRect(0, 0, W, H);

  // ── Alternating octave bands (helps read register at a glance) ──
  for (let midi = midiMin; midi < midiMax; midi += 12) {
    const octave = Math.floor(midi / 12);
    if (octave % 2 === 0) continue;
    const yBottom = midiToY(midi);
    const yTop = midiToY(midi + 12);
    ctx.fillStyle = 'rgba(28,26,23,0.025)';
    ctx.fillRect(LABEL_W, yTop, drawW, yBottom - yTop);
  }

  // ── Grid lines ──
  for (let midi = midiMin; midi <= midiMax; midi++) {
    const name = NOTE_NAMES[midi % 12];
    const y = midiToY(midi);

    if (name === 'C') {
      ctx.strokeStyle = '#DDD8D0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LABEL_W, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      ctx.fillStyle = '#A09990';
      ctx.font = `bold 8px -apple-system, "Helvetica Neue", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(noteName(midi), LABEL_W - 4, y);
    } else if (name === 'F' || name === 'A') {
      ctx.strokeStyle = '#EDE8E1';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LABEL_W, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // ── Left border ──
  ctx.strokeStyle = '#DDD8D0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_W, 0);
  ctx.lineTo(LABEL_W, H);
  ctx.stroke();

  // ── Beat grid (from the recording's BPM) — downbeats accented every 4 beats ──
  if (bpm && bpm > 0 && duration > 0) {
    const beatSec = 60 / bpm;
    const beatCount = Math.floor(duration / beatSec) + 1;
    for (let i = 0; i < beatCount; i++) {
      const t = i * beatSec;
      if (t > duration) break;
      const x = timeToX(t);
      const downbeat = i % 4 === 0;
      ctx.strokeStyle = downbeat ? 'rgba(28,26,23,0.24)' : 'rgba(28,26,23,0.10)';
      ctx.lineWidth = downbeat ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  if (frames.length === 0) return;

  // ── Faint raw contour (vibrato / slides), kept subtle behind the note blocks ──
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let penDown = false;
  for (const f of frames) {
    if (f.midi === null || f.confidence < CONF_THRESHOLD) {
      penDown = false;
      continue;
    }
    const x = timeToX(f.time);
    const y = midiToY(f.midi);
    if (!penDown) { ctx.moveTo(x, y); penDown = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Note blocks (piano-roll style) ──
  const barH = Math.max(5, Math.min(12, semitoneH * 0.72));
  const segments = detectNoteSegments(frames, CONF_THRESHOLD);

  for (const seg of segments) {
    const x1 = timeToX(seg.start);
    const x2 = Math.max(x1 + 3, timeToX(seg.end));
    const y = midiToY(seg.midi) - barH / 2;
    const color = PITCH_CLASS_COLORS[((seg.midi % 12) + 12) % 12];

    roundedRect(ctx, x1, y, x2 - x1, barH, barH / 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Note-name label above the block, only if there's room to read it
    if (x2 - x1 >= 20) {
      const label = noteName(seg.midi);
      const labelY = y - 4;
      ctx.font = `bold 8px -apple-system, "Helvetica Neue", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(246,243,238,0.9)';
      ctx.strokeText(label, (x1 + x2) / 2, labelY);
      ctx.fillStyle = color;
      ctx.fillText(label, (x1 + x2) / 2, labelY);
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PitchDisplay({
  frames,
  duration,
  accentColor = '#D97706',
  bpm,
}: {
  frames: PitchFrame[];
  duration: number;
  accentColor?: string;
  bpm?: number | null;
}) {
  const canvasRef = useRef<any>(null);
  const [cssWidth, setCssWidth] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || cssWidth === 0) return;
    draw(canvasRef.current as HTMLCanvasElement, frames, duration, cssWidth, accentColor, bpm);
  }, [frames, duration, cssWidth, accentColor, bpm]);

  return (
    <View
      onLayout={e => setCssWidth(e.nativeEvent.layout.width)}
      // @ts-ignore — borderRadius + overflow clip the canvas corners on web
      style={{
        height: CANVAS_H,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E8E2D8',
      }}
    >
      {cssWidth > 0 &&
        // React.createElement avoids JSX namespace collision with RN types
        require('react').createElement('canvas', {
          ref: canvasRef,
          style: {
            display: 'block',
            width: cssWidth,
            height: CANVAS_H,
          },
        })}
    </View>
  );
}
