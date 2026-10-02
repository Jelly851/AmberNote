import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useEscapeKey(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active || Platform.OS !== 'web') return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape();
    }
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active, onEscape]);
}
