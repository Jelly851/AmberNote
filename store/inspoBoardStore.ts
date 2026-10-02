import { create } from 'zustand';

import {
  DEFAULT_CHIP_COLOR,
  DEFAULT_TEXT_COLOR,
  chipColorForWord,
  type BoardBackground,
  type ChipConnection,
  type ChipStyle,
  type FontVariant,
  type InspoBoard,
  type InspoChip,
} from '@/lib/inspo';
import {
  decomposeBackdrop,
  elementId,
  type AmbientFx,
  type BgBase,
  type BgElement,
} from '@/lib/bgElements';

const STORAGE_KEY = 'an_inspo_boards';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const STYLE_MIGRATION: Record<string, string> = { pill: 'word', tag: 'lyric', torn: 'word' };

function migrateChip(c: any): InspoChip {
  const rawStyle = c.style ?? 'word';
  return {
    id: c.id,
    boardId: c.boardId,
    text: c.text,
    style: (STYLE_MIGRATION[rawStyle] ?? rawStyle) as InspoChip['style'],
    color: c.color ?? DEFAULT_CHIP_COLOR,
    textColor: c.textColor ?? DEFAULT_TEXT_COLOR,
    fontVariant: c.fontVariant ?? 'sans',
    fontSize: c.fontSize ?? undefined,
    imageUri: c.imageUri ?? undefined,
    audioUri: c.audioUri ?? undefined,
    audioDuration: c.audioDuration ?? undefined,
    x: c.x ?? 0.1 + Math.random() * 0.7,
    y: c.y ?? 0.1 + Math.random() * 0.6,
    createdAt: c.createdAt,
  };
}

function load(): InspoBoard[] {
  try {
    const raw = (globalThis as any).localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const boards = JSON.parse(raw) as any[];
      return boards.map(b => {
        // migrate pre-element boards: decompose their template into editable data
        const decomposed = b.bgBase ? null : decomposeBackdrop(b.background ?? 'blank', b.id ?? 'seed');
        return {
          ...b,
          chips: (b.chips ?? []).map(migrateChip),
          connections: b.connections ?? [],
          bgBase: b.bgBase ?? decomposed!.base,
          bgElements: b.bgElements ?? decomposed?.elements ?? [],
          ambientFx: b.ambientFx ?? decomposed?.ambient ?? 'none',
          backdropTint: b.backdropTint ?? null,
          textureIntensity: b.textureIntensity ?? 1,
          moodGlow: b.moodGlow ?? true,
        };
      });
    }
  } catch {}
  return [];
}

function save(boards: InspoBoard[]) {
  try {
    (globalThis as any).localStorage?.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch {}
}

interface InspoBoardStore {
  boards: InspoBoard[];

  createBoard: (title: string, background?: BoardBackground) => InspoBoard;
  updateBoard: (id: string, patch: Partial<Pick<InspoBoard, 'title' | 'background' | 'accentColor' | 'notes' | 'linkedSongId' | 'backdropTint' | 'textureIntensity' | 'moodGlow'>>) => void;
  deleteBoard: (id: string) => void;

  addChip: (boardId: string, text: string, opts?: Partial<Pick<InspoChip, 'style' | 'color' | 'textColor' | 'fontVariant' | 'fontSize' | 'x' | 'y' | 'imageUri' | 'audioUri' | 'audioDuration'>>) => InspoChip;
  updateChip: (boardId: string, chipId: string, patch: Partial<Pick<InspoChip, 'text' | 'style' | 'color' | 'textColor' | 'fontVariant' | 'fontSize' | 'rotation' | 'x' | 'y' | 'imageUri' | 'audioUri' | 'audioDuration'>>) => void;
  deleteChip: (boardId: string, chipId: string) => void;

  addConnection: (boardId: string, fromChipId: string, toChipId: string) => void;
  deleteConnection: (boardId: string, connectionId: string) => void;

  // ── background editing ──
  /** replace the whole background with a template's decomposition */
  applyTemplate: (boardId: string, backdropId: BoardBackground) => void;
  setBgBase: (boardId: string, base: Partial<BgBase>) => void;
  setAmbientFx: (boardId: string, fx: AmbientFx) => void;
  addBgElement: (boardId: string, element: Omit<BgElement, 'id' | 'z'> & { z?: number }) => BgElement;
  updateBgElement: (boardId: string, elementId: string, patch: Partial<Omit<BgElement, 'id'>>) => void;
  duplicateBgElement: (boardId: string, elementId: string) => BgElement | undefined;
  reorderBgElement: (boardId: string, elementId: string, dir: 'forward' | 'back') => void;
  deleteBgElement: (boardId: string, elementId: string) => void;

  linkSong: (boardId: string, songId: string | null) => void;
  getBoardForSong: (songId: string) => InspoBoard | undefined;
}

export const useInspoBoardStore = create<InspoBoardStore>((set, get) => ({
  boards: load(),

  createBoard(title, background = 'parchment') {
    const now = new Date().toISOString();
    const id = uid();
    const decomposed = decomposeBackdrop(background, id);
    const board: InspoBoard = {
      id,
      title: title.trim() || 'Untitled Board',
      background,
      accentColor: '#F59E0B',
      chips: [],
      connections: [],
      linkedSongId: null,
      notes: '',
      bgBase: decomposed.base,
      bgElements: decomposed.elements,
      ambientFx: decomposed.ambient,
      backdropTint: null,
      textureIntensity: 1,
      moodGlow: true,
      createdAt: now,
      updatedAt: now,
    };
    const boards = [board, ...get().boards];
    save(boards);
    set({ boards });
    return board;
  },

  updateBoard(id, patch) {
    const boards = get().boards.map(b =>
      b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b
    );
    save(boards);
    set({ boards });
  },

  deleteBoard(id) {
    const boards = get().boards.filter(b => b.id !== id);
    save(boards);
    set({ boards });
  },

  addChip(boardId, text, opts = {}) {
    const chip: InspoChip = {
      id: uid(),
      boardId,
      text: text.trim(),
      style: opts.style ?? 'word',
      color: opts.color ?? chipColorForWord(text),
      textColor: opts.textColor ?? DEFAULT_TEXT_COLOR,
      fontVariant: opts.fontVariant ?? 'sans',
      fontSize: opts.fontSize,
      imageUri: opts.imageUri,
      audioUri: opts.audioUri,
      audioDuration: opts.audioDuration,
      x: opts.x ?? 0.08 + Math.random() * 0.72,
      y: opts.y ?? 0.08 + Math.random() * 0.60,
      createdAt: new Date().toISOString(),
    };
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, chips: [...b.chips, chip], updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
    return chip;
  },

  updateChip(boardId, chipId, patch) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? {
            ...b,
            chips: b.chips.map(c => (c.id === chipId ? { ...c, ...patch } : c)),
            updatedAt: new Date().toISOString(),
          }
        : b
    );
    save(boards);
    set({ boards });
  },

  deleteChip(boardId, chipId) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, chips: b.chips.filter(c => c.id !== chipId), updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
  },

  addConnection(boardId, fromChipId, toChipId) {
    const board = get().boards.find(b => b.id === boardId);
    if (!board) return;
    // Prevent duplicate connections
    const exists = board.connections.some(
      c => (c.fromChipId === fromChipId && c.toChipId === toChipId) ||
           (c.fromChipId === toChipId && c.toChipId === fromChipId)
    );
    if (exists) return;
    const conn: ChipConnection = { id: uid(), fromChipId, toChipId };
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, connections: [...b.connections, conn], updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
  },

  deleteConnection(boardId, connectionId) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, connections: b.connections.filter(c => c.id !== connectionId), updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
  },

  applyTemplate(boardId, backdropId) {
    const decomposed = decomposeBackdrop(backdropId, boardId + ':' + Date.now().toString(36));
    const boards = get().boards.map(b =>
      b.id === boardId
        ? {
            ...b,
            background: backdropId,
            bgBase: decomposed.base,
            bgElements: decomposed.elements,
            ambientFx: decomposed.ambient,
            updatedAt: new Date().toISOString(),
          }
        : b
    );
    save(boards);
    set({ boards });
  },

  setBgBase(boardId, patch) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, bgBase: { colors: ['#FAFAF8'], ...b.bgBase, ...patch }, updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
  },

  setAmbientFx(boardId, fx) {
    const boards = get().boards.map(b =>
      b.id === boardId ? { ...b, ambientFx: fx, updatedAt: new Date().toISOString() } : b
    );
    save(boards);
    set({ boards });
  },

  addBgElement(boardId, element) {
    const board = get().boards.find(b => b.id === boardId);
    const maxZ = board?.bgElements?.reduce((m, e) => Math.max(m, e.z), 0) ?? 0;
    const el: BgElement = { ...element, id: elementId(), z: element.z ?? maxZ + 1 };
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, bgElements: [...(b.bgElements ?? []), el], updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
    return el;
  },

  updateBgElement(boardId, elId, patch) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? {
            ...b,
            bgElements: (b.bgElements ?? []).map(e => (e.id === elId ? { ...e, ...patch } : e)),
            updatedAt: new Date().toISOString(),
          }
        : b
    );
    save(boards);
    set({ boards });
  },

  duplicateBgElement(boardId, elId) {
    const board = get().boards.find(b => b.id === boardId);
    const src = board?.bgElements?.find(e => e.id === elId);
    if (!board || !src) return undefined;
    const maxZ = board.bgElements!.reduce((m, e) => Math.max(m, e.z), 0);
    const copy: BgElement = {
      ...src,
      id: elementId(),
      x: Math.min(0.97, src.x + 0.05),
      y: Math.min(0.97, src.y + 0.05),
      z: maxZ + 1,
      fill: { ...src.fill },
    };
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, bgElements: [...b.bgElements!, copy], updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
    return copy;
  },

  reorderBgElement(boardId, elId, dir) {
    const board = get().boards.find(b => b.id === boardId);
    if (!board?.bgElements) return;
    // swap z with the nearest neighbor in that direction
    const sorted = [...board.bgElements].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex(e => e.id === elId);
    if (idx === -1) return;
    const swapIdx = dir === 'forward' ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], bEl = sorted[swapIdx];
    const boards = get().boards.map(b =>
      b.id === boardId
        ? {
            ...b,
            bgElements: b.bgElements!.map(e =>
              e.id === a.id ? { ...e, z: bEl.z } : e.id === bEl.id ? { ...e, z: a.z } : e
            ),
            updatedAt: new Date().toISOString(),
          }
        : b
    );
    save(boards);
    set({ boards });
  },

  deleteBgElement(boardId, elId) {
    const boards = get().boards.map(b =>
      b.id === boardId
        ? { ...b, bgElements: (b.bgElements ?? []).filter(e => e.id !== elId), updatedAt: new Date().toISOString() }
        : b
    );
    save(boards);
    set({ boards });
  },

  linkSong(boardId, songId) {
    let boards = get().boards.map(b =>
      b.id !== boardId && b.linkedSongId === songId ? { ...b, linkedSongId: null } : b
    );
    boards = boards.map(b =>
      b.id === boardId ? { ...b, linkedSongId: songId, updatedAt: new Date().toISOString() } : b
    );
    save(boards);
    set({ boards });
  },

  getBoardForSong(songId) {
    return get().boards.find(b => b.linkedSongId === songId);
  },
}));
