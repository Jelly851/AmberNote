import { create } from 'zustand';
import * as db from '@/lib/db';
import type { Post, SongCard } from '@/lib/types';

export type PostCard = Post & { song: SongCard | undefined };

interface FeedState {
  posts: PostCard[];
  shelvedIds: Set<string>;

  init: () => void;
  createPost: (songId: string, description?: string) => Post;
  deletePost: (id: string) => void;
  toggleShelf: (postId: string) => void;
  isShelfed: (postId: string) => boolean;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  shelvedIds: new Set(),

  init() {
    const posts = db.getPosts().map(p => ({ ...p, song: undefined }));
    const shelvedIds = db.getShelvedPostIds();
    set({ posts, shelvedIds });
  },

  createPost(songId, description) {
    const post = db.createPost(songId, description);
    set(s => ({ posts: [{ ...post, song: undefined }, ...s.posts] }));
    return post;
  },

  deletePost(id) {
    db.deletePost(id);
    set(s => ({ posts: s.posts.filter(p => p.id !== id) }));
  },

  toggleShelf(postId) {
    const shelved = get().shelvedIds.has(postId);
    if (shelved) {
      db.unshelfPost(postId);
      set(s => {
        const next = new Set(s.shelvedIds);
        next.delete(postId);
        return { shelvedIds: next };
      });
    } else {
      db.shelfPost(postId);
      set(s => {
        const next = new Set(s.shelvedIds);
        next.add(postId);
        return { shelvedIds: next };
      });
    }
  },

  isShelfed(postId) {
    return get().shelvedIds.has(postId);
  },
}));
