import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { TEMPLATES } from '@/lib/constants';
import { useSongsStore } from '@/store/songsStore';
import { useThemeStore } from '@/store/themeStore';
import { useInspoBoardStore } from '@/store/inspoBoardStore';

// ─── Key Picker ───────────────────────────────────────────────────────────────

const ROOT_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function KeyPickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const [root, setRoot] = useState('C');
  const [mode, setMode] = useState<'Major' | 'Minor'>('Major');

  useEffect(() => {
    if (visible && current) {
      const parts = current.split(' ');
      if (parts.length === 2) {
        setRoot(parts[0]);
        setMode(parts[1] as 'Major' | 'Minor');
      }
    }
  }, [visible, current]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
          <Text style={styles.pickerTitle}>Key</Text>

          <View style={styles.noteGrid}>
            {ROOT_NOTES.map(note => (
              <TouchableOpacity
                key={note}
                style={[styles.noteCell, root === note && styles.noteCellActive, root === note && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                onPress={() => setRoot(note)}
              >
                <Text style={[styles.noteCellText, root === note && { color: theme.accent }]}>
                  {note}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modeRow}>
            {(['Major', 'Minor'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive, mode === m && { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeChipText, mode === m && { color: theme.accent }]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.pickerActions}>
            <TouchableOpacity style={styles.pickerCancel} onPress={onClose}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickerConfirm, { backgroundColor: theme.accent }]}
              onPress={() => { onSelect(`${root} ${mode}`); onClose(); }}
            >
              <Text style={styles.pickerConfirmText}>Set Key</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Time Sig Picker ──────────────────────────────────────────────────────────

const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'];

function TimeSigPickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  onSelect: (sig: string) => void;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
          <Text style={styles.pickerTitle}>Time Signature</Text>
          {TIME_SIGS.map(sig => (
            <TouchableOpacity
              key={sig}
              style={[styles.timeSigRow, current === sig && styles.timeSigRowActive]}
              onPress={() => { onSelect(sig); onClose(); }}
            >
              <Text style={[styles.timeSigText, current === sig && { color: theme.accent, fontWeight: '600' }]}>
                {sig}
              </Text>
              {current === sig && <Ionicons name="checkmark" size={18} color={theme.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Editable Meta Chip ───────────────────────────────────────────────────────

function MetaChip({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.metaChip} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.metaChipLabel}>{label}</Text>
      <Text style={[styles.metaChipValue, !value && styles.metaChipPlaceholder]}>
        {value ?? placeholder}
      </Text>
      <Ionicons name="chevron-down" size={12} color="#A09990" style={{ marginTop: 1 }} />
    </TouchableOpacity>
  );
}

// ─── Song Detail Screen ───────────────────────────────────────────────────────

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { songs, updateSong } = useSongsStore();
  const { theme, bgTheme } = useThemeStore();
  const getBoardForSong = useInspoBoardStore(s => s.getBoardForSong);
  const linkedBoard = id ? getBoardForSong(id) : undefined;

  const song = songs.find(s => s.id === id);

  const [title, setTitle] = useState(song?.title ?? '');
  const [notes, setNotes] = useState(''); // stored separately later
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const [showTimeSigPicker, setShowTimeSigPicker] = useState(false);
  const [bpmText, setBpmText] = useState(song?.bpm?.toString() ?? '');

  // Keep local title in sync if song changes externally
  useEffect(() => {
    if (song) setTitle(song.title);
  }, [song?.id]);

  if (!song) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgTheme.bg }]}>
        <Text style={{ padding: 20, color: '#A09990' }}>Song not found.</Text>
      </SafeAreaView>
    );
  }

  function saveTitle() {
    const t = title.trim();
    if (t && t !== song!.title) {
      updateSong(song!.id, { title: t });
    } else {
      setTitle(song!.title);
    }
  }

  function saveBpm() {
    const val = parseInt(bpmText, 10);
    if (!isNaN(val) && val > 0 && val <= 300) {
      updateSong(song!.id, { bpm: val });
    } else {
      setBpmText(song!.bpm?.toString() ?? '');
    }
  }

  const templateName = song.templateId ? TEMPLATES[song.templateId]?.name : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1C1A17" />
        </TouchableOpacity>
        <Text style={styles.headerLabel}>Song</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          returnKeyType="done"
          onSubmitEditing={saveTitle}
          placeholder="Song title"
          placeholderTextColor="#C4BDB7"
        />

        {/* Meta chips */}
        <View style={styles.metaRow}>
          <MetaChip
            label="Key"
            value={song.key}
            placeholder="—"
            onPress={() => setShowKeyPicker(true)}
          />

          {/* BPM — inline text input styled as a chip */}
          <View style={styles.metaChip}>
            <Text style={styles.metaChipLabel}>BPM</Text>
            <TextInput
              style={[styles.metaChipValue, styles.bpmInput]}
              value={bpmText}
              onChangeText={setBpmText}
              onBlur={saveBpm}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={saveBpm}
              placeholder="—"
              placeholderTextColor="#C4BDB7"
            />
          </View>

          <MetaChip
            label="Time"
            value={song.timeSignature}
            placeholder="—"
            onPress={() => setShowTimeSigPicker(true)}
          />

          {templateName && (
            <View style={[styles.metaChip, styles.metaChipReadOnly]}>
              <Text style={styles.metaChipLabel}>Template</Text>
              <Text style={styles.metaChipValue}>{templateName}</Text>
            </View>
          )}
        </View>

        {/* Section count */}
        <View style={styles.sectionRow}>
          <Ionicons name="albums-outline" size={15} color="#A09990" />
          <Text style={styles.sectionText}>
            {song.sectionCount > 0
              ? `${song.sectionCount} section${song.sectionCount !== 1 ? 's' : ''}`
              : 'No sections yet'}
          </Text>
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add notes about this song..."
          placeholderTextColor="#C4BDB7"
          multiline
          textAlignVertical="top"
        />

        {/* Open Lyric Editor */}
        <TouchableOpacity
          style={[styles.editorButton, { backgroundColor: theme.accent }]}
          activeOpacity={0.8}
          onPress={() => router.push(`/editor/${song.id}`)}
        >
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          <Text style={styles.editorButtonText}>Open Lyric Editor</Text>
        </TouchableOpacity>

        {/* Inspo board link */}
        {linkedBoard ? (
          <TouchableOpacity
            style={[styles.boardLinkBtn, { backgroundColor: linkedBoard.accentColor + '18', borderColor: linkedBoard.accentColor + '55' }]}
            activeOpacity={0.8}
            onPress={() => router.push(`/inspo/${linkedBoard.id}`)}
          >
            <Ionicons name="albums-outline" size={16} color={linkedBoard.accentColor} />
            <Text style={[styles.boardLinkText, { color: linkedBoard.accentColor }]}>{linkedBoard.title}</Text>
            <Ionicons name="chevron-forward" size={14} color={linkedBoard.accentColor + '88'} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.boardLinkBtnEmpty}
            activeOpacity={0.7}
            onPress={() => router.push('/inspo')}
          >
            <Ionicons name="albums-outline" size={16} color="#A09890" />
            <Text style={styles.boardLinkEmptyText}>Link a mood board</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Pickers */}
      <KeyPickerModal
        visible={showKeyPicker}
        current={song.key}
        onSelect={key => updateSong(song.id, { key })}
        onClose={() => setShowKeyPicker(false)}
      />
      <TimeSigPickerModal
        visible={showTimeSigPicker}
        current={song.timeSignature}
        onSelect={timeSignature => updateSong(song.id, { timeSignature })}
        onClose={() => setShowTimeSigPicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F4',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6560',
  },

  // Content
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },

  // Title
  titleInput: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1A17',
    letterSpacing: -0.5,
    paddingVertical: 8,
    marginBottom: 20,
  },

  // Meta chips row
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F5F1EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaChipReadOnly: {
    opacity: 0.7,
  },
  metaChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A09990',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaChipValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1A17',
  },
  metaChipPlaceholder: {
    color: '#C4BDB7',
  },
  bpmInput: {
    minWidth: 32,
    padding: 0,
  },

  // Section count
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
  },
  sectionText: {
    fontSize: 13,
    color: '#A09990',
  },

  // Notes
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A09990',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1C1A17',
    minHeight: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(28,26,23,0.08)',
    marginBottom: 32,
    lineHeight: 22,
  },

  // Open editor button
  editorButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  editorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Board link
  boardLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  boardLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  boardLinkBtnEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDD8D0',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  boardLinkEmptyText: {
    fontSize: 14,
    color: '#A09890',
  },

  // Key picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1A17',
    marginBottom: 18,
    textAlign: 'center',
  },
  noteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  noteCell: {
    width: 48,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F5F1EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteCellActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#D97706',
  },
  noteCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6560',
  },
  noteCellTextActive: {
    color: '#D97706',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F1EB',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modeChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B6560',
  },
  modeChipTextActive: {
    color: '#D97706',
  },
  pickerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F1EB',
    alignItems: 'center',
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6560',
  },
  pickerConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  pickerConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Time sig picker
  timeSigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(28,26,23,0.06)',
  },
  timeSigRowActive: {
    // no extra styling, checkmark handles it
  },
  timeSigText: {
    fontSize: 16,
    color: '#1C1A17',
    fontWeight: '500',
  },
  timeSigTextActive: {
    color: '#D97706',
    fontWeight: '600',
  },
});
