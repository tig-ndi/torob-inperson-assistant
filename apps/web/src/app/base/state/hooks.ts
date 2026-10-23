import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alternatives, AlternativeSearch, AssistantTurn, CataloguePage, Filters, FollowupOutcome, OfferPage, Position, PreparedFollowup, RequestState, Selection } from '../domain/contracts.ts';
import { findAlternatives, loadOffers, prepareFollowup, searchCatalogue, sendAssistant, type SearchInput, type AssistantInput } from '../domain/client.ts';
import { RequestGate } from './RequestGate.ts';
import { mergeOffers, offerQueryKey } from './model.ts';
import { useWorkspace } from './Workspace.tsx';
import { alternativeSearchKey, appendAlternatives } from './alternativePages.ts';
import { requestFailure } from '../domain/errors.ts';

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
      const failure = requestFailure(error);
      if (active.isCurrent()) setResult(previous => ({ status: 'error', data: previous.data,
        error: failure.message, failure }));
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
  const { state, dispatch } = useWorkspace();
  const revision = useRef(state.revision);
  const resultsRequest = useRef(state.productResultsRequest);
  revision.current = state.revision;
  resultsRequest.current = state.productResultsRequest;
  useEffect(() => { command.cancel(); }, [state.revision, state.screen, command.cancel]);
  const search = useCallback(async (input: SearchInput) => {
    const expectedRevision = revision.current;
    const expectedResultsRequest = crypto.randomUUID();
    dispatch({ type: 'beginProductResults', token: expectedResultsRequest });
    const page = await command.run(signal => searchCatalogue(input, signal));
    if (!page || expectedRevision !== revision.current || expectedResultsRequest !== resultsRequest.current) return null;
    dispatch({ type: 'catalogue', page, search: input, expectedRevision, expectedResultsRequest });
    return page;
  }, [command.run, dispatch]);
  return { ...command, search };
}
export function useAssistant() {
  const command = useCommand<AssistantTurn>();
  const { state, dispatch } = useWorkspace();
  useEffect(() => { command.cancel(); }, [state.revision, command.cancel]);
  // Explicit submit only. No provider request in an effect, on typing or on mount.
  const submit = useCallback(async (input: AssistantInput) => {
    const expectedRevision = state.revision;
    const expectedResultsRequest = crypto.randomUUID();
    dispatch({ type: 'beginProductResults', token: expectedResultsRequest });
    const result = await command.run(signal => sendAssistant(input, signal));
    const lastMessage = input.messages.at(-1);
    if (result && lastMessage) dispatch({ type: 'assistant', result, userMessage: lastMessage.content, expectedRevision, expectedResultsRequest });
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
      const failure = requestFailure(error);
      if (active.isCurrent()) setCollection({ key, result: { status: 'error', data: null,
        error: failure.message, failure } });
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
      const failure = requestFailure(error);
      if (active.isCurrent() && currentKey.current === key) setCollection({ key, result: { status: 'error', data: before,
        error: failure.message, failure } });
    } finally { if (active.isCurrent()) pageBusy.current = false; }
  };
  const reload = () => setRefresh(value => value + 1);
  return { result, more, reload, retry: () => result.status === 'error' && result.data ? void more() : reload(),
    loadedCount: result.data?.items.length ?? 0 };
}

export function useSellerFollowup() {
  const { state, dispatch } = useWorkspace();
  const draft = useCommand<PreparedFollowup>(), alternatives = useCommand<Alternatives>();
  const latest = useRef(state), busy = useRef<symbol | null>(null);
  latest.current = state;
  const [pageMode, setPageMode] = useState(false);
  useEffect(() => { busy.current = null; draft.cancel(); alternatives.cancel(); }, [state.revision, draft.cancel, alternatives.cancel]);
  const prepare = async (selection: Selection) => {
    const expectedRevision = state.revision;
    const result = await draft.run(signal => prepareFollowup(selection, state.position, signal));
    if (result) dispatch({ type: 'prepared', result, expectedRevision });
    return result;
  };
  const report = async (selection: Selection, outcome: FollowupOutcome, source: 'simulated' | 'user_report' = 'simulated') => {
    if (busy.current) return null;
    const token = Symbol(); busy.current = token; setPageMode(false);
    const expectedRevision = state.revision;
    const search: AlternativeSearch = { selection: { ...selection }, outcome, source,
      filters: { ...state.filters }, position: state.position ? { ...state.position } : null };
    try {
      const result = await alternatives.run(signal => findAlternatives(selection, outcome, search.filters, search.position, signal, 0, source));
      if (result) dispatch({ type: 'alternatives', result, expectedRevision, search });
      return result;
    } finally { if (busy.current === token) busy.current = null; }
  };
  const more = async (selection: Selection) => {
    const saved = state.followups[selection.offer_id], base = saved?.alternatives, search = saved?.alternativesSearch;
    if (busy.current || !base?.alternatives.has_more || !search ||
      state.selectedOffer?.offer_id !== selection.offer_id ||
      alternativeSearchKey(search) !== alternativeSearchKey({ ...search, selection, filters: state.filters, position: state.position })) return null;
    const token = Symbol(); busy.current = token; setPageMode(true);
    const expectedRevision = state.revision;
    try {
      const result = await alternatives.run(async signal => appendAlternatives(base, await findAlternatives(search.selection,
        search.outcome, search.filters, search.position, signal, base.alternatives.offset + base.alternatives.limit, search.source)));
      if (!result || latest.current.revision !== expectedRevision || latest.current.selectedOffer?.offer_id !== selection.offer_id ||
        latest.current.followups[selection.offer_id]?.alternatives !== base) return null;
      dispatch({ type: 'alternatives', result, expectedRevision, search, base });
      return result;
    } finally { if (busy.current === token) busy.current = null; }
  };
  // Completed drafts/outcomes live in Workspace, keyed by offer_id, across screens.
  return { draft: draft.result, alternatives: alternatives.result, prepare, report, more, pageMode,
    cancel: () => { busy.current = null; draft.cancel(); alternatives.cancel(); } };
}
