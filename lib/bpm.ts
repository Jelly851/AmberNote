// Web-only BPM detection via onset-strength autocorrelation.
// Returns null on native, short/silent clips, or detection failure.

export async function detectBpm(filePath: string): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;

  try {
    const res = await fetch(filePath);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();

    const ctx = new AC() as AudioContext;
    const audio = await ctx.decodeAudioData(buf);
    await ctx.close();

    if (audio.duration < 2) return null;

    // ── Mono channel data ────────────────────────────────────────────────────
    const raw = audio.getChannelData(0);
    const sr  = audio.sampleRate;

    // ── RMS energy in 20 ms windows → energy envelope ───────────────────────
    const WIN   = Math.floor(sr * 0.02); // 20 ms
    const envLen = Math.floor(raw.length / WIN);
    const env   = new Float32Array(envLen);
    for (let i = 0; i < envLen; i++) {
      let s = 0;
      for (let j = 0; j < WIN; j++) s += raw[i * WIN + j] ** 2;
      env[i] = Math.sqrt(s / WIN);
    }

    // ── Onset strength: half-wave rectified first difference ─────────────────
    const onset = new Float32Array(envLen);
    for (let i = 1; i < envLen; i++) {
      onset[i] = Math.max(0, env[i] - env[i - 1]);
    }

    // ── Light smoothing ───────────────────────────────────────────────────────
    const smooth = new Float32Array(envLen);
    for (let i = 0; i < envLen; i++) {
      smooth[i] = (
        (onset[Math.max(0, i - 1)] + onset[i] + onset[Math.min(envLen - 1, i + 1)]) / 3
      );
    }

    // ── Autocorrelation in the lag range for 50–200 BPM ─────────────────────
    const fps    = 1000 / 20;                           // frames per second = 50
    const minLag = Math.max(1, Math.floor(fps * 60 / 200)); // ≥ 1 frame
    const maxLag = Math.min(envLen - 1, Math.floor(fps * 60 / 50));

    let bestLag = minLag, bestCorr = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      const n = envLen - lag;
      for (let i = 0; i < n; i++) c += smooth[i] * smooth[i + lag];
      c /= n;
      if (c > bestCorr) { bestCorr = c; bestLag = lag; }
    }

    // ── Convert lag → BPM, normalise to 60–180 ───────────────────────────────
    let bpm = Math.round(fps * 60 / bestLag);
    while (bpm > 180) bpm = Math.round(bpm / 2);
    while (bpm < 60)  bpm = Math.round(bpm * 2);

    return bpm >= 40 && bpm <= 220 ? bpm : null;
  } catch {
    return null;
  }
}
