import { useCallback, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import type { Screen } from '../domain/contracts.ts';
import type { WorkspaceAction, WorkspaceState } from './model.ts';

type Route = { screen: Screen; navigation: Screen[]; parent: number | null };

function entryId(value: unknown, session: string): number | null {
  if (!value || typeof value !== 'object' || !('torobWorkspace' in value)) return null;
  const marker: unknown = value.torobWorkspace;
  if (!marker || typeof marker !== 'object' || !('session' in marker) || marker.session !== session || !('entry' in marker)) return null;
  return typeof marker.entry === 'number' && Number.isSafeInteger(marker.entry) && marker.entry >= 0 ? marker.entry : null;
}

/** Browser entries contain opaque IDs only. Domain state and route records never leave memory. */
export function useWorkspaceHistory(state: WorkspaceState, dispatch: Dispatch<WorkspaceAction>) {
  const [session] = useState(() => crypto.randomUUID());
  const entries = useRef(new Map<number, Route>());
  const current = useRef(0), sequence = useRef(0), waiting = useRef(false);
  const marker = useCallback((entry: number) => ({ torobWorkspace: { session, entry } }), [session]);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const pop = (event: PopStateEvent) => {
      waiting.current = false;
      const id = entryId(event.state, session);
      const route = id === null ? undefined : entries.current.get(id);
      if (id !== null && route) {
        current.current = id;
        dispatch({ type: 'restoreNavigation', screen: route.screen, navigation: route.navigation });
      }
      // Foreign or previous-page-session entries cannot reconstruct domain state.
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [dispatch, session]);

  useLayoutEffect(() => {
    const route = entries.current.get(current.current);
    if (!route) {
      entries.current.set(current.current, { screen: state.screen, navigation: [...state.navigation], parent: null });
      window.history.replaceState(marker(current.current), '');
    } else if (route.screen !== state.screen || route.navigation.join('|') !== state.navigation.join('|')) {
      const next = ++sequence.current;
      entries.current.set(next, { screen: state.screen, navigation: [...state.navigation], parent: current.current });
      current.current = next;
      waiting.current = false;
      window.history.pushState(marker(next), '');
    }
  }, [state.screen, state.navigation, marker]);

  return useCallback(() => {
    if (waiting.current) return true;
    if (entries.current.get(current.current)?.parent == null) return false;
    waiting.current = true;
    window.history.back();
    return true;
  }, []);
}
