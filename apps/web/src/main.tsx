import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  OFFERS_PAGE_SIZE,
  PAGE_SIZE,
  extractAllSpecKeys,
  fetchProductOffers,
  formatTehranDateTime,
  formatWarranty,
  getProductSpecValue,
  normalizeBudget,
  searchProducts,
  validateBudget,
} from './api';
import type { OfferPage, Product, ProductPage } from './api';
import './style.css';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string; offset: number; budget: string | null }
  | { kind: 'success'; query: string; offset: number; budget: string | null; page: ProductPage }
  | { kind: 'error'; query: string; offset: number; budget: string | null; message: string };

type OffersState =
  | { kind: 'idle' }
  | { kind: 'loading'; offset: number }
  | { kind: 'success'; offset: number; page: OfferPage }
  | { kind: 'error'; offset: number; message: string };

const numbers = new Intl.NumberFormat('fa-IR');
const formatMoney = (value: string) => numbers.format(BigInt(value));

function ProductCard({
  product,
  isSelected,
  onToggleCompare,
  onViewOffers,
}: {
  product: Product;
  isSelected: boolean;
  onToggleCompare: (product: Product) => void;
  onViewOffers: (product: Product) => void;
}) {
  const summary = product.offer_summary;
  const min = summary.min_price_toman;
  const max = summary.max_price_toman;
  const precisionWarning = max !== null && BigInt(max) > 9007199254740991n;

  return (
    <article className={`product-card ${isSelected ? 'selected' : ''}`}>
      <div className="card-top">
        <span className="category">{product.category_name?.trim() || 'دسته ثبت نشده'}</span>
        <span className="product-mark" aria-hidden="true">کالا</span>
      </div>
      <h3>{product.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</h3>
      <p className="brand">
        {product.brand_name?.trim() || 'برند ثبت نشده'}
        {product.model?.trim() ? ` · مدل: ${product.model.trim()}` : ''}
      </p>
      <div className="price-block">
        <p className="caption">بازهٔ کل قیمت‌های ثبت‌شده</p>
        <p className="price">
          {min === null ? (
            'قیمتی ثبت نشده'
          ) : (
            <>
              <bdi>{formatMoney(min)}</bdi>
              {max !== null && max !== min && (
                <> تا <bdi>{formatMoney(max)}</bdi></>
              )}{' '}
              <span>تومان</span>
            </>
          )}
        </p>
        {precisionWarning && <p className="warning">عدد بسیار بزرگ در منبع؛ نیازمند بررسی قیمت</p>}
      </div>
      <p className="offer-count">
        {numbers.format(summary.offer_count)} آفر ثبت‌شده
        {summary.missing_price_count > 0 && (
          <> · {numbers.format(summary.missing_price_count)} بدون قیمت</>
        )}
      </p>
      <p className="inventory">موجودی تأیید نشده (سابقهٔ کاتالوگ)</p>
      <div className="card-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onViewOffers(product)}
        >
          مشاهدهٔ آفرها ({numbers.format(summary.offer_count)})
        </button>
        <button
          type="button"
          className={`compare-btn ${isSelected ? 'active' : ''}`}
          onClick={() => onToggleCompare(product)}
          aria-pressed={isSelected}
        >
          {isSelected ? '✓ در مقایسه' : '+ انتخاب برای مقایسه'}
        </button>
      </div>
    </article>
  );
}

function ComparisonModal({
  products,
  onClose,
  onRemove,
  onViewOffers,
}: {
  products: Product[];
  onClose: () => void;
  onRemove: (productId: string) => void;
  onViewOffers: (product: Product) => void;
}) {
  const specKeys = extractAllSpecKeys(products);

  return (
    <section className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="compare-modal-title">
      <div className="modal-content comparison-modal">
        <div className="modal-header">
          <div>
            <h2 id="compare-modal-title">مقایسهٔ ۲ تا ۳ محصول</h2>
            <p className="caption">مشخصات بر اساس کلید و بخش منبع تطبیق داده شده‌اند؛ اطلاعات ناموجود به‌طور صریح مشخص‌اند.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="بستن پنجرهٔ مقایسه">✕</button>
        </div>

        {products.length < 2 ? (
          <div className="state-panel">
            <h3>حداقل ۲ محصول را انتخاب کنید</h3>
            <p>برای مقایسه، لطفاً حداقل ۲ کالا از نتایج جست‌وجو به لیست مقایسه اضافه کنید.</p>
          </div>
        ) : (
          <div className="comparison-body">
            <div className="comparison-products-row">
              {products.map(p => {
                const s = p.offer_summary;
                return (
                  <div key={p.product_id} className="compare-product-col">
                    <button
                      type="button"
                      className="remove-col-btn"
                      onClick={() => onRemove(p.product_id)}
                      title="حذف از مقایسه"
                    >
                      حذف از مقایسه ✕
                    </button>
                    <h3 className="compare-product-title">{p.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</h3>
                    <p className="caption">برند: {p.brand_name?.trim() || 'ثبت نشده'}</p>
                    <p className="caption">دسته: {p.category_name?.trim() || 'ثبت نشده'}</p>
                    <p className="price">
                      {s.min_price_toman === null ? (
                        'قیمتی ثبت نشده'
                      ) : (
                        <>
                          <bdi>{formatMoney(s.min_price_toman)}</bdi>
                          {s.max_price_toman !== null && s.max_price_toman !== s.min_price_toman && (
                            <> تا <bdi>{formatMoney(s.max_price_toman)}</bdi></>
                          )}{' '}
                          <span>تومان</span>
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      className="secondary-btn small-btn"
                      onClick={() => {
                        onClose();
                        onViewOffers(p);
                      }}
                    >
                      مشاهدهٔ آفرها
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="specs-section">
              <h3>جدول مقایسهٔ مشخصات فنی</h3>
              {specKeys.length === 0 ? (
                <p className="caption">مشخصات فنی ساختاریافته در کاتالوگ برای این محصولات ثبت نشده است.</p>
              ) : (
                <div className="specs-list">
                  {specKeys.map(k => (
                    <div key={`${k.section}:::${k.key}`} className="spec-row">
                      <div className="spec-label">
                        <strong>{k.displayKey}</strong>
                        {k.displaySection && k.displaySection !== 'مشخصات عمومی' && (
                          <span className="spec-section-badge">{k.displaySection}</span>
                        )}
                      </div>
                      <div className="spec-values">
                        {products.map(p => (
                          <div key={p.product_id} className="spec-val-item">
                            <span className="product-tag">{p.persian_title?.slice(0, 20) || 'کالا'}</span>
                            <span className="val-text">{getProductSpecValue(p, k.section, k.key)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OffersModal({
  product,
  budget,
  state,
  onClose,
  onPageChange,
  onRetry,
}: {
  product: Product;
  budget: string | null;
  state: OffersState;
  onClose: () => void;
  onPageChange: (offset: number) => void;
  onRetry: () => void;
}) {
  return (
    <section className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="offers-modal-title">
      <div className="modal-content offers-modal">
        <div className="modal-header">
          <div>
            <h2 id="offers-modal-title">آفرهای فروشندگان</h2>
            <p className="caption">
              کالا: <strong>{product.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</strong>
            </p>
            {budget ? (
              <p className="budget-notice">
                سقف بودجهٔ فعال: <strong>{formatMoney(budget)} تومان</strong> (آفرهای گران‌تر یا بدون قیمت حذف شده‌اند).
              </p>
            ) : (
              <p className="budget-notice neutral">
                نمایش همهٔ آفرهای ثبت‌شده در منبع (شامل قیمت‌های نامعلوم؛ چند آفر یک فروشگاه حفظ شده‌اند).
              </p>
            )}
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="بستن لیست آفرها">✕</button>
        </div>

        {state.kind === 'loading' && (
          <div className="state-panel" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>در حال دریافت آفرهای فروشندگان…</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="state-panel error-panel" role="alert">
            <h3>خطا در دریافت آفرها</h3>
            <p>{state.message}</p>
            <button type="button" className="secondary" onClick={onRetry}>تلاش مجدد</button>
          </div>
        )}

        {state.kind === 'success' && (
          <div className="offers-body">
            {state.page.items.length === 0 ? (
              <div className="state-panel">
                <h3>هیچ آفری با شرایط انتخابی یافت نشد</h3>
                <p>
                  {budget
                    ? 'هیچ فروشگاهی با قیمت کمتر یا مساوی سقف بودجهٔ تعیین‌شده ثبت نشده است.'
                    : 'هیچ آفری برای این کالا در کاتالوگ ثبت نشده است.'}
                </p>
              </div>
            ) : (
              <>
                <div className="offers-meta">
                  <span className="caption">
                    صفحهٔ {numbers.format(Math.floor(state.offset / OFFERS_PAGE_SIZE) + 1)} · نمایش {numbers.format(state.page.items.length)} آفر
                  </span>
                  {state.page.has_more && (
                    <span className="caption warning-caption">
                      صفحهٔ فعلی شامل همهٔ آفرها نیست؛ برای مشاهدهٔ سایر فروشندگان از دکمهٔ «صفحهٔ بعد» استفاده کنید.
                    </span>
                  )}
                </div>

                <div className="offers-grid">
                  {state.page.items.map(offer => {
                    const price = offer.price_toman;
                    const isVeryLarge = offer.price_quality === 'above_js_safe_integer';
                    return (
                      <article key={offer.offer_id} className="offer-card">
                        <div className="offer-header">
                          <h4 className="shop-name">{offer.shop.name?.trim() || 'فروشگاه بدون نام (ناشناس‌شده)'}</h4>
                          <span className="offer-badge" aria-hidden="true">آفر</span>
                        </div>

                        <p className="shop-address">
                          📍 {offer.shop.address?.trim() || offer.shop.location_label?.trim() || 'نشانی ثبت نشده'}
                        </p>

                        {offer.seller_title?.trim() && (
                          <p className="seller-title">عنوان اعلامی فروشنده: {offer.seller_title.trim()}</p>
                        )}

                        <div className="offer-price-block">
                          <p className="price">
                            {price === null ? (
                              'قیمتی ثبت نشده'
                            ) : (
                              <>
                                <bdi>{formatMoney(price)}</bdi> <span>تومان</span>
                              </>
                            )}
                          </p>
                          {isVeryLarge && (
                            <p className="warning">هشدار: قیمت بسیار بزرگ در منبع</p>
                          )}
                        </div>

                        <div className="offer-details">
                          <p className="detail-row">
                            <span>آخرین تغییر قیمت ثبت‌شده:</span>
                            <strong>{formatTehranDateTime(offer.last_price_changed_at)}</strong>
                          </p>
                          <p className="detail-row">
                            <span>گارانتی:</span>
                            <span>{formatWarranty(offer.warranty)}</span>
                          </p>
                          <p className="detail-row provenance-row">
                            <span>شناسهٔ آفر:</span>
                            <code>{offer.offer_id}</code>
                          </p>
                        </div>

                        <p className="inventory-warning">موجودی تأیید نشده (سوابق کاتالوگ تاریخی)</p>
                      </article>
                    );
                  })}
                </div>

                {(state.offset > 0 || state.page.has_more) && (
                  <nav className="pagination" aria-label="صفحه‌های آفرها">
                    <button
                      type="button"
                      className="secondary"
                      disabled={state.offset === 0}
                      onClick={() => onPageChange(Math.max(0, state.offset - OFFERS_PAGE_SIZE))}
                    >
                      صفحهٔ قبل
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!state.page.has_more}
                      onClick={() => onPageChange(state.offset + OFFERS_PAGE_SIZE)}
                    >
                      صفحهٔ بعد
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [input, setInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [activeBudget, setActiveBudget] = useState<string | null>(null);
  const [validation, setValidation] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  // Comparison state
  const [selectedForComparison, setSelectedForComparison] = useState<Product[]>([]);
  const [showComparisonView, setShowComparisonView] = useState(false);
  const [comparisonWarning, setComparisonWarning] = useState('');

  // Offers modal state
  const [activeOffersProduct, setActiveOffersProduct] = useState<Product | null>(null);
  const [offersState, setOffersState] = useState<OffersState>({ kind: 'idle' });

  const activeSearch = useRef<AbortController | null>(null);
  const activeOffers = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeSearch.current?.abort();
      activeOffers.current?.abort();
    };
  }, []);

  async function search(query: string, offset = 0, budget: string | null = activeBudget) {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length > 120) {
      setValidation('نام کالا را بین ۱ تا ۱۲۰ نویسه وارد کنید.');
      return;
    }

    if (budget) {
      const budgetCheck = validateBudget(budget);
      if (!budgetCheck.valid) {
        setValidation(budgetCheck.error || 'بودجهٔ واردشده نامعتبر است.');
        return;
      }
    }

    setValidation('');
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setState({ kind: 'loading', query: trimmed, offset, budget });
    try {
      const page = await searchProducts(trimmed, offset, budget, controller.signal);
      if (!controller.signal.aborted) {
        setState({ kind: 'success', query: trimmed, offset, budget, page });
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setState({
          kind: 'error',
          query: trimmed,
          offset,
          budget,
          message: error instanceof Error ? error.message : 'پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.',
        });
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeBudget(budgetInput);
    if (normalized) {
      const check = validateBudget(normalized);
      if (!check.valid) {
        setValidation(check.error || 'بودجهٔ واردشده نامعتبر است.');
        return;
      }
      setActiveBudget(normalized);
      void search(input, 0, normalized);
    } else {
      setActiveBudget(null);
      void search(input, 0, null);
    }
  }

  function clearBudget() {
    setBudgetInput('');
    setActiveBudget(null);
    if (state.kind === 'success' || state.kind === 'loading' || state.kind === 'error') {
      void search(state.query, 0, null);
    }
  }

  function toggleCompare(product: Product) {
    setComparisonWarning('');
    const exists = selectedForComparison.some(p => p.product_id === product.product_id);
    if (exists) {
      setSelectedForComparison(selectedForComparison.filter(p => p.product_id !== product.product_id));
    } else {
      if (selectedForComparison.length >= 3) {
        setComparisonWarning('حداکثر می‌توانید ۳ محصول را برای مقایسه انتخاب کنید.');
        return;
      }
      setSelectedForComparison([...selectedForComparison, product]);
    }
  }

  function removeProductFromComparison(productId: string) {
    setSelectedForComparison(selectedForComparison.filter(p => p.product_id !== productId));
  }

  function openOffers(product: Product, offset = 0) {
    setActiveOffersProduct(product);
    loadOffers(product.product_id, offset, activeBudget);
  }

  async function loadOffers(productId: string, offset: number, budget: string | null) {
    activeOffers.current?.abort();
    const controller = new AbortController();
    activeOffers.current = controller;
    setOffersState({ kind: 'loading', offset });
    try {
      const page = await fetchProductOffers(productId, offset, budget, controller.signal);
      if (!controller.signal.aborted) {
        setOffersState({ kind: 'success', offset, page });
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setOffersState({
          kind: 'error',
          offset,
          message: error instanceof Error ? error.message : 'خطا در دریافت اطلاعات آفرها.',
        });
      }
    }
  }

  return (
    <>
      <header className="header">
        <div className="shell header-inner">
          <span className="logo" aria-hidden="true">ت</span>
          <div>
            <p className="site-name">دستیار خرید حضوری</p>
            <p className="header-note">کاتالوگ تهران · پروژهٔ مستقل چالش ترب</p>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">از پیدا کردن کالا شروع کنیم</p>
          <h1 id="page-title">دنبال چه کالایی می‌گردید؟</h1>
          <p className="intro-copy">
            نام کالا را جست‌وجو کنید، سقف بودجه تعیین کنید و ۲ تا ۳ کالا را برای مقایسه مشخصات و آفرها انتخاب کنید.
          </p>

          <form onSubmit={submit} className="search-form">
            <div className="form-fields">
              <div className="field-group">
                <label htmlFor="query">نام کالا یا مدل</label>
                <input
                  id="query"
                  value={input}
                  maxLength={120}
                  onChange={e => setInput(e.target.value)}
                  placeholder="مثلاً گوشی، کفش یا سونی"
                  autoComplete="off"
                  aria-describedby={validation ? 'validation' : 'search-help'}
                  aria-invalid={Boolean(validation)}
                />
              </div>

              <div className="field-group budget-field">
                <label htmlFor="budget">سقف بودجه (تومان - اختیاری)</label>
                <input
                  id="budget"
                  value={budgetInput}
                  maxLength={25}
                  onChange={e => setBudgetInput(e.target.value)}
                  placeholder="مثلاً ۱۰٬۰۰۰٬۰۰۰ یا خالی"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit">جست‌وجو</button>
            </div>

            <p id="search-help" className="caption">
              جست‌وجو به اطلاعات ثبت‌شده در کاتالوگ محدود است. ارقام بودجه می‌توانند فارسی یا انگلیسی باشند.
            </p>
            {validation && (
              <p id="validation" className="error-text" role="alert">
                {validation}
              </p>
            )}
          </form>

          <div className="examples">
            <span>برای شروع:</span>
            {['گوشی', 'کفش', 'سونی'].map(query => (
              <button
                key={query}
                type="button"
                className="chip"
                onClick={() => {
                  setInput(query);
                  void search(query, 0, activeBudget);
                }}
              >
                {query}
              </button>
            ))}
          </div>

          {activeBudget && (
            <div className="active-filter-badge">
              <span>سقف بودجهٔ فعال: <strong>{formatMoney(activeBudget)} تومان</strong></span>
              <button type="button" className="clear-filter-btn" onClick={clearBudget} title="حذف فیلتر بودجه">
                حذف بودجه ✕
              </button>
            </div>
          )}
        </section>

        {comparisonWarning && (
          <aside className="notice warning-notice" role="alert">
            <strong>محدودیت مقایسه:</strong>
            <span>{comparisonWarning}</span>
          </aside>
        )}

        <aside className="notice">
          <strong>قبل از مراجعه، قیمت و موجودی را تأیید کنید.</strong>
          <span>
            این کاتالوگ سابقهٔ آفرهای ثبت‌شده است؛ قیمت ثبت‌شده نشانهٔ موجودی فعلی یا قطعی فروشگاه نیست.
          </span>
        </aside>

        {/* Sticky comparison bar */}
        {selectedForComparison.length > 0 && (
          <aside className="compare-bar" aria-label="نوار ابزار مقایسهٔ محصولات">
            <div className="compare-bar-info">
              <strong>{numbers.format(selectedForComparison.length)} محصول</strong> برای مقایسه انتخاب شده (حداکثر ۳ کالا)
            </div>
            <div className="compare-bar-actions">
              <button
                type="button"
                className="secondary"
                disabled={selectedForComparison.length < 2}
                onClick={() => setShowComparisonView(true)}
              >
                مشاهدهٔ مقایسهٔ محصولات
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => setSelectedForComparison([])}
              >
                پاک کردن
              </button>
            </div>
          </aside>
        )}

        <section className="results" aria-labelledby="results-title" aria-busy={state.kind === 'loading'}>
          <div className="results-heading">
            <h2 id="results-title">
              {state.kind === 'idle'
                ? 'نتایج جست‌وجو'
                : `نتایج برای «${state.query}»`}
            </h2>
            {state.kind === 'success' && state.page.items.length > 0 && (
              <span className="caption">
                صفحهٔ {numbers.format(state.offset / PAGE_SIZE + 1)}
              </span>
            )}
          </div>

          {state.kind === 'idle' && (
            <div className="state-panel">
              <h3>اولین کالا را پیدا کنید</h3>
              <p>نام کالا را وارد کنید یا یکی از پیشنهادهای بالا را بزنید.</p>
            </div>
          )}

          {state.kind === 'loading' && (
            <div className="state-panel" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>در حال جست‌وجوی کاتالوگ…</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="state-panel error-panel" role="alert">
              <h3>جست‌وجو انجام نشد</h3>
              <p>{state.message}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => void search(state.query, state.offset, state.budget)}
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {state.kind === 'success' && (
            <>
              <p role="status" className="sr-only">
                {numbers.format(state.page.items.length)} محصول در این صفحه
              </p>
              {state.page.items.length === 0 ? (
                <div className="state-panel">
                  <h3>کالایی با این جست‌وجو پیدا نشد</h3>
                  <p>
                    {state.budget
                      ? 'کالایی با این نام و واجد سقف بودجهٔ انتخابی ثبت نشده است. سقف بودجه را تغییر داده یا حذف کنید.'
                      : 'نام کوتاه‌تر یا واژهٔ دیگری را امتحان کنید؛ نبود نتیجه به معنی نبود کالا در بازار نیست.'}
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {state.page.items.map(product => {
                    const isSelected = selectedForComparison.some(p => p.product_id === product.product_id);
                    return (
                      <ProductCard
                        key={product.product_id}
                        product={product}
                        isSelected={isSelected}
                        onToggleCompare={toggleCompare}
                        onViewOffers={openOffers}
                      />
                    );
                  })}
                </div>
              )}

              {(state.offset > 0 || state.page.has_more) && (
                <nav className="pagination" aria-label="صفحه‌های نتایج">
                  <button
                    type="button"
                    className="secondary"
                    disabled={state.offset === 0}
                    onClick={() =>
                      void search(
                        state.query,
                        Math.max(0, state.offset - PAGE_SIZE),
                        state.budget
                      )
                    }
                  >
                    صفحهٔ قبل
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!state.page.has_more}
                    onClick={() =>
                      void search(
                        state.query,
                        state.offset + PAGE_SIZE,
                        state.budget
                      )
                    }
                  >
                    صفحهٔ بعد
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>

      {/* Comparison Modal */}
      {showComparisonView && (
        <ComparisonModal
          products={selectedForComparison}
          onClose={() => setShowComparisonView(false)}
          onRemove={removeProductFromComparison}
          onViewOffers={openOffers}
        />
      )}

      {/* Offers Modal */}
      {activeOffersProduct && (
        <OffersModal
          product={activeOffersProduct}
          budget={activeBudget}
          state={offersState}
          onClose={() => setActiveOffersProduct(null)}
          onPageChange={offset => loadOffers(activeOffersProduct.product_id, offset, activeBudget)}
          onRetry={() => {
            const currentOffset = 'offset' in offersState ? offersState.offset : 0;
            void loadOffers(activeOffersProduct.product_id, currentOffset, activeBudget);
          }}
        />
      )}

      <footer className="shell footer">
        اطلاعات ثبت‌شده برای بررسی خرید حضوری · بدون تأیید زندهٔ فروشنده · پروژهٔ مستقل مسابقهٔ ترب
      </footer>
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
