import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';
import { useFeedStore } from '@/store/feedStore';
import { useSongsStore } from '@/store/songsStore';
import { useThemeStore } from '@/store/themeStore';
import type { PostCard } from '@/store/feedStore';
import type { SongCard } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── New Post sheet ───────────────────────────────────────────────────────────

type NewPostSheetProps = {
  visible: boolean;
  songs: SongCard[];
  onClose: () => void;
  onPost: (songId: string, description: string) => void;
};

function NewPostSheet({ visible, songs, onClose, onPost }: NewPostSheetProps) {
  const { theme } = useThemeStore();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 600,
        useNativeDriver: true,
        bounciness: 4,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
    if (!visible) {
      setSelectedSongId(null);
      setDescription('');
    }
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(translateY, onClose);

  function handlePost() {
    if (!selectedSongId) return;
    onPost(selectedSongId, description);
    onClose();
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.backdrop} />
        </Pressable>
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SheetGrabHandle handlers={swipeHandlers} />
          <Text style={styles.sheetTitle}>Share a song</Text>

          {/* Song picker */}
          <Text style={styles.sheetLabel}>Choose a song</Text>
          {songs.length === 0 ? (
            <View style={styles.noSongs}>
              <Text style={styles.noSongsText}>No songs yet — create one in the Songs tab.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.songPicker}
              showsVerticalScrollIndicator={false}
            >
              {songs.map(song => (
                <TouchableOpacity
                  key={song.id}
                  style={[
                    styles.songOption,
                    selectedSongId === song.id && { backgroundColor: theme.accentLight },
                  ]}
                  onPress={() => setSelectedSongId(song.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="musical-note"
                    size={14}
                    color={selectedSongId === song.id ? theme.accent : '#8A7D6F'}
                  />
                  <Text
                    style={[
                      styles.songOptionText,
                      selectedSongId === song.id && { color: theme.accent, fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {song.title}
                  </Text>
                  {selectedSongId === song.id && (
                    <Ionicons name="checkmark" size={16} color={theme.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Description */}
          <Text style={styles.sheetLabel}>Add a note (optional)</Text>
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="What's going on with this track..."
            placeholderTextColor="#B5A898"
            multiline
            maxLength={200}
          />

          {/* Actions */}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.postBtn, { backgroundColor: selectedSongId ? theme.accent : theme.accentLight }]}
              onPress={handlePost}
              disabled={!selectedSongId}
            >
              <Text style={[styles.postBtnText, { color: selectedSongId ? '#fff' : theme.accent }]}>Post</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

type PostCardViewProps = {
  post: PostCard;
  songTitle: string | undefined;
  isShelfed: boolean;
  onToggleShelf: () => void;
  onDelete: () => void;
};

function PostCardView({ post, songTitle, isShelfed, onToggleShelf, onDelete }: PostCardViewProps) {
  const { theme } = useThemeStore();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardSong}>
          <Ionicons name="musical-notes" size={13} color={theme.accent} />
          <Text style={styles.cardSongTitle} numberOfLines={1}>
            {songTitle ?? 'Unknown Song'}
          </Text>
        </View>
        <Text style={styles.cardTime}>{relativeTime(post.createdAt)}</Text>
      </View>

      {!!post.description && (
        <Text style={styles.cardDesc}>{post.description}</Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardAction} onPress={onToggleShelf} activeOpacity={0.7}>
          <Ionicons
            name={isShelfed ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isShelfed ? theme.accent : '#8A7D6F'}
          />
          <Text style={[styles.cardActionLabel, isShelfed && { color: theme.accent }]}>
            {isShelfed ? 'Shelved' : 'Shelf'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardAction} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={17} color="#C4B5A8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Filter = 'all' | 'shelved';

export default function FeedScreen() {
  const posts = useFeedStore(s => s.posts);
  const shelvedIds = useFeedStore(s => s.shelvedIds);
  const createPost = useFeedStore(s => s.createPost);
  const deletePost = useFeedStore(s => s.deletePost);
  const toggleShelf = useFeedStore(s => s.toggleShelf);
  const isShelfed = useFeedStore(s => s.isShelfed);

  const songs = useSongsStore(s => s.songs);
  const songMap = new Map<string, SongCard>(songs.map(s => [s.id, s]));

  const { theme, bgTheme } = useThemeStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [showNewPost, setShowNewPost] = useState(false);

  const displayed = filter === 'shelved'
    ? posts.filter(p => shelvedIds.has(p.id))
    : posts;

  function handlePost(songId: string, description: string) {
    createPost(songId, description || undefined);
  }

  return (
    <View style={[styles.container, { backgroundColor: bgTheme.bg }]}>
      <SafeAreaView>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: bgTheme.labelColor }]}>Feed</Text>
          <TouchableOpacity style={[styles.newPostBtn, { backgroundColor: theme.accent }]} onPress={() => setShowNewPost(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newPostBtnText}>Post</Text>
          </TouchableOpacity>
        </View>

        {/* Filter pills */}
        <View style={styles.filterRow}>
          {(['all', 'shelved'] as Filter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && { backgroundColor: theme.accent }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f === 'all' ? 'All' : 'Shelved'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* Posts list */}
      {displayed.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="earth-outline" size={40} color="#D1C4B8" />
          <Text style={styles.emptyTitle}>
            {filter === 'shelved' ? 'Nothing shelved yet' : 'Your feed is empty'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filter === 'shelved'
              ? 'Tap the bookmark on any post to save it here.'
              : 'Share a song update with the Post button above.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PostCardView
              post={item}
              songTitle={songMap.get(item.songId)?.title}
              isShelfed={isShelfed(item.id)}
              onToggleShelf={() => toggleShelf(item.id)}
              onDelete={() => deletePost(item.id)}
            />
          )}
        />
      )}

      {/* New Post bottom sheet */}
      <NewPostSheet
        visible={showNewPost}
        songs={songs}
        onClose={() => setShowNewPost(false)}
        onPost={handlePost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1A17',
    letterSpacing: -0.5,
  },
  newPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newPostBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0EBE4',
  },
  filterPillActive: {},
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8A7D6F',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardSong: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  cardSongTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1A17',
    flex: 1,
  },
  cardTime: {
    fontSize: 12,
    color: '#B5A898',
    marginLeft: 8,
  },
  cardDesc: {
    fontSize: 14,
    color: '#4A3F35',
    lineHeight: 20,
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardActionLabel: {
    fontSize: 13,
    color: '#8A7D6F',
  },
  cardActionLabelActive: {},
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4A3F35',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8A7D6F',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E0D8D0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1A17',
    marginBottom: 16,
  },
  sheetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A7D6F',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  noSongs: {
    paddingVertical: 12,
    marginBottom: 16,
  },
  noSongsText: {
    fontSize: 14,
    color: '#8A7D6F',
    textAlign: 'center',
  },
  songPicker: {
    maxHeight: 180,
    marginBottom: 16,
  },
  songOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#FAF8F4',
  },
  songOptionSelected: {},
  songOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#4A3F35',
  },
  songOptionTextSelected: {},
  descInput: {
    backgroundColor: '#FAF8F4',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1C1A17',
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F0EBE4',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8A7D6F',
  },
  postBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  postBtnDisabled: {},
  postBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
