import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Dimensions,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import PitchDisplay from '@/components/PitchDisplay';
import { analyzePitch } from '@/lib/pitch';
import { shareMelodyMidi } from '@/lib/exportMelody';
import { RECORDING_OPTIONS } from '@/lib/recording';
import { detectBpm } from '@/lib/bpm';
import type { PitchFrame } from '@/lib/pitch';
import { THEME_LIST, BG_THEME_LIST } from '@/lib/themes';
import { FIXED_TAGS, MAIN_FOLDER_ID } from '@/lib/constants';
import type { Recording, TagName } from '@/lib/types';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';
import { useCaptureStore } from '@/store/captureStore';
import { useThemeStore } from '@/store/themeStore';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─── useMetronome ─────────────────────────────────────────────────────────────
// Plays a click on each beat. Web: Web Audio API lookahead scheduler.
// Native: Haptics + onBeat callback for visual flash.

function useMetronome(
  bpm: number,
  active: boolean,
  onBeat?: (beatIndex: number) => void,
) {
  const onBeatRef = useRef(onBeat);
  useLayoutEffect(() => { onBeatRef.current = onBeat; });

  useEffect(() => {
    if (!active || bpm <= 0) return;

    let beatCount = 0;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC() as AudioContext;
      let nextBeat = ctx.currentTime + 0.05;
      let timer: ReturnType<typeof setTimeout>;

      function scheduleClick(time: number, accent: boolean) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = accent ? 1200 : 900;
        gain.gain.setValueAtTime(accent ? 0.6 : 0.35, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
        osc.start(time);
        osc.stop(time + 0.06);
      }

      // Visual flash fires slightly early via setTimeout (not sample-accurate, but good enough)
      function schedule() {
        while (nextBeat < ctx.currentTime + 0.15) {
          const accent = beatCount % 4 === 0;
          scheduleClick(nextBeat, accent);
          const capturedBeat = beatCount;
          const delay = Math.max(0, (nextBeat - ctx.currentTime) * 1000 - 20);
          setTimeout(() => onBeatRef.current?.(capturedBeat), delay);
          nextBeat += 60 / bpm;
          beatCount++;
        }
        timer = setTimeout(schedule, 25);
      }
      schedule();

      return () => {
        clearTimeout(timer);
        ctx.close().catch(() => {});
      };
    } else {
      // Native: haptics + visual
      const interval = 60000 / bpm;
      const id = setInterval(() => {
        const accent = beatCount % 4 === 0;
        Haptics.impactAsync(
          accent ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
        ).catch(() => {});
        onBeatRef.current?.(beatCount);
        beatCount++;
      }, interval);
      return () => clearInterval(id);
    }
  }, [active, bpm]);
}

// ─── Waveform extraction (web) ────────────────────────────────────────────────

async function extractWaveform(uri: string, numBars = 60): Promise<number[] | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buf);
    ctx.close();
    const raw = decoded.getChannelData(0);
    const blockSize = Math.floor(raw.length / numBars);
    return Array.from({ length: numBars }, (_, i) => {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[start + j] ?? 0);
      return Math.min(sum / blockSize / 0.5, 1); // normalise to ~0–1
    });
  } catch {
    return null;
  }
}

// ─── TrimWaveform ─────────────────────────────────────────────────────────────

type DragTarget = 'trimIn' | 'trimOut' | 'seek' | null;

function TrimWaveform({
  id,
  data,
  progress,
  color,
  duration,
  bpm,
  trimIn,
  trimOut,
  onSeek,
  onTrimEnd,
}: {
  id: string;
  data: number[] | null;
  progress: number;       // 0–1 absolute position in full clip
  color: string;
  duration?: number;
  bpm?: number | null;
  trimIn?: number;        // 0–1
  trimOut?: number;       // 0–1
  onSeek?: (ratio: number) => void;
  onTrimEnd?: (trimIn: number, trimOut: number) => void;
}) {
  const [containerW, setContainerW] = useState(1);
  const dragTarget   = useRef<DragTarget>(null);
  const liveTrimIn   = useRef(trimIn ?? 0);
  const liveTrimOut  = useRef(trimOut ?? 1);
  // Local state drives re-render during drag
  const [localIn,  setLocalIn]  = useState(trimIn  ?? 0);
  const [localOut, setLocalOut] = useState(trimOut ?? 1);

  // Sync when props change from outside
  useEffect(() => { setLocalIn(trimIn ?? 0);  liveTrimIn.current  = trimIn  ?? 0; }, [trimIn]);
  useEffect(() => { setLocalOut(trimOut ?? 1); liveTrimOut.current = trimOut ?? 1; }, [trimOut]);

  const HANDLE_HIT = 22; // px touch target for handles

  const bars = useMemo(() => {
    if (data?.length) return data.slice(0, 60);
    let s = id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffff, 1);
    return Array.from({ length: 60 }, () => {
      s = ((s * 1664525 + 1013904223) >>> 0);
      return (s % 80 + 12) / 100;
    });
  }, [id, data]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: e => {
      const x  = e.nativeEvent.locationX;
      const w  = containerW;
      const iX = liveTrimIn.current  * w;
      const oX = liveTrimOut.current * w;
      if (Math.abs(x - iX) < HANDLE_HIT) {
        dragTarget.current = 'trimIn';
      } else if (Math.abs(x - oX) < HANDLE_HIT) {
        dragTarget.current = 'trimOut';
      } else if (onSeek) {
        dragTarget.current = 'seek';
        onSeek(clamp(x / w, 0, 1));
      } else {
        dragTarget.current = null;
      }
    },

    onPanResponderMove: e => {
      const x   = e.nativeEvent.locationX;
      const w   = containerW;
      const rat = clamp(x / w, 0, 1);
      if (dragTarget.current === 'trimIn') {
        const nv = clamp(rat, 0, liveTrimOut.current - 0.02);
        liveTrimIn.current = nv;
        setLocalIn(nv);
      } else if (dragTarget.current === 'trimOut') {
        const nv = clamp(rat, liveTrimIn.current + 0.02, 1);
        liveTrimOut.current = nv;
        setLocalOut(nv);
      } else if (dragTarget.current === 'seek') {
        onSeek?.(rat);
      }
    },

    onPanResponderRelease: () => {
      if (dragTarget.current === 'trimIn' || dragTarget.current === 'trimOut') {
        onTrimEnd?.(liveTrimIn.current, liveTrimOut.current);
      }
      dragTarget.current = null;
    },

    onPanResponderTerminate: () => { dragTarget.current = null; },
  }), [containerW, onSeek, onTrimEnd]);

  // Beat grid lines
  const beatLines = useMemo(() => {
    if (!bpm || !duration || bpm <= 0 || duration <= 0) return [];
    const beatSec = 60 / bpm;
    const count   = Math.ceil(duration / beatSec) + 1;
    return Array.from({ length: count }, (_, i) => ({
      ratio: (i * beatSec) / duration,
      accent: i % 4 === 0,
    })).filter(b => b.ratio <= 1);
  }, [bpm, duration]);

  return (
    <View
      style={tw.waveOuter}
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      {/* ── Bar layer ── */}
      <View style={[StyleSheet.absoluteFill, tw.barRow]}>
        {bars.map((v, i) => {
          const ratio = (i + 0.5) / bars.length;
          const inRange = ratio >= localIn && ratio <= localOut;
          const played  = ratio < progress;
          return (
            <View
              key={i}
              style={[
                tw.bar,
                {
                  height: Math.max(3, v * 44),
                  backgroundColor: inRange && played ? color : '#DDD8D0',
                  opacity: inRange ? 1 : 0.28,
                },
              ]}
            />
          );
        })}
      </View>

      {/* ── Beat grid ── */}
      {beatLines.map((b, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            tw.beatLine,
            {
              left: b.ratio * containerW,
              height: b.accent ? 44 : 28,
              top: b.accent ? 4 : 12,
              backgroundColor: color + (b.accent ? 'BB' : '55'),
              opacity: b.ratio >= localIn && b.ratio <= localOut ? 1 : 0.3,
            },
          ]}
        />
      ))}

      {/* ── Trim region overlay (dimmed outside) — rendered before handles ── */}
      {/* Left dim */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { right: containerW - localIn * containerW, backgroundColor: 'rgba(0,0,0,0.12)' }]}
      />
      {/* Right dim */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { left: localOut * containerW, backgroundColor: 'rgba(0,0,0,0.12)' }]}
      />

      {/* ── Progress line ── */}
      {progress > 0 && (
        <View
          pointerEvents="none"
          style={[tw.progressLine, { left: progress * containerW, backgroundColor: color }]}
        />
      )}

      {/* ── Trim handles ── */}
      <View pointerEvents="none" style={[tw.handle, { left: localIn * containerW - 1, backgroundColor: color }]}>
        <View style={[tw.handleKnobTop, { backgroundColor: color }]} />
      </View>
      <View pointerEvents="none" style={[tw.handle, { left: localOut * containerW - 1, backgroundColor: color }]}>
        <View style={[tw.handleKnobBot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const tw = StyleSheet.create({
  waveOuter:   { height: 56, width: '100%', position: 'relative', marginBottom: 14 },
  barRow:      { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 1 },
  bar:         { flex: 1, borderRadius: 2 },
  beatLine:    { position: 'absolute', width: 1.5, borderRadius: 1 },
  progressLine:{ position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1 },
  handle:      { position: 'absolute', top: 0, bottom: 0, width: 2 },
  handleKnobTop: { position: 'absolute', top: 2, left: -5, width: 12, height: 12, borderRadius: 6 },
  handleKnobBot: { position: 'absolute', bottom: 2, left: -5, width: 12, height: 12, borderRadius: 6 },
});

// ─── BpmDragValue ─────────────────────────────────────────────────────────────
// A BPM number that can be dragged vertically to adjust (5px per BPM, like the
// tempo picker in the lyric editor) or tapped (without dragging) to type an
// exact value. Tap-tempo, if the surrounding UI wants it, lives on its own
// separate button — trying to layer a third "tap" gesture onto this same
// element made drag unreliable, so this element only ever does drag-or-type.

function BpmDragValue({
  value,
  displayText,
  onChange,
  min = 40,
  max = 240,
  numberStyle,
}: {
  value: number;
  displayText?: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  numberStyle?: any;
}) {
  const [typing, setTyping] = useState(false);
  const [typeText, setTypeText] = useState('');
  // Live value shown while dragging — kept purely local so the drag itself
  // doesn't force a commit (and the re-render churn that comes with it, e.g.
  // this recording's `onChange` writing to localStorage) on every pixel of
  // movement. The parent only hears about the change once, on release —
  // exactly like the waveform's trim handles already do via `onTrimEnd`.
  const [liveValue, setLiveValue] = useState(value);
  const liveValueRef = useRef(value);
  const committedValueRef = useRef(value); // last value the parent actually knows about
  const dragBaseRef = useRef(value);
  const draggedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    committedValueRef.current = value;
    if (!isDraggingRef.current) {
      liveValueRef.current = value;
      setLiveValue(value);
      dragBaseRef.current = value;
    }
  }, [value]);

  function clampV(v: number) { return Math.max(min, Math.min(max, Math.round(v))); }

  function startEdit() {
    setTypeText(String(liveValueRef.current));
    setTyping(true);
  }

  function commitTyped() {
    const n = parseInt(typeText, 10);
    if (!isNaN(n)) {
      const v = clampV(n);
      liveValueRef.current = v;
      setLiveValue(v);
      onChangeRef.current(v);
    }
    setTyping(false);
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => {
      isDraggingRef.current = true;
      draggedRef.current = false;
      dragBaseRef.current = liveValueRef.current;
    },
    onPanResponderMove: (evt, gs) => {
      // Stop the ancestor ScrollView from also scrolling while we drag
      (evt.nativeEvent as any)?.preventDefault?.();
      if (Math.abs(gs.dy) > 2) draggedRef.current = true;
      const next = clampV(dragBaseRef.current + Math.round(-gs.dy / 5));
      liveValueRef.current = next;
      setLiveValue(next);
    },
    onPanResponderRelease: () => {
      isDraggingRef.current = false;
      if (!draggedRef.current) startEdit();
      else onChangeRef.current(liveValueRef.current);
    },
    onPanResponderTerminate: () => {
      // Gesture was interrupted (e.g. the ScrollView stole it) — abandon the
      // uncommitted drag and snap back to whatever the parent last committed.
      isDraggingRef.current = false;
      liveValueRef.current = committedValueRef.current;
      setLiveValue(committedValueRef.current);
    },
  }), []);

  const numberNode = typing ? (
    <TextInput
      style={numberStyle}
      value={typeText}
      onChangeText={setTypeText}
      keyboardType="number-pad"
      returnKeyType="done"
      onBlur={commitTyped}
      onSubmitEditing={commitTyped}
      autoFocus
      selectTextOnFocus
    />
  ) : (
    <View {...panResponder.panHandlers} style={{ userSelect: 'none', touchAction: 'none' } as any}>
      <Text style={numberStyle} selectable={false}>{displayText ?? liveValue}</Text>
    </View>
  );

  // Swallow the tap/click here so it never bubbles up to an ancestor Pressable
  // (e.g. the recording card's own expand/collapse toggle).
  return (
    <Pressable onPress={(e: any) => e.stopPropagation?.()}>
      {numberNode}
    </Pressable>
  );
}

// ─── BpmPanel ─────────────────────────────────────────────────────────────────

function BpmPanel({
  bpm,
  metroOn,
  beatFlash,
  detecting,
  accent,
  onBpmChange,
  onMetroToggle,
  onDetect,
  onTap,
}: {
  bpm: number | null;
  metroOn: boolean;
  beatFlash: boolean;
  detecting: boolean;
  accent: string;
  onBpmChange: (v: number) => void;
  onMetroToggle: () => void;
  onDetect: () => void;
  onTap: () => void;
}) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function changeBpm(delta: number) {
    onBpmChange(clamp((bpm ?? 120) + delta, 40, 240));
  }
  function startHold(delta: number) {
    changeBpm(delta);
    holdRef.current = setInterval(() => changeBpm(delta), 90);
  }
  function endHold() {
    if (holdRef.current) clearInterval(holdRef.current);
  }

  return (
    <View style={bpSt.panel}>
      {/* BPM number + adjust */}
      <View style={bpSt.row}>
        <Text style={bpSt.sectionLabel}>BPM</Text>

        <TouchableOpacity
          style={bpSt.adjBtn}
          onPressIn={() => startHold(-1)}
          onPressOut={endHold}
          onLongPress={() => {}}
        >
          <Ionicons name="remove" size={16} color="#6B6560" />
        </TouchableOpacity>

        {/* Drag / type area, with tap-tempo as its own small button below */}
        <View style={bpSt.bpmDisplay}>
          <BpmDragValue
            value={bpm ?? 120}
            displayText={bpm == null ? '—' : undefined}
            onChange={onBpmChange}
            numberStyle={[bpSt.bpmNum, { color: bpm != null ? accent : '#C4BDB7' }]}
          />
          <TouchableOpacity onPress={onTap} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Text style={bpSt.tapLabel}>TAP</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={bpSt.adjBtn}
          onPressIn={() => startHold(1)}
          onPressOut={endHold}
          onLongPress={() => {}}
        >
          <Ionicons name="add" size={16} color="#6B6560" />
        </TouchableOpacity>

      </View>

      {/* Action buttons */}
      <View style={bpSt.actionsRow}>
        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={[bpSt.btn, detecting && { opacity: 0.55 }]}
            onPress={onDetect}
            disabled={detecting}
          >
            <Ionicons name="scan-outline" size={13} color="#6B6560" />
            <Text style={bpSt.btnText}>{detecting ? 'Detecting…' : 'Auto-detect'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            bpSt.btn,
            metroOn && { borderColor: accent + '88' },
            metroOn && beatFlash
              ? { backgroundColor: accent + '33' }
              : metroOn
              ? { backgroundColor: accent + '12' }
              : undefined,
          ]}
          onPress={onMetroToggle}
        >
          <Ionicons
            name={metroOn ? 'musical-notes' : 'musical-notes-outline'}
            size={13}
            color={metroOn ? accent : '#6B6560'}
          />
          <Text style={[bpSt.btnText, metroOn && { color: accent }]}>Metronome</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const bpSt = StyleSheet.create({
  panel:        { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E8E2D8', paddingTop: 10, gap: 8 },
  row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#A09890', width: 28 },
  adjBtn:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  bpmDisplay:   { alignItems: 'center', minWidth: 68 },
  bpmNum:       { fontSize: 38, fontWeight: '200', letterSpacing: -1 },
  tapLabel:     { fontSize: 9, color: '#C4BDB7', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: -4 },
  actionsRow:   { flexDirection: 'row', gap: 8 },
  btn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#E8E2D8', backgroundColor: '#F9F7F3' },
  btnText:      { fontSize: 12, fontWeight: '500', color: '#6B6560' },
});

// ─── RecordingCard ────────────────────────────────────────────────────────────

function RecordingCard({
  recording,
  expanded,
  isPlaying,
  progress,
  triggerRename,
  onToggle,
  onPlay,
  onSeek,
  onRename,
  onDelete,
  onMenu,
  onUpdate,
  onDragStart,
  onDragEnd,
}: {
  recording: Recording;
  expanded: boolean;
  isPlaying: boolean;
  progress: number;
  triggerRename: boolean;
  onToggle: () => void;
  onPlay: () => void;
  onSeek: (ratio: number) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onMenu: () => void;
  onUpdate: (patch: Partial<Pick<Recording, 'bpm' | 'trimIn' | 'trimOut'>>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { theme } = useThemeStore();
  const cardRef = useRef<View>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(recording.title ?? 'Voice Memo');

  // Audio-editing local state (persisted on commit)
  const [localBpm,    setLocalBpm]    = useState<number | null>(recording.bpm    ?? null);
  const [localTrimIn, setLocalTrimIn] = useState(recording.trimIn  ?? 0);
  const [localTrimOut,setLocalTrimOut]= useState(recording.trimOut ?? 1);
  const [metroOn,     setMetroOn]     = useState(false);
  const [beatFlash,   setBeatFlash]   = useState(false);
  const [detecting,   setDetecting]   = useState(false);
  const tapTimesRef   = useRef<number[]>([]);

  // Keep local state in sync if parent updates the recording (e.g. folder switch)
  useEffect(() => { setLocalBpm(recording.bpm ?? null); },    [recording.bpm]);
  useEffect(() => { setLocalTrimIn(recording.trimIn ?? 0); },  [recording.trimIn]);
  useEffect(() => { setLocalTrimOut(recording.trimOut ?? 1); },[recording.trimOut]);

  // Pitch analysis (web only)
  const [pitchFrames,  setPitchFrames]  = useState<PitchFrame[] | null>(null);
  const [pitchLoading, setPitchLoading] = useState(false);
  const [pitchError,   setPitchError]   = useState(false);
  const [pitchLegacy,  setPitchLegacy]  = useState(false);
  const [midiBusy,     setMidiBusy]     = useState(false);
  const [midiNote,     setMidiNote]     = useState<string | null>(null);

  useEffect(() => { setTitleText(recording.title ?? 'Voice Memo'); }, [recording.title]);

  useEffect(() => {
    if (!expanded || pitchLoading || pitchFrames !== null) return;
    setPitchLoading(true);
    setPitchError(false);
    analyzePitch(recording.filePath)
      .then(frames => { setPitchFrames(frames); setPitchLoading(false); })
      .catch(err => { setPitchLegacy(err?.name === 'LegacyFormatError'); setPitchError(true); setPitchLoading(false); });
  }, [expanded]);

  useEffect(() => {
    if (triggerRename && expanded) setEditingTitle(true);
  }, [triggerRename, expanded]);

  // Metronome during playback
  useMetronome(
    localBpm ?? 0,
    metroOn && isPlaying,
    useCallback(() => {
      setBeatFlash(true);
      setTimeout(() => setBeatFlash(false), 90);
    }, []),
  );

  function saveTitle() {
    setEditingTitle(false);
    const t = titleText.trim();
    if (t) onRename(t);
  }

  function commitBpm(v: number | null) {
    setLocalBpm(v);
    onUpdate({ bpm: v });
  }

  function commitTrim(tIn: number, tOut: number) {
    setLocalTrimIn(tIn);
    setLocalTrimOut(tOut);
    onUpdate({ trimIn: tIn, trimOut: tOut });
  }

  function onTap() {
    const now = Date.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 3000) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current = [...tapTimesRef.current.slice(-7), now];
    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      commitBpm(clamp(Math.round(60000 / avg), 40, 240));
    }
  }

  async function onDetect() {
    setDetecting(true);
    const result = await detectBpm(recording.filePath);
    setDetecting(false);
    if (result != null) commitBpm(result);
    else Alert.alert('Could not detect BPM', 'Try on a recording with clear rhythmic content.');
  }

  // Web drag-and-drop: make the card draggable (for dropping onto a folder).
  // This only ever needs to work from the collapsed list view — once a card
  // is expanded it's full of its own drag gestures (BPM number, waveform trim
  // handles, seek bar), every one of which sits inside this same draggable
  // node and would otherwise race against native HTML5 drag-and-drop for the
  // same mousedown-and-move. Rather than trying to carve out exceptions for
  // each individual control (fragile — e.g. `dragstart`'s `e.target` is the
  // draggable element itself, not whatever the pointer is actually over, so a
  // descendant check there never matches whatever you tag), the card is
  // simply not a native drag source at all while expanded.
  useEffect(() => {
    if (Platform.OS !== 'web' || !cardRef.current) return;
    const node = cardRef.current as unknown as HTMLElement;
    if (typeof node?.setAttribute !== 'function') return;
    node.setAttribute('draggable', String(!expanded));

    const handleDragStart = (e: DragEvent) => {
      e.dataTransfer?.setData('recordingId', recording.id);
      e.dataTransfer && (e.dataTransfer.effectAllowed = 'move');
      onDragStart?.();
    };
    const handleDragEnd = () => onDragEnd?.();
    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('dragend', handleDragEnd);
    return () => {
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('dragend', handleDragEnd);
    };
  }, [recording.id, onDragStart, onDragEnd, expanded]);

  // Trim region duration for display
  const trimmedDuration = recording.duration * (localTrimOut - localTrimIn);

  return (
    <TouchableOpacity ref={cardRef as any} style={styles.card} onPress={onToggle} activeOpacity={0.75}>
      {/* ── Collapsed header ── */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderMain}>
          <View style={styles.cardHeaderText}>
            {expanded && editingTitle ? (
              <Pressable onPress={(e: any) => e.stopPropagation?.()}>
                <TextInput
                  style={[styles.cardTitle, styles.cardTitleInput, { borderBottomColor: theme.accent }]}
                  value={titleText}
                  onChangeText={setTitleText}
                  onBlur={saveTitle}
                  onSubmitEditing={saveTitle}
                  returnKeyType="done"
                  autoFocus
                />
              </Pressable>
            ) : (
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {recording.title ?? 'Voice Memo'}
                </Text>
                {expanded && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={(e: any) => { e.stopPropagation?.(); setEditingTitle(true); }}
                  >
                    <Ionicons name="pencil" size={13} color="#A09990" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {recording.tags.length > 0 && !expanded && (
              <Text style={styles.cardTagHint} numberOfLines={1}>
                {recording.tags.slice(0, 2).join(' · ')}
              </Text>
            )}
          </View>
          <Text style={styles.cardDuration}>{formatDuration(recording.duration)}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="#C4BDB7" style={{ marginLeft: 6 }} />
        </View>

        <TouchableOpacity style={[styles.inlinePlayBtn, isPlaying && { backgroundColor: theme.accentLight }]} onPress={onPlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={15} color={isPlaying ? theme.accent : '#6B6560'} />
        </TouchableOpacity>
      </View>

      {/* ── Expanded content ── */}
      {expanded && (
        <View style={styles.expandedContent}>

          {/* Waveform with trim + beat grid */}
          <TrimWaveform
            id={recording.id}
            data={recording.waveformData}
            progress={progress}
            color={theme.accent}
            duration={recording.duration}
            bpm={localBpm}
            trimIn={localTrimIn}
            trimOut={localTrimOut}
            onSeek={isPlaying ? onSeek : undefined}
            onTrimEnd={commitTrim}
          />

          {/* Trim info row */}
          {(localTrimIn > 0 || localTrimOut < 1) && (
            <View style={styles.trimInfoRow}>
              <Ionicons name="cut-outline" size={12} color="#A09890" />
              <Text style={styles.trimInfoText}>
                {formatDuration(localTrimIn * recording.duration)} – {formatDuration(localTrimOut * recording.duration)}
                {'  '}({formatDuration(trimmedDuration)})
              </Text>
              <TouchableOpacity onPress={() => commitTrim(0, 1)}>
                <Text style={[styles.trimResetText, { color: theme.accent }]}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pitch display */}
          {pitchLoading && (
            <Text style={styles.pitchStatus}>Analyzing pitch…</Text>
          )}
          {pitchError && (
            <Text style={styles.pitchStatus}>{pitchLegacy ? 'Record a new take to see pitch.' : 'Pitch analysis unavailable.'}</Text>
          )}
          {pitchFrames !== null && !pitchLoading && (
            pitchFrames.some(f => f.midi !== null)
              ? (
                <>
                  <PitchDisplay frames={pitchFrames} duration={recording.duration} accentColor={theme.accent} bpm={localBpm} />
                  <TouchableOpacity
                    disabled={midiBusy}
                    onPress={async () => {
                      setMidiBusy(true);
                      try {
                        const n = await shareMelodyMidi(pitchFrames, localBpm, titleText);
                        setMidiNote(`${n} note${n === 1 ? '' : 's'} exported`);
                      } catch (err: any) {
                        setMidiNote(err?.message ?? 'Export failed');
                      } finally {
                        setMidiBusy(false);
                        setTimeout(() => setMidiNote(null), 4000);
                      }
                    }}
                  >
                    <Text style={[styles.pitchStatus, { color: theme.accent, fontStyle: 'normal' }]}>
                      {midiBusy ? 'Exporting…' : midiNote ?? 'Export melody as MIDI'}
                    </Text>
                  </TouchableOpacity>
                </>
              )
              : (
                <TouchableOpacity onPress={() => setPitchFrames(null)}>
                  <Text style={styles.pitchStatus}>No pitch detected — tap to retry.</Text>
                </TouchableOpacity>
              )
          )}

          {/* BPM panel */}
          <BpmPanel
            bpm={localBpm}
            metroOn={metroOn}
            beatFlash={beatFlash}
            detecting={detecting}
            accent={theme.accent}
            onBpmChange={commitBpm}
            onMetroToggle={() => setMetroOn(v => !v)}
            onDetect={onDetect}
            onTap={onTap}
          />

          {/* Transport row */}
          <View style={styles.expandedRow}>
            <TouchableOpacity style={styles.menuBtn} onPress={onMenu}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#A09990" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.expandedPlayBtn, isPlaying && { backgroundColor: theme.accentLight }]}
              onPress={onPlay}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={isPlaying ? theme.accent : '#6B6560'} />
            </TouchableOpacity>
          </View>

          {recording.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow} contentContainerStyle={styles.tagRowContent}>
              {recording.tags.map(tag => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: theme.accentLight }]}>
                  <Text style={[styles.tagPillText, { color: theme.accent }]}>{tag}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={styles.cardDate}>{formatDate(recording.createdAt)}</Text>
        </View>
      )}

      {!expanded && <Text style={styles.cardDate}>{formatDate(recording.createdAt)}</Text>}
    </TouchableOpacity>
  );
}

// ─── Tag Sheet ────────────────────────────────────────────────────────────────

function TagSheet({ visible, onDone }: { visible: boolean; onDone: (tags: TagName[]) => void }) {
  const { theme } = useThemeStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 140 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true }).start();
    }
  }, [visible]);

  const dismiss = () => onDone(Array.from(selected) as TagName[]);
  useEscapeKey(dismiss, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, dismiss);

  return (
    <Modal visible={visible} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={dismiss}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Tag this memo</Text>
          <Text style={styles.sheetSub}>Select all that apply</Text>
          <View style={styles.tagGrid}>
            {FIXED_TAGS.map(tag => {
              const active = selected.has(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.tagChip, active && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                  onPress={() => { setSelected(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; }); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagChipText, active && { color: theme.accent }]}>{tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.doneButton, { backgroundColor: theme.accent }]} onPress={() => onDone(Array.from(selected) as TagName[])}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Theme Sheet ─────────────────────────────────────────────────────────────

function ThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, setTheme, bgTheme, setBg, graphics, setGraphics } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  return (
    <Modal visible={visible} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Theme</Text>

          <Text style={styles.themeSection}>Background</Text>
          <View style={styles.themeRow}>
            {BG_THEME_LIST.map(t => {
              const active = t.id === bgTheme.id;
              return (
                <TouchableOpacity key={t.id} style={styles.themeOption} onPress={() => setBg(t.id)} activeOpacity={0.8}>
                  <View style={[styles.themeSwatch, { backgroundColor: t.swatch, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }, active && styles.themeSwatchActive, active && { borderColor: theme.accent, borderWidth: 2.5 }]}>
                    {active && <Ionicons name="checkmark" size={16} color={t.isDark ? '#fff' : theme.accent} />}
                  </View>
                  <Text style={[styles.themeLabel, active && { color: theme.accent }]}>{t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.themeSection}>Accent</Text>
          <View style={styles.themeRow}>
            {THEME_LIST.map(t => {
              const active = t.id === theme.id;
              return (
                <TouchableOpacity key={t.id} style={styles.themeOption} onPress={() => setTheme(t.id)} activeOpacity={0.8}>
                  <View style={[styles.themeSwatch, { backgroundColor: t.accent }, active && styles.themeSwatchActive]}>
                    {active && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.themeLabel, active && { color: t.accent }]}>{t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.themeSection}>Graphics</Text>
          <View style={[styles.themeRow, { gap: 10 }]}>
            {([
              { id: 'full', label: 'Full effects', desc: 'Animated backdrops', icon: 'sparkles-outline' },
              { id: 'lite', label: 'Lite', desc: 'Static, saves battery', icon: 'battery-half-outline' },
            ] as const).map(opt => {
              const active = graphics === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                    borderWidth: 1.5, borderColor: active ? theme.accent : 'rgba(28,26,23,0.12)',
                    backgroundColor: active ? theme.accent + '14' : 'transparent',
                  }}
                  onPress={() => setGraphics(opt.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={opt.icon as any} size={18} color={active ? theme.accent : '#6B6560'} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? theme.accent : '#1C1A17' }}>{opt.label}</Text>
                    <Text style={{ fontSize: 10.5, color: '#A09990', marginTop: 1 }}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── FolderChip (drop target on web) ─────────────────────────────────────────

function FolderChip({
  folder,
  active,
  dropTarget,
  accent,
  accentLight,
  isRenaming,
  hasChildren,
  onPress,
  onDrop,
  onDragOver,
  onDragLeave,
  onShowMenu,
  onRenameSubmit,
  onRenameCancel,
}: {
  folder: { id: string; name: string };
  active: boolean;
  dropTarget: boolean;
  accent: string;
  accentLight: string;
  isRenaming: boolean;
  hasChildren?: boolean;
  onPress: () => void;
  onDrop: (recordingId: string) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onShowMenu: (x: number, y: number) => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
}) {
  const chipRef = useRef<View>(null);
  const [renameText, setRenameText] = useState(folder.name);

  useEffect(() => {
    if (isRenaming) setRenameText(folder.name);
  }, [isRenaming, folder.name]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !chipRef.current) return;
    const node = (chipRef.current as any) as HTMLElement;
    if (typeof node?.addEventListener !== 'function') return;
    const handleOver = (e: DragEvent) => { e.preventDefault(); onDragOver(); };
    const handleLeave = () => onDragLeave();
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer?.getData('recordingId');
      if (id) onDrop(id);
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); onShowMenu(e.clientX, e.clientY); };
    node.addEventListener('dragover', handleOver);
    node.addEventListener('dragleave', handleLeave);
    node.addEventListener('drop', handleDrop);
    node.addEventListener('contextmenu', handleContextMenu);
    return () => {
      node.removeEventListener('dragover', handleOver);
      node.removeEventListener('dragleave', handleLeave);
      node.removeEventListener('drop', handleDrop);
      node.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onDrop, onDragOver, onDragLeave, onShowMenu]);

  if (isRenaming) {
    return (
      <View style={[styles.folderChip, { backgroundColor: accentLight, borderColor: accent, paddingHorizontal: 8, width: Math.max(80, folder.name.length * 9 + 24) }]}>
        <TextInput
          autoFocus
          value={renameText}
          onChangeText={setRenameText}
          style={{ fontSize: 13, fontWeight: '600', color: accent, flex: 1 }}
          returnKeyType="done"
          onSubmitEditing={() => onRenameSubmit(renameText.trim())}
          onBlur={() => setTimeout(() => onRenameCancel(), 150)}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      ref={chipRef as any}
      style={[
        styles.folderChip,
        active && { backgroundColor: accentLight },
        dropTarget && { backgroundColor: accent, borderColor: accent },
      ]}
      onPress={onPress}
      onLongPress={e => onShowMenu(e.nativeEvent.pageX, e.nativeEvent.pageY)}
    >
      <Text style={[styles.folderChipText, active && { color: accent }, dropTarget && { color: '#fff' }]}>
        {folder.name}
      </Text>
      {hasChildren && <Ionicons name="chevron-forward" size={11} color={active ? accent : '#A09890'} style={{ marginLeft: 2 }} />}
    </TouchableOpacity>
  );
}

// ─── Capture Screen ───────────────────────────────────────────────────────────

export default function CaptureScreen() {
  const {
    folders, recordings, activeFolderId,
    setActiveFolder, createFolder, renameFolder, moveFolder, deleteFolder, createRecording, updateRecording, deleteRecording,
  } = useCaptureStore();
  const { theme, bgTheme } = useThemeStore();

  // Recording state
  const [activeRec,       setActiveRec]       = useState<Audio.Recording | null>(null);
  const [isRecording,     setIsRecording]     = useState(false);
  const [pendingUri,      setPendingUri]      = useState<string | null>(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [pendingBpm,      setPendingBpm]      = useState<number | null>(null);
  const [showTagSheet,    setShowTagSheet]    = useState(false);
  const [showThemeSheet,  setShowThemeSheet]  = useState(false);

  // Playback state
  const [playingId,        setPlayingId]        = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const soundRef            = useRef<Audio.Sound | null>(null);
  const currentDurationRef  = useRef(0);
  const trimInRef           = useRef(0);
  const trimOutRef          = useRef(1);

  // Card expansion
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [renamingId,  setRenamingId]  = useState<string | null>(null);

  // Drag-to-folder
  const [draggingId,       setDraggingId]       = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Folder navigation stack (IDs of parent folders breadcrumb; null = root)
  const [folderPath, setFolderPath] = useState<string[]>([]); // e.g. ['folderA', 'folderB']
  const currentParentId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;
  const visibleFolders = folders.filter(f => f.parentId === currentParentId);

  function navigateIntoFolder(folderId: string) {
    setFolderPath(p => [...p, folderId]);
    setActiveFolder(folderId);
  }
  function navigateBack() {
    const newPath = folderPath.slice(0, -1);
    setFolderPath(newPath);
    const parentId = newPath.length > 0 ? newPath[newPath.length - 1] : MAIN_FOLDER_ID;
    setActiveFolder(parentId);
  }

  // Folder context menu
  const [folderMenu, setFolderMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const folderMenuId = folderMenu?.id ?? null;
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [showMoveFolder, setShowMoveFolder] = useState<string | null>(null); // folder id being moved
  const moveFolderSlide = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(moveFolderSlide, {
      toValue: showMoveFolder ? 0 : 400,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [showMoveFolder]);

  useEscapeKey(() => setShowMoveFolder(null), !!showMoveFolder);
  const moveFolderSwipeHandlers = useSwipeDownDismiss(moveFolderSlide, () => setShowMoveFolder(null));

  // Folder creation
  const [showNewFolder,   setShowNewFolder]   = useState(false);
  const [newFolderName,   setNewFolderName]   = useState('');
  const newFolderInputRef = useRef<TextInput>(null);
  const folderSlide       = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(folderSlide, {
      toValue: showNewFolder ? 0 : 400,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [showNewFolder]);

  useEscapeKey(() => setShowNewFolder(false), showNewFolder);
  const newFolderSwipeHandlers = useSwipeDownDismiss(folderSlide, () => setShowNewFolder(false));

  // Pre-record metronome
  const [preBpm,          setPreBpm]          = useState(120);
  const [preMetroActive,  setPreMetroActive]  = useState(false);
  const [preBeatFlash,    setPreBeatFlash]    = useState(false);
  const preHoldRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.07, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Pre-record metronome clicks
  useMetronome(
    preBpm,
    preMetroActive,
    useCallback(() => {
      setPreBeatFlash(true);
      setTimeout(() => setPreBeatFlash(false), 90);
    }, []),
  );

  function changePreBpm(delta: number) {
    setPreBpm(v => clamp(v + delta, 40, 240));
  }
  function startPreHold(delta: number) {
    changePreBpm(delta);
    preHoldRef.current = setInterval(() => changePreBpm(delta), 90);
  }
  function endPreHold() {
    if (preHoldRef.current) clearInterval(preHoldRef.current);
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      setActiveRec(recording);
      setIsRecording(true);
    } catch (err) { console.error('startRecording', err); }
  }

  async function stopRecording() {
    if (!activeRec) return;
    try {
      await activeRec.stopAndUnloadAsync();
      const status   = await activeRec.getStatusAsync();
      const uri      = activeRec.getURI() ?? '';
      const duration = ((status as any).durationMillis ?? 0) / 1000;
      setPendingUri(uri);
      setPendingDuration(duration);
      setPendingBpm(preMetroActive ? preBpm : null);
      setActiveRec(null);
      setIsRecording(false);
      setTimeout(() => setShowTagSheet(true), 350);
    } catch (err) { console.error('stopRecording', err); }
  }

  function handleTagsDone(tags: TagName[]) {
    setShowTagSheet(false);
    if (pendingUri) {
      const uri = pendingUri;
      const rec = createRecording(activeFolderId, uri, pendingDuration, tags);
      if (pendingBpm != null) updateRecording(rec.id, { bpm: pendingBpm });
      setPendingUri(null);
      // Analyze waveform in background and save when ready
      extractWaveform(uri).then(waveformData => {
        if (waveformData) updateRecording(rec.id, { waveformData });
      });
    }
  }

  async function stopSound() {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingId(null);
    setPlaybackProgress(0);
  }

  async function handlePlay(recording: Recording) {
    await stopSound();
    if (playingId === recording.id) return;

    const tIn  = recording.trimIn  ?? 0;
    const tOut = recording.trimOut ?? 1;
    trimInRef.current  = tIn;
    trimOutRef.current = tOut;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      currentDurationRef.current = recording.duration;

      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.filePath },
        { shouldPlay: true, positionMillis: Math.round(tIn * recording.duration * 1000) },
        status => {
          if (!status.isLoaded) return;
          const totalMs = recording.duration * 1000;
          if (status.didJustFinish) {
            setPlayingId(null);
            setPlaybackProgress(0);
          } else {
            const posMs = status.positionMillis ?? 0;
            // Stop at trimOut
            if (posMs >= trimOutRef.current * totalMs) {
              sound.stopAsync().catch(() => {});
              setPlayingId(null);
              setPlaybackProgress(0);
            } else {
              setPlaybackProgress(posMs / totalMs);
            }
          }
        }
      );
      soundRef.current = sound;
      setPlayingId(recording.id);
    } catch (err) { console.error('playMemo', err); }
  }

  async function handleSeek(ratio: number) {
    if (soundRef.current && currentDurationRef.current > 0) {
      await soundRef.current.setPositionAsync(ratio * currentDurationRef.current * 1000);
      setPlaybackProgress(ratio);
    }
  }

  function toggleExpand(id: string) {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.75 },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpandedId(prev => (prev === id ? null : id));
    setRenamingId(null);
  }

  function confirmDelete(recording: Recording) {
    Alert.alert(
      'Delete Recording',
      `Are you sure you want to delete "${recording.title ?? 'Voice Memo'}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            if (playingId === recording.id) stopSound();
            if (expandedId === recording.id) setExpandedId(null);
            deleteRecording(recording.id);
          },
        },
      ]
    );
  }

  function showMenu(recording: Recording) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: recording.title ?? 'Voice Memo', options: ['Cancel', 'Rename', 'Duplicate', 'Crop', 'Delete'], cancelButtonIndex: 0, destructiveButtonIndex: 4 },
        index => {
          if (index === 1) { if (expandedId !== recording.id) toggleExpand(recording.id); setRenamingId(recording.id); }
          if (index === 2) Alert.alert('Coming Soon', 'Duplicate will be available in a future update.');
          if (index === 3) Alert.alert('Coming Soon', 'Audio cropping will be available in a future update.');
          if (index === 4) confirmDelete(recording);
        }
      );
    } else {
      Alert.alert(recording.title ?? 'Voice Memo', undefined, [
        { text: 'Rename', onPress: () => { if (expandedId !== recording.id) toggleExpand(recording.id); setRenamingId(recording.id); } },
        { text: 'Duplicate', onPress: () => Alert.alert('Coming Soon', 'Duplicate will be available in a future update.') },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(recording) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: bgTheme.labelColor }]} selectable={false}>Capture</Text>
        <TouchableOpacity style={styles.gearBtn} onPress={() => setShowThemeSheet(true)}>
          <Ionicons name="color-palette-outline" size={22} color="#6B6560" />
        </TouchableOpacity>
      </View>

      {/* Folder bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderBar} contentContainerStyle={styles.folderBarContent}>
        {folderPath.length > 0 && (
          <TouchableOpacity style={[styles.folderChip, { flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={navigateBack}>
            <Ionicons name="chevron-back" size={13} color="#6B6560" />
            <Text style={styles.folderChipText}>Back</Text>
          </TouchableOpacity>
        )}
        {visibleFolders.map(folder => {
          const hasChildren = folders.some(f => f.parentId === folder.id);
          return (
            <FolderChip
              key={folder.id}
              folder={folder}
              active={folder.id === activeFolderId}
              dropTarget={draggingId !== null && dragOverFolderId === folder.id}
              accent={theme.accent}
              accentLight={theme.accentLight}
              isRenaming={renamingFolderId === folder.id}
              hasChildren={hasChildren}
              onPress={() => {
                if (hasChildren) navigateIntoFolder(folder.id);
                else setActiveFolder(folder.id);
              }}
              onDragOver={() => setDragOverFolderId(folder.id)}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={id => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                updateRecording(id, { folderId: folder.id });
                setDragOverFolderId(null);
                setDraggingId(null);
              }}
              onShowMenu={(x, y) => setFolderMenu({ id: folder.id, x, y })}
              onRenameSubmit={name => { if (name) renameFolder(folder.id, name); setRenamingFolderId(null); }}
              onRenameCancel={() => setRenamingFolderId(null)}
            />
          );
        })}
        <TouchableOpacity
          style={styles.folderAddBtn}
          onPress={() => { setNewFolderName(''); setShowNewFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 100); }}
        >
          <Ionicons name="add" size={16} color="#6B6560" />
        </TouchableOpacity>
      </ScrollView>

      {/* Recordings list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {recordings.length === 0 ? (
          <Text style={styles.emptyText} selectable={false}>Tap the button below to capture your first idea.</Text>
        ) : (
          recordings.map(memo => (
            <RecordingCard
              key={memo.id}
              recording={memo}
              expanded={expandedId === memo.id}
              isPlaying={playingId === memo.id}
              progress={playbackProgress}
              triggerRename={renamingId === memo.id}
              onToggle={() => toggleExpand(memo.id)}
              onPlay={() => handlePlay(memo)}
              onSeek={handleSeek}
              onRename={title => { updateRecording(memo.id, { title }); setRenamingId(null); }}
              onDelete={() => confirmDelete(memo)}
              onMenu={() => showMenu(memo)}
              onUpdate={patch => updateRecording(memo.id, patch)}
              onDragStart={() => setDraggingId(memo.id)}
              onDragEnd={() => { setDraggingId(null); setDragOverFolderId(null); }}
            />
          ))
        )}
      </ScrollView>

      {/* Pre-record metronome strip */}
      <View style={[styles.metroStrip, { backgroundColor: bgTheme.bg }]}>
        <TouchableOpacity
          style={[
            styles.metroToggle,
            preMetroActive && { borderColor: theme.accent + '88' },
            preMetroActive && preBeatFlash
              ? { backgroundColor: theme.accent + '33' }
              : preMetroActive
              ? { backgroundColor: theme.accent + '12' }
              : undefined,
          ]}
          onPress={() => setPreMetroActive(a => !a)}
        >
          <Ionicons
            name={preMetroActive ? 'musical-notes' : 'musical-notes-outline'}
            size={14}
            color={preMetroActive ? theme.accent : '#A09890'}
          />
          <Text style={[styles.metroToggleLabel, preMetroActive && { color: theme.accent }]}>
            Metro
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.metroBpmAdj} onPressIn={() => startPreHold(-1)} onPressOut={endPreHold}>
          <Ionicons name="remove" size={14} color="#6B6560" />
        </TouchableOpacity>

        <BpmDragValue
          value={preBpm}
          onChange={setPreBpm}
          numberStyle={[styles.metroBpmVal, preMetroActive && { color: theme.accent }]}
        />

        <TouchableOpacity style={styles.metroBpmAdj} onPressIn={() => startPreHold(1)} onPressOut={endPreHold}>
          <Ionicons name="add" size={14} color="#6B6560" />
        </TouchableOpacity>

        <Text style={styles.metroBpmUnit}>BPM</Text>
      </View>

      {/* Record button */}
      <View style={[styles.buttonZone, { backgroundColor: bgTheme.bg }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.recordButton, { backgroundColor: isRecording ? theme.accentDark : theme.accent, shadowColor: theme.accent }]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.85}
          >
            {isRecording ? <View style={styles.stopSquare} /> : <View style={styles.recordDot} />}
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.buttonLabel, isRecording && { color: theme.accent }]}>
          {isRecording ? 'recording…' : 'tap to record'}
        </Text>
      </View>

      {/* New folder modal */}
      <Modal visible={showNewFolder} transparent animationType="none">
        <View style={styles.newFolderOverlay}>
          {/* Backdrop — rendered first (behind), closes on tap */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowNewFolder(false)} />
          {/* Box — rendered second (in front), slides up independently */}
          <Animated.View style={[styles.newFolderBox, { transform: [{ translateY: folderSlide }] }]} onStartShouldSetResponder={() => true}>
            <SheetGrabHandle handlers={newFolderSwipeHandlers} />
            <Text style={styles.newFolderTitle}>New Folder</Text>
            <TextInput
              ref={newFolderInputRef}
              style={[styles.newFolderInput, { borderBottomColor: theme.accent }]}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Folder name"
              placeholderTextColor="#C4BDB7"
              returnKeyType="done"
              autoFocus
              onSubmitEditing={() => {
                const name = newFolderName.trim();
                if (name) { const f = createFolder(name, currentParentId ?? undefined); setActiveFolder(f.id); }
                setShowNewFolder(false);
              }}
            />
            <View style={styles.newFolderBtns}>
              <TouchableOpacity style={styles.newFolderCancel} onPress={() => setShowNewFolder(false)}>
                <Text style={styles.newFolderCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newFolderCreate, { backgroundColor: newFolderName.trim() ? theme.accent : theme.accent + '55' }]}
                disabled={!newFolderName.trim()}
                onPress={() => {
                  const name = newFolderName.trim();
                  if (name) { const f = createFolder(name, currentParentId ?? undefined); setActiveFolder(f.id); }
                  setShowNewFolder(false);
                }}
              >
                <Text style={styles.newFolderCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Folder context menu — in-tree so no Modal flash */}
      {folderMenu && <>
        <TouchableOpacity style={[StyleSheet.absoluteFill, { zIndex: 99 }]} activeOpacity={0} onPress={() => setFolderMenu(null)} />
        <View style={[styles.folderMenuBox, {
          zIndex: 100,
          top: Math.min(folderMenu.y + 4, Dimensions.get('window').height - 160),
          left: Math.min(folderMenu.x, Dimensions.get('window').width - 210),
        }]}>
          <TouchableOpacity
            style={styles.folderMenuItem}
            onPress={() => { setRenamingFolderId(folderMenuId); setFolderMenu(null); }}
          >
            <Ionicons name="pencil-outline" size={16} color="#1C1A17" />
            <Text style={styles.folderMenuItemText}>Rename</Text>
          </TouchableOpacity>
          <View style={styles.folderMenuDivider} />
          <TouchableOpacity
            style={styles.folderMenuItem}
            onPress={() => { setShowMoveFolder(folderMenuId); setFolderMenu(null); }}
          >
            <Ionicons name="folder-outline" size={16} color="#1C1A17" />
            <Text style={styles.folderMenuItemText}>Move into folder</Text>
          </TouchableOpacity>
          {folderMenuId && folders.find(f => f.id === folderMenuId)?.parentId !== null && (
            <>
              <View style={styles.folderMenuDivider} />
              <TouchableOpacity
                style={styles.folderMenuItem}
                onPress={() => { moveFolder(folderMenuId!, null); setFolderMenu(null); }}
              >
                <Ionicons name="arrow-up-outline" size={16} color="#1C1A17" />
                <Text style={styles.folderMenuItemText}>Move to root</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.folderMenuDivider} />
          <TouchableOpacity
            style={styles.folderMenuItem}
            onPress={() => {
              const id = folderMenuId!;
              setFolderMenu(null);
              Alert.alert('Delete Folder', 'Recordings inside will move to Main.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteFolder(id) },
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={[styles.folderMenuItemText, { color: '#DC2626' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </>}

      {/* Move folder picker */}
      {showMoveFolder && (
        <Modal visible transparent animationType="none">
          <View style={styles.newFolderOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowMoveFolder(null)} />
            <Animated.View style={[styles.newFolderBox, { paddingBottom: 24, transform: [{ translateY: moveFolderSlide }] }]} onStartShouldSetResponder={() => true}>
              <SheetGrabHandle handlers={moveFolderSwipeHandlers} />
              <Text style={styles.newFolderTitle}>Move into folder</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {folders
                  .filter(f => f.id !== showMoveFolder && f.id !== MAIN_FOLDER_ID)
                  .map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.folderMenuItem, { paddingHorizontal: 20, paddingVertical: 14 }]}
                      onPress={() => { moveFolder(showMoveFolder, f.id); setShowMoveFolder(null); }}
                    >
                      <Ionicons name="folder-outline" size={18} color="#6B6560" />
                      <Text style={[styles.folderMenuItemText, { fontSize: 15 }]}>{f.name}</Text>
                    </TouchableOpacity>
                  ))
                }
                {folders.filter(f => f.id !== showMoveFolder && f.id !== MAIN_FOLDER_ID).length === 0 && (
                  <Text style={{ color: '#A09890', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>No other folders</Text>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      )}


      <TagSheet   visible={showTagSheet}   onDone={handleTagsDone} />
      <ThemeSheet visible={showThemeSheet} onClose={() => setShowThemeSheet(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF8F4' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1C1A17', letterSpacing: -0.5 },
  gearBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },

  folderBar:        { flexGrow: 0 },
  folderBarContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  folderChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F1EB' },
  folderChipText:   { fontSize: 13, fontWeight: '500', color: '#6B6560' },
  folderAddBtn:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },

  list:        { flex: 1, marginTop: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 240 },
  emptyText:   { marginTop: 48, textAlign: 'center', fontSize: 15, color: '#A09990', lineHeight: 22 },

  card:         { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 12, marginBottom: 10, borderWidth: 0.5, borderColor: 'rgba(28,26,23,0.08)' },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardHeaderText: { flex: 1, marginRight: 8 },
  titleRow:     { flexDirection: 'row', alignItems: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '600', color: '#1C1A17' },
  cardTitleInput: { borderBottomWidth: 1.5, paddingVertical: 2, flex: 1 },
  cardTagHint:  { fontSize: 12, color: '#A09990', marginTop: 2 },
  cardDuration: { fontSize: 12, color: '#A09990', fontVariant: ['tabular-nums'] },
  cardDate:     { fontSize: 11, color: '#C4BDB7', marginTop: 9 },

  inlinePlayBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },

  expandedContent:  { marginTop: 14 },
  expandedRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 10, marginTop: 10 },
  menuBtn:          { padding: 6 },
  expandedPlayBtn:  { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },

  trimInfoRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: -6 },
  trimInfoText:  { flex: 1, fontSize: 11, color: '#A09890' },
  trimResetText: { fontSize: 11, fontWeight: '600' },

  pitchStatus: { fontSize: 11, color: '#A09990', fontStyle: 'italic', marginBottom: 10, marginTop: -4 },

  tagRow:        { marginBottom: 4 },
  tagRowContent: { gap: 6 },
  tagPill:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  tagPillText:   { fontSize: 11, fontWeight: '500' },

  // Pre-record metronome strip
  metroStrip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(28,26,23,0.06)' },
  metroToggle:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#E8E2D8', backgroundColor: '#F5F1EB' },
  metroToggleLabel: { fontSize: 11, fontWeight: '600', color: '#A09890' },
  metroBpmAdj:      { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  metroBpmVal:      { fontSize: 18, fontWeight: '300', color: '#1C1A17', minWidth: 36, textAlign: 'center' },
  metroBpmUnit:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#A09890' },
  // Record button
  buttonZone: { alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(28,26,23,0.06)' },
  recordButton: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  recordDot:    { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF' },
  stopSquare:   { width: 24, height: 24, borderRadius: 4,  backgroundColor: '#FFFFFF' },
  buttonLabel:  { fontSize: 12, color: '#B5A898', letterSpacing: 0.3 },

  // Tag sheet
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 44, paddingTop: 12 },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E0D8', alignSelf: 'center', marginBottom: 20 },
  sheetTitle:    { fontSize: 18, fontWeight: '700', color: '#1C1A17', marginBottom: 4 },
  sheetSub:      { fontSize: 13, color: '#A09990', marginBottom: 20 },
  tagGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  tagChip:       { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  tagChipText:   { fontSize: 14, fontWeight: '500', color: '#6B6560' },
  doneButton:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  doneButtonText:{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Theme picker
  themeSection: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: '#A09890', marginTop: 14, marginBottom: 10, paddingHorizontal: 4 },
  themeRow:     { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingBottom: 4 },
  themeOption:  { alignItems: 'center', gap: 8 },
  themeSwatch:  { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  themeSwatchActive: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  themeLabel:   { fontSize: 12, fontWeight: '500', color: '#A09990' },

  // New folder modal
  newFolderOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  newFolderBox:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 44 : 28 },
  newFolderTitle:      { fontSize: 17, fontWeight: '700', color: '#1C1A17', marginBottom: 16, textAlign: 'center' },
  newFolderInput:      { fontSize: 16, color: '#1C1A17', borderBottomWidth: 1.5, paddingVertical: 6, marginBottom: 24 },
  newFolderBtns:       { flexDirection: 'row', gap: 10 },
  newFolderCancel:     { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F5F1EB', alignItems: 'center' },
  newFolderCancelText: { fontSize: 15, fontWeight: '600', color: '#6B6560' },
  newFolderCreate:     { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  newFolderCreateText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  menuOverlay:       { flex: 1, backgroundColor: 'transparent' },
  folderMenuBox:     { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 14, width: 200, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  folderMenuItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  folderMenuItemText:{ fontSize: 15, fontWeight: '500', color: '#1C1A17' },
  folderMenuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(28,26,23,0.08)' },

});
