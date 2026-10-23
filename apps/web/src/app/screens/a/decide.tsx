import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssistantTurn, RequestFailure, RequestState } from '../../base/domain/contracts.ts';
import { assistantStatus } from '../../base/domain/client.ts';
import { conversationInput } from '../../base/state/conversation.ts';
import { useAssistant, useCommand, useCatalogue } from '../../base/state/hooks.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Badge, Button, ErrorCard } from '../../base/ui/primitives.tsx';
import { LocationDialog } from '../../base/ui/LocationDialog.tsx';
import { formatMoney } from '../../base/domain/presentation.ts';
import { catalogueSearchForWorkspace } from '../../base/state/model.ts';
import { useGuidance } from './guidance.ts';
import { ChatProducts } from './ChatProducts.tsx';
import { FiltersDialog } from '../../base/ui/FiltersDialog.tsx';
import { RefreshIcon, RestartIcon, SparklesIcon, StopCircleIcon } from '../../../presentation/icons-motion/icons.tsx';
import { activeBudgetLabel, assistantOutcome, needSummary, pendingRequirementBadge } from './presentation.ts';
import { assistantBlockReason } from '../../base/domain/errors.ts';
import { VoiceAssistantModal, VoiceSpeakerButton } from '../../voice/index.ts';


const numbers = new Intl.NumberFormat('fa-IR');
type AssistantStatus = Awaited<ReturnType<typeof assistantStatus>>;
type Availability =
  | { phase: 'checking' }
  | { phase: 'ready'; remaining: number }
  | { phase: 'blocked'; reason: 'disabled' | 'missing_key' | 'invalid_config' | 'attempt_limit' }
  | { phase: 'unknown' };

function dataAvailability(data: AssistantStatus): Availability {
  if (data.ready) {
    return data.remainingCalls > 0 ? { phase: 'ready', remaining: data.remainingCalls } : { phase: 'blocked', reason: 'attempt_limit' };
  }
  if (data.reason === 'disabled' || data.reason === 'missing_key' || data.reason === 'invalid_config' || data.reason === 'attempt_limit') {
    return { phase: 'blocked', reason: data.reason };
  }
  return { phase: 'unknown' };
}

function availabilityOf(result: RequestState<AssistantStatus>): Availability {
  if (result.status === 'success') return dataAvailability(result.data);
  // Keep the last valid server state visible while a refresh is in flight.
  if (result.status === 'loading' && result.data) return dataAvailability(result.data);
  if (result.status === 'error') return { phase: 'unknown' };
  return { phase: 'checking' };
}

const blockedCopy: Record<'disabled' | 'missing_key' | 'invalid_config' | 'attempt_limit', string> = {
  disabled: 'دستیار در این اجرا غیرفعال است؛ ارسال نیاز در این وضعیت ممکن نیست.',
  missing_key: 'کلید سرویس دستیار تنظیم نشده است؛ ارسال نیاز در این وضعیت ممکن نیست.',
  invalid_config: 'تنظیمات سرویس دستیار معتبر نیست؛ ارسال نیاز در این وضعیت ممکن نیست.',
  attempt_limit: 'سقف درخواست‌های دستیار مصرف شده است؛ ارسال نیاز در این وضعیت ممکن نیست.',
};

function Outcome({ turn }: { turn: AssistantTurn }) {
  const outcome = assistantOutcome(turn);
  const response = useRef<HTMLElement>(null);
  useEffect(() => {
    response.current?.focus({ preventScroll: true });
    response.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [turn.request_id]);
  const speechText = outcome.kind === 'question'
    ? outcome.question
    : outcome.summary
      ? `${outcome.title}؛ ${outcome.summary}`
      : outcome.title;

  return <section ref={response} tabIndex={-1} className={`ua-outcome ua-outcome--${outcome.kind}`} aria-labelledby="ua-outcome-title" aria-live="polite">
    <p className="ua-eyebrow">{outcome.kind === 'question' ? 'پرسش دستیار' : outcome.kind === 'results' ? 'خلاصهٔ نتیجه' : 'بدون نتیجه'}</p>
    <h3 id="ua-outcome-title">{outcome.title}</h3>
    {outcome.kind === 'question' && <p className="ua-question">{outcome.question}</p>}
    {outcome.kind === 'results' && <p>این پاسخ <bdi>{numbers.format(outcome.count)}</bdi> محصول از کاتالوگ ثبت‌شده را شامل می‌شود.
      {outcome.query && <> عبارت پاسخ: <bdi>{outcome.query}</bdi>.</>}</p>}
    {outcome.kind === 'empty' && <p>برای این درخواست، محصولی در پاسخ ثبت‌شده برنگشت.{outcome.query && <> عبارت پاسخ: <bdi>{outcome.query}</bdi>.</>}</p>}
    {outcome.summary && <p className="ua-summary">{outcome.summary}</p>}
    <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
      <VoiceSpeakerButton text={speechText} />
    </div>
    {outcome.limitations.length > 0 && <div className="ua-limitations">
      <h4>محدودیت‌های پاسخ</h4>
      <ul>{outcome.limitations.map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}</ul>
    </div>}
    <p className="ub-meta">{outcome.kind === 'question'
      ? 'این پرسش فقط برای روشن‌شدن نیاز است؛ تا ارسال پاسخ شما شرط تازه‌ای اعمال نمی‌شود.'
      : 'این خلاصه جای تأیید موجودی، قیمت یا تناسب کالا با نیاز شما را نمی‌گیرد.'}</p>

  </section>;
}

export function DecideScreen({ start = false }: { start?: boolean }) {
  const { state, dispatch } = useWorkspace();
  const assistant = useAssistant();
  const status = useCommand<AssistantStatus>();
  const draft = state.needDraft;
  const setDraft = (value: string) => dispatch({ type: 'needDraft', value });
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const localCatalogue = useCatalogue();
  const guidanceQuery = state.needState?.topic_query ?? null;
  const guidance = useGuidance(guidanceQuery);
  const [blockedFailure, setBlockedFailure] = useState<RequestFailure | null>(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const previousScreen = useRef(state.screen);
  const awaiting = useRef<{ text: string; previousTurnId: string | null } | null>(null);

  useEffect(() => {
    if (previousScreen.current === 'decide' && state.screen === 'home') {
      assistant.cancel();
      awaiting.current = null;
    }
    previousScreen.current = state.screen;
  }, [state.screen, assistant.cancel]);


  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Entry-time availability is a GET. The turn POST happens only in send().
  useEffect(() => { void status.run(signal => assistantStatus(signal)); }, [status.run]);

  const pending = assistant.result.status === 'loading';
  const turnFailure = assistant.result.status === 'error' ? assistant.result.failure : null;
  const latestFailure = useRef(turnFailure);
  latestFailure.current = turnFailure;
  const turnBlock = assistantBlockReason(turnFailure);
  useEffect(() => { if (turnBlock && turnFailure) setBlockedFailure(turnFailure); }, [turnBlock, turnFailure]);
  const block = turnBlock ? turnFailure : blockedFailure;
  const latestBlock = useRef(block);
  latestBlock.current = block;
  const blockReason = assistantBlockReason(block);
  const availability: Availability = blockReason ? { phase: 'blocked', reason: blockReason } : availabilityOf(status.result);
  const canSend = availability.phase === 'ready' || availability.phase === 'unknown';
  const need = state.needState;
  const lastTurn = state.lastTurn;

  // Clear the draft only when the reducer actually committed this response.
  useEffect(() => {
    const current = awaiting.current;
    const result = assistant.result;
    if (!current || result.status !== 'success' || !result.data) return;
    if (state.lastTurn?.request_id !== result.data.request_id) return;
    if (result.data.request_id === current.previousTurnId) return;
    awaiting.current = null;
    if (state.needDraft.trim() === current.text) dispatch({ type: 'needDraft', value: '' });
  }, [assistant.result, state.lastTurn, state.needDraft, dispatch]);

  const refreshStatus = async (explicit = false) => {
    const failed = latestBlock.current;
    const result = await status.run(signal => assistantStatus(signal));
    // A post-turn background GET must not erase a definitive failure from that turn.
    // Only an explicit fresh ready check may release the same blocked request.
    if (explicit && result && dataAvailability(result).phase === 'ready' && failed &&
      latestBlock.current === failed && assistantBlockReason(failed)) {
      setBlockedFailure(null);
      if (latestFailure.current === failed) assistant.cancel();
    }
  };

  const send = async (value = draft): Promise<string | null> => {
    const text = value.trim();
    if (!text || pending || sending.current || !canSend) return null;
    let input;
    try { input = conversationInput(state, text); }
    catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'متن نیاز قابل ارسال نیست.');
      return null;
    }
    awaiting.current = { text, previousTurnId: state.lastTurn?.request_id ?? null };
    setLocalError(null);
    setNotice('');
    if (state.screen === 'home') dispatch({ type: 'navigate', screen: 'decide' });
    sending.current = true;
    let turn;
    try { turn = await assistant.submit(input); }
    finally { sending.current = false; }
    if (mounted.current) void refreshStatus();
    if (!turn) return null;
    const outcome = assistantOutcome(turn);
    return outcome.kind === 'question' ? outcome.question ?? null : [outcome.title, outcome.summary].filter(Boolean).join('. ');
  };

  const cancel = () => {
    assistant.cancel();
    setNotice('درخواست از این مرورگر متوقف شد؛ توقف نمایش پاسخ، پایان پردازش یا مصرف سرویس را تضمین نمی‌کند.');
    textarea.current?.focus();
    if (mounted.current) refreshStatus();
  };

  const resetConversation = () => {
    if (pending) return;
    assistant.cancel();
    awaiting.current = null;
    setDraft('');
    setLocalError(null);
    setNotice('');
    dispatch({ type: 'newConversation' });
    textarea.current?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  const modalAssistantResponse = lastTurn ? {
    title: assistantOutcome(lastTurn).title,
    text: assistantOutcome(lastTurn).kind === 'question'
      ? assistantOutcome(lastTurn).question!
      : [assistantOutcome(lastTurn).title, assistantOutcome(lastTurn).summary].filter(Boolean).join('. '),
    summary: assistantOutcome(lastTurn).summary ?? undefined,
    hasResults: assistantOutcome(lastTurn).kind === 'results',
    productCount: assistantOutcome(lastTurn).count ?? undefined,
    onViewResults: () => dispatch({ type: 'navigate', screen: 'results' }),
  } : null;

  const tone = availability.phase === 'ready' ? 'ready' : availability.phase === 'unknown' ? 'unknown'
    : availability.phase === 'checking' ? 'checking' : 'blocked';
  const hasHistory = state.history.length > 0;
  const displayedHistory = lastTurn ? state.history.slice(0, -1) : state.history;
  const continueScreen = state.visitPlan ? 'trip' : state.selectedOffer ? 'contact' : state.product ? 'stores' : state.productResults ? 'results' : null;
  const localSearch = async (event: FormEvent) => {
    event.preventDefault();
    const page = await localCatalogue.search(catalogueSearchForWorkspace(state));
    if (page) dispatch({ type: 'navigate', screen: 'results' });
  };
  return <section className={`ua-decide uc-chat${hasHistory ? ' uc-chat--active' : ''}`} aria-labelledby="ua-decide-title">
    <header className="uc-chat-head"><div><SparklesIcon size={22} /><div><h2 id="ua-decide-title">دستیار خرید حضوری</h2><p>از انتخاب کالا تا پیدا کردن فروشگاه</p></div></div>
      {hasHistory && <Button tone="ghost" disabled={pending} onClick={resetConversation} aria-label="گفت‌وگوی تازه"><RestartIcon size={18} /></Button>}
    </header>
    <div className={`ua-status ua-status--${tone} uc-service`}>
      <p role="status" aria-live="polite">{availability.phase === 'ready' ? <><span className="uc-status-dot" />آمادهٔ گفت‌وگو · {numbers.format(availability.remaining)} درخواست مجاز باقی است</>
        : availability.phase === 'checking' ? 'در حال بررسی دستیار…'
        : availability.phase === 'unknown' ? 'وضعیت سرویس نامشخص است؛ ارسال صریح ممکن است.' : blockedCopy[availability.reason]}</p>
      {(availability.phase === 'unknown' || availability.phase === 'blocked') && <Button tone="ghost" onClick={() => void refreshStatus(true)} aria-label="بررسی مجدد وضعیت"><RefreshIcon size={17} /></Button>}
    </div>
    <div className="uc-stream">
      {!hasHistory && <div className="uc-greeting"><p>سلام، خوش اومدی!</p><h3>برای چه خریدی<br /><em>کمکت کنم؟</em></h3><p>بگو چه می‌خواهی و چه چیزی برایت مهم است؛ گزینه‌های ثبت‌شده را با هم بررسی می‌کنیم.</p></div>}
      {displayedHistory.length > 0 && <ol className="uc-messages" aria-label="تاریخچهٔ گفت‌وگو">{displayedHistory.map((message, index) =>
        <li className={`uc-message uc-message--${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === 'user' ? 'شما' : 'دستیار'}</strong><p dir="auto">{message.content}</p></li>)}</ol>}
      {lastTurn && <Outcome turn={lastTurn} />}
      {pending && <div className="uc-thinking" role="status"><SparklesIcon size={18} /><span>در حال بررسی نیازت…</span><Button tone="ghost" onClick={cancel}><StopCircleIcon size={16} />لغو</Button></div>}
      {localError && <ErrorCard message={localError} />}
      {assistant.result.status === 'error' && <ErrorCard message={assistant.result.error} failure={assistant.result.failure} onRetry={canSend && draft.trim() ? () => void send() : undefined} />}
      {notice && <p className="ua-notice" role="status">{notice}</p>}
      {!!need?.pending_requirements.length && <p className="uc-pending-warning" role="status">{numbers.format(need.pending_requirements.length)} خواسته هنوز اعمال نشده است؛ جزئیات در شرایط گفت‌وگو.</p>}
      <ChatProducts />
      {hasHistory && <div className="uc-followup-chips"><p>قدم بعدی را با هم انتخاب کنیم</p><div>
        {guidance.data?.brands.filter(brand => !need?.topic_query?.includes(brand)).slice(0, 3).map(brand =>
          <Button key={brand} tone="secondary" disabled={pending || !canSend} onClick={() => void send(`${need?.topic_query ?? ''} ${brand}`)}>{brand} را بررسی کن</Button>)}
        <Button tone="secondary" disabled={pending} onClick={() => setFiltersOpen(true)}>بودجه‌ام را تنظیم کنم</Button>
        {!state.position && <Button tone="secondary" disabled={pending} onClick={() => setLocationOpen(true)}>فروشگاه نزدیک من</Button>}
      </div></div>}

      {!hasHistory && <div className="uc-starters"><p>برای شروع، یکی از دسته‌های کاتالوگ را انتخاب کن</p>
        <div>{guidance.data?.starters.map(category => <Button key={category} tone="secondary" disabled={pending || !canSend} onClick={() => { setDraft(category); void send(category); }}><SparklesIcon size={15} />{category}</Button>)}</div>
        {guidance.error && <Button tone="ghost" onClick={guidance.retry}>تلاش مجدد برای دریافت پیشنهادها</Button>}</div>}
      {lastTurn?.question_code === 'budget' && guidance.data?.budget_samples.length ? <div className="uc-budget-choices"><p>سقف بودجه‌ات چقدر باشد؟</p><div>{guidance.data.budget_samples.map(value =>
        <Button key={value} tone="secondary" disabled={pending || !canSend} onClick={() => void send(`بودجه من تا ${value} تومان است`)}>تا {formatMoney(value)}</Button>)}</div>
        <small>نمونهٔ قیمت‌های تاریخی حداکثر ۴۰ محصول؛ بودجهٔ دلخواهت را هم می‌توانی بنویسی.</small></div> : null}

      {start && continueScreen && <div className="uc-resume"><strong>خرید فعلی‌ات محفوظ است</strong><p>{state.product?.persian_title ?? state.needState?.topic_query}</p>
        <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: continueScreen })}>ادامهٔ خرید</Button></div>}
      <p id="ua-need-help" className="ub-sr-only">ارسال فقط با انتخاب شماست؛ موقعیت به مدل فرستاده نمی‌شود. اطلاعات شخصی ننویسید.</p>
      {need && <details className="uc-details"><summary>شرایط ثبت‌شدهٔ گفت‌وگو</summary><dl className="ua-need-list">{needSummary(need).map(row => <div className="ua-need-row" key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
        {need.max_price_toman !== state.filters.maxPrice && <p>بودجهٔ فعال در ارسال بعدی: {activeBudgetLabel(state.filters.maxPrice)}</p>}
        {need.pending_requirements.length > 0 && <><h4>درخواست‌های اعمال‌نشده</h4><ul>{need.pending_requirements.map(requirement => <li key={requirement.key}>{requirement.source_text} · <Badge tone="warning">هنوز اعمال نشده</Badge>{pendingRequirementBadge(requirement.status) && <Badge>{pendingRequirementBadge(requirement.status)}</Badge>}</li>)}</ul></>}
      </details>}
      {(availability.phase === 'blocked' || assistant.result.status === 'error') && <details className="uc-details uc-local"><summary>ادامه با کاتالوگ، بدون مدل</summary><p>این مسیر جست‌وجوی مستقیم است و پاسخ هوش مصنوعی تولید نمی‌کند.</p>
        <form onSubmit={event => void localSearch(event)}><label htmlFor="uc-local-query">نام کالا</label><input id="uc-local-query" maxLength={120} value={state.query} onChange={event => dispatch({ type: 'query', value: event.target.value })} placeholder="مثلاً گوشی سامسونگ" />
          <Button tone="secondary" type="submit" disabled={!state.query.trim() || localCatalogue.result.status === 'loading'}>جست‌وجوی کاتالوگ</Button></form>
        {localCatalogue.result.status === 'loading' && <p role="status">در حال جست‌وجوی کاتالوگ…</p>}
        {localCatalogue.result.status === 'error' && <ErrorCard message={localCatalogue.result.error} failure={localCatalogue.result.failure} />}
      </details>}
    </div>
    <div className="uc-composer">
      <form className="ua-decide-form uc-compose-form" onSubmit={submit} aria-busy={pending}>
        <label className="ub-sr-only" htmlFor="ua-need">نیاز و کاربرد موردنظر</label>
        <textarea ref={textarea} id="ua-need" value={draft} maxLength={1000} rows={3} aria-describedby="ua-need-help"
          onChange={event => { setDraft(event.target.value); if (localError) setLocalError(null); }}
          placeholder={hasHistory ? 'پاسخت را بنویس یا نیازت را دقیق‌تر کن…' : 'مثلاً یک گوشی برای استفادهٔ روزمره می‌خواهم…'} />
        <div className="uc-send-row uc-icon-actions">
          <Button type="submit" aria-label={hasHistory ? 'ارسال پاسخ' : 'شروع گفت‌وگو'} title="ارسال پیام" disabled={pending || !canSend || !draft.trim()}>
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7Z"/><path d="m10 14 5-5"/></svg>
          </Button>
          <Button tone="ghost" type="button" disabled={pending || !canSend} onClick={() => setVoiceModalOpen(true)} aria-label="گفت‌وگوی صوتی با دستیار هوشمند" title="گفت‌وگوی صوتی">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>
          </Button>
          <Button tone="ghost" type="button" disabled={pending} onClick={() => setFiltersOpen(true)} aria-label="بودجه و شرایط" title="بودجه و شرایط">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7h18M3 17h18M8 4v6m8 4v6"/></svg>
          </Button>
          <Button tone="ghost" type="button" disabled={pending} onClick={() => setLocationOpen(true)} aria-label="انتخاب موقعیت در گفت‌وگو" title="موقعیت">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>
          </Button>
        </div>
      </form>

    </div>
    {filtersOpen && <FiltersDialog onClose={() => setFiltersOpen(false)} />}
    {locationOpen && <LocationDialog onClose={() => setLocationOpen(false)} />}
    {voiceModalOpen && <VoiceAssistantModal disabled={pending || !canSend} onClose={() => setVoiceModalOpen(false)} onSubmitPrompt={send} currentAssistantResponse={modalAssistantResponse} />}
  </section>;
}
