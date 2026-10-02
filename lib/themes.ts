export type ThemeId = 'amber' | 'ocean' | 'rose';

export interface Theme {
  id: ThemeId;
  name: string;
  accent: string;       // primary action color
  accentLight: string;  // soft background tint
  accentDark: string;   // pressed / active variant
}

export const THEMES: Record<ThemeId, Theme> = {
  amber: {
    id: 'amber',
    name: 'Orange',
    accent: '#F59E0B',
    accentLight: '#FEF3C7',
    accentDark: '#D97706',
  },
  ocean: {
    id: 'ocean',
    name: 'Blue',
    accent: '#0EA5E9',
    accentLight: '#E0F2FE',
    accentDark: '#0284C7',
  },
  rose: {
    id: 'rose',
    name: 'Pink',
    accent: '#F472B6',
    accentLight: '#FCE7F3',
    accentDark: '#EC4899',
  },
};

export const THEME_LIST = Object.values(THEMES);

// ─── Background themes ────────────────────────────────────────────────────────

export type BgId = 'warm-white' | 'cream' | 'dark' | 'slate';

export interface BgTheme {
  id: BgId;
  name: string;
  swatch: string;
  bg: string;
  cardBg: string;
  lyricColor: string;
  placeholderColor: string;
  labelColor: string;
  metaBg: string;
  isDark: boolean;
}

export const BG_THEMES: Record<BgId, BgTheme> = {
  'warm-white': {
    id: 'warm-white', name: 'White', swatch: '#FAF8F4',
    bg: '#FAF8F4', cardBg: '#FFFFFF',
    lyricColor: '#1C1A17', placeholderColor: 'rgba(28,26,23,0.2)',
    labelColor: '#1C1A17', metaBg: '#F5F1EB',
    isDark: false,
  },
  cream: {
    id: 'cream', name: 'Cream', swatch: '#F5EDD6',
    bg: '#F5EDD6', cardBg: '#FFFBF0',
    lyricColor: '#2D2010', placeholderColor: 'rgba(45,32,16,0.2)',
    labelColor: '#2D2010', metaBg: '#EDE3C4',
    isDark: false,
  },
  dark: {
    id: 'dark', name: 'Dark', swatch: '#1A1714',
    bg: '#1A1714', cardBg: '#2A2420',
    lyricColor: '#E8E0D0', placeholderColor: 'rgba(232,224,208,0.18)',
    labelColor: '#E8E0D0', metaBg: '#332D28',
    isDark: true,
  },
  slate: {
    id: 'slate', name: 'Slate', swatch: '#E8EEF4',
    bg: '#E8EEF4', cardBg: '#FFFFFF',
    lyricColor: '#1C2430', placeholderColor: 'rgba(28,36,48,0.2)',
    labelColor: '#1C2430', metaBg: '#D8E2EC',
    isDark: false,
  },
};

export const BG_THEME_LIST = Object.values(BG_THEMES);
