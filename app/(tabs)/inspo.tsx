import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { BOARD_TEMPLATES, getBackdrop, type BoardBackground, type InspoBoard } from '@/lib/inspo';
import { themeForBase } from '@/lib/bgElements';
import CustomBackdrop from '@/components/CustomBackdrop';
import BoardBackdrop from '@/components/BoardBackdrop';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';
import { useInspoBoardStore } from '@/store/inspoBoardStore';
import { useThemeStore } from '@/store/themeStore';
import { LinkSongSheet } from '../inspo/[id]';

// ─── Board thumbnail card ─────────────────────────────────────────────────────

function BoardCard({ board }: { board: InspoBoard }) {
  const { theme } = useThemeStore();
  const deleteBoard = useInspoBoardStore(s => s.deleteBoard);
  const updateBoard = useInspoBoardStore(s => s.updateBoard);
  const linkSong = useInspoBoardStore(s => s.linkSong);
  const bg = getBackdrop(board.background);
  const baseColors = board.bgBase?.colors?.length ? board.bgBase.colors : bg.baseColors;
  const ink = themeForBase({ colors: baseColors }).fg;
  const previewChips = board.chips.slice(0, 5);
  // sized from the window (cards are full-width); overflow:hidden clips the excess
  const { width: winW } = useWindowDimensions();
  const cardW = winW - 32;
  const cardH = 150;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<any>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [linking, setLinking] = useState(false);

  function handleDelete() {
    setMenuOpen(false);
    Alert.alert('Delete Board', `Delete "${board.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBoard(board.id) },
    ]);
  }

  function handleRename() {
    setMenuOpen(false);
    setRenameText(board.title);
    setRenaming(true);
  }

  function confirmRename() {
    if (renameText.trim()) updateBoard(board.id, { title: renameText.trim() });
    setRenaming(false);
  }

  function handleLink() {
    setMenuOpen(false);
    setLinking(true);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: baseColors[0], overflow: 'hidden' }]}
        activeOpacity={0.8}
        onPress={() => router.push(`/inspo/${board.id}`)}
      >
        <CustomBackdrop
          data={{
            base: board.bgBase ?? { colors: bg.baseColors },
            elements: board.bgElements ?? [],
            ambient: board.ambientFx ?? 'none',
          }}
          width={cardW}
          height={cardH}
          quality="lite"
          animated={false}
          intensity={board.textureIntensity ?? 1}
          tint={board.backdropTint ?? null}
        />

        {/* Mini chip preview */}
        <View style={styles.cardChipRow}>
          {previewChips.map(chip => (
            <View key={chip.id} style={[styles.cardChip, { backgroundColor: (chip.color === 'none' ? '#B0A89E' : chip.color) + '28', borderColor: (chip.color === 'none' ? '#B0A89E' : chip.color) + '55' }]}>
              <Text style={[styles.cardChipText, { color: ink }]} numberOfLines={1}>
                {chip.text}
              </Text>
            </View>
          ))}
          {board.chips.length === 0 && (
            <Text style={[styles.cardEmpty, { color: ink + '66' }]}>Empty board</Text>
          )}
        </View>

        {/* Board title */}
        <Text style={[styles.cardTitle, { color: ink }]} numberOfLines={1}>
          {board.title}
        </Text>

        {/* Accent dot + chip count */}
        <View style={styles.cardFooter}>
          <View style={[styles.accentDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.cardMeta, { color: ink + '88' }]}>
            {board.chips.length} {board.chips.length === 1 ? 'chip' : 'chips'}
          </Text>
          {board.linkedSongId && (
            <View style={styles.linkedBadge}>
              <Ionicons name="musical-note" size={9} color={theme.accent} />
            </View>
          )}
        </View>

        {/* Three-dot menu button */}
        <TouchableOpacity
          ref={menuBtnRef}
          style={styles.cardMenuBtn}
          onPress={() => {
            menuBtnRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
              const screenW = Dimensions.get('window').width;
              setMenuPos({ top: y + h + 6, right: screenW - x - w });
              setMenuOpen(true);
            });
          }}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={ink + 'AA'} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Board action menu */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={cardSt.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={[cardSt.menu, { position: 'absolute', top: menuPos.top, right: menuPos.right }]} onPress={() => {}}>
            <Text style={cardSt.menuTitle} numberOfLines={1}>{board.title}</Text>
            <View style={cardSt.divider} />

            <TouchableOpacity style={cardSt.row} onPress={handleRename}>
              <Ionicons name="pencil-outline" size={17} color="#1C1A17" />
              <Text style={cardSt.rowText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity style={cardSt.row} onPress={handleLink}>
              <Ionicons name="musical-note-outline" size={17} color="#1C1A17" />
              <Text style={cardSt.rowText}>Link</Text>
            </TouchableOpacity>

            <View style={cardSt.divider} />

            <TouchableOpacity style={cardSt.row} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={17} color="#EF4444" />
              <Text style={[cardSt.rowText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename modal */}
      <Modal visible={renaming} transparent animationType="fade">
        <Pressable style={cardSt.renameOverlay} onPress={() => setRenaming(false)}>
          <Pressable style={cardSt.renameBox} onPress={() => {}}>
            <Text style={cardSt.renameTitle}>Rename Board</Text>
            <TextInput
              style={cardSt.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              returnKeyType="done"
              selectTextOnFocus
              onSubmitEditing={confirmRename}
            />
            <TouchableOpacity style={[cardSt.renameBtn, { backgroundColor: theme.accent }]} onPress={confirmRename}>
              <Text style={cardSt.renameBtnText}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <LinkSongSheet
        visible={linking}
        currentSongId={board.linkedSongId}
        accentColor={theme.accent}
        onLink={songId => linkSong(board.id, songId)}
        onClose={() => setLinking(false)}
      />
    </>
  );
}

// ─── New board sheet ──────────────────────────────────────────────────────────

function NewBoardSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useThemeStore();
  const createBoard = useInspoBoardStore(s => s.createBoard);
  const [title, setTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('parchment');
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 240, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  useEscapeKey(() => { Keyboard.dismiss(); onClose(); }, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  function handleCreate() {
    const tmpl = BOARD_TEMPLATES.find(t => t.id === selectedTemplate) ?? BOARD_TEMPLATES[0];
    const board = createBoard(title, tmpl.background as BoardBackground);
    setTitle('');
    setSelectedTemplate('parchment');
    onClose();
    router.push(`/inspo/${board.id}`);
  }

  return (
    <Modal visible={mounted} transparent animationType="none">
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <SheetGrabHandle handlers={swipeHandlers} />
        <Text style={styles.sheetTitle}>New Mood Board</Text>

        <TextInput
          style={styles.sheetInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Board name..."
          placeholderTextColor="#A09890"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />

        <Text style={styles.fieldLabel}>Template</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll} contentContainerStyle={styles.templateRow}>
          {BOARD_TEMPLATES.map(tmpl => {
            const active = selectedTemplate === tmpl.id;
            return (
              <TouchableOpacity
                key={tmpl.id}
                style={[styles.templateCard, active && { borderColor: theme.accent, borderWidth: 2 }]}
                onPress={() => setSelectedTemplate(tmpl.id)}
                activeOpacity={0.8}
              >
                <View style={styles.templateSwatch}>
                  <BoardBackdrop backdropId={tmpl.background} width={90} height={52} quality="lite" animated={false} />
                  {active && <Ionicons name="checkmark-circle" size={16} color={theme.accent} style={styles.templateCheck} />}
                </View>
                <Text style={[styles.templateName, active && { color: theme.accent }]} numberOfLines={1}>{tmpl.name}</Text>
                <Text style={styles.templateDesc} numberOfLines={1}>{tmpl.description}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.sheetBtn, { backgroundColor: theme.accent }]}
          onPress={handleCreate}
        >
          <Text style={styles.sheetBtnText}>Create Board</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InspoScreen() {
  const { theme, bgTheme } = useThemeStore();
  const boards = useInspoBoardStore(s => s.boards);
  const [showNew, setShowNew] = useState(false);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgTheme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: bgTheme.labelColor }]}>Inspo</Text>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: theme.accent }]}
          onPress={() => setShowNew(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>New Board</Text>
        </TouchableOpacity>
      </View>

      {boards.length === 0 ? (
        // Empty state
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✦</Text>
          <Text style={styles.emptyTitle}>No mood boards yet</Text>
          <Text style={styles.emptyBody}>Create a board to collect words,{'\n'}phrases, and ideas for a song.</Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: theme.accent }]}
            onPress={() => setShowNew(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>Create your first board</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {boards.map(board => (
            <BoardCard key={board.id} board={board} />
          ))}
          {/* Trailing add card */}
          <TouchableOpacity style={styles.addCard} onPress={() => setShowNew(true)} activeOpacity={0.7}>
            <Ionicons name="add" size={28} color={theme.accent} />
            <Text style={[styles.addCardText, { color: theme.accent }]}>New Board</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <NewBoardSheet visible={showNew} onClose={() => setShowNew(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F6F3EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1A17',
    letterSpacing: -0.5,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Board list
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    minHeight: 28,
  },
  cardChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardEmpty: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardMeta: {
    fontSize: 12,
    flex: 1,
  },
  linkedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMenuBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add card
  addCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD8D0',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
  },
  addCardText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#C4BDB7',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1A17',
  },
  emptyBody: {
    fontSize: 14,
    color: '#8A7D6F',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // New board sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#FDFAF5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 14,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD8D0',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1A17',
    textAlign: 'center',
  },
  sheetInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD8D0',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#1C1A17',
    backgroundColor: '#FFFFFF',
  },
  sheetBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A7D6F',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: -6,
  },
  templateScroll: {
    marginHorizontal: -24,
  },
  templateRow: {
    paddingHorizontal: 24,
    gap: 10,
  },
  templateCard: {
    width: 90,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD8D0',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  templateSwatch: {
    height: 52,
    alignItems: 'flex-end',
    padding: 4,
  },
  templateCheck: {
    margin: 2,
  },
  templateName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1A17',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  templateDesc: {
    fontSize: 10,
    color: '#A09890',
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 1,
  },
});

const cardSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  menu: {
    width: 220,
    backgroundColor: '#FDFAF5',
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A09890',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E8E2D8', marginHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  rowText: { fontSize: 15, fontWeight: '500', color: '#1C1A17', flex: 1 },
  renameBox: {
    width: 300,
    backgroundColor: '#FDFAF5',
    borderRadius: 18,
    padding: 22,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  renameTitle: { fontSize: 16, fontWeight: '700', color: '#1C1A17', textAlign: 'center' },
  renameInput: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD8D0',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#1C1A17',
    backgroundColor: '#FFFFFF',
  },
  renameBtn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  renameBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
