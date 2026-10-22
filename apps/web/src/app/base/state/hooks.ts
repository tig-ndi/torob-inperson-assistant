import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alternatives, AssistantTurn, CataloguePage, Filters, FollowupOutcome, OfferPage, Position, PreparedFollowup, RequestState, Selection } from '../domain/contracts.ts';
import { findAlternatives, loadOffers, prepareFollowup, searchCatalogue, sendAssistant, type SearchInput, type AssistantInput } from '../domain/client.ts';
import { RequestGate } from './RequestGate.ts';
import { mergeOffers, offerQueryKey } from './model.ts';
import { useWorkspace } from './Workspace.tsx';

export function useCommand<T>() {
  const gate = useRef(new RequestGate());
  const [result, setResult] = useState<RequestState<T>>({ status: 'idle', data: null, error: null });
  const run = useCallback(async (load: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    const active = gate.current.begin();
    setResult(previous => ({ status: 'loading', data: previous.data, error: null }));
    try {
      const data = await load(active.signal);
      if (!active.isCurrent()) return null;
      setResult({ status: 'success', data, error: null });
      return data;
    } catch (error: unknown) {
      if (active.isCurrent()) setResult(previous => ({ status: 'error', data: previous.data,
        error: error instanceof Error ? error.message : 'درخواست انجام نشد.' }));
      return null;
    }
  }, []);
  const cancel = useCallback(() => {
    gate.current.cancel();
    setResult(previous => previous.data === null ? { status: 'idle', data: null, error: null }
      : { status: 'success', data: previous.data, error: null });
  }, []);
  useEffect(() => () => gate.current.cancel(), []);
  return { result, run, cancel };
}
export function useCatalogue() {
  const command = useCommand<CataloguePage>();
  const { state } = useWorkspace();
  useEffect(() => { command.cancel(); }, [state.revision, command.cancel]);
  const search = useCallback((input: SearchInput) => command.run(signal => searchCatalogue(input, signal)), [command.run]);
  return { ...command, search };
}
export function useAssistant() {
  const command = useCommand<AssistantTurn>();
  const { state, dispatch } = useWorkspace();
  useEffect(() => { command.cancel(); }, [state.revision, command.cancel]);
  // Explicit submit only. No provider request in an effect, on typing or on mount.
  const submit = useCallback(async (input: AssistantInput) => {
    const expectedRevision = state.revision;
    const result = await command.run(signal => sendAssistant(input, signal));
    const lastMessage = input.messages.at(-1);
    if (result && lastMessage) dispatch({ type: 'assistant', result, userMessage: lastMessage.content, expectedRevision });
    return result;
  }, [command.run, state.revision, dispatch]);
  return { ...command, submit };
}
export function useOffers(productId: string | null, filters: Filters, position: Position | null) {
  const { dispatch } = useWorkspace();
  const key = offerQueryKey(productId, filters, position);
  const gate = useRef(new RequestGate()), pageBusy = useRef(false), currentKey = useRef(key);
  currentKey.current = key;
  const [collection, setCollection] = useState<{ key: string; result: RequestState<OfferPage> }>({
    key, result: { status: 'idle', data: null, error: null },
  });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!productId) { gate.current.cancel(); return; }
    const active = gate.current.begin(); pageBusy.current = true;
    setCollection({ key, result: { status: 'loading', data: null, error: null } });
    Promise.resolve().then(() => loadOffers(productId, filters, position, active.signal)).then(data => {
      if (active.isCurrent()) setCollection({ key, result: { status: 'success', data, error: null } });
    }).catch((error: unknown) => {
      if (active.isCurrent()) setCollection({ key, result: { status: 'error', data: null,
        error: error instanceof Error ? error.message : 'آفرها دریافت نشدند.' } });
    }).finally(() => { if (active.isCurrent()) pageBusy.current = false; });
    return () => gate.current.cancel();
    // key contains every request argument; avoid restarting on equivalent objects.
  }, [key, refresh]);
  const result: RequestState<OfferPage> = collection.key === key && productId ? collection.result : { status: 'idle', data: null, error: null };
  useEffect(() => {
    if (result.data) dispatch({ type: 'offersLoaded', key, page: result.data });
  }, [result.data, key, dispatch]);
  const more = async () => {
    if (!productId || pageBusy.current || !result.data || !['success', 'error'].includes(result.status) || !result.data.has_more) return;
    const before = result.data, active = gate.current.begin(); pageBusy.current = true;
    setCollection({ key, result: { status: 'loading', data: before, error: null } });
    try {
      const next = await loadOffers(productId, filters, position, active.signal, before.offset + before.limit);
      if (active.isCurrent() && currentKey.current === key) setCollection({ key, result: { status: 'success', error: null,
        data: { ...next, items: mergeOffers(before.items, next.items) } } });
    } catch (error: unknown) {
      if (active.isCurrent() && currentKey.current === key) setCollection({ key, result: { status: 'error', data: before,
        error: error instanceof Error ? error.message : 'صفحهٔ بعد دریافت نشد.' } });
    } finally { if (active.isCurrent()) pageBusy.current = false; }
  };
  const reload = () => setRefresh(value => value + 1);
  return { result, more, reload, retry: () => result.status === 'error' && result.data ? void more() : reload(),
    loadedCount: result.data?.items.length ?? 0 };
}

export function useSellerFollowup() {
  const { state, dispatch } = useWorkspace();
  const draft = useCommand<PreparedFollowup>(), alternatives = useCommand<Alternatives>();
  useEffect(() => { draft.cancel(); alternatives.cancel(); }, [state.revision, draft.cancel, alternatives.cancel]);
  const prepare = async (selection: Selection) => {
    const expectedRevision = state.revision;
    const result = await draft.run(signal => prepareFollowup(selection, state.position, signal));
    if (result) dispatch({ type: 'prepared', result, expectedRevision });
    return result;
  };
  const report = async (selection: Selection, outcome: FollowupOutcome, source: 'simulated' | 'user_report' = 'simulated', offset = 0) => {
    const expectedRevision = state.revision;
    const result = await alternatives.run(signal => findAlternatives(selection, outcome, state.filters, state.position, signal, offset, source));
    if (result) dispatch({ type: 'alternatives', result, expectedRevision });
    return result;
  };
  // Completed drafts/outcomes live in Workspace, keyed by offer_id, across screens.
  return { draft: draft.result, alternatives: alternatives.result, prepare, report,
    cancel: () => { draft.cancel(); alternatives.cancel(); } };
}
