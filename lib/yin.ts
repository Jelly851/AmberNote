// Pitch detection core — pure arithmetic, no platform APIs.
//
// Split out of pitch.web.ts so the same detector runs on iOS. The web path
// feeds it samples from Web Audio; the native path feeds it samples decoded
// from a WAV file. Nothing in here touches window, fetch or the file system.

export interface PitchFrame {
  time: number;
  midi: number | null;
  confidence: number;
}

// Window = 2048 samples, hop = 1024.
// At 44100 Hz: min detectable freq = 44100 / 1024 ≈ 43 Hz (well below E2),
// giving ~43 pitch readings per second — smooth enough for display.
export const WIN = 2048;
export const HOP = 1024;

// ─── YIN pitch detection ──────────────────────────────────────────────────────
// Ref: "YIN, a fundamental frequency estimator for speech and music"
// de Cheveigné & Kawahara, J. Acoust. Soc. Am. 111(4), 2002

export function yin(
  buf: Float32Array,
  sampleRate: number,
): { freq: number; conf: number } {
  const N = buf.length;
  const W = N >> 1; // search up to half the buffer (sets min detectable freq)
  const d = new Float32Array(W);

  // Step 1 — difference function
  for (let tau = 1; tau < W; tau++) {
    let s = 0;
    const limit = N - tau;
    const jEnd = limit < W ? limit : W;
    for (let j = 0; j < jEnd; j++) {
      const diff = buf[j] - buf[j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }

  // Step 2 — cumulative mean normalized difference (CMND)
  const cmnd = new Float32Array(W);
  cmnd[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < W; tau++) {
    runSum += d[tau];
    cmnd[tau] = runSum > 0 ? (d[tau] * tau) / runSum : 0;
  }

  // Step 3 — absolute threshold: first minimum below threshold
  const threshold = 0.20;
  let tau = 2;
  while (tau < W - 1) {
    if (cmnd[tau] < threshold) {
      // slide to the bottom of this valley
      while (tau + 1 < W - 1 && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
    tau++;
  }

  if (tau >= W - 1 || cmnd[tau] >= threshold) {
    return { freq: 0, conf: 0 };
  }

  // Step 4 — parabolic interpolation for sub-sample accuracy
  const a = cmnd[tau - 1];
  const b = cmnd[tau];
  const c = cmnd[tau + 1];
  const denom = 2 * (2 * b - a - c);
  const betterTau = denom === 0 ? tau : tau + (c - a) / denom;

  const freq = sampleRate / betterTau;

  // Sanity-check: keep only musically meaningful range (roughly E2–C7)
  if (freq < 75 || freq > 1200) return { freq: 0, conf: 0 };

  return { freq, conf: 1 - b };
}

// ─── Smoothing ────────────────────────────────────────────────────────────────

export function medianFilter(frames: PitchFrame[], halfWin = 2): PitchFrame[] {
  return frames.map((f, i) => {
    if (f.midi === null) return f;
    const vals: number[] = [];
    for (
      let j = Math.max(0, i - halfWin);
      j <= Math.min(frames.length - 1, i + halfWin);
      j++
    ) {
      if (frames[j].midi !== null) vals.push(frames[j].midi!);
    }
    if (vals.length === 0) return f;
    vals.sort((a, b) => a - b);
    return { ...f, midi: vals[Math.floor(vals.length / 2)] };
  });
}

// ─── Samples in, note trace out ───────────────────────────────────────────────

export function framesFromSamples(
  samples: Float32Array,
  sampleRate: number,
): PitchFrame[] {
  const frames: PitchFrame[] = [];

  for (let i = 0; i + WIN <= samples.length; i += HOP) {
    const slice = samples.slice(i, i + WIN);
    const { freq, conf } = yin(slice, sampleRate);
    const time = i / sampleRate;

    let midi: number | null = null;
    if (conf > 0.45 && freq > 0) {
      const m = Math.round(69 + 12 * Math.log2(freq / 440));
      if (m >= 36 && m <= 96) midi = m; // C2 – C7
    }

    frames.push({ time, midi, confidence: conf });
  }

  // 5-frame median filter (halfWin=2) kills most octave-jump artifacts
  return medianFilter(frames, 2);
}
