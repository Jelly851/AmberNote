import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SECTION_COLORS, TEMPLATES } from '@/lib/constants';
import * as db from '@/lib/db';
import type { SectionType, SongCard, Template, TemplateSectionDef, TemplateId } from '@/lib/types';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';
import { useSongsStore } from '@/store/songsStore';
import { useThemeStore } from '@/store/themeStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Song Card ────────────────────────────────────────────────────────────────

function SongCard({ song, onPress }: { song: SongCard; onPress: () => void }) {
  const chips = [
    song.key,
    song.bpm != null ? `${song.bpm} BPM` : null,
    song.timeSignature,
  ].filter(Boolean) as string[];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {song.title}
        </Text>
        <Ionicons name="chevron-forward" size={15} color="#C4BDB7" />
      </View>

      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map(c => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{timeAgo(song.updatedAt)}</Text>
        <Text style={styles.cardSections}>
          {song.sectionCount > 0
            ? `${song.sectionCount} section${song.sectionCount !== 1 ? 's' : ''}`
            : 'No sections'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Section type picker options ─────────────────────────────────────────────

const SECTION_OPTIONS: { type: SectionType; label: string }[] = [
  { type: 'verse',       label: 'Verse' },
  { type: 'pre-chorus',  label: 'Pre-Chorus' },
  { type: 'chorus',      label: 'Chorus' },
  { type: 'bridge',      label: 'Bridge' },
  { type: 'outro',       label: 'Outro' },
  { type: 'custom',      label: 'Custom' },
];

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({ template, active, accent, accentLight, onPress }: {
  template: Template;
  active: boolean;
  accent: string;
  accentLight: string;
  onPress: () => void;
}) {
  const sections = template.sections.slice(0, 8);
  return (
    <TouchableOpacity
      style={[styles.templateCard, active && { borderColor: accent, backgroundColor: accentLight }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.templateCardName, active && { color: accent }]}>{template.name}</Text>
      <Text style={[styles.templateCardSub, active && { color: accent + 'AA' }]}>
        {template.sections.length === 0 ? 'Start from scratch' : `${template.sections.length} sections`}
      </Text>
      {sections.length > 0 && (
        <View style={styles.templateSectionStrip}>
          {sections.map((s, i) => (
            <View
              key={i}
              style={[styles.templateSectionDot, { backgroundColor: SECTION_COLORS[s.type]?.outline ?? '#D1D5DB' }]}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── New Song Sheet ───────────────────────────────────────────────────────────

function NewSongSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (title: string, templateId: TemplateId) => void;
}) {
  const { theme } = useThemeStore();
  const [title, setTitle]           = useState('');
  const [templateId, setTemplateId] = useState<TemplateId>('pop');
  const [localVisible, setLocalVisible] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);

  // Create-template sub-flow
  const [creating, setCreating]         = useState(false);
  const [newTplName, setNewTplName]     = useState('');
  const [newTplSections, setNewTplSections] = useState<TemplateSectionDef[]>([]);

  const slideAnim = useRef(new Animated.Value(500)).current;

  const allTemplates: Template[] = [
    ...Object.values(TEMPLATES),
    ...customTemplates,
  ];

  useEffect(() => {
    if (visible) {
      setTitle('');
      setTemplateId('pop');
      setCreating(false);
      setNewTplName('');
      setNewTplSections([]);
      setCustomTemplates(db.getCustomTemplates());
      setLocalVisible(true);
      slideAnim.setValue(500);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    }
  }, [visible]);

  function dismiss() {
    Keyboard.dismiss();
    Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true })
      .start(() => { setLocalVisible(false); onClose(); });
  }

  useEscapeKey(() => {
    if (creating) setCreating(false);
    else dismiss();
  }, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, dismiss);

  function handleCreate() {
    if (!title.trim()) return;
    onCreate(title.trim(), templateId);
    dismiss();
  }

  function saveNewTemplate() {
    if (!newTplName.trim()) return;
    const t = db.createCustomTemplate(newTplName.trim(), newTplSections);
    setCustomTemplates(prev => [...prev, t]);
    setTemplateId(t.id);
    setCreating(false);
  }

  function addSection(type: SectionType) {
    const count = newTplSections.filter(s => s.type === type).length;
    const label = count > 0 ? `${SECTION_OPTIONS.find(o => o.type === type)!.label} ${count + 1}` : SECTION_OPTIONS.find(o => o.type === type)!.label;
    setNewTplSections(prev => [...prev, { type, label }]);
  }

  return (
    <Modal visible={localVisible} transparent animationType="none">
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={creating ? () => setCreating(false) : dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <SheetGrabHandle handlers={swipeHandlers} />

          {!creating ? <>
            <Text style={styles.sheetTitle}>New Song</Text>

            <TextInput
              style={styles.titleInput}
              placeholder="Song title..."
              placeholderTextColor="#A09990"
              value={title}
              onChangeText={setTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <Text style={styles.fieldLabel}>Template</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll} contentContainerStyle={styles.templateScrollContent}>
              {allTemplates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  active={templateId === t.id}
                  accent={theme.accent}
                  accentLight={theme.accentLight}
                  onPress={() => setTemplateId(t.id)}
                />
              ))}
              <TouchableOpacity style={styles.templateAddCard} onPress={() => setCreating(true)}>
                <Ionicons name="add" size={22} color="#A09990" />
                <Text style={styles.templateAddText}>New</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: theme.accent }, !title.trim() && styles.createButtonDisabled]}
              onPress={handleCreate}
              activeOpacity={0.8}
            >
              <Text style={styles.createButtonText}>Create Song</Text>
            </TouchableOpacity>

          </> : <>
            <View style={styles.createTplHeader}>
              <TouchableOpacity onPress={() => setCreating(false)}>
                <Ionicons name="chevron-back" size={20} color="#6B6560" />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>New Template</Text>
              <View style={{ width: 20 }} />
            </View>

            <TextInput
              style={styles.titleInput}
              placeholder="Template name..."
              placeholderTextColor="#A09990"
              value={newTplName}
              onChangeText={setNewTplName}
              autoFocus
              returnKeyType="done"
            />

            <Text style={styles.fieldLabel}>Add Sections</Text>
            <View style={styles.sectionTypeRow}>
              {SECTION_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.sectionTypeBtn, { borderColor: SECTION_COLORS[opt.type]?.outline ?? '#D1D5DB' }]}
                  onPress={() => addSection(opt.type)}
                >
                  <Text style={[styles.sectionTypeBtnText, { color: SECTION_COLORS[opt.type]?.label ?? '#374151' }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {newTplSections.length > 0 && (
              <ScrollView style={styles.newTplSectionList} showsVerticalScrollIndicator={false}>
                {newTplSections.map((s, i) => (
                  <View key={i} style={styles.newTplSectionRow}>
                    <View style={[styles.newTplSectionDot, { backgroundColor: SECTION_COLORS[s.type]?.outline ?? '#D1D5DB' }]} />
                    <Text style={styles.newTplSectionLabel}>{s.label}</Text>
                    <TouchableOpacity onPress={() => setNewTplSections(prev => prev.filter((_, j) => j !== i))}>
                      <Ionicons name="close-circle" size={16} color="#C4BDB7" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: theme.accent, marginTop: 16 }, !newTplName.trim() && styles.createButtonDisabled]}
              onPress={saveNewTemplate}
              activeOpacity={0.8}
            >
              <Text style={styles.createButtonText}>Save Template</Text>
            </TouchableOpacity>
          </>}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Songs Screen ─────────────────────────────────────────────────────────────

export default function SongsScreen() {
  const { songs, createSong } = useSongsStore();
  const { theme, bgTheme } = useThemeStore();
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'm' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setShowNew(true);
      }
    }
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  function handleCreate(title: string, templateId: TemplateId) {
    const song = createSong(title, templateId);
    router.push(`/editor/${song.id}`);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: bgTheme.labelColor }]}>Songs</Text>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.accent }]} onPress={() => setShowNew(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {songs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={48} color="#D4CEC9" />
            <Text style={styles.emptyTitle}>No songs yet</Text>
            <Text style={styles.emptyText}>Tap + to create your first song.</Text>
          </View>
        ) : (
          songs.map(song => (
            <SongCard
              key={song.id}
              song={song}
              onPress={() => router.push(`/editor/${song.id}`)}
            />
          ))
        )}
      </ScrollView>

      <NewSongSheet
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreate={handleCreate}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1A17',
    letterSpacing: -0.5,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#6B6560',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#A09990',
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(28,26,23,0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1A17',
    flex: 1,
    marginRight: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F5F1EB',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B6560',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cardDate: {
    fontSize: 12,
    color: '#A09990',
  },
  cardSections: {
    fontSize: 12,
    color: '#A09990',
  },

  // Sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E0D8',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1A17',
    marginBottom: 20,
  },
  titleInput: {
    backgroundColor: '#F5F1EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1A17',
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A09990',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  templateScroll: {
    marginBottom: 20,
  },
  templateScrollContent: {
    gap: 10,
    paddingRight: 4,
  },
  templateCard: {
    width: 130,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F5F1EB',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  templateCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B6560',
    marginBottom: 3,
  },
  templateCardSub: {
    fontSize: 11,
    color: '#A09990',
    marginBottom: 6,
  },
  templateSectionStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  templateSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  templateAddCard: {
    width: 80,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F5F1EB',
    borderWidth: 1.5,
    borderColor: '#E5DDD4',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  templateAddText: {
    fontSize: 12,
    color: '#A09990',
    fontWeight: '500',
  },
  createTplHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  sectionTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#F5F1EB',
  },
  sectionTypeBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  newTplSectionList: {
    maxHeight: 120,
    marginBottom: 8,
  },
  newTplSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  newTplSectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  newTplSectionLabel: {
    flex: 1,
    fontSize: 14,
    color: '#4B4540',
  },
  createButton: {
    backgroundColor: '#D97706',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#E5DDD4',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
