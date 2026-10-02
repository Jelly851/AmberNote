import * as SQLite from 'expo-sqlite';
import { MAIN_FOLDER_ID, SECTION_COLORS, TEMPLATES } from './constants';
import type {
  AudioLayer,
  ChordCell,
  Template,
  TemplateSectionDef,
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
  TemplateId,
} from './types';

// ─── Singleton ──────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('ambernote.db');
  }
  return _db;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Schema & Seed ──────────────────────────────────────────────────────────

export function initDb(): void {
  const db = getDb();

  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      songId     TEXT,
      parentId   TEXT,
      createdAt  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id           TEXT PRIMARY KEY,
      folderId     TEXT NOT NULL,
      filePath     TEXT NOT NULL,
      duration     REAL NOT NULL DEFAULT 0,
      tags         TEXT NOT NULL DEFAULT '[]',
      title        TEXT,
      waveformData TEXT,
      createdAt    TEXT NOT NULL,
      FOREIGN KEY (folderId) REFERENCES folders(id)
    );

    CREATE TABLE IF NOT EXISTS songs (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      key           TEXT,
      bpm           INTEGER,
      timeSignature TEXT,
      templateId    TEXT,
      notes         TEXT,
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id           TEXT PRIMARY KEY,
      songId       TEXT NOT NULL,
      type         TEXT NOT NULL,
      label        TEXT NOT NULL,
      outlineColor TEXT NOT NULL,
      labelColor   TEXT NOT NULL,
      "order"      INTEGER NOT NULL,
      FOREIGN KEY (songId) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lines (
      id              TEXT PRIMARY KEY,
      sectionId       TEXT NOT NULL,
      text            TEXT NOT NULL DEFAULT '',
      "order"         INTEGER NOT NULL,
      chordResolution INTEGER NOT NULL DEFAULT 8,
      beatOffset      INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (sectionId) REFERENCES sections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chord_cells (
      id        TEXT PRIMARY KEY,
      lineId    TEXT NOT NULL,
      position  INTEGER NOT NULL,
      root      TEXT,
      quality   TEXT,
      inversion TEXT,
      extension TEXT,
      slashBass TEXT,
      FOREIGN KEY (lineId) REFERENCES lines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rhythm_cells (
      id        TEXT PRIMARY KEY,
      lineId    TEXT NOT NULL,
      position  INTEGER NOT NULL,
      noteValue TEXT NOT NULL,
      FOREIGN KEY (lineId) REFERENCES lines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audio_layers (
      id          TEXT PRIMARY KEY,
      lineId      TEXT NOT NULL,
      recordingId TEXT NOT NULL,
      layerType   TEXT NOT NULL,
      "order"     INTEGER NOT NULL,
      FOREIGN KEY (lineId) REFERENCES lines(id) ON DELETE CASCADE,
      FOREIGN KEY (recordingId) REFERENCES recordings(id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id          TEXT PRIMARY KEY,
      songId      TEXT NOT NULL,
      description TEXT,
      createdAt   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shelved_posts (
      postId    TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspo_words (
      id        TEXT PRIMARY KEY,
      text      TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  // Migrate: add duration column to chord_cells if absent
  try { db.execSync(`ALTER TABLE chord_cells ADD COLUMN duration TEXT`); } catch {}
  // Migrate: add syllable column to rhythm_cells if absent
  try { db.execSync(`ALTER TABLE rhythm_cells ADD COLUMN syllable TEXT`); } catch {}
  // Migrate: add pitch column to rhythm_cells if absent
  try { db.execSync(`ALTER TABLE rhythm_cells ADD COLUMN pitch TEXT`); } catch {}
  // Migrate: add beatOffset column to lines if absent
  try { db.execSync(`ALTER TABLE lines ADD COLUMN beatOffset INTEGER NOT NULL DEFAULT 0`); } catch {}
  // Migrate: add audio editing columns to recordings
  try { db.execSync(`ALTER TABLE recordings ADD COLUMN bpm REAL`); } catch {}
  try { db.execSync(`ALTER TABLE recordings ADD COLUMN trimIn REAL`); } catch {}
  try { db.execSync(`ALTER TABLE recordings ADD COLUMN trimOut REAL`); } catch {}
  // Migrate: add parentId to folders for nested folder support
  try { db.execSync(`ALTER TABLE folders ADD COLUMN parentId TEXT`); } catch {}

  // Custom templates table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS custom_templates (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      sections  TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );
  `);

  // Seed the Main folder once
  const main = db.getFirstSync<{ id: string }>(
    `SELECT id FROM folders WHERE id = ?`,
    [MAIN_FOLDER_ID]
  );
  if (!main) {
    db.runSync(
      `INSERT INTO folders (id, name, songId, createdAt) VALUES (?, ?, ?, ?)`,
      [MAIN_FOLDER_ID, 'Main', null, new Date().toISOString()]
    );
  }
}

// ─── Folders ────────────────────────────────────────────────────────────────

export function getFolders(): Folder[] {
  return getDb().getAllSync<Folder>(
    `SELECT * FROM folders ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, createdAt ASC`,
    [MAIN_FOLDER_ID]
  );
}

export function createFolder(name: string, songId?: string, parentId?: string): Folder {
  const folder: Folder = {
    id: generateId(),
    name,
    songId: songId ?? null,
    parentId: parentId ?? null,
    createdAt: new Date().toISOString(),
  };
  getDb().runSync(
    `INSERT INTO folders (id, name, songId, parentId, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [folder.id, folder.name, folder.songId, folder.parentId, folder.createdAt]
  );
  return folder;
}

export function renameFolder(id: string, name: string): void {
  getDb().runSync(`UPDATE folders SET name = ? WHERE id = ?`, [name, id]);
}

export function moveFolder(id: string, parentId: string | null): void {
  if (id === MAIN_FOLDER_ID) return;
  getDb().runSync(`UPDATE folders SET parentId = ? WHERE id = ?`, [parentId, id]);
}

export function deleteFolder(id: string): void {
  if (id === MAIN_FOLDER_ID) return;
  const db = getDb();
  const folder = db.getFirstSync<Folder>(`SELECT * FROM folders WHERE id = ?`, [id]);
  const fallbackParent = folder?.parentId ?? null;
  // Move child folders up to this folder's parent
  db.runSync(`UPDATE folders SET parentId = ? WHERE parentId = ?`, [fallbackParent, id]);
  // Orphaned recordings fall back to Main
  db.runSync(`UPDATE recordings SET folderId = ? WHERE folderId = ?`, [MAIN_FOLDER_ID, id]);
  db.runSync(`DELETE FROM folders WHERE id = ?`, [id]);
}

// ─── Recordings ─────────────────────────────────────────────────────────────

type RecordingRow = Omit<Recording, 'tags' | 'waveformData'> & {
  tags: string;
  waveformData: string | null;
};

function parseRecording(row: RecordingRow): Recording {
  return {
    ...row,
    tags: JSON.parse(row.tags),
    waveformData: row.waveformData ? JSON.parse(row.waveformData) : null,
    bpm: (row as any).bpm ?? null,
    trimIn: (row as any).trimIn ?? null,
    trimOut: (row as any).trimOut ?? null,
  };
}

export function getRecordings(folderId: string): Recording[] {
  return getDb()
    .getAllSync<RecordingRow>(
      `SELECT * FROM recordings WHERE folderId = ? ORDER BY createdAt DESC`,
      [folderId]
    )
    .map(parseRecording);
}

export function getAllRecordings(): Recording[] {
  return getDb()
    .getAllSync<RecordingRow>(`SELECT * FROM recordings ORDER BY createdAt DESC`)
    .map(parseRecording);
}

export function createRecording(
  folderId: string,
  filePath: string,
  duration: number,
  tags: TagName[] = [],
  title?: string
): Recording {
  const recording: Recording = {
    id: generateId(),
    folderId,
    filePath,
    duration,
    tags,
    title: title ?? null,
    waveformData: null,
    bpm: null,
    trimIn: null,
    trimOut: null,
    createdAt: new Date().toISOString(),
  };
  getDb().runSync(
    `INSERT INTO recordings (id, folderId, filePath, duration, tags, title, waveformData, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recording.id,
      recording.folderId,
      recording.filePath,
      recording.duration,
      JSON.stringify(recording.tags),
      recording.title,
      null,
      recording.createdAt,
    ]
  );
  return recording;
}

export function updateRecording(
  id: string,
  updates: Partial<Pick<Recording, 'title' | 'tags' | 'folderId' | 'bpm' | 'trimIn' | 'trimOut' | 'waveformData'>>
): void {
  const db = getDb();
  if (updates.title !== undefined) {
    db.runSync(`UPDATE recordings SET title = ? WHERE id = ?`, [updates.title, id]);
  }
  if (updates.tags !== undefined) {
    db.runSync(`UPDATE recordings SET tags = ? WHERE id = ?`, [JSON.stringify(updates.tags), id]);
  }
  if (updates.folderId !== undefined) {
    db.runSync(`UPDATE recordings SET folderId = ? WHERE id = ?`, [updates.folderId, id]);
  }
  if (updates.bpm !== undefined) {
    db.runSync(`UPDATE recordings SET bpm = ? WHERE id = ?`, [updates.bpm, id]);
  }
  if (updates.trimIn !== undefined) {
    db.runSync(`UPDATE recordings SET trimIn = ? WHERE id = ?`, [updates.trimIn, id]);
  }
  if (updates.trimOut !== undefined) {
    db.runSync(`UPDATE recordings SET trimOut = ? WHERE id = ?`, [updates.trimOut, id]);
  }
  if (updates.waveformData !== undefined) {
    db.runSync(`UPDATE recordings SET waveformData = ? WHERE id = ?`, [JSON.stringify(updates.waveformData), id]);
  }
}

export function deleteRecording(id: string): void {
  getDb().runSync(`DELETE FROM recordings WHERE id = ?`, [id]);
}

// ─── Songs ──────────────────────────────────────────────────────────────────

export function getSongs(): Song[] {
  return getDb().getAllSync<Song>(`SELECT * FROM songs ORDER BY updatedAt DESC`);
}

export function getSongsWithSectionCount(): SongCard[] {
  return getDb().getAllSync<SongCard>(
    `SELECT s.*, COUNT(sec.id) as sectionCount
     FROM songs s
     LEFT JOIN sections sec ON sec.songId = s.id
     GROUP BY s.id
     ORDER BY s.updatedAt DESC`
  );
}

export function createSong(title: string, templateId: TemplateId = 'pop'): Song {
  const now = new Date().toISOString();
  const song: Song = {
    id: generateId(),
    title,
    key: null,
    bpm: null,
    timeSignature: '4/4',
    templateId,
    createdAt: now,
    updatedAt: now,
  };
  getDb().runSync(
    `INSERT INTO songs (id, title, key, bpm, timeSignature, templateId, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [song.id, song.title, song.key, song.bpm, song.timeSignature, song.templateId, null, song.createdAt, song.updatedAt]
  );
  return song;
}

export function updateSong(
  id: string,
  updates: Partial<Omit<Song, 'id' | 'createdAt' | 'updatedAt'>>
): void {
  const keys = Object.keys(updates) as Array<keyof typeof updates>;
  if (keys.length === 0) return;
  const now = new Date().toISOString();
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => updates[k] ?? null);
  getDb().runSync(
    `UPDATE songs SET ${setClause}, updatedAt = ? WHERE id = ?`,
    [...values, now, id]
  );
}

export function deleteSong(id: string): void {
  getDb().runSync(`DELETE FROM songs WHERE id = ?`, [id]);
}

// ─── Sections ───────────────────────────────────────────────────────────────

type SectionRow = Omit<Section, 'color'> & {
  outlineColor: string;
  labelColor: string;
};

function parseSection(row: SectionRow): Section {
  return {
    id: row.id,
    songId: row.songId,
    type: row.type as SectionType,
    label: row.label,
    color: { outline: row.outlineColor, label: row.labelColor },
    order: row.order,
  };
}

export function getSections(songId: string): Section[] {
  return getDb()
    .getAllSync<SectionRow>(
      `SELECT * FROM sections WHERE songId = ? ORDER BY "order" ASC`,
      [songId]
    )
    .map(parseSection);
}

export function createSection(
  songId: string,
  type: SectionType,
  label: string,
  order: number
): Section {
  const colors = SECTION_COLORS[type];
  const section: Section = {
    id: generateId(),
    songId,
    type,
    label,
    color: colors,
    order,
  };
  getDb().runSync(
    `INSERT INTO sections (id, songId, type, label, outlineColor, labelColor, "order") VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [section.id, songId, type, label, colors.outline, colors.label, order]
  );
  return section;
}

export function updateSection(
  id: string,
  updates: Partial<Pick<Section, 'label' | 'order'>>
): void {
  const db = getDb();
  if (updates.label !== undefined) {
    db.runSync(`UPDATE sections SET label = ? WHERE id = ?`, [updates.label, id]);
  }
  if (updates.order !== undefined) {
    db.runSync(`UPDATE sections SET "order" = ? WHERE id = ?`, [updates.order, id]);
  }
}

export function deleteSection(id: string): void {
  getDb().runSync(`DELETE FROM sections WHERE id = ?`, [id]);
}

// Seeds sections + a blank first line from a template
export function seedSectionsFromTemplate(songId: string, templateId: TemplateId): Section[] {
  const template = TEMPLATES[templateId] ?? getCustomTemplates().find(t => t.id === templateId);
  const sections: Section[] = [];
  for (let i = 0; i < (template?.sections ?? []).length; i++) {
    const def = template.sections[i];
    const section = createSection(songId, def.type, def.label, i);
    createLine(section.id, 0);
    sections.push(section);
  }
  return sections;
}

// ─── Lines ──────────────────────────────────────────────────────────────────

export function getLines(sectionId: string): Line[] {
  return getDb().getAllSync<Line>(
    `SELECT * FROM lines WHERE sectionId = ? ORDER BY "order" ASC`,
    [sectionId]
  );
}

export function createLine(sectionId: string, order: number): Line {
  const line: Line = {
    id: generateId(),
    sectionId,
    text: '',
    order,
    chordResolution: 8,
    beatOffset: 0,
  };
  getDb().runSync(
    `INSERT INTO lines (id, sectionId, text, "order", chordResolution, beatOffset) VALUES (?, ?, ?, ?, ?, ?)`,
    [line.id, sectionId, line.text, line.order, line.chordResolution, line.beatOffset]
  );
  return line;
}

export function updateLine(
  id: string,
  updates: Partial<Pick<Line, 'text' | 'order' | 'chordResolution' | 'beatOffset'>>
): void {
  const db = getDb();
  if (updates.text !== undefined) {
    db.runSync(`UPDATE lines SET text = ? WHERE id = ?`, [updates.text, id]);
  }
  if (updates.order !== undefined) {
    db.runSync(`UPDATE lines SET "order" = ? WHERE id = ?`, [updates.order, id]);
  }
  if (updates.chordResolution !== undefined) {
    db.runSync(`UPDATE lines SET chordResolution = ? WHERE id = ?`, [updates.chordResolution, id]);
  }
  if (updates.beatOffset !== undefined) {
    db.runSync(`UPDATE lines SET beatOffset = ? WHERE id = ?`, [updates.beatOffset, id]);
  }
}

export function deleteLine(id: string): void {
  getDb().runSync(`DELETE FROM lines WHERE id = ?`, [id]);
}

// ─── Chord Cells ─────────────────────────────────────────────────────────────

export function getChordCells(lineId: string): ChordCell[] {
  return getDb().getAllSync<ChordCell>(
    `SELECT * FROM chord_cells WHERE lineId = ? ORDER BY position ASC`,
    [lineId]
  );
}

export function upsertChordCell(
  lineId: string,
  position: number,
  chord: Partial<Pick<ChordCell, 'root' | 'quality' | 'inversion' | 'extension' | 'slashBass' | 'duration'>>
): ChordCell {
  const db = getDb();
  const existing = db.getFirstSync<ChordCell>(
    `SELECT * FROM chord_cells WHERE lineId = ? AND position = ?`,
    [lineId, position]
  );

  if (existing) {
    const updated = { ...existing, ...chord };
    db.runSync(
      `UPDATE chord_cells SET root=?, quality=?, inversion=?, extension=?, slashBass=?, duration=? WHERE id=?`,
      [updated.root, updated.quality, updated.inversion, updated.extension, updated.slashBass, updated.duration ?? null, existing.id]
    );
    return updated;
  }

  const cell: ChordCell = {
    id: generateId(),
    lineId,
    position,
    root: chord.root ?? null,
    quality: chord.quality ?? null,
    inversion: chord.inversion ?? null,
    extension: chord.extension ?? null,
    slashBass: chord.slashBass ?? null,
    duration: chord.duration ?? null,
  };
  db.runSync(
    `INSERT INTO chord_cells (id, lineId, position, root, quality, inversion, extension, slashBass, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cell.id, cell.lineId, cell.position, cell.root, cell.quality, cell.inversion, cell.extension, cell.slashBass, cell.duration]
  );
  return cell;
}

// ─── Rhythm Cells ─────────────────────────────────────────────────────────────

export function getRhythmCells(lineId: string): RhythmCell[] {
  return getDb().getAllSync<RhythmCell>(
    `SELECT * FROM rhythm_cells WHERE lineId = ? ORDER BY position ASC`,
    [lineId]
  );
}

export function upsertRhythmCell(lineId: string, position: number, noteValue: NoteValue, syllable: string | null = null, pitch: string | null = null): RhythmCell {
  const db = getDb();
  const existing = db.getFirstSync<RhythmCell>(
    `SELECT * FROM rhythm_cells WHERE lineId = ? AND position = ?`,
    [lineId, position]
  );
  if (existing) {
    db.runSync(`UPDATE rhythm_cells SET noteValue = ?, syllable = ?, pitch = ? WHERE id = ?`, [noteValue, syllable, pitch, existing.id]);
    return { ...existing, noteValue, syllable, pitch };
  }
  const cell: RhythmCell = { id: generateId(), lineId, position, noteValue, syllable, pitch };
  db.runSync(
    `INSERT INTO rhythm_cells (id, lineId, position, noteValue, syllable, pitch) VALUES (?, ?, ?, ?, ?, ?)`,
    [cell.id, lineId, position, noteValue, syllable, pitch]
  );
  return cell;
}

export function deleteRhythmCell(lineId: string, position: number): void {
  getDb().runSync(`DELETE FROM rhythm_cells WHERE lineId = ? AND position = ?`, [lineId, position]);
}

export function deleteChordCell(lineId: string, position: number): void {
  getDb().runSync(`DELETE FROM chord_cells WHERE lineId = ? AND position = ?`, [lineId, position]);
}

// ─── Audio Layers ────────────────────────────────────────────────────────────

export function getAudioLayers(lineId: string): AudioLayer[] {
  return getDb().getAllSync<AudioLayer>(
    `SELECT * FROM audio_layers WHERE lineId = ? ORDER BY "order" ASC`,
    [lineId]
  );
}

export function createAudioLayer(
  lineId: string,
  recordingId: string,
  layerType: LayerType,
  order: number
): AudioLayer {
  const layer: AudioLayer = {
    id: generateId(),
    lineId,
    recordingId,
    layerType,
    order,
  };
  getDb().runSync(
    `INSERT INTO audio_layers (id, lineId, recordingId, layerType, "order") VALUES (?, ?, ?, ?, ?)`,
    [layer.id, layer.lineId, layer.recordingId, layer.layerType, layer.order]
  );
  return layer;
}

export function deleteAudioLayer(id: string): void {
  getDb().runSync(`DELETE FROM audio_layers WHERE id = ?`, [id]);
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export function getPosts(): Post[] {
  return getDb().getAllSync<Post>(`SELECT * FROM posts ORDER BY createdAt DESC`);
}

export function createPost(songId: string, description?: string): Post {
  const post: Post = {
    id: generateId(),
    songId,
    description: description ?? null,
    createdAt: new Date().toISOString(),
  };
  getDb().runSync(
    `INSERT INTO posts (id, songId, description, createdAt) VALUES (?, ?, ?, ?)`,
    [post.id, post.songId, post.description, post.createdAt]
  );
  return post;
}

export function deletePost(id: string): void {
  getDb().runSync(`DELETE FROM posts WHERE id = ?`, [id]);
}

export function getShelvedPostIds(): Set<string> {
  const rows = getDb().getAllSync<{ postId: string }>(`SELECT postId FROM shelved_posts`);
  return new Set(rows.map(r => r.postId));
}

export function shelfPost(postId: string): void {
  getDb().runSync(
    `INSERT OR IGNORE INTO shelved_posts (postId, createdAt) VALUES (?, ?)`,
    [postId, new Date().toISOString()]
  );
}

export function unshelfPost(postId: string): void {
  getDb().runSync(`DELETE FROM shelved_posts WHERE postId = ?`, [postId]);
}

// ─── Inspo Words ─────────────────────────────────────────────────────────────

export function getInspoWords(): InspoWord[] {
  return getDb().getAllSync<InspoWord>(`SELECT * FROM inspo_words ORDER BY createdAt ASC`);
}

export function addInspoWord(text: string): InspoWord {
  const word: InspoWord = { id: generateId(), text, createdAt: new Date().toISOString() };
  getDb().runSync(
    `INSERT INTO inspo_words (id, text, createdAt) VALUES (?, ?, ?)`,
    [word.id, word.text, word.createdAt]
  );
  return word;
}

export function deleteInspoWord(id: string): void {
  getDb().runSync(`DELETE FROM inspo_words WHERE id = ?`, [id]);
}

// ─── Custom Templates ─────────────────────────────────────────────────────────

export function getCustomTemplates(): Template[] {
  return getDb().getAllSync<{ id: string; name: string; sections: string; createdAt: string }>(
    `SELECT * FROM custom_templates ORDER BY createdAt ASC`
  ).map(row => ({
    id: row.id,
    name: row.name,
    sections: JSON.parse(row.sections) as TemplateSectionDef[],
    isCustom: true,
  }));
}

export function createCustomTemplate(name: string, sections: TemplateSectionDef[]): Template {
  const t: Template = { id: generateId(), name, sections, isCustom: true };
  getDb().runSync(
    `INSERT INTO custom_templates (id, name, sections, createdAt) VALUES (?, ?, ?, ?)`,
    [t.id, t.name, JSON.stringify(t.sections), new Date().toISOString()]
  );
  return t;
}

export function updateCustomTemplate(id: string, name: string, sections: TemplateSectionDef[]): void {
  getDb().runSync(
    `UPDATE custom_templates SET name = ?, sections = ? WHERE id = ?`,
    [name, JSON.stringify(sections), id]
  );
}

export function deleteCustomTemplate(id: string): void {
  getDb().runSync(`DELETE FROM custom_templates WHERE id = ?`, [id]);
}
