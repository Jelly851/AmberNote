import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { LAYER_COLORS, SECTION_COLORS } from '@/lib/constants';
import { getAllRecordings, getFolders, getRecordings } from '@/lib/db';
import { MAIN_FOLDER_ID, FIXED_TAGS } from '@/lib/constants';
import type { AudioLayer, ChordCell, LayerType, Line, NoteValue, Recording, RhythmCell, Section, SectionType } from '@/lib/types';
import { useSongsStore } from '@/store/songsStore';
import { useThemeStore } from '@/store/themeStore';
import type { BgTheme } from '@/lib/themes';
import { useInspoBoardStore } from '@/store/inspoBoardStore';
import { LinearGradient } from 'expo-linear-gradient';
import { computeDirectionalGradient, getBackdrop, type BackdropDef, type GradientConfig, type InspoBoard } from '@/lib/inspo';
import { themeForBase } from '@/lib/bgElements';
import { exportSongToZip, type ExportOptions } from '@/lib/exportSong';
import BoardBackdrop from '@/components/BoardBackdrop';
import CustomBackdrop from '@/components/CustomBackdrop';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';

// ─── Song Meta Pickers ────────────────────────────────────────────────────────

const ROOT_NOTES_META = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'];

function KeyPickerModal({ visible, current, onSelect, onClose }: {
  visible: boolean; current: string | null;
  onSelect: (key: string) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const [root, setRoot] = useState('C');
  const [mode, setMode] = useState<'Major' | 'Minor'>('Major');
  useEffect(() => {
    if (visible && current) {
      const parts = current.split(' ');
      if (parts.length === 2) { setRoot(parts[0]); setMode(parts[1] as 'Major' | 'Minor'); }
    }
  }, [visible, current]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={metaStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={metaStyles.box} onStartShouldSetResponder={() => true}>
          <Text style={metaStyles.title}>Key</Text>
          <View style={metaStyles.noteGrid}>
            {ROOT_NOTES_META.map(n => (
              <TouchableOpacity key={n} style={[metaStyles.noteCell, root === n && metaStyles.noteCellActive, root === n && { backgroundColor: theme.accentLight, borderColor: theme.accent }]} onPress={() => setRoot(n)}>
                <Text style={[metaStyles.noteCellText, root === n && { color: theme.accent }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={metaStyles.modeRow}>
            {(['Major', 'Minor'] as const).map(m => (
              <TouchableOpacity key={m} style={[metaStyles.modeChip, mode === m && metaStyles.modeChipActive, mode === m && { backgroundColor: theme.accentLight, borderColor: theme.accent }]} onPress={() => setMode(m)}>
                <Text style={[metaStyles.modeChipText, mode === m && { color: theme.accent }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={metaStyles.actions}>
            <TouchableOpacity style={metaStyles.cancelBtn} onPress={onClose}>
              <Text style={metaStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[metaStyles.confirmBtn, { backgroundColor: theme.accent }]} onPress={() => { onSelect(`${root} ${mode}`); onClose(); }}>
              <Text style={metaStyles.confirmText}>Set Key</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const TOP_NUMS = Array.from({ length: 15 }, (_, i) => i + 1);   // 1–15
const BOT_NUMS = [2, 4, 8, 16];

function TimeSigPickerModal({ visible, current, onSelect, onClose }: {
  visible: boolean; current: string | null;
  onSelect: (sig: string) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const parts = current?.split('/') ?? ['4', '4'];
  const [top, setTop] = useState(parseInt(parts[0]) || 4);
  const [bot, setBot] = useState(parseInt(parts[1]) || 4);

  useEffect(() => {
    if (visible) {
      const p = current?.split('/') ?? ['4', '4'];
      setTop(parseInt(p[0]) || 4);
      setBot(parseInt(p[1]) || 4);
    }
  }, [visible]);

  function confirm() { onSelect(`${top}/${bot}`); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={metaStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={metaStyles.box} onStartShouldSetResponder={() => true}>
          <Text style={metaStyles.title}>Time Signature</Text>

          <View style={metaStyles.timeSigPicker}>
            {/* Top number */}
            <View style={metaStyles.timeSigCol}>
              <Text style={metaStyles.timeSigColLabel}>Beats per bar</Text>
              <ScrollView style={metaStyles.timeSigScroll} showsVerticalScrollIndicator={false}>
                {TOP_NUMS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[metaStyles.timeSigNumBtn, top === n && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 1.5 }]}
                    onPress={() => setTop(n)}
                  >
                    <Text style={[metaStyles.timeSigNum, top === n && { color: theme.accent, fontWeight: '700' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={metaStyles.timeSigSlash}>/</Text>

            {/* Bottom number */}
            <View style={metaStyles.timeSigCol}>
              <Text style={metaStyles.timeSigColLabel}>Note value</Text>
              <View>
                {BOT_NUMS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[metaStyles.timeSigNumBtn, bot === n && { backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: 1.5 }]}
                    onPress={() => setBot(n)}
                  >
                    <Text style={[metaStyles.timeSigNum, bot === n && { color: theme.accent, fontWeight: '700' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={metaStyles.actions}>
            <TouchableOpacity style={metaStyles.cancelBtn} onPress={onClose}>
              <Text style={metaStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[metaStyles.confirmBtn, { backgroundColor: theme.accent }]} onPress={confirm}>
              <Text style={metaStyles.confirmText}>Set {top}/{bot}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function BpmPickerModal({ visible, current, onSelect, onClose }: {
  visible: boolean; current: number | null;
  onSelect: (bpm: number) => void; onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const [value, setValue] = useState(current ?? 120);
  const tapTimesRef = useRef<number[]>([]);
  const dragBaseRef = useRef(120);
  const isDraggingRef = useRef(false);
  const [typing, setTyping] = useState(false);
  const [typeText, setTypeText] = useState('');

  useEffect(() => {
    if (visible) { setValue(current ?? 120); tapTimesRef.current = []; }
  }, [visible]);

  function clamp(v: number) { return Math.max(20, Math.min(300, v)); }

  function handleTap() {
    const now = Date.now();
    const taps = tapTimesRef.current;
    taps.push(now);
    if (taps[taps.length - 1] - taps[0] > 3000) tapTimesRef.current = taps.slice(-2);
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setValue(clamp(Math.round(60000 / avg)));
    }
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      isDraggingRef.current = true;
      dragBaseRef.current = valueRef.current;
    },
    onPanResponderMove: (_, gs) => {
      // drag up = increase BPM, drag down = decrease; 5px per BPM
      const delta = Math.round(-gs.dy / 5);
      setValue(clamp(dragBaseRef.current + delta));
    },
    onPanResponderRelease: () => { isDraggingRef.current = false; },
    onPanResponderTerminate: () => { isDraggingRef.current = false; },
  })).current;

  // Keep dragBase in sync with value when not dragging
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    if (!isDraggingRef.current) dragBaseRef.current = value;
  }, [value]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={metaStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={metaStyles.box} onStartShouldSetResponder={() => true}>
          <Text style={metaStyles.title}>Tempo</Text>

          {/* Stepper */}
          <View style={bpmStyles.row}>
            <TouchableOpacity style={bpmStyles.stepBtn} onPress={() => setValue(v => clamp(v - 1))} onLongPress={() => setValue(v => clamp(v - 5))}>
              <Text style={bpmStyles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <View style={bpmStyles.display} {...panResponder.panHandlers}>
              {typing ? (
                <TextInput
                  style={[bpmStyles.bpmNum, { color: theme.accent, textAlign: 'center', minWidth: 90 }]}
                  value={typeText}
                  onChangeText={setTypeText}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onBlur={() => {
                    const n = parseInt(typeText, 10);
                    if (!isNaN(n)) setValue(clamp(n));
                    setTyping(false);
                  }}
                  autoFocus
                  selectTextOnFocus
                />
              ) : (
                <Text style={[bpmStyles.bpmNum, { color: theme.accent }]}>{value}</Text>
              )}
              <View style={bpmStyles.labelRow}>
                <Text style={bpmStyles.bpmLabel}>BPM</Text>
                <TouchableOpacity onPress={() => { setTypeText(String(value)); setTyping(t => !t); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={typing ? 'checkmark' : 'pencil'} size={12} color="#A09990" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={bpmStyles.stepBtn} onPress={() => setValue(v => clamp(v + 1))} onLongPress={() => setValue(v => clamp(v + 5))}>
              <Text style={bpmStyles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Tap tempo */}
          <TouchableOpacity style={[bpmStyles.tapBtn, { borderColor: theme.accent + '55' }]} onPress={handleTap} activeOpacity={0.7}>
            <Text style={[bpmStyles.tapBtnText, { color: theme.accent }]}>Tap Tempo</Text>
          </TouchableOpacity>

          <View style={metaStyles.actions}>
            <TouchableOpacity style={metaStyles.cancelBtn} onPress={onClose}>
              <Text style={metaStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[metaStyles.confirmBtn, { backgroundColor: theme.accent }]} onPress={() => { onSelect(value); onClose(); }}>
              <Text style={metaStyles.confirmText}>Set Tempo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const bpmStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  stepBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 22, fontWeight: '400', color: '#1C1A17' },
  display: { alignItems: 'center', minWidth: 90 },
  bpmNum: { fontSize: 48, fontWeight: '700', lineHeight: 54 },
  bpmLabel: { fontSize: 11, fontWeight: '600', color: '#A09990', letterSpacing: 0.8, textTransform: 'uppercase' },
  tapBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
  tapBtnText: { fontSize: 15, fontWeight: '600' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

const metaStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%' },
  title: { fontSize: 17, fontWeight: '700', color: '#1C1A17', marginBottom: 18, textAlign: 'center' },
  noteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14 },
  noteCell: { width: 46, height: 38, borderRadius: 10, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  noteCellActive: { backgroundColor: '#FEF3C7', borderWidth: 1.5, borderColor: '#D97706' },
  noteCellText: { fontSize: 13, fontWeight: '600', color: '#6B6560' },
  noteCellTextActive: { color: '#D97706' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F1EB', alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  modeChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  modeChipText: { fontSize: 14, fontWeight: '600', color: '#6B6560' },
  modeChipTextActive: { color: '#D97706' },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5F1EB', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#6B6560' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#D97706', alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  timeSigPicker: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, marginBottom: 24 },
  timeSigCol: { flex: 1 },
  timeSigColLabel: { fontSize: 11, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 },
  timeSigScroll: { maxHeight: 200 },
  timeSigNumBtn: { paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F1EB', alignItems: 'center', marginBottom: 6 },
  timeSigNum: { fontSize: 18, fontWeight: '500', color: '#1C1A17' },
  timeSigSlash: { fontSize: 36, color: '#C4BDB7', fontWeight: '300', marginTop: 28, paddingHorizontal: 4 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatChord(cell: ChordCell): string {
  const base = `${cell.root ?? ''}${cell.quality ?? ''}`;
  return cell.slashBass ? `${base}/${cell.slashBass}` : base;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Note Values ──────────────────────────────────────────────────────────────

// Base 5 — shown as chips in the picker
const BASE_NOTE_VALUES: { value: NoteValue; label: string; short: string }[] = [
  { value: 'whole',     label: 'Whole',   short: '𝅝'  },
  { value: 'half',      label: 'Half',    short: '𝅗𝅥' },
  { value: 'quarter',   label: 'Quarter', short: '♩'  },
  { value: 'eighth',    label: 'Eighth',  short: '♪'  },
  { value: 'sixteenth', label: '16th',    short: '♬'  },
];

// Full lookup for grid display (symbols for every stored value)
const NOTE_VALUES: { value: NoteValue; short: string }[] = [
  { value: 'whole',              short: '𝅝'   },
  { value: 'half',               short: '𝅗𝅥'  },
  { value: 'quarter',            short: '♩'   },
  { value: 'eighth',             short: '♪'   },
  { value: 'sixteenth',          short: '♬'   },
  { value: 'dotted-half',        short: '𝅗𝅥·'  },
  { value: 'dotted-quarter',     short: '♩·'  },
  { value: 'dotted-eighth',      short: '♪·'  },
  { value: 'half-triplet',       short: '𝅗𝅥³'  },
  { value: 'quarter-triplet',    short: '♩³'  },
  { value: 'eighth-triplet',     short: '♪³'  },
  { value: 'sixteenth-triplet',  short: '♬³'  },
];

const NOTE_VALUE_BEATS: Record<NoteValue, number> = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25,
  'dotted-half': 3, 'dotted-quarter': 1.5, 'dotted-eighth': 0.75,
  'half-triplet': 4/3, 'quarter-triplet': 2/3, 'eighth-triplet': 1/3, 'sixteenth-triplet': 1/6,
};

type NoteModifier = 'dotted' | 'triplet' | null;

// Which base values support each modifier
const DOTTED_MAP: Partial<Record<NoteValue, NoteValue>> = {
  half: 'dotted-half', quarter: 'dotted-quarter', eighth: 'dotted-eighth',
};
const TRIPLET_MAP: Partial<Record<NoteValue, NoteValue>> = {
  half: 'half-triplet', quarter: 'quarter-triplet',
  eighth: 'eighth-triplet', sixteenth: 'sixteenth-triplet',
};

function applyModifier(base: NoteValue, mod: NoteModifier): NoteValue {
  if (mod === 'dotted')  return DOTTED_MAP[base]  ?? base;
  if (mod === 'triplet') return TRIPLET_MAP[base] ?? base;
  return base;
}

function splitNoteValue(nv: NoteValue): { base: NoteValue; mod: NoteModifier } {
  if (nv.startsWith('dotted-'))  return { base: nv.slice(7)  as NoteValue, mod: 'dotted'  };
  if (nv.endsWith('-triplet'))   return { base: nv.slice(0, -8) as NoteValue, mod: 'triplet' };
  return { base: nv, mod: null };
}

const BASE_CELL_W = 40;

// ─── Types ────────────────────────────────────────────────────────────────────

type CellPressHandler = (lineId: string, position: number, existing: ChordCell | null) => void;

type ChordPickerTarget = { lineId: string; position: number; existing: ChordCell | null };


// ─── Chord Grid ───────────────────────────────────────────────────────────────

function ChordGrid({ line, onCellPress }: { line: Line; onCellPress: CellPressHandler }) {
  const { chordCells, loadChordCells, activeSong } = useSongsStore();

  useEffect(() => { loadChordCells(line.id); }, [line.id]);

  const cells = chordCells[line.id] ?? [];
  const resolution = line.chordResolution;
  const beatsPerBar = Math.max(1, parseInt(activeSong?.timeSignature?.split('/')[0] ?? '4') || 4);
  const cellsPerBeat = Math.max(1, Math.round(resolution / beatsPerBar));
  const offsetCells = (line.beatOffset ?? 0) * cellsPerBeat % resolution;

  const maxPos = cells.length > 0 ? Math.max(...cells.map(c => c.position)) : -1;
  const totalCells = Math.max(resolution * 2, maxPos + resolution + 1);

  // Build render list, skipping positions covered by a wide chord
  const covered = new Set<number>();
  const items: { pos: number; cell: ChordCell | null; width: number; cellsSpanned: number }[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (covered.has(i)) continue;
    const cell = cells.find(c => c.position === i) ?? null;
    const beats = cell?.duration ? NOTE_VALUE_BEATS[cell.duration] : 1;
    let cellsSpanned = Math.max(1, Math.round(beats * cellsPerBeat));
    if (!cell) {
      // Clamp to bar boundary so empty slots don't overflow into the next bar
      const posInBar = (i - offsetCells + resolution) % resolution;
      const cellsUntilBar = resolution - posInBar;
      cellsSpanned = Math.min(cellsSpanned, cellsUntilBar);
    }
    const width = Math.max(16, Math.round(BASE_CELL_W * cellsSpanned / cellsPerBeat));
    for (let j = i + 1; j < i + cellsSpanned; j++) covered.add(j);
    items.push({ pos: i, cell, width, cellsSpanned });
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chordScroll}
      contentContainerStyle={styles.chordScrollContent}
    >
      {items.map(({ pos, cell, width }) => {
        const isBarBoundary = pos > 0 && ((pos - offsetCells + resolution) % resolution === 0);
        return (
          <View key={pos} style={styles.cellWrapper}>
            {isBarBoundary && <View style={styles.barDivider} />}
            <TouchableOpacity
              style={[styles.chordCell, { width }, !!cell && styles.chordCellFilled]}
              onPress={() => onCellPress(line.id, pos, cell)}
            >
              {cell
                ? <Text style={styles.chordLabel} numberOfLines={1}>{formatChord(cell)}</Text>
                : <Text style={styles.chordPlus}>+</Text>
              }
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Rhythm Grid ─────────────────────────────────────────────────────────────

type RhythmCellPressHandler = (lineId: string, position: number, existingCell: RhythmCell | null, lineText: string) => void;

function RhythmGrid({ line, onCellPress }: { line: Line; onCellPress: RhythmCellPressHandler }) {
  const { rhythmCells, loadRhythmCells, activeSong, updateLine } = useSongsStore();
  const { theme } = useThemeStore();

  useEffect(() => { loadRhythmCells(line.id); }, [line.id]);

  const cells = rhythmCells[line.id] ?? [];
  const resolution = line.chordResolution;
  const timeSig = activeSong?.timeSignature ?? '4/4';
  const beatsPerBar = Math.max(1, parseInt(timeSig.split('/')[0]) || 4);
  const cellsPerBeat = Math.max(1, Math.round(resolution / beatsPerBar));

  // Pickup / beat offset — drag the ticker row to shift where beat 1 falls
  const [beatOffset, setBeatOffset] = useState(line.beatOffset ?? 0);
  const dragStartOffset = useRef(0);
  const beatOffsetMounted = useRef(false);

  // Persist beatOffset whenever it changes (skip initial mount)
  useEffect(() => {
    if (!beatOffsetMounted.current) { beatOffsetMounted.current = true; return; }
    updateLine(line.id, { beatOffset });
  }, [beatOffset]);
  const BEAT_PX = cellsPerBeat * (BASE_CELL_W + 3); // approx pixels per beat

  // Build variable-width items, skipping covered positions (like ChordGrid)
  const maxPos = cells.length > 0 ? Math.max(...cells.map(c => c.position)) : -1;
  const totalCells = Math.max(resolution * 2, maxPos + resolution + 1);
  const offsetCells = (beatOffset * cellsPerBeat) % resolution;
  const covered = new Set<number>();
  const items: { pos: number; cell: RhythmCell | null; width: number; isBar: boolean; cellsSpanned: number }[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (covered.has(i)) continue;
    const cell = cells.find(c => c.position === i) ?? null;
    const beats = cell ? (NOTE_VALUE_BEATS[cell.noteValue] ?? 1) : 1;
    let cellsSpanned = Math.max(1, Math.round(beats * cellsPerBeat));
    if (!cell) {
      // Clamp empty slots to the remaining space until the next bar boundary so
      // they don't swallow positions that belong to a later beat.
      // e.g. after an 8th note at beat 4, the remaining half-beat shows as 8th-wide.
      const posInBar = (i - offsetCells + resolution) % resolution;
      const cellsUntilBar = resolution - posInBar;
      cellsSpanned = Math.min(cellsSpanned, cellsUntilBar);
    }
    // Width is strictly proportional: 1 beat = BASE_CELL_W, so 8th = BASE_CELL_W/2, etc.
    const width = Math.max(16, Math.round(BASE_CELL_W * cellsSpanned / cellsPerBeat));
    const isBar = i > 0 && ((i - offsetCells + resolution) % resolution === 0);
    for (let j = i + 1; j < i + cellsSpanned; j++) covered.add(j);
    items.push({ pos: i, cell, width, isBar, cellsSpanned });
  }

  // Beat number at cell position, shifted by pickup offset
  function beatNumAt(pos: number): number {
    const cycleLen = beatsPerBar * cellsPerBeat;
    const shifted = (pos + cycleLen - (beatOffset * cellsPerBeat) % cycleLen) % cycleLen;
    return Math.floor(shifted / cellsPerBeat) + 1;
  }

  // Drag the ticker row left/right to set the pickup offset. PanResponder so it
  // works with a finger on device and a mouse on web; it claims horizontal
  // drags before the surrounding ScrollView can start scrolling.
  const beatPxRef = useRef(BEAT_PX); beatPxRef.current = BEAT_PX;
  const beatsPerBarRef = useRef(beatsPerBar); beatsPerBarRef.current = beatsPerBar;
  const beatOffsetRef = useRef(beatOffset); beatOffsetRef.current = beatOffset;

  const tickerPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
    onPanResponderGrant: () => { dragStartOffset.current = beatOffsetRef.current; },
    onPanResponderMove: (_, gs) => {
      const bpb = beatsPerBarRef.current;
      const raw = dragStartOffset.current + Math.round(gs.dx / beatPxRef.current);
      setBeatOffset(((raw % bpb) + bpb) % bpb);
    },
  })).current;

  const tickerGestureProps = tickerPan.panHandlers;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chordScroll}
      contentContainerStyle={styles.rhythmScrollContent}
    >
      <View>
        {/* Beat tickers — draggable to set pickup */}
        <View
          style={[styles.beatTickerRow, Platform.OS === 'web' && { cursor: 'ew-resize', userSelect: 'none' } as any]}
          {...tickerGestureProps}
        >
          {items.map(({ pos, width, isBar, cellsSpanned }) => {
            const tickerW  = width + (isBar ? 4 : 0);
            const tickerPL = isBar ? 4 : 0;
            const cycleLen = beatsPerBar * cellsPerBeat;

            // Collect every beat marker that falls within this note's cell span.
            // For single-cell items we also show sub-beat position (faint).
            type Marker = { beatNum: number; x: number; isDownbeat: boolean };
            const markers: Marker[] = [];

            for (let c = pos; c < pos + cellsSpanned; c++) {
              const shifted     = (c + cycleLen - offsetCells) % cycleLen;
              const isDownbeat  = shifted % cellsPerBeat === 0;
              // For multi-cell notes: only place markers at downbeat boundaries.
              // For single-cell items: always show the beat they belong to.
              if (isDownbeat || cellsSpanned === 1) {
                const beatNum = Math.floor(shifted / cellsPerBeat) + 1;
                // x-offset within the ticker element (0 when single-cell)
                const x = cellsSpanned > 1
                  ? Math.round(((c - pos) / cellsSpanned) * width)
                  : 0;
                markers.push({ beatNum, x, isDownbeat });
              }
            }

            // Fallback: if no markers (shouldn't happen), show beat at pos
            if (markers.length === 0) {
              markers.push({ beatNum: beatNumAt(pos), x: 0, isDownbeat: false });
            }

            return (
              <View
                key={pos}
                style={[styles.beatTick, { width: tickerW, paddingLeft: tickerPL, position: 'relative' }]}
              >
                {markers.map(({ beatNum, x, isDownbeat }, mi) => {
                  const isOne = isDownbeat && beatNum === 1;
                  return (
                    <Text
                      key={mi}
                      style={[
                        styles.beatTickText,
                        isDownbeat  && styles.beatTickDownbeat,
                        isOne       && styles.beatTickTextOne,
                        markers.length > 1 && { position: 'absolute', left: x } as any,
                      ]}
                    >
                      {beatNum}
                    </Text>
                  );
                })}
              </View>
            );
          })}
        </View>
        {/* Rhythm cells */}
        <View style={styles.rhythmCellsRow}>
          {items.map(({ pos, cell, width, isBar }) => {
            const short = cell ? NOTE_VALUES.find(n => n.value === cell.noteValue)?.short ?? '' : '';
            return (
              <View key={pos} style={styles.cellWrapper}>
                {isBar && <View style={styles.barDivider} />}
                <TouchableOpacity
                  style={[styles.rhythmCell, { width }, !!cell && styles.rhythmCellFilled, !!cell && { backgroundColor: theme.accentLight }, !!cell?.syllable && styles.rhythmCellWithSyllable]}
                  onPress={() => onCellPress(line.id, pos, cell, line.text)}
                >
                  {cell ? (
                    <>
                      <Text style={[styles.rhythmLabel, { color: theme.accent }]}>{short}</Text>
                      {cell.pitch ? <Text style={[styles.rhythmSyllable, { color: theme.accentDark, fontWeight: '600' }]} numberOfLines={1}>{cell.pitch}</Text> : null}
                      {cell.syllable ? <Text style={styles.rhythmSyllable} numberOfLines={1}>{cell.syllable}</Text> : null}
                    </>
                  ) : (
                    <Text style={styles.chordPlus}>+</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Audio Layer Bar ──────────────────────────────────────────────────────────

function AudioLayerBar({
  layer,
  recording,
  isPlaying,
  onPlay,
  onDelete,
}: {
  layer: AudioLayer;
  recording: Recording | undefined;
  isPlaying: boolean;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const color = LAYER_COLORS[layer.layerType];
  return (
    <View style={[styles.layerBar, { borderLeftColor: color }]}>
      <View style={styles.layerInfo}>
        <Text style={styles.layerTitle} numberOfLines={1}>
          {recording?.title ?? 'Voice Memo'}
        </Text>
        <Text style={styles.layerMeta}>
          {layer.layerType} · {formatDuration(recording?.duration ?? 0)}
        </Text>
      </View>
      <TouchableOpacity onPress={onPlay} style={styles.layerAction}>
        <Ionicons
          name={isPlaying ? 'pause-circle' : 'play-circle'}
          size={24}
          color={color}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={styles.layerAction}>
        <Ionicons name="close-circle-outline" size={20} color="#C4BDB7" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Rhyme family dots ────────────────────────────────────────────────────────

const RHYME_COLORS = [
  '#F59E0B', '#60A5FA', '#34D399', '#F472B6',
  '#A78BFA', '#FB923C', '#2DD4BF', '#E879F9',
];

function phoneticNormalize(word: string): string {
  let w = word.toLowerCase().replace(/['']/g, '').replace(/[^a-z]/g, '');
  // Consonant clusters
  w = w.replace(/ght/g, 't');
  w = w.replace(/gh(?=[aeiou])/g, 'g');
  w = w.replace(/gh/g, '');
  w = w.replace(/ck/g, 'k');
  w = w.replace(/tch/g, 'ch');
  w = w.replace(/ph/g, 'f');
  w = w.replace(/kn/g, 'n');
  w = w.replace(/wr/g, 'r');
  w = w.replace(/mb$/g, 'm');
  w = w.replace(/mn$/g, 'm');
  w = w.replace(/que$/g, 'k');
  w = w.replace(/gue$/g, 'g');
  w = w.replace(/dge$/g, 'j');
  // Magic-E: long A (must come before generic vowel digraph rules)
  w = w.replace(/ace$/g, 'ays');   // place, face, space, race, grace
  w = w.replace(/ase$/g, 'ays');   // base, case, chase
  w = w.replace(/aze$/g, 'ayz');   // blaze, maze, gaze, phase
  w = w.replace(/ane$/g, 'ayn');   // lane, cane, sane, plane, rain→handled by ai/ay
  w = w.replace(/ale$/g, 'ayl');   // tale, pale, sale, whale
  w = w.replace(/ake$/g, 'ayk');   // lake, make, take, shake
  w = w.replace(/age$/g, 'ayj');   // age, stage, cage, rage
  w = w.replace(/ave$/g, 'ayv');   // save, gave, wave, brave
  w = w.replace(/ame$/g, 'aym');   // came, flame, name, same
  w = w.replace(/ape$/g, 'ayp');   // shape, tape, escape, drape
  w = w.replace(/ate$/g, 'ayt');   // late, fate, great, straight
  w = w.replace(/ade$/g, 'ayd');   // fade, shade, made, grade
  w = w.replace(/abe$/g, 'ayb');   // babe, maybe
  // Magic-E: long I
  w = w.replace(/ine$/g, 'iyn');   // mine, line, fine, shine, wine
  w = w.replace(/ite$/g, 'iyt');   // write, bite, kite, quite
  w = w.replace(/ive$/g, 'iyv');   // drive, alive, five, hive
  w = w.replace(/ise$/g, 'iyz');   // rise, wise, surprise, prize
  w = w.replace(/ide$/g, 'iyd');   // ride, hide, side, guide
  w = w.replace(/ile$/g, 'iyl');   // mile, smile, while, style
  w = w.replace(/ike$/g, 'iyk');   // like, spike, bike, strike
  w = w.replace(/ife$/g, 'iyf');   // life, knife, wife, strife
  w = w.replace(/ime$/g, 'iym');   // time, crime, rhyme, climb
  w = w.replace(/ice$/g, 'iys');   // nice, twice, price, dice
  // Magic-E: long O
  w = w.replace(/one$/g, 'ohn');   // stone, bone, phone, alone, throne
  w = w.replace(/ope$/g, 'ohp');   // hope, cope, scope, rope
  w = w.replace(/oke$/g, 'ohk');   // smoke, broke, spoke, joke
  w = w.replace(/ole$/g, 'ohl');   // hole, whole, role, stole
  w = w.replace(/ome$/g, 'ohm');   // home, dome, chrome, poem
  w = w.replace(/ose$/g, 'ohz');   // those, close, rose, nose
  w = w.replace(/ote$/g, 'oht');   // note, vote, wrote, quote
  w = w.replace(/ove$/g, 'ohv');   // cove, dove (bird), wove (love handled below)
  // Magic-E: long U
  w = w.replace(/une$/g, 'uun');   // tune, dune, June
  w = w.replace(/ute$/g, 'uut');   // cute, mute, flute, route
  w = w.replace(/ude$/g, 'uud');   // dude, crude, rude
  w = w.replace(/ule$/g, 'uul');   // rule, mule, cool, school
  // Vowel digraphs
  w = w.replace(/igh/g, 'iy');
  w = w.replace(/(?:ea|ee)/g, 'ee');
  w = w.replace(/(?:ai|ay)/g, 'ay');
  w = w.replace(/(?:oa|oe)/g, 'oh');
  w = w.replace(/(?:oo|ue|ew)/g, 'uu');
  w = w.replace(/ui/g, 'uu');
  w = w.replace(/ou(?=[^aeiou]|$)/g, 'ow');
  w = w.replace(/tion/g, 'shun');
  w = w.replace(/sion/g, 'zhun');
  // Irregular common words
  w = w.replace(/^love$/, 'luhv');
  w = w.replace(/^above$/, 'abuhv');
  w = w.replace(/^of$/, 'uhv');
  w = w.replace(/^come$/, 'kuhm');
  w = w.replace(/^some$/, 'suhm');
  w = w.replace(/^done$/, 'duhn');
  w = w.replace(/^gone$/, 'gohn');
  return w;
}

function getRhymePair(text: string): { exact: string | null; vowel: string | null } {
  const word = text.trim().replace(/['']/g, '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).pop() ?? '';
  if (word.length < 2) return { exact: null, vowel: null };
  const normalized = phoneticNormalize(word);
  const match = normalized.match(/[aeiouy]+[^aeiouy]*$/);
  if (!match) return { exact: null, vowel: null };
  const exact = match[0];
  const vowelOnly = exact.match(/^[aeiouy]+/)?.[0] ?? null;
  return { exact, vowel: vowelOnly };
}

function buildRhymeColorMap(allLines: { id: string; text: string }[]): Map<string, string> {
  const pairs = allLines.map(l => ({ id: l.id, ...getRhymePair(l.text) }));
  const map = new Map<string, string>();
  let colorIdx = 0;

  // Pass 1: perfect rhyme — exact vowel+consonant tail match
  const exactGroups = new Map<string, string[]>();
  for (const { id, exact } of pairs) {
    if (!exact) continue;
    if (!exactGroups.has(exact)) exactGroups.set(exact, []);
    exactGroups.get(exact)!.push(id);
  }
  for (const [, ids] of exactGroups) {
    if (ids.length < 2) continue;
    const color = RHYME_COLORS[colorIdx++ % RHYME_COLORS.length];
    for (const id of ids) map.set(id, color);
  }

  // Pass 2: slant rhyme — shared vowel sound
  // Include ALL lines (even pass-1 matches) so already-colored lines can anchor
  // unmatched slant-rhymes to the same color family (e.g. "away"+"say" amber
  // from pass 1 pulls "place" into amber here).
  const vowelGroups = new Map<string, string[]>();
  for (const { id, vowel } of pairs) {
    if (!vowel) continue;
    if (!vowelGroups.has(vowel)) vowelGroups.set(vowel, []);
    vowelGroups.get(vowel)!.push(id);
  }
  for (const [, ids] of vowelGroups) {
    const uncolored = ids.filter(id => !map.has(id));
    if (uncolored.length === 0) continue;          // nothing new to color
    if (ids.length - uncolored.length === 0 && uncolored.length < 2) continue; // solo unmatched
    // Anchor to existing color if any group member was already matched, else new color
    const anchor = ids.map(id => map.get(id)).find(c => c != null);
    const color = anchor ?? RHYME_COLORS[colorIdx++ % RHYME_COLORS.length];
    for (const id of uncolored) map.set(id, color);
  }

  return map;
}

// ─── Syllable counter ─────────────────────────────────────────────────────────

function countSyllables(text: string): number {
  const words = text.trim().toLowerCase().replace(/[^a-z'\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return words.reduce((total, word) => {
    word = word.replace(/e$/, '').replace(/[^aeiouy]/g, ' ').trim();
    const count = (word.match(/[aeiouy]+/g) ?? []).length;
    return total + Math.max(1, count);
  }, 0);
}

// ─── Line Row ─────────────────────────────────────────────────────────────────

function LineRow({
  line,
  theme,
  autoFocus,
  recordingsMap,
  playingLayerId,
  features,
  onCellPress,
  onRhythmCellPress,
  onAddLayer,
  onPlayLayer,
  onNewLine,
  onDelete,
  onDragStart,
  isDragOver,
  rhymeColor,
  lineNumber,
  indicators,
}: {
  line: Line;
  theme: BgTheme;
  autoFocus?: boolean;
  recordingsMap: Map<string, Recording>;
  playingLayerId: string | null;
  features: EditorFeatures;
  onCellPress: CellPressHandler;
  onRhythmCellPress: RhythmCellPressHandler;
  onAddLayer: (lineId: string) => void;
  onPlayLayer: (layer: AudioLayer, filePath: string) => void;
  onNewLine: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  isDragOver: boolean;
  rhymeColor?: string;
  lineNumber: number;
  indicators: EditorIndicators;
}) {
  const [text, setText] = useState(line.text);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<any>(null);
  const handleRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const { updateLine, audioLayers, loadAudioLayers, deleteAudioLayer } = useSongsStore();

  useEffect(() => { setText(line.text); }, [line.id]);
  useEffect(() => { loadAudioLayers(line.id); }, [line.id]);

  // Focus input imperatively — autoFocus prop only fires on mount
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocus]);

  // Backspace on empty line deletes it
  useEffect(() => {
    const el = inputRef.current;
    if (!el || typeof document === 'undefined') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Backspace' && text === '' && !e.repeat) {
        e.preventDefault();
        onDelete();
      }
    }
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [text, onDelete]);

  // Stamp data-line-id so SectionBlock's mousemove can identify which row is under cursor
  useEffect(() => {
    if (rowRef.current) rowRef.current.setAttribute?.('data-line-id', line.id);
  }, [line.id]);

  // Handle mousedown on handle: tell SectionBlock a drag is starting
  useEffect(() => {
    const el = handleRef.current;
    if (!el || typeof document === 'undefined') return;
    let didDrag = false;
    function onMouseDown(e: MouseEvent) {
      e.preventDefault(); // prevent text selection during drag
      didDrag = false;
      onDragStart();
    }
    function onClick(e: MouseEvent) {
      if (!didDrag) { e.stopPropagation(); setMenuOpen(v => !v); }
    }
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('click', onClick);
    };
  }, [onDragStart]);

  function handleBlur() {
    if (text !== line.text) updateLine(line.id, { text });
  }

  const layers = audioLayers[line.id] ?? [];
  const showHandle = hovered || menuOpen;

  return (
    <View
      ref={rowRef}
      style={[styles.lineRow, isDragOver && styles.lineRowDragOver, !indicators.dividers && { borderTopWidth: 0 }]}
      // @ts-ignore — web only
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {/* Line number */}
      {indicators.lineNumbers && <Text style={styles.lineNumber}>{lineNumber}</Text>}

      {/* Left handle — always occupies space, opacity-only toggle */}
      <View style={styles.lineHandleArea}>
        <View
          ref={handleRef}
          style={[styles.lineMenuBtn, { opacity: showHandle ? 1 : 0, cursor: 'grab' } as any]}
        >
          <Ionicons name="menu-outline" size={15} color="#C4BDB7" />
        </View>
        {menuOpen && (
          <>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
            <View style={styles.lineMenu}>
              <TouchableOpacity
                style={styles.lineMenuItem}
                onPress={() => { setMenuOpen(false); onDelete(); }}
              >
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <Text style={styles.lineMenuItemTextDanger}>Delete line</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={{ flex: 1 }}>
        {features.rhythm && <RhythmGrid line={line} onCellPress={onRhythmCellPress} />}
        {features.chords && <ChordGrid line={line} onCellPress={onCellPress} />}
        <View style={styles.lyricRow}>
          <TextInput
            ref={inputRef}
            style={[styles.lyricInput, { color: theme.lyricColor, flex: 1 }]}
            value={text}
            onChangeText={setText}
            onBlur={handleBlur}
            placeholder="Add a lyric line..."
            placeholderTextColor={theme.placeholderColor}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={onNewLine}
          />
          <TouchableOpacity
            style={[styles.lineMicBtn, { opacity: features.audio ? 1 : 0 }]}
            onPress={() => features.audio && onAddLayer(line.id)}
            activeOpacity={features.audio ? 0.7 : 1}
          >
            <Ionicons name="mic-outline" size={16} color="#C4BDB7" />
          </TouchableOpacity>
          {indicators.syllables && text.trim().length > 0 && (
            <Text style={styles.syllableCount}>{countSyllables(text)}</Text>
          )}
          {indicators.rhymes && rhymeColor && (
            <View style={[styles.rhymeDot, { backgroundColor: rhymeColor }]} />
          )}
        </View>
        {features.audio && layers.map(layer => (
          <AudioLayerBar
            key={layer.id}
            layer={layer}
            recording={recordingsMap.get(layer.recordingId)}
            isPlaying={playingLayerId === layer.id}
            onPlay={() => {
              const rec = recordingsMap.get(layer.recordingId);
              if (rec) onPlayLayer(layer, rec.filePath);
            }}
            onDelete={() => deleteAudioLayer(layer.id, layer.lineId)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  theme,
  isDragging,
  dragY,
  onLayout,
  onDragStart,
  onDragMove,
  onDragEnd,
  recordingsMap,
  playingLayerId,
  features,
  onCellPress,
  onRhythmCellPress,
  onAddLayer,
  onPlayLayer,
  onDelete,
  onMoveUp,
  onMoveDown,
  rhymeColorMap,
  lineNumberMap,
  indicators,
}: {
  section: Section;
  theme: BgTheme;
  isDragging: boolean;
  dragY: Animated.Value;
  onLayout: (id: string, height: number) => void;
  onDragStart: (id: string) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  recordingsMap: Map<string, Recording>;
  playingLayerId: string | null;
  features: EditorFeatures;
  onCellPress: CellPressHandler;
  onRhythmCellPress: RhythmCellPressHandler;
  onAddLayer: (lineId: string) => void;
  onPlayLayer: (layer: AudioLayer, filePath: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  rhymeColorMap: Map<string, string>;
  lineNumberMap: Map<string, number>;
  indicators: EditorIndicators;
}) {
  const { lines, addLine, deleteLine, reorderLines, updateSection, audioLayers, loadAudioLayers, deleteAudioLayer } = useSongsStore();
  const { theme: appTheme } = useThemeStore();
  const sectionLines = lines[section.id] ?? [];
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState(section.label);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const draggingLineIdRef = useRef<string | null>(null);

  // Line drag: mousemove/mouseup on document + a floating DOM ghost for visual feedback
  function startLineDrag(lineId: string) {
    draggingLineIdRef.current = lineId;
    setDraggingLineId(lineId);

    // Clone the actual row DOM node as the drag ghost
    const originalEl = document.querySelector(`[data-line-id="${lineId}"]`) as HTMLElement | null;
    const rect = originalEl?.getBoundingClientRect();
    const ghost = (originalEl?.cloneNode(true) as HTMLElement) ?? document.createElement('div');
    const ghostNum = ghost.firstElementChild as HTMLElement | null;
    if (ghostNum) ghostNum.style.visibility = 'hidden';
    Object.assign(ghost.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '9999',
      width: rect ? `${rect.width}px` : '100%',
      left: rect ? `${rect.left}px` : '0',
      top: rect ? `${rect.top}px` : '0',
      margin: '0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
      borderRadius: '6px',
      opacity: '0.95',
      background: '#fff',
    });
    if (originalEl) originalEl.style.opacity = '0.3';
    document.body.appendChild(ghost);

    const initialTop = rect?.top ?? 0;

    function onMouseMove(e: MouseEvent) {
      if (rect) ghost.style.top = `${initialTop + (e.clientY - (rect.top + rect.height / 2))}px`;

      // Hide ghost temporarily so elementFromPoint hits the row underneath
      ghost.style.visibility = 'hidden';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.visibility = 'visible';
      const row = el?.closest?.('[data-line-id]');
      const overId = row?.getAttribute('data-line-id') ?? null;
      setDragOverLineId(overId !== lineId ? overId : null);
    }

    function onMouseUp() {
      ghost.remove();
      if (originalEl) originalEl.style.opacity = '';
      const fromId = draggingLineIdRef.current;
      setDragOverLineId(prev => {
        if (fromId && prev && fromId !== prev) {
          const ids = (lines[section.id] ?? []).map(l => l.id);
          const fromIdx = ids.indexOf(fromId);
          const toIdx = ids.indexOf(prev);
          if (fromIdx !== -1 && toIdx !== -1) {
            ids.splice(fromIdx, 1);
            const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
            ids.splice(adjustedTo, 0, fromId);
            reorderLines(section.id, ids);
          }
        }
        return null;
      });
      draggingLineIdRef.current = null;
      setDraggingLineId(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  const sectionId = section.id;
  const callbacksRef = useRef({ onDragStart, onDragMove, onDragEnd });
  useEffect(() => { callbacksRef.current = { onDragStart, onDragMove, onDragEnd }; });

  useEffect(() => { setLabelText(section.label); }, [section.label]);
  useEffect(() => { loadAudioLayers(section.id); }, [section.id]);

  const sectionLayers = audioLayers[section.id] ?? [];

  function saveLabel() {
    setEditingLabel(false);
    const trimmed = labelText.trim();
    if (trimmed && trimmed !== section.label) {
      updateSection(section.id, { label: trimmed });
    } else {
      setLabelText(section.label);
    }
  }

  function startSectionDrag(e: any) {
    if (Platform.OS !== 'web') return;
    e.preventDefault?.();
    const startY = e.clientY;
    callbacksRef.current.onDragStart(sectionId);
    function onMouseMove(ev: MouseEvent) {
      callbacksRef.current.onDragMove(ev.clientY - startY);
    }
    function onMouseUp() {
      callbacksRef.current.onDragEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return (
    <Animated.View
      style={[
        features.boxes ? styles.sectionBlock : styles.sectionBlockFlat,
        features.boxes
          ? { borderColor: section.color.outline, backgroundColor: theme.cardBg }
          : { marginBottom: 28 },
        isDragging && styles.sectionBlockDragging,
        isDragging && { transform: [{ translateY: dragY }] },
      ]}
      onLayout={e => onLayout(section.id, e.nativeEvent.layout.height)}
    >
      {features.boxes ? (
        <View style={styles.sectionHeader}>
          {/* ⋮ handle area — same pattern as line rows */}
          <View
            style={styles.sectionHandleArea}
            // @ts-ignore
            onMouseEnter={() => setHeaderHovered(true)}
            onMouseLeave={() => { setHeaderHovered(false); setHeaderMenuOpen(false); }}
          >
            <TouchableOpacity
              style={[styles.lineMenuBtn, { opacity: (headerHovered || headerMenuOpen) ? 1 : 0 }]}
              onPress={() => setHeaderMenuOpen(v => !v)}
            >
              <Ionicons name="ellipsis-vertical" size={14} color="#C4BDB7" />
            </TouchableOpacity>
            {headerMenuOpen && (
              <>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setHeaderMenuOpen(false)} />
                <View style={styles.lineMenu}>
                  {onMoveUp && (
                    <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onMoveUp(); }}>
                      <Ionicons name="arrow-up-outline" size={14} color="#6B6560" />
                      <Text style={styles.lineMenuItemText}>Move up</Text>
                    </TouchableOpacity>
                  )}
                  {onMoveDown && (
                    <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onMoveDown(); }}>
                      <Ionicons name="arrow-down-outline" size={14} color="#6B6560" />
                      <Text style={styles.lineMenuItemText}>Move down</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onDelete(); }}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    <Text style={styles.lineMenuItemTextDanger}>Delete section</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          <View
            style={[styles.dragHandle, { cursor: 'grab' } as any]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            // @ts-ignore
            onMouseDown={startSectionDrag}
          >
            <Ionicons name="reorder-three" size={20} color={isDragging ? appTheme.accent : '#C4BDB7'} />
          </View>
          {editingLabel ? (
            <TextInput
              style={[styles.sectionLabelText, { color: section.color.label, flex: 1 }]}
              value={labelText}
              onChangeText={setLabelText}
              onBlur={saveLabel}
              onSubmitEditing={saveLabel}
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
            />
          ) : (
            <TouchableOpacity onPress={() => setEditingLabel(true)} style={{ flex: 1 }}>
              <Text style={[styles.sectionLabelText, { color: section.color.label }]}>
                {section.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sectionMicBtn, { opacity: features.audio ? 1 : 0 }]}
            onPress={() => features.audio && onAddLayer(section.id)}
            activeOpacity={features.audio ? 0.7 : 1}
          >
            <Ionicons name="mic-outline" size={14} color={section.color.label + 'AA'} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* ⋮ handle area */}
          <View
            style={styles.sectionHandleArea}
            // @ts-ignore
            onMouseEnter={() => setHeaderHovered(true)}
            onMouseLeave={() => { setHeaderHovered(false); setHeaderMenuOpen(false); }}
          >
            <TouchableOpacity
              style={[styles.lineMenuBtn, { opacity: (headerHovered || headerMenuOpen) ? 1 : 0 }]}
              onPress={() => setHeaderMenuOpen(v => !v)}
            >
              <Ionicons name="ellipsis-vertical" size={14} color="#C4BDB7" />
            </TouchableOpacity>
            {headerMenuOpen && (
              <>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setHeaderMenuOpen(false)} />
                <View style={styles.lineMenu}>
                  {onMoveUp && (
                    <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onMoveUp(); }}>
                      <Ionicons name="arrow-up-outline" size={14} color="#6B6560" />
                      <Text style={styles.lineMenuItemText}>Move up</Text>
                    </TouchableOpacity>
                  )}
                  {onMoveDown && (
                    <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onMoveDown(); }}>
                      <Ionicons name="arrow-down-outline" size={14} color="#6B6560" />
                      <Text style={styles.lineMenuItemText}>Move down</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.lineMenuItem} onPress={() => { setHeaderMenuOpen(false); onDelete(); }}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    <Text style={styles.lineMenuItemTextDanger}>Delete section</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          <Text style={[styles.sectionLabelFlat, { color: theme.labelColor + '88', flex: 1 }]}>
            {section.label.toUpperCase()}
          </Text>
          <TouchableOpacity
            style={[styles.sectionMicBtn, { opacity: features.audio ? 1 : 0 }]}
            onPress={() => features.audio && onAddLayer(section.id)}
            activeOpacity={features.audio ? 0.7 : 1}
          >
            <Ionicons name="mic-outline" size={14} color="#C4BDB7" />
          </TouchableOpacity>
        </View>
      )}
      {features.audio && sectionLayers.map(layer => (
        <AudioLayerBar
          key={layer.id}
          layer={layer}
          recording={recordingsMap.get(layer.recordingId)}
          isPlaying={playingLayerId === layer.id}
          onPlay={() => {
            const rec = recordingsMap.get(layer.recordingId);
            if (rec) onPlayLayer(layer, rec.filePath);
          }}
          onDelete={() => deleteAudioLayer(layer.id, section.id)}
        />
      ))}
      {sectionLines.map(line => (
        <LineRow
          key={line.id}
          line={line}
          theme={theme}
          autoFocus={focusLineId === line.id}
          recordingsMap={recordingsMap}
          playingLayerId={playingLayerId}
          features={features}
          onCellPress={onCellPress}
          onRhythmCellPress={onRhythmCellPress}
          onAddLayer={onAddLayer}
          onPlayLayer={onPlayLayer}
          onNewLine={() => {
            const idx = sectionLines.findIndex(l => l.id === line.id);
            const nextLine = sectionLines[idx + 1];
            if (nextLine) {
              setFocusLineId(nextLine.id);
            } else {
              const newLine = addLine(section.id);
              setFocusLineId(newLine.id);
            }
          }}
          onDelete={() => {
            if (sectionLines.length <= 1) return;
            const idx = sectionLines.findIndex(l => l.id === line.id);
            const prevLine = sectionLines[idx - 1];
            deleteLine(line.id);
            if (prevLine) {
              setTimeout(() => {
                const prevRow = document.querySelector(`[data-line-id="${prevLine.id}"]`);
                const input = prevRow?.querySelector('input, textarea') as HTMLInputElement | null;
                if (input) {
                  input.focus();
                  input.setSelectionRange(input.value.length, input.value.length);
                }
              }, 30);
            }
          }}
          onDragStart={() => startLineDrag(line.id)}
          isDragOver={
            dragOverLineId === line.id &&
            draggingLineId !== line.id &&
            sectionLines[sectionLines.findIndex(l => l.id === draggingLineId) + 1]?.id !== line.id
          }
          rhymeColor={rhymeColorMap.get(line.id)}
          lineNumber={lineNumberMap.get(line.id) ?? 0}
          indicators={indicators}
        />
      ))}
      {features.boxes && (
        <TouchableOpacity style={styles.addLineButton} onPress={() => {
          const newLine = addLine(section.id);
          setFocusLineId(newLine.id);
        }}>
          <Ionicons name="add" size={13} color="#A09990" />
          <Text style={styles.addLineText}>Add line</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Chord Picker Modal ───────────────────────────────────────────────────────

const ROOT_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const QUALITIES = [
  { label: 'Major', value: '' }, { label: 'Minor', value: 'm' },
  { label: 'maj7', value: 'maj7' }, { label: 'm7', value: 'm7' },
  { label: '7', value: '7' }, { label: 'sus2', value: 'sus2' },
  { label: 'sus4', value: 'sus4' }, { label: 'dim', value: 'dim' },
  { label: 'aug', value: 'aug' }, { label: 'add9', value: 'add9' },
];

function ChordPickerModal({
  target, onConfirm, onClear, onClose,
}: {
  target: ChordPickerTarget | null;
  onConfirm: (root: string, quality: string, duration: NoteValue | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const [root, setRoot] = useState('C');
  const [quality, setQuality] = useState('');
  const [duration, setDuration] = useState<NoteValue | null>(null);

  useEffect(() => {
    if (target) {
      setRoot(target.existing?.root ?? 'C');
      setQuality(target.existing?.quality ?? '');
      setDuration(target.existing?.duration ?? null);
    }
  }, [target]);

  return (
    <Modal visible={!!target} transparent animationType="fade">
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
          <View style={styles.pickerHeaderRow}>
            <Text style={styles.pickerTitle}>Chord</Text>
            <Text style={[styles.chordPreview, { color: theme.accent }]}>{`${root}${quality}` || '—'}</Text>
          </View>
          <View style={styles.noteGrid}>
            {ROOT_NOTES.map(n => (
              <TouchableOpacity key={n} style={[styles.noteCell, root === n && styles.noteCellActive, root === n && { backgroundColor: theme.accentLight, borderColor: theme.accent }]} onPress={() => setRoot(n)}>
                <Text style={[styles.noteCellText, root === n && { color: theme.accent }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.qualityGrid}>
            {QUALITIES.map(q => (
              <TouchableOpacity key={q.value} style={[styles.qualityChip, quality === q.value && styles.qualityChipActive, quality === q.value && { backgroundColor: theme.accentLight, borderColor: theme.accent }]} onPress={() => setQuality(q.value)}>
                <Text style={[styles.qualityText, quality === q.value && { color: theme.accent }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Duration row */}
          <View style={styles.durationRow}>
            {NOTE_VALUES.map(nv => (
              <TouchableOpacity
                key={nv.value}
                style={[styles.durationChip, duration === nv.value && styles.durationChipActive, duration === nv.value && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                onPress={() => setDuration(d => d === nv.value ? null : nv.value)}
              >
                <Text style={[styles.durationChipText, duration === nv.value && { color: theme.accent, fontWeight: '600' }]}>
                  {nv.short}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.pickerActions}>
            {target?.existing && (
              <TouchableOpacity style={styles.clearButton} onPress={onClear}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.confirmButton, { backgroundColor: theme.accent }]} onPress={() => onConfirm(root, quality, duration)}>
              <Text style={styles.confirmButtonText}>Set Chord</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Lyric Selector ───────────────────────────────────────────────────────────

function LyricSelector({ text, value, onChange }: {
  text: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const { theme } = useThemeStore();
  const chars = useMemo(() => text.split(''), [text]);

  const [selStart, setSelStart] = useState(-1);
  const [selEnd,   setSelEnd]   = useState(-1);
  const selRef = useRef({ start: -1, end: -1 });
  const [hoverPos, setHoverPos] = useState<{ x: number; top: number; height: number } | null>(null);

  // Character bounding boxes relative to the container (filled by each char's onLayout)
  const charLayouts = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const containerRef = useRef<View>(null);

  // Native only — absolute page position (not needed on web)
  const containerX = useRef(0);
  const containerY = useRef(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const id = setTimeout(() => {
      containerRef.current?.measureInWindow((px, py) => {
        containerX.current = px;
        containerY.current = py;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [text]);

  // Native drag bookkeeping
  const dragMode      = useRef<'create' | 'move' | 'left-handle' | 'right-handle'>('create');
  const dragAnchorIdx = useRef(0);
  const dragStartSel  = useRef({ start: -1, end: -1 });

  // Initialise highlight from existing syllable (only when value comes from outside, not from our own drag)
  useEffect(() => {
    if (!value || !chars.length) {
      if (selRef.current.start >= 0) {
        selRef.current = { start: -1, end: -1 };
        setSelStart(-1); setSelEnd(-1);
      }
      return;
    }
    // If our current selection already produces this value, leave it alone (drag in progress)
    const { start, end } = selRef.current;
    if (start >= 0 && text.slice(start, end + 1).trim() === value) return;
    // Otherwise sync from parent (initial open with existing syllable)
    const idx = text.indexOf(value);
    if (idx >= 0) {
      selRef.current = { start: idx, end: idx + value.length - 1 };
      setSelStart(idx); setSelEnd(idx + value.length - 1); return;
    }
    selRef.current = { start: -1, end: -1 };
    setSelStart(-1); setSelEnd(-1);
  }, [value, text]);

  function updateSel(s: number, e: number) {
    let start = Math.max(0, Math.min(s, chars.length - 1));
    let end   = Math.max(start, Math.min(e, chars.length - 1));
    // Auto-trim trailing spaces from the selection end
    while (end > start && chars[end] === ' ') end--;
    // Auto-trim leading spaces from the selection start
    while (start < end && chars[start] === ' ') start++;
    // If the whole selection is just a space, don't highlight anything
    if (chars[start] === ' ') { clearSel(); return; }
    selRef.current = { start, end };
    setSelStart(start); setSelEnd(end);
    onChange(text.slice(start, end + 1));
  }

  function clearSel() {
    selRef.current = { start: -1, end: -1 };
    setSelStart(-1); setSelEnd(-1); onChange('');
  }

  // Find nearest char from container-relative coords (works for both web and native)
  function charIdxFromRel(rx: number, ry: number): number {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < charLayouts.current.length; i++) {
      const l = charLayouts.current[i];
      if (!l) continue;
      const d = Math.abs(rx - (l.x + l.w / 2)) + Math.abs(ry - (l.y + l.h / 2));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  const HSLOP = 22;

  function detectModeFromRel(rx: number, ry: number): typeof dragMode.current {
    const { start, end } = selRef.current;
    if (start < 0) return 'create';
    const lL = charLayouts.current[start];
    const rL = charLayouts.current[end];
    if (!lL || !rL) return 'create';
    const charH = lL.h;

    // Left handle zone: generous band around the left edge
    if (rx >= lL.x - HSLOP && rx <= lL.x + HSLOP
        && ry >= lL.y - charH * 0.5 && ry <= lL.y + charH * 1.5)
      return 'left-handle';

    // Right handle zone: generous band around the right edge
    if (rx >= rL.x + rL.w - HSLOP && rx <= rL.x + rL.w + HSLOP
        && ry >= rL.y - charH * 0.5 && ry <= rL.y + charH * 1.5)
      return 'right-handle';

    // Move: only if spatially over the highlighted text (not just same row)
    const singleRow = Math.abs(lL.y - rL.y) < charH * 0.5;
    if (singleRow) {
      if (ry >= lL.y - 4 && ry <= lL.y + charH + 4
          && rx >= lL.x - 4 && rx <= rL.x + rL.w + 4)
        return 'move';
    } else {
      const onStartRow = Math.abs(ry - lL.y) < charH && rx >= lL.x - 4;
      const onEndRow   = Math.abs(ry - rL.y) < charH && rx <= rL.x + rL.w + 4;
      const midRow     = ry > lL.y + charH * 0.5 && ry < rL.y + charH * 0.5;
      if (onStartRow || midRow || onEndRow) return 'move';
    }
    return 'create';
  }

  // ── Web: raw mouse events (PanResponder move events are unreliable on web) ──

  function handleWebMouseDown(e: any) {
    e.preventDefault();
    const rect     = e.currentTarget.getBoundingClientRect();
    const cLeft    = rect.left;
    const cTop     = rect.top;
    const rx0      = e.clientX - cLeft;
    const ry0      = e.clientY - cTop;
    const mode     = detectModeFromRel(rx0, ry0);
    const anchor   = charIdxFromRel(rx0, ry0);
    const startSel = { ...selRef.current };

    // For a fresh selection, clear any existing pill but don't highlight anything yet —
    // the pill only appears once the drag moves away from the anchor character.
    if (mode === 'create' && selRef.current.start >= 0) clearSel();

    function onMove(me: MouseEvent) {
      const rx  = me.clientX - cLeft;
      const ry  = me.clientY - cTop;
      const idx = charIdxFromRel(rx, ry);
      if (mode === 'create') {
        if (idx !== anchor) {
          updateSel(Math.min(anchor, idx), Math.max(anchor, idx));
        } else {
          clearSel(); // dragged back to anchor — collapse the selection
        }
      } else if (mode === 'left-handle') {
        updateSel(Math.min(idx, selRef.current.end), selRef.current.end);
      } else if (mode === 'right-handle') {
        updateSel(selRef.current.start, Math.max(idx, selRef.current.start));
      } else if (mode === 'move') {
        const len   = startSel.end - startSel.start;
        const delta = idx - anchor;
        const ns    = Math.max(0, Math.min(chars.length - 1 - len, startSel.start + delta));
        updateSel(ns, ns + len);
      }
    }

    function onUp() {
      (document as any).removeEventListener('mousemove', onMove);
      (document as any).removeEventListener('mouseup',   onUp);
    }

    (document as any).addEventListener('mousemove', onMove);
    (document as any).addEventListener('mouseup',   onUp);
  }

  function handleWebMouseMove(e: any) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx   = e.clientX - rect.left;
    const ry   = e.clientY - rect.top;
    // Only show cursor when clicking here would start a fresh selection
    const mode = detectModeFromRel(rx, ry);
    if (mode !== 'create') { setHoverPos(null); return; }
    // Snap to the left edge of the nearest character; derive vertical pos from its layout
    const idx    = charIdxFromRel(rx, ry);
    const layout = charLayouts.current[idx];
    if (!layout) { setHoverPos(null); return; }
    const inset = 5;
    // Use the actual mouse X so the hairline sits exactly where the pointer is
    setHoverPos({ x: rx, top: layout.y + inset, height: layout.h - inset * 2 });
  }

  // ── Native: PanResponder ──────────────────────────────────────────────────

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,

    onPanResponderGrant: (e) => {
      const rx = e.nativeEvent.pageX - containerX.current;
      const ry = e.nativeEvent.pageY - containerY.current;
      const mode = detectModeFromRel(rx, ry);
      dragMode.current      = mode;
      dragStartSel.current  = { ...selRef.current };
      dragAnchorIdx.current = charIdxFromRel(rx, ry);
      if (mode === 'create') updateSel(dragAnchorIdx.current, dragAnchorIdx.current);
    },

    onPanResponderMove: (e) => {
      const rx   = e.nativeEvent.pageX - containerX.current;
      const ry   = e.nativeEvent.pageY - containerY.current;
      const idx  = charIdxFromRel(rx, ry);
      const mode = dragMode.current;
      if (mode === 'create') {
        updateSel(Math.min(dragAnchorIdx.current, idx), Math.max(dragAnchorIdx.current, idx));
      } else if (mode === 'left-handle') {
        updateSel(Math.min(idx, selRef.current.end), selRef.current.end);
      } else if (mode === 'right-handle') {
        updateSel(selRef.current.start, Math.max(idx, selRef.current.start));
      } else if (mode === 'move') {
        const { start, end } = dragStartSel.current;
        const len   = end - start;
        const delta = idx - dragAnchorIdx.current;
        const ns    = Math.max(0, Math.min(chars.length - 1 - len, start + delta));
        updateSel(ns, ns + len);
      }
    },

    onPanResponderRelease:   () => {},
    onPanResponderTerminate: () => {},
  })).current;

  if (!chars.length) {
    return <Text style={styles.lyricSelectorEmpty}>Add lyrics to this line to map syllables.</Text>;
  }

  const gestureProps = Platform.OS === 'web'
    ? { onMouseDown: handleWebMouseDown, onMouseMove: handleWebMouseMove, onMouseLeave: () => setHoverPos(null) }
    : pan.panHandlers;

  return (
    <View style={styles.lyricSelectorWrap}>
      <Text style={styles.syllablePickerLabel}>Syllable — drag to select</Text>
      <View style={styles.lyricSelectorBox}>
      <View
        ref={containerRef}
        style={[styles.lyricSelectorRow, Platform.OS === 'web' && { cursor: 'default' } as any]}
        {...gestureProps}
      >
        {chars.map((char, i) => {
          const isSel   = selStart >= 0 && i >= selStart && i <= selEnd;
          const isFirst = i === selStart && selStart >= 0;
          const isLast  = i === selEnd   && selEnd   >= 0;
          return (
            <View
              key={i}
              onLayout={e => {
                const { x, y, width: w, height: h } = e.nativeEvent.layout;
                charLayouts.current[i] = { x, y, w, h };
              }}
              style={[
                styles.lyricChar,
                isSel && styles.lyricCharSel,
                isSel && { backgroundColor: theme.accentLight },
                isFirst && isLast  && styles.lyricCharPillSingle,
                isFirst && !isLast && styles.lyricCharPillL,
                !isFirst && isLast && styles.lyricCharPillR,
                !isFirst && !isLast && isSel && styles.lyricCharPillM,
              ]}
            >
              {isFirst && <View style={[styles.selHandleL, { backgroundColor: theme.accent }]} />}
              <Text style={[styles.lyricCharText, isSel && styles.lyricCharTextSel]}>{char}</Text>
              {isLast  && <View style={[styles.selHandleR, { backgroundColor: theme.accent }]} />}
            </View>
          );
        })}
        {/* Container-level hover cursor — snapped to char left edge, aligned with text height */}
        {Platform.OS === 'web' && hoverPos !== null && (
          <View style={[styles.hoverCursor, { left: hoverPos.x, top: hoverPos.top, height: hoverPos.height, backgroundColor: `${theme.accent}88` }]} pointerEvents="none" />
        )}
      </View>
      </View>{/* lyricSelectorBox */}
      {selStart >= 0 && (
        <TouchableOpacity onPress={clearSel} style={styles.lyricClearSel}>
          <Text style={styles.lyricClearSelText}>✕  clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Note Value Picker Modal ──────────────────────────────────────────────────

type RhythmPickerTarget = {
  lineId: string;
  position: number;
  existingNoteValue: NoteValue | null;
  existingSyllable: string | null;
  existingPitch: string | null;
  lineText: string;
};

function NoteValuePickerModal({
  target, onConfirm, onConfirmNext, onClear, onClose,
}: {
  target: RhythmPickerTarget | null;
  onConfirm: (noteValue: NoteValue, syllable: string | null, pitch: string | null) => void;
  /** commit this note, then advance the picker to the next cell */
  onConfirmNext: (noteValue: NoteValue, syllable: string | null, pitch: string | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const PITCH_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const PITCH_OCTAVES = [2, 3, 4, 5, 6];

  const [selected, setSelected] = useState<NoteValue>('quarter');
  const [modifier, setModifier] = useState<NoteModifier>(null);
  const [syllable, setSyllable] = useState('');
  const [pitchNote, setPitchNote] = useState<string | null>(null);
  const [pitchOctave, setPitchOctave] = useState(4);

  useEffect(() => {
    if (target) {
      if (target.existingNoteValue) {
        const { base, mod } = splitNoteValue(target.existingNoteValue);
        setSelected(base);
        setModifier(mod);
      }
      // Empty cell: keep the current note value + pitch so "Set + next" flows —
      // melodies repeat durations far more often than they change them.
      setSyllable(target.existingSyllable ?? '');
      if (target.existingPitch) {
        const match = target.existingPitch.match(/^([A-G]#?)(\d)$/);
        if (match) { setPitchNote(match[1]); setPitchOctave(parseInt(match[2])); }
        else { setPitchNote(null); setPitchOctave(4); }
      }
    }
  }, [target]);

  const effectiveValue = applyModifier(selected, modifier);

  return (
    <Modal visible={!!target} transparent animationType="fade">
      {/* Separate backdrop from content so drags inside the box never hit onClose */}
      <View style={styles.pickerOverlay} pointerEvents="box-none">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.pickerBox, { paddingBottom: 16 }]}>
          <Text style={styles.pickerTitle}>Note Value</Text>
          {/* Base note chips */}
          <View style={styles.noteValueGrid}>
            {BASE_NOTE_VALUES.map(nv => {
              const isActive = selected === nv.value;
              const modSuffix = modifier === 'dotted' ? '·' : modifier === 'triplet' ? '³' : '';
              const unavailable = modifier === 'dotted' && !DOTTED_MAP[nv.value]
                                || modifier === 'triplet' && !TRIPLET_MAP[nv.value];
              return (
                <TouchableOpacity
                  key={nv.value}
                  style={[styles.noteValueChip, isActive && styles.noteValueChipActive, isActive && { backgroundColor: theme.accentLight, borderColor: theme.accent }, unavailable && styles.noteValueChipDim]}
                  onPress={() => !unavailable && setSelected(nv.value)}
                  activeOpacity={unavailable ? 1 : 0.7}
                >
                  <Text style={[styles.noteValueShort, isActive && { color: theme.accent }, unavailable && styles.noteValueShortDim]}>
                    {nv.short}{modSuffix}
                  </Text>
                  <Text style={[styles.noteValueLabel, isActive && { color: theme.accent }, unavailable && styles.noteValueLabelDim]}>
                    {nv.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Modifier toggles */}
          <View style={styles.noteModifierRow}>
            <Text style={styles.noteModifierLabel}>Modify:</Text>
            {([
              { key: 'dotted',  symbol: '·', label: 'Dotted'  },
              { key: 'triplet', symbol: '³', label: 'Triplet' },
            ] as { key: NoteModifier; symbol: string; label: string }[]).map(m => (
              <TouchableOpacity
                key={m.key!}
                style={[styles.noteModifierChip, modifier === m.key && styles.noteModifierChipActive, modifier === m.key && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                onPress={() => setModifier(prev => prev === m.key ? null : m.key)}
              >
                <Text style={[styles.noteModifierSymbol, modifier === m.key && { color: theme.accent }]}>
                  {m.symbol}
                </Text>
                <Text style={[styles.noteModifierChipLabel, modifier === m.key && { color: theme.accent, fontWeight: '600' }]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <LyricSelector
            text={target?.lineText ?? ''}
            value={syllable}
            onChange={setSyllable}
          />

          {/* Pitch picker */}
          <Text style={[styles.noteModifierLabel, { marginTop: 12, marginBottom: 6 }]}>Pitch (optional)</Text>
          <View style={styles.noteValueGrid}>
            {PITCH_NOTES.map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.noteValueChip, pitchNote === n && styles.noteValueChipActive, pitchNote === n && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                onPress={() => setPitchNote(prev => prev === n ? null : n)}
              >
                <Text style={[styles.noteValueShort, pitchNote === n && { color: theme.accent }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {pitchNote && (
            <View style={[styles.noteModifierRow, { marginTop: 6 }]}>
              <Text style={styles.noteModifierLabel}>Oct:</Text>
              {PITCH_OCTAVES.map(o => (
                <TouchableOpacity
                  key={o}
                  style={[styles.noteModifierChip, pitchOctave === o && styles.noteModifierChipActive, pitchOctave === o && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                  onPress={() => setPitchOctave(o)}
                >
                  <Text style={[styles.noteModifierChipLabel, pitchOctave === o && { color: theme.accent, fontWeight: '600' }]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.pickerActions}>
            {target?.existingNoteValue && (
              <TouchableOpacity style={styles.clearButton} onPress={onClear}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.confirmButton, { backgroundColor: theme.accent }]} onPress={() => onConfirm(effectiveValue, syllable.trim() || null, pitchNote ? `${pitchNote}${pitchOctave}` : null)}>
              <Text style={styles.confirmButtonText}>Set</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: theme.accentDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}
              onPress={() => onConfirmNext(effectiveValue, syllable.trim() || null, pitchNote ? `${pitchNote}${pitchOctave}` : null)}
            >
              <Text style={styles.confirmButtonText}>Set + next</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Wheel Picker ─────────────────────────────────────────────────────────────

const WHEEL_ITEM_H = 34;
const WHEEL_VISIBLE = 3;

function WheelPicker({ items, selectedIndex, onSelect }: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const { theme } = useThemeStore();

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_H, animated: false });
    }, 50);
  }, [selectedIndex]);

  return (
    <View style={wheelStyles.container}>
      {/* selection highlight */}
      <View style={[wheelStyles.highlight, { borderColor: theme.accent + '55' }]} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        style={{ height: WHEEL_ITEM_H * WHEEL_VISIBLE }}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H }}
      >
        {items.map((item, i) => {
          const active = i === selectedIndex;
          return (
            <TouchableOpacity
              key={item}
              style={wheelStyles.item}
              onPress={() => {
                onSelect(i);
                scrollRef.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated: true });
              }}
              activeOpacity={0.7}
            >
              <Text style={[wheelStyles.itemText, active && { color: theme.accent, fontWeight: '600' }]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const wheelStyles = StyleSheet.create({
  container: { width: 130, position: 'relative' },
  highlight: {
    position: 'absolute',
    top: WHEEL_ITEM_H,
    left: 0, right: 0,
    height: WHEEL_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5DDD4',
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
    zIndex: 1,
  },
  item: { height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 13, color: '#C4BDB7' },
});

// ─── Audio Layer Sheet ────────────────────────────────────────────────────────

const LAYER_TYPE_OPTIONS: { type: LayerType; label: string }[] = [
  { type: 'melody', label: 'Melody' },
  { type: 'chords', label: 'Chords' },
  { type: 'rhythm', label: 'Rhythm' },
];

function AudioLayerSheet({
  visible, onClose, onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (recordingId: string, layerType: LayerType) => void;
}) {
  const { theme } = useThemeStore();
  const [layerType, setLayerType] = useState<LayerType>('melody');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [folders, setFolders] = useState<import('@/lib/types').Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState(MAIN_FOLDER_ID);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const allFolders = getFolders();
      setFolders(allFolders);
      setActiveFolderId(MAIN_FOLDER_ID);
      setRecordings(getRecordings(MAIN_FOLDER_ID));
      setTagFilter(null);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  function selectFolder(folderId: string) {
    setActiveFolderId(folderId);
    setRecordings(getRecordings(folderId));
  }

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  const activeFolder = folders.find(f => f.id === activeFolderId);
  const filteredRecordings = tagFilter
    ? recordings.filter(r => r.tags.includes(tagFilter as any))
    : recordings;

  return (
    <Modal visible={mounted} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Add Audio Layer</Text>

          {/* Layer type picker */}
          <View style={styles.layerTypeRow}>
            {LAYER_TYPE_OPTIONS.map(opt => {
              const color = LAYER_COLORS[opt.type];
              const active = layerType === opt.type;
              return (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.layerTypeChip, active && { borderColor: color, backgroundColor: `${color}18` }]}
                  onPress={() => setLayerType(opt.type)}
                >
                  <View style={[styles.layerTypeDot, { backgroundColor: color }]} />
                  <Text style={[styles.layerTypeLabel, active && { color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Folder tabs */}
          {/* Tag wheel + folder row */}
          <View style={styles.folderWheelRow}>
            <WheelPicker
              items={['All', ...FIXED_TAGS]}
              selectedIndex={tagFilter === null ? 0 : FIXED_TAGS.indexOf(tagFilter as (typeof FIXED_TAGS)[number]) + 1}
              onSelect={idx => setTagFilter(idx === 0 ? null : FIXED_TAGS[idx - 1])}
            />
            {folders.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.layerFolderContent}>
                {folders.map(f => {
                  const active = f.id === activeFolderId;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.layerFolderChip, active && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                      onPress={() => selectFolder(f.id)}
                    >
                      <Text style={[styles.layerFolderChipText, active && { color: theme.accent }]}>{f.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Recordings list */}
          <ScrollView style={styles.recList} showsVerticalScrollIndicator={false}>
            {filteredRecordings.length === 0 && (
              <Text style={styles.recEmpty}>
                {recordings.length === 0
                  ? `No recordings in ${activeFolder?.name ?? 'this folder'}.`
                  : 'No recordings match this tag.'}
              </Text>
            )}
            {filteredRecordings.map(rec => (
              <TouchableOpacity key={rec.id} style={styles.recItem} onPress={() => { onAdd(rec.id, layerType); onClose(); }}>
                <View style={styles.recIcon}>
                  <Ionicons name="mic-outline" size={16} color="#6B6560" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recTitle} numberOfLines={1}>{rec.title ?? 'Voice Memo'}</Text>
                  <Text style={styles.recMeta}>
                    {rec.tags.slice(0, 2).join(', ')} · {formatDuration(rec.duration)}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={20} color={theme.accent} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Word Panel ───────────────────────────────────────────────────────────────

function WordPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(300, width * 0.72);
  const slideAnim = useRef(new Animated.Value(panelWidth)).current;

  const [activeTab, setActiveTab] = useState<'rhymes' | 'words'>('rhymes');

  // Rhymes tab
  const [rhymeQuery, setRhymeQuery] = useState('');
  const [rhymes, setRhymes] = useState<{ label: string; words: string[] }[]>([]);
  const [rhymeSearched, setRhymeSearched] = useState('');
  const [rhymeLoading, setRhymeLoading] = useState(false);

  // Words tab
  const [wordQuery, setWordQuery] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [meansLike, setMeansLike] = useState<string[]>([]);
  const [definitions, setDefinitions] = useState<{ pos: string; def: string }[]>([]);
  const [wordSearched, setWordSearched] = useState('');
  const [wordLoading, setWordLoading] = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : panelWidth,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
    }).start();
    if (!visible) { setRhymeQuery(''); setWordQuery(''); }
  }, [visible]);

  async function searchRhymes(overrideQuery?: string) {
    const word = (overrideQuery ?? rhymeQuery).trim().toLowerCase();
    if (!word || word === rhymeSearched) return;
    setRhymeLoading(true);
    setRhymeSearched(word);
    try {
      const [perfectRes, nearRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=24`),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(word)}&max=12`),
      ]);
      const perfect: { word: string }[] = await perfectRes.json();
      const near: { word: string }[] = await nearRes.json();
      setRhymes([
        { label: 'Perfect', words: perfect.map(w => w.word) },
        { label: 'Near', words: near.map(w => w.word) },
      ]);
    } catch {}
    setRhymeLoading(false);
  }

  async function searchWords(overrideQuery?: string) {
    const q = (overrideQuery ?? wordQuery).trim().toLowerCase();
    if (!q || q === wordSearched) return;
    setWordLoading(true);
    setWordSearched(q);
    try {
      const isSingleWord = !q.includes(' ');
      const fetches: Promise<Response>[] = [
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(q)}&max=20`),
        fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(q)}&max=20`),
      ];
      if (isSingleWord) {
        fetches.push(fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`));
      }
      const results = await Promise.all(fetches);
      const synData: { word: string }[] = await results[0].json();
      const mlData: { word: string }[] = await results[1].json();
      setSynonyms(synData.map(w => w.word));
      setMeansLike(mlData.map(w => w.word));
      if (isSingleWord && results[2]) {
        try {
          const defData = await results[2].json();
          if (Array.isArray(defData) && defData[0]) {
            setDefinitions(
              (defData[0].meanings as any[]).slice(0, 2).flatMap((m: any) =>
                (m.definitions as any[]).slice(0, 2).map((d: any) => ({
                  pos: m.partOfSpeech as string,
                  def: d.definition as string,
                }))
              )
            );
          } else { setDefinitions([]); }
        } catch { setDefinitions([]); }
      } else { setDefinitions([]); }
    } catch {}
    setWordLoading(false);
  }

  function tapRhymeWord(word: string) {
    setRhymeQuery(word);
    setRhymeSearched('');
    setTimeout(() => searchRhymes(word), 50);
  }

  function tapWordResult(word: string) {
    setWordQuery(word);
    setWordSearched('');
    setTimeout(() => searchWords(word), 50);
  }

  const rhymesEmpty = !rhymeLoading && rhymeSearched && rhymes.every(g => g.words.length === 0);
  const wordsEmpty = !wordLoading && wordSearched && synonyms.length === 0 && meansLike.length === 0 && definitions.length === 0;

  return (
    <>
      {visible && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      )}
      <Animated.View style={[styles.wordPanel, { width: panelWidth, transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.wordPanelHeader}>
            <Text style={styles.wordPanelTitle}>Words</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color="#6B6560" /></TouchableOpacity>
          </View>

          {/* Tab pills */}
          <View style={styles.wordTabRow}>
            <TouchableOpacity
              style={[styles.wordTab, activeTab === 'rhymes' && styles.wordTabActive, activeTab === 'rhymes' && { backgroundColor: theme.accentLight }]}
              onPress={() => setActiveTab('rhymes')}
            >
              <Text style={[styles.wordTabText, activeTab === 'rhymes' && { color: theme.accent }]}>Rhymes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wordTab, activeTab === 'words' && styles.wordTabActive, activeTab === 'words' && { backgroundColor: theme.accentLight }]}
              onPress={() => setActiveTab('words')}
            >
              <Text style={[styles.wordTabText, activeTab === 'words' && { color: theme.accent }]}>Explore</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'rhymes' ? (
            <>
              <View style={styles.wordSearchRow}>
                <TextInput
                  style={styles.wordSearchInput}
                  placeholder="Type a word..."
                  placeholderTextColor="#A09990"
                  value={rhymeQuery}
                  onChangeText={q => { setRhymeQuery(q); setRhymeSearched(''); }}
                  onSubmitEditing={() => searchRhymes()}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[styles.wordSearchButton, { backgroundColor: theme.accentLight }]} onPress={() => searchRhymes()}>
                  <Ionicons name="search" size={16} color={theme.accent} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.wordResults} showsVerticalScrollIndicator={false}>
                {rhymeLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 20 }} />}
                {!rhymeLoading && rhymes.map(group => group.words.length > 0 && (
                  <View key={group.label} style={styles.wordSection}>
                    <Text style={styles.wordSectionLabel}>{group.label} Rhymes</Text>
                    <View style={styles.wordGrid}>
                      {group.words.map(w => (
                        <TouchableOpacity key={w} style={styles.wordChip} onPress={() => tapRhymeWord(w)}>
                          <Text style={styles.wordChipText}>{w}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
                {rhymesEmpty && <Text style={styles.wordEmpty}>No rhymes found for "{rhymeSearched}"</Text>}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.wordSearchRow}>
                <TextInput
                  style={styles.wordSearchInput}
                  placeholder="Word or feeling..."
                  placeholderTextColor="#A09990"
                  value={wordQuery}
                  onChangeText={q => { setWordQuery(q); setWordSearched(''); }}
                  onSubmitEditing={() => searchWords()}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[styles.wordSearchButton, { backgroundColor: theme.accentLight }]} onPress={() => searchWords()}>
                  <Ionicons name="search" size={16} color={theme.accent} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.wordResults} showsVerticalScrollIndicator={false}>
                {wordLoading && <ActivityIndicator color={theme.accent} style={{ marginTop: 20 }} />}
                {!wordLoading && synonyms.length > 0 && (
                  <View style={styles.wordSection}>
                    <Text style={styles.wordSectionLabel}>Synonyms</Text>
                    <View style={styles.wordGrid}>
                      {synonyms.map(w => (
                        <TouchableOpacity key={w} style={styles.wordChip} onPress={() => tapWordResult(w)}>
                          <Text style={styles.wordChipText}>{w}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {!wordLoading && meansLike.length > 0 && (
                  <View style={styles.wordSection}>
                    <Text style={styles.wordSectionLabel}>Similar Meaning</Text>
                    <View style={styles.wordGrid}>
                      {meansLike.map(w => (
                        <TouchableOpacity key={w} style={styles.wordChip} onPress={() => tapWordResult(w)}>
                          <Text style={styles.wordChipText}>{w}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {!wordLoading && definitions.length > 0 && (
                  <View style={styles.wordSection}>
                    <Text style={styles.wordSectionLabel}>Definition</Text>
                    {definitions.map((d, i) => (
                      <View key={i} style={styles.defItem}>
                        <Text style={styles.defPos}>{d.pos}</Text>
                        <Text style={styles.defText}>{d.def}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {wordsEmpty && <Text style={styles.wordEmpty}>No results for "{wordSearched}"</Text>}
                {!wordSearched && (
                  <Text style={styles.wordHint}>
                    Try a single word for synonyms and definitions, or describe a feeling for matching words.
                  </Text>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

// ─── Add Section Sheet ────────────────────────────────────────────────────────

const SECTION_OPTIONS: { type: SectionType; defaultLabel: string }[] = [
  { type: 'verse', defaultLabel: 'Verse' }, { type: 'pre-chorus', defaultLabel: 'Pre-Chorus' },
  { type: 'chorus', defaultLabel: 'Chorus' }, { type: 'bridge', defaultLabel: 'Bridge' },
  { type: 'outro', defaultLabel: 'Outro' }, { type: 'custom', defaultLabel: 'Section' },
];

function AddSectionSheet({ visible, sectionCount, onClose, onAdd }: {
  visible: boolean; sectionCount: number; onClose: () => void;
  onAdd: (type: SectionType, label: string) => void;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: visible ? 0 : 400, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, [visible]);
  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);
  return (
    <Modal visible={visible} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Add Section</Text>
          <View style={styles.sectionTypeGrid}>
            {SECTION_OPTIONS.map(opt => {
              const colors = SECTION_COLORS[opt.type];
              const label = opt.type === 'custom' ? `Section ${sectionCount + 1}` : opt.defaultLabel;
              return (
                <TouchableOpacity key={opt.type} style={[styles.sectionTypeChip, { borderColor: colors.outline }]}
                  onPress={() => { onAdd(opt.type, label); onClose(); }} activeOpacity={0.7}>
                  <Text style={[styles.sectionTypeText, { color: colors.label }]}>{opt.defaultLabel.toUpperCase()}</Text>
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

function MetaChip({ value, bg, color }: { value: string; bg: string; color: string }) {
  return (
    <View style={[styles.metaChipItem, { backgroundColor: bg }]}>
      <Text style={[styles.metaChipText, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Stage (view mode) ────────────────────────────────────────────────────────

type EditorFeatures   = { chords: boolean; rhythm: boolean; audio: boolean; boxes: boolean };
type EditorIndicators = { lineNumbers: boolean; syllables: boolean; rhymes: boolean; dividers: boolean };
type BgMode           = 'default' | 'board';

// Stage settings persist across editor sessions
const STAGE_PREFS_KEY = 'an_editor_stage';
type StagePrefs = { features?: EditorFeatures; indicators?: EditorIndicators; bgMode?: BgMode };

function loadStagePrefs(): StagePrefs {
  try {
    const raw = (globalThis as any).localStorage?.getItem(STAGE_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveStagePrefs(prefs: StagePrefs) {
  try { (globalThis as any).localStorage?.setItem(STAGE_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function makeAmbientTheme(board: InspoBoard): BgTheme {
  const backdrop = getBackdrop(board.background);
  const colors = board.bgBase?.colors?.length ? board.bgBase.colors : backdrop.baseColors;
  const t = themeForBase({ colors });
  return {
    id: 'warm-white' as const,
    name: backdrop.label,
    swatch: colors[0],
    bg: colors[0],
    cardBg: board.bgBase ? t.cardBg : backdrop.cardBg,
    lyricColor: t.fg,
    placeholderColor: t.fg + '55',
    labelColor: t.fg,
    metaBg: t.fg + '18',
    isDark: t.isDark,
  };
}

function StageSheet({
  visible, features, indicators, bgMode, accent, linkedBgConfig, onClose, onToggleFeature, onToggleIndicator, onSetBgMode,
}: {
  visible: boolean;
  features: EditorFeatures;
  indicators: EditorIndicators;
  bgMode: BgMode;
  accent: string;
  linkedBgConfig: BackdropDef | null;
  onClose: () => void;
  onToggleFeature: (key: keyof EditorFeatures) => void;
  onToggleIndicator: (key: keyof EditorIndicators) => void;
  onSetBgMode: (m: BgMode) => void;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 240, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  const FEATURE_OPTS: { key: keyof EditorFeatures; label: string; icon: string }[] = [
    { key: 'boxes',  label: 'Boxes',  icon: 'square-outline' },
    { key: 'chords', label: 'Chords', icon: 'musical-notes-outline' },
    { key: 'rhythm', label: 'Rhythm', icon: 'pulse-outline' },
    { key: 'audio',  label: 'Audio',  icon: 'mic-outline' },
  ];

  const INDICATOR_OPTS: { key: keyof EditorIndicators; label: string; icon: string }[] = [
    { key: 'lineNumbers', label: 'Numbers', icon: 'list-outline' },
    { key: 'syllables',   label: 'Syllables', icon: 'text-outline' },
    { key: 'rhymes',      label: 'Rhymes',  icon: 'color-wand-outline' },
    { key: 'dividers',    label: 'Dividers', icon: 'remove-outline' },
  ];

  const BG_OPTS: { id: BgMode; label: string; icon: string; desc: string; disabled?: boolean }[] = [
    { id: 'default', label: 'Default', icon: 'phone-portrait-outline', desc: 'App theme' },
    { id: 'board',   label: 'Board',   icon: 'color-palette-outline',  desc: 'Mood board', disabled: !linkedBgConfig },
  ];

  return (
    <Modal visible={mounted} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
        <Pressable onPress={(e: any) => e.stopPropagation?.()}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Stage</Text>

          <Text style={styles.fieldLabel}>Features</Text>
          <View style={stageStyles.toggleRow}>
            {FEATURE_OPTS.map(f => {
              const on = features[f.key];
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[stageStyles.togglePill, on && { backgroundColor: accent + '18', borderColor: accent }]}
                  onPress={() => onToggleFeature(f.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={f.icon as any} size={16} color={on ? accent : '#6B6560'} />
                  <Text style={[stageStyles.toggleLabel, on && { color: accent }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Indicators</Text>
          <View style={stageStyles.toggleRow}>
            {INDICATOR_OPTS.map(f => {
              const on = indicators[f.key];
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[stageStyles.togglePill, on && { backgroundColor: accent + '18', borderColor: accent }]}
                  onPress={() => onToggleIndicator(f.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={f.icon as any} size={16} color={on ? accent : '#6B6560'} />
                  <Text style={[stageStyles.toggleLabel, on && { color: accent }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Background</Text>
          <View style={stageStyles.modeRow}>
            {BG_OPTS.map(opt => {
              const active = bgMode === opt.id;
              const disabled = !!opt.disabled;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    stageStyles.modeCard,
                    active && { borderColor: accent, backgroundColor: accent + '12' },
                    disabled && stageStyles.modeCardDisabled,
                  ]}
                  onPress={() => !disabled && onSetBgMode(opt.id)}
                  activeOpacity={disabled ? 1 : 0.8}
                >
                  <Ionicons name={opt.icon as any} size={22} color={disabled ? '#D0CBC5' : active ? accent : '#6B6560'} />
                  <Text style={[stageStyles.modeLabel, active && { color: accent }, disabled && stageStyles.modeLabelDisabled]}>{opt.label}</Text>
                  <Text style={[stageStyles.modeDesc, disabled && stageStyles.modeDescDisabled]}>{disabled ? 'Link a board first' : opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {bgMode === 'board' && linkedBgConfig && (
            <View style={stageStyles.ambientPreview}>
              <View style={[stageStyles.ambientSwatch, { backgroundColor: linkedBgConfig.baseColors[0], borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' }]}>
                <BoardBackdrop backdropId={linkedBgConfig.id} width={22} height={22} quality="lite" animated={false} />
              </View>
              <Text style={stageStyles.ambientLabel}>{linkedBgConfig.label} — from linked board</Text>
            </View>
          )}
        </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Export sheet ─────────────────────────────────────────────────────────────

function ExportSheet({ visible, songId, songTitle, accent, onClose }: {
  visible: boolean; songId: string; songTitle: string; accent: string; onClose: () => void;
}) {
  const [opts, setOpts] = useState<ExportOptions>({ stems: true, midi: true, lyrics: true });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setStatus(null);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 240, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  const OPTIONS: { key: keyof ExportOptions; label: string; desc: string; icon: string }[] = [
    { key: 'stems',  label: 'Audio stems',        desc: 'Attached voice memos, organized by section & line', icon: 'mic-outline' },
    { key: 'midi',   label: 'MIDI',               desc: 'Melody + chords at your BPM & time signature',      icon: 'musical-notes-outline' },
    { key: 'lyrics', label: 'Lyrics & song sheet', desc: 'Lyrics.txt plus key, BPM, and chord chart',        icon: 'document-text-outline' },
  ];

  const anySelected = opts.stems || opts.midi || opts.lyrics;

  async function handleExport() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await exportSongToZip(songId, opts);
      setStatus(result.skippedAudio
        ? 'Exported — no audio layers were attached, so the zip has no stems.'
        : `Exported ${result.files} file${result.files === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setStatus(err?.message === 'Nothing selected to export' ? 'Pick at least one thing to export.' : 'Export failed — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={mounted} transparent animationType="none">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={(e: any) => e.stopPropagation?.()}>
            <SheetGrabHandle handlers={swipeHandlers} />
            <Text style={styles.sheetTitle}>Export “{songTitle}”</Text>
            <Text style={exportStyles.subtitle}>DAW-ready zip — drag the contents straight into your project.</Text>

            {OPTIONS.map(o => {
              const on = opts[o.key];
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[exportStyles.row, on && { borderColor: accent, backgroundColor: accent + '10' }]}
                  onPress={() => setOpts(prev => ({ ...prev, [o.key]: !prev[o.key] }))}
                  activeOpacity={0.8}
                >
                  <Ionicons name={o.icon as any} size={20} color={on ? accent : '#A09890'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[exportStyles.rowLabel, on && { color: accent }]}>{o.label}</Text>
                    <Text style={exportStyles.rowDesc}>{o.desc}</Text>
                  </View>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? accent : '#D8D2C8'} />
                </TouchableOpacity>
              );
            })}

            {status && <Text style={exportStyles.status}>{status}</Text>}

            <TouchableOpacity
              style={[exportStyles.exportBtn, { backgroundColor: anySelected && !busy ? accent : accent + '55' }]}
              onPress={handleExport}
              disabled={!anySelected || busy}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={exportStyles.exportBtnText}>{Platform.OS === 'web' ? 'Download zip' : 'Export & share'}</Text>
                  </>
                )}
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const exportStyles = StyleSheet.create({
  subtitle: { fontSize: 12.5, color: '#A09890', marginBottom: 14, marginTop: -4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: 'rgba(28,26,23,0.1)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8,
  },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: '#1C1A17' },
  rowDesc: { fontSize: 11.5, color: '#A09890', marginTop: 1 },
  status: { fontSize: 12.5, color: '#6B6560', textAlign: 'center', marginTop: 6 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12, marginTop: 12,
  },
  exportBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
});

// ─── Editor Screen ────────────────────────────────────────────────────────────

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { songs, sections, lines, openSong, closeSong, addSection, reorderSections, deleteSection, updateSong,
          upsertChordCell, clearChordCell, upsertRhythmCell, clearRhythmCell, addAudioLayer } =
    useSongsStore();

  const song = songs.find(s => s.id === id);

  const [chordTarget, setChordTarget] = useState<ChordPickerTarget | null>(null);
  const [rhythmTarget, setRhythmTarget] = useState<RhythmPickerTarget | null>(null);
  const [audioTarget, setAudioTarget] = useState<string | null>(null); // lineId
  const [playingLayerId, setPlayingLayerId] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showWordPanel, setShowWordPanel] = useState(false);
  const [showStageSheet, setShowStageSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [features, setFeatures] = useState<EditorFeatures>(() => loadStagePrefs().features ?? { chords: false, rhythm: false, audio: false, boxes: false });
  const [indicators, setIndicators] = useState<EditorIndicators>(() => loadStagePrefs().indicators ?? { lineNumbers: true, syllables: true, rhymes: true, dividers: true });
  const [bgMode, setBgMode] = useState<BgMode>(() => loadStagePrefs().bgMode ?? 'default');

  useEffect(() => {
    saveStagePrefs({ features, indicators, bgMode });
  }, [features, indicators, bgMode]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState('');

  const [recordingsMap, setRecordingsMap] = useState(new Map<string, Recording>());
  const soundRef = useRef<Audio.Sound | null>(null);

  // Theme
  const { theme: appTheme, bgTheme: theme, graphics } = useThemeStore();
  const { width: winW, height: winH } = useWindowDimensions();
  const getBoardForSong = useInspoBoardStore(s => s.getBoardForSong);
  const linkedBoard = id ? getBoardForSong(id) : undefined;
  const linkedBgConfig = linkedBoard ? getBackdrop(linkedBoard.background) : null;
  const boardBgActive = bgMode === 'board' && !!linkedBoard && !!linkedBgConfig;
  const ambientGrad: GradientConfig | null = (boardBgActive && linkedBoard!.moodGlow !== false)
    ? computeDirectionalGradient(linkedBoard!.chips, linkedBoard!.connections)
    : null;
  const displayTheme = boardBgActive
    ? makeAmbientTheme(linkedBoard!)
    : theme;

  // Song meta pickers
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const [showTimeSigPicker, setShowTimeSigPicker] = useState(false);
  const [showBpmPicker, setShowBpmPicker] = useState(false);

  // Drag reorder
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const workingRef = useRef<Section[]>(sections);
  const [workingSections, setWorkingSections] = useState<Section[]>(sections);
  const sectionHeightsRef = useRef<Map<string, number>>(new Map());
  const dragAnimY = useRef(new Animated.Value(0)).current;
  const accY = useRef(0);

  useEffect(() => {
    if (!draggingId) {
      setWorkingSections(sections);
      workingRef.current = sections;
    }
  }, [sections, draggingId]);

  useEffect(() => {
    if (id) openSong(id);
    const recs = getAllRecordings();
    setRecordingsMap(new Map(recs.map(r => [r.id, r])));
    return () => { closeSong(); stopAudio(); };
  }, [id]);


  async function stopAudio() {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingLayerId(null);
  }

  async function handlePlayLayer(layer: AudioLayer, filePath: string) {
    await stopAudio();
    if (playingLayerId === layer.id) return;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: filePath }, { shouldPlay: true }, status => {
        if (status.isLoaded && status.didJustFinish) setPlayingLayerId(null);
      });
      soundRef.current = sound;
      setPlayingLayerId(layer.id);
    } catch (err) {
      console.error('playLayer', err);
    }
  }

  function handleAddAudioLayer(recordingId: string, layerType: LayerType) {
    if (!audioTarget) return;
    addAudioLayer(audioTarget, recordingId, layerType);
    // Refresh recordings map in case a new recording was added
    const recs = getAllRecordings();
    setRecordingsMap(new Map(recs.map(r => [r.id, r])));
    setAudioTarget(null);
  }

  const handleCellPress = useCallback<CellPressHandler>((lineId, position, existing) => {
    setChordTarget({ lineId, position, existing });
  }, []);

  function handleChordConfirm(root: string, quality: string, duration: NoteValue | null) {
    if (!chordTarget) return;
    upsertChordCell(chordTarget.lineId, chordTarget.position, { root, quality, duration });
    setChordTarget(null);
  }

  const handleRhythmCellPress = useCallback<RhythmCellPressHandler>((lineId, position, existingCell, lineText) => {
    setRhythmTarget({
      lineId,
      position,
      existingNoteValue: existingCell?.noteValue ?? null,
      existingSyllable: existingCell?.syllable ?? null,
      existingPitch: existingCell?.pitch ?? null,
      lineText,
    });
  }, []);

  function handleRhythmConfirm(noteValue: NoteValue, syllable: string | null, pitch: string | null) {
    if (!rhythmTarget) return;
    upsertRhythmCell(rhythmTarget.lineId, rhythmTarget.position, noteValue, syllable, pitch);
    setRhythmTarget(null);
  }

  function handleRhythmConfirmNext(noteValue: NoteValue, syllable: string | null, pitch: string | null) {
    if (!rhythmTarget) return;
    const { lineId, position, lineText } = rhythmTarget;
    upsertRhythmCell(lineId, position, noteValue, syllable, pitch);
    // advance the picker to the cell right after the note just placed
    const line = Object.values(lines).flat().find(l => l.id === lineId);
    if (!line) { setRhythmTarget(null); return; }
    const resolution = Math.max(1, line.chordResolution || 8);
    const beatsPerBar = Math.max(1, parseInt((song?.timeSignature ?? '4/4').split('/')[0]) || 4);
    const cellsPerBeat = Math.max(1, Math.round(resolution / beatsPerBar));
    const span = Math.max(1, Math.round((NOTE_VALUE_BEATS[noteValue] ?? 1) * cellsPerBeat));
    const nextPos = position + span;
    const existing = (useSongsStore.getState().rhythmCells[lineId] ?? []).find(c => c.position === nextPos) ?? null;
    setRhythmTarget({
      lineId,
      position: nextPos,
      existingNoteValue: existing?.noteValue ?? null,
      existingSyllable: existing?.syllable ?? null,
      existingPitch: existing?.pitch ?? null,
      lineText,
    });
  }

  function handleRhythmClear() {
    if (!rhythmTarget) return;
    clearRhythmCell(rhythmTarget.lineId, rhythmTarget.position);
    setRhythmTarget(null);
  }

  function handleChordClear() {
    if (!chordTarget) return;
    clearChordCell(chordTarget.lineId, chordTarget.position);
    setChordTarget(null);
  }

  function handleDragStart(id: string) {
    const cur = [...sections];
    workingRef.current = cur;
    setWorkingSections(cur);
    accY.current = 0;
    dragAnimY.setValue(0);
    draggingIdRef.current = id;
    setDraggingId(id);
  }

  function handleDragMove(totalDy: number) {
    const cur = workingRef.current;
    const idx = cur.findIndex(s => s.id === draggingIdRef.current);
    if (idx === -1) return;
    const delta = totalDy - accY.current;
    const MARGIN = 16;
    if (delta < 0 && idx > 0) {
      const prevH = (sectionHeightsRef.current.get(cur[idx - 1].id) ?? 100) + MARGIN;
      if (delta < -(prevH / 2)) {
        const next = [...cur];
        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
        workingRef.current = next;
        setWorkingSections(next);
        accY.current -= prevH;
      }
    } else if (delta > 0 && idx < cur.length - 1) {
      const nextH = (sectionHeightsRef.current.get(cur[idx + 1].id) ?? 100) + MARGIN;
      if (delta > nextH / 2) {
        const next = [...cur];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        workingRef.current = next;
        setWorkingSections(next);
        accY.current += nextH;
      }
    }
    dragAnimY.setValue(totalDy - accY.current);
  }

  function handleDragEnd() {
    reorderSections(workingRef.current.map(s => s.id));
    Animated.spring(dragAnimY, {
      toValue: 0, useNativeDriver: true, damping: 20, stiffness: 300,
    }).start(() => {
      draggingIdRef.current = null;
      setDraggingId(null);
      dragAnimY.setValue(0);
    });
  }

  const displaySections = workingSections;

  const { rhymeColorMap, lineNumberMap } = useMemo(() => {
    const allLines = sections.flatMap(s => lines[s.id] ?? []);
    const lnMap = new Map<string, number>();
    allLines.forEach((l, i) => lnMap.set(l.id, i + 1));
    return { rhymeColorMap: buildRhymeColorMap(allLines), lineNumberMap: lnMap };
  }, [sections, lines]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: displayTheme.bg }]}>
      {/* Ambient backdrop + gradient layers (from linked board) */}
      {boardBgActive && (
        <>
          <CustomBackdrop
            data={{
              base: linkedBoard!.bgBase ?? { colors: getBackdrop(linkedBoard!.background).baseColors },
              elements: linkedBoard!.bgElements ?? [],
              ambient: linkedBoard!.ambientFx ?? 'none',
            }}
            width={winW}
            height={winH}
            quality={graphics}
            intensity={linkedBoard!.textureIntensity ?? 1}
            tint={linkedBoard!.backdropTint ?? null}
          />
          {ambientGrad && (
            <LinearGradient
              colors={ambientGrad.colors as any}
              locations={ambientGrad.locations as any}
              start={ambientGrad.start}
              end={ambientGrad.end}
              style={StyleSheet.absoluteFill}
            />
          )}
        </>
      )}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => { stopAudio(); router.back(); }}>
          <Ionicons name="chevron-back" size={24} color={displayTheme.labelColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          {editingTitle ? (
            <TextInput
              autoFocus
              style={[styles.headerTitleInput, { color: displayTheme.labelColor, width: Math.max(60, titleText.length * 9.5 + 24) }]}
              value={titleText}
              onChangeText={setTitleText}
              onBlur={() => {
                const t = titleText.trim();
                if (t && song) updateSong(song.id, { title: t });
                else if (song) setTitleText(song.title);
                setEditingTitle(false);
              }}
              onSubmitEditing={() => {
                const t = titleText.trim();
                if (t && song) updateSong(song.id, { title: t });
                else if (song) setTitleText(song.title);
                setEditingTitle(false);
              }}
              returnKeyType="done"
              selectTextOnFocus
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.headerTitle, { color: displayTheme.labelColor }]} numberOfLines={1}>{song?.title ?? ''}</Text>
              <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    const sx = window.scrollX, sy = window.scrollY;
                    setTitleText(song?.title ?? '');
                    setEditingTitle(true);
                    requestAnimationFrame(() => window.scrollTo(sx, sy));
                  } else {
                    setTitleText(song?.title ?? '');
                    setEditingTitle(true);
                  }
                }}
              >
                <Ionicons name="pencil-outline" size={11} color={displayTheme.labelColor} style={{ opacity: 0.3, marginLeft: 5, marginTop: 1 }} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {linkedBoard && (
            <TouchableOpacity
              style={[styles.headerButton, styles.boardBadge, { backgroundColor: linkedBoard.accentColor + '22', borderColor: linkedBoard.accentColor + '66' }]}
              onPress={() => router.push(`/inspo/${linkedBoard.id}`)}
            >
              <Ionicons name="albums-outline" size={14} color={linkedBoard.accentColor} />
              <Text style={[styles.boardBadgeText, { color: linkedBoard.accentColor }]} numberOfLines={1}>{linkedBoard.title}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowExportSheet(true)}>
            <Ionicons name="share-outline" size={19} color={displayTheme.labelColor} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowStageSheet(v => !v)}>
            <Ionicons name="layers-outline" size={20} color={(!features.boxes || !features.chords || !features.rhythm || !features.audio || bgMode !== 'default') ? appTheme.accent : displayTheme.labelColor} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowWordPanel(v => !v)}>
            <Ionicons name="text-outline" size={20} color={showWordPanel ? appTheme.accent : displayTheme.labelColor} />
          </TouchableOpacity>
        </View>
      </View>


      {/* Meta bar — tappable to edit */}
      {song && (
        <View style={styles.metaBar}>
          <TouchableOpacity style={[styles.metaChipItem, { backgroundColor: displayTheme.metaBg }]} onPress={() => setShowKeyPicker(true)}>
            <Text style={[styles.metaChipText, { color: displayTheme.labelColor }]}>{song.key ?? '+ Key'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.metaChipItem, { backgroundColor: displayTheme.metaBg }]} onPress={() => setShowBpmPicker(true)} activeOpacity={0.7}>
            <Text style={[styles.metaChipText, { color: song?.bpm ? displayTheme.labelColor : displayTheme.placeholderColor }]}>
              {song?.bpm ? `${song.bpm} BPM` : '+ BPM'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.metaChipItem, { backgroundColor: displayTheme.metaBg }]} onPress={() => setShowTimeSigPicker(true)}>
            <Text style={[styles.metaChipText, { color: displayTheme.labelColor }]}>{song.timeSignature ?? '+ Time'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {displaySections.length === 0 ? (
            <View style={styles.emptyEditor}>
              <Text style={[styles.emptyEditorText, { color: displayTheme.placeholderColor }]}>No sections yet. Add one below to start writing.</Text>
            </View>
          ) : (
            displaySections.map((section, idx) => (
              <SectionBlock
                key={section.id}
                section={section}
                theme={displayTheme}
                isDragging={draggingId === section.id}
                dragY={dragAnimY}
                onLayout={(id, height) => sectionHeightsRef.current.set(id, height)}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                recordingsMap={recordingsMap}
                playingLayerId={playingLayerId}
                features={features}
                indicators={indicators}
                onCellPress={handleCellPress}
                onRhythmCellPress={handleRhythmCellPress}
                onAddLayer={lineId => setAudioTarget(lineId)}
                onPlayLayer={handlePlayLayer}
                rhymeColorMap={rhymeColorMap}
                lineNumberMap={lineNumberMap}
                onDelete={() => deleteSection(section.id)}
                onMoveUp={idx > 0 ? () => {
                  const ids = displaySections.map(s => s.id);
                  [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                  reorderSections(ids);
                } : undefined}
                onMoveDown={idx < displaySections.length - 1 ? () => {
                  const ids = displaySections.map(s => s.id);
                  [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                  reorderSections(ids);
                } : undefined}
              />
            ))
          )}
          <TouchableOpacity style={styles.addSectionButton} onPress={() => setShowAddSection(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#A09990" />
            <Text style={styles.addSectionText}>Add Section</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <NoteValuePickerModal
        target={rhythmTarget}
        onConfirm={handleRhythmConfirm}
        onConfirmNext={handleRhythmConfirmNext}
        onClear={handleRhythmClear}
        onClose={() => setRhythmTarget(null)}
      />
      <ChordPickerModal
        target={chordTarget}
        onConfirm={handleChordConfirm}
        onClear={handleChordClear}
        onClose={() => setChordTarget(null)}
      />
      <AudioLayerSheet
        visible={!!audioTarget}
        onClose={() => setAudioTarget(null)}
        onAdd={handleAddAudioLayer}
      />
      <AddSectionSheet
        visible={showAddSection}
        sectionCount={sections.length}
        onClose={() => setShowAddSection(false)}
        onAdd={(type, label) => addSection(type, label)}
      />

      {/* Word panel — absolute overlay from right */}
      <WordPanel visible={showWordPanel} onClose={() => setShowWordPanel(false)} />

      {/* Stage sheet */}
      {song && (
        <ExportSheet
          visible={showExportSheet}
          songId={song.id}
          songTitle={song.title}
          accent={appTheme.accent}
          onClose={() => setShowExportSheet(false)}
        />
      )}
      <StageSheet
        visible={showStageSheet}
        features={features}
        indicators={indicators}
        bgMode={bgMode}
        accent={appTheme.accent}
        linkedBgConfig={linkedBgConfig}
        onClose={() => setShowStageSheet(false)}
        onToggleFeature={key => setFeatures(f => ({ ...f, [key]: !f[key] }))}
        onToggleIndicator={key => setIndicators(v => ({ ...v, [key]: !v[key] }))}
        onSetBgMode={m => setBgMode(m)}
      />

      {/* Song meta pickers */}
      <KeyPickerModal
        visible={showKeyPicker}
        current={song?.key ?? null}
        onSelect={key => song && updateSong(song.id, { key })}
        onClose={() => setShowKeyPicker(false)}
      />
      <TimeSigPickerModal
        visible={showTimeSigPicker}
        current={song?.timeSignature ?? null}
        onSelect={timeSignature => song && updateSong(song.id, { timeSignature })}
        onClose={() => setShowTimeSigPicker(false)}
      />
      <BpmPickerModal
        visible={showBpmPicker}
        current={song?.bpm ?? null}
        onSelect={bpm => song && updateSong(song.id, { bpm })}
        onClose={() => setShowBpmPicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF8F4' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#1C1A17', flexShrink: 1 },
  headerTitleInput: { fontSize: 16, fontWeight: '600', textAlign: 'center', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', maxWidth: 260 },
  metaBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  metaChipItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F5F1EB' },
  metaChipText: { fontSize: 12, fontWeight: '500', color: '#6B6560' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 80 },
  emptyEditor: { paddingTop: 48, alignItems: 'center' },
  emptyEditorText: { fontSize: 14, color: '#A09990', textAlign: 'center', lineHeight: 20 },

  // Section block
  sectionBlock: { borderWidth: 1.5, borderRadius: 12, marginBottom: 16, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  sectionBlockFlat: { marginBottom: 0, overflow: 'hidden' },
  sectionBlockDragging: { opacity: 0.95, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 10 },
  sectionLabelFlat: { fontSize: 9, fontWeight: '700', letterSpacing: 1.6, marginBottom: 6, marginTop: 4, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 12, paddingTop: 10, paddingBottom: 6 },
  dragHandle: { paddingHorizontal: 4, paddingVertical: 4, marginRight: 4 },
  sectionLabelText: { fontSize: 9, fontWeight: '600', letterSpacing: 1.2 },
  sectionMicBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  sectionHandleArea: { width: 28, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  lineMenuItemText: { fontSize: 14, color: '#3A3530', fontWeight: '500' },

  // Line row
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 12, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(28,26,23,0.06)', overflow: 'visible' },
  lineRowDragOver: { borderTopWidth: 2, borderTopColor: '#D97706' },
  lineHandleArea: { width: 28, alignItems: 'center', paddingTop: 3, zIndex: 200, overflow: 'visible' },
  lineMenuBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  lineMenu: { position: 'absolute', top: 26, left: 0, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(28,26,23,0.08)', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10, minWidth: 150, zIndex: 200 },
  lineMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  lineMenuItemTextDanger: { fontSize: 14, color: '#EF4444', fontWeight: '500' },
  chordScroll: { marginBottom: 6 },
  chordScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 12 },
  cellWrapper: { flexDirection: 'row', alignItems: 'center' },
  barDivider: { width: 1, height: 14, backgroundColor: 'rgba(28,26,23,0.12)', marginRight: 3 },
  rhythmScrollContent: { paddingRight: 12 },
  beatTickerRow: { flexDirection: 'row', gap: 3, marginBottom: 2 },
  beatTick: { alignItems: 'flex-start', justifyContent: 'flex-end', height: 14 },
  beatTickText: { fontSize: 7, color: '#DDD8D2', fontWeight: '400', lineHeight: 11 },  // sub-beat "and" positions
  beatTickDownbeat: { fontSize: 8, color: '#B8B0A8', fontWeight: '600' },              // beat downbeat
  beatTickTextOne: { color: '#7A7068', fontWeight: '700' },                            // beat 1 (bar start)
  rhythmCellsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chordCell: { width: 40, height: 22, borderRadius: 5, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  chordCellFilled: { backgroundColor: '#E8E2D9' },
  chordLabel: { fontSize: 9, fontWeight: '600', color: '#1C1A17', letterSpacing: -0.2 },
  chordPlus: { fontSize: 13, color: 'rgba(28,26,23,0.15)', lineHeight: 14 },
  rhythmCell: { width: 40, height: 22, borderRadius: 4, backgroundColor: '#F0EDE8', alignItems: 'center', justifyContent: 'center' },
  rhythmCellFilled: { backgroundColor: '#FEF3C7' },
  rhythmCellWithSyllable: { height: 30 },
  rhythmLabel: { fontSize: 8, fontWeight: '700', color: '#D97706', letterSpacing: 0.4 },
  rhythmSyllable: { fontSize: 7, color: '#92400E', letterSpacing: -0.2, maxWidth: 38, textAlign: 'center' },
  lyricRow: { flexDirection: 'row', alignItems: 'center' },
  lyricInput: { fontSize: 16, color: '#1C1A17', paddingVertical: 0, lineHeight: 22, letterSpacing: -0.2 },
  lineMicBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  lineNumber: { fontSize: 10, color: '#C4BDB7', width: 24, textAlign: 'right', marginTop: 4 },
  syllableCount: { fontSize: 10, color: '#C4BDB7', width: 22, textAlign: 'right', marginLeft: 2 },
  rhymeDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 6, alignSelf: 'center' },

  // Audio layers
  layerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6, gap: 8 },
  layerInfo: { flex: 1 },
  layerTitle: { fontSize: 12, fontWeight: '500', color: '#1C1A17' },
  layerMeta: { fontSize: 11, color: '#A09990', marginTop: 1, textTransform: 'capitalize' },
  layerAction: { padding: 2 },
  addAudioButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  addAudioText: { fontSize: 11, color: '#C4BDB7' },

  // Add line / add section
  addLineButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: 'rgba(28,26,23,0.05)' },
  addLineText: { fontSize: 12, color: '#A09990' },
  addSectionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  addSectionText: { fontSize: 14, color: '#A09990' },

  // Chord picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  pickerBox: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '100%' },
  pickerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1A17' },
  chordPreview: { fontSize: 24, fontWeight: '700', color: '#D97706', letterSpacing: -0.5 },
  noteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 14 },
  noteCell: { width: 46, height: 38, borderRadius: 10, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  noteCellActive: { backgroundColor: '#FEF3C7', borderWidth: 1.5, borderColor: '#D97706' },
  noteCellText: { fontSize: 13, fontWeight: '600', color: '#6B6560' },
  noteCellTextActive: { color: '#D97706' },
  qualityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  qualityChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  qualityChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  qualityText: { fontSize: 13, fontWeight: '500', color: '#6B6560' },
  qualityTextActive: { color: '#D97706' },
  // Duration row in chord picker
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  durationChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  durationChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  durationChipText: { fontSize: 12, fontWeight: '500', color: '#6B6560' },
  durationChipTextActive: { color: '#D97706', fontWeight: '600' },

  // Note value picker modal
  noteValueGrid: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' },
  noteValueChip: { width: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  noteValueChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  noteValueShort: { fontSize: 16, fontWeight: '700', color: '#6B6560' },
  noteValueShortActive: { color: '#D97706' },
  noteValueLabel: { fontSize: 9, color: '#A09990', marginTop: 2 },
  noteValueLabelActive: { color: '#D97706' },
  noteValueChipDim: { opacity: 0.35 },
  noteValueShortDim: {},
  noteValueLabelDim: {},
  noteModifierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: -6 },
  noteModifierLabel: { fontSize: 11, color: '#A09990', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  noteModifierChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  noteModifierChipActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  noteModifierSymbol: { fontSize: 14, fontWeight: '700', color: '#6B6560' },
  noteModifierSymbolActive: { color: '#D97706' },
  noteModifierChipLabel: { fontSize: 11, color: '#6B6560' },
  noteModifierChipLabelActive: { color: '#D97706', fontWeight: '600' },

  // Lyric selector (syllable picker)
  syllablePickerLabel: { fontSize: 11, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  lyricSelectorWrap: { marginBottom: 12 },
  lyricSelectorBox: { borderWidth: 1, borderColor: '#DDD7D0', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start', maxWidth: '100%' },
  lyricSelectorEmpty: { fontSize: 13, color: '#A09990', marginBottom: 12, fontStyle: 'italic' },
  lyricSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4, paddingHorizontal: 2, position: 'relative' },
  lyricChar: { paddingHorizontal: 1, paddingVertical: 8, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  lyricCharSel: { backgroundColor: '#FEF3C7' },
  lyricCharPillSingle: { borderRadius: 6 },
  lyricCharPillL: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  lyricCharPillR: { borderTopRightRadius: 6, borderBottomRightRadius: 6, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  lyricCharPillM: { borderRadius: 0 },
  lyricCharText: { fontSize: 15, color: '#1C1A17' },
  lyricCharTextSel: { color: '#92400E', fontWeight: '600' },
  selHandleL: { position: 'absolute', left: -2, top: 2, bottom: 2, width: 3, borderRadius: 2, backgroundColor: '#D97706' },
  selHandleR: { position: 'absolute', right: -2, top: 2, bottom: 2, width: 3, borderRadius: 2, backgroundColor: '#D97706' },
  hoverCursor: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: 'rgba(217,119,6,0.55)' },
  lyricClearSel: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 2, marginTop: 2 },
  lyricClearSelText: { fontSize: 11, color: '#B0A9A2' },

  pickerActions: { flexDirection: 'row', gap: 10 },
  clearButton: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5F1EB', alignItems: 'center' },
  clearButtonText: { fontSize: 15, fontWeight: '600', color: '#6B6560' },
  confirmButton: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: '#D97706', alignItems: 'center' },
  confirmButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Shared sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 48, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E0D8', alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#1C1A17', marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },

  // Audio layer sheet
  layerFolderScroll: { marginBottom: 12 },
  layerFolderContent: { gap: 8, paddingRight: 4 },
  layerFolderChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F5F1EB', borderWidth: 1.5, borderColor: 'transparent' },
  layerFolderChipText: { fontSize: 13, fontWeight: '500', color: '#6B6560' },
  layerTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  layerTypeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F5F1EB', borderWidth: 2, borderColor: 'transparent' },
  folderWheelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  layerTypeDot: { width: 8, height: 8, borderRadius: 4 },
  layerTypeLabel: { fontSize: 13, fontWeight: '600', color: '#6B6560' },
  recList: { maxHeight: 280 },
  recEmpty: { fontSize: 14, color: '#A09990', textAlign: 'center', paddingVertical: 24 },
  recItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(28,26,23,0.06)', gap: 12 },
  recIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  recTitle: { fontSize: 14, fontWeight: '500', color: '#1C1A17' },
  recMeta: { fontSize: 12, color: '#A09990', marginTop: 2 },

  // Add section sheet
  sectionTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTypeChip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#FAFAFA' },
  sectionTypeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },

  // Header right group
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerDoneText: { fontSize: 15, fontWeight: '600', color: '#D97706', paddingHorizontal: 12 },
  boardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
    borderWidth: 1, width: 'auto', maxWidth: 120,
  },
  boardBadgeText: { fontSize: 11, fontWeight: '600', maxWidth: 80 },

  // Theme picker
  themePicker: { position: 'absolute', top: 54, right: 12, zIndex: 100, flexDirection: 'row', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  themeSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  themeSwatchActive: { borderColor: '#D97706' },


  // Word panel
  wordPanel: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: '#FFFFFF', borderLeftWidth: 0.5, borderLeftColor: 'rgba(28,26,23,0.1)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 8 },
  wordPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(28,26,23,0.06)' },
  wordPanelTitle: { fontSize: 17, fontWeight: '700', color: '#1C1A17' },
  wordTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  wordTab: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F5F1EB', alignItems: 'center' },
  wordTabActive: { backgroundColor: '#FEF3C7' },
  wordTabText: { fontSize: 13, fontWeight: '600', color: '#A09990' },
  wordTabTextActive: { color: '#D97706' },
  wordHint: { fontSize: 12, color: '#C4BDB7', textAlign: 'center', paddingHorizontal: 16, paddingTop: 20, lineHeight: 18 },
  wordSearchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  wordSearchInput: { flex: 1, backgroundColor: '#F5F1EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1C1A17' },
  wordSearchButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  wordResults: { paddingBottom: 40 },
  wordSection: { paddingHorizontal: 14, paddingTop: 14 },
  wordSectionLabel: { fontSize: 10, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  wordChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F5F1EB' },
  wordChipText: { fontSize: 13, color: '#1C1A17' },
  defItem: { marginBottom: 12 },
  defPos: { fontSize: 10, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.4, fontStyle: 'italic', marginBottom: 2 },
  defText: { fontSize: 13, color: '#1C1A17', lineHeight: 18 },
  wordEmpty: { textAlign: 'center', color: '#A09990', fontSize: 13, paddingTop: 24, paddingHorizontal: 16 },
});

// ─── Stage sheet styles ───────────────────────────────────────────────────────

const stageStyles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: 10 },
  togglePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(28,26,23,0.1)',
    backgroundColor: '#FAFAF8',
  },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#6B6560' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCard: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(28,26,23,0.1)',
    backgroundColor: '#FAFAF8',
  },
  modeCardDisabled: { opacity: 0.45 },
  modeLabel: { fontSize: 13, fontWeight: '700', color: '#6B6560' },
  modeLabelDisabled: { color: '#C4BDB7' },
  modeDesc:  { fontSize: 10, color: '#A09990' },
  modeDescDisabled: { color: '#C4BDB7' },
  ambientPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 20, padding: 12, borderRadius: 12,
    backgroundColor: '#F5F1EB',
  },
  ambientSwatch: { width: 32, height: 32, borderRadius: 8 },
  ambientLabel: { fontSize: 13, color: '#6B6560', fontWeight: '500' },
});

