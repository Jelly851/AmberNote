// ─── Background Elements ──────────────────────────────────────────────────────
// The editable-background model. A board's background is:
//   base (gradient colors + optional paper texture) + elements[] + ambient fx.
// Templates decompose into real elements via decomposeBackdrop(), so every
// star / cloud / sun on a template board can be selected, moved, restyled,
// animated, or deleted — and users can build boards from scratch the same way.

import { getBackdrop, type TextureKind } from '@/lib/backdrops';

// ─── Fill ─────────────────────────────────────────────────────────────────────

export type FillType = 'solid' | 'linear' | 'radial';

export interface BgFill {
  type: FillType;
  color: string;
  /** second stop for linear/radial gradients */
  color2?: string;
  /** linear gradient angle in degrees (0 = left→right, 90 = top→bottom) */
  angle?: number;
}

export const solidFill = (color: string): BgFill => ({ type: 'solid', color });
export const linearFill = (color: string, color2: string, angle = 90): BgFill => ({ type: 'linear', color, color2, angle });
export const radialFill = (color: string, color2: string): BgFill => ({ type: 'radial', color, color2 });

// ─── Element kinds & library sections ────────────────────────────────────────

export type BgElementKind =
  // celestial
  | 'star' | 'sparkle' | 'moon' | 'shooting-star' | 'glow-orb'
  // sky & weather
  | 'cloud' | 'sun' | 'rainbow' | 'bird' | 'fog-band' | 'aurora-ribbon'
  // shapes
  | 'circle' | 'ellipse' | 'rect' | 'ring' | 'blob' | 'wave-band' | 'synth-grid'
  // nature
  | 'grass-tuft' | 'hills' | 'tree' | 'branch' | 'flower' | 'petal';

export interface AssetDef {
  kind: BgElementKind;
  label: string;
  /** default normalized size (fraction of canvas width) */
  size: number;
  /** default fill */
  fill: BgFill;
  /** default animation */
  anim?: BgAnimation;
}

export interface AssetSection {
  id: string;
  label: string;
  assets: AssetDef[];
}

export const ASSET_SECTIONS: AssetSection[] = [
  {
    id: 'celestial',
    label: 'Celestial',
    assets: [
      { kind: 'star',          label: 'Star',          size: 0.045, fill: solidFill('#FFF6D8'), anim: 'twinkle' },
      { kind: 'sparkle',       label: 'Sparkle',       size: 0.05,  fill: solidFill('#FFFFFF'), anim: 'twinkle' },
      { kind: 'moon',          label: 'Moon',          size: 0.22,  fill: solidFill('#EDEFF7') },
      { kind: 'shooting-star', label: 'Shooting star', size: 0.18,  fill: solidFill('#FFFFFF'), anim: 'glisten' },
      { kind: 'glow-orb',      label: 'Glow orb',      size: 0.3,   fill: radialFill('#A78BFA', '#A78BFA00'), anim: 'pulse' },
    ],
  },
  {
    id: 'sky',
    label: 'Sky & Weather',
    assets: [
      { kind: 'cloud',         label: 'Cloud',    size: 0.3,  fill: solidFill('#FFFFFF'), anim: 'drift' },
      { kind: 'sun',           label: 'Sun',      size: 0.28, fill: radialFill('#FFE9B0', '#FFC97A') },
      { kind: 'rainbow',       label: 'Rainbow',  size: 0.4,  fill: solidFill('#F59E0B') },
      { kind: 'bird',          label: 'Bird',     size: 0.05, fill: solidFill('#3A3430') },
      { kind: 'fog-band',      label: 'Haze',     size: 0.6,  fill: solidFill('#FFFFFF') },
      { kind: 'aurora-ribbon', label: 'Aurora',   size: 0.9,  fill: linearFill('#3DFFB0', '#19C9FF', 0), anim: 'glisten' },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    assets: [
      { kind: 'circle',     label: 'Circle',   size: 0.25, fill: linearFill('#F59E0B', '#F472B6', 90) },
      { kind: 'ellipse',    label: 'Ellipse',  size: 0.3,  fill: solidFill('#0EA5E9') },
      { kind: 'rect',       label: 'Rect',     size: 0.28, fill: linearFill('#A78BFA', '#0EA5E9', 45) },
      { kind: 'ring',       label: 'Ring',     size: 0.24, fill: solidFill('#F59E0B') },
      { kind: 'blob',       label: 'Blob',     size: 0.3,  fill: radialFill('#F472B6', '#F472B655') },
      { kind: 'wave-band',  label: 'Wave',     size: 1.1,  fill: solidFill('#3E9FB8') },
      { kind: 'synth-grid', label: 'Grid',     size: 1.1,  fill: solidFill('#FF4FD8') },
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    assets: [
      { kind: 'grass-tuft', label: 'Grass',   size: 0.14, fill: solidFill('#5E9C48'), anim: 'sway' },
      { kind: 'hills',      label: 'Hills',   size: 0.9,  fill: solidFill('#7FB868') },
      { kind: 'tree',       label: 'Tree',    size: 0.25, fill: solidFill('#4A7A3A') },
      { kind: 'branch',     label: 'Branch',  size: 0.4,  fill: solidFill('#F5AECB') },
      { kind: 'flower',     label: 'Flower',  size: 0.07, fill: solidFill('#F2B8CE') },
      { kind: 'petal',      label: 'Petal',   size: 0.045, fill: solidFill('#F29FBE'), anim: 'sway' },
    ],
  },
];

export function assetDefFor(kind: BgElementKind): AssetDef {
  for (const s of ASSET_SECTIONS) {
    const a = s.assets.find(x => x.kind === kind);
    if (a) return a;
  }
  return ASSET_SECTIONS[2].assets[0];
}

// ─── Animation ────────────────────────────────────────────────────────────────

export type BgAnimation = 'none' | 'twinkle' | 'glisten' | 'drift' | 'pulse' | 'sway';
export type AnimSpeed = 'slow' | 'normal' | 'fast';

export const ANIMATIONS: { id: BgAnimation; label: string }[] = [
  { id: 'none',    label: 'None' },
  { id: 'twinkle', label: 'Twinkle' },
  { id: 'glisten', label: 'Glisten' },
  { id: 'drift',   label: 'Drift' },
  { id: 'pulse',   label: 'Pulse' },
  { id: 'sway',    label: 'Sway' },
];

export const ANIM_SPEEDS: { id: AnimSpeed; label: string; duration: number }[] = [
  { id: 'slow',   label: 'Slow',   duration: 8000 },
  { id: 'normal', label: 'Normal', duration: 4800 },
  { id: 'fast',   label: 'Fast',   duration: 2600 },
];

// ─── Element ──────────────────────────────────────────────────────────────────

export interface BgElement {
  id: string;
  kind: BgElementKind;
  /** normalized canvas position of the element center (0–1) */
  x: number;
  y: number;
  /** normalized size — fraction of canvas width */
  size: number;
  /** degrees */
  rotation: number;
  /** 0–1 */
  opacity: number;
  flipX?: boolean;
  fill: BgFill;
  /** stacking order — higher renders on top */
  z: number;
  anim: BgAnimation;
  animSpeed: AnimSpeed;
}

/** Paper-style surface patterns that stay procedural (not sensible as elements). */
export type PaperTexture = 'graph' | 'linen' | 'notebook' | 'kraft' | 'parchment' | 'dots' | 'ripple';

export const PAPER_TEXTURES: { id: PaperTexture | 'none'; label: string }[] = [
  { id: 'none',      label: 'None' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'linen',     label: 'Linen' },
  { id: 'kraft',     label: 'Kraft' },
  { id: 'notebook',  label: 'Notebook' },
  { id: 'graph',     label: 'Graph' },
  { id: 'dots',      label: 'Dots' },
  { id: 'ripple',    label: 'Ripple' },
];

export interface BgBase {
  /** 1–3 colors, rendered top→bottom */
  colors: string[];
  texture?: PaperTexture;
}

export type AmbientFx = 'none' | 'rain' | 'petals' | 'snow';

export const AMBIENT_FX: { id: AmbientFx; label: string }[] = [
  { id: 'none',   label: 'None' },
  { id: 'rain',   label: 'Rain' },
  { id: 'petals', label: 'Petals' },
  { id: 'snow',   label: 'Snow' },
];

export interface BoardBackgroundData {
  base: BgBase;
  elements: BgElement[];
  ambient: AmbientFx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let elCounter = 0;
export function elementId(): string {
  return 'el' + Date.now().toString(36) + (elCounter++).toString(36) + Math.random().toString(36).slice(2, 5);
}

export function createElement(kind: BgElementKind, x: number, y: number, z: number, overrides: Partial<BgElement> = {}): BgElement {
  const def = assetDefFor(kind);
  return {
    id: elementId(),
    kind,
    x, y,
    size: def.size,
    rotation: 0,
    opacity: 1,
    fill: { ...def.fill },
    z,
    anim: def.anim ?? 'none',
    animSpeed: 'normal',
    ...overrides,
  };
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable per-element animation phase in 0.25–0.75 (keeps shared loops organic). */
export function elementPhase(id: string): number {
  return 0.25 + (hashStr(id) % 1000) / 2000;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Ink + card colors that read well over a custom base. */
export function themeForBase(base: BgBase): { fg: string; cardBg: string; isDark: boolean } {
  const avg = base.colors.reduce((s, c) => s + luminance(c), 0) / Math.max(1, base.colors.length);
  const isDark = avg < 0.45;
  return isDark
    ? { fg: '#F2EFEA', cardBg: 'rgba(30,28,40,0.72)', isDark: true }
    : { fg: '#221E1A', cardBg: 'rgba(255,255,255,0.82)', isDark: false };
}

// ─── Template decomposition ───────────────────────────────────────────────────
// Turns a backdrop template id into editable background data. Seeded so the
// same board always decomposes identically.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stars(rand: () => number, count: number, color: string, z: number, maxY = 0.9, twinkleShare = 0.5): BgElement[] {
  const out: BgElement[] = [];
  for (let i = 0; i < count; i++) {
    const sparkle = rand() > 0.88;
    out.push(createElement(sparkle ? 'sparkle' : 'star', 0.03 + rand() * 0.94, 0.02 + rand() * maxY, z + i, {
      size: sparkle ? 0.02 + rand() * 0.03 : 0.008 + rand() * 0.016,
      opacity: 0.35 + rand() * 0.65,
      fill: solidFill(color),
      anim: rand() < twinkleShare ? 'twinkle' : 'none',
      animSpeed: rand() > 0.5 ? 'normal' : 'slow',
    }));
  }
  return out;
}

export function decomposeBackdrop(backdropId: string, seedStr: string): BoardBackgroundData {
  const def = getBackdrop(backdropId);
  const rand = rng(hashStr(seedStr) || 7);
  const base: BgBase = { colors: [...def.baseColors] };
  const els: BgElement[] = [];
  let ambient: AmbientFx = 'none';

  switch (backdropId) {
    case 'graph': case 'linen': case 'notebook': case 'kraft': case 'parchment': case 'dots': case 'ripple':
      base.texture = backdropId as PaperTexture;
      break;

    case 'starry':
      els.push(...stars(rand, 44, '#FFFFFF', 10));
      break;

    case 'twilight':
      els.push(...stars(rand, 34, '#F0E8FF', 10, 0.75));
      break;

    case 'moonlit': {
      els.push(createElement('glow-orb', 0.72, 0.18, 5, { size: 0.6, fill: radialFill('#C8D4F566', '#C8D4F500'), anim: 'none' }));
      els.push(createElement('moon', 0.72, 0.18, 6, { size: 0.2, fill: solidFill('#EDEFF7') }));
      els.push(...stars(rand, 30, '#DDE6FF', 10, 0.85));
      break;
    }

    case 'aurora': {
      els.push(createElement('aurora-ribbon', 0.5, 0.24, 5, { size: 1.25, fill: linearFill('#3DFFB0', '#19C9FF', 0), anim: 'glisten', animSpeed: 'slow', opacity: 0.8 }));
      els.push(createElement('aurora-ribbon', 0.5, 0.4, 6, { size: 1.15, fill: linearFill('#7CFFCB', '#7B6CFF', 0), anim: 'glisten', animSpeed: 'normal', opacity: 0.6, rotation: -4 }));
      els.push(createElement('aurora-ribbon', 0.45, 0.12, 7, { size: 1.0, fill: linearFill('#19C9FF', '#3DFFB0', 0), anim: 'glisten', animSpeed: 'slow', opacity: 0.5, rotation: 3 }));
      els.push(...stars(rand, 22, '#CFEDE4', 10, 0.6, 0.3));
      break;
    }

    case 'clouds': {
      const n = 5;
      for (let i = 0; i < n; i++) {
        els.push(createElement('cloud', 0.12 + rand() * 0.76, 0.08 + (i / n) * 0.65 + rand() * 0.06, 5 + i, {
          size: 0.24 + rand() * 0.2,
          opacity: 0.55 + rand() * 0.35,
          anim: 'drift',
          animSpeed: i % 2 === 0 ? 'slow' : 'normal',
        }));
      }
      els.push(createElement('bird', 0.3 + rand() * 0.3, 0.12 + rand() * 0.15, 20, { size: 0.045, fill: solidFill('#3A4A5C'), opacity: 0.7 }));
      break;
    }

    case 'sunset': {
      els.push(createElement('glow-orb', 0.5, 0.58, 4, { size: 0.95, fill: radialFill('#FFE9B0AA', '#FFC97A00'), anim: 'pulse', animSpeed: 'slow' }));
      els.push(createElement('sun', 0.5, 0.58, 5, { size: 0.19, fill: radialFill('#FFEDC2', '#FFC97A') }));
      els.push(createElement('fog-band', 0.35, 0.68, 8, { size: 0.9, fill: solidFill('#FFD9A0'), opacity: 0.25 }));
      els.push(createElement('fog-band', 0.7, 0.76, 9, { size: 0.8, fill: solidFill('#FFB284'), opacity: 0.22 }));
      els.push(createElement('fog-band', 0.3, 0.84, 10, { size: 1.0, fill: solidFill('#E98668'), opacity: 0.2 }));
      for (let i = 0; i < 4; i++) {
        els.push(createElement('bird', 0.15 + rand() * 0.7, 0.1 + rand() * 0.28, 20 + i, { size: 0.03 + rand() * 0.025, fill: solidFill('#3A2440'), opacity: 0.65 }));
      }
      break;
    }

    case 'ocean': {
      for (let i = 0; i < 12; i++) {
        els.push(createElement('sparkle', 0.05 + rand() * 0.9, 0.63 + rand() * 0.3, 30 + i, {
          size: 0.015 + rand() * 0.02, fill: solidFill('#FFFFFF'), opacity: 0.3 + rand() * 0.4,
          anim: rand() > 0.5 ? 'glisten' : 'none',
        }));
      }
      els.push(createElement('wave-band', 0.5, 0.62, 5, { size: 1.2, fill: solidFill('#68B8CC'), opacity: 0.45 }));
      els.push(createElement('wave-band', 0.5, 0.75, 6, { size: 1.25, fill: solidFill('#3E9FB8'), opacity: 0.5, flipX: true }));
      els.push(createElement('wave-band', 0.5, 0.88, 7, { size: 1.3, fill: solidFill('#1E7D99'), opacity: 0.55, anim: 'drift', animSpeed: 'slow' }));
      break;
    }

    case 'rain': {
      els.push(createElement('fog-band', 0.3, 0.03, 5, { size: 1.1, fill: solidFill('#FFFFFF'), opacity: 0.14 }));
      els.push(createElement('fog-band', 0.75, 0.07, 6, { size: 0.95, fill: solidFill('#FFFFFF'), opacity: 0.11 }));
      ambient = 'rain';
      break;
    }

    case 'meadow': {
      els.push(createElement('glow-orb', 0.18, 0.1, 4, { size: 0.55, fill: radialFill('#FFF6C888', '#FFF6C800'), anim: 'none' }));
      for (let i = 0; i < 9; i++) {
        els.push(createElement('grass-tuft', 0.04 + rand() * 0.92, 0.965, 10 + i, {
          size: 0.09 + rand() * 0.08,
          fill: solidFill(rand() > 0.5 ? '#5E9C48' : '#7FB868'),
          opacity: 0.6 + rand() * 0.4,
          anim: 'sway', animSpeed: rand() > 0.5 ? 'slow' : 'normal',
        }));
      }
      for (let i = 0; i < 7; i++) {
        els.push(createElement('flower', 0.06 + rand() * 0.88, 0.9 + rand() * 0.06, 30 + i, {
          size: 0.035 + rand() * 0.025,
          fill: solidFill(['#F2B8CE', '#F7E27E', '#FFFFFF', '#D8A8F0'][Math.floor(rand() * 4)]),
        }));
      }
      break;
    }

    case 'blossom': {
      els.push(createElement('branch', 0.78, 0.1, 5, { size: 0.55, fill: solidFill('#F5AECB') }));
      for (let i = 0; i < 10; i++) {
        els.push(createElement('petal', rand(), 0.15 + rand() * 0.75, 10 + i, {
          size: 0.02 + rand() * 0.02,
          rotation: Math.floor(rand() * 180),
          fill: solidFill(rand() > 0.5 ? '#F29FBE' : '#E87DA8'),
          opacity: 0.4 + rand() * 0.5,
          anim: 'sway', animSpeed: 'slow',
        }));
      }
      ambient = 'petals';
      break;
    }

    case 'nebula': {
      const blobs: [number, number, number, string][] = [
        [0.28, 0.24, 0.75, '#8B5CF6'], [0.74, 0.42, 0.65, '#EC4899'],
        [0.5, 0.72, 0.7, '#22D3EE'], [0.15, 0.85, 0.5, '#8B5CF6'],
      ];
      blobs.forEach(([x, y, s, c], i) => {
        els.push(createElement('glow-orb', x, y, 3 + i, {
          size: s, fill: radialFill(c + '55', c + '00'),
          anim: i % 2 === 0 ? 'pulse' : 'none', animSpeed: 'slow',
        }));
      });
      els.push(...stars(rand, 38, '#F2ECFF', 10));
      break;
    }

    case 'synthwave': {
      els.push(createElement('glow-orb', 0.5, 0.52, 4, { size: 0.85, fill: radialFill('#FF4FD866', '#FF4FD800'), anim: 'pulse', animSpeed: 'slow' }));
      els.push(createElement('sun', 0.5, 0.44, 5, { size: 0.42, fill: linearFill('#FFD54A', '#FF4FA0', 90) }));
      els.push(createElement('synth-grid', 0.5, 0.76, 6, { size: 1.05, fill: solidFill('#FF4FD8'), opacity: 0.5 }));
      break;
    }

    case 'fireflies': {
      for (let i = 0; i < 8; i++) {
        els.push(createElement('grass-tuft', rand(), 0.97, 5 + i, {
          size: 0.1 + rand() * 0.1, fill: solidFill('#0A2414'), opacity: 0.5 + rand() * 0.3,
          anim: 'sway', animSpeed: 'slow',
        }));
      }
      for (let i = 0; i < 12; i++) {
        els.push(createElement('glow-orb', 0.05 + rand() * 0.9, 0.15 + rand() * 0.72, 20 + i, {
          size: 0.035 + rand() * 0.03,
          fill: radialFill('#FFE28A', '#FFE28A00'),
          anim: 'twinkle', animSpeed: rand() > 0.5 ? 'normal' : 'fast',
          opacity: 0.6 + rand() * 0.4,
        }));
      }
      break;
    }

    // blank / dark / unknown → base only
    default:
      break;
  }

  return { base, elements: els, ambient };
}
