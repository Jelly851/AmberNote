// ─── BoardBackdrop ────────────────────────────────────────────────────────────
// Renders a backdrop (base gradient + SVG texture) for inspo boards, board
// card previews, and the lyric editor's "Board" stage mode.
//
// Performance rules:
//  - All texture geometry is generated once per size/quality via useMemo with
//    a seeded PRNG (deterministic — no reshuffle on re-render).
//  - Grid-like textures are drawn as a single <Path> element.
//  - Animations run only when quality === 'full' AND animated is true; they
//    use 1–2 native-driver loops on group wrappers (opacity / transform),
//    never per-element.
//  - Lite mode renders ~40% of the element count and is fully static.

import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

import { getBackdrop, type GraphicsQuality, type TextureKind } from '@/lib/backdrops';

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REF_AREA = 390 * 760; // reference phone canvas

function scaleCount(base: number, w: number, h: number, q: GraphicsQuality): number {
  const areaRatio = Math.min(1.5, (w * h) / REF_AREA);
  const qMul = q === 'full' ? 1 : 0.4;
  return Math.max(3, Math.round(base * areaRatio * qMul));
}

// ─── Animation hooks (native driver only) ────────────────────────────────────

/** 0→1→0 eased loop. Returns null when disabled (no loop scheduled). */
function useSineLoop(enabled: boolean, duration: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) { v.setValue(0); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [enabled, duration, v]);
  return v;
}

/** 0→1 linear repeating loop (for falling rain/petals). */
function useLinearLoop(enabled: boolean, duration: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) { v.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [enabled, duration, v]);
  return v;
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

type TexProps = {
  w: number; h: number;
  q: GraphicsQuality;
  animate: boolean;
  /** multiplies every texture opacity (0.45 subtle / 1 normal / 1.5 bold) */
  k: number;
};

const op = (x: number, k: number) => Math.min(1, Math.max(0, x * k));

/** 4-point sparkle star path centered at (x,y). */
function sparklePath(x: number, y: number, s: number): string {
  const i = s * 0.28;
  return `M${x} ${y - s} L${x + i} ${y - i} L${x + s} ${y} L${x + i} ${y + i} L${x} ${y + s} L${x - i} ${y + i} L${x - s} ${y} L${x - i} ${y - i} Z`;
}

interface StarPt { x: number; y: number; r: number; o: number; sparkle: boolean }

function genStars(w: number, h: number, count: number, seed: number, maxY = 1): StarPt[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: rand() * w,
    y: rand() * h * maxY,
    r: 0.5 + rand() * 1.3,
    o: 0.25 + rand() * 0.75,
    sparkle: rand() > 0.93,
  }));
}

function StarField({ stars, color, k }: { stars: StarPt[]; color: string; k: number }) {
  return (
    <G>
      {stars.map((s, i) => s.sparkle
        ? <Path key={i} d={sparklePath(s.x, s.y, s.r * 3.2)} fill={color} opacity={op(s.o, k)} />
        : <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={color} opacity={op(s.o, k)} />
      )}
    </G>
  );
}

/** Two star layers cross-fading = twinkle, driven by ONE loop value. */
function TwinklingStars({ w, h, q, animate, k, seed, baseCount, color, maxY = 1 }: TexProps & { seed: number; baseCount: number; color: string; maxY?: number }) {
  const count = scaleCount(baseCount, w, h, q);
  const [starsA, starsB] = useMemo(() => {
    const all = genStars(w, h, count, seed, maxY);
    return [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)];
  }, [w, h, count, seed, maxY]);
  const loop = useSineLoop(animate, 2600);
  const opA = loop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const opB = loop.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, animate && { opacity: opA }]} pointerEvents="none">
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}><StarField stars={starsA} color={color} k={k} /></Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, animate && { opacity: opB }]} pointerEvents="none">
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}><StarField stars={starsB} color={color} k={k} /></Svg>
      </Animated.View>
    </>
  );
}

// ─── Paper textures ───────────────────────────────────────────────────────────

function GraphTex({ w, h, k }: TexProps) {
  const { minor, major } = useMemo(() => {
    let minor = '', major = '';
    for (let x = 0; x <= w; x += 16) minor += `M${x} 0 V${h} `;
    for (let y = 0; y <= h; y += 16) minor += `M0 ${y} H${w} `;
    for (let x = 0; x <= w; x += 80) major += `M${x} 0 V${h} `;
    for (let y = 0; y <= h; y += 80) major += `M0 ${y} H${w} `;
    return { minor, major };
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Path d={minor} stroke="#6464B4" strokeWidth={0.5} opacity={op(0.07, k)} />
      <Path d={major} stroke="#6464B4" strokeWidth={0.8} opacity={op(0.12, k)} />
    </Svg>
  );
}

function LinenTex({ w, h, k }: TexProps) {
  const d = useMemo(() => {
    let s = '';
    for (let y = 0; y <= h; y += 7) s += `M0 ${y} H${w} `;
    for (let x = 0; x <= w; x += 7) s += `M${x} 0 V${h} `;
    return s;
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Path d={d} stroke="#503214" strokeWidth={0.4} opacity={op(0.06, k)} />
    </Svg>
  );
}

function NotebookTex({ w, h, k }: TexProps) {
  const lines = useMemo(() => {
    let s = '';
    for (let y = 34; y <= h; y += 26) s += `M0 ${y} H${w} `;
    return s;
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Path d={lines} stroke="#7FA3D4" strokeWidth={1} opacity={op(0.35, k)} />
      <Line x1={44} y1={0} x2={44} y2={h} stroke="#E08890" strokeWidth={1.2} opacity={op(0.55, k)} />
    </Svg>
  );
}

function KraftTex({ w, h, q, k }: TexProps) {
  const specks = useMemo(() => {
    const rand = mulberry32(7401);
    return Array.from({ length: scaleCount(110, w, h, q) }, () => ({
      x: rand() * w, y: rand() * h, r: 0.5 + rand() * 1.1, o: 0.04 + rand() * 0.08,
    }));
  }, [w, h, q]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="kraftVig" cx="50%" cy="45%" r="75%">
          <Stop offset="60%" stopColor="#3A2408" stopOpacity="0" />
          <Stop offset="100%" stopColor="#3A2408" stopOpacity={op(0.18, k)} />
        </RadialGradient>
      </Defs>
      {specks.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#2A1804" opacity={op(s.o, k)} />)}
      <Rect x={0} y={0} width={w} height={h} fill="url(#kraftVig)" />
    </Svg>
  );
}

function ParchmentTex({ w, h, q, k }: TexProps) {
  const blotches = useMemo(() => {
    const rand = mulberry32(1215);
    return Array.from({ length: scaleCount(9, w, h, q) }, () => ({
      x: rand() * w, y: rand() * h,
      rx: 40 + rand() * 90, ry: 25 + rand() * 60,
      o: 0.03 + rand() * 0.05,
    }));
  }, [w, h, q]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="parchVig" cx="50%" cy="45%" r="78%">
          <Stop offset="55%" stopColor="#8A6A30" stopOpacity="0" />
          <Stop offset="100%" stopColor="#8A6A30" stopOpacity={op(0.16, k)} />
        </RadialGradient>
      </Defs>
      {blotches.map((b, i) => <Ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill="#B08A48" opacity={op(b.o, k)} />)}
      <Rect x={0} y={0} width={w} height={h} fill="url(#parchVig)" />
    </Svg>
  );
}

// ─── Sky textures ─────────────────────────────────────────────────────────────

function CloudPuff({ x, y, s, o }: { x: number; y: number; s: number; o: number }) {
  return (
    <G opacity={o}>
      <Ellipse cx={x} cy={y} rx={s * 1.6} ry={s * 0.62} fill="#FFFFFF" />
      <Ellipse cx={x - s * 0.75} cy={y - s * 0.28} rx={s * 0.8} ry={s * 0.5} fill="#FFFFFF" />
      <Ellipse cx={x + s * 0.55} cy={y - s * 0.38} rx={s * 0.95} ry={s * 0.58} fill="#FFFFFF" />
      <Ellipse cx={x + s * 1.15} cy={y - s * 0.05} rx={s * 0.7} ry={s * 0.42} fill="#FFFFFF" />
    </G>
  );
}

function CloudsTex({ w, h, q, animate, k }: TexProps) {
  const clouds = useMemo(() => {
    const rand = mulberry32(3302);
    const n = Math.max(3, scaleCount(6, w, h, q));
    const scale = Math.sqrt(w * h);
    return Array.from({ length: n }, (_, i) => ({
      x: rand() * w,
      y: (0.06 + 0.72 * (i / n) + rand() * 0.08) * h,
      s: (0.045 + rand() * 0.05) * scale,
      o: op(0.5 + rand() * 0.35, k),
    }));
  }, [w, h, q, k]);
  const loop = useSineLoop(animate, 11000);
  const drift = loop.interpolate({ inputRange: [0, 1], outputRange: [-13, 13] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, animate && { transform: [{ translateX: drift }] }]} pointerEvents="none">
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {clouds.map((c, i) => <CloudPuff key={i} {...c} />)}
      </Svg>
    </Animated.View>
  );
}

function SunsetTex({ w, h, q, k }: TexProps) {
  const birds = useMemo(() => {
    const rand = mulberry32(880);
    return Array.from({ length: q === 'full' ? 5 : 2 }, () => {
      const x = (0.1 + rand() * 0.8) * w;
      const y = (0.12 + rand() * 0.3) * h;
      const s = 4 + rand() * 5;
      return `M${x - s} ${y} Q${x - s / 2} ${y - s * 0.9} ${x} ${y} Q${x + s / 2} ${y - s * 0.9} ${x + s} ${y}`;
    });
  }, [w, h, q]);
  const sunY = h * 0.58;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFE9B0" stopOpacity={op(0.85, k)} />
          <Stop offset="45%" stopColor="#FFC97A" stopOpacity={op(0.35, k)} />
          <Stop offset="100%" stopColor="#FFC97A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={w * 0.5} cy={sunY} r={Math.min(w, h) * 0.42} fill="url(#sunGlow)" />
      <Circle cx={w * 0.5} cy={sunY} r={Math.min(w, h) * 0.085} fill="#FFEDC2" opacity={op(0.95, k)} />
      {/* haze bands */}
      <Ellipse cx={w * 0.35} cy={h * 0.68} rx={w * 0.5} ry={7} fill="#FFD9A0" opacity={op(0.22, k)} />
      <Ellipse cx={w * 0.7} cy={h * 0.76} rx={w * 0.45} ry={6} fill="#FFB284" opacity={op(0.2, k)} />
      <Ellipse cx={w * 0.3} cy={h * 0.84} rx={w * 0.55} ry={8} fill="#E98668" opacity={op(0.18, k)} />
      {birds.map((d, i) => <Path key={i} d={d} stroke="#3A2440" strokeWidth={1.4} fill="none" opacity={op(0.65, k)} />)}
    </Svg>
  );
}

function MoonTex({ w, h, q, animate, k }: TexProps) {
  const mx = w * 0.72, my = h * 0.18, mr = Math.min(w, h) * 0.11;
  return (
    <>
      <TwinklingStars w={w} h={h} q={q} animate={animate} k={k} seed={4207} baseCount={70} color="#DDE6FF" maxY={0.85} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#C8D4F5" stopOpacity={op(0.5, k)} />
            <Stop offset="100%" stopColor="#C8D4F5" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={mx} cy={my} r={mr * 3} fill="url(#moonGlow)" />
        <Circle cx={mx} cy={my} r={mr} fill="#EDEFF7" opacity={op(0.96, k)} />
        <Circle cx={mx - mr * 0.3} cy={my - mr * 0.2} r={mr * 0.18} fill="#C6CCE0" opacity={op(0.7, k)} />
        <Circle cx={mx + mr * 0.35} cy={my + mr * 0.25} r={mr * 0.12} fill="#C6CCE0" opacity={op(0.6, k)} />
        <Circle cx={mx + 2} cy={my - mr * 0.45} r={mr * 0.09} fill="#C6CCE0" opacity={op(0.55, k)} />
      </Svg>
    </>
  );
}

function AuroraTex({ w, h, q, animate, k }: TexProps) {
  const ribbons = useMemo(() => ([
    { d: `M${-w * 0.1} ${h * 0.30} C ${w * 0.25} ${h * 0.14}, ${w * 0.5} ${h * 0.38}, ${w * 1.1} ${h * 0.16}`, c1: '#3DFFB0', c2: '#19C9FF', sw: h * 0.09 },
    { d: `M${-w * 0.1} ${h * 0.44} C ${w * 0.3} ${h * 0.30}, ${w * 0.65} ${h * 0.5}, ${w * 1.1} ${h * 0.3}`, c1: '#7CFFCB', c2: '#7B6CFF', sw: h * 0.06 },
    { d: `M${-w * 0.1} ${h * 0.20} C ${w * 0.35} ${h * 0.05}, ${w * 0.6} ${h * 0.26}, ${w * 1.1} ${h * 0.06}`, c1: '#19C9FF', c2: '#3DFFB0', sw: h * 0.045 },
  ]), [w, h]);
  const loop = useSineLoop(animate, 5200);
  const pulse = loop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return (
    <>
      <TwinklingStars w={w} h={h} q={q} animate={false} k={k} seed={9925} baseCount={45} color="#CFEDE4" maxY={0.7} />
      <Animated.View style={[StyleSheet.absoluteFill, animate && { opacity: pulse }]} pointerEvents="none">
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            {ribbons.map((r, i) => (
              <LinearGradient key={i} id={`aur${i}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={r.c1} stopOpacity="0" />
                <Stop offset="35%" stopColor={r.c1} stopOpacity={op(0.30, k)} />
                <Stop offset="70%" stopColor={r.c2} stopOpacity={op(0.26, k)} />
                <Stop offset="100%" stopColor={r.c2} stopOpacity="0" />
              </LinearGradient>
            ))}
          </Defs>
          {ribbons.map((r, i) => (
            <G key={i}>
              <Path d={r.d} stroke={`url(#aur${i})`} strokeWidth={r.sw} fill="none" strokeLinecap="round" />
              <Path d={r.d} stroke={`url(#aur${i})`} strokeWidth={r.sw * 2.1} fill="none" strokeLinecap="round" opacity={0.4} />
            </G>
          ))}
        </Svg>
      </Animated.View>
    </>
  );
}

// ─── Nature textures ──────────────────────────────────────────────────────────

function wavePath(w: number, y: number, amp: number, segments: number): string {
  let d = `M0 ${y}`;
  const seg = w / segments;
  for (let i = 0; i < segments; i++) {
    const x0 = i * seg;
    d += ` Q ${x0 + seg / 2} ${y + (i % 2 === 0 ? -amp : amp)} ${x0 + seg} ${y}`;
  }
  return d + ` L ${w} 99999 L 0 99999 Z`;
}

function OceanTex({ w, h, q, animate, k }: TexProps) {
  const glints = useMemo(() => {
    const rand = mulberry32(6110);
    return Array.from({ length: scaleCount(18, w, h, q) }, () => ({
      x: rand() * w, y: (0.62 + rand() * 0.34) * h, len: 6 + rand() * 14, o: 0.2 + rand() * 0.35,
    }));
  }, [w, h, q]);
  const loop = useSineLoop(animate, 7000);
  const sway = loop.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] });
  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {glints.map((g, i) => (
          <Line key={i} x1={g.x - g.len / 2} y1={g.y} x2={g.x + g.len / 2} y2={g.y}
            stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={op(g.o, k)} />
        ))}
        <Path d={wavePath(w, h * 0.60, 7, 6)} fill="#68B8CC" opacity={op(0.4, k)} />
        <Path d={wavePath(w, h * 0.74, 8, 5)} fill="#3E9FB8" opacity={op(0.45, k)} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, animate && { transform: [{ translateX: sway }] }]} pointerEvents="none">
        <Svg width={w + 24} height={h} style={{ marginLeft: -12 }}>
          <Path d={wavePath(w + 24, h * 0.86, 9, 6)} fill="#1E7D99" opacity={op(0.5, k)} />
        </Svg>
      </Animated.View>
    </>
  );
}

function RainTex({ w, h, q, animate, k }: TexProps) {
  // streaks generated in a band of height h, duplicated below, whole layer
  // translates -h→0 on a linear loop = seamless falling rain
  const streaks = useMemo(() => {
    const rand = mulberry32(2288);
    return Array.from({ length: scaleCount(60, w, h, q) }, () => ({
      x: rand() * w, y: rand() * h, len: 9 + rand() * 12, o: 0.15 + rand() * 0.3,
    }));
  }, [w, h, q]);
  const loop = useLinearLoop(animate, 1900);
  const fall = loop.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] });
  const band = (yOff: number) => streaks.map((s, i) => (
    <Line key={`${yOff}-${i}`} x1={s.x} y1={s.y + yOff} x2={s.x - s.len * 0.25} y2={s.y + yOff + s.len}
      stroke="#EAF2FA" strokeWidth={1.1} strokeLinecap="round" opacity={op(s.o, k)} />
  ));
  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Ellipse cx={w * 0.3} cy={-h * 0.02} rx={w * 0.55} ry={h * 0.09} fill="#FFFFFF" opacity={op(0.13, k)} />
        <Ellipse cx={w * 0.75} cy={h * 0.015} rx={w * 0.5} ry={h * 0.08} fill="#FFFFFF" opacity={op(0.11, k)} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h * 2 }, animate && { transform: [{ translateY: fall }] }]} pointerEvents="none">
        <Svg width={w} height={h * 2}>
          {band(0)}
          {animate ? band(h) : null}
        </Svg>
      </Animated.View>
    </>
  );
}

function MeadowTex({ w, h, q, k }: TexProps) {
  const { blades, flowers } = useMemo(() => {
    const rand = mulberry32(5150);
    const blades = Array.from({ length: scaleCount(40, w, h, q) }, () => {
      const x = rand() * w;
      const bh = 14 + rand() * 26;
      const lean = (rand() - 0.5) * 14;
      return { d: `M${x} ${h} Q ${x + lean} ${h - bh * 0.6} ${x + lean * 1.6} ${h - bh}`, o: 0.3 + rand() * 0.4, g: rand() > 0.5 };
    });
    const flowers = Array.from({ length: scaleCount(10, w, h, q) }, () => ({
      x: rand() * w, y: h - 8 - rand() * 34, r: 2.2 + rand() * 1.8,
      c: ['#F2B8CE', '#F7E27E', '#FFFFFF', '#D8A8F0'][Math.floor(rand() * 4)],
      o: 0.75 + rand() * 0.25,
    }));
    return { blades, flowers };
  }, [w, h, q]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="meadowSun" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFF6C8" stopOpacity={op(0.55, k)} />
          <Stop offset="100%" stopColor="#FFF6C8" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={w * 0.18} cy={h * 0.1} r={Math.min(w, h) * 0.3} fill="url(#meadowSun)" />
      {blades.map((b, i) => (
        <Path key={i} d={b.d} stroke={b.g ? '#5E9C48' : '#7FB868'} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={op(b.o, k)} />
      ))}
      {flowers.map((f, i) => (
        <G key={`f${i}`} opacity={op(f.o, k)}>
          <Circle cx={f.x - f.r} cy={f.y} r={f.r} fill={f.c} />
          <Circle cx={f.x + f.r} cy={f.y} r={f.r} fill={f.c} />
          <Circle cx={f.x} cy={f.y - f.r} r={f.r} fill={f.c} />
          <Circle cx={f.x} cy={f.y + f.r} r={f.r} fill={f.c} />
          <Circle cx={f.x} cy={f.y} r={f.r * 0.75} fill="#F7C948" />
        </G>
      ))}
    </Svg>
  );
}

function BlossomTex({ w, h, q, animate, k }: TexProps) {
  const { branch, clusters, petals } = useMemo(() => {
    const rand = mulberry32(7331);
    const branch = `M${w * 1.02} ${-h * 0.02} C ${w * 0.82} ${h * 0.06}, ${w * 0.72} ${h * 0.13}, ${w * 0.52} ${h * 0.15}`
      + ` M${w * 0.8} ${h * 0.075} C ${w * 0.74} ${h * 0.12}, ${w * 0.7} ${h * 0.17}, ${w * 0.66} ${h * 0.21}`;
    const clusters = Array.from({ length: scaleCount(9, w, h, q) }, () => ({
      x: (0.5 + rand() * 0.5) * w, y: (0.02 + rand() * 0.2) * h, r: 3.5 + rand() * 3,
      o: 0.7 + rand() * 0.3,
    }));
    const petals = Array.from({ length: scaleCount(16, w, h, q) }, () => ({
      x: rand() * w, y: rand() * h, rx: 2.5 + rand() * 2, ry: 1.4 + rand() * 1,
      rot: Math.floor(rand() * 180), o: 0.35 + rand() * 0.45,
      c: rand() > 0.5 ? '#F29FBE' : '#E87DA8',
    }));
    return { branch, clusters, petals };
  }, [w, h, q]);
  const loop = useSineLoop(animate, 9000);
  const sway = loop.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const sink = loop.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Path d={branch} stroke="#7A5240" strokeWidth={5} fill="none" strokeLinecap="round" opacity={op(0.8, k)} />
        {clusters.map((c, i) => (
          <G key={i} opacity={op(c.o, k)}>
            <Circle cx={c.x - c.r * 0.7} cy={c.y} r={c.r} fill="#F5AECB" />
            <Circle cx={c.x + c.r * 0.7} cy={c.y + c.r * 0.3} r={c.r * 0.85} fill="#EE8FB4" />
            <Circle cx={c.x} cy={c.y - c.r * 0.6} r={c.r * 0.8} fill="#F8C4D8" />
          </G>
        ))}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, animate && { transform: [{ translateX: sway }, { translateY: sink }] }]} pointerEvents="none">
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {petals.map((p, i) => (
            <Ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={p.c}
              opacity={op(p.o, k)} transform={`rotate(${p.rot} ${p.x} ${p.y})`} />
          ))}
        </Svg>
      </Animated.View>
    </>
  );
}

// ─── Glow textures ────────────────────────────────────────────────────────────

function NebulaTex({ w, h, q, animate, k }: TexProps) {
  const blobs = useMemo(() => ([
    { x: w * 0.28, y: h * 0.24, r: Math.min(w, h) * 0.42, c: '#8B5CF6', o: 0.34 },
    { x: w * 0.74, y: h * 0.42, r: Math.min(w, h) * 0.36, c: '#EC4899', o: 0.26 },
    { x: w * 0.5, y: h * 0.72, r: Math.min(w, h) * 0.4, c: '#22D3EE', o: 0.2 },
    { x: w * 0.15, y: h * 0.85, r: Math.min(w, h) * 0.3, c: '#8B5CF6', o: 0.2 },
  ]), [w, h]);
  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient key={i} id={`neb${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={b.c} stopOpacity={op(b.o, k)} />
              <Stop offset="100%" stopColor={b.c} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => <Circle key={i} cx={b.x} cy={b.y} r={b.r} fill={`url(#neb${i})`} />)}
      </Svg>
      <TwinklingStars w={w} h={h} q={q} animate={animate} k={k} seed={3141} baseCount={80} color="#F2ECFF" />
    </>
  );
}

function SynthwaveTex({ w, h, k }: TexProps) {
  const horizon = h * 0.52;
  const grid = useMemo(() => {
    let d = '';
    // horizontal lines, spacing grows toward bottom
    let y = horizon + 6, step = 7;
    while (y < h) { d += `M0 ${y} H${w} `; y += step; step *= 1.32; }
    // verticals converging on the vanishing point
    const vx = w / 2;
    for (let i = -8; i <= 8; i++) {
      const xBottom = vx + i * (w / 9);
      d += `M${vx} ${horizon} L${xBottom} ${h} `;
    }
    return d;
  }, [w, h, horizon]);
  const sunR = Math.min(w, h) * 0.2;
  const stripes = [0.1, 0.32, 0.52, 0.7].map(t => horizon - sunR + sunR * 2 * t * 0.5 + sunR * 0.45);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="swSun" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFD54A" stopOpacity={op(0.95, k)} />
          <Stop offset="100%" stopColor="#FF4FA0" stopOpacity={op(0.9, k)} />
        </LinearGradient>
        <RadialGradient id="swGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FF4FD8" stopOpacity={op(0.4, k)} />
          <Stop offset="100%" stopColor="#FF4FD8" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={w / 2} cy={horizon} r={sunR * 2.2} fill="url(#swGlow)" />
      <Path d={`M${w / 2 - sunR} ${horizon} A ${sunR} ${sunR} 0 0 1 ${w / 2 + sunR} ${horizon} Z`} fill="url(#swSun)" />
      {stripes.map((y, i) => (
        y < horizon ? <Rect key={i} x={w / 2 - sunR} y={y} width={sunR * 2} height={2.5 + i} fill="#2B0A3E" opacity={op(0.9, k)} /> : null
      ))}
      <Line x1={0} y1={horizon} x2={w} y2={horizon} stroke="#FF7BE0" strokeWidth={1.6} opacity={op(0.7, k)} />
      <Path d={grid} stroke="#FF4FD8" strokeWidth={0.8} opacity={op(0.32, k)} />
    </Svg>
  );
}

function FirefliesTex({ w, h, q, animate, k }: TexProps) {
  const { flies, grass } = useMemo(() => {
    const rand = mulberry32(8817);
    const flies = Array.from({ length: scaleCount(16, w, h, q) }, () => ({
      x: rand() * w, y: (0.15 + rand() * 0.75) * h, r: 1.4 + rand() * 1.6, o: 0.5 + rand() * 0.5,
    }));
    const grass = Array.from({ length: scaleCount(26, w, h, q) }, () => {
      const x = rand() * w;
      const gh = 16 + rand() * 30;
      const lean = (rand() - 0.5) * 16;
      return { d: `M${x} ${h} Q ${x + lean} ${h - gh * 0.6} ${x + lean * 1.7} ${h - gh}`, o: 0.35 + rand() * 0.3 };
    });
    return { flies, grass };
  }, [w, h, q]);
  const loop = useSineLoop(animate, 3400);
  const pulse = loop.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {grass.map((g, i) => <Path key={i} d={g.d} stroke="#0A2414" strokeWidth={2} fill="none" strokeLinecap="round" opacity={op(g.o, k)} />)}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, animate && { opacity: pulse }]} pointerEvents="none">
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="ffGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFE28A" stopOpacity={op(0.5, k)} />
              <Stop offset="100%" stopColor="#FFE28A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          {flies.map((f, i) => (
            <G key={i}>
              <Circle cx={f.x} cy={f.y} r={f.r * 4.5} fill="url(#ffGlow)" />
              <Circle cx={f.x} cy={f.y} r={f.r} fill="#FFEDAE" opacity={op(f.o, k)} />
            </G>
          ))}
        </Svg>
      </Animated.View>
    </>
  );
}

// ─── Minimal textures ─────────────────────────────────────────────────────────

function DotsTex({ w, h, k }: TexProps) {
  const dots = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const gap = 24;
    for (let row = 0; row * gap <= h + gap; row++) {
      const off = row % 2 === 0 ? 0 : gap / 2;
      for (let x = off; x <= w; x += gap) pts.push({ x, y: row * gap });
    }
    return pts;
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {dots.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#1C1A17" opacity={op(0.1, k)} />)}
    </Svg>
  );
}

function RippleTex({ w, h, k }: TexProps) {
  const rings = useMemo(() => {
    const out: { cx: number; cy: number; r: number }[] = [];
    const centers = [{ cx: w * 0.88, cy: h * 0.12 }, { cx: w * 0.08, cy: h * 0.92 }];
    for (const c of centers) {
      for (let r = 30; r < Math.max(w, h) * 0.85; r += 34) out.push({ ...c, r });
    }
    return out;
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {rings.map((r, i) => <Circle key={i} cx={r.cx} cy={r.cy} r={r.r} stroke="#22303C" strokeWidth={1} fill="none" opacity={op(0.06, k)} />)}
    </Svg>
  );
}

// ─── Texture router ───────────────────────────────────────────────────────────
// Exported so CustomBackdrop can render paper-style surface patterns.

export function Texture({ kind, ...p }: TexProps & { kind: TextureKind }) {
  switch (kind) {
    case 'graph':     return <GraphTex {...p} />;
    case 'linen':     return <LinenTex {...p} />;
    case 'kraft':     return <KraftTex {...p} />;
    case 'notebook':  return <NotebookTex {...p} />;
    case 'parchment': return <ParchmentTex {...p} />;
    case 'stars':     return <TwinklingStars {...p} seed={1187} baseCount={95} color="#FFFFFF" />;
    case 'clouds':    return <CloudsTex {...p} />;
    case 'sunset':    return <SunsetTex {...p} />;
    case 'moon':      return <MoonTex {...p} />;
    case 'aurora':    return <AuroraTex {...p} />;
    case 'ocean':     return <OceanTex {...p} />;
    case 'rain':      return <RainTex {...p} />;
    case 'meadow':    return <MeadowTex {...p} />;
    case 'blossom':   return <BlossomTex {...p} />;
    case 'nebula':    return <NebulaTex {...p} />;
    case 'synthwave': return <SynthwaveTex {...p} />;
    case 'fireflies': return <FirefliesTex {...p} />;
    case 'dots':      return <DotsTex {...p} />;
    case 'ripple':    return <RippleTex {...p} />;
    default:          return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface BoardBackdropProps {
  backdropId: string;
  width: number;
  height: number;
  quality?: GraphicsQuality;
  /** default true — set false for previews/list cards */
  animated?: boolean;
  /** texture opacity multiplier (0.45 subtle / 1 normal / 1.5 bold) */
  intensity?: number;
  /** optional color wash over the whole backdrop */
  tint?: string | null;
  style?: object;
}

const BoardBackdrop = React.memo(function BoardBackdrop({
  backdropId, width, height, quality = 'full', animated = true, intensity = 1, tint = null, style,
}: BoardBackdropProps) {
  const def = getBackdrop(backdropId);
  if (width <= 0 || height <= 0) return null;
  const animate = animated && quality === 'full';
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none">
      {def.baseColors.length > 1 ? (
        <ExpoLinearGradient
          colors={def.baseColors as [string, string, ...string[]]}
          start={{ x: 0.35, y: 0 }} end={{ x: 0.65, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: def.baseColors[0] }]} />
      )}
      {def.texture && (
        <Texture kind={def.texture} w={width} h={height} q={quality} animate={animate} k={intensity} />
      )}
      {tint && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.16 }]} />
      )}
    </View>
  );
});

export default BoardBackdrop;
