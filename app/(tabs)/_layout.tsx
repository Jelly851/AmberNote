import { Ionicons } from '@expo/vector-icons';
import { router, Tabs, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useThemeStore } from '@/store/themeStore';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { name: 'index',   path: '/',        icon: 'mic-outline' as const,            iconActive: 'mic' as const },
  { name: 'explore', path: '/explore', icon: 'musical-notes-outline' as const,  iconActive: 'musical-notes' as const },
  { name: 'inspo',   path: '/inspo',   icon: 'color-palette-outline' as const,  iconActive: 'color-palette' as const },
  { name: 'feed',    path: '/feed',    icon: 'earth-outline' as const,          iconActive: 'earth' as const },
];

const BAR_HEIGHT = 58;   // visible icon area
const BLOCK_H    = 42;   // block height
const BLOCK_INSET = 5;   // gap on each side of the block within its tab slot

// ─── Animated tab bar ─────────────────────────────────────────────────────────

export const edgeBounceRef = { current: (_dir: 'left' | 'right') => {} };

function AnimatedTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, bgTheme } = useThemeStore();
  const screenWidth = Dimensions.get('window').width;
  const tabWidth = screenWidth / TABS.length;
  const blockWidth = tabWidth - BLOCK_INSET * 2;

  const blockX = useRef(new Animated.Value(state.index * tabWidth + BLOCK_INSET)).current;
  const activeIndexRef = useRef(state.index);
  const dragStartX = useRef(0);

  // Animate block when the active tab changes (tap or external navigation)
  useEffect(() => {
    activeIndexRef.current = state.index;
    Animated.spring(blockX, {
      toValue: state.index * tabWidth + BLOCK_INSET,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.75,
    }).start();
  }, [state.index]);

  // Register edge-bounce so the key handler can trigger it
  useEffect(() => {
    edgeBounceRef.current = (dir) => {
      const base = activeIndexRef.current * tabWidth + BLOCK_INSET;
      const nudge = dir === 'left' ? -12 : 12;
      blockX.setValue(base + nudge);
      Animated.spring(blockX, {
        toValue: base,
        useNativeDriver: true,
        damping: 6,
        stiffness: 220,
        mass: 0.7,
      }).start();
    };
  }, [tabWidth]);

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once a clear horizontal drag is detected,
      // so normal taps on the icon buttons still fire.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),

      onPanResponderGrant: () => {
        dragStartX.current = activeIndexRef.current * tabWidth + BLOCK_INSET;
      },

      onPanResponderMove: (_, g) => {
        const next = dragStartX.current + g.dx;
        const min  = BLOCK_INSET;
        const max  = (TABS.length - 1) * tabWidth + BLOCK_INSET;
        blockX.setValue(Math.max(min, Math.min(next, max)));
      },

      onPanResponderRelease: (_, g) => {
        // Nearest tab index based on how far the block was dragged
        const nearestIdx = Math.round(activeIndexRef.current + g.dx / tabWidth);
        const clampedIdx = Math.max(0, Math.min(nearestIdx, TABS.length - 1));
        const targetX    = clampedIdx * tabWidth + BLOCK_INSET;

        Animated.spring(blockX, {
          toValue: targetX,
          useNativeDriver: true,
          damping: 22,
          stiffness: 260,
          mass: 0.75,
        }).start();

        if (clampedIdx !== activeIndexRef.current) {
          router.navigate(TABS[clampedIdx].path as '/');
        }
      },
    })
  ).current;

  return (
    <View
      style={{
        backgroundColor: bgTheme.bg,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(28,26,23,0.08)',
        paddingBottom: insets.bottom,
        // Subtle top shadow
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
        elevation: 4,
      }}
    >
      <View
        style={{ height: BAR_HEIGHT, flexDirection: 'row' }}
        {...panResponder.panHandlers}
      >
        {/* Sliding accent block (sits behind icons) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: (BAR_HEIGHT - BLOCK_H) / 2,
            width: blockWidth,
            height: BLOCK_H,
            borderRadius: 13,
            backgroundColor: theme.accent,
            transform: [{ translateX: blockX }],
            shadowColor: theme.accent,
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          }}
        />

        {/* Icon buttons (on top of block) */}
        {TABS.map((tab, idx) => {
          const focused = state.index === idx;
          return (
            <TouchableOpacity
              key={tab.name}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() => {
                if (state.index !== idx) router.navigate(tab.path as '/');
                else edgeBounceRef.current(idx === 0 ? 'right' : idx === TABS.length - 1 ? 'left' : 'right');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={22}
                color={focused ? '#FFFFFF' : '#B0A9A2'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;
      const idx = parseInt(e.key, 10) - 1;
      if (Number.isFinite(idx) && idx >= 0 && idx < TABS.length) {
        router.navigate(TABS[idx].path as any);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 'right' : 'left';
        const currentIdx = TABS.findIndex(t => pathnameRef.current === t.path);
        const base = currentIdx === -1 ? 0 : currentIdx;
        const next = dir === 'right' ? base + 1 : base - 1;
        if (next < 0 || next >= TABS.length) {
          edgeBounceRef.current(dir);
        } else {
          router.navigate(TABS[next].path as any);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Tabs
      tabBar={props => <AnimatedTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Capture' }} />
      <Tabs.Screen name="explore" options={{ title: 'Songs' }} />
      <Tabs.Screen name="inspo"   options={{ title: 'Inspo' }} />
      <Tabs.Screen name="feed"    options={{ title: 'Feed' }} />
    </Tabs>
  );
}
