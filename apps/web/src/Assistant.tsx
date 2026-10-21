import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { parseAssistantResult, fetchAssistantStatus, type AssistantMessage, type ProductPage } from './api';

type Props = {
  budget: string | null;
  contextQuery: string | null;
  onContext: (query: string | null, version?: number) => void;
  cancelVersion: number;
  onStart: () => number | null;
  onBudget: (budget: string | null, version: number) => void;
  onResults: (page: ProductPage, query: string, budget: string | null, version: number) => void;
};
const numbers = new Intl.NumberFormat('fa-IR');
const failures: Record<string, string> = {
  attempt_limit: 'سقف درخواست‌های تنظیم‌شدهٔ دستیار تمام شده است. جست‌وجوی مستقیم همچنان کار می‌کند.',
  busy: 'درخواست دیگری هنوز در حال پردازش است؛ کمی بعد دوباره اقدام کنید.',
  duplicate_request: 'این درخواست قبلاً ارسال شده است؛ برای جلوگیری از مصرف تکراری دوباره اجرا نشد.',
  provider_auth: 'دسترسی سرویس دستیار برقرار نیست. جست‌وجوی مستقیم همچنان در دسترس است.',
  provider_timeout: 'پاسخ دستیار به‌موقع نرسید؛ ممکن است سرویس مصرف ثبت کرده باشد.',
  incomplete_output: 'پاسخ دستیار کامل نشد. می‌توانید درخواست را کوتاه‌تر کنید یا مستقیم جست‌وجو کنید.',
  invalid_output: 'برداشت دستیار قابل استفاده نبود؛ اطلاعات حدسی نمایش داده نشد.',
};

export function Assistant({ budget, contextQuery, onContext, cancelVersion, onStart, onBudget, onResults }: Props) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [remaining, setRemaining] = useState(0);
  const [unavailableReason, setUnavailableReason] = useState('');
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAssistantStatus(controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setStatus(result.ready ? 'ready' : 'unavailable');
        setRemaining(result.remaining_calls);
        setUnavailableReason(result.reason);
        setNotice(result.reason === 'attempt_limit' ? failures.attempt_limit! : result.ready ? '' : 'دستیار در این اجرا فعال نیست؛ از جست‌وجوی مستقیم استفاده کنید.');
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setStatus('unavailable');
        setNotice('وضعیت دستیار در دسترس نیست؛ جست‌وجوی مستقیم را امتحان کنید.');
      }
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, []);

  useEffect(() => {
    active.current?.abort();
    setPending(false);
    setHistory([]);
    setNotice('');
    setError('');
  }, [cancelVersion]);

  function cancel() {
    active.current?.abort();
    setPending(false);
    setNotice('درخواست لغو شد؛ توقف نمایش پاسخ، حذف مصرف احتمالی سرویس را تضمین نمی‌کند.');
    const controller = new AbortController();
    void fetchAssistantStatus(controller.signal).then(result => {
      setRemaining(result.remaining_calls);
      setUnavailableReason(result.reason);
      setStatus(result.ready ? 'ready' : 'unavailable');
    }).catch(() => { /* The next request still checks the persistent server-side cap. */ });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || pending || status !== 'ready') return;
    // Retain complete recent pairs; the explicit topic survives this rolling window.
    let recent = history.slice(-4);
    while (recent.length && recent.reduce((size, m) => size + m.content.length, text.length) > 3000) {
      recent = recent.slice(2);
    }
    const messages: AssistantMessage[] = [...recent, { role: 'user', content: text }];
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const version = onStart();
    if (version === null) return;
    const requestId = crypto.randomUUID();
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/assistant/turn', { method: 'POST', signal: controller.signal, cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, messages, max_price_toman: budget, context_query: contextQuery }) });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code : '';
        throw new Error(failures[code] || 'ارتباط با دستیار کامل نشد؛ جست‌وجوی مستقیم را امتحان کنید.');
      }
      const result = parseAssistantResult(body, requestId);
      if (controller.signal.aborted) return;
      setInput('');
      if (result.status === 'needs_input' && result.question) {
        onBudget(result.max_price_toman, version);
        if (result.query) onContext(result.query, version);
        setHistory([...messages, { role: 'assistant', content: result.question }]);
      } else if (result.products && result.query) {
        const summary = result.status === 'no_evidence'
          ? `برای «${result.query}» با بودجهٔ انتخابی نتیجه‌ای ثبت نشده؛ عبارت یا بودجه را تغییر دهید.`
          : `نتایج کاتالوگ برای «${result.query}» در ادامه آمده‌اند. برای بررسی تناسب با کاربردتان، مشخصات کالاها را مقایسه کنید.`;
        setHistory([...messages, { role: 'assistant', content: summary }]);
        onResults(result.products, result.query, result.max_price_toman, version);
      }
    } catch (failure: unknown) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'دریافت پاسخ دستیار ناموفق بود.');
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        void fetchAssistantStatus(controller.signal).then(result => {
          if (!controller.signal.aborted) {
            setRemaining(result.remaining_calls);
            setUnavailableReason(result.reason);
            setStatus(result.ready ? 'ready' : 'unavailable');
          }
        }).catch(() => { /* Keep the visible result; a new turn still has a server-side cap. */ });
      }
    }
  }

  return <section className="assistant-panel" aria-labelledby="assistant-title">
    <h2 id="assistant-title">برای انتخاب کالا کمک می‌خواهید؟</h2>
    <p className="caption">نیازتان را بنویسید؛ اگر اطلاعات کافی نباشد سؤال می‌پرسیم. نتیجه‌ها از کاتالوگ ثبت‌شده می‌آیند و موجودی زنده نیستند.</p>
    {contextQuery && <p className="assistant-notice">موضوع فعلی: «{contextQuery}». می‌توانید بودجه را تغییر دهید یا کالای دیگری بخواهید.</p>}
    {history.length > 0 && <ol className="assistant-history" aria-label="گفت‌وگوی انتخاب کالا" aria-live="polite">
      {history.map((message, index) => <li key={index} className={`message-${message.role}`}>
        <strong>{message.role === 'user' ? 'شما: ' : 'دستیار: '}</strong>{message.content}
      </li>)}
    </ol>}
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="shopping-need">نیاز و کاربرد موردنظر</label>
      <textarea id="shopping-need" value={input} maxLength={1000} rows={3} disabled={pending}
        onChange={event => setInput(event.target.value)} placeholder="مثلاً گوشی برای عکاسی می‌خواهم؛ بودجه‌ام ده میلیون تومان است."
        aria-describedby="assistant-help" />
      <div className="assistant-actions">
        <button type="submit" disabled={pending || status !== 'ready' || !input.trim()}>بررسی نیاز</button>
        {pending && <button type="button" className="secondary" onClick={cancel}>لغو درخواست</button>}
        {(history.length > 0 || contextQuery !== null) && !pending && <button type="button" className="secondary" onClick={() => {
          setHistory([]); setInput(''); setError(''); setNotice('موضوع گفت‌وگو پاک شد؛ بودجهٔ کادر بالا حفظ شده است.'); onContext(null);
        }}>گفت‌وگوی تازه</button>}
      </div>
    </form>
    <p id="assistant-help" className="caption">موضوع فعلی و چند پیام اخیر تا بازبودن این صفحه حفظ می‌شوند. فقط هنگام زدن «بررسی نیاز» درخواست ارسال می‌شود. بودجه را می‌توانید در کادر بالا هم تغییر دهید؛ اطلاعات تماس و شخصی ننویسید.</p>
    {status === 'checking' && <p role="status">در حال بررسی دسترسی دستیار…</p>}
    {status === 'ready' && <p className="caption">درخواست باقی‌مانده در سقف تنظیم‌شده: {numbers.format(remaining)}</p>}
    {status === 'unavailable' && <p className="caption">{unavailableReason === 'attempt_limit'
      ? failures.attempt_limit : 'دستیار فعلاً قابل استفاده نیست؛ جست‌وجوی مستقیم در دسترس است.'}</p>}
    {pending && <p role="status">در حال بررسی نیاز؛ لطفاً صبر کنید…</p>}
    {notice && <p className="assistant-notice" role="status">{notice}</p>}
    {error && <div role="alert" className="error-text"><p>{error}</p>
      <p className="caption">ارسال دوباره یک درخواست تازه است و ممکن است اعتبار مصرف کند.</p></div>}
  </section>;
}
