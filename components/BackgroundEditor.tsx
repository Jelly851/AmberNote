// ─── Background editing UI ────────────────────────────────────────────────────
// Element menu (fill / adjust / effect), asset library panel, slider, and
// selection ring used by the board screen's background layer.

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ElementPreview } from '@/components/CustomBackdrop';
import {
  ANIM_SPEEDS, ANIMATIONS, ASSET_SECTIONS,
  type AssetDef, type BgElement, type FillType,
} from '@/lib/bgElements';

// ─── Mini slider ──────────────────────────────────────────────────────────────

export function MiniSlider({ label, value, min, max, accent, onChange, onCommit, format }: {
  label: string; value: number; min: number; max: number; accent: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
}) {
  const trackW = useRef(1);
  const grantX = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fromX = (x: number) => clamp(min + (x / trackW.current) * (max - min));

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      grantX.current = e.nativeEvent.locationX;
      cb.current.onChange(fromX(grantX.current));
    },
    onPanResponderMove: (_, gs) => {
      cb.current.onChange(fromX(grantX.current + gs.dx));
    },
    onPanResponderRelease: () => cb.current.onCommit?.(latest.current),
    onPanResponderTerminate: () => cb.current.onCommit?.(latest.current),
  })).current;

  const t = (value - min) / (max - min);

  return (
    <View style={slSt.row}>
      <Text style={slSt.label}>{label}</Text>
      <View
        style={slSt.track}
        onLayout={e => { trackW.current = Math.max(1, e.nativeEvent.layout.width); }}
        {...pan.panHandlers}
      >
        <View style={[slSt.fill, { width: `${t * 100}%`, backgroundColor: accent }]} />
        <View style={[slSt.thumb, { left: `${t * 100}%`, borderColor: accent }]} />
      </View>
      <Text style={slSt.value}>{format ? format(value) : Math.round(value)}</Text>
    </View>
  );
}

const slSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  label: { width: 62, fontSize: 12, fontWeight: '600', color: '#6B6560' },
  track: { flex: 1, height: 26, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  thumb: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9,
    backgroundColor: '#FFFFFF', borderWidth: 2.5,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  value: { width: 42, fontSize: 11, fontWeight: '600', color: '#A09890', textAlign: 'right' },
});

// ─── Element menu ─────────────────────────────────────────────────────────────

const MENU_W = 288;

const FILL_SWATCHES = [
  '#FFFFFF', '#FFF6D8', '#1C1A17', '#F59E0B', '#F472B6', '#EF4444',
  '#8B5CF6', '#0EA5E9', '#34D399', '#84CC16', '#FF4FD8', '#FFE28A',
];

export function ElementMenu({ element, x, y, canvasW, canvasH, accent, onUpdate, onDuplicate, onReorder, onDelete, onPickColor, onClose }: {
  element: BgElement;
  x: number; y: number; canvasW: number; canvasH: number;
  accent: string;
  onUpdate: (patch: Partial<Omit<BgElement, 'id'>>) => void;
  onDuplicate: () => void;
  onReorder: (dir: 'forward' | 'back') => void;
  onDelete: () => void;
  /** open the full color picker for 'color' | 'color2' */
  onPickColor: (which: 'color' | 'color2') => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'fill' | 'adjust' | 'effect'>('adjust');
  const menuH = 320;
  const left = Math.max(8, Math.min(canvasW - MENU_W - 8, x - MENU_W / 2));
  const top = Math.max(8, Math.min(canvasH - menuH - 8, y + 24));

  const fill = element.fill;

  return (
    <View style={[emSt.box, { left, top, width: MENU_W }]}>
      {/* header actions */}
      <View style={emSt.headerRow}>
        <View style={emSt.headerPreview}>
          <ElementPreview kind={element.kind} fill={fill} size={26} />
        </View>
        <TouchableOpacity style={emSt.actBtn} onPress={onDuplicate} hitSlop={hs}>
          <Ionicons name="copy-outline" size={16} color="#6B6560" />
        </TouchableOpacity>
        <TouchableOpacity style={emSt.actBtn} onPress={() => onUpdate({ flipX: !element.flipX })} hitSlop={hs}>
          <Ionicons name="swap-horizontal-outline" size={16} color="#6B6560" />
        </TouchableOpacity>
        <TouchableOpacity style={emSt.actBtn} onPress={() => onReorder('back')} hitSlop={hs}>
          <Ionicons name="arrow-down-outline" size={16} color="#6B6560" />
        </TouchableOpacity>
        <TouchableOpacity style={emSt.actBtn} onPress={() => onReorder('forward')} hitSlop={hs}>
          <Ionicons name="arrow-up-outline" size={16} color="#6B6560" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={emSt.actBtn} onPress={onDelete} hitSlop={hs}>
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </TouchableOpacity>
        <TouchableOpacity style={emSt.actBtn} onPress={onClose} hitSlop={hs}>
          <Ionicons name="close" size={17} color="#6B6560" />
        </TouchableOpacity>
      </View>

      {/* tabs */}
      <View style={emSt.tabRow}>
        {(['fill', 'adjust', 'effect'] as const).map(t => (
          <TouchableOpacity key={t} style={[emSt.tab, tab === t && { borderBottomColor: accent }]} onPress={() => setTab(t)}>
            <Text style={[emSt.tabText, tab === t && { color: accent }]}>
              {t === 'fill' ? 'Fill' : t === 'adjust' ? 'Adjust' : 'Effect'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'fill' && (
        <View>
          <View style={emSt.pillRow}>
            {(['solid', 'linear', 'radial'] as FillType[]).map(ft => (
              <TouchableOpacity
                key={ft}
                style={[emSt.pill, fill.type === ft && { borderColor: accent, backgroundColor: accent + '16' }]}
                onPress={() => onUpdate({ fill: { ...fill, type: ft, color2: fill.color2 ?? (ft === 'radial' ? fill.color + '00' : '#F472B6') } })}
              >
                <Text style={[emSt.pillText, fill.type === ft && { color: accent }]}>
                  {ft === 'solid' ? 'Solid' : ft === 'linear' ? 'Gradient' : 'Glow'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={emSt.label}>{fill.type === 'solid' ? 'Color' : 'Start color'}</Text>
          <View style={emSt.swatchRow}>
            {FILL_SWATCHES.map(c => (
              <TouchableOpacity
                key={c}
                style={[emSt.swatch, { backgroundColor: c }, c === '#FFFFFF' && emSt.swatchWhite, fill.color === c && [emSt.swatchActive, { borderColor: accent }]]}
                onPress={() => onUpdate({ fill: { ...fill, color: c } })}
              />
            ))}
            <TouchableOpacity style={[emSt.swatch, emSt.swatchCustom]} onPress={() => onPickColor('color')}>
              <Ionicons name="color-palette-outline" size={13} color="#6B6560" />
            </TouchableOpacity>
          </View>

          {fill.type !== 'solid' && (
            <>
              <Text style={emSt.label}>{fill.type === 'radial' ? 'Fade to' : 'End color'}</Text>
              <View style={emSt.swatchRow}>
                {fill.type === 'radial' && (
                  <TouchableOpacity
                    style={[emSt.swatch, emSt.swatchWhite, (fill.color2 ?? '').endsWith('00') && [emSt.swatchActive, { borderColor: accent }]]}
                    onPress={() => onUpdate({ fill: { ...fill, color2: fill.color + '00' } })}
                  >
                    <View style={emSt.slash} />
                  </TouchableOpacity>
                )}
                {FILL_SWATCHES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[emSt.swatch, { backgroundColor: c }, c === '#FFFFFF' && emSt.swatchWhite, fill.color2 === c && [emSt.swatchActive, { borderColor: accent }]]}
                    onPress={() => onUpdate({ fill: { ...fill, color2: c } })}
                  />
                ))}
                <TouchableOpacity style={[emSt.swatch, emSt.swatchCustom]} onPress={() => onPickColor('color2')}>
                  <Ionicons name="color-palette-outline" size={13} color="#6B6560" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {fill.type === 'linear' && (
            <MiniSlider
              label="Angle" value={fill.angle ?? 90} min={0} max={360} accent={accent}
              onChange={v => onUpdate({ fill: { ...fill, angle: Math.round(v) } })}
              format={v => `${Math.round(v)}°`}
            />
          )}
        </View>
      )}

      {tab === 'adjust' && (
        <View>
          <MiniSlider
            label="Size" value={element.size} min={0.01} max={1.4} accent={accent}
            onChange={v => onUpdate({ size: v })}
            format={v => `${Math.round(v * 100)}%`}
          />
          <MiniSlider
            label="Rotate" value={element.rotation} min={0} max={360} accent={accent}
            onChange={v => onUpdate({ rotation: Math.round(v) })}
            format={v => `${Math.round(v)}°`}
          />
          <MiniSlider
            label="Opacity" value={element.opacity} min={0.05} max={1} accent={accent}
            onChange={v => onUpdate({ opacity: Math.round(v * 100) / 100 })}
            format={v => `${Math.round(v * 100)}%`}
          />
        </View>
      )}

      {tab === 'effect' && (
        <View>
          <View style={emSt.pillRowWrap}>
            {ANIMATIONS.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[emSt.pill, element.anim === a.id && { borderColor: accent, backgroundColor: accent + '16' }]}
                onPress={() => onUpdate({ anim: a.id })}
              >
                <Text style={[emSt.pillText, element.anim === a.id && { color: accent }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {element.anim !== 'none' && (
            <>
              <Text style={emSt.label}>Speed</Text>
              <View style={emSt.pillRow}>
                {ANIM_SPEEDS.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[emSt.pill, element.animSpeed === s.id && { borderColor: accent, backgroundColor: accent + '16' }]}
                    onPress={() => onUpdate({ animSpeed: s.id })}
                  >
                    <Text style={[emSt.pillText, element.animSpeed === s.id && { color: accent }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const hs = { top: 6, bottom: 6, left: 6, right: 6 };

const emSt = StyleSheet.create({
  box: {
    position: 'absolute', backgroundColor: '#FDFAF5', borderRadius: 16, padding: 14, zIndex: 60,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 },
  headerPreview: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#3A3430', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  actBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8', marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#A09890' },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#A09890', marginTop: 10, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6 },
  pillRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: '#E0DAD0' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#6B6560' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  swatchWhite: { borderWidth: 1, borderColor: '#DDD8D0' },
  swatchActive: { borderWidth: 2.5 },
  swatchCustom: { backgroundColor: '#F5F1EB', alignItems: 'center', justifyContent: 'center' },
  slash: { position: 'absolute', width: 24, height: 1.5, backgroundColor: '#C0B8B0', transform: [{ rotate: '45deg' }] },
});

// ─── Asset library panel content ─────────────────────────────────────────────

export function AssetLibrary({ accent, onAdd }: {
  accent: string;
  onAdd: (def: AssetDef) => void;
}) {
  return (
    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
      {ASSET_SECTIONS.map(section => (
        <View key={section.id}>
          <Text style={alSt.sectionLabel}>{section.label}</Text>
          <View style={alSt.grid}>
            {section.assets.map(a => (
              <TouchableOpacity key={a.kind} style={alSt.assetBtn} onPress={() => onAdd(a)} activeOpacity={0.7}>
                <View style={alSt.assetPreview}>
                  <ElementPreview kind={a.kind} fill={a.fill} size={40} />
                </View>
                <Text style={alSt.assetLabel} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      <Text style={alSt.hint}>Tap to add · then drag it into place on the board</Text>
    </ScrollView>
  );
}

const alSt = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: '#A09890', marginTop: 12, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assetBtn: { width: 62, alignItems: 'center', gap: 3 },
  assetPreview: { width: 54, height: 54, borderRadius: 12, backgroundColor: '#4A4440', alignItems: 'center', justifyContent: 'center' },
  assetLabel: { fontSize: 10, fontWeight: '600', color: '#8A8078' },
  hint: { fontSize: 11, color: '#C4BDB7', textAlign: 'center', paddingVertical: 14 },
});

// ─── Selection ring ───────────────────────────────────────────────────────────

export function SelectionRing({ cx, cy, half, accent }: { cx: number; cy: number; half: number; accent: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - half, top: cy - half, width: half * 2, height: half * 2,
        borderWidth: 1.5, borderColor: accent, borderRadius: 10, borderStyle: 'dashed',
      }}
    />
  );
}
