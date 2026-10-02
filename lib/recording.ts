// Capture settings, in one place so every recorder in the app agrees.
//
// iOS writes LINEAR_PCM WAV rather than the HIGH_QUALITY preset's AAC. The
// reason is pitch analysis: AAC needs a native decoder the managed runtime
// does not have, while WAV is a header and raw samples that lib/wav.ts reads
// in plain JavaScript. The cost is file size, roughly ten times AAC, which is
// acceptable for the short takes this app records.
//
// Android keeps the preset. MediaRecorder cannot write WAV without a native
// module, so pitch analysis there still falls back to the legacy message.

import { Audio } from 'expo-av';

export const SAMPLE_RATE = 44100;

export const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: Audio.RecordingOptionsPresets.HIGH_QUALITY.web,
};
