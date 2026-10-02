// A WAV reader, so pitch analysis can run without Web Audio.
//
// iOS has no Web Audio API under Expo's managed runtime, which is why pitch
// detection was web-only. Recording to LINEAR_PCM instead of AAC means the
// file is raw samples behind a short header, and a header this simple can be
// parsed in plain JavaScript. Handles the two encodings expo-av produces:
// 16-bit signed integer and 32-bit float.

export interface DecodedAudio {
  samples: Float32Array; // first channel only, which is what YIN wants
  sampleRate: number;
  channels: number;
}

const RIFF = 0x52494646; // "RIFF"
const WAVE = 0x57415645; // "WAVE"

function tag(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

/** Decode a RIFF/WAVE buffer. Throws on anything that is not PCM WAV. */
export function decodeWav(buffer: ArrayBuffer): DecodedAudio {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) throw new Error('wav: file too short');
  if (tag(view, 0) !== RIFF || tag(view, 8) !== WAVE) {
    throw new Error('wav: not a RIFF/WAVE file');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;

  // Walk the chunk list rather than assuming the canonical 44-byte layout —
  // recorders insert LIST and fact chunks ahead of the samples.
  let p = 12;
  while (p + 8 <= buffer.byteLength) {
    const id = tag(view, p);
    const size = view.getUint32(p + 4, true);
    const body = p + 8;

    if (id === 0x666d7420) {
      // "fmt "
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 0x64617461) {
      // "data"
      dataOffset = body;
      dataLength = Math.min(size, buffer.byteLength - body);
    }

    p = body + size + (size % 2); // chunks are word-aligned
  }

  if (dataOffset < 0) throw new Error('wav: no data chunk');
  if (!sampleRate || !channels) throw new Error('wav: no fmt chunk');

  // 1 = PCM integer, 3 = IEEE float, 0xFFFE = extensible (sub-format in the
  // chunk tail; expo-av only ever emits plain PCM, so treat it as such)
  const isFloat = format === 3 || bits === 32;
  const bytesPerSample = bits >> 3;
  if (bytesPerSample !== 2 && bytesPerSample !== 4) {
    throw new Error(`wav: unsupported bit depth ${bits}`);
  }

  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const out = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const at = dataOffset + i * bytesPerSample * channels; // channel 0
    out[i] = isFloat
      ? view.getFloat32(at, true)
      : view.getInt16(at, true) / 32768;
  }

  return { samples: out, sampleRate, channels };
}

/** True when the bytes look like a WAV file, so callers can fail with a clear
 *  message on an older .m4a recording rather than a parse error. */
export function looksLikeWav(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return tag(view, 0) === RIFF && tag(view, 8) === WAVE;
}
