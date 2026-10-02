// Native pitch display — the same piano roll the web build draws, in SVG.
//
// This file was a stub returning null, because the detector behind it was
// web-only. Both halves now run on device: lib/pitch.ts decodes the WAV and
// lib/yin.ts finds the notes, and this draws them with react-native-svg
// instead of a canvas, since there is no canvas on iOS.

import { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import {
  CONF_THRESHOLD,
  NOTE_NAMES,
  PITCH_CLASS_COLORS,
  computeRange,
  detectNoteSegments,
  noteName,
} from '@/lib/melody';
import type { PitchFrame } from '@/lib/pitch';

const CANVAS_H = 130;
const LABEL_W = 26;

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
  const [width, setWidth] = useState(0);

  const H = CANVAS_H;
  const drawW = Math.max(0, width - LABEL_W);
  const { midiMin, midiMax } = computeRange(frames);
  const span = Math.max(1, midiMax - midiMin);
  const semitoneH = H / span;

  const midiToY = (m: number) => H - ((m - midiMin) / span) * H;
  const timeToX = (t: number) =>
    LABEL_W + (duration > 0 ? (t / duration) * drawW : 0);

  // Faint raw contour behind the blocks, so vibrato and slides stay visible
  let contour = '';
  let penDown = false;
  for (const f of frames) {
    if (f.midi === null || f.confidence < CONF_THRESHOLD) {
      penDown = false;
      continue;
    }
    const cmd = penDown ? 'L' : 'M';
    contour += `${cmd}${timeToX(f.time).toFixed(1)},${midiToY(f.midi).toFixed(1)}`;
    penDown = true;
  }

  const barH = Math.max(5, Math.min(12, semitoneH * 0.72));
  const segments = detectNoteSegments(frames, CONF_THRESHOLD);

  const octaveBands: number[] = [];
  for (let midi = Math.ceil(midiMin / 12) * 12; midi < midiMax; midi += 12) {
    if (Math.floor(midi / 12) % 2 !== 0) octaveBands.push(midi);
  }

  const beats: number[] = [];
  if (bpm && bpm > 0 && duration > 0) {
    const beatSec = 60 / bpm;
    for (let t = 0; t <= duration; t += beatSec) beats.push(t);
  }

  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={{
        height: CANVAS_H,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E8E2D8',
      }}
    >
      {width > 0 && (
        <Svg width={width} height={H}>
          {octaveBands.map(midi => (
            <Rect
              key={`band${midi}`}
              x={LABEL_W}
              y={midiToY(midi + 12)}
              width={drawW}
              height={midiToY(midi) - midiToY(midi + 12)}
              fill="rgba(28,26,23,0.025)"
            />
          ))}

          <G>
            {Array.from({ length: span + 1 }, (_, i) => midiMin + i).map(midi => {
              const name = NOTE_NAMES[((midi % 12) + 12) % 12];
              const y = midiToY(midi);
              if (name === 'C') {
                return (
                  <G key={`grid${midi}`}>
                    <Line x1={LABEL_W} y1={y} x2={width} y2={y} stroke="#DDD8D0" strokeWidth={1} />
                    <SvgText
                      x={LABEL_W - 4}
                      y={y + 3}
                      fontSize={8}
                      fontWeight="bold"
                      fill="#A09990"
                      textAnchor="end"
                    >
                      {noteName(midi)}
                    </SvgText>
                  </G>
                );
              }
              if (name === 'F' || name === 'A') {
                return (
                  <Line
                    key={`grid${midi}`}
                    x1={LABEL_W}
                    y1={y}
                    x2={width}
                    y2={y}
                    stroke="#EDE8E1"
                    strokeWidth={0.5}
                  />
                );
              }
              return null;
            })}
          </G>

          <Line x1={LABEL_W} y1={0} x2={LABEL_W} y2={H} stroke="#DDD8D0" strokeWidth={1} />

          {beats.map((t, i) => (
            <Line
              key={`beat${i}`}
              x1={timeToX(t)}
              y1={0}
              x2={timeToX(t)}
              y2={H}
              stroke={i % 4 === 0 ? 'rgba(28,26,23,0.24)' : 'rgba(28,26,23,0.10)'}
              strokeWidth={i % 4 === 0 ? 1.25 : 1}
            />
          ))}

          {contour !== '' && (
            <Path
              d={contour}
              stroke={accentColor}
              strokeWidth={1.5}
              strokeOpacity={0.22}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          )}

          {segments.map((seg, i) => {
            const x1 = timeToX(seg.start);
            const x2 = Math.max(x1 + 3, timeToX(seg.end));
            const y = midiToY(seg.midi) - barH / 2;
            const color = PITCH_CLASS_COLORS[((seg.midi % 12) + 12) % 12];
            return (
              <G key={`note${i}`}>
                <Rect
                  x={x1}
                  y={y}
                  width={x2 - x1}
                  height={barH}
                  rx={barH / 2}
                  fill={color}
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth={1}
                />
                {/* Drawn twice: a thick pale stroke first, then the fill on top,
                    so the label stays readable over a grid line. The canvas
                    version does the same thing with strokeText/fillText. */}
                {x2 - x1 >= 20 && (
                  <>
                    <SvgText
                      x={(x1 + x2) / 2}
                      y={y - 4}
                      fontSize={8}
                      fontWeight="bold"
                      fill="none"
                      stroke="rgba(246,243,238,0.9)"
                      strokeWidth={3}
                      textAnchor="middle"
                    >
                      {noteName(seg.midi)}
                    </SvgText>
                    <SvgText
                      x={(x1 + x2) / 2}
                      y={y - 4}
                      fontSize={8}
                      fontWeight="bold"
                      fill={color}
                      textAnchor="middle"
                    >
                      {noteName(seg.midi)}
                    </SvgText>
                  </>
                )}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
