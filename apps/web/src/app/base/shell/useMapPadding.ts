import { useLayoutEffect, useState, type RefObject } from 'react';
import { measureMapPadding, type MapPadding } from './mapPadding.ts';

export function useMapPadding(map: RefObject<HTMLDivElement | null>, panel: RefObject<HTMLElement | null>,
  search: RefObject<HTMLElement | null>, visible: boolean, sheet: string): MapPadding {
  const [padding, setPadding] = useState<MapPadding>({ top: 20, right: 20, bottom: 20, left: 20 });
  useLayoutEffect(() => {
    const element = map.current;
    if (!visible || !element) return;
    let frame = 0;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const overlays = [panel.current, search.current].flatMap(node => node?.getClientRects().length ? [node.getBoundingClientRect()] : []);
      const next = measureMapPadding(rect, overlays);
      setPadding(previous => Object.keys(next).every(key => {
        const side = key as keyof MapPadding;
        return Math.abs(previous[side] - next[side]) < .5;
      }) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    for (const node of [element, panel.current, search.current]) if (node) observer.observe(node, { box: 'border-box' });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true); };
  }, [map, panel, search, visible, sheet]);
  return padding;
}
