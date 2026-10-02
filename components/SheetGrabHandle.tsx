import React from 'react';
import { StyleSheet, View, type GestureResponderHandlers } from 'react-native';

/**
 * The drag-to-dismiss zone at the top of a bottom sheet. Renders the familiar
 * pill handle, but the touchable region is the full sheet width and ~40pt
 * tall, so a finger (or a mouse cursor) can grab the top of the sheet
 * naturally instead of needing to hit a 4px bar.
 *
 * Usage: <SheetGrabHandle handlers={useSwipeDownDismiss(slideAnim, onClose)} />
 */
export function SheetGrabHandle({ handlers, dark }: { handlers: GestureResponderHandlers; dark?: boolean }) {
  return (
    <View style={st.zone} {...handlers}>
      <View style={[st.pill, dark && { backgroundColor: 'rgba(255,255,255,0.35)' }]} />
    </View>
  );
}

const st = StyleSheet.create({
  zone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    marginTop: -12,   // reclaim the sheet's top padding so the zone hugs the edge
    marginBottom: 2,
  },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD8D0' },
});
