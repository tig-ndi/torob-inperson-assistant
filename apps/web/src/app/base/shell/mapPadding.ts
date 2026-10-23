export type MapPadding = { top: number; right: number; bottom: number; left: number };
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Insets are relative to the map, not to the window or a guessed panel width. */
export function measureMapPadding(map: Rect, overlays: readonly Rect[]): MapPadding {
  const padding = { top: 20, right: 20, bottom: 20, left: 20 };
  if (map.width <= 0 || map.height <= 0) return padding;
  for (const overlay of overlays) {
    const left = Math.max(map.left, overlay.left), right = Math.min(map.right, overlay.right);
    const top = Math.max(map.top, overlay.top), bottom = Math.min(map.bottom, overlay.bottom);
    if (right <= left || bottom <= top) continue;
    // Exclude the nearest edge strip. A sibling panel outside the map excludes nothing.
    if ((right - left) / map.width < (bottom - top) / map.height) {
      if ((left + right) / 2 >= (map.left + map.right) / 2) padding.right = Math.max(padding.right, map.right - left + 20);
      else padding.left = Math.max(padding.left, right - map.left + 20);
    } else {
      if ((top + bottom) / 2 >= (map.top + map.bottom) / 2) padding.bottom = Math.max(padding.bottom, map.bottom - top + 20);
      else padding.top = Math.max(padding.top, bottom - map.top + 20);
    }
  }
  // Keep a usable interior even during a transient tiny/hidden layout.
  for (const [start, end, size] of [['left', 'right', map.width], ['top', 'bottom', map.height]] as const) {
    const limit = Math.max(0, size - Math.min(96, size / 2));
    const sum = padding[start] + padding[end];
    if (sum > limit) { padding[start] *= limit / sum; padding[end] *= limit / sum; }
  }
  return padding;
}
