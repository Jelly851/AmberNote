import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Drag-to-dismiss for a bottom sheet. Attach the returned panHandlers to the
 * sheet's handle/header zone (not the whole sheet, so buttons/lists inside
 * still work normally). Expects `slideAnim` to be the same Animated.Value
 * the sheet already animates between 0 (open) and `hiddenOffset` (closed) on
 * `visible` change — this hook only drives the drag; the existing
 * visible-driven effect finishes the close animation once onClose fires.
 */
export function useSwipeDownDismiss(slideAnim: Animated.Value, onClose: () => void) {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 4 && gesture.dy > 0,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) slideAnim.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        const shouldClose = gesture.dy > 100 || gesture.vy > 0.8;
        if (shouldClose) {
          onClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }).start();
      },
    })
  ).current;

  return panResponder.panHandlers;
}
