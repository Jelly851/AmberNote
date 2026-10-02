import { create } from 'zustand';
import * as db from '@/lib/db';
import type {
  AudioLayer,
  ChordCell,
  LayerType,
  Line,
  NoteValue,
  RhythmCell,
  Section,
  SectionType,
  Song,
  SongCard,
  TemplateId,
} from '@/lib/types';

interface SongsState {
  songs: SongCard[];

  // Active song context (populated when a song is opened)
  activeSong: Song | null;
  sections: Section[];
  lines: Record<string, Line[]>;           // sectionId → lines
  chordCells: Record<string, ChordCell[]>;  // lineId → cells
  rhythmCells: Record<string, RhythmCell[]>; // lineId → cells
  audioLayers: Record<string, AudioLayer[]>; // lineId → layers

  // Songs list
  init: () => void;
  createSong: (title: string, templateId?: TemplateId) => SongCard;
  updateSong: (id: string, updates: Partial<Omit<Song, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteSong: (id: string) => void;

  // Open / close a song (loads sections + lines)
  openSong: (songId: string) => void;
  closeSong: () => void;

  // Sections (require an open song)
  addSection: (type: SectionType, label: string) => Section;
  updateSection: (id: string, updates: Partial<Pick<Section, 'label' | 'order'>>) => void;
  reorderSections: (orderedIds: string[]) => void;
  deleteSection: (id: string) => void;

  // Lines
  addLine: (sectionId: string) => Line;
  updateLine: (id: string, updates: Partial<Pick<Line, 'text' | 'order' | 'chordResolution' | 'beatOffset'>>) => void;
  reorderLines: (sectionId: string, orderedIds: string[]) => void;
  deleteLine: (id: string) => void;

  // Chord cells (loaded on demand)
  loadChordCells: (lineId: string) => void;
  upsertChordCell: (
    lineId: string,
    position: number,
    chord: Partial<Pick<ChordCell, 'root' | 'quality' | 'inversion' | 'extension' | 'slashBass' | 'duration'>>
  ) => void;
  clearChordCell: (lineId: string, position: number) => void;

  // Rhythm cells (loaded on demand)
  loadRhythmCells: (lineId: string) => void;
  upsertRhythmCell: (lineId: string, position: number, noteValue: NoteValue, syllable?: string | null, pitch?: string | null) => void;
  clearRhythmCell: (lineId: string, position: number) => void;

  // Audio layers (loaded on demand)
  loadAudioLayers: (lineId: string) => void;
  addAudioLayer: (lineId: string, recordingId: string, layerType: LayerType) => AudioLayer;
  deleteAudioLayer: (id: string, lineId: string) => void;
}

export const useSongsStore = create<SongsState>((set, get) => ({
  songs: [],
  activeSong: null,
  sections: [],
  lines: {},
  chordCells: {},
  rhythmCells: {},
  audioLayers: {},

  // ── Songs list ────────────────────────────────────────────────────────────

  init() {
    set({ songs: db.getSongsWithSectionCount() });
  },

  createSong(title, templateId = 'pop') {
    const song = db.createSong(title, templateId);
    const sections = db.seedSectionsFromTemplate(song.id, templateId);
    const card: SongCard = { ...song, sectionCount: sections.length };
    set(s => ({ songs: [card, ...s.songs] }));
    return card;
  },

  updateSong(id, updates) {
    db.updateSong(id, updates);
    const now = new Date().toISOString();
    set(s => ({
      songs: s.songs.map(song =>
        song.id === id ? { ...song, ...updates, updatedAt: now } : song
      ),
      activeSong:
        s.activeSong?.id === id ? { ...s.activeSong, ...updates, updatedAt: now } : s.activeSong,
    }));
  },

  deleteSong(id) {
    db.deleteSong(id);
    set(s => ({
      songs: s.songs.filter(song => song.id !== id),
      activeSong: s.activeSong?.id === id ? null : s.activeSong,
    }));
  },

  // ── Active song ───────────────────────────────────────────────────────────

  openSong(songId) {
    const activeSong = get().songs.find(s => s.id === songId) ?? null;
    const sections = db.getSections(songId);
    const lines: Record<string, Line[]> = {};
    for (const section of sections) {
      lines[section.id] = db.getLines(section.id);
    }
    set({ activeSong, sections, lines, chordCells: {}, audioLayers: {} });
  },

  closeSong() {
    set({ activeSong: null, sections: [], lines: {}, chordCells: {}, rhythmCells: {}, audioLayers: {} });
  },

  // ── Sections ──────────────────────────────────────────────────────────────

  addSection(type, label) {
    const { activeSong, sections } = get();
    if (!activeSong) throw new Error('No active song');
    const order = sections.length;
    const section = db.createSection(activeSong.id, type, label, order);
    const firstLine = db.createLine(section.id, 0);
    set(s => ({
      sections: [...s.sections, section],
      lines: { ...s.lines, [section.id]: [firstLine] },
    }));
    return section;
  },

  updateSection(id, updates) {
    db.updateSection(id, updates);
    set(s => ({
      sections: s.sections.map(sec => (sec.id === id ? { ...sec, ...updates } : sec)),
    }));
  },

  reorderSections(orderedIds) {
    const { sections } = get();
    const sectionMap = new Map(sections.map(s => [s.id, s]));
    const reordered = orderedIds.map((id, index) => {
      db.updateSection(id, { order: index });
      return { ...sectionMap.get(id)!, order: index };
    });
    set({ sections: reordered });
  },

  deleteSection(id) {
    db.deleteSection(id);
    set(s => {
      const { [id]: _, ...remainingLines } = s.lines;
      return {
        sections: s.sections.filter(sec => sec.id !== id),
        lines: remainingLines,
      };
    });
  },

  // ── Lines ─────────────────────────────────────────────────────────────────

  addLine(sectionId) {
    const existingLines = get().lines[sectionId] ?? [];
    const order = existingLines.length;
    const line = db.createLine(sectionId, order);
    set(s => ({
      lines: {
        ...s.lines,
        [sectionId]: [...(s.lines[sectionId] ?? []), line],
      },
    }));
    return line;
  },

  updateLine(id, updates) {
    db.updateLine(id, updates);
    set(s => {
      const nextLines = { ...s.lines };
      for (const sectionId of Object.keys(nextLines)) {
        nextLines[sectionId] = nextLines[sectionId].map(l =>
          l.id === id ? { ...l, ...updates } : l
        );
      }
      return { lines: nextLines };
    });
  },

  reorderLines(sectionId, orderedIds) {
    const { lines } = get();
    const lineMap = new Map((lines[sectionId] ?? []).map(l => [l.id, l]));
    const reordered = orderedIds.map((id, index) => {
      db.updateLine(id, { order: index });
      return { ...lineMap.get(id)!, order: index };
    });
    set(s => ({ lines: { ...s.lines, [sectionId]: reordered } }));
  },

  deleteLine(id) {
    db.deleteLine(id);
    set(s => {
      const nextLines = { ...s.lines };
      for (const sectionId of Object.keys(nextLines)) {
        nextLines[sectionId] = nextLines[sectionId].filter(l => l.id !== id);
      }
      const { [id]: _, ...remainingCells } = s.chordCells;
      const { [id]: _r, ...remainingRhythm } = s.rhythmCells;
      const { [id]: __, ...remainingLayers } = s.audioLayers;
      return { lines: nextLines, chordCells: remainingCells, rhythmCells: remainingRhythm, audioLayers: remainingLayers };
    });
  },

  // ── Chord Cells ───────────────────────────────────────────────────────────

  loadChordCells(lineId) {
    const cells = db.getChordCells(lineId);
    set(s => ({ chordCells: { ...s.chordCells, [lineId]: cells } }));
  },

  upsertChordCell(lineId, position, chord: Partial<Pick<ChordCell, 'root' | 'quality' | 'inversion' | 'extension' | 'slashBass' | 'duration'>>) {
    const cell = db.upsertChordCell(lineId, position, chord);
    set(s => {
      const existing = s.chordCells[lineId] ?? [];
      const idx = existing.findIndex(c => c.position === position);
      const next = idx >= 0
        ? existing.map(c => (c.position === position ? cell : c))
        : [...existing, cell].sort((a, b) => a.position - b.position);
      return { chordCells: { ...s.chordCells, [lineId]: next } };
    });
  },

  clearChordCell(lineId, position) {
    db.deleteChordCell(lineId, position);
    set(s => ({
      chordCells: {
        ...s.chordCells,
        [lineId]: (s.chordCells[lineId] ?? []).filter(c => c.position !== position),
      },
    }));
  },

  // ── Rhythm Cells ─────────────────────────────────────────────────────────

  loadRhythmCells(lineId) {
    const cells = db.getRhythmCells(lineId);
    set(s => ({ rhythmCells: { ...s.rhythmCells, [lineId]: cells } }));
  },

  upsertRhythmCell(lineId, position, noteValue, syllable = null, pitch = null) {
    const cell = db.upsertRhythmCell(lineId, position, noteValue, syllable, pitch);
    set(s => {
      const existing = s.rhythmCells[lineId] ?? [];
      const idx = existing.findIndex(c => c.position === position);
      const next = idx >= 0
        ? existing.map(c => (c.position === position ? cell : c))
        : [...existing, cell].sort((a, b) => a.position - b.position);
      return { rhythmCells: { ...s.rhythmCells, [lineId]: next } };
    });
  },

  clearRhythmCell(lineId, position) {
    db.deleteRhythmCell(lineId, position);
    set(s => ({
      rhythmCells: {
        ...s.rhythmCells,
        [lineId]: (s.rhythmCells[lineId] ?? []).filter(c => c.position !== position),
      },
    }));
  },

  // ── Audio Layers ──────────────────────────────────────────────────────────

  loadAudioLayers(lineId) {
    const layers = db.getAudioLayers(lineId);
    set(s => ({ audioLayers: { ...s.audioLayers, [lineId]: layers } }));
  },

  addAudioLayer(lineId, recordingId, layerType) {
    const existing = get().audioLayers[lineId] ?? [];
    const layer = db.createAudioLayer(lineId, recordingId, layerType, existing.length);
    set(s => ({
      audioLayers: {
        ...s.audioLayers,
        [lineId]: [...(s.audioLayers[lineId] ?? []), layer],
      },
    }));
    return layer;
  },

  deleteAudioLayer(id, lineId) {
    db.deleteAudioLayer(id);
    set(s => ({
      audioLayers: {
        ...s.audioLayers,
        [lineId]: (s.audioLayers[lineId] ?? []).filter(l => l.id !== id),
      },
    }));
  },
}));
