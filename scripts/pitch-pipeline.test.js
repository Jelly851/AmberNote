// Proves the iOS pitch path on real bytes: build a WAV, decode it with the
// app's own reader, run the app's own detector, and export the app's own MIDI.
// Nothing here reimplements app logic — it only supplies the audio.

const path = require('path');
const Module = require('module');

const BUILD = path.resolve(process.argv[2] || '.pitch-build');

// expo/react-native are not loadable in Node, and exportSong only needs its
// own pure MIDI helpers, so the imports are stubbed at require time.
const stubs = {
  'react-native': { Platform: { OS: 'ios' } },
  'jszip': function () {},
  'expo-av': { Audio: {} },
  'expo-file-system': { File: class {} },
  '@/lib/db': {
    getAllRecordings: () => [], getAudioLayers: () => [], getChordCells: () => [],
    getLines: () => [], getRhythmCells: () => [], getSections: () => [], getSongs: () => [],
  },
  '@/lib/types': {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return request;
  if (request.startsWith('@/lib/')) {
    return origResolve.call(this, path.join(BUILD, request.slice('@/lib/'.length)), ...rest);
  }
  return origResolve.call(this, request, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  return origLoad.call(this, request, ...rest);
};

const { decodeWav, looksLikeWav } = require(path.join(BUILD, 'wav.js'));
const { framesFromSamples } = require(path.join(BUILD, 'yin.js'));
const { detectNoteSegments } = require(path.join(BUILD, 'melody.js'));
const { melodyToMidi } = require(path.join(BUILD, 'exportMelody.js'));

// ── build a 16-bit mono WAV: A4 (440) for 0.6s, then C5 (523.25) for 0.6s ──
function makeWav(tones, sr = 44100) {
  const frames = [];
  for (const { freq, secs } of tones) {
    const n = Math.round(sr * secs);
    for (let i = 0; i < n; i++) {
      // a couple of harmonics, so it looks like a voice rather than a test tone
      const t = i / sr;
      const v = 0.6 * Math.sin(2 * Math.PI * freq * t)
              + 0.2 * Math.sin(4 * Math.PI * freq * t)
              + 0.1 * Math.sin(6 * Math.PI * freq * t);
      frames.push(Math.max(-1, Math.min(1, v)));
    }
  }
  const data = Buffer.alloc(frames.length * 2);
  frames.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2));

  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22); head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  const all = Buffer.concat([head, data]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

const wav = makeWav([{ freq: 440, secs: 0.6 }, { freq: 523.25, secs: 0.6 }]);

check('looksLikeWav accepts a WAV', looksLikeWav(wav) === true);
check('looksLikeWav rejects an AAC-ish blob',
      looksLikeWav(Buffer.from('ftypM4A ...').buffer) === false);

const decoded = decodeWav(wav);
check('sample rate read', decoded.sampleRate === 44100, String(decoded.sampleRate));
check('sample count read', Math.abs(decoded.samples.length - 44100 * 1.2) < 10,
      String(decoded.samples.length));

const frames = framesFromSamples(decoded.samples, decoded.sampleRate);
check('frames produced', frames.length > 40, `${frames.length} frames`);

const segs = detectNoteSegments(frames);
const midis = segs.map(s => s.midi);
check('two notes detected', segs.length === 2, JSON.stringify(midis));
check('first note is A4 (69)', midis[0] === 69, String(midis[0]));
check('second note is C5 (72)', midis[1] === 72, String(midis[1]));

const mid = melodyToMidi(segs, 120, 'Test Take');
const buf = Buffer.from(mid);
check('MThd header', buf.slice(0, 4).toString() === 'MThd');
check('two MTrk chunks', (buf.toString('latin1').match(/MTrk/g) || []).length === 2);
check('note-on present for 69', buf.includes(Buffer.from([0x90, 69, 90])));
check('note-on present for 72', buf.includes(Buffer.from([0x90, 72, 90])));
check('note-offs present', buf.includes(Buffer.from([0x80, 69, 0]))
                        && buf.includes(Buffer.from([0x80, 72, 0])));
check('ends with end-of-track', buf.slice(-3).equals(Buffer.from([0xff, 0x2f, 0x00])));
check('file is not trivially small', buf.length > 60, `${buf.length} bytes`);

require('fs').writeFileSync(path.join(BUILD, 'test-melody.mid'), buf);
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
