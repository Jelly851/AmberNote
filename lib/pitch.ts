// Native implementation — reads the recording off disk and runs YIN on it.
//
// This file used to be a stub returning an empty array, because the detector
// needed the Web Audio API. It no longer does: recordings are written as
// LINEAR_PCM WAV on device (see RECORDING_OPTIONS in app/(tabs)/index.tsx),
// and lib/wav.ts turns those bytes into samples in plain JavaScript.

import { File } from 'expo-file-system';

import { decodeWav, looksLikeWav } from './wav';
import { framesFromSamples } from './yin';

export type { PitchFrame } from './yin';

/** Thrown for recordings made before the app switched to WAV. They are AAC,
 *  which cannot be decoded without a native module, so the only fix is a new
 *  take — and the UI says exactly that rather than a generic failure. */
export class LegacyFormatError extends Error {
  constructor() {
    super('Recording predates WAV capture');
    this.name = 'LegacyFormatError';
  }
}

export async function analyzePitch(url: string) {
  const buffer = await new File(url).arrayBuffer();
  if (!looksLikeWav(buffer)) throw new LegacyFormatError();

  const { samples, sampleRate } = decodeWav(buffer);
  return framesFromSamples(samples, sampleRate);
}
