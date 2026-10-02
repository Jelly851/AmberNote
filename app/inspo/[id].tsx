import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as db from '@/lib/db';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  BACKDROP_CATEGORIES,
  BACKDROP_LIST,
  BACKDROP_TINTS,
  CHIP_COLORS,
  DECOR_SYMBOLS,
  FONT_VARIANTS,
  TEXT_COLORS,
  TEXTURE_INTENSITIES,
  CHIP_FONT_SIZE_DEFAULT,
  CHIP_FONT_SIZE_MAX,
  CHIP_FONT_SIZE_MIN,
  computeDirectionalGradient,
  getBackdrop,
  getFontStyle,
  type BoardBackground,
  type ChipConnection,
  type ChipStyle,
  type FontVariant,
  type GradientConfig,
  type GraphicsQuality,
  type InspoChip,
} from '@/lib/inspo';
import BoardBackdrop from '@/components/BoardBackdrop';
import CustomBackdrop, { elementBBox, ElementPreview } from '@/components/CustomBackdrop';
import { AssetLibrary, ElementMenu, MiniSlider, SelectionRing } from '@/components/BackgroundEditor';
import {
  AMBIENT_FX,
  PAPER_TEXTURES,
  themeForBase,
  type AmbientFx,
  type AssetDef,
  type BgElement,
  type BoardBackgroundData,
  type PaperTexture,
} from '@/lib/bgElements';
import type { Recording } from '@/lib/types';
import { useInspoBoardStore } from '@/store/inspoBoardStore';
import { useSongsStore } from '@/store/songsStore';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useSwipeDownDismiss } from '@/hooks/useSwipeDownDismiss';
import { SheetGrabHandle } from '@/components/SheetGrabHandle';
import { useThemeStore } from '@/store/themeStore';
import { RECORDING_OPTIONS } from '@/lib/recording';

// ─── Google Fonts (web only) ──────────────────────────────────────────────────

function useGoogleFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'gf-inspo-fonts';
    if ((globalThis as any).document?.getElementById(id)) return;
    const link = (globalThis as any).document?.createElement('link');
    if (!link) return;
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono&family=Satisfy&family=Permanent+Marker&family=Special+Elite&family=Caveat:wght@600&family=Abril+Fatface&family=Oswald:wght@600&family=Great+Vibes&family=Comfortaa:wght@600&family=Lora&family=Raleway:wght@500&family=Pacifico&family=Lobster&family=Merriweather&family=Amatic+SC:wght@700&family=Cinzel:wght@600&family=Shadows+Into+Light&family=Krona+One&family=Cormorant+Garamond:ital,wght@1,400&family=Josefin+Sans:wght@600&family=Cookie&family=Righteous&display=swap';
    (globalThis as any).document.head.appendChild(link);
  }, []);
}

// ─── Canvas layout constants ──────────────────────────────────────────────────

const HEADER_H  = 56;
const INPUT_H   = Platform.OS === 'ios' ? 132 : 114;

// ─── Floating chip with drag + long-press ────────────────────────────────────

const DEFAULT_FONT_SIZE = CHIP_FONT_SIZE_DEFAULT;
const MIN_FONT_SIZE     = CHIP_FONT_SIZE_MIN;
const MAX_FONT_SIZE     = CHIP_FONT_SIZE_MAX;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type FloatingChipProps = {
  chip: InspoChip;
  canvasW: number;
  canvasH: number;
  onLongPress: (chip: InspoChip, screenX: number, screenY: number) => void;
  onCancelMenu?: () => void;
  onMoved: (chipId: string, x: number, y: number) => void;
  onResized: (chipId: string, fontSize: number) => void;
  onRotated: (chipId: string, rotation: number) => void;
  onDragging: (chipId: string, x: number, y: number) => void;
  onChipLayout: (chipId: string, width: number) => void;
  isSelected?: boolean;
  onConnectionStart?: (chipId: string, startX: number, startY: number) => void;
  onConnectionMove?: (dx: number, dy: number) => void;
  onConnectionEnd?: (dx: number, dy: number) => void;
};

function FloatingChip({ chip, canvasW, canvasH, onLongPress, onCancelMenu, onMoved, onResized, onRotated, onDragging, onChipLayout, isSelected, onConnectionStart, onConnectionMove, onConnectionEnd }: FloatingChipProps) {
  const isWeb = Platform.OS === 'web';

  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const dragX  = useRef(new Animated.Value(0)).current;
  const dragY  = useRef(new Animated.Value(0)).current;

  const chipRef    = useRef(chip);       chipRef.current    = chip;
  const cbLong     = useRef(onLongPress); cbLong.current    = onLongPress;
  const cbMoved    = useRef(onMoved);    cbMoved.current    = onMoved;
  const cbDragging = useRef(onDragging); cbDragging.current = onDragging;
  const lastDragEmit = useRef(0);
  const canvasRef  = useRef({ w: canvasW, h: canvasH });
  canvasRef.current = { w: canvasW, h: canvasH };

  const driftLoops     = useRef<Animated.CompositeAnimation[]>([]);
  const isDragging     = useRef(false);
  const isResizing     = useRef(false);
  const isConnectMode  = useRef(false);
  const isConnecting   = useRef(false);
  const selfWidth      = useRef(60);
  const lpTimer        = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cbConnStart   = useRef(onConnectionStart ?? (() => {}));
  cbConnStart.current = onConnectionStart ?? (() => {});
  const cbConnMove    = useRef(onConnectionMove  ?? (() => {}));
  cbConnMove.current  = onConnectionMove  ?? (() => {});
  const cbConnEnd     = useRef(onConnectionEnd   ?? (() => {}));
  cbConnEnd.current   = onConnectionEnd   ?? (() => {});
  const cbCancelMenu  = useRef(onCancelMenu ?? (() => {}));
  cbCancelMenu.current = onCancelMenu ?? (() => {});
  const menuFiredRef  = useRef(false);

  // Audio playback (audio chips only)
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const cbTap = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  async function toggleAudio() {
    const uri = chipRef.current.audioUri;
    if (!uri) return;
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(st => {
          if (st.isLoaded && st.didJustFinish) { setIsPlaying(false); soundRef.current = null; }
        });
      }
      await soundRef.current!.playAsync();
      setIsPlaying(true);
    }
  }

  cbTap.current = chipRef.current.style === 'audio' ? toggleAudio : null;

  const [displayFontSize, setDisplayFontSize] = useState(chip.fontSize ?? DEFAULT_FONT_SIZE);
  const liveFontSize  = useRef(chip.fontSize ?? DEFAULT_FONT_SIZE);
  const startFontSize = useRef(chip.fontSize ?? DEFAULT_FONT_SIZE);
  const cbResized     = useRef(onResized); cbResized.current = onResized;
  useEffect(() => {
    liveFontSize.current = chip.fontSize ?? DEFAULT_FONT_SIZE;
    setDisplayFontSize(chip.fontSize ?? DEFAULT_FONT_SIZE);
  }, [chip.fontSize]);

  const [displayRotation, setDisplayRotation] = useState(chip.rotation ?? 0);
  const liveRotation  = useRef(chip.rotation ?? 0);
  const startRotation = useRef(chip.rotation ?? 0);
  const cbRotated     = useRef(onRotated); cbRotated.current = onRotated;
  useEffect(() => {
    liveRotation.current = chip.rotation ?? 0;
    setDisplayRotation(chip.rotation ?? 0);
  }, [chip.rotation]);

  const isResizeDragging = useRef(false);
  // 'none' = not yet committed, 'resize' or 'rotate' = locked for this gesture
  const gestureMode = useRef<'none' | 'resize' | 'rotate'>('none');
  const didHapticSnap = useRef(false);

  const SNAP_STEP = Math.PI / 2; // snap every 90°
  const SNAP_THRESHOLD = 0.13;   // ~7.5°

  function nearestSnap(angle: number) {
    return Math.round(angle / SNAP_STEP) * SNAP_STEP;
  }

  const resizePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      isResizing.current = true;
      isResizeDragging.current = false;
      gestureMode.current = 'none';
      didHapticSnap.current = false;
      startFontSize.current = liveFontSize.current;
      startRotation.current = liveRotation.current;
    },
    onPanResponderMove: (_, gs) => {
      if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) {
        isResizeDragging.current = true;

        // Lock mode once on first significant motion — prevents per-frame flickering
        if (gestureMode.current === 'none') {
          const r = Math.abs(gs.dx + gs.dy);
          const t = Math.abs(gs.dy - gs.dx);
          gestureMode.current = r >= t ? 'resize' : 'rotate';
        }

        if (gestureMode.current === 'resize') {
          const radial = gs.dx + gs.dy;
          const nextSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, startFontSize.current + radial / 4));
          liveFontSize.current = nextSize;
          setDisplayFontSize(nextSize); // float — smoother than rounding every frame
        } else {
          const tangential = gs.dy - gs.dx;
          let nextRot = startRotation.current + tangential / 120;

          // Snap to 0° / 90° / 180° / 270° increments
          const snapped = nearestSnap(nextRot);
          if (Math.abs(nextRot - snapped) < SNAP_THRESHOLD) {
            if (!didHapticSnap.current) {
              didHapticSnap.current = true;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            nextRot = snapped;
          } else {
            didHapticSnap.current = false;
          }

          liveRotation.current = nextRot;
          setDisplayRotation(nextRot);
        }
      }
    },
    onPanResponderRelease: () => {
      isResizing.current = false;
      if (isResizeDragging.current) {
        cbResized.current(chipRef.current.id, Math.round(liveFontSize.current));
        cbRotated.current(chipRef.current.id, liveRotation.current);
      } else {
        cbLong.current(chipRef.current, 0, 0);
      }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      isResizing.current = false;
      setDisplayFontSize(liveFontSize.current);
      setDisplayRotation(liveRotation.current);
    },
  })).current;

  function startDrift() {
    const amp = 4 + Math.random() * 8;
    const dur = 2800 + Math.random() * 2800;
    const lX = Animated.loop(Animated.sequence([
      Animated.timing(driftX, { toValue:  amp,       duration: dur,        useNativeDriver: false }),
      Animated.timing(driftX, { toValue: -amp,       duration: dur,        useNativeDriver: false }),
    ]));
    const lY = Animated.loop(Animated.sequence([
      Animated.timing(driftY, { toValue:  amp * 0.65, duration: dur * 1.3, useNativeDriver: false }),
      Animated.timing(driftY, { toValue: -amp * 0.65, duration: dur * 1.3, useNativeDriver: false }),
    ]));
    driftLoops.current = [lX, lY];
    lX.start(); lY.start();
  }

  function stopDrift() {
    driftLoops.current.forEach(l => l.stop());
    driftX.setValue(0);
    driftY.setValue(0);
  }

  useEffect(() => { startDrift(); return () => stopDrift(); }, []);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !isResizing.current,
    onMoveShouldSetPanResponder: (_, gs) =>
      !isResizing.current && (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4),

    onPanResponderGrant: (e) => {
      if (isResizing.current) return;
      isDragging.current    = false;
      isConnectMode.current = false;
      isConnecting.current  = false;
      dragX.setValue(0);
      dragY.setValue(0);
      const grantX = e.nativeEvent.pageX;
      const grantY = e.nativeEvent.pageY;
      lpTimer.current = setTimeout(() => {
        if (!isDragging.current && !isConnecting.current) {
          menuFiredRef.current = true;
          cbLong.current(chipRef.current, grantX, grantY);
        }
      }, 480);
    },

    onPanResponderMove: (_, gs) => {
      // Menu is open but user started dragging → dismiss menu, start connection draw
      if (menuFiredRef.current && (Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3)) {
        menuFiredRef.current = false;
        cbCancelMenu.current();
        isConnecting.current = true;
        stopDrift();
        const { w, h } = canvasRef.current;
        const c = chipRef.current;
        cbConnStart.current(c.id, c.x * w + selfWidth.current / 2, c.y * h);
        cbConnMove.current(gs.dx, gs.dy);
        return;
      }
      // Long-press fired + movement → enter connection draw
      if (isConnectMode.current && (Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3)) {
        isConnectMode.current = false;
        isConnecting.current  = true;
        stopDrift();
        const { w, h } = canvasRef.current;
        const c = chipRef.current;
        cbConnStart.current(c.id, c.x * w + selfWidth.current / 2, c.y * h);
        cbConnMove.current(gs.dx, gs.dy);
        return;
      }
      if (isConnecting.current) {
        cbConnMove.current(gs.dx, gs.dy);
        return;
      }
      // Normal chip drag
      if (!isDragging.current && (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6)) {
        isDragging.current = true;
        clearTimeout(lpTimer.current);
        stopDrift();
      }
      if (isDragging.current) {
        dragX.setValue(gs.dx);
        dragY.setValue(gs.dy);
        const now = Date.now();
        if (now - lastDragEmit.current > 16) {
          lastDragEmit.current = now;
          const { w, h } = canvasRef.current;
          const c = chipRef.current;
          const nx = Math.max(0.01, Math.min(0.92, (c.x * w + gs.dx) / w));
          const ny = Math.max(0.01, Math.min(0.88, (c.y * h + gs.dy) / h));
          cbDragging.current(c.id, nx, ny);
        }
      }
    },

    onPanResponderRelease: (_, gs) => {
      clearTimeout(lpTimer.current);
      menuFiredRef.current = false;
      if (isConnecting.current) {
        cbConnEnd.current(gs.dx, gs.dy);
        isConnecting.current  = false;
        isConnectMode.current = false;
        startDrift();
      } else if (isDragging.current) {
        const { w, h } = canvasRef.current;
        const c = chipRef.current;
        const nx = Math.max(0.01, Math.min(0.92, (c.x * w + gs.dx) / w));
        const ny = Math.max(0.01, Math.min(0.88, (c.y * h + gs.dy) / h));
        dragX.setValue(0);
        dragY.setValue(0);
        cbMoved.current(c.id, nx, ny);
        startDrift();
      } else {
        // Short tap (no drag, no long-press)
        cbTap.current?.();
      }
      isDragging.current = false;
    },

    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      clearTimeout(lpTimer.current);
      menuFiredRef.current  = false;
      if (isConnecting.current) cbConnEnd.current(0, 0);
      isConnecting.current  = false;
      isConnectMode.current = false;
      dragX.setValue(0);
      dragY.setValue(0);
      isDragging.current = false;
      startDrift();
    },
  })).current;

  const cv         = chipVisuals(chip, displayFontSize);
  const fontStyle  = getFontStyle(chip.fontVariant ?? 'sans', isWeb);

  return (
    <Animated.View
      style={[
        cvStyles.chip,
        cv.container,
        {
          left: chip.x * canvasW,
          top:  chip.y * canvasH,
          transform: [
            { translateX: Animated.add(driftX, dragX) },
            { translateY: Animated.add(driftY, dragY) },
            { rotate: `${displayRotation}rad` },
          ],
          ...(isWeb ? ({
            userSelect: 'none',
            WebkitUserSelect: 'none',
            cursor: 'grab',
          } as any) : {}),
          ...(isSelected ? ({
            shadowColor: chip.color,
            shadowOpacity: 0.9,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          } as any) : {}),
        },
      ]}
      {...(isWeb ? { onContextMenu: (e: any) => { e.preventDefault(); cbLong.current(chipRef.current, e?.clientX ?? 0, e?.clientY ?? 0); } } as any : {})}
      {...panResponder.panHandlers}
      onLayout={(e) => { selfWidth.current = e.nativeEvent.layout.width; onChipLayout(chip.id, e.nativeEvent.layout.width); }}
    >
      {chip.style === 'image' && chip.imageUri ? (
        <Image source={{ uri: chip.imageUri }} style={cvStyles.imageChip} resizeMode="cover" />
      ) : chip.style === 'decor' ? (
        <Text style={[cv.text, { color: chip.textColor }]} selectable={false}>
          {chip.text}
        </Text>
      ) : chip.style === 'audio' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={(displayFontSize ?? 14) + 10}
            color={chip.textColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[cv.text, { color: chip.textColor }]} numberOfLines={1} selectable={false}>
              {chip.text || 'Recording'}
            </Text>
            {chip.audioDuration != null && (
              <Text style={{ fontSize: 10, color: chip.textColor + '99' }}>
                {formatDuration(chip.audioDuration)}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <Text style={[cv.text, { color: chip.textColor }, fontStyle]} selectable={false}>
          {chip.text}
        </Text>
      )}
      <View style={cvStyles.resizeHandle} {...resizePan.panHandlers}>
        <View style={[cvStyles.resizeDot, { backgroundColor: chip.color === 'none' ? '#B0A89E' : chip.color }]} />
      </View>
    </Animated.View>
  );
}

const cvStyles = StyleSheet.create({
  chip: { position: 'absolute' },
  resizeHandle: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.7,
  },
  imageChip: {
    width: 140,
    height: 100,
    borderRadius: 10,
  },
});

function chipVisuals(chip: InspoChip, fontSize: number) {
  // 'none' chips opt out of gradient — render with a neutral tone
  const c = chip.color === 'none' ? '#B0A89E' : chip.color;
  switch (chip.style) {
    case 'lyric':
      return {
        container: {
          backgroundColor: c + '14',
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftColor: c + 'CC',
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingLeft: 10,
        },
        text: { fontSize, fontStyle: 'italic' as const },
      };
    case 'image':
      return {
        container: { borderRadius: 10, overflow: 'hidden' as const, padding: 0 },
        text: { fontSize: 0 },
      };
    case 'decor':
      return {
        container: { padding: 4 },
        text: { fontSize, textAlign: 'center' as const },
      };
    case 'audio':
      return {
        container: {
          backgroundColor: c + '18',
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: c + '88',
          paddingHorizontal: 12,
          paddingVertical: 8,
          minWidth: 130,
        },
        text: { fontSize, fontWeight: '500' as const },
      };
    default: // word
      return {
        container: {
          backgroundColor: c + '22',
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: c + '99',
          paddingHorizontal: 14,
          paddingVertical: 7,
        },
        text: { fontSize },
      };
  }
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function cp01(v: number) { return Math.max(0, Math.min(1, v)); }

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${f(5).toString(16).padStart(2,'0')}${f(3).toString(16).padStart(2,'0')}${f(1).toString(16).padStart(2,'0')}`;
}

function hexToHsv(hex: string): [number, number, number] {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return [30, 0.9, 0.9];
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  const v = max, s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function ColorPickerModal({ visible, initialColor, onSelect, onClose }: {
  visible: boolean;
  initialColor: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}) {
  const safe = !initialColor || initialColor === 'none' ? '#F59E0B' : initialColor;
  const [[h, s, v], setHsv] = useState<[number, number, number]>(() => hexToHsv(safe));
  const [hexText, setHexText] = useState(safe.toUpperCase());
  const [hexFocused, setHexFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      const c = !initialColor || initialColor === 'none' ? '#F59E0B' : initialColor;
      setHsv(hexToHsv(c));
      setHexText(c.toUpperCase());
    }
  }, [visible]);

  const svW = useRef(260); const svH = useRef(180); const hueW = useRef(260);
  const svStart = useRef({ x: 0, y: 0 });
  const hueStart = useRef(0);

  const currentColor = hsvToHex(h, s, v);
  const hueColor     = hsvToHex(h, 1, 1);

  useEffect(() => {
    if (!hexFocused) setHexText(currentColor.toUpperCase());
  }, [currentColor, hexFocused]);

  const svPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      svStart.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setHsv(prev => [prev[0], cp01(e.nativeEvent.locationX / svW.current), cp01(1 - e.nativeEvent.locationY / svH.current)]);
    },
    onPanResponderMove: (_, gs) => {
      const nx = cp01((svStart.current.x + gs.dx) / svW.current);
      const ny = cp01((svStart.current.y + gs.dy) / svH.current);
      setHsv(prev => [prev[0], nx, 1 - ny]);
    },
  })).current;

  const huePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      hueStart.current = e.nativeEvent.locationX;
      setHsv(prev => [cp01(e.nativeEvent.locationX / hueW.current) * 360, prev[1], prev[2]]);
    },
    onPanResponderMove: (_, gs) => {
      setHsv(prev => [cp01((hueStart.current + gs.dx) / hueW.current) * 360, prev[1], prev[2]]);
    },
  })).current;

  const textColor = v > 0.55 && s < 0.5 ? '#333' : '#FFF';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={cpSt.overlay} onPress={onClose}>
        <Pressable style={cpSt.box} onPress={() => {}}>
          {/* SV square */}
          <View
            style={cpSt.svSquare}
            onLayout={e => { svW.current = e.nativeEvent.layout.width; svH.current = e.nativeEvent.layout.height; }}
            {...svPan.panHandlers}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: hueColor }]} />
            <LinearGradient colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']}           start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={[cpSt.svCursor, { left: s * svW.current - 8, top: (1 - v) * svH.current - 8, borderColor: v > 0.5 ? '#000' : '#fff' }]} />
          </View>

          {/* Hue strip */}
          <View
            style={cpSt.hueStrip}
            onLayout={e => { hueW.current = e.nativeEvent.layout.width; }}
            {...huePan.panHandlers}
          >
            <LinearGradient
              colors={['#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FF0000']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[cpSt.hueCursor, { left: (h / 360) * hueW.current - 10 }]} />
          </View>

          {/* Preview + hex + pick */}
          <View style={cpSt.bottomRow}>
            <View style={[cpSt.preview, { backgroundColor: currentColor }]} />
            <TextInput
              style={cpSt.hexInput}
              value={hexText}
              onFocus={() => setHexFocused(true)}
              onBlur={() => setHexFocused(false)}
              onChangeText={text => {
                setHexText(text);
                const c = text.startsWith('#') ? text : '#' + text;
                if (/^#[0-9A-Fa-f]{6}$/.test(c)) setHsv(hexToHsv(c.toLowerCase()));
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#F59E0B"
              placeholderTextColor="#C4BDB7"
            />
            <TouchableOpacity style={[cpSt.pickBtn, { backgroundColor: currentColor }]} onPress={() => onSelect(currentColor)}>
              <Text style={{ color: textColor, fontWeight: '700', fontSize: 14 }}>Pick</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cpSt = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  box:       { width: 320, backgroundColor: '#FDFAF5', borderRadius: 20, padding: 18, gap: 12, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 8 }, elevation: 14 },
  svSquare:  { width: '100%', height: 180, borderRadius: 12, overflow: 'hidden' },
  svCursor:  { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  hueStrip:  { width: '100%', height: 22, borderRadius: 11, overflow: 'hidden' },
  hueCursor: { position: 'absolute', top: 1, width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview:   { width: 36, height: 36, borderRadius: 18 },
  hexInput:  { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#E8E2D8', paddingHorizontal: 10, fontSize: 14, backgroundColor: '#FAF8F4' },
  pickBtn:   { height: 36, paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});

// ─── Chip context menu ────────────────────────────────────────────────────────

// Horizontal ScrollView that also responds to mouse click-drag on web
function DragScrollView({ children, style, contentContainerStyle }: {
  children: React.ReactNode;
  style?: any;
  contentContainerStyle?: any;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);

  const handlers = Platform.OS === 'web' ? {
    onMouseDown: (e: any) => {
      const node = (scrollRef.current as any)?.getScrollableNode?.();
      if (!node) return;
      dragging.current = true;
      startX.current = e.clientX;
      startScroll.current = node.scrollLeft;
      e.preventDefault();

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        node.scrollLeft = startScroll.current + (startX.current - ev.clientX);
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
  } : {};

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={contentContainerStyle}
      // @ts-ignore
      {...handlers}
    >
      {children}
    </ScrollView>
  );
}

const MENU_W = 280;
const MENU_MAX_H = 320;

function ChipMenu({
  chip, anchorX, anchorY, onClose, onDelete, onUpdate,
}: {
  chip: InspoChip;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Pick<InspoChip, 'text' | 'style' | 'color' | 'textColor' | 'fontVariant'>>) => void;
}) {
  const isWeb = Platform.OS === 'web';
  const { width: winW, height: winH } = useWindowDimensions();
  const [editText, setEditText] = useState(chip.text);
  const [activeTab, setActiveTab] = useState<'color' | 'font' | 'style'>('color');
  const [colorTarget, setColorTarget] = useState<'bg' | 'text'>('bg');
  const [colorPickerTarget, setColorPickerTarget] = useState<'gradient' | 'text' | null>(null);

  useEffect(() => { setEditText(chip.text); setActiveTab('color'); }, [chip.id]);

  useEscapeKey(onClose);

  // Pin menu inside screen bounds
  const left = Math.min(anchorX, winW - MENU_W - 12);
  const top  = anchorY + 12 + MENU_MAX_H > winH ? anchorY - MENU_MAX_H - 12 : anchorY + 12;

  const accent = chip.color === 'none' ? '#B0A89E' : chip.color;

  const TABS: { id: 'color' | 'font' | 'style'; icon: string; label: string }[] = [
    { id: 'color', icon: 'color-palette-outline', label: 'Color' },
    { id: 'font',  icon: 'text-outline',          label: 'Font'  },
    { id: 'style', icon: 'shapes-outline',         label: 'Style' },
  ];

  return (
    <>
      {/* Invisible full-screen dismiss layer */}
      <Pressable style={[StyleSheet.absoluteFillObject, { zIndex: 99 }]} onPress={onClose} />
      <View style={[menuSt.box, { position: 'absolute', left, top, zIndex: 100 }]}>

          {/* Text / symbol edit */}
          {chip.style === 'decor' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
              {DECOR_SYMBOLS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[menuSt.symbolBtn, chip.text === s && { borderColor: chip.textColor, backgroundColor: chip.textColor + '18' }]}
                  onPress={() => onUpdate({ text: s })}
                  activeOpacity={0.6}
                >
                  <Text style={[menuSt.symbolText, { color: chip.textColor }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <TextInput
              style={menuSt.chipNameInput}
              value={editText}
              onChangeText={t => { setEditText(t); if (t.trim()) onUpdate({ text: t.trim() }); }}
              onSubmitEditing={() => { if (!editText.trim()) setEditText(chip.text); }}
              onBlur={() => { if (!editText.trim()) setEditText(chip.text); }}
              returnKeyType="done"
              selectTextOnFocus
              autoCorrect={false}
            />
          )}

          {/* Tab strip */}
          <View style={menuSt.tabStrip}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity key={tab.id} style={[menuSt.tab, active && { borderBottomColor: accent }]} onPress={() => setActiveTab(tab.id)}>
                  <Ionicons name={tab.icon as any} size={16} color={active ? accent : '#A09890'} />
                  <Text style={[menuSt.tabLabel, active && { color: accent }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab content */}
          {activeTab === 'color' && (
            <View style={menuSt.tabContent}>
              {/* BG / Text micro-toggle */}
              <View style={menuSt.colorToggle}>
                {(['bg', 'text'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[menuSt.colorToggleBtn, colorTarget === t && { backgroundColor: accent + '22', borderColor: accent }]}
                    onPress={() => setColorTarget(t)}
                  >
                    <Text style={[menuSt.colorToggleText, colorTarget === t && { color: accent }]}>{t === 'bg' ? 'Fill' : 'Text'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Dots */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={menuSt.dotRow}>
                {colorTarget === 'bg' && (
                  <TouchableOpacity
                    style={[menuSt.dot, menuSt.dotNone, chip.color === 'none' && menuSt.dotActive]}
                    onPress={() => onUpdate({ color: 'none' })}
                  >
                    <View style={menuSt.dotNoneSlash} />
                  </TouchableOpacity>
                )}
                {(colorTarget === 'bg' ? CHIP_COLORS : TEXT_COLORS).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[menuSt.dot, { backgroundColor: c }, c === '#FFFFFF' && menuSt.dotWhite,
                      (colorTarget === 'bg' ? chip.color : chip.textColor) === c && menuSt.dotActive]}
                    onPress={() => colorTarget === 'bg' ? onUpdate({ color: c }) : onUpdate({ textColor: c })}
                  />
                ))}
                <TouchableOpacity style={menuSt.moreColorBtn} onPress={() => setColorPickerTarget(colorTarget === 'bg' ? 'gradient' : 'text')}>
                  <Ionicons name="color-palette-outline" size={20} color="#A09890" />
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {activeTab === 'font' && (
            <DragScrollView style={menuSt.tabContent} contentContainerStyle={menuSt.fontScroll}>
              {FONT_VARIANTS.map(f => {
                const fs = getFontStyle(f.id, isWeb);
                const active = chip.fontVariant === f.id;
                return (
                  <TouchableOpacity key={f.id} style={[menuSt.fontChip, active && { borderColor: accent, backgroundColor: accent + '18' }]} onPress={() => onUpdate({ fontVariant: f.id })}>
                    <Text style={[menuSt.fontChipText, fs, active && { color: accent }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </DragScrollView>
          )}

          {activeTab === 'style' && (
            <View style={[menuSt.tabContent, menuSt.styleRow]}>
              {([['word', 'Theme'], ['lyric', 'Lyric']] as [ChipStyle, string][]).map(([s, label]) => (
                <TouchableOpacity key={s} style={[menuSt.styleBtn, chip.style === s && { borderColor: accent, backgroundColor: accent + '18' }]} onPress={() => onUpdate({ style: s })}>
                  <Text style={[menuSt.styleBtnText, chip.style === s && { color: accent }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={menuSt.divider} />
          <TouchableOpacity style={menuSt.deleteRow} onPress={onDelete}>
            <Ionicons name="trash-outline" size={15} color="#EF4444" />
            <Text style={menuSt.deleteText}>Delete chip</Text>
          </TouchableOpacity>
      </View>
      <ColorPickerModal
        visible={!!colorPickerTarget}
        initialColor={colorPickerTarget === 'gradient' ? chip.color : chip.textColor}
        onSelect={hex => {
          if (colorPickerTarget === 'gradient') onUpdate({ color: hex });
          else onUpdate({ textColor: hex });
          setColorPickerTarget(null);
        }}
        onClose={() => setColorPickerTarget(null)}
      />
    </>
  );
}

const menuSt = StyleSheet.create({
  box: { width: MENU_W, backgroundColor: '#FDFAF5', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 16 },
  chipNameInput: { fontSize: 15, fontWeight: '700', color: '#1C1A17', marginBottom: 12, borderBottomWidth: 1.5, borderBottomColor: '#E0DAD0', paddingBottom: 6, paddingHorizontal: 2 },
  // tab strip
  tabStrip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EDE8E2', marginBottom: 12 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 8, gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, color: '#A09890' },
  tabContent: { marginBottom: 4 },
  // color tab
  colorToggle: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  colorToggleBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, borderColor: '#E0DAD0', alignItems: 'center' },
  colorToggleText: { fontSize: 12, fontWeight: '600', color: '#8A8480' },
  dotRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 2 },
  dot: { width: 24, height: 24, borderRadius: 12 },
  dotWhite: { borderWidth: 1, borderColor: '#DDD8D0' },
  dotActive: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  dotNone: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#C0B8B0', overflow: 'hidden', justifyContent: 'center' as const, alignItems: 'center' as const },
  dotNoneSlash: { position: 'absolute' as const, width: 30, height: 1.5, backgroundColor: '#C0B8B0', transform: [{ rotate: '45deg' }] },
  moreColorBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  // font tab
  fontScroll: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 },
  fontChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0DAD0' },
  fontChipText: { fontSize: 14, color: '#555' },
  // style tab
  styleRow: { flexDirection: 'row', gap: 8 },
  styleBtn: { flex: 1, borderRadius: 8, borderWidth: 1.5, borderColor: '#E0DAD0', paddingVertical: 8, alignItems: 'center' },
  styleBtnText: { fontSize: 13, fontWeight: '500', color: '#555' },
  // footer
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E8E2D8', marginVertical: 10 },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteText: { fontSize: 14, color: '#EF4444' },
  // decor
  symbolBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: '#E0DAD0', backgroundColor: '#F5F1EB' },
  symbolText: { fontSize: 20 },
});

// ─── Word Panel ───────────────────────────────────────────────────────────────

function InspoWordPanel({
  visible,
  accentColor,
  accentLight,
  onClose,
  onSelectWord,
}: {
  visible: boolean;
  accentColor: string;
  accentLight: string;
  onClose: () => void;
  onSelectWord: (word: string) => void;
}) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(300, width * 0.78);
  const slideAnim = useRef(new Animated.Value(panelWidth)).current;

  const [activeTab, setActiveTab] = useState<'rhymes' | 'words'>('rhymes');
  const [rhymeQuery, setRhymeQuery]     = useState('');
  const [rhymes, setRhymes]             = useState<{ label: string; words: string[] }[]>([]);
  const [rhymeSearched, setRhymeSearched] = useState('');
  const [rhymeLoading, setRhymeLoading] = useState(false);
  const [wordQuery, setWordQuery]       = useState('');
  const [synonyms, setSynonyms]         = useState<string[]>([]);
  const [meansLike, setMeansLike]       = useState<string[]>([]);
  const [definitions, setDefinitions]   = useState<{ pos: string; def: string }[]>([]);
  const [wordSearched, setWordSearched] = useState('');
  const [wordLoading, setWordLoading]   = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : panelWidth,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
    }).start();
    if (!visible) { setRhymeQuery(''); setWordQuery(''); }
  }, [visible]);

  useEscapeKey(onClose, visible);

  async function searchRhymes(override?: string) {
    const word = (override ?? rhymeQuery).trim().toLowerCase();
    if (!word || word === rhymeSearched) return;
    setRhymeLoading(true); setRhymeSearched(word);
    try {
      const [pRes, nRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=24`),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(word)}&max=12`),
      ]);
      const perfect: { word: string }[] = await pRes.json();
      const near:    { word: string }[] = await nRes.json();
      setRhymes([
        { label: 'Perfect', words: perfect.map(w => w.word) },
        { label: 'Near',    words: near.map(w => w.word) },
      ]);
    } catch {}
    setRhymeLoading(false);
  }

  async function searchWords(override?: string) {
    const q = (override ?? wordQuery).trim().toLowerCase();
    if (!q || q === wordSearched) return;
    setWordLoading(true); setWordSearched(q);
    try {
      const isSingle = !q.includes(' ');
      const fetches = [
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(q)}&max=20`),
        fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(q)}&max=20`),
        ...(isSingle ? [fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`)] : []),
      ];
      const results = await Promise.all(fetches);
      setSynonyms((await results[0].json() as { word: string }[]).map(w => w.word));
      setMeansLike((await results[1].json() as { word: string }[]).map(w => w.word));
      if (isSingle && results[2]) {
        try {
          const d = await results[2].json();
          setDefinitions(Array.isArray(d) && d[0]
            ? (d[0].meanings as any[]).slice(0, 2).flatMap((m: any) =>
                (m.definitions as any[]).slice(0, 2).map((df: any) => ({ pos: m.partOfSpeech, def: df.definition }))
              )
            : []);
        } catch { setDefinitions([]); }
      } else { setDefinitions([]); }
    } catch {}
    setWordLoading(false);
  }

  // Tap on a rhyme result: dive deeper from that word, AND add as chip
  function tapRhyme(word: string) {
    onSelectWord(word);
    setRhymeQuery(word);
    setRhymeSearched('');
    setTimeout(() => searchRhymes(word), 50);
  }

  // Tap on a words result: add as chip
  function tapWord(word: string) {
    onSelectWord(word);
  }

  const rhymesEmpty = !rhymeLoading && !!rhymeSearched && rhymes.every(g => g.words.length === 0);
  const wordsEmpty  = !wordLoading  && !!wordSearched  && synonyms.length === 0 && meansLike.length === 0 && definitions.length === 0;

  return (
    <>
      {visible && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      )}
      <Animated.View style={[wpSt.panel, { width: panelWidth, transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={wpSt.header}>
            <Text style={wpSt.title}>Words</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color="#6B6560" />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={wpSt.tabRow}>
            {(['rhymes', 'words'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[wpSt.tab, activeTab === tab && { backgroundColor: accentLight }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[wpSt.tabText, activeTab === tab && { color: accentColor }]}>
                  {tab === 'rhymes' ? 'Rhymes' : 'Explore'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'rhymes' ? (
            <>
              <View style={wpSt.searchRow}>
                <TextInput
                  style={wpSt.searchInput}
                  placeholder="Type a word..."
                  placeholderTextColor="#A09990"
                  value={rhymeQuery}
                  onChangeText={q => { setRhymeQuery(q); setRhymeSearched(''); }}
                  onSubmitEditing={() => searchRhymes()}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[wpSt.searchBtn, { backgroundColor: accentLight }]} onPress={() => searchRhymes()}>
                  <Ionicons name="search" size={16} color={accentColor} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={wpSt.results} showsVerticalScrollIndicator={false}>
                {rhymeLoading && <ActivityIndicator color={accentColor} style={{ marginTop: 20 }} />}
                {!rhymeLoading && rhymes.map(g => g.words.length > 0 && (
                  <View key={g.label} style={wpSt.section}>
                    <Text style={wpSt.sectionLabel}>{g.label} Rhymes</Text>
                    <View style={wpSt.grid}>
                      {g.words.map(w => (
                        <TouchableOpacity key={w} style={wpSt.chip} onPress={() => tapRhyme(w)}>
                          <Text style={wpSt.chipText}>{w}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
                {rhymesEmpty && <Text style={wpSt.empty}>No rhymes found for "{rhymeSearched}"</Text>}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={wpSt.searchRow}>
                <TextInput
                  style={wpSt.searchInput}
                  placeholder="Word or feeling..."
                  placeholderTextColor="#A09990"
                  value={wordQuery}
                  onChangeText={q => { setWordQuery(q); setWordSearched(''); }}
                  onSubmitEditing={() => searchWords()}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[wpSt.searchBtn, { backgroundColor: accentLight }]} onPress={() => searchWords()}>
                  <Ionicons name="search" size={16} color={accentColor} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={wpSt.results} showsVerticalScrollIndicator={false}>
                {wordLoading && <ActivityIndicator color={accentColor} style={{ marginTop: 20 }} />}
                {!wordLoading && synonyms.length > 0 && (
                  <View style={wpSt.section}>
                    <Text style={wpSt.sectionLabel}>Synonyms</Text>
                    <View style={wpSt.grid}>
                      {synonyms.map(w => <TouchableOpacity key={w} style={wpSt.chip} onPress={() => tapWord(w)}><Text style={wpSt.chipText}>{w}</Text></TouchableOpacity>)}
                    </View>
                  </View>
                )}
                {!wordLoading && meansLike.length > 0 && (
                  <View style={wpSt.section}>
                    <Text style={wpSt.sectionLabel}>Similar Meaning</Text>
                    <View style={wpSt.grid}>
                      {meansLike.map(w => <TouchableOpacity key={w} style={wpSt.chip} onPress={() => tapWord(w)}><Text style={wpSt.chipText}>{w}</Text></TouchableOpacity>)}
                    </View>
                  </View>
                )}
                {!wordLoading && definitions.length > 0 && (
                  <View style={wpSt.section}>
                    <Text style={wpSt.sectionLabel}>Definition</Text>
                    {definitions.map((d, i) => (
                      <View key={i} style={wpSt.defItem}>
                        <Text style={wpSt.defPos}>{d.pos}</Text>
                        <Text style={wpSt.defText}>{d.def}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {wordsEmpty && <Text style={wpSt.empty}>No results for "{wordSearched}"</Text>}
                {!wordSearched && <Text style={wpSt.hint}>Search a word for synonyms, or describe a feeling for matching words.</Text>}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

const wpSt = StyleSheet.create({
  panel: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: '#FFFFFF', borderLeftWidth: 0.5, borderLeftColor: 'rgba(28,26,23,0.1)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(28,26,23,0.06)' },
  title: { fontSize: 17, fontWeight: '700', color: '#1C1A17' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F5F1EB', alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#A09990' },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#F5F1EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1C1A17' },
  searchBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  results: { paddingBottom: 40 },
  section: { paddingHorizontal: 14, paddingTop: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F5F1EB' },
  chipText: { fontSize: 13, color: '#1C1A17' },
  defItem: { marginBottom: 12 },
  defPos: { fontSize: 10, fontWeight: '600', color: '#A09990', textTransform: 'uppercase', letterSpacing: 0.4, fontStyle: 'italic', marginBottom: 2 },
  defText: { fontSize: 13, color: '#1C1A17', lineHeight: 18 },
  empty: { textAlign: 'center', color: '#A09990', fontSize: 13, paddingTop: 24, paddingHorizontal: 16 },
  hint: { fontSize: 12, color: '#C4BDB7', textAlign: 'center', paddingHorizontal: 16, paddingTop: 20, lineHeight: 18 },
});

// ─── Backdrop + mood gradient canvas ─────────────────────────────────────────

const GradientCanvas = React.memo(function GradientCanvas({
  chips, connections, bgData, quality, tint, intensity, glow, width, height, children,
}: {
  chips: InspoChip[]; connections: ChipConnection[];
  bgData: BoardBackgroundData; quality: GraphicsQuality;
  tint: string | null; intensity: number; glow: boolean;
  width: number; height: number;
  children: React.ReactNode;
}) {
  const grad = useMemo(() => computeDirectionalGradient(chips, connections), [chips, connections]);
  return (
    <View style={{ flex: 1 }}>
      <CustomBackdrop
        data={bgData}
        width={width}
        height={height}
        quality={quality}
        intensity={intensity}
        tint={tint}
      />
      {glow && (
        <LinearGradient colors={grad.colors as any} locations={grad.locations as any} start={grad.start} end={grad.end} style={StyleSheet.absoluteFill} />
      )}
      {children}
    </View>
  );
});

// ─── Symbol drag button ───────────────────────────────────────────────────────

function SymbolDragButton({ symbol, color, onTap, onDragStart, onDragMove, onDragEnd }: {
  symbol: string; color: string;
  onTap: () => void;
  onDragStart: (symbol: string, color: string, px: number, py: number) => void;
  onDragMove: (px: number, py: number) => void;
  onDragEnd: (px: number, py: number) => void;
}) {
  const dragging = useRef(false);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
    onPanResponderGrant: () => { dragging.current = false; },
    onPanResponderMove: (_, gs) => {
      if (!dragging.current && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5)) {
        dragging.current = true;
        onDragStart(symbol, color, gs.moveX, gs.moveY);
      } else if (dragging.current) {
        onDragMove(gs.moveX, gs.moveY);
      }
    },
    onPanResponderRelease: (_, gs) => {
      if (dragging.current) { dragging.current = false; onDragEnd(gs.moveX, gs.moveY); }
      else onTap();
    },
    onPanResponderTerminate: (_, gs) => {
      if (dragging.current) { dragging.current = false; onDragEnd(-1, -1); }
    },
  })).current;

  return (
    <View style={dcSt.symbolBtn} {...pan.panHandlers}>
      <Text style={[dcSt.symbolText, { color }]}>{symbol}</Text>
    </View>
  );
}

// ─── Audio picker modal ───────────────────────────────────────────────────────

function AudioPickerModal({ visible, color, onAdd, onClose }: {
  visible: boolean;
  color: string;
  onAdd: (opts: { audioUri: string; audioDuration: number; text: string }) => void;
  onClose: () => void;
}) {
  const { theme } = useThemeStore();
  const [tab, setTab] = useState<'record' | 'library'>('record');
  const [recState, setRecState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [doneUri, setDoneUri] = useState('');
  const [doneDuration, setDoneDuration] = useState(0);
  const [recTitle, setRecTitle] = useState('');
  const [library, setLibrary] = useState<Recording[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const activeRec = useRef<Audio.Recording | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewSound = useRef<Audio.Sound | null>(null);
  const accent = color === 'none' ? theme.accent : color;
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setTab('record'); setRecState('idle'); setElapsed(0);
      setDoneUri(''); setDoneDuration(0); setRecTitle(''); setPlayingId(null);
      setLibrary(db.getAllRecordings());
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      timerRef.current && clearInterval(timerRef.current);
      previewSound.current?.unloadAsync(); previewSound.current = null;
      Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  useEffect(() => {
    if (recState === 'recording') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      timerRef.current && clearInterval(timerRef.current);
    }
    return () => { timerRef.current && clearInterval(timerRef.current); };
  }, [recState]);

  async function startRec() {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { Alert.alert('Permission needed', 'Allow microphone access to record.'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
    activeRec.current = recording;
    setElapsed(0);
    setRecState('recording');
  }

  async function stopRec() {
    if (!activeRec.current) return;
    await activeRec.current.stopAndUnloadAsync();
    const uri = activeRec.current.getURI() ?? '';
    setDoneUri(uri);
    setDoneDuration(elapsed);
    activeRec.current = null;
    setRecState('done');
  }

  async function togglePreview(rec: Recording) {
    if (playingId === rec.id) {
      await previewSound.current?.stopAsync();
      await previewSound.current?.unloadAsync();
      previewSound.current = null;
      setPlayingId(null);
    } else {
      await previewSound.current?.unloadAsync();
      previewSound.current = null;
      setPlayingId(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: rec.filePath }, { shouldPlay: true });
      previewSound.current = sound;
      setPlayingId(rec.id);
      sound.setOnPlaybackStatusUpdate(st => {
        if (st.isLoaded && st.didJustFinish) { previewSound.current = null; setPlayingId(null); }
      });
    }
  }

  return (
    <Modal visible={mounted} transparent animationType="none">
      <TouchableOpacity style={apSt.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[apSt.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={apSt.handle} {...swipeHandlers} />
        <Text style={apSt.title}>Add Audio</Text>

        {/* Tabs */}
        <View style={apSt.tabRow}>
          {(['record', 'library'] as const).map(t => (
            <TouchableOpacity key={t} style={[apSt.tab, tab === t && { borderBottomColor: accent }]} onPress={() => setTab(t)}>
              <Text style={[apSt.tabText, tab === t && { color: accent }]}>{t === 'record' ? 'Record' : 'From Capture'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'record' ? (
          <View style={apSt.recordPane}>
            {recState === 'idle' && (
              <TouchableOpacity style={[apSt.recBtn, { backgroundColor: accent }]} onPress={startRec}>
                <Ionicons name="mic" size={32} color="#fff" />
              </TouchableOpacity>
            )}
            {recState === 'recording' && (
              <>
                <Text style={apSt.timer}>{formatDuration(elapsed)}</Text>
                <TouchableOpacity style={[apSt.recBtn, apSt.recBtnStop]} onPress={stopRec}>
                  <View style={apSt.stopSquare} />
                </TouchableOpacity>
              </>
            )}
            {recState === 'done' && (
              <View style={apSt.donePane}>
                <View style={[apSt.donePreview, { borderColor: accent + '55' }]}>
                  <Ionicons name="musical-note" size={20} color={accent} />
                  <Text style={apSt.doneDuration}>{formatDuration(doneDuration)}</Text>
                </View>
                <TextInput
                  style={apSt.titleInput}
                  value={recTitle}
                  onChangeText={setRecTitle}
                  placeholder="Name this recording..."
                  placeholderTextColor="#C4BDB7"
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity style={[apSt.addBtn, { backgroundColor: accent }]} onPress={() => onAdd({ audioUri: doneUri, audioDuration: doneDuration, text: recTitle.trim() || 'Recording' })}>
                  <Text style={apSt.addBtnText}>Add to Board</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRecState('idle')}>
                  <Text style={[apSt.retakeText, { color: accent }]}>Re-record</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={apSt.libraryList}>
            {library.length === 0 && (
              <Text style={apSt.emptyText}>No recordings in Capture yet.</Text>
            )}
            {library.map(rec => (
              <View key={rec.id} style={apSt.libRow}>
                <TouchableOpacity style={apSt.libPlay} onPress={() => togglePreview(rec)}>
                  <Ionicons name={playingId === rec.id ? 'pause-circle' : 'play-circle'} size={30} color={accent} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={apSt.libTitle} numberOfLines={1}>{rec.title ?? 'Recording'}</Text>
                  <Text style={apSt.libDuration}>{formatDuration(rec.duration)}</Text>
                </View>
                <TouchableOpacity style={[apSt.libAddBtn, { backgroundColor: accent + '22', borderColor: accent + '55' }]} onPress={() => onAdd({ audioUri: rec.filePath, audioDuration: rec.duration, text: rec.title ?? 'Recording' })}>
                  <Text style={[apSt.libAddBtnText, { color: accent }]}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const apSt = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet:       { backgroundColor: '#FDFAF5', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '80%' },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD8D0', alignSelf: 'center', marginBottom: 14 },
  title:       { fontSize: 17, fontWeight: '700', color: '#1C1A17', textAlign: 'center', marginBottom: 16 },
  tabRow:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8', marginBottom: 20 },
  tab:         { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:     { fontSize: 14, fontWeight: '600', color: '#A09890' },
  recordPane:  { alignItems: 'center', paddingVertical: 20, gap: 16 },
  timer:       { fontSize: 40, fontWeight: '200', color: '#1C1A17', letterSpacing: 2 },
  recBtn:      { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  recBtnStop:  { backgroundColor: '#EF4444' },
  stopSquare:  { width: 28, height: 28, borderRadius: 4, backgroundColor: '#fff' },
  donePane:    { width: '100%', gap: 12, alignItems: 'center' },
  donePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  doneDuration:{ fontSize: 16, fontWeight: '500', color: '#1C1A17' },
  titleInput:  { width: '100%', height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#DDD8D0', paddingHorizontal: 14, fontSize: 15, color: '#1C1A17', backgroundColor: '#fff' },
  addBtn:      { width: '100%', height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addBtnText:  { color: '#fff', fontSize: 15, fontWeight: '600' },
  retakeText:  { fontSize: 13, fontWeight: '500', marginTop: 4 },
  libraryList: { gap: 2, paddingBottom: 10 },
  emptyText:   { textAlign: 'center', color: '#A09890', paddingTop: 30, fontSize: 14 },
  libRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8' },
  libPlay:     { width: 36, alignItems: 'center' },
  libTitle:    { fontSize: 14, fontWeight: '600', color: '#1C1A17' },
  libDuration: { fontSize: 12, color: '#A09890', marginTop: 1 },
  libAddBtn:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  libAddBtnText: { fontSize: 13, fontWeight: '600' },
});

// ─── Decor panel (inline, not modal) ─────────────────────────────────────────

function BackdropSwatch({ id, label, active, accent, onPress }: {
  id: string; label: string; active: boolean; accent: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={onPress} activeOpacity={0.8}>
      <View style={[dcSt.bdSwatch, active && { borderColor: accent, borderWidth: 2.5 }]}>
        <BoardBackdrop backdropId={id} width={82} height={54} quality="lite" animated={false} />
        {active && (
          <View style={[dcSt.bdCheck, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[dcSt.bdLabel, active && { color: accent, fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function AssetPanel({ accent, onAdd, onClose }: {
  accent: string;
  onAdd: (def: AssetDef) => void;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, []);
  useEscapeKey(onClose, true);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  return (
    <Animated.View style={[dcSt.panel, { transform: [{ translateY: slideAnim }] }]}>
      <Pressable style={dcSt.panelInner} onPress={() => {}}>
        <SheetGrabHandle handlers={swipeHandlers} />
        <Text style={shSt.title}>Add elements</Text>
        <AssetLibrary accent={accent} onAdd={onAdd} />
        <TouchableOpacity style={[shSt.doneBtn, { backgroundColor: accent, marginTop: 10 }]} onPress={onClose}>
          <Text style={shSt.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
}

function confirmReplace(hasElements: boolean, apply: () => void) {
  if (!hasElements) { apply(); return; }
  if (Platform.OS === 'web') {
    if ((globalThis as any).confirm?.('Apply this template? It replaces your current background art (chips are kept).')) apply();
  } else {
    Alert.alert('Apply template', 'This replaces your current background art. Chips are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply', style: 'destructive', onPress: apply },
    ]);
  }
}

function DecorPanel({
  visible, currentBg, hasElements, baseColors, baseTexture, ambient, tint, intensity, glow,
  onApplyTemplate, onBaseColorsChange, onPickBaseColor, onTextureChange, onAmbientChange,
  onTintChange, onIntensityChange, onGlowChange,
  onClose, onAddSymbol, onDragStart, onDragMove, onDragEnd,
}: {
  visible: boolean; currentBg: BoardBackground;
  hasElements: boolean;
  baseColors: string[]; baseTexture: PaperTexture | undefined; ambient: AmbientFx;
  tint: string | null; intensity: number; glow: boolean;
  onApplyTemplate: (b: BoardBackground) => void;
  onBaseColorsChange: (colors: string[]) => void;
  onPickBaseColor: (index: number) => void;
  onTextureChange: (t: PaperTexture | undefined) => void;
  onAmbientChange: (fx: AmbientFx) => void;
  onTintChange: (t: string | null) => void;
  onIntensityChange: (v: number) => void;
  onGlowChange: (v: boolean) => void;
  onClose: () => void;
  onAddSymbol: (symbol: string) => void;
  onDragStart: (symbol: string, color: string, px: number, py: number) => void;
  onDragMove: (px: number, py: number) => void;
  onDragEnd: (px: number, py: number) => void;
}) {
  const { theme } = useThemeStore();
  const [tab, setTab] = useState<'symbols' | 'background'>('symbols');
  const [symbolColor, setSymbolColor] = useState(TEXT_COLORS[0]);
  // hide offset must exceed the panel's max height (background tab is tall)
  const slideAnim = useRef(new Animated.Value(1000)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 1000,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
    }).start();
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  return (
    <Animated.View
      style={[dcSt.panel, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <Pressable style={dcSt.panelInner} onPress={() => {}}>
        <SheetGrabHandle handlers={swipeHandlers} />

        <View style={dcSt.tabRow}>
          {(['symbols', 'background'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[dcSt.tab, tab === t && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
              onPress={() => setTab(t)}
            >
              <Text style={[dcSt.tabText, tab === t && { color: theme.accent }]}>
                {t === 'symbols' ? 'Symbols' : 'Background'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'symbols' ? (
          <>
            <Text style={[shSt.label, { marginTop: 12 }]}>Color</Text>
            <View style={dcSt.colorRow}>
              {TEXT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[dcSt.colorDot, { backgroundColor: c }, c === '#FFFFFF' && { borderWidth: 1, borderColor: '#DDD8D0' }, symbolColor === c && dcSt.colorDotActive]}
                  onPress={() => setSymbolColor(c)}
                />
              ))}
            </View>
            <Text style={[shSt.label, { marginTop: 14 }]}>Tap to add · drag to place</Text>
            <View style={dcSt.symbolGrid}>
              {DECOR_SYMBOLS.map(s => (
                <SymbolDragButton
                  key={s}
                  symbol={s}
                  color={symbolColor}
                  onTap={() => { onAddSymbol(s); onClose(); }}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}
            </View>
          </>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <Text style={[shSt.label, { marginTop: 10 }]}>Templates — applying replaces your background art</Text>
            {BACKDROP_CATEGORIES.map(cat => {
              const items = BACKDROP_LIST.filter(b => b.category === cat.id);
              if (items.length === 0) return null;
              return (
                <View key={cat.id}>
                  <Text style={[shSt.label, { marginTop: 12, marginBottom: 8 }]}>{cat.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2, paddingRight: 8 }}>
                    {items.map(b => (
                      <BackdropSwatch
                        key={b.id}
                        id={b.id}
                        label={b.label}
                        active={currentBg === b.id}
                        accent={theme.accent}
                        onPress={() => confirmReplace(hasElements, () => onApplyTemplate(b.id))}
                      />
                    ))}
                  </ScrollView>
                </View>
              );
            })}

            <Text style={[shSt.label, { marginTop: 18, marginBottom: 8 }]}>Base colors</Text>
            <View style={[dcSt.colorRow, { alignItems: 'center' }]}>
              {baseColors.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[dcSt.baseSlot, { backgroundColor: c }]}
                  onPress={() => onPickBaseColor(i)}
                >
                  <Ionicons name="color-palette-outline" size={13} color={'#00000055'} />
                </TouchableOpacity>
              ))}
              {baseColors.length < 3 && (
                <TouchableOpacity
                  style={[dcSt.baseSlot, dcSt.baseSlotGhost]}
                  onPress={() => onBaseColorsChange([...baseColors, baseColors[baseColors.length - 1]])}
                >
                  <Ionicons name="add" size={16} color="#8A8078" />
                </TouchableOpacity>
              )}
              {baseColors.length > 1 && (
                <TouchableOpacity
                  style={[dcSt.baseSlot, dcSt.baseSlotGhost]}
                  onPress={() => onBaseColorsChange(baseColors.slice(0, -1))}
                >
                  <Ionicons name="remove" size={16} color="#8A8078" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[shSt.label, { marginTop: 16, marginBottom: 8 }]}>Surface</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {PAPER_TEXTURES.map(t => {
                const active = (t.id === 'none' && !baseTexture) || baseTexture === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[dcSt.pill, active && { borderColor: theme.accent, backgroundColor: theme.accent + '16' }]}
                    onPress={() => onTextureChange(t.id === 'none' ? undefined : t.id)}
                  >
                    <Text style={[dcSt.pillText, active && { color: theme.accent }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[shSt.label, { marginTop: 16, marginBottom: 8 }]}>Ambient effect</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {AMBIENT_FX.map(fx => (
                <TouchableOpacity
                  key={fx.id}
                  style={[dcSt.pill, ambient === fx.id && { borderColor: theme.accent, backgroundColor: theme.accent + '16' }]}
                  onPress={() => onAmbientChange(fx.id)}
                >
                  <Text style={[dcSt.pillText, ambient === fx.id && { color: theme.accent }]}>{fx.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[shSt.label, { marginTop: 16, marginBottom: 8 }]}>Tint</Text>
            <View style={dcSt.colorRow}>
              <TouchableOpacity
                style={[dcSt.colorDot, dcSt.tintNone, tint === null && { borderColor: theme.accent, borderWidth: 2.5 }]}
                onPress={() => onTintChange(null)}
              >
                <View style={dcSt.tintNoneSlash} />
              </TouchableOpacity>
              {BACKDROP_TINTS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[dcSt.colorDot, { backgroundColor: c }, tint === c && dcSt.colorDotActive]}
                  onPress={() => onTintChange(tint === c ? null : c)}
                />
              ))}
            </View>

            <Text style={[shSt.label, { marginTop: 16, marginBottom: 8 }]}>Texture</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TEXTURE_INTENSITIES.map(opt => {
                const active = Math.abs(intensity - opt.value) < 0.01;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[dcSt.pill, active && { borderColor: theme.accent, backgroundColor: theme.accent + '16' }]}
                    onPress={() => onIntensityChange(opt.value)}
                  >
                    <Text style={[dcSt.pillText, active && { color: theme.accent }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[shSt.label, { marginTop: 16, marginBottom: 8 }]}>Mood glow</Text>
            <TouchableOpacity
              style={[dcSt.pill, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, glow && { borderColor: theme.accent, backgroundColor: theme.accent + '16' }]}
              onPress={() => onGlowChange(!glow)}
            >
              <Ionicons name={glow ? 'color-palette' : 'color-palette-outline'} size={15} color={glow ? theme.accent : '#6B6560'} />
              <Text style={[dcSt.pillText, glow && { color: theme.accent }]}>
                {glow ? 'Chips color the background' : 'Off'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <TouchableOpacity style={[shSt.doneBtn, { backgroundColor: theme.accent, marginTop: 16 }]} onPress={onClose}>
          <Text style={shSt.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
}

// ─── Link song sheet ──────────────────────────────────────────────────────────

export function LinkSongSheet({ visible, currentSongId, accentColor, onLink, onClose }: {
  visible: boolean; currentSongId: string | null; accentColor: string;
  onLink: (id: string | null) => void; onClose: () => void;
}) {
  const songs = useSongsStore(s => s.songs);
  const createSong = useSongsStore(s => s.createSong);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 240, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  function handleCreate() {
    const t = newTitle.trim();
    if (!t) return;
    const song = createSong(t);
    onLink(song.id);
    setCreating(false);
    setNewTitle('');
    onClose();
  }

  function handleClose() {
    setCreating(false);
    setNewTitle('');
    onClose();
  }

  useEscapeKey(handleClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, handleClose);

  return (
    <Modal visible={mounted} transparent animationType="none">
      <Pressable style={shSt.overlay} onPress={handleClose} />
      <Animated.View style={[shSt.sheet, { maxHeight: '65%' }, { transform: [{ translateY: slideAnim }] }]}>
        <SheetGrabHandle handlers={swipeHandlers} />
        <Text style={shSt.title}>Link to Song</Text>

        {creating ? (
          <View style={shSt.createRow}>
            <TextInput
              style={shSt.createInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Song title..."
              placeholderTextColor="#A09890"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <TouchableOpacity
              style={[shSt.createBtn, { backgroundColor: newTitle.trim() ? accentColor : accentColor + '55' }]}
              onPress={handleCreate}
              disabled={!newTitle.trim()}
            >
              <Text style={shSt.createBtnText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={shSt.createCancel} onPress={() => { setCreating(false); setNewTitle(''); }}>
              <Ionicons name="close" size={18} color="#A09890" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={shSt.row} onPress={() => setCreating(true)}>
            <Ionicons name="add-circle-outline" size={17} color={accentColor} />
            <Text style={[shSt.rowText, { color: accentColor, fontWeight: '600' }]}>New song</Text>
          </TouchableOpacity>
        )}

        <ScrollView showsVerticalScrollIndicator={false}>
          {currentSongId && (
            <TouchableOpacity style={shSt.row} onPress={() => { onLink(null); onClose(); }}>
              <Ionicons name="close-circle-outline" size={17} color="#EF4444" />
              <Text style={[shSt.rowText, { color: '#EF4444' }]}>Remove link</Text>
            </TouchableOpacity>
          )}
          {songs.map(s => {
            const isLinked = s.id === currentSongId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[shSt.row, isLinked && { backgroundColor: accentColor + '18' }]}
                onPress={() => {
                  if (isLinked) {
                    onClose();
                    router.push(`/song/${s.id}`);
                  } else {
                    onLink(s.id);
                    onClose();
                  }
                }}
              >
                <Ionicons name="musical-note" size={15} color={isLinked ? accentColor : '#8A7D6F'} />
                <Text style={[shSt.rowText, isLinked && { color: accentColor, fontWeight: '600' }]}>{s.title}</Text>
                {isLinked
                  ? <Ionicons name="chevron-forward" size={15} color={accentColor} />
                  : null}
              </TouchableOpacity>
            );
          })}
          {songs.length === 0 && !creating && <Text style={shSt.empty}>No songs yet.</Text>}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Notes modal ──────────────────────────────────────────────────────────────

function NotesModal({ visible, notes, accentColor, onChange, onClose }: {
  visible: boolean; notes: string; accentColor: string;
  onChange: (t: string) => void; onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 240, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  useEscapeKey(onClose, visible);
  const swipeHandlers = useSwipeDownDismiss(slideAnim, onClose);

  return (
    <Modal visible={mounted} transparent animationType="none">
      <Pressable style={shSt.overlay} onPress={onClose} />
      <Animated.View style={[shSt.sheet, { paddingBottom: Platform.OS === 'ios' ? 48 : 28 }, { transform: [{ translateY: slideAnim }] }]}>
        <SheetGrabHandle handlers={swipeHandlers} />
        <Text style={shSt.title}>Notes</Text>
        <TextInput
          style={shSt.notesInput}
          value={notes}
          onChangeText={onChange}
          placeholder="Free-write notes, ideas, lyrics..."
          placeholderTextColor="#C4BDB7"
          multiline
          textAlignVertical="top"
          autoFocus
        />
        <TouchableOpacity style={[shSt.doneBtn, { backgroundColor: accentColor }]} onPress={onClose}>
          <Text style={shSt.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const shSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#FDFAF5', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, gap: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD8D0', alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#1C1A17', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: '#A09890' },
  bgSwatch: { width: 88, height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0DAD0', alignItems: 'center', justifyContent: 'center' },
  bgSwatchActive: { borderColor: '#555', borderWidth: 2.5 },
  bgLabel: { fontSize: 12, fontWeight: '600' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dot: { width: 26, height: 26, borderRadius: 13 },
  dotActive: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  doneBtn: { marginTop: 16, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8' },
  rowText: { flex: 1, fontSize: 15, color: '#1C1A17' },
  empty: { fontSize: 14, color: '#A09890', textAlign: 'center', paddingVertical: 20 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8' },
  createInput: { flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: '#DDD8D0', paddingHorizontal: 12, fontSize: 15, color: '#1C1A17', backgroundColor: '#FFFFFF' },
  createBtn: { paddingHorizontal: 14, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  createCancel: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  notesInput: { minHeight: 120, maxHeight: 240, borderRadius: 10, borderWidth: 1, borderColor: '#E0DAD0', padding: 14, fontSize: 15, lineHeight: 22, color: '#1C1A17', backgroundColor: '#FFFFFF' },
});

const dcSt = StyleSheet.create({
  panel: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 },
  panelInner: {
    backgroundColor: '#FDFAF5', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20,
  },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D8', marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#A09890' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  symbolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  symbolBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#F5F1EB' },
  symbolText: { fontSize: 22 },
  bdSwatch: { width: 82, height: 54, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0DAD0', overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'flex-start' },
  bdLabel: { fontSize: 10.5, fontWeight: '600', color: '#8A8078', maxWidth: 82 },
  bdCheck: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tintNone: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#C0B8B0', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  baseSlot: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  baseSlotGhost: { backgroundColor: '#F5F1EB', borderStyle: 'dashed', borderColor: '#C8C0B4' },
  tintNoneSlash: { position: 'absolute', width: 30, height: 1.5, backgroundColor: '#C0B8B0', transform: [{ rotate: '45deg' }] },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5, borderColor: '#E0DAD0' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6B6560' },
});

// ─── Connections overlay ──────────────────────────────────────────────────────

type PendingConn = { fromChipId: string; startX: number; startY: number; dx: number; dy: number };
type Pt = { x: number; y: number };
type Rect = { l: number; t: number; r: number; b: number };

function ConnSeg({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - len / 2,
        top:  (y1 + y2) / 2 - 1.5,
        width: len,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

const CHIP_PAD = 22;
const CHIP_H   = 40;

function toRect(chip: InspoChip, chipWidths: Record<string, number>, canvasW: number, canvasH: number): Rect {
  const w = chipWidths[chip.id] ?? 60;
  const h = chip.style === 'image' ? 100 : CHIP_H;
  return { l: chip.x*canvasW - CHIP_PAD, t: chip.y*canvasH - CHIP_PAD, r: chip.x*canvasW + w + CHIP_PAD, b: chip.y*canvasH + h + CHIP_PAD };
}

function ptInRect(px: number, py: number, r: Rect): boolean {
  return px > r.l && px < r.r && py > r.t && py < r.b;
}

// True if segment AB passes through the strict interior of rect r.
function segBlocked(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  if (ptInRect(ax,ay,r) || ptInRect(bx,by,r)) return true;
  if (ptInRect((ax+bx)/2, (ay+by)/2, r)) return true; // diagonal corner-to-corner catch
  const edgeCross = (p1x: number, p1y: number, p2x: number, p2y: number, q1x: number, q1y: number, q2x: number, q2y: number): boolean => {
    const d = (p2x-p1x)*(q2y-q1y)-(p2y-p1y)*(q2x-q1x);
    if (Math.abs(d) < 0.01) return false;
    const t = ((q1x-p1x)*(q2y-q1y)-(q1y-p1y)*(q2x-q1x))/d;
    const u = ((q1x-p1x)*(p2y-p1y)-(q1y-p1y)*(p2x-p1x))/d;
    return t > 0.001 && t < 0.999 && u > -0.001 && u < 1.001;
  };
  return (
    edgeCross(ax,ay,bx,by, r.l,r.t,r.r,r.t) || edgeCross(ax,ay,bx,by, r.r,r.t,r.r,r.b) ||
    edgeCross(ax,ay,bx,by, r.r,r.b,r.l,r.b) || edgeCross(ax,ay,bx,by, r.l,r.b,r.l,r.t)
  );
}

// If pt is inside any obstacle rect, push it to the nearest edge so Dijkstra can reach it.
function safePt(pt: Pt, rects: Rect[]): Pt {
  for (const r of rects) {
    if (!ptInRect(pt.x, pt.y, r)) continue;
    const dl = pt.x-r.l, dr = r.r-pt.x, dt = pt.y-r.t, db = r.b-pt.y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: r.l-1, y: pt.y };
    if (m === dr) return { x: r.r+1, y: pt.y };
    if (m === dt) return { x: pt.x, y: r.t-1 };
    return { x: pt.x, y: r.b+1 };
  }
  return pt;
}

// Visibility-graph + Dijkstra: finds the shortest path that wraps around obstacle rects.
function routePath(from: Pt, to: Pt, chips: InspoChip[], fromId: string, toId: string, chipWidths: Record<string, number>, canvasW: number, canvasH: number): Pt[] {
  const rects = chips.filter(c => c.id !== fromId && c.id !== toId).map(c => toRect(c, chipWidths, canvasW, canvasH));
  if (rects.length === 0) return [from, to];

  // Push endpoints outside any obstacle rect they happen to fall inside
  const sf = safePt(from, rects);
  const st = safePt(to, rects);

  if (!rects.some(r => segBlocked(sf.x, sf.y, st.x, st.y, r))) return [from, to];

  // Nodes: 0=safeFrom, 1=safeTo, then 4 corners per rect
  const nodes: Pt[] = [sf, st];
  for (const r of rects) nodes.push({x:r.l,y:r.t},{x:r.r,y:r.t},{x:r.r,y:r.b},{x:r.l,y:r.b});
  const N = nodes.length;
  const canSee = (i: number, j: number) => !rects.some(r => segBlocked(nodes[i].x,nodes[i].y,nodes[j].x,nodes[j].y,r));

  const dist = new Array<number>(N).fill(Infinity);
  const prev = new Array<number>(N).fill(-1);
  const vis  = new Array<boolean>(N).fill(false);
  dist[0] = 0;

  for (let step = 0; step < N; step++) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!vis[i] && (u<0 || dist[i]<dist[u])) u=i;
    if (u<0 || dist[u]===Infinity) break;
    vis[u] = true;
    if (u===1) break;
    for (let v = 0; v < N; v++) {
      if (vis[v] || !canSee(u,v)) continue;
      const d = dist[u] + Math.hypot(nodes[v].x-nodes[u].x, nodes[v].y-nodes[u].y);
      if (d < dist[v]) { dist[v]=d; prev[v]=u; }
    }
  }

  const path: Pt[] = [];
  for (let cur=1; cur>=0; cur=prev[cur]) path.unshift(nodes[cur]);
  if (path.length < 2) return [from, to];
  // Restore original (unsnapped) endpoints
  path[0] = from;
  path[path.length-1] = to;
  return path;
}

function cubicPt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
  const u = 1-t;
  return { x: u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x, y: u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y };
}

// Render the connection as a smooth bezier curve.
// 2 pts → gentle arch between chips.
// 3+ pts → Catmull-Rom spline through visibility-graph waypoints (wraps around obstacles).
function PathLine({ pts, color }: { pts: Pt[]; color: string }) {
  if (pts.length < 2) return null;
  const STEPS = 14;
  const segs: React.ReactElement[] = [];

  if (pts.length === 2) {
    // No obstacle: draw a gentle upward arc
    const [p0, p3] = pts;
    const dx = p3.x-p0.x, dy = p3.y-p0.y, dist = Math.hypot(dx,dy)||1;
    const arch = Math.min(dist*0.18, 50);
    // perpendicular, biased so it arcs upward on screen
    const px = -dy/dist, py = dx/dist;
    const flip = py > 0 ? -1 : 1;
    const ax = flip*px*arch, ay = flip*py*arch;
    const cp1 = { x: p0.x+dx*0.25+ax, y: p0.y+dy*0.25+ay };
    const cp2 = { x: p0.x+dx*0.75+ax, y: p0.y+dy*0.75+ay };
    for (let i = 0; i < STEPS; i++) {
      const a = cubicPt(i/STEPS, p0, cp1, cp2, p3);
      const b = cubicPt((i+1)/STEPS, p0, cp1, cp2, p3);
      segs.push(<ConnSeg key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={color} />);
    }
    return <>{segs}</>;
  }

  // Multiple waypoints: straight segments so the line hugs corners like a string
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push(<ConnSeg key={i} x1={pts[i].x} y1={pts[i].y} x2={pts[i+1].x} y2={pts[i+1].y} color={color} />);
  }
  return <>{segs}</>;
}

function ConnectionsLayer({ chips, connections, pendingConn, chipWidths, canvasW, canvasH }: {
  chips: InspoChip[];
  connections: ChipConnection[];
  pendingConn: PendingConn | null;
  chipWidths: Record<string, number>;
  canvasW: number;
  canvasH: number;
}) {
  function dotPos(chip: InspoChip): Pt {
    const w = chipWidths[chip.id] ?? 60;
    return { x: chip.x * canvasW + w / 2, y: chip.y * canvasH };
  }
  const chipById = new Map(chips.map(c => [c.id, c]));
  if (connections.length === 0 && !pendingConn) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {connections.map(conn => {
        const from = chipById.get(conn.fromChipId), to = chipById.get(conn.toChipId);
        if (!from || !to) return null;
        const pts = routePath(dotPos(from), dotPos(to), chips, conn.fromChipId, conn.toChipId, chipWidths, canvasW, canvasH);
        return <PathLine key={conn.id} pts={pts} color={from.color} />;
      })}
      {pendingConn && (() => {
        const f: Pt = { x: pendingConn.startX, y: pendingConn.startY };
        const t: Pt = { x: pendingConn.startX+pendingConn.dx, y: pendingConn.startY+pendingConn.dy };
        const pts = routePath(f, t, chips, pendingConn.fromChipId, '', chipWidths, canvasW, canvasH);
        return <PathLine pts={pts} color="rgba(100,100,120,0.5)" />;
      })()}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InspoBoardScreen() {
  useGoogleFonts();

  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: W, height: H } = useWindowDimensions();

  const board = useInspoBoardStore(s => s.boards.find(b => b.id === id));
  const { updateBoard, addChip, updateChip, deleteChip, linkSong, deleteBoard, addConnection } = useInspoBoardStore();
  const { theme, bgTheme, graphics } = useThemeStore();

  const canvasW = W;
  const canvasH = H - HEADER_H - INPUT_H;

  // Input bar state
  const [chipInput, setChipInput]     = useState('');
  const [activeStyle, setActiveStyle] = useState<ChipStyle>('word');
  const [activeColor, setActiveColor] = useState('#F59E0B');

  // Live drag positions for real-time gradient
  const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});

  const chipWidths   = useRef<Record<string, number>>({});
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const connStartRef = useRef({ chipId: '', x: 0, y: 0 });

  // Marquee selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selRect, setSelRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const boardChipsRef = useRef<InspoChip[]>([]);
  boardChipsRef.current = board?.chips ?? [];
  const canvasWRef = useRef(canvasW); canvasWRef.current = canvasW;
  const canvasHRef = useRef(canvasH); canvasHRef.current = canvasH;
  const selStartPx  = useRef({ x: 0, y: 0 });
  const isLassoing  = useRef(false);

  const canvasPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
    onPanResponderGrant: (e) => {
      isLassoing.current = false;
      selStartPx.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setSelRect(null);
    },
    onPanResponderMove: (_, gs) => {
      isLassoing.current = true;
      const { x: sx, y: sy } = selStartPx.current;
      const ex = sx + gs.dx, ey = sy + gs.dy;
      const cW = canvasWRef.current, cH = canvasHRef.current;
      const l = Math.min(sx, ex), t = Math.min(sy, ey);
      const w = Math.abs(gs.dx),  h = Math.abs(gs.dy);
      setSelRect({ l, t, w, h });
      const nL = l / cW, nR = (l + w) / cW;
      const nT = t / cH, nB = (t + h) / cH;
      setSelectedIds(new Set(
        boardChipsRef.current.filter(c => c.x >= nL && c.x <= nR && c.y >= nT && c.y <= nB).map(c => c.id)
      ));
    },
    onPanResponderRelease: () => {
      setSelRect(null);
      if (!isLassoing.current) setSelectedIds(new Set());
      isLassoing.current = false;
    },
    onPanResponderTerminate: () => { setSelRect(null); isLassoing.current = false; },
  })).current;

  // Panel / modal visibility
  const [ctxChip, setCtxChip] = useState<{ chip: InspoChip; x: number; y: number } | null>(null);
  const [showWords, setShowWords]   = useState(false);
  const [showDecor, setShowDecor]             = useState(false);
  const [showToolbarColorPicker, setShowToolbarColorPicker] = useState(false);
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [showLink, setShowLink]     = useState(false);
  const [showNotes, setShowNotes]   = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleRef = useRef<TextInput>(null);
  const [dragSymbol, setDragSymbol] = useState<{ symbol: string; color: string } | null>(null);
  const ghostX = useRef(new Animated.Value(0)).current;
  const ghostY = useRef(new Animated.Value(0)).current;
  const canvasViewRef = useRef<View>(null);
  const canvasLayout = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // ── Background layer editing ──
  const [editLayer, setEditLayer] = useState<'chips' | 'background'>('chips');
  const [selElId, setSelElId] = useState<string | null>(null);
  const [elMenuPos, setElMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showAssets, setShowAssets] = useState(false);
  // While dragging, the element leaves the static SVG and a proxy follows the
  // finger via Animated values — no per-frame React re-renders.
  const [draggingElId, setDraggingElId] = useState<string | null>(null);
  const dragXY = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragEnd = useRef({ x: 0, y: 0 });
  const [pickTarget, setPickTarget] = useState<
    | { kind: 'el'; which: 'color' | 'color2' }
    | { kind: 'base'; index: number }
    | null
  >(null);
  const {
    applyTemplate, setBgBase, setAmbientFx,
    addBgElement, updateBgElement, duplicateBgElement, reorderBgElement, deleteBgElement,
  } = useInspoBoardStore();

  const bgElementsRef = useRef<BgElement[]>([]);
  const elDrag = useRef<{ id: string; startX: number; startY: number; elX: number; elY: number; moved: boolean } | null>(null);

  const bgPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const lx = e.nativeEvent.locationX, ly = e.nativeEvent.locationY;
      const cW = canvasWRef.current, cH = canvasHRef.current;
      // topmost element whose bbox contains the touch
      const hit = [...bgElementsRef.current]
        .sort((a, b) => b.z - a.z)
        .find(el => {
          const { cx, cy, half } = elementBBox(el, cW, cH);
          return lx >= cx - half && lx <= cx + half && ly >= cy - half && ly <= cy + half;
        });
      if (hit) {
        elDrag.current = { id: hit.id, startX: lx, startY: ly, elX: hit.x, elY: hit.y, moved: false };
        dragXY.setValue({ x: hit.x * cW, y: hit.y * cH });
        setSelElId(hit.id);
        setElMenuPos(null);
      } else {
        elDrag.current = null;
        setSelElId(null);
        setElMenuPos(null);
      }
    },
    onPanResponderMove: (_, gs) => {
      const d = elDrag.current;
      if (!d) return;
      if (!d.moved && Math.abs(gs.dx) + Math.abs(gs.dy) < 4) return;
      const cW = canvasWRef.current, cH = canvasHRef.current;
      if (!d.moved) {
        d.moved = true;
        setDraggingElId(d.id);
      }
      const px = Math.min(1.05, Math.max(-0.05, d.elX + gs.dx / cW)) * cW;
      const py = Math.min(1.05, Math.max(-0.05, d.elY + gs.dy / cH)) * cH;
      dragEnd.current = { x: px / cW, y: py / cH };
      dragXY.setValue({ x: px, y: py });
    },
    onPanResponderRelease: () => {
      const d = elDrag.current;
      elDrag.current = null;
      if (!d) return;
      if (d.moved) {
        updateBgElement(boardIdRef.current, d.id, dragEnd.current);
        setDraggingElId(null);
      } else {
        // plain tap → open the element menu near the touch
        setElMenuPos({ x: d.startX, y: d.startY });
      }
    },
    onPanResponderTerminate: () => { elDrag.current = null; setDraggingElId(null); },
  })).current;

  const boardIdRef = useRef('');

  useEffect(() => { setActiveColor(theme.accent); }, [theme.accent]);

  if (!board) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bgTheme.bg }}>
        <Text style={{ color: '#8A7D6F' }}>Board not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#F59E0B' }}>← Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const bg = getBackdrop(board.background);
  const baseColors = board.bgBase?.colors?.length ? board.bgBase.colors : bg.baseColors;
  const ink = themeForBase({ colors: baseColors }).fg;
  const bgBase = baseColors[baseColors.length - 1];

  boardIdRef.current = board.id;
  bgElementsRef.current = board.bgElements ?? [];

  const bgData: BoardBackgroundData = {
    base: board.bgBase ?? { colors: bg.baseColors },
    elements: draggingElId
      ? (board.bgElements ?? []).filter(e => e.id !== draggingElId)
      : (board.bgElements ?? []),
    ambient: board.ambientFx ?? 'none',
  };
  const draggingEl = draggingElId ? (board.bgElements ?? []).find(e => e.id === draggingElId) : null;

  const selEl = selElId
    ? bgData.elements.find(e => e.id === selElId) ?? null
    : null;

  function handleAddAsset(def: AssetDef) {
    const el = addBgElement(board!.id, {
      kind: def.kind,
      x: 0.4 + Math.random() * 0.2,
      y: 0.28 + Math.random() * 0.18,
      size: def.size,
      rotation: 0,
      opacity: 1,
      fill: { ...def.fill },
      anim: def.anim ?? 'none',
      animSpeed: 'normal',
    });
    setSelElId(el.id);
    setShowAssets(false);
  }

  const accentLight = theme.accent + '28';

  function doAddChip(text?: string) {
    const t = (text ?? chipInput).trim();
    if (!t) return;
    addChip(board!.id, t, { style: activeStyle, color: activeStyle === 'word' ? undefined : activeColor });
    if (!text) { setChipInput(''); Keyboard.dismiss(); }
  }

  function doAddSymbol(symbol: string, color?: string) {
    const c = color ?? activeColor;
    addChip(board!.id, symbol, { style: 'decor', color: c, textColor: c, fontSize: 32 });
  }

  function handleSymbolDragStart(symbol: string, color: string, px: number, py: number) {
    setDragSymbol({ symbol, color });
    ghostX.setValue(px - 22);
    ghostY.setValue(py - 22);
    setShowDecor(false);
  }

  function handleSymbolDragMove(px: number, py: number) {
    ghostX.setValue(px - 22);
    ghostY.setValue(py - 22);
  }

  function handleSymbolDragEnd(px: number, py: number) {
    if (dragSymbol && px > 0 && py > 0) {
      const { x: cx, y: cy, w: cw, h: ch } = canvasLayout.current;
      const nx = Math.max(0.02, Math.min(0.95, (px - cx) / cw));
      const ny = Math.max(0.02, Math.min(0.90, (py - cy) / ch));
      addChip(board!.id, dragSymbol.symbol, {
        style: 'decor', color: dragSymbol.color, textColor: dragSymbol.color, fontSize: 32,
        x: nx, y: ny,
      });
    }
    setDragSymbol(null);
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      addChip(board!.id, '', { style: 'image', color: activeColor, imageUri: result.assets[0].uri });
      setActiveStyle('word');
    }
  }

  function handleConnectionStart(chipId: string, startX: number, startY: number) {
    connStartRef.current = { chipId, x: startX, y: startY };
    setPendingConn({ fromChipId: chipId, startX, startY, dx: 0, dy: 0 });
  }

  function handleConnectionMove(dx: number, dy: number) {
    setPendingConn(prev => prev ? { ...prev, dx, dy } : null);
  }

  function handleConnectionEnd(dx: number, dy: number) {
    const { chipId: fromId, x: startX, y: startY } = connStartRef.current;
    connStartRef.current = { chipId: '', x: 0, y: 0 };
    setPendingConn(null);
    if (!fromId) return;
    const endX = startX + dx;
    const endY = startY + dy;
    const target = board!.chips.find(c => {
      if (c.id === fromId) return false;
      const w = chipWidths.current[c.id] ?? 60;
      return Math.hypot(c.x * canvasW + w / 2 - endX, c.y * canvasH - endY) < 60;
    });
    if (target) addConnection(board!.id, fromId, target.id);
  }

  function startEditTitle() {
    setTitleDraft(board!.title);
    setEditingTitle(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  function commitTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (t && t !== board!.title) updateBoard(board!.id, { title: t });
  }

  function handleDeleteBoard() {
    Alert.alert('Delete Board', `Delete "${board!.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteBoard(board!.id); router.back(); } },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <GradientCanvas
        chips={Object.keys(livePos).length > 0
          ? board.chips.map(c => livePos[c.id] ? { ...c, ...livePos[c.id] } : c)
          : board.chips}
        connections={board.connections}
        bgData={bgData}
        quality={graphics}
        tint={board.backdropTint ?? null}
        intensity={board.textureIntensity ?? 1}
        glow={board.moodGlow !== false && editLayer === 'chips'}
        width={W}
        height={H}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* ── Header ── */}
          <View style={[hdSt.row, { height: HEADER_H }]}>
            <TouchableOpacity onPress={() => router.back()} style={hdSt.btn}>
              <Ionicons name="chevron-back" size={22} color={ink} />
            </TouchableOpacity>

            {editingTitle ? (
              <TextInput
                ref={titleRef}
                style={[hdSt.titleInput, { color: ink, borderBottomColor: theme.accent }]}
                value={titleDraft}
                onChangeText={setTitleDraft}
                onBlur={commitTitle}
                onSubmitEditing={commitTitle}
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity onPress={startEditTitle} style={{ flex: 1 }}>
                <Text style={[hdSt.title, { color: ink }]} numberOfLines={1}>{board.title}</Text>
              </TouchableOpacity>
            )}

            <View style={hdSt.actions}>
              {board.linkedSongId && <View style={[hdSt.linkedDot, { backgroundColor: theme.accent }]} />}
              <TouchableOpacity style={hdSt.btn} onPress={() => setShowNotes(true)}>
                <Ionicons name="document-text-outline" size={19} color={ink + 'BB'} />
              </TouchableOpacity>
              <TouchableOpacity style={hdSt.btn} onPress={() => setShowWords(v => !v)}>
                <Ionicons name="text-outline" size={19} color={showWords ? theme.accent : ink + 'BB'} />
              </TouchableOpacity>
              <TouchableOpacity style={hdSt.btn} onPress={() => setShowLink(true)}>
                <Ionicons name="musical-note" size={18} color={board.linkedSongId ? theme.accent : ink + 'BB'} />
              </TouchableOpacity>
              <TouchableOpacity style={hdSt.btn} onPress={handleDeleteBoard}>
                <Ionicons name="trash-outline" size={17} color={ink + '55'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Canvas ── */}
          <View
            ref={canvasViewRef}
            style={{ flex: 1 }}
            onLayout={() => {
              canvasViewRef.current?.measure((_, __, w, h, px, py) => {
                canvasLayout.current = { x: px, y: py, w, h };
              });
            }}
            {...(editLayer === 'chips' ? canvasPan.panHandlers : bgPan.panHandlers)}
          >
            {editLayer === 'chips' && board.chips.length === 0 && (
              <View style={caSt.empty} pointerEvents="none">
                <Text selectable={false} style={[caSt.emptyIcon, { color: ink + '33' }]}>✦</Text>
                <Text selectable={false} style={[caSt.emptyText, { color: ink + '44' }]}>
                  Type below to add chips{'\n'}Hold a chip to style it • Drag to move
                </Text>
              </View>
            )}
            {editLayer === 'background' && bgData.elements.length === 0 && (
              <View style={caSt.empty} pointerEvents="none">
                <Text selectable={false} style={[caSt.emptyIcon, { color: ink + '33' }]}>✧</Text>
                <Text selectable={false} style={[caSt.emptyText, { color: ink + '44' }]}>
                  Background layer{'\n'}Add stars, clouds, shapes & more from below
                </Text>
              </View>
            )}
            <View
              style={[StyleSheet.absoluteFill, editLayer === 'background' && { opacity: 0.3 }]}
              pointerEvents={editLayer === 'chips' ? 'box-none' : 'none'}
            >
            {board.chips.map(chip => (
              <FloatingChip
                key={chip.id}
                chip={chip}
                canvasW={canvasW}
                canvasH={canvasH}
                isSelected={selectedIds.has(chip.id)}
                onLongPress={(chip, screenX, screenY) => setCtxChip({ chip, x: screenX, y: screenY })}
                onCancelMenu={() => setCtxChip(null)}
                onMoved={(chipId, x, y) => {
                  updateChip(board.id, chipId, { x, y });
                  setLivePos(prev => { const p = { ...prev }; delete p[chipId]; return p; });
                }}
                onResized={(chipId, fontSize) => updateChip(board.id, chipId, { fontSize })}
                onRotated={(chipId, rotation) => updateChip(board.id, chipId, { rotation })}
                onDragging={(chipId, x, y) => setLivePos(prev => ({ ...prev, [chipId]: { x, y } }))}
                onChipLayout={(chipId, width) => { chipWidths.current[chipId] = width; }}
                onConnectionStart={handleConnectionStart}
                onConnectionMove={handleConnectionMove}
                onConnectionEnd={handleConnectionEnd}
              />
            ))}
            <ConnectionsLayer
              chips={Object.keys(livePos).length > 0
                ? board.chips.map(c => livePos[c.id] ? { ...c, ...livePos[c.id] } : c)
                : board.chips}
              connections={board.connections}
              pendingConn={pendingConn}
              chipWidths={chipWidths.current}
              canvasW={canvasW}
              canvasH={canvasH}
            />
            {/* Selection rectangle */}
            {selRect && (
              <View pointerEvents="none" style={{
                position: 'absolute',
                left: selRect.l, top: selRect.t,
                width: selRect.w, height: selRect.h,
                borderWidth: 1.5, borderRadius: 4,
                borderColor: theme.accent,
                backgroundColor: theme.accent + '18',
              }} />
            )}
            {/* Multi-select toolbar */}
            {selectedIds.size > 0 && !selRect && (
              <View style={caSt.selToolbar} pointerEvents="box-none">
                <View style={[caSt.selBar, { backgroundColor: theme.accent }]}>
                  <Text style={caSt.selCount}>{selectedIds.size} chip{selectedIds.size > 1 ? 's' : ''} selected</Text>
                  <TouchableOpacity style={caSt.selBtn} onPress={() => {
                    selectedIds.forEach(chipId => deleteChip(board.id, chipId));
                    setSelectedIds(new Set());
                  }}>
                    <Ionicons name="trash-outline" size={15} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={caSt.selBtn} onPress={() => setSelectedIds(new Set())}>
                    <Ionicons name="close" size={17} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            </View>

            {/* ── Background layer selection + element menu ── */}
            {editLayer === 'background' && draggingEl && (() => {
              const s = draggingEl.size * canvasW;
              const box = Math.max(20, s * 2.3);
              return (
                <Animated.View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: dragXY.x }, { translateY: dragXY.y }] }}
                >
                  <View
                    style={{
                      width: box, height: box, marginLeft: -box / 2, marginTop: -box / 2,
                      opacity: draggingEl.opacity,
                      transform: [{ rotate: `${draggingEl.rotation}deg` }, { scaleX: draggingEl.flipX ? -1 : 1 }],
                    }}
                  >
                    <ElementPreview kind={draggingEl.kind} fill={draggingEl.fill} size={box} />
                  </View>
                </Animated.View>
              );
            })()}
            {editLayer === 'background' && selEl && !draggingElId && (
              <SelectionRing {...elementBBox(selEl, canvasW, canvasH)} accent={theme.accent} />
            )}
            {editLayer === 'background' && selEl && elMenuPos && (
              <ElementMenu
                element={selEl}
                x={elMenuPos.x}
                y={elMenuPos.y}
                canvasW={canvasW}
                canvasH={canvasH}
                accent={theme.accent}
                onUpdate={patch => updateBgElement(board.id, selEl.id, patch)}
                onDuplicate={() => {
                  const copy = duplicateBgElement(board.id, selEl.id);
                  if (copy) setSelElId(copy.id);
                }}
                onReorder={dir => reorderBgElement(board.id, selEl.id, dir)}
                onDelete={() => { deleteBgElement(board.id, selEl.id); setSelElId(null); setElMenuPos(null); }}
                onPickColor={which => setPickTarget({ kind: 'el', which })}
                onClose={() => setElMenuPos(null)}
              />
            )}
          </View>

          {/* ── Input bar ── */}
          <View style={[inSt.bar, { borderTopColor: ink + '14', backgroundColor: bgBase + 'E8' }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={inSt.controlsRow} keyboardShouldPersistTaps="handled">
              {/* layer toggle */}
              <View style={[inSt.layerToggle, { borderColor: ink + '30' }]}>
                {(['chips', 'background'] as const).map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[inSt.layerBtn, editLayer === l && { backgroundColor: theme.accent }]}
                    onPress={() => {
                      setEditLayer(l);
                      setSelElId(null); setElMenuPos(null); setShowAssets(false);
                      setSelectedIds(new Set()); setCtxChip(null);
                    }}
                  >
                    <Ionicons
                      name={l === 'chips' ? 'chatbox-ellipses-outline' : 'image-outline'}
                      size={14}
                      color={editLayer === l ? '#fff' : ink + '99'}
                    />
                    <Text style={[inSt.layerBtnText, { color: editLayer === l ? '#fff' : ink + '99' }]}>
                      {l === 'chips' ? 'Chips' : 'Scene'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={inSt.divV} />
              {editLayer === 'background' && (
                <>
                  <TouchableOpacity
                    style={[inSt.styleBtn, showAssets && { backgroundColor: theme.accent + '28', borderColor: theme.accent }, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}
                    onPress={() => setShowAssets(true)}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={showAssets ? theme.accent : ink + 'AA'} />
                    <Text style={[inSt.styleBtnText, { color: showAssets ? theme.accent : ink + 'AA' }]}>Elements</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[inSt.styleBtn, showDecor && { backgroundColor: theme.accent + '28', borderColor: theme.accent }, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}
                    onPress={() => setShowDecor(true)}
                  >
                    <Ionicons name="color-fill-outline" size={16} color={showDecor ? theme.accent : ink + 'AA'} />
                    <Text style={[inSt.styleBtnText, { color: showDecor ? theme.accent : ink + 'AA' }]}>Backdrop</Text>
                  </TouchableOpacity>
                </>
              )}
              {editLayer === 'chips' && ([['word', 'Theme'], ['lyric', 'Lyric']] as [ChipStyle, string][]).map(([s, label]) => (
                <TouchableOpacity
                  key={s}
                  style={[inSt.styleBtn, activeStyle === s && { backgroundColor: activeColor + '28', borderColor: activeColor }]}
                  onPress={() => setActiveStyle(s)}
                >
                  <Text style={[inSt.styleBtnText, { color: ink + 'AA' }, activeStyle === s && { color: activeColor }]}>{label}</Text>
                </TouchableOpacity>
              ))}
              {editLayer === 'chips' && (
                <>
                  <TouchableOpacity
                    style={[inSt.styleBtn, activeStyle === 'image' && { backgroundColor: activeColor + '28', borderColor: activeColor }]}
                    onPress={() => setActiveStyle('image')}
                  >
                    <Ionicons name="image-outline" size={16} color={activeStyle === 'image' ? activeColor : ink + 'AA'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[inSt.styleBtn, activeStyle === 'audio' && { backgroundColor: activeColor + '28', borderColor: activeColor }]}
                    onPress={() => setActiveStyle('audio')}
                  >
                    <Ionicons name="mic-outline" size={16} color={activeStyle === 'audio' ? activeColor : ink + 'AA'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[inSt.styleBtn, showDecor && { backgroundColor: activeColor + '28', borderColor: activeColor }]}
                    onPress={() => setShowDecor(true)}
                  >
                    <Ionicons name="sparkles-outline" size={16} color={showDecor ? activeColor : ink + 'AA'} />
                  </TouchableOpacity>
                  <View style={inSt.divV} />
                  <TouchableOpacity
                    key="none"
                    style={[inSt.dot, inSt.dotNone, activeColor === 'none' && inSt.dotActive]}
                    onPress={() => setActiveColor('none')}
                  >
                    <View style={inSt.dotNoneSlash} />
                  </TouchableOpacity>
                  {CHIP_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[inSt.dot, { backgroundColor: c }, activeColor === c && inSt.dotActive]}
                      onPress={() => setActiveColor(c)}
                    />
                  ))}
                  <TouchableOpacity style={inSt.moreColorBtn} onPress={() => setShowToolbarColorPicker(true)}>
                    <Ionicons name="color-palette-outline" size={18} color={ink + '99'} />
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>

            {editLayer === 'background' ? (
              <Text style={[inSt.dropzoneText, { color: ink + '66', textAlign: 'center', paddingVertical: 10 }]}>
                Tap an element to style it · drag to move · add from Elements
              </Text>
            ) : activeStyle === 'image' ? (
              <TouchableOpacity style={[inSt.dropzone, { borderColor: ink + '30' }]} onPress={pickImage} activeOpacity={0.7}>
                <Ionicons name="cloud-upload-outline" size={22} color={ink + '55'} />
                <Text style={[inSt.dropzoneText, { color: ink + '66' }]}>
                  {Platform.OS === 'web' ? 'Drag an image or tap to browse' : 'Tap to browse photos'}
                </Text>
              </TouchableOpacity>
            ) : activeStyle === 'audio' ? (
              <TouchableOpacity style={[inSt.dropzone, { borderColor: ink + '30' }]} onPress={() => setShowAudioPicker(true)} activeOpacity={0.7}>
                <Ionicons name="mic-outline" size={22} color={ink + '55'} />
                <Text style={[inSt.dropzoneText, { color: ink + '66' }]}>
                  Record or add from Capture
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={inSt.row}>
                <TextInput
                  style={[inSt.input, { color: ink, borderColor: ink + '20', backgroundColor: ink + '0A' }]}
                  value={chipInput}
                  onChangeText={setChipInput}
                  placeholder={activeStyle === 'lyric' ? 'Add a lyric...' : 'Add a word or phrase...'}
                  placeholderTextColor={ink + '44'}
                  returnKeyType="done"
                  onSubmitEditing={() => doAddChip()}
                />
                <TouchableOpacity
                  style={[inSt.addBtn, { backgroundColor: chipInput.trim() ? theme.accent : theme.accent + '44' }]}
                  onPress={() => doAddChip()}
                  disabled={!chipInput.trim()}
                >
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>

        {/* Word panel (slides in over canvas) */}
        <InspoWordPanel
          visible={showWords}
          accentColor={theme.accent}
          accentLight={accentLight}
          onClose={() => setShowWords(false)}
          onSelectWord={word => doAddChip(word)}
        />
      </GradientCanvas>

      {/* Modals */}
      {ctxChip && (
        <ChipMenu
          chip={ctxChip.chip}
          anchorX={ctxChip.x}
          anchorY={ctxChip.y}
          onClose={() => setCtxChip(null)}
          onDelete={() => { deleteChip(board.id, ctxChip.chip.id); setCtxChip(null); }}
          onUpdate={patch => updateChip(board.id, ctxChip.chip.id, patch)}
        />
      )}
      <LinkSongSheet
        visible={showLink}
        currentSongId={board.linkedSongId}
        accentColor={theme.accent}
        onLink={songId => linkSong(board.id, songId)}
        onClose={() => setShowLink(false)}
      />
      <NotesModal
        visible={showNotes}
        notes={board.notes}
        accentColor={theme.accent}
        onChange={t => updateBoard(board.id, { notes: t })}
        onClose={() => setShowNotes(false)}
      />

      <ColorPickerModal
        visible={showToolbarColorPicker}
        initialColor={activeColor === 'none' ? '#F59E0B' : activeColor}
        onSelect={hex => { setActiveColor(hex); setShowToolbarColorPicker(false); }}
        onClose={() => setShowToolbarColorPicker(false)}
      />

      <AudioPickerModal
        visible={showAudioPicker}
        color={activeColor}
        onAdd={({ audioUri, audioDuration, text }) => {
          addChip(board.id, text, { style: 'audio', color: activeColor, audioUri, audioDuration });
          setShowAudioPicker(false);
        }}
        onClose={() => setShowAudioPicker(false)}
      />

      {/* Decor panel backdrop */}
      {showDecor && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 99 }]}
          onPress={() => setShowDecor(false)}
        />
      )}

      {/* Decor panel — inline so drag gesture survives panel close */}
      <DecorPanel
        visible={showDecor}
        currentBg={board.background}
        hasElements={(board.bgElements?.length ?? 0) > 0}
        baseColors={baseColors}
        baseTexture={board.bgBase?.texture}
        ambient={board.ambientFx ?? 'none'}
        tint={board.backdropTint ?? null}
        intensity={board.textureIntensity ?? 1}
        glow={board.moodGlow !== false}
        onApplyTemplate={b => applyTemplate(board.id, b)}
        onBaseColorsChange={colors => setBgBase(board.id, { colors })}
        onPickBaseColor={i => setPickTarget({ kind: 'base', index: i })}
        onTextureChange={t => setBgBase(board.id, { texture: t })}
        onAmbientChange={fx => setAmbientFx(board.id, fx)}
        onTintChange={t => updateBoard(board.id, { backdropTint: t })}
        onIntensityChange={v => updateBoard(board.id, { textureIntensity: v })}
        onGlowChange={v => updateBoard(board.id, { moodGlow: v })}
        onClose={() => setShowDecor(false)}
        onAddSymbol={s => doAddSymbol(s)}
        onDragStart={handleSymbolDragStart}
        onDragMove={handleSymbolDragMove}
        onDragEnd={handleSymbolDragEnd}
      />

      {/* Asset library panel (background layer) */}
      {showAssets && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 99 }]}
          onPress={() => setShowAssets(false)}
        />
      )}
      {showAssets && (
        <AssetPanel accent={theme.accent} onAdd={handleAddAsset} onClose={() => setShowAssets(false)} />
      )}

      {/* Color picker for element fills + base gradient stops */}
      <ColorPickerModal
        visible={pickTarget !== null}
        initialColor={
          pickTarget?.kind === 'el' && selEl
            ? (pickTarget.which === 'color' ? selEl.fill.color : selEl.fill.color2 ?? '#F472B6').slice(0, 7)
            : pickTarget?.kind === 'base'
              ? (board.bgBase?.colors?.[pickTarget.index] ?? '#FAFAF8')
              : '#F59E0B'
        }
        onSelect={hex => {
          if (pickTarget?.kind === 'el' && selEl) {
            updateBgElement(board.id, selEl.id, {
              fill: { ...selEl.fill, [pickTarget.which]: hex },
            });
          } else if (pickTarget?.kind === 'base') {
            const colors = [...(board.bgBase?.colors ?? bg.baseColors)];
            colors[pickTarget.index] = hex;
            setBgBase(board.id, { colors });
          }
          setPickTarget(null);
        }}
        onClose={() => setPickTarget(null)}
      />

      {/* Drag ghost — rendered last so it's on top of everything */}
      {dragSymbol && (
        <Animated.Text
          style={{ position: 'absolute', left: ghostX, top: ghostY, fontSize: 44, color: dragSymbol.color, opacity: 0.85 }}
          pointerEvents="none"
        >
          {dragSymbol.symbol}
        </Animated.Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  titleInput: { flex: 1, fontSize: 19, fontWeight: '700', letterSpacing: -0.3, borderBottomWidth: 2, paddingBottom: 2, padding: 0 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  linkedDot: { width: 7, height: 7, borderRadius: 4, marginRight: 2 },
});

const caSt = StyleSheet.create({
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 28, marginBottom: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 22 },
  selToolbar: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  selCount: { fontSize: 13, fontWeight: '600', color: '#fff', marginRight: 6 },
  selBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});

const inSt = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 12, gap: 8 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  styleBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  styleBtnText: { fontSize: 12, fontWeight: '600' },
  divV: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: 2 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  dotActive: { borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  dotNone: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#C0B8B0', overflow: 'hidden', justifyContent: 'center' as const, alignItems: 'center' as const },
  dotNoneSlash: { position: 'absolute' as const, width: 26, height: 1.5, backgroundColor: '#C0B8B0', transform: [{ rotate: '45deg' }] },
  moreColorBtn: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  layerToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  layerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  layerBtnText: { fontSize: 11.5, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  addBtn: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropzone: {
    marginHorizontal: 4,
    marginBottom: 4,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dropzoneText: { fontSize: 14 },
});
