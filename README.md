# AmberNote

A songwriting app for iOS. Record an idea the moment it arrives, see the notes
you actually sang, lay lyrics onto a rhythm grid, and export the whole song as
a DAW-ready bundle.

Built with React Native (Expo), TypeScript and SQLite.

## What it does

- **Voice capture with pitch analysis.** Every take is analysed for pitch and
  drawn as a piano roll, so a hummed melody becomes something you can read.
- **A syllable-level melody grid.** Each lyric syllable carries a pitch and a
  note value, with proportional cell widths and draggable pickup beats.
- **Rhyme suggestions without a dictionary.** A phonetic engine groups perfect
  and slant rhymes from the spelling itself.
- **MIDI export.** A sung take exports as a Standard MIDI File, and a finished
  song exports as a zip with stems, MIDI, lyrics and a chord chart.
- **An inspiration board.** Freeform chips, connections and backdrops for the
  pre-writing stage.

## How the audio pipeline works

Pitch detection is YIN (de Cheveigné & Kawahara, 2002), implemented in
`lib/yin.ts` with no audio library behind it.

The two platforms differ only in how samples are obtained:

| | decode | file |
|---|---|---|
| iOS | `lib/wav.ts`, a plain-JavaScript RIFF reader | LINEAR_PCM WAV |
| Web | Web Audio `decodeAudioData` | whatever the browser supports |

iOS records WAV rather than AAC for exactly this reason — the managed runtime
has no AAC decoder, and a WAV is a short header followed by raw samples.
`lib/recording.ts` holds those capture settings. Takes recorded before this
change are AAC and cannot be analysed; the app says so rather than failing
silently.

`lib/melody.ts` turns the frame-by-frame pitch trace into discrete notes, and
`lib/exportMelody.ts` writes them as MIDI. The MIDI writer in
`lib/exportSong.ts` is hand-rolled: variable-length quantities, MTrk framing,
tempo and time-signature meta events, and 16 chord voicings.

## Running it

```sh
npm install
npx expo start          # then press i for the iOS simulator, or scan the QR
npm run test:pitch      # WAV decode -> YIN -> note segmentation -> MIDI bytes
npx tsc --noEmit        # type check, currently clean
```

## Layout

```
app/          screens, routed by expo-router
  (tabs)/     recordings, inspiration, explore, feed
  editor/     the song editor
  song/       song view
components/   shared UI, including the pitch display (SVG on native, canvas on web)
lib/          data, audio and export logic
store/        zustand stores
scripts/      the pitch pipeline test
```
