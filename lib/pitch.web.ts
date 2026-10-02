// Web implementation — Web Audio decodes the file, then the shared detector runs.
//
// The detector itself lives in lib/yin.ts so iOS runs the same code. Only the
// decode step differs between platforms.

import { framesFromSamples } from './yin';

export type { PitchFrame } from './yin';

/** Web can decode every format the browser supports, so this never fires here.
 *  It exists so callers can import it from either platform's module. */
export class LegacyFormatError extends Error {
  constructor() {
    super('Recording predates WAV capture');
    this.name = 'LegacyFormatError';
  }
}

export async function analyzePitch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const ab = await res.arrayBuffer();

  const AudioCtx =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();
  const audioBuffer = await audioCtx.decodeAudioData(ab);
  await audioCtx.close();

  return framesFromSamples(
    audioBuffer.getChannelData(0),
    audioBuffer.sampleRate,
  );
}
