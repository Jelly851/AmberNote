import { create } from 'zustand';
import * as db from '@/lib/db';
import { MAIN_FOLDER_ID } from '@/lib/constants';
import type { Folder, Recording, TagName } from '@/lib/types';

interface CaptureState {
  folders: Folder[];
  recordings: Recording[];
  activeFolderId: string;

  // Initialise — call once on app start after initDb()
  init: () => void;

  // Folders
  setActiveFolder: (folderId: string) => void;
  createFolder: (name: string, parentId?: string) => Folder;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  deleteFolder: (id: string) => void;

  // Recordings
  createRecording: (
    folderId: string,
    filePath: string,
    duration: number,
    tags?: TagName[],
    title?: string
  ) => Recording;
  updateRecording: (
    id: string,
    updates: Partial<Pick<Recording, 'title' | 'tags' | 'folderId' | 'bpm' | 'trimIn' | 'trimOut' | 'waveformData'>>
  ) => void;
  deleteRecording: (id: string) => void;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  folders: [],
  recordings: [],
  activeFolderId: MAIN_FOLDER_ID,

  init() {
    const folders = db.getFolders();
    const recordings = db.getRecordings(MAIN_FOLDER_ID);
    set({ folders, recordings });
  },

  setActiveFolder(folderId) {
    const recordings = db.getRecordings(folderId);
    set({ activeFolderId: folderId, recordings });
  },

  createFolder(name, parentId) {
    const folder = db.createFolder(name, undefined, parentId);
    set(s => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  renameFolder(id, name) {
    db.renameFolder(id, name);
    set(s => ({ folders: s.folders.map(f => f.id === id ? { ...f, name } : f) }));
  },

  moveFolder(id, parentId) {
    db.moveFolder(id, parentId);
    set(s => ({ folders: s.folders.map(f => f.id === id ? { ...f, parentId } : f) }));
  },

  deleteFolder(id) {
    db.deleteFolder(id);
    const { activeFolderId } = get();
    const nextActiveId = activeFolderId === id ? MAIN_FOLDER_ID : activeFolderId;
    const folders = db.getFolders();
    const recordings = db.getRecordings(nextActiveId);
    // Re-fetch because child folders may have been re-parented
    set({ folders, recordings, activeFolderId: nextActiveId });
  },

  createRecording(folderId, filePath, duration, tags = [], title) {
    const recording = db.createRecording(folderId, filePath, duration, tags, title);
    // Only prepend to the list if we're currently viewing that folder
    if (get().activeFolderId === folderId) {
      set(s => ({ recordings: [recording, ...s.recordings] }));
    }
    return recording;
  },

  updateRecording(id, updates) {
    db.updateRecording(id, updates);
    set(s => {
      const moved = updates.folderId !== undefined && updates.folderId !== s.activeFolderId;
      return {
        recordings: moved
          ? s.recordings.filter(r => r.id !== id)
          : s.recordings.map(r => (r.id === id ? { ...r, ...updates } : r)),
      };
    });
  },

  deleteRecording(id) {
    db.deleteRecording(id);
    set(s => ({ recordings: s.recordings.filter(r => r.id !== id) }));
  },
}));
