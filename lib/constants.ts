import type { SectionColors, SectionType, Template, TemplateId } from './types';

export const SECTION_COLORS: Record<SectionType, SectionColors> = {
  verse:        { outline: '#85B7EB', label: '#185FA5' },
  'pre-chorus': { outline: '#AFA9EC', label: '#534AB7' },
  chorus:       { outline: '#EF9F27', label: '#92400E' },
  bridge:       { outline: '#86EFAC', label: '#166534' },
  outro:        { outline: '#FCA5A5', label: '#991B1B' },
  custom:       { outline: '#D1D5DB', label: '#374151' },
};

export const TEMPLATES: Record<TemplateId, Template> = {
  pop: {
    id: 'pop',
    name: 'Pop',
    sections: [
      { type: 'verse',        label: 'Verse 1' },
      { type: 'pre-chorus',  label: 'Pre-Chorus' },
      { type: 'chorus',       label: 'Chorus' },
      { type: 'verse',        label: 'Verse 2' },
      { type: 'pre-chorus',  label: 'Pre-Chorus' },
      { type: 'chorus',       label: 'Chorus' },
      { type: 'bridge',       label: 'Bridge' },
      { type: 'chorus',       label: 'Chorus' },
      { type: 'outro',        label: 'Outro' },
    ],
  },
  blank: {
    id: 'blank',
    name: 'Blank',
    sections: [],
  },
};

export const FIXED_TAGS = [
  'Melody',
  'Bassline',
  'Chord Progression',
  'Percussion',
  'Sound',
  'Lyrics',
  'Freestyle',
] as const;

export const LAYER_COLORS: Record<string, string> = {
  melody: '#D97706',  // amber
  chords: '#3B82F6',  // blue
  rhythm: '#8B5CF6',  // purple
};

export const MAIN_FOLDER_ID = 'main';

// Inspo emotion → gradient colors (3-stop, light to mid)
export const EMOTION_GRADIENTS: { keywords: string[]; colors: [string, string, string] }[] = [
  { keywords: ['love', 'heart', 'romance', 'sweet', 'tender', 'kiss', 'embrace', 'desire'], colors: ['#FFF5F7', '#FCE7F3', '#F9A8D4'] },
  { keywords: ['fire', 'burn', 'flame', 'heat', 'rage', 'fury', 'blaze', 'inferno', 'anger'], colors: ['#FFF7ED', '#FEF3C7', '#FCA5A5'] },
  { keywords: ['happy', 'joy', 'bright', 'sun', 'gold', 'glow', 'shine', 'smile', 'laugh', 'dance'], colors: ['#FFFBEB', '#FEF3C7', '#FDE68A'] },
  { keywords: ['rain', 'ocean', 'sea', 'water', 'flow', 'river', 'tears', 'weep', 'cry', 'wave'], colors: ['#EFF6FF', '#DBEAFE', '#BAE6FD'] },
  { keywords: ['night', 'dark', 'shadow', 'lonely', 'alone', 'lost', 'void', 'empty', 'silence', 'fade'], colors: ['#F5F3FF', '#EDE9FE', '#DDD6FE'] },
  { keywords: ['storm', 'thunder', 'chaos', 'wild', 'power', 'electric', 'crash', 'break', 'shatter'], colors: ['#F0F9FF', '#E0F2FE', '#7DD3FC'] },
  { keywords: ['green', 'grow', 'earth', 'forest', 'leaf', 'spring', 'bloom', 'fresh', 'alive', 'nature'], colors: ['#F0FDF4', '#DCFCE7', '#BBF7D0'] },
  { keywords: ['cold', 'ice', 'winter', 'snow', 'freeze', 'chill', 'frost', 'pale', 'grey', 'gray', 'numb'], colors: ['#F8FAFC', '#F1F5F9', '#CBD5E1'] },
];

export const DEFAULT_GRADIENT: [string, string, string] = ['#FAF8F4', '#F5F1EB', '#EDE8E0'];
