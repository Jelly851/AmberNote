import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initDb } from '@/lib/db';
import { useCaptureStore } from '@/store/captureStore';
import { useFeedStore } from '@/store/feedStore';
import { useSongsStore } from '@/store/songsStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const initCapture = useCaptureStore(s => s.init);
  const initSongs = useSongsStore(s => s.init);
  const initFeed = useFeedStore(s => s.init);

  useEffect(() => {
    initDb();
    initCapture();
    initSongs();
    initFeed();

    // UI chrome is not prose — disable text selection on web everywhere except
    // actual text entry (lyrics, titles, notes stay fully editable/selectable).
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
        input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="song/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="editor/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="inspo/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
