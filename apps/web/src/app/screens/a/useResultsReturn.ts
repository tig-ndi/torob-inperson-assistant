import { useLayoutEffect, type RefObject } from 'react';
import type { ProductResults } from '../../base/domain/contracts.ts';

type ReturnPoint = { panelTop: number; pageTop: number; focusKey: string | null; openDetails: boolean[] };
// Ephemeral, keyed by the actual response object. A new search never inherits an old position.
// Weak keys release discarded results; nothing is persisted or logged.
const returnPoints = new WeakMap<ProductResults, ReturnPoint>();

export function useResultsReturn(results: ProductResults | null, heading: RefObject<HTMLHeadingElement | null>) {
  useLayoutEffect(() => {
    const title = heading.current;
    const root = title?.closest<HTMLElement>('.ua-results');
    const panel = root?.closest<HTMLElement>('.ub-panel-body');
    if (!title || !root || !panel) return;
    const saved = results ? returnPoints.get(results) : undefined;
    if (saved) {
      root.querySelectorAll<HTMLDetailsElement>('details').forEach((element, index) => {
        element.open = saved.openDetails[index] ?? false;
      });
      const target = Array.from(root.querySelectorAll<HTMLElement>('[data-ua-return]'))
        .find(element => element.dataset.uaReturn === saved.focusKey);
      (target ?? title).focus({ preventScroll: true });
      panel.scrollTop = saved.panelTop;
      window.scrollTo({ top: saved.pageTop, behavior: 'instant' });
    } else {
      if (results && results.page.offset === results.initialOffset) {
        root.querySelectorAll<HTMLDetailsElement>('details').forEach(element => { element.open = false; });
      }
      title.focus({ preventScroll: true });
      title.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    return () => {
      if (!results) return;
      const active = document.activeElement;
      returnPoints.set(results, {
        panelTop: panel.scrollTop, pageTop: window.scrollY,
        focusKey: active instanceof HTMLElement && root.contains(active) ? active.dataset.uaReturn ?? null : null,
        openDetails: Array.from(root.querySelectorAll<HTMLDetailsElement>('details'), element => element.open),
      });
    };
  }, [results, heading]);
}
