import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { PAGE_SIZE, searchProducts } from './api';
import type { Product, ProductPage } from './api';
import './style.css';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string; offset: number }
  | { kind: 'success'; query: string; offset: number; page: ProductPage }
  | { kind: 'error'; query: string; offset: number; message: string };

const numbers = new Intl.NumberFormat('fa-IR');
const formatMoney = (value: string) => numbers.format(BigInt(value));

function ProductCard({ product }: { product: Product }) {
  const summary = product.offer_summary;
  const min = summary.min_price_toman;
  const max = summary.max_price_toman;
  const precisionWarning = max !== null && BigInt(max) > 9007199254740991n;
  return <article className="product-card">
    <div className="card-top"><span className="category">{product.category_name?.trim() || 'دسته ثبت نشده'}</span>
      <span className="product-mark" aria-hidden="true">کالا</span></div>
    <h3>{product.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</h3>
    <p className="brand">{product.brand_name?.trim() || 'برند ثبت نشده'}</p>
    <div className="price-block">
      <p className="caption">بازهٔ کل قیمت‌های ثبت‌شده</p>
      <p className="price">{min === null ? 'قیمتی ثبت نشده' : <>
        <bdi>{formatMoney(min)}</bdi>{max !== null && max !== min && <> تا <bdi>{formatMoney(max)}</bdi></>} <span>تومان</span>
      </>}</p>
      {precisionWarning && <p className="warning">عدد بسیار بزرگ در منبع؛ نیازمند بررسی قیمت</p>}
    </div>
    <p className="offer-count">{numbers.format(summary.offer_count)} آفر ثبت‌شده
      {summary.missing_price_count > 0 && <> · {numbers.format(summary.missing_price_count)} بدون قیمت</>}</p>
    <p className="inventory">موجودی تأیید نشده</p>
  </article>;
}

function App() {
  const [input, setInput] = useState('');
  const [validation, setValidation] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function search(query: string, offset = 0) {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length > 120) {
      setValidation('نام کالا را بین ۱ تا ۱۲۰ نویسه وارد کنید.');
      return;
    }
    setValidation('');
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ kind: 'loading', query: trimmed, offset });
    try {
      const page = await searchProducts(trimmed, offset, controller.signal);
      if (!controller.signal.aborted) setState({ kind: 'success', query: trimmed, offset, page });
    } catch (error: unknown) {
      if (!controller.signal.aborted) setState({ kind: 'error', query: trimmed, offset,
        message: error instanceof Error ? error.message : 'پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.' });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(input);
  }

  return <>
    <header className="header"><div className="shell header-inner">
      <span className="logo" aria-hidden="true">ت</span>
      <div><p className="site-name">دستیار خرید حضوری</p><p className="header-note">کاتالوگ تهران · پروژهٔ مستقل چالش ترب</p></div>
    </div></header>
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">از پیدا کردن کالا شروع کنیم</p>
        <h1 id="page-title">دنبال چه کالایی می‌گردید؟</h1>
        <p className="intro-copy">نام کالا یا مدل را جست‌وجو کنید و قیمت‌های ثبت‌شده را ببینید.</p>
        <form onSubmit={submit} className="search-form">
          <label htmlFor="query">نام کالا یا مدل</label>
          <div className="search-row"><input id="query" value={input} maxLength={120} onChange={e => setInput(e.target.value)}
            placeholder="مثلاً گوشی، کفش یا سونی" autoComplete="off" aria-describedby={validation ? 'validation' : 'search-help'}
            aria-invalid={Boolean(validation)} /><button type="submit">جست‌وجو</button></div>
          <p id="search-help" className="caption">با چند واژهٔ ساده شروع کنید؛ جست‌وجو به اطلاعات ثبت‌شده محدود است.</p>
          {validation && <p id="validation" className="error-text" role="alert">{validation}</p>}
        </form>
        <div className="examples"><span>برای شروع:</span>{['گوشی', 'کفش', 'سونی'].map(query =>
          <button key={query} className="chip" onClick={() => { setInput(query); void search(query); }}>{query}</button>)}</div>
      </section>
      <aside className="notice"><strong>قبل از مراجعه، قیمت و موجودی را تأیید کنید.</strong>
        <span>این کاتالوگ سابقهٔ آفرهاست؛ قیمت ثبت‌شده نشانهٔ موجودی فعلی فروشگاه نیست.</span></aside>
      <section className="results" aria-labelledby="results-title" aria-busy={state.kind === 'loading'}>
        <div className="results-heading"><h2 id="results-title">{state.kind === 'idle' ? 'نتایج جست‌وجو' : <>نتایج برای «{state.query}»</>}</h2>
          {state.kind === 'success' && state.page.items.length > 0 && <span className="caption">صفحهٔ {numbers.format(state.offset / PAGE_SIZE + 1)}</span>}</div>
        {state.kind === 'idle' && <div className="state-panel"><h3>اولین کالا را پیدا کنید</h3><p>نام کالا را وارد کنید یا یکی از پیشنهادهای بالا را بزنید.</p></div>}
        {state.kind === 'loading' && <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><p>در حال جست‌وجوی کاتالوگ…</p></div>}
        {state.kind === 'error' && <div className="state-panel error-panel" role="alert"><h3>جست‌وجو انجام نشد</h3><p>{state.message}</p>
          <button className="secondary" onClick={() => void search(state.query, state.offset)}>تلاش مجدد</button></div>}
        {state.kind === 'success' && <>
          <p role="status" className="sr-only">{numbers.format(state.page.items.length)} محصول در این صفحه</p>
          {state.page.items.length === 0 ? <div className="state-panel"><h3>کالایی با این جست‌وجو پیدا نشد</h3><p>نام کوتاه‌تر یا واژهٔ دیگری را امتحان کنید؛ نبود نتیجه به معنی نبود کالا در بازار نیست.</p></div>
            : <div className="product-grid">{state.page.items.map(product => <ProductCard key={product.product_id} product={product} />)}</div>}
          {(state.offset > 0 || state.page.has_more) && <nav className="pagination" aria-label="صفحه‌های نتایج">
            <button className="secondary" disabled={state.offset === 0} onClick={() => void search(state.query, Math.max(0, state.offset - PAGE_SIZE))}>صفحهٔ قبل</button>
            <button className="secondary" disabled={!state.page.has_more} onClick={() => void search(state.query, state.offset + PAGE_SIZE)}>صفحهٔ بعد</button>
          </nav>}
        </>}
      </section>
    </main>
    <footer className="shell footer">اطلاعات ثبت‌شده برای بررسی خرید حضوری · بدون تأیید زندهٔ فروشنده</footer>
  </>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
