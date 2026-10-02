// ─── Inspo Mood Board Types & Constants ──────────────────────────────────────

export type ChipStyle = 'word' | 'lyric' | 'image' | 'decor' | 'audio';

export const DECOR_SYMBOLS = [
  '✦', '✧', '★', '☆', '✶', '✸', '✹', '⋆', '✪', '✨',
  '♥', '❤', '♡', '❧',
  '♪', '♫', '♬', '♩',
  '✿', '❀', '✽', '❃', '❋',
  '◆', '◇', '●', '○', '▲', '△',
  '☽', '☾', '☀', '☁',
  '∞', '✝', '☯', '✌', '✓', '✂',
];

export type FontVariant =
  | 'sans' | 'serif' | 'cursive' | 'script' | 'mono' | 'bold'
  | 'marker' | 'type' | 'casual' | 'display' | 'narrow' | 'elegant'
  | 'comfortaa' | 'playfair-italic' | 'lora' | 'raleway' | 'pacifico'
  | 'lobster' | 'merriweather' | 'amatic' | 'cinzel' | 'shadows'
  | 'krona' | 'cormorant' | 'josefin' | 'cookie' | 'righteous';

import type { BackdropId } from '@/lib/backdrops';

export {
  BACKDROP_CATEGORIES, BACKDROP_LIST, BACKDROP_TINTS, BACKDROPS,
  DEFAULT_TEXTURE_INTENSITY, getBackdrop, TEXTURE_INTENSITIES,
} from '@/lib/backdrops';
export type { BackdropCategory, BackdropDef, BackdropId, GraphicsQuality } from '@/lib/backdrops';

/** Board background = a backdrop id (legacy ids are a subset of BackdropId). */
export type BoardBackground = BackdropId;

export const CHIP_FONT_SIZE_DEFAULT = 14;
export const CHIP_FONT_SIZE_MIN     = 10;
export const CHIP_FONT_SIZE_MAX     = 60;

export interface InspoChip {
  id: string;
  boardId: string;
  text: string;
  style: ChipStyle;
  color: string;        // gradient contribution color
  textColor: string;    // visible text color
  fontVariant: FontVariant;
  fontSize?: number;
  rotation?: number;    // radians
  imageUri?: string;
  audioUri?: string;
  audioDuration?: number; // seconds
  x: number;            // normalized 0–1 canvas position
  y: number;
  createdAt: string;
}

export interface ChipConnection {
  id: string;
  fromChipId: string;
  toChipId: string;
}

import type { AmbientFx, BgBase, BgElement } from '@/lib/bgElements';

export interface InspoBoard {
  id: string;
  title: string;
  /** template id the background started from (label/theming fallback) */
  background: BoardBackground;
  accentColor: string;
  chips: InspoChip[];
  connections: ChipConnection[];
  linkedSongId: string | null;
  notes: string;
  /** editable background: base gradient + paper texture */
  bgBase?: BgBase;
  /** editable background elements (stars, suns, shapes, …) */
  bgElements?: BgElement[];
  /** board-level weather effect */
  ambientFx?: AmbientFx;
  /** optional color wash over the backdrop (null = none) */
  backdropTint?: string | null;
  /** texture opacity multiplier — see TEXTURE_INTENSITIES */
  textureIntensity?: number;
  /** chip-driven ambient gradient on/off (default true) */
  moodGlow?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Board templates ─────────────────────────────────────────────────────────

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  background: BoardBackground;
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: 'parchment',  name: 'Parchment',       description: 'Warm & classic',       background: 'parchment' },
  { id: 'starry',     name: 'Starry Night',    description: 'Write under the stars', background: 'starry'   },
  { id: 'clouds',     name: 'Daydream',        description: 'Head in the clouds',   background: 'clouds'    },
  { id: 'sunset',     name: 'Golden Hour',     description: 'Warm fading light',    background: 'sunset'    },
  { id: 'nebula',     name: 'Nebula',          description: 'Cosmic & dreamy',      background: 'nebula'    },
  { id: 'meadow',     name: 'Meadow',          description: 'Fresh & alive',        background: 'meadow'    },
  { id: 'bulletin',   name: 'Bulletin Board',  description: 'Corkboard vibes',      background: 'kraft'     },
  { id: 'notebook',   name: 'Notebook',        description: 'Classic ruled page',   background: 'notebook'  },
  { id: 'dark',       name: 'Dark Room',       description: 'Moody & focused',      background: 'dark'      },
  { id: 'blank',      name: 'Blank',           description: 'Start from scratch',   background: 'blank'     },
];

// ─── Chip color palette ───────────────────────────────────────────────────────

export const CHIP_COLORS = [
  '#F59E0B', // amber
  '#F472B6', // pink
  '#0EA5E9', // sky
  '#34D399', // mint
  '#A78BFA', // lavender
  '#F97316', // orange
  '#EC4899', // hot pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#EF4444', // red
];

export const TEXT_COLORS = [
  '#1C1A17',
  '#FFFFFF',
  '#F59E0B',
  '#F472B6',
  '#0EA5E9',
  '#34D399',
  '#A78BFA',
  '#F97316',
  '#EF4444',
  '#6B7280',
];

export const DEFAULT_CHIP_COLOR = CHIP_COLORS[0];
export const DEFAULT_TEXT_COLOR = '#1C1A17';

// ─── Word → color mapping ─────────────────────────────────────────────────────
// Categories map to CHIP_COLORS indices. Unknown words fall back to a hash.

const WORD_CATEGORIES: [number, string[]][] = [
  // amber — warmth, nostalgia, golden, sunlight
  [0, ['warm','warmth','golden','gold','sun','sunny','glow','honey','amber','vintage','nostalgic','nostalgia','summer','afternoon','hazy','gentle','soft','cozy','comfort','home','familiar','tender','sweet','mellow','calm','peace','still','quiet','serene']],
  // pink — love, romance, feminine, bloom
  [1, ['love','lovely','lover','romance','romantic','kiss','blush','rose','bloom','blossom','petal','flutter','heart','soft','delicate','grace','beautiful','pretty','dreamy','dream','longing','missing','cherish','desire','adore','affection','intimate','tender','glow','radiant']],
  // sky — hope, freedom, open, space, clarity
  [2, ['free','freedom','open','sky','flight','fly','soar','wide','vast','clear','clarity','bright','light','hope','hopeful','breathe','air','wind','cloud','float','drift','escape','away','beyond','infinite','endless','pure','fresh','new','dawn']],
  // mint — nature, growth, healing, green
  [3, ['nature','natural','grow','growth','green','forest','tree','leaf','rain','river','earth','soil','roots','heal','healing','calm','breathe','fresh','life','alive','spring','bloom','garden','grass','wild','gentle','flow','water','sea','wave','ocean']],
  // lavender — mystery, magic, night, cosmic
  [4, ['mystery','mystical','magic','magical','spell','dream','fantasy','strange','surreal','wonder','cosmic','stars','moon','night','midnight','shadow','ghost','spirit','soul','ethereal','otherworldly','divine','sacred','deep','unknown','dark','velvet','secret','hidden','vision']],
  // orange — energy, fire, passion, urgency
  [5, ['fire','fierce','burn','burning','passion','rage','anger','fury','wild','fierce','electric','chaos','rush','running','fast','speed','power','force','crash','break','shatter','loud','scream','fight','survive','raw','real','grit','edge','heat']],
  // hot pink — fun, bold, celebration, confidence
  [6, ['bold','bright','fun','party','dance','laugh','joy','happy','excited','electric','shine','sparkle','glitter','loud','proud','confidence','fearless','rebel','alive','thrill','rush','vibrant','neon','pop','wild','color','loud','fierce','icon','king','queen']],
  // cyan — technology, cool, sharp, distance
  [7, ['cold','cool','distant','alone','lonely','empty','hollow','numb','silent','void','lost','blur','fade','grey','gray','pale','static','echo','ghost','forgotten','apart','away','separate','disconnect','still','frozen','ice','glass','mirror','reflection']],
  // lime — playful, quirky, youth, brightness
  [8, ['young','youth','play','playful','silly','laugh','fun','game','run','jump','skip','bright','shout','loud','quick','bounce','spark','burst','fizz','snap','pop','zingy','sharp','crisp','breezy','lively','spunky','smile','giggle','cheer']],
  // red — pain, intensity, danger, heartbreak
  [9, ['pain','hurt','broken','shattered','ache','cry','tears','loss','grief','gone','alone','bleeding','wound','scar','fear','dread','doubt','regret','shame','guilt','fail','crash','fall','end','die','dying','dead','hollow','nothing','void','desperate','desperate']],
];

function hashWord(word: string): number {
  let h = 0;
  for (let i = 0; i < word.length; i++) h = (Math.imul(31, h) + word.charCodeAt(i)) | 0;
  return Math.abs(h) % CHIP_COLORS.length;
}

export function chipColorForWord(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const scores = new Array(CHIP_COLORS.length).fill(0);
  for (const word of words) {
    for (const [idx, keywords] of WORD_CATEGORIES) {
      if (keywords.includes(word)) scores[idx] += 2;
      // partial match: word starts with or contains a keyword
      else if (keywords.some(k => word.startsWith(k) || k.startsWith(word))) scores[idx] += 1;
    }
  }
  const best = scores.indexOf(Math.max(...scores));
  if (scores[best] > 0) return CHIP_COLORS[best];
  // fallback: deterministic hash so same word always gets same color
  return CHIP_COLORS[hashWord(words[0] ?? text)];
}

// ─── Font variants ────────────────────────────────────────────────────────────

export interface FontConfig {
  id: FontVariant;
  label: string;
  /** Web: full CSS font-family string (with Google Font + fallback) */
  webFamily: string;
  /** Native: single font name */
  nativeFamily: string;
  fontStyle?: 'normal' | 'italic';
  fontWeight?: '400' | '500' | '600' | '700';
  /** Preview text shown in the font picker button */
  preview: string;
}

export const FONT_VARIANTS: FontConfig[] = [
  {
    id: 'sans',
    label: 'Sans',
    webFamily: 'system-ui, -apple-system, sans-serif',
    nativeFamily: 'System',
    fontWeight: '500',
    preview: 'Aa',
  },
  {
    id: 'serif',
    label: 'Serif',
    webFamily: "'Playfair Display', Georgia, serif",
    nativeFamily: 'Georgia',
    preview: 'Aa',
  },
  {
    id: 'cursive',
    label: 'Cursive',
    webFamily: "'Dancing Script', 'Brush Script MT', cursive",
    nativeFamily: 'Snell Roundhand',   // iOS; Android falls back to cursive
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'script',
    label: 'Script',
    webFamily: "'Satisfy', 'Apple Chancery', cursive",
    nativeFamily: 'Bradley Hand',      // iOS; Android falls back to cursive
    preview: 'Aa',
  },
  {
    id: 'mono',
    label: 'Mono',
    webFamily: "'Space Mono', 'Courier New', monospace",
    nativeFamily: 'Courier New',
    preview: 'Aa',
  },
  {
    id: 'bold',
    label: 'Bold',
    webFamily: 'system-ui, -apple-system, sans-serif',
    nativeFamily: 'System',
    fontWeight: '700',
    preview: 'Aa',
  },
  {
    id: 'marker',
    label: 'Marker',
    webFamily: "'Permanent Marker', cursive",
    nativeFamily: 'Marker Felt',
    preview: 'Aa',
  },
  {
    id: 'type',
    label: 'Type',
    webFamily: "'Special Elite', 'Courier New', monospace",
    nativeFamily: 'American Typewriter',
    preview: 'Aa',
  },
  {
    id: 'casual',
    label: 'Casual',
    webFamily: "'Caveat', cursive",
    nativeFamily: 'Noteworthy',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'display',
    label: 'Display',
    webFamily: "'Abril Fatface', serif",
    nativeFamily: 'Didot',
    preview: 'Aa',
  },
  {
    id: 'narrow',
    label: 'Narrow',
    webFamily: "'Oswald', sans-serif",
    nativeFamily: 'Avenir Next Condensed',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'elegant',
    label: 'Elegant',
    webFamily: "'Great Vibes', cursive",
    nativeFamily: 'Zapfino',
    preview: 'Aa',
  },
  {
    id: 'comfortaa',
    label: 'Comfortaa',
    webFamily: "'Comfortaa', sans-serif",
    nativeFamily: 'System',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'playfair-italic',
    label: 'Playfair ital.',
    webFamily: "'Playfair Display', Georgia, serif",
    nativeFamily: 'Georgia',
    fontStyle: 'italic',
    preview: 'Aa',
  },
  {
    id: 'lora',
    label: 'Lora',
    webFamily: "'Lora', Georgia, serif",
    nativeFamily: 'Palatino',
    preview: 'Aa',
  },
  {
    id: 'raleway',
    label: 'Raleway',
    webFamily: "'Raleway', sans-serif",
    nativeFamily: 'Gill Sans',
    fontWeight: '500',
    preview: 'Aa',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    webFamily: "'Pacifico', cursive",
    nativeFamily: 'Bradley Hand',
    preview: 'Aa',
  },
  {
    id: 'lobster',
    label: 'Lobster',
    webFamily: "'Lobster', cursive",
    nativeFamily: 'Snell Roundhand',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    webFamily: "'Merriweather', Georgia, serif",
    nativeFamily: 'Baskerville',
    preview: 'Aa',
  },
  {
    id: 'amatic',
    label: 'Amatic',
    webFamily: "'Amatic SC', cursive",
    nativeFamily: 'Chalkboard SE',
    fontWeight: '700',
    preview: 'Aa',
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    webFamily: "'Cinzel', serif",
    nativeFamily: 'Copperplate',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'shadows',
    label: 'Shadows',
    webFamily: "'Shadows Into Light', cursive",
    nativeFamily: 'Noteworthy',
    preview: 'Aa',
  },
  {
    id: 'krona',
    label: 'Krona',
    webFamily: "'Krona One', sans-serif",
    nativeFamily: 'Futura',
    fontWeight: '400',
    preview: 'Aa',
  },
  {
    id: 'cormorant',
    label: 'Cormorant',
    webFamily: "'Cormorant Garamond', serif",
    nativeFamily: 'Hoefler Text',
    fontStyle: 'italic',
    preview: 'Aa',
  },
  {
    id: 'josefin',
    label: 'Josefin',
    webFamily: "'Josefin Sans', sans-serif",
    nativeFamily: 'Avenir Next Condensed',
    fontWeight: '600',
    preview: 'Aa',
  },
  {
    id: 'cookie',
    label: 'Cookie',
    webFamily: "'Cookie', cursive",
    nativeFamily: 'Savoye LET',
    preview: 'Aa',
  },
  {
    id: 'righteous',
    label: 'Righteous',
    webFamily: "'Righteous', cursive",
    nativeFamily: 'Futura',
    fontWeight: '700',
    preview: 'Aa',
  },
];

export function getFontStyle(
  variant: FontVariant,
  isWeb: boolean,
): {
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  fontWeight?: '400' | '500' | '600' | '700';
} {
  const cfg = FONT_VARIANTS.find(f => f.id === variant) ?? FONT_VARIANTS[0];
  return {
    fontFamily: isWeb ? cfg.webFamily : (cfg.nativeFamily !== 'System' ? cfg.nativeFamily : undefined),
    ...(cfg.fontStyle  ? { fontStyle: cfg.fontStyle }   : {}),
    ...(cfg.fontWeight ? { fontWeight: cfg.fontWeight } : {}),
  };
}

// ─── Color utilities ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
export function blendHexColors(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a.slice(0, 7));
  const [r2, g2, b2] = hexToRgb(b.slice(0, 7));
  return rgbToHex((r1 + r2) / 2, (g1 + g2) / 2, (b1 + b2) / 2);
}

// ─── Positional gradient computation ─────────────────────────────────────────

export type GradientConfig = {
  colors: string[];
  locations: number[];
  start: { x: number; y: number };
  end:   { x: number; y: number };
};

const DEFAULT_GRAD: GradientConfig = {
  colors:    ['#FEF3C755', '#FCE7F333', '#E0F2FE22'],
  locations: [0, 0.55, 1],
  start: { x: 0, y: 0 },
  end:   { x: 1, y: 1 },
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

// Influence: 0.06 (tiny chip) → 0.45 (largest chip), linear with font size
function chipInfluence(fontSize: number | undefined): number {
  const size = fontSize ?? CHIP_FONT_SIZE_DEFAULT;
  const t = clamp01((size - CHIP_FONT_SIZE_MIN) / (CHIP_FONT_SIZE_MAX - CHIP_FONT_SIZE_MIN));
  return 0.06 + 0.39 * t;
}

function toOpacityHex(opacity: number): string {
  return Math.round(clamp01(opacity) * 255).toString(16).padStart(2, '0');
}

export function computeDirectionalGradient(chips: InspoChip[], connections: ChipConnection[] = []): GradientConfig {
  if (chips.length === 0) return DEFAULT_GRAD;

  // One entry per unique color — skip 'none' chips (they opt out of gradient influence)
  const byColor = new Map<string, InspoChip>();
  for (const c of chips) {
    if (c.color !== 'none') byColor.set(c.color, c);
  }
  const pts = Array.from(byColor.values()).map(p => ({
    chip: p,
    x: p.x,
    y: p.y,
    w: chipInfluence(p.fontSize),
  }));

  // Connected chip pairs add a weighted midpoint — skip if either end opts out
  if (connections.length > 0) {
    const chipById = new Map(chips.map(c => [c.id, c]));
    for (const conn of connections) {
      const from = chipById.get(conn.fromChipId);
      const to   = chipById.get(conn.toChipId);
      if (!from || !to || from.color === 'none' || to.color === 'none') continue;
      pts.push({
        chip: { ...from, color: blendHexColors(from.color, to.color), x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
        w: (chipInfluence(from.fontSize) + chipInfluence(to.fontSize)) / 2 * 1.5,
      });
    }
  }

  if (pts.length === 0) return DEFAULT_GRAD;

  if (pts.length === 1) {
    const op = toOpacityHex(pts[0].w);
    const op2 = toOpacityHex(pts[0].w * 0.4);
    return {
      colors:    [pts[0].chip.color + op, pts[0].chip.color + op2, '#FAFAF800'],
      locations: [0, 0.6, 1],
      start: { x: 0, y: 0 },
      end:   { x: 1, y: 1 },
    };
  }

  // Weighted centroid
  const totalW = pts.reduce((s, p) => s + p.w, 0);
  const mx = pts.reduce((s, p) => s + p.w * p.x, 0) / totalW;
  const my = pts.reduce((s, p) => s + p.w * p.y, 0) / totalW;

  // Weighted 2×2 covariance — larger chips pull the gradient axis more
  const cxx = pts.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0);
  const cyy = pts.reduce((s, p) => s + p.w * (p.y - my) ** 2, 0);
  const cxy = pts.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0);

  // Principal eigenvector = direction of maximum spread
  let dx: number, dy: number;
  if (Math.abs(cxy) < 1e-9) {
    dx = cxx >= cyy ? 1 : 0;
    dy = cxx >= cyy ? 0 : 1;
  } else {
    const half   = (cxx - cyy) / 2;
    const lambda = (cxx + cyy) / 2 + Math.sqrt(half * half + cxy * cxy);
    dx = lambda - cyy;
    dy = cxy;
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }

  // Project each chip onto that axis and sort
  const sorted = pts
    .map(p => ({ ...p, proj: (p.x - mx) * dx + (p.y - my) * dy }))
    .sort((a, b) => a.proj - b.proj);

  const minP  = sorted[0].proj;
  const maxP  = sorted[sorted.length - 1].proj;
  const range = maxP - minP;

  const locations = range > 1e-9
    ? sorted.map(s => (s.proj - minP) / range)
    : sorted.map((_, i) => i / (sorted.length - 1));

  const start = { x: clamp01(0.5 - dx * 0.5), y: clamp01(0.5 - dy * 0.5) };
  const end   = { x: clamp01(0.5 + dx * 0.5), y: clamp01(0.5 + dy * 0.5) };

  return {
    colors:    sorted.map(s => s.chip.color + toOpacityHex(s.w)),
    locations,
    start,
    end,
  };
}
