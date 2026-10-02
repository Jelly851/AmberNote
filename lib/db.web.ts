import { MAIN_FOLDER_ID, SECTION_COLORS, TEMPLATES } from './constants';
import type {
  AudioLayer,
  ChordCell,
  Folder,
  InspoWord,
  LayerType,
  Line,
  NoteValue,
  Post,
  Recording,
  RhythmCell,
  Section,
  SectionType,
  Song,
  SongCard,
  TagName,
  Template,
  TemplateSectionDef,
  TemplateId,
} from './types';

// ─── Storage helpers ─────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

const K = {
  folders: 'an_folders',
  recordings: 'an_recordings',
  songs: 'an_songs',
  sections: 'an_sections',
  lines: 'an_lines',
  chordCells: 'an_chord_cells',
  rhythmCells: 'an_rhythm_cells',
  audioLayers: 'an_audio_layers',
  posts: 'an_posts',
  shelvedPosts: 'an_shelved_posts',
  inspoWords: 'an_inspo_words',
  customTemplates: 'an_custom_templates',
} as const;

// ─── Id ──────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Schema & Seed ───────────────────────────────────────────────────────────

export function initDb(): void {
  const folders = load<Folder>(K.folders);
  if (!folders.find(f => f.id === MAIN_FOLDER_ID)) {
    save(K.folders, [...folders, {
      id: MAIN_FOLDER_ID, name: 'Main', songId: null,
      createdAt: new Date().toISOString(),
    }]);
  }
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export function getFolders(): Folder[] {
  return load<Folder>(K.folders).sort((a, b) =>
    a.id === MAIN_FOLDER_ID ? -1 : b.id === MAIN_FOLDER_ID ? 1 : a.createdAt.localeCompare(b.createdAt)
  );
}

export function createFolder(name: string, songId?: string, parentId?: string): Folder {
  const folder: Folder = {
    id: generateId(), name, songId: songId ?? null, parentId: parentId ?? null,
    createdAt: new Date().toISOString(),
  };
  save(K.folders, [...load<Folder>(K.folders), folder]);
  return folder;
}

export function renameFolder(id: string, name: string): void {
  save(K.folders, load<Folder>(K.folders).map(f => f.id === id ? { ...f, name } : f));
}

export function moveFolder(id: string, parentId: string | null): void {
  if (id === MAIN_FOLDER_ID) return;
  save(K.folders, load<Folder>(K.folders).map(f => f.id === id ? { ...f, parentId } : f));
}

export function deleteFolder(id: string): void {
  if (id === MAIN_FOLDER_ID) return;
  const folders = load<Folder>(K.folders);
  const folder = folders.find(f => f.id === id);
  const fallbackParent = folder?.parentId ?? null;
  // Move child folders up to this folder's parent
  save(K.folders, folders.map(f =>
    f.id === id ? null : f.parentId === id ? { ...f, parentId: fallbackParent } : f
  ).filter(Boolean) as Folder[]);
  save(K.recordings, load<Recording>(K.recordings).map(r =>
    r.folderId === id ? { ...r, folderId: MAIN_FOLDER_ID } : r
  ));
}

// ─── Recordings ──────────────────────────────────────────────────────────────

export function getRecordings(folderId: string): Recording[] {
  return load<Recording>(K.recordings)
    .filter(r => r.folderId === folderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAllRecordings(): Recording[] {
  return load<Recording>(K.recordings).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createRecording(
  folderId: string, filePath: string, duration: number,
  tags: TagName[] = [], title?: string
): Recording {
  const recording: Recording = {
    id: generateId(), folderId, filePath, duration, tags,
    title: title ?? null, waveformData: null,
    bpm: null, trimIn: null, trimOut: null,
    createdAt: new Date().toISOString(),
  };
  save(K.recordings, [...load<Recording>(K.recordings), recording]);
  return recording;
}

export function updateRecording(
  id: string,
  updates: Partial<Pick<Recording, 'title' | 'tags' | 'folderId' | 'bpm' | 'trimIn' | 'trimOut' | 'waveformData'>>
): void {
  save(K.recordings, load<Recording>(K.recordings).map(r => r.id === id ? { ...r, ...updates } : r));
}

export function deleteRecording(id: string): void {
  save(K.recordings, load<Recording>(K.recordings).filter(r => r.id !== id));
}

// ─── Songs ───────────────────────────────────────────────────────────────────

export function getSongs(): Song[] {
  return load<Song>(K.songs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSongsWithSectionCount(): SongCard[] {
  const songs = getSongs();
  const sections = load<Section>(K.sections);
  return songs.map(s => ({
    ...s,
    sectionCount: sections.filter(sec => sec.songId === s.id).length,
  }));
}

export function createSong(title: string, templateId: TemplateId = 'pop'): Song {
  const now = new Date().toISOString();
  const song: Song = {
    id: generateId(), title, key: null, bpm: null,
    timeSignature: '4/4', templateId, createdAt: now, updatedAt: now,
  };
  save(K.songs, [...load<Song>(K.songs), song]);
  return song;
}

export function updateSong(
  id: string,
  updates: Partial<Omit<Song, 'id' | 'createdAt' | 'updatedAt'>>
): void {
  save(K.songs, load<Song>(K.songs).map(s =>
    s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
  ));
}

export function deleteSong(id: string): void {
  save(K.songs, load<Song>(K.songs).filter(s => s.id !== id));
  const sectionIds = load<Section>(K.sections).filter(s => s.songId === id).map(s => s.id);
  save(K.sections, load<Section>(K.sections).filter(s => s.songId !== id));
  const lineIds = load<Line>(K.lines).filter(l => sectionIds.includes(l.sectionId)).map(l => l.id);
  save(K.lines, load<Line>(K.lines).filter(l => !sectionIds.includes(l.sectionId)));
  save(K.chordCells, load<ChordCell>(K.chordCells).filter(c => !lineIds.includes(c.lineId)));
  save(K.rhythmCells, load<RhythmCell>(K.rhythmCells).filter(c => !lineIds.includes(c.lineId)));
  save(K.audioLayers, load<AudioLayer>(K.audioLayers).filter(a => !lineIds.includes(a.lineId)));
}

// ─── Sections ────────────────────────────────────────────────────────────────

export function getSections(songId: string): Section[] {
  return load<Section>(K.sections)
    .filter(s => s.songId === songId)
    .sort((a, b) => a.order - b.order);
}

export function createSection(
  songId: string, type: SectionType, label: string, order: number
): Section {
  const section: Section = {
    id: generateId(), songId, type, label,
    color: SECTION_COLORS[type], order,
  };
  save(K.sections, [...load<Section>(K.sections), section]);
  return section;
}

export function updateSection(id: string, updates: Partial<Pick<Section, 'label' | 'order'>>): void {
  save(K.sections, load<Section>(K.sections).map(s => s.id === id ? { ...s, ...updates } : s));
}

export function deleteSection(id: string): void {
  const lineIds = load<Line>(K.lines).filter(l => l.sectionId === id).map(l => l.id);
  save(K.sections, load<Section>(K.sections).filter(s => s.id !== id));
  save(K.lines, load<Line>(K.lines).filter(l => l.sectionId !== id));
  save(K.chordCells, load<ChordCell>(K.chordCells).filter(c => !lineIds.includes(c.lineId)));
  save(K.rhythmCells, load<RhythmCell>(K.rhythmCells).filter(c => !lineIds.includes(c.lineId)));
  save(K.audioLayers, load<AudioLayer>(K.audioLayers).filter(a => !lineIds.includes(a.lineId)));
}

export function seedSectionsFromTemplate(songId: string, templateId: TemplateId): Section[] {
  const template = TEMPLATES[templateId] ?? getCustomTemplates().find(t => t.id === templateId);
  const sections: Section[] = [];
  for (let i = 0; i < template.sections.length; i++) {
    const def = template.sections[i];
    const section = createSection(songId, def.type, def.label, i);
    createLine(section.id, 0);
    sections.push(section);
  }
  return sections;
}

// ─── Lines ───────────────────────────────────────────────────────────────────

export function getLines(sectionId: string): Line[] {
  return load<Line>(K.lines)
    .filter(l => l.sectionId === sectionId)
    .sort((a, b) => a.order - b.order);
}

export function createLine(sectionId: string, order: number): Line {
  const line: Line = { id: generateId(), sectionId, text: '', order, chordResolution: 8, beatOffset: 0 };
  save(K.lines, [...load<Line>(K.lines), line]);
  return line;
}

export function updateLine(
  id: string,
  updates: Partial<Pick<Line, 'text' | 'order' | 'chordResolution' | 'beatOffset'>>
): void {
  save(K.lines, load<Line>(K.lines).map(l => l.id === id ? { ...l, ...updates } : l));
}

export function deleteLine(id: string): void {
  save(K.lines, load<Line>(K.lines).filter(l => l.id !== id));
  save(K.chordCells, load<ChordCell>(K.chordCells).filter(c => c.lineId !== id));
  save(K.rhythmCells, load<RhythmCell>(K.rhythmCells).filter(c => c.lineId !== id));
  save(K.audioLayers, load<AudioLayer>(K.audioLayers).filter(a => a.lineId !== id));
}

// ─── Chord Cells ─────────────────────────────────────────────────────────────

export function getChordCells(lineId: string): ChordCell[] {
  return load<ChordCell>(K.chordCells)
    .filter(c => c.lineId === lineId)
    .sort((a, b) => a.position - b.position);
}

export function upsertChordCell(
  lineId: string,
  position: number,
  chord: Partial<Pick<ChordCell, 'root' | 'quality' | 'inversion' | 'extension' | 'slashBass' | 'duration'>>
): ChordCell {
  const cells = load<ChordCell>(K.chordCells);
  const existing = cells.find(c => c.lineId === lineId && c.position === position);
  if (existing) {
    const updated = { ...existing, ...chord };
    save(K.chordCells, cells.map(c => c.id === existing.id ? updated : c));
    return updated;
  }
  const cell: ChordCell = {
    id: generateId(), lineId, position,
    root: chord.root ?? null, quality: chord.quality ?? null,
    inversion: chord.inversion ?? null, extension: chord.extension ?? null,
    slashBass: chord.slashBass ?? null, duration: chord.duration ?? null,
  };
  save(K.chordCells, [...cells, cell]);
  return cell;
}

export function deleteChordCell(lineId: string, position: number): void {
  save(K.chordCells, load<ChordCell>(K.chordCells).filter(
    c => !(c.lineId === lineId && c.position === position)
  ));
}

// ─── Rhythm Cells ─────────────────────────────────────────────────────────────

export function getRhythmCells(lineId: string): RhythmCell[] {
  return load<RhythmCell>(K.rhythmCells)
    .filter(c => c.lineId === lineId)
    .sort((a, b) => a.position - b.position);
}

export function upsertRhythmCell(lineId: string, position: number, noteValue: NoteValue, syllable: string | null = null): RhythmCell {
  const cells = load<RhythmCell>(K.rhythmCells);
  const existing = cells.find(c => c.lineId === lineId && c.position === position);
  if (existing) {
    const updated = { ...existing, noteValue, syllable };
    save(K.rhythmCells, cells.map(c => c.id === existing.id ? updated : c));
    return updated;
  }
  const cell: RhythmCell = { id: generateId(), lineId, position, noteValue, syllable, pitch: null };
  save(K.rhythmCells, [...cells, cell]);
  return cell;
}

export function deleteRhythmCell(lineId: string, position: number): void {
  save(K.rhythmCells, load<RhythmCell>(K.rhythmCells).filter(
    c => !(c.lineId === lineId && c.position === position)
  ));
}

// ─── Audio Layers ─────────────────────────────────────────────────────────────

export function getAudioLayers(lineId: string): AudioLayer[] {
  return load<AudioLayer>(K.audioLayers)
    .filter(a => a.lineId === lineId)
    .sort((a, b) => a.order - b.order);
}

export function createAudioLayer(
  lineId: string, recordingId: string, layerType: LayerType, order: number
): AudioLayer {
  const layer: AudioLayer = { id: generateId(), lineId, recordingId, layerType, order };
  save(K.audioLayers, [...load<AudioLayer>(K.audioLayers), layer]);
  return layer;
}

export function deleteAudioLayer(id: string): void {
  save(K.audioLayers, load<AudioLayer>(K.audioLayers).filter(a => a.id !== id));
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export function getPosts(): Post[] {
  return load<Post>(K.posts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createPost(songId: string, description?: string): Post {
  const post: Post = {
    id: generateId(), songId,
    description: description ?? null, createdAt: new Date().toISOString(),
  };
  save(K.posts, [...load<Post>(K.posts), post]);
  return post;
}

export function deletePost(id: string): void {
  save(K.posts, load<Post>(K.posts).filter(p => p.id !== id));
}

export function getShelvedPostIds(): Set<string> {
  return new Set(load<string>(K.shelvedPosts));
}

export function shelfPost(postId: string): void {
  const ids = load<string>(K.shelvedPosts);
  if (!ids.includes(postId)) save(K.shelvedPosts, [...ids, postId]);
}

export function unshelfPost(postId: string): void {
  save(K.shelvedPosts, load<string>(K.shelvedPosts).filter(id => id !== postId));
}

// ─── Inspo Words ─────────────────────────────────────────────────────────────

export function getInspoWords(): InspoWord[] {
  return load<InspoWord>(K.inspoWords).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addInspoWord(text: string): InspoWord {
  const word: InspoWord = { id: generateId(), text, createdAt: new Date().toISOString() };
  save(K.inspoWords, [...load<InspoWord>(K.inspoWords), word]);
  return word;
}

export function deleteInspoWord(id: string): void {
  save(K.inspoWords, load<InspoWord>(K.inspoWords).filter(w => w.id !== id));
}

// ─── Custom Templates ─────────────────────────────────────────────────────────

export function getCustomTemplates(): Template[] {
  return load<Template>(K.customTemplates).map(t => ({ ...t, isCustom: true }));
}

export function createCustomTemplate(name: string, sections: TemplateSectionDef[]): Template {
  const t: Template = { id: generateId(), name, sections, isCustom: true };
  save(K.customTemplates, [...load<Template>(K.customTemplates), t]);
  return t;
}

export function updateCustomTemplate(id: string, name: string, sections: TemplateSectionDef[]): void {
  save(K.customTemplates, load<Template>(K.customTemplates).map(t => t.id === id ? { ...t, name, sections } : t));
}

export function deleteCustomTemplate(id: string): void {
  save(K.customTemplates, load<Template>(K.customTemplates).filter(t => t.id !== id));
}
