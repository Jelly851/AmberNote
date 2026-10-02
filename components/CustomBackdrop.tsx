// ─── CustomBackdrop ───────────────────────────────────────────────────────────
// Renders editable background data (base gradient + paper texture + elements
// + ambient fx). Used by the board canvas, board list cards, and the lyric
// editor's "Board" stage mode.
//
// Performance:
//  - Static elements render inside ONE full-canvas <Svg>, sorted by z.
//  - Animated elements get their own small absolutely-positioned Svg wrapped
//    in an Animated.View. All of them share at most THREE loop values (one
//    per speed); per-element phase comes from interpolate input ranges, so
//    50 twinkling stars still cost 3 rAF loops, not 50.
//  - Lite quality renders everything static (no loops at all).

import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

import type { GraphicsQuality } from '@/lib/backdrops';
import {
  ANIM_SPEEDS, elementPhase,
  type AmbientFx, type AnimSpeed, type BgElement, type BgFill, type BoardBackgroundData,
} from '@/lib/bgElements';
import { Texture } from '@/components/BoardBackdrop';

// ─── Fill → SVG paint ─────────────────────────────────────────────────────────

function fillDefs(fill: BgFill, id: string): React.ReactNode {
  if (fill.type === 'linear') {
    const a = ((fill.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(a) / 2, dy = Math.sin(a) / 2;
    return (
      <LinearGradient key={id} id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
        <Stop offset="0%" stopColor={fill.color} />
        <Stop offset="100%" stopColor={fill.color2 ?? fill.color} />
      </LinearGradient>
    );
  }
  if (fill.type === 'radial') {
    return (
      <RadialGradient key={id} id={id} cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={fill.color} />
        <Stop offset="100%" stopColor={fill.color2 ?? fill.color + '00'} />
      </RadialGradient>
    );
  }
  return null;
}

function paintFor(fill: BgFill, id: string): string {
  return fill.type === 'solid' ? fill.color : `url(#${id})`;
}

// ─── Element glyphs ───────────────────────────────────────────────────────────
// Drawn centered at (0,0) with a nominal width of 100 viewBox units.
// `paint` is the resolved fill; `gid` prefixes any extra gradient defs a glyph
// needs beyond its main fill (sun glow, fog fade, …).

function glyphFor(el: BgElement, paint: string): React.ReactNode {
  const c = el.fill.color;
  switch (el.kind) {
    case 'star': {
      // 5-point star, outer r 50 inner r 21
      let d = '';
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 50 : 21;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        d += `${i === 0 ? 'M' : 'L'}${Math.cos(a) * r} ${Math.sin(a) * r} `;
      }
      return <Path d={d + 'Z'} fill={paint} />;
    }
    case 'sparkle': {
      const s = 50, i = 14;
      return <Path d={`M0 ${-s} L${i} ${-i} L${s} 0 L${i} ${i} L0 ${s} L${-i} ${i} L${-s} 0 L${-i} ${-i} Z`} fill={paint} />;
    }
    case 'moon':
      return (
        <G>
          <Circle r={48} fill={paint} />
          <Circle cx={-14} cy={-10} r={9} fill="#000" opacity={0.13} />
          <Circle cx={16} cy={12} r={6} fill="#000" opacity={0.11} />
          <Circle cx={2} cy={-24} r={4.5} fill="#000" opacity={0.1} />
        </G>
      );
    case 'shooting-star':
      return (
        <G>
          <Path d="M42 -12 L-64 14 L38 -2 Z" fill={paint} opacity={0.45} />
          <Circle cx={42} cy={-10} r={7} fill={paint} />
        </G>
      );
    case 'glow-orb':
      return <Circle r={50} fill={paint} />;
    case 'cloud':
      return (
        <G>
          <Ellipse cx={0} cy={10} rx={80} ry={30} fill={paint} />
          <Ellipse cx={-38} cy={-6} rx={40} ry={25} fill={paint} />
          <Ellipse cx={26} cy={-14} rx={47} ry={29} fill={paint} />
          <Ellipse cx={58} cy={4} rx={35} ry={21} fill={paint} />
        </G>
      );
    case 'sun':
      return (
        <G>
          <Circle r={72} fill={paint} opacity={0.28} />
          <Circle r={48} fill={paint} opacity={0.5} />
          <Circle r={34} fill={paint} />
        </G>
      );
    case 'rainbow': {
      const bands = ['#EF4444', '#F59E0B', '#84CC16', '#0EA5E9'];
      return (
        <G>
          {bands.map((bc, i) => (
            <Path key={i} d={`M${-78 + i * 11} 30 A ${78 - i * 11} ${78 - i * 11} 0 0 1 ${78 - i * 11} 30`}
              stroke={bc} strokeWidth={10} fill="none" opacity={0.75} strokeLinecap="round" />
          ))}
        </G>
      );
    }
    case 'bird':
      return <Path d="M-34 4 Q-17 -20 0 4 Q17 -20 34 4" stroke={c} strokeWidth={7} fill="none" strokeLinecap="round" />;
    case 'fog-band':
      return <Ellipse rx={95} ry={13} fill={paint} />;
    case 'aurora-ribbon':
      return (
        <G>
          <Path d="M-105 12 C -45 -28, 5 30, 105 -18" stroke={paint} strokeWidth={44} fill="none" strokeLinecap="round" opacity={0.4} />
          <Path d="M-105 12 C -45 -28, 5 30, 105 -18" stroke={paint} strokeWidth={22} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'circle':
      return <Circle r={50} fill={paint} />;
    case 'ellipse':
      return <Ellipse rx={58} ry={36} fill={paint} />;
    case 'rect':
      return <Rect x={-46} y={-33} width={92} height={66} rx={10} fill={paint} />;
    case 'ring':
      return <Circle r={40} stroke={paint} strokeWidth={15} fill="none" />;
    case 'blob':
      return <Path d="M-42 -8 C-48 -38, -12 -52, 12 -44 C40 -35, 52 -14, 42 12 C33 38, 4 50, -18 42 C-40 34, -37 15, -42 -8 Z" fill={paint} />;
    case 'wave-band':
      return <Path d="M-108 0 Q-81 -14 -54 0 T 0 0 T 54 0 T 108 0 L108 60 L-108 60 Z" fill={paint} />;
    case 'synth-grid': {
      let d = '';
      let y = -28, step = 5;
      while (y < 55) { d += `M-108 ${y} H108 `; y += step; step *= 1.35; }
      for (let i = -6; i <= 6; i++) d += `M0 -28 L${i * 19} 55 `;
      return <Path d={d} stroke={paint} strokeWidth={1.6} fill="none" />;
    }
    case 'grass-tuft':
      return (
        <G>
          <Path d="M0 50 Q-4 10 -16 -26" stroke={paint} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d="M0 50 Q0 0 4 -46" stroke={paint} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d="M0 50 Q6 12 22 -18" stroke={paint} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d="M0 50 Q-8 22 -30 0" stroke={paint} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M0 50 Q10 26 32 8" stroke={paint} strokeWidth={5} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'hills':
      return (
        <G>
          <Path d="M-108 50 Q-40 -34 30 50 Z" fill={paint} />
          <Path d="M-20 50 Q 52 -14 108 50 Z" fill={paint} opacity={0.7} />
        </G>
      );
    case 'tree':
      return (
        <G>
          <Rect x={-6} y={16} width={12} height={34} rx={3} fill="#6B4A32" />
          <Circle cx={0} cy={-10} r={34} fill={paint} />
          <Circle cx={-24} cy={6} r={22} fill={paint} />
          <Circle cx={24} cy={6} r={22} fill={paint} />
        </G>
      );
    case 'branch':
      return (
        <G>
          <Path d="M50 -46 C 20 -30, -6 -12, -46 -2 M14 -28 C 6 -16, 0 -6, -8 8" stroke="#7A5240" strokeWidth={7} fill="none" strokeLinecap="round" />
          {[[-38, -4], [-16, -14], [6, -22], [26, -34], [-4, 6], [42, -42], [-24, -8]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={9} fill={paint} />
          ))}
        </G>
      );
    case 'flower':
      return (
        <G>
          <Circle cx={-16} cy={0} r={16} fill={paint} />
          <Circle cx={16} cy={0} r={16} fill={paint} />
          <Circle cx={0} cy={-16} r={16} fill={paint} />
          <Circle cx={0} cy={16} r={16} fill={paint} />
          <Circle r={12} fill="#F7C948" />
        </G>
      );
    case 'petal':
      return <Ellipse rx={30} ry={15} fill={paint} />;
    default:
      return <Circle r={50} fill={paint} />;
  }
}

// ─── Shared animation loops ───────────────────────────────────────────────────

function useSpeedLoops(enabled: boolean, speedsNeeded: AnimSpeed[]): Record<AnimSpeed, Animated.Value> {
  const loops = useRef<Record<AnimSpeed, Animated.Value>>({
    slow: new Animated.Value(0), normal: new Animated.Value(0), fast: new Animated.Value(0),
  }).current;
  const key = speedsNeeded.slice().sort().join(',');
  useEffect(() => {
    if (!enabled) return;
    const anims = speedsNeeded.map(sp => {
      const dur = ANIM_SPEEDS.find(s => s.id === sp)?.duration ?? 4800;
      const v = loops[sp];
      const a = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      a.start();
      return a;
    });
    return () => anims.forEach(a => a.stop());
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return loops;
}

/** Animated style for one element, phase-shifted off the shared loop. */
function animatedStyle(el: BgElement, v: Animated.Value, sizePx: number) {
  const p = elementPhase(el.id);
  const tri = (lo: number, hi: number) => v.interpolate({ inputRange: [0, p, 1], outputRange: [lo, hi, lo] });
  switch (el.anim) {
    case 'twinkle': return { opacity: tri(0.2, 1) };
    case 'glisten': return { opacity: tri(0.6, 1) };
    case 'pulse':   return { transform: [{ scale: tri(0.9, 1.08) }] };
    case 'drift':   return { transform: [{ translateX: tri(-sizePx * 0.12 - 4, sizePx * 0.12 + 4) }] };
    case 'sway':    return { transform: [{ rotate: v.interpolate({ inputRange: [0, p, 1], outputRange: ['-7deg', '7deg', '-7deg'] }) }] };
    default:        return {};
  }
}

// ─── Ambient effects (board-level weather) ────────────────────────────────────

function useLinearLoop(enabled: boolean, duration: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) { v.setValue(0); return; }
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [enabled, duration, v]);
  return v;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function AmbientLayer({ fx, w, h, animate }: { fx: AmbientFx; w: number; h: number; animate: boolean }) {
  const particles = useMemo(() => {
    const rand = mulberry(fx === 'rain' ? 2288 : fx === 'petals' ? 7331 : 4114);
    const n = fx === 'rain' ? 46 : fx === 'petals' ? 14 : 30;
    return Array.from({ length: n }, () => ({
      x: rand() * w, y: rand() * h,
      s: 0.5 + rand(), o: 0.25 + rand() * 0.5, r: Math.floor(rand() * 180),
    }));
  }, [fx, w, h]);
  const duration = fx === 'rain' ? 2000 : fx === 'petals' ? 13000 : 9000;
  const loop = useLinearLoop(animate, duration);
  const fall = loop.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] });

  if (fx === 'none') return null;

  const band = (yOff: number) => particles.map((p, i) => {
    const y = p.y + yOff;
    if (fx === 'rain') {
      return <Path key={`${yOff}-${i}`} d={`M${p.x} ${y} L${p.x - 3 * p.s} ${y + 13 * p.s}`} stroke="#EAF2FA" strokeWidth={1.1} strokeLinecap="round" opacity={p.o} />;
    }
    if (fx === 'petals') {
      return <Ellipse key={`${yOff}-${i}`} cx={p.x} cy={y} rx={4.5 * p.s} ry={2.4 * p.s} fill="#F29FBE" opacity={p.o} transform={`rotate(${p.r} ${p.x} ${y})`} />;
    }
    return <Circle key={`${yOff}-${i}`} cx={p.x} cy={y} r={1.6 * p.s} fill="#FFFFFF" opacity={p.o} />;
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h * 2 }, animate && { transform: [{ translateY: fall }] }]}
    >
      <Svg width={w} height={h * 2} style={StyleSheet.absoluteFill}>
        {band(0)}
        {animate ? band(h) : null}
      </Svg>
    </Animated.View>
  );
}

// ─── Static / animated element renderers ─────────────────────────────────────

function StaticElement({ el, w, h }: { el: BgElement; w: number; h: number }) {
  const s = el.size * w;
  const k = s / 100;
  const gid = `f-${el.id}`;
  const paint = paintFor(el.fill, gid);
  return (
    <G
      transform={`translate(${el.x * w} ${el.y * h}) rotate(${el.rotation}) scale(${el.flipX ? -k : k} ${k})`}
      opacity={el.opacity}
    >
      {glyphFor(el, paint)}
    </G>
  );
}

const PAD = 1.15; // glyphs can extend to ±110 viewBox units → pad the box

function AnimatedElement({ el, w, h, loops }: { el: BgElement; w: number; h: number; loops: Record<AnimSpeed, Animated.Value> }) {
  const s = el.size * w;
  const box = Math.max(8, s * 2 * PAD);
  const gid = `f-${el.id}`;
  const paint = paintFor(el.fill, gid);
  const style = animatedStyle(el, loops[el.animSpeed], s);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: el.x * w - box / 2, top: el.y * h - box / 2, width: box, height: box },
        style,
      ]}
    >
      <Svg width={box} height={box} viewBox={`${-110 * PAD} ${-110 * PAD} ${220 * PAD} ${220 * PAD}`} style={StyleSheet.absoluteFill}>
        <Defs>{fillDefs(el.fill, gid)}</Defs>
        <G transform={`rotate(${el.rotation}) scale(${el.flipX ? -2.2 : 2.2} 2.2)`} opacity={el.opacity}>
          {glyphFor(el, paint)}
        </G>
      </Svg>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface CustomBackdropProps {
  data: BoardBackgroundData;
  width: number;
  height: number;
  quality?: GraphicsQuality;
  animated?: boolean;
  /** paper texture opacity multiplier */
  intensity?: number;
  tint?: string | null;
}

const CustomBackdrop = React.memo(function CustomBackdrop({
  data, width: w, height: h, quality = 'full', animated = true, intensity = 1, tint = null,
}: CustomBackdropProps) {
  const animate = animated && quality === 'full';
  const sorted = useMemo(() => [...data.elements].sort((a, b) => a.z - b.z), [data.elements]);
  const animatedEls = animate ? sorted.filter(e => e.anim !== 'none') : [];
  const staticEls = animate ? sorted.filter(e => e.anim === 'none') : sorted;
  const speedsNeeded = useMemo(
    () => Array.from(new Set(animatedEls.map(e => e.animSpeed))),
    [animatedEls]
  );
  const loops = useSpeedLoops(animate && animatedEls.length > 0, speedsNeeded);

  if (w <= 0 || h <= 0) return null;

  const colors = data.base.colors.length > 0 ? data.base.colors : ['#FAFAF8'];

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {colors.length > 1 ? (
        <ExpoLinearGradient
          colors={colors as [string, string, ...string[]]}
          start={{ x: 0.35, y: 0 }} end={{ x: 0.65, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0] }]} />
      )}

      {data.base.texture && (
        <Texture kind={data.base.texture} w={w} h={h} q={quality} animate={false} k={intensity} />
      )}

      {/* static elements — one svg, z-sorted */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          {staticEls.map(el => fillDefs(el.fill, `f-${el.id}`))}
        </Defs>
        {staticEls.map(el => <StaticElement key={el.id} el={el} w={w} h={h} />)}
      </Svg>

      {/* animated elements — small svgs sharing ≤3 loops */}
      {animatedEls.map(el => <AnimatedElement key={el.id} el={el} w={w} h={h} loops={loops} />)}

      <AmbientLayer fx={data.ambient} w={w} h={h} animate={animate} />

      {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.16 }]} />}
    </View>
  );
});

export default CustomBackdrop;

/** Approximate on-screen bounding box for hit-testing in the editor. */
export function elementBBox(el: BgElement, w: number, h: number): { cx: number; cy: number; half: number } {
  return { cx: el.x * w, cy: el.y * h, half: Math.max(16, el.size * w * 0.55 * PAD) };
}

/** Small standalone glyph preview (asset library buttons, menus). */
export function ElementPreview({ kind, fill, size = 40 }: { kind: BgElement['kind']; fill: BgFill; size?: number }) {
  const el: BgElement = {
    id: 'preview-' + kind, kind, x: 0.5, y: 0.5, size: 1, rotation: 0, opacity: 1,
    fill, z: 0, anim: 'none', animSpeed: 'normal',
  };
  const gid = `pv-${kind}`;
  return (
    <Svg width={size} height={size} viewBox="-115 -115 230 230">
      <Defs>{fillDefs(fill, gid)}</Defs>
      <G>{glyphFor(el, paintFor(fill, gid))}</G>
    </Svg>
  );
}
