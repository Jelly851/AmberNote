export type TagName =
  | 'Melody'
  | 'Bassline'
  | 'Chord Progression'
  | 'Percussion'
  | 'Sound'
  | 'Lyrics'
  | 'Freestyle'
  | (string & {});

export type LayerType = 'melody' | 'chords' | 'rhythm';

export type NoteValue =
  | 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'
  | 'dotted-half' | 'dotted-quarter' | 'dotted-eighth'
  | 'half-triplet' | 'quarter-triplet' | 'eighth-triplet' | 'sixteenth-triplet';

export type SectionType =
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'custom';

export type TemplateId = string;

export interface Folder {
  id: string;
  name: string;
  songId: string | null; // null = Main folder
  parentId: string | null; // null = root level
  createdAt: string;
}

export interface Recording {
  id: string;
  folderId: string;
  filePath: string;
  duration: number;
  tags: TagName[];
  title: string | null;
  waveformData: number[] | null;
  bpm: number | null;
  trimIn: number | null;
  trimOut: number | null;
  createdAt: string;
}

export interface Song {
  id: string;
  title: string;
  key: string | null;
  bpm: number | null;
  timeSignature: string | null;
  templateId: TemplateId | null;
  createdAt: string;
  updatedAt: string;
}

export interface SectionColors {
  outline: string;
  label: string;
}

export interface Section {
  id: string;
  songId: string;
  type: SectionType;
  label: string;
  color: SectionColors;
  order: number;
}

export interface Line {
  id: string;
  sectionId: string;
  text: string;
  order: number;
  chordResolution: number; // cells per bar — default 8 (eighth notes)
  beatOffset: number;      // pickup beats — how many beats before beat 1 (default 0)
}

export interface ChordCell {
  id: string;
  lineId: string;
  position: number;
  root: string | null;
  quality: string | null;
  inversion: string | null;
  extension: string | null;
  slashBass: string | null;
  duration: NoteValue | null;
}

export interface RhythmCell {
  id: string;
  lineId: string;
  position: number;
  noteValue: NoteValue;
  syllable: string | null;
  pitch: string | null;
}

export interface AudioLayer {
  id: string;
  lineId: string;
  recordingId: string;
  layerType: LayerType;
  order: number;
}

export interface TemplateSectionDef {
  type: SectionType;
  label: string;
}

export interface Template {
  id: TemplateId;
  name: string;
  sections: TemplateSectionDef[];
  isCustom?: boolean;
}

// Song enriched with derived data for list views
export type SongCard = Song & { sectionCount: number };

export interface Post {
  id: string;
  songId: string;
  description: string | null;
  createdAt: string;
}

export interface InspoWord {
  id: string;
  text: string;
  createdAt: string;
}
