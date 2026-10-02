// ─── Board Backdrops ──────────────────────────────────────────────────────────
// Rich background system for inspo boards (also used behind lyrics in the
// editor's "Board" stage mode). Each backdrop = base color/gradient + an
// optional SVG texture layer rendered by components/BoardBackdrop.tsx.

export type BackdropCategory = 'paper' | 'sky' | 'nature' | 'glow' | 'minimal';

/** App-wide graphics setting: 'full' = animated, denser textures; 'lite' = static, lighter. */
export type GraphicsQuality = 'full' | 'lite';

export type BackdropId =
  // paper
  | 'blank' | 'parchment' | 'linen' | 'kraft' | 'notebook' | 'graph'
  // sky
  | 'clouds' | 'sunset' | 'twilight' | 'starry' | 'moonlit' | 'aurora'
  // nature
  | 'ocean' | 'rain' | 'meadow' | 'blossom'
  // glow
  | 'dark' | 'nebula' | 'synthwave' | 'fireflies'
  // minimal
  | 'dots' | 'ripple';

export type TextureKind =
  | 'graph' | 'linen' | 'kraft' | 'notebook' | 'parchment'
  | 'stars' | 'clouds' | 'sunset' | 'moon' | 'aurora'
  | 'ocean' | 'rain' | 'meadow' | 'blossom'
  | 'nebula' | 'synthwave' | 'fireflies'
  | 'dots' | 'ripple';

export interface BackdropDef {
  id: BackdropId;
  label: string;
  category: BackdropCategory;
  /** 1 color = solid; 2+ = top→bottom linear gradient */
  baseColors: string[];
  /** Primary text/icon color that reads well on this backdrop */
  fg: string;
  /** Card surface color when this backdrop is behind the lyric editor */
  cardBg: string;
  isDark: boolean;
  texture?: TextureKind;
}

export const BACKDROPS: Record<BackdropId, BackdropDef> = {
  // ── Paper ──
  blank:     { id: 'blank',     label: 'Blank',     category: 'paper', baseColors: ['#FAFAF8'], fg: '#1C1A17', cardBg: '#FFFFFF', isDark: false },
  parchment: { id: 'parchment', label: 'Parchment', category: 'paper', baseColors: ['#F6F0E1', '#F1E7D2'], fg: '#2D2010', cardBg: '#FBF6EA', isDark: false, texture: 'parchment' },
  linen:     { id: 'linen',     label: 'Linen',     category: 'paper', baseColors: ['#EDE8DF'], fg: '#2A1F10', cardBg: '#F8F3EA', isDark: false, texture: 'linen' },
  kraft:     { id: 'kraft',     label: 'Kraft',     category: 'paper', baseColors: ['#C9AA70', '#BE9C61'], fg: '#1C0F00', cardBg: '#D4B882', isDark: false, texture: 'kraft' },
  notebook:  { id: 'notebook',  label: 'Notebook',  category: 'paper', baseColors: ['#FDFCF7'], fg: '#1C1A17', cardBg: '#FFFFFF', isDark: false, texture: 'notebook' },
  graph:     { id: 'graph',     label: 'Graph',     category: 'paper', baseColors: ['#F8F8FC'], fg: '#1C1A2A', cardBg: '#FFFFFF', isDark: false, texture: 'graph' },

  // ── Sky ──
  clouds:    { id: 'clouds',    label: 'Clouds',    category: 'sky', baseColors: ['#BBD9F2', '#DCEBf7', '#F2F0E4'], fg: '#233A52', cardBg: '#F4F9FDDD', isDark: false, texture: 'clouds' },
  sunset:    { id: 'sunset',    label: 'Sunset',    category: 'sky', baseColors: ['#3D2C55', '#B14A6B', '#EE8A54', '#F7C873'], fg: '#FFF3E2', cardBg: '#4A3560CC', isDark: true, texture: 'sunset' },
  twilight:  { id: 'twilight',  label: 'Twilight',  category: 'sky', baseColors: ['#1B1B3A', '#41337A', '#8A5FA8'], fg: '#F0E8FF', cardBg: '#2A2650CC', isDark: true, texture: 'stars' },
  starry:    { id: 'starry',    label: 'Starry Night', category: 'sky', baseColors: ['#070D1F', '#0E1B3A', '#14264E'], fg: '#E8EEFF', cardBg: '#14203ECC', isDark: true, texture: 'stars' },
  moonlit:   { id: 'moonlit',   label: 'Moonlit',   category: 'sky', baseColors: ['#0B1026', '#1A2342', '#2A3558'], fg: '#E4E9F7', cardBg: '#1E2846CC', isDark: true, texture: 'moon' },
  aurora:    { id: 'aurora',    label: 'Aurora',    category: 'sky', baseColors: ['#04101C', '#082032', '#0C2A3E'], fg: '#DFF6EE', cardBg: '#0E2536CC', isDark: true, texture: 'aurora' },

  // ── Nature ──
  ocean:     { id: 'ocean',     label: 'Ocean',     category: 'nature', baseColors: ['#CDEBF2', '#8FD0DF', '#3E9FB8'], fg: '#0A3947', cardBg: '#E8F6F9DD', isDark: false, texture: 'ocean' },
  rain:      { id: 'rain',      label: 'Rainy Day', category: 'nature', baseColors: ['#5A6B7E', '#77889B', '#9AA9B8'], fg: '#F2F5F8', cardBg: '#6B7C8FCC', isDark: true, texture: 'rain' },
  meadow:    { id: 'meadow',    label: 'Meadow',    category: 'nature', baseColors: ['#EAF4D9', '#D8ECC0', '#BCDD9C'], fg: '#2A431C', cardBg: '#F3F9E8DD', isDark: false, texture: 'meadow' },
  blossom:   { id: 'blossom',   label: 'Blossom',   category: 'nature', baseColors: ['#FDEEF2', '#FADDE6', '#F6CBD9'], fg: '#5C2438', cardBg: '#FEF6F8DD', isDark: false, texture: 'blossom' },

  // ── Glow ──
  dark:      { id: 'dark',      label: 'Dark Room', category: 'glow', baseColors: ['#1A1814'], fg: '#F0EAE0', cardBg: '#252018', isDark: true },
  nebula:    { id: 'nebula',    label: 'Nebula',    category: 'glow', baseColors: ['#0D0620', '#1B0E38', '#2A1650'], fg: '#EFE6FF', cardBg: '#241442CC', isDark: true, texture: 'nebula' },
  synthwave: { id: 'synthwave', label: 'Synthwave', category: 'glow', baseColors: ['#12041F', '#2B0A3E', '#4A1259'], fg: '#FDE2FF', cardBg: '#2E0F44CC', isDark: true, texture: 'synthwave' },
  fireflies: { id: 'fireflies', label: 'Fireflies', category: 'glow', baseColors: ['#06130C', '#0B1F14', '#12301E'], fg: '#EAF6E8', cardBg: '#12271ACC', isDark: true, texture: 'fireflies' },

  // ── Minimal ──
  dots:      { id: 'dots',      label: 'Dots',      category: 'minimal', baseColors: ['#FAF8F4'], fg: '#1C1A17', cardBg: '#FFFFFF', isDark: false, texture: 'dots' },
  ripple:    { id: 'ripple',    label: 'Ripple',    category: 'minimal', baseColors: ['#F2F4F6'], fg: '#22303C', cardBg: '#FFFFFF', isDark: false, texture: 'ripple' },
};

export const BACKDROP_LIST: BackdropDef[] = Object.values(BACKDROPS);

export const BACKDROP_CATEGORIES: { id: BackdropCategory; label: string }[] = [
  { id: 'paper',   label: 'Paper' },
  { id: 'sky',     label: 'Sky' },
  { id: 'nature',  label: 'Nature' },
  { id: 'glow',    label: 'Glow' },
  { id: 'minimal', label: 'Minimal' },
];

/** Safe lookup — unknown/legacy ids fall back to blank. */
export function getBackdrop(id: string | undefined | null): BackdropDef {
  return (id && (BACKDROPS as Record<string, BackdropDef>)[id]) || BACKDROPS.blank;
}

// ─── Board-level customization ────────────────────────────────────────────────

/** Tint colors the user can wash over any backdrop (null = no tint). */
export const BACKDROP_TINTS: string[] = [
  '#F59E0B', // amber
  '#F472B6', // pink
  '#EF4444', // red
  '#8B5CF6', // violet
  '#0EA5E9', // sky
  '#10B981', // emerald
  '#64748B', // slate
  '#1C1A17', // ink
];

export interface IntensityOption { id: 'subtle' | 'normal' | 'bold'; label: string; value: number }
export const TEXTURE_INTENSITIES: IntensityOption[] = [
  { id: 'subtle', label: 'Subtle', value: 0.45 },
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'bold',   label: 'Bold',   value: 1.5 },
];

export const DEFAULT_TEXTURE_INTENSITY = 1;
