import { create } from 'zustand';
import { THEMES, BG_THEMES, type Theme, type ThemeId, type BgTheme, type BgId } from '@/lib/themes';
import type { GraphicsQuality } from '@/lib/backdrops';

const ACCENT_KEY   = 'an_theme';
const BG_KEY       = 'an_bg_theme';
const GRAPHICS_KEY = 'an_graphics';

function loadThemeId(): ThemeId {
  try {
    const saved = (globalThis as any).localStorage?.getItem(ACCENT_KEY);
    if (saved && saved in THEMES) return saved as ThemeId;
  } catch {}
  return 'amber';
}

function saveThemeId(id: ThemeId) {
  try { (globalThis as any).localStorage?.setItem(ACCENT_KEY, id); } catch {}
}

function loadBgId(): BgId {
  try {
    const saved = (globalThis as any).localStorage?.getItem(BG_KEY);
    if (saved && saved in BG_THEMES) return saved as BgId;
  } catch {}
  return 'warm-white';
}

function saveBgId(id: BgId) {
  try { (globalThis as any).localStorage?.setItem(BG_KEY, id); } catch {}
}

function loadGraphics(): GraphicsQuality {
  try {
    const saved = (globalThis as any).localStorage?.getItem(GRAPHICS_KEY);
    if (saved === 'full' || saved === 'lite') return saved;
  } catch {}
  return 'full';
}

function saveGraphics(q: GraphicsQuality) {
  try { (globalThis as any).localStorage?.setItem(GRAPHICS_KEY, q); } catch {}
}

interface ThemeStore {
  theme: Theme;
  bgTheme: BgTheme;
  graphics: GraphicsQuality;
  setTheme: (id: ThemeId) => void;
  setBg: (id: BgId) => void;
  setGraphics: (q: GraphicsQuality) => void;
}

export const useThemeStore = create<ThemeStore>(() => ({
  theme:    THEMES[loadThemeId()],
  bgTheme:  BG_THEMES[loadBgId()],
  graphics: loadGraphics(),
  setTheme: (id) => {
    saveThemeId(id);
    useThemeStore.setState({ theme: THEMES[id] });
  },
  setBg: (id) => {
    saveBgId(id);
    useThemeStore.setState({ bgTheme: BG_THEMES[id] });
  },
  setGraphics: (q) => {
    saveGraphics(q);
    useThemeStore.setState({ graphics: q });
  },
}));
