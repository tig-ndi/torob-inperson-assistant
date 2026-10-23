import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

export type SheetSize = 'peek' | 'half' | 'full';
const sizes: SheetSize[] = ['peek', 'half', 'full'];
const labels = { peek: 'جمع‌شده؛ نقشهٔ بیشتر', half: 'نقشه و فهرست', full: 'فهرست کامل' };

export function useMobileSheet(search: RefObject<HTMLElement | null>, active: boolean) {
  const [size, setSize] = useState<SheetSize>('half');
  const [geometry, setGeometry] = useState({ mobile: window.innerWidth < 960, height: window.innerHeight, top: 140 });
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; y: number; height: number } | null>(null);
  const suppressClick = useRef(false);
  useLayoutEffect(() => {
    if (!active) { drag.current = null; setDragHeight(null); return; }
    let frame = 0;
    const measure = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      const top = search.current?.getBoundingClientRect().bottom ?? 128;
      setGeometry({ mobile: window.innerWidth < 960, height, top: Math.max(0, top) + 12 });
      if (drag.current) { drag.current = null; suppressClick.current = true; setDragHeight(null); }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (search.current) observer.observe(search.current, { box: 'border-box' });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); };
  }, [search, active]);

  const full = Math.max(96, geometry.height - geometry.top);
  const half = Math.min(full, Math.max(96, Math.round(geometry.height * .52)), Math.max(96, geometry.height - geometry.top - 96));
  const heights = { peek: Math.min(96, full), half, full };
  const cancel = () => { if (!drag.current) return; drag.current = null; suppressClick.current = true; setDragHeight(null); };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!geometry.mobile || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, y: event.clientY, height: heights[size] };
    suppressClick.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const delta = current.y - event.clientY;
    if (Math.abs(delta) > 4) suppressClick.current = true;
    setDragHeight(Math.max(heights.peek, Math.min(full, current.height + delta)));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const delta = current.y - event.clientY;
    if (Math.abs(delta) > 4) {
      const height = Math.max(heights.peek, Math.min(full, current.height + delta));
      setSize(sizes.reduce((best, next) => Math.abs(heights[next] - height) < Math.abs(heights[best] - height) ? next : best));
      suppressClick.current = true;
    }
    drag.current = null; setDragHeight(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const toggle = () => setSize(previous => previous === 'full' ? 'half' : 'full');
  const tapHandle = () => setSize(previous => previous === 'half' ? 'full' : 'half');
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = sizes.indexOf(size);
    const next = event.key === 'Home' ? 'peek' : event.key === 'End' ? 'full'
      : event.key === 'ArrowUp' || event.key === 'PageUp' ? sizes[Math.min(2, index + 1)]
      : event.key === 'ArrowDown' || event.key === 'PageDown' ? sizes[Math.max(0, index - 1)] : null;
    if (next) { event.preventDefault(); setSize(next); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tapHandle(); }
    else if (event.key === 'Escape') cancel();
  };
  return { size, setSize, toggle, collapsed: active && geometry.mobile && size === 'peek',
    style: { '--ub-sheet-height': `${dragHeight ?? heights[size]}px`, '--ub-mobile-controls-top': `${geometry.top}px`,
      '--ub-mobile-viewport-height': `${geometry.height}px` } as CSSProperties,
    handle: { role: 'slider', tabIndex: 0, 'aria-label': 'اندازهٔ پنل فروشندگان', 'aria-orientation': 'vertical' as const,
      'aria-valuemin': 1, 'aria-valuemax': 3, 'aria-valuenow': sizes.indexOf(size) + 1, 'aria-valuetext': labels[size],
      'aria-controls': 'workspace-panel-content', onPointerDown, onPointerMove, onPointerUp,
      onPointerCancel: cancel, onLostPointerCapture: cancel, onKeyDown,
      onClick: () => { if (!suppressClick.current) tapHandle(); suppressClick.current = false; } } };
}
