import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssistantTurn, RequestFailure, RequestState } from '../../base/domain/contracts.ts';
import { assistantStatus } from '../../base/domain/client.ts';
import { conversationInput } from '../../base/state/conversation.ts';
import { useAssistant, useCommand } from '../../base/state/hooks.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Badge, Button, ErrorCard } from '../../base/ui/primitives.tsx';
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
  const { state, dispatch } = useWorkspace();
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
    {outcome.kind !== 'question' && state.productResults?.source === 'assistant' &&
      <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'results' })}>دیدن محصولات این پاسخ</Button>}
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
  return <section className={`ua-decide${start ? ' ua-decide--start' : ''}`} aria-labelledby={start ? 'ua-start-title' : 'ua-decide-title'}>
    {!start && <header className="ua-decide-head">
      <h2 id="ua-decide-title">نیازتان را بگویید</h2>
      <p>نیاز و کاربردتان را بنویسید؛ دستیار در صورت نیاز پرسش بعدی را همین‌جا می‌پرسد.</p>
    </header>}


    <div className={`ua-status ua-status--${tone}`}>
      <p className="ua-status-text" role="status" aria-live="polite"><strong>وضعیت دستیار: </strong>
        {availability.phase === 'ready'
          ? <>آمادهٔ بررسی نیاز است · درخواست مجاز باقی‌مانده: <bdi>{numbers.format(availability.remaining)}</bdi></>
          : availability.phase === 'checking' ? 'در حال بررسی…'
          : availability.phase === 'unknown'
            ? 'نامشخص است. ارسال صریح نیاز همچنان ممکن است؛ سرویس در هر حال سقف خودش را اعمال می‌کند.'
            : blockedCopy[availability.reason]}</p>
      {(availability.phase === 'unknown' || availability.phase === 'blocked') && <Button tone="secondary" className="ua-status-retry"
        onClick={() => void refreshStatus(true)}><RefreshIcon />بررسی مجدد وضعیت</Button>}
    </div>

    <form className="ua-decide-form" onSubmit={submit} aria-busy={pending}>
      <label htmlFor="ua-need">نیاز و کاربرد موردنظر</label>
      <textarea ref={textarea} id="ua-need" value={draft} maxLength={1000} rows={3} aria-describedby="ua-need-help"
        onChange={event => { setDraft(event.target.value); if (localError) setLocalError(null); }}
        placeholder="مثلاً گوشی برای عکاسی می‌خواهم؛ سقف بودجه‌ام ۱۰ میلیون تومان است." />
      <div className="ua-decide-actions">
        <Button type="submit" disabled={pending || !canSend || !draft.trim()}><SparklesIcon />بررسی نیاز</Button>
    <div className="ua-voice-entry">
      <button
        type="button"
        className="uv-voice-launcher-btn"
        aria-label="گفت‌وگوی صوتی با دستیار هوشمند"
        onClick={() => setVoiceModalOpen(true)}
        title="گفت‌وگوی صوتی با دستیار خرید"
      >
        <span className="uv-voice-launcher-mic" aria-hidden="true">🎙️</span>
        <span>گفت‌وگوی صوتی با دستیار هوشمند</span>
        <span className="uv-voice-launcher-badge" aria-hidden="true">صوتی</span>
      </button>
    </div>
        {start && <><Button tone="secondary" type="button" onClick={() => setFiltersOpen(true)}>بودجه و شرایط</Button>
          <Button tone="ghost" type="button" onClick={() => { dispatch({ type: 'navigate', screen: 'decide' }); requestAnimationFrame(() => textarea.current?.focus()); }}>کمک برای انتخاب</Button></>}
        {pending && <Button tone="secondary" type="button" onClick={cancel}><StopCircleIcon />لغو درخواست</Button>}
        {!pending && (state.history.length > 0 || need !== null) && <Button tone="secondary" type="button" onClick={resetConversation}>
          <RestartIcon />گفت‌وگوی تازه</Button>}
      </div>
      {pending && <p className="ua-pending-text" role="status">در حال ارسال به دستیار… پاسخ پس از دریافت، همین‌جا نمایش داده می‌شود.</p>}
      <p id="ua-need-help" className="ub-meta">فقط با زدن «بررسی نیاز» درخواست فرستاده می‌شود؛ نوشتن متن یا تغییر بودجه به‌تنهایی درخواستی نمی‌فرستد.
        اطلاعات تماس یا شخصی ننویسید. تغییر عبارت جست‌وجو یا شرایط، ارسال در حال انجام را متوقف می‌کند.</p>
    </form>

    {localError && <ErrorCard message={localError} />}
    {assistant.result.status === 'error' && <ErrorCard message={assistant.result.error} failure={assistant.result.failure}
      onRetry={canSend && draft.trim() ? () => void send() : undefined} />}
    {notice && <p className="ua-notice" role="status">{notice}</p>}

    {lastTurn && <Outcome turn={lastTurn} />}

    {!start && <section className="ua-conditions" aria-labelledby="ua-conditions-title">
      <div className="ua-section-head">
        <h3 id="ua-conditions-title">شرایط جست‌وجو</h3>
        <Button tone="secondary" onClick={() => setFiltersOpen(true)} disabled={pending}>بودجه و شرایط</Button>
      </div>
      <p className="ua-active-budget">بودجهٔ فعال در ارسال بعدی: <bdi>{activeBudgetLabel(state.filters.maxPrice)}</bdi></p>
      {need ? <>
        <dl className="ua-need-list">{needSummary(need).map(row => <div className="ua-need-row" key={row.label}>
          <dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
        {need.max_price_toman !== state.filters.maxPrice && <p className="ua-override-note">بودجهٔ فعال با بودجهٔ ثبت‌شده در گفت‌وگو
          (<bdi>{activeBudgetLabel(need.max_price_toman)}</bdi>) تفاوت دارد؛ در ارسال بعدی بودجهٔ فعال فرستاده می‌شود.</p>}
        {need.pending_requirements.length > 0 && <div className="ua-pending" aria-labelledby="ua-pending-title">
          <h4 id="ua-pending-title">درخواست‌های اعمال‌نشده</h4>
          <ul className="ua-pending-list">{need.pending_requirements.map(requirement => <li key={requirement.key}>
            <span className="ua-pending-source" dir="auto">{requirement.source_text}</span>
            <span className="ua-pending-labels"><Badge tone="warning">هنوز اعمال نشده</Badge>
              {pendingRequirementBadge(requirement.status) && <Badge>{pendingRequirementBadge(requirement.status)}</Badge>}</span>
          </li>)}</ul>
          <p className="ub-meta">این خواسته‌ها در جست‌وجو و آفرهای فعلی اعمال نشده‌اند.</p>
        </div>}
        <p className="ub-meta">این شرایط از آخرین پاسخ دستیار ثبت شده‌اند؛ تغییر بودجه، تاریخچهٔ گفت‌وگو را پاک نمی‌کند.</p>
      </> : <p className="ub-meta">هنوز شرطی از گفت‌وگو ثبت نشده است؛ بودجه و شرایط فعال در اولین ارسال لحاظ می‌شوند.</p>}
    </section>}

    {state.history.length > 0 && <details className="ua-history">
      <summary>تاریخچهٔ گفت‌وگو ({numbers.format(state.history.length)} پیام)</summary>
      <ol className="ua-history-list">{state.history.map((message, index) => <li key={`${index}-${message.role}`}
        className={`ua-message ua-message--${message.role}`}>
        <strong>{message.role === 'user' ? 'شما' : 'دستیار'}</strong>
        <p dir="auto">{message.content}</p>
      </li>)}</ol>
    </details>}

    <p className="ub-meta">پاسخ‌ها به کاتالوگ ثبت‌شده محدودند؛ موجودی و تناسب تأیید نشده است. سقف و وضعیت سرویس، جدا از متن گفت‌وگو، توسط سرویس اعمال می‌شوند.</p>
    {filtersOpen && <FiltersDialog onClose={() => setFiltersOpen(false)} />}
    {voiceModalOpen && <VoiceAssistantModal
      disabled={pending || !canSend}
      onClose={() => setVoiceModalOpen(false)}
      onSubmitPrompt={send}
      currentAssistantResponse={modalAssistantResponse}
    />}
  </section>;

}
