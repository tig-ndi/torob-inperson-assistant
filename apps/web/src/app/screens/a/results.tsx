import { useEffect, useRef, useState } from 'react';
import type { CatalogueProduct, Explanation } from '../../base/domain/contracts.ts';
import { catalogueSearchForWorkspace, catalogueSearchKey } from '../../base/state/model.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { useCatalogue } from '../../base/state/hooks.ts';
import { Badge, Button, Empty, ErrorCard, FreshTag, Price } from '../../base/ui/primitives.tsx';
import { formatDistance } from '../../../api.ts';
import { activeBudgetLabel } from './presentation.ts';
import { productImageUrl } from './resultPresentation.ts';
import { productHeadingId } from './pagination.ts';
import { useProductPages } from './useProductPages.ts';
import { ProductComparison } from './comparison.tsx';

const numbers = new Intl.NumberFormat('fa-IR');

function ProductImage({ product }: { product: CatalogueProduct }) {
  const [failed, setFailed] = useState(false);
  const url = productImageUrl(product.image_urls);
  return <div className="ua-product-image">{url && !failed
    ? <img src={url} alt={product.persian_title ?? 'تصویر ثبت‌شدهٔ محصول'} width={72} height={72}
      loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span>تصویر در دسترس نیست</span>}</div>;
}

function SourceEvidence({ evidence }: { evidence: Explanation['products'][number] | undefined }) {
  if (!evidence) return null;
  return <details className="ua-product-evidence"><summary>شواهد این پاسخ برای محصول</summary>
    {evidence.reasons.length > 0 && <ul>{evidence.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
    {evidence.budget_offer && <div className="ua-budget-witness">
      <p>قیمت آفرِ شاهدِ منطبق با بودجه: <Price value={evidence.budget_offer.price_toman} /></p>
      <FreshTag timestamp={evidence.budget_offer.last_price_changed_at} />
      <p>این آفر شاهد، تأیید موجودی یا قیمت فعلی نیست.</p>
    </div>}
    {evidence.topics.map(topic => <section key={topic.topic}>
      <h4>{topic.topic === 'camera' ? 'دوربین' : 'باتری'}</h4><p>{topic.summary}</p>
      {topic.evidence.map(item => <p key={item.source_index}>
        {item.section ?? 'بخش ثبت نشده'} · {item.key ?? 'عنوان ثبت نشده'}: {item.value ?? 'مقدار ثبت نشده'}
      </p>)}
    </section>)}
    <p className="ub-meta">تناسب کالا با کاربرد شما تأیید نشده است.</p>
  </details>;
}

function ProductCard({ product, evidence, stale, nearestSort }: {
  product: CatalogueProduct; evidence: Explanation['products'][number] | undefined; stale: boolean; nearestSort: boolean;
}) {
  const { state, dispatch } = useWorkspace();
  const compared = state.compareProducts.some(item => item.product_id === product.product_id);
  const title = product.persian_title ?? 'عنوان محصول ثبت نشده';
  const summary = product.offer_summary;
  return <article className="ua-product-card" aria-label={title}>
    <div className="ua-product-heading">
      <ProductImage key={product.image_urls.join('|')} product={product} />
      <div><h3 id={productHeadingId(product.product_id)} tabIndex={-1}>{title}</h3><p className="ub-meta">{[product.brand_name, product.model, product.category_name].filter(Boolean).join(' · ') || 'برند، مدل و دسته ثبت نشده'}</p></div>
    </div>
    <div className="ua-product-price"><span>کمترین قیمت ثبت‌شدهٔ محصول</span><Price value={summary.min_price_toman} /></div>
    <Button tone="secondary" disabled={stale} onClick={() => {
      dispatch({ type: 'product', value: product });
      dispatch({ type: 'navigate', screen: 'stores' });
    }}>دیدن فروشندگان</Button>
    <Button tone="ghost" aria-pressed={compared} aria-label={`${compared ? 'حذف' : 'افزودن'} ${title} ${compared ? 'از' : 'به'} مقایسه`}
      disabled={stale && !compared} onClick={() => {
        dispatch({ type: 'notice', value: null });
        dispatch({ type: 'compareProduct', value: product });
      }}>{compared ? 'حذف از مقایسه' : 'افزودن به مقایسه'}</Button>
    {summary.max_price_toman !== null && summary.max_price_toman !== summary.min_price_toman &&
      <p className="ua-product-upper">بیشترین قیمت ثبت‌شده: <Price value={summary.max_price_toman} /></p>}
    <p className="ub-meta">خلاصهٔ قیمت همهٔ آفرهای محصول؛ قیمتِ نزدیک‌ترین فروشنده نیست. موجودی تأییدنشده است.</p>
    <p className="ub-meta">{numbers.format(summary.offer_count)} آفر ثبت‌شده، نه تعداد فروشگاه‌های یکتا
      {summary.missing_price_count > 0 && <> · {numbers.format(summary.missing_price_count)} آفر بدون قیمت</>}</p>
    {product.nearest_offer ? <div className="ua-nearest-witness">
      <strong>آفر مبنای فاصله</strong>
      <p>{formatDistance(product.nearest_offer.direct_distance_meters)} · فاصلهٔ هوایی، نه مسیر رانندگی</p>
      <p>قیمت همین آفر: <Price value={product.nearest_offer.price_toman} /></p>
      <FreshTag timestamp={product.nearest_offer.last_price_changed_at} />
    </div> : nearestSort && <p className="ub-meta">آفر مبنای فاصله برای این محصول ثبت نشده است.</p>}
    {product.specs.length ? <details className="ua-product-specs"><summary>مشخصات ثبت‌شده در منبع</summary>
      <dl>{product.specs.map((spec, index) => <div key={index}>
        <dt>{spec.section ?? 'بخش ثبت نشده'} · {spec.key ?? 'عنوان ثبت نشده'}</dt>
        <dd>{spec.value ?? 'مقدار ثبت نشده'}</dd>
      </div>)}</dl>
    </details> : <p className="ub-meta">مشخصات فنی در این پاسخ ثبت نشده است.</p>}
    <SourceEvidence evidence={evidence} />
  </article>;
}

export function ResultsScreen() {
  const { state, dispatch } = useWorkspace();
  const catalogue = useCatalogue();
  const pages = useProductPages();
  const results = state.productResults;
  const resultCount = useRef<HTMLParagraphElement>(null);
  const previousResults = useRef(results);
  useEffect(() => {
    const previous = previousResults.current;
    previousResults.current = results;
    if (!results || !previous || results.page.offset <= previous.page.offset || results.source !== previous.source ||
      catalogueSearchKey(results.search) !== catalogueSearchKey(previous.search)) return;
    const oldIds = new Set(previous.page.items.map(product => product.product_id));
    const firstNew = results.page.items.find(product => !oldIds.has(product.product_id));
    const target = firstNew ? document.getElementById(productHeadingId(firstNew.product_id)) : resultCount.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [results]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, []);
  const currentSearch = catalogueSearchForWorkspace(state);
  const stale = results !== null && catalogueSearchKey(results.search) !== catalogueSearchKey(currentSearch);
  const loading = catalogue.result.status === 'loading' || pages.result.status === 'loading';
  const refresh = () => { void catalogue.search(currentSearch); };
  return <section className="ua-results" aria-labelledby="ua-results-title" aria-busy={loading}>
    <h2 id="ua-results-title" ref={heading} tabIndex={-1}>انتخاب محصول</h2>
    {!results ? <Empty title="هنوز نتیجه‌ای برای نمایش انتخاب نشده">
      <p>از کادر بالای صفحه جست‌وجو کنید یا نیازتان را با دستیار روشن کنید.</p>
      <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'decide' })}>کمک برای انتخاب</Button>
    </Empty> : <>
      <div className="ua-result-context">
        <Badge tone="brand">{results.source === 'assistant' ? 'نتیجهٔ دستیار' : 'نتیجهٔ جست‌وجوی مستقیم'}</Badge>
        <p>عبارت این نتیجه: <bdi>{results.search.query}</bdi></p>
        <p>سقف بودجهٔ این نتیجه: <bdi>{activeBudgetLabel(results.search.maxPrice)}</bdi></p>
        <details><summary>دسته و شرایط این نتیجه</summary>
          <p>{results.search.categoryCleared ? 'فیلتر دسته حذف شده است.' : `دستهٔ نتیجه: ${results.page.category_name ?? 'ثبت نشده'}`}</p>
          <p className="ub-meta">ترتیب این صفحه: {results.search.sort === 'nearest' ? 'نزدیک‌ترین آفرِ دارای مختصات' : 'ارتباط متنی کاتالوگ؛ رتبه‌بندی کیفیت یا تناسب نیست'}.</p>
          <p className="ub-meta">شعاع، ساعت و اعتبار حضوری در فهرست آفرهای فروشندگان بررسی می‌شوند؛ این کارت‌ها تأیید آن شرایط نیستند.</p>
        </details>
      </div>
      {results.source === 'manual' && state.needState?.topic_query && state.needState.topic_query !== results.search.query &&
        <p className="ua-notice">این جست‌وجو مستقل است؛ موضوع گفت‌وگوی قبلی «{state.needState.topic_query}» حفظ شده و شرط‌های اختصاصی آن به کالای تازه منتقل نشده‌اند.</p>}
      {stale && <div className="ua-notice" role="status">
        <p>عبارت، بودجه یا شرایط محصول تغییر کرده است. کارت‌های زیر نتایج قبلی‌اند؛ پیش از انتخاب، دوباره جست‌وجو کنید.</p>
        <Button tone="secondary" disabled={loading || !currentSearch.query.trim()} onClick={refresh}>جست‌وجو با شرایط فعلی</Button>
      </div>}
      {loading && <p role="status">در حال دریافت؛ نتایج قبلی تا دریافت پاسخ تازه حفظ می‌شوند.</p>}
      {catalogue.result.status === 'error' && <ErrorCard message={catalogue.result.error} onRetry={refresh} />}
      {results.explanation && <details className="ua-result-explanation">
        <summary>توضیح و محدودیت‌های پاسخ</summary>
        <p>{results.explanation.summary}</p>
        <ul>{results.explanation.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        {results.page.offset > results.initialOffset && <p className="ub-meta">این توضیح مربوط به پاسخ نخست دستیار است؛ برای محصولات صفحات بعد، توضیح تازه‌ای تولید نشده است.</p>}
      </details>}
      {results.source === 'assistant' && state.needState?.pending_requirements.length ? <div className="ua-notice">
        <strong>درخواست‌های هنوز اعمال‌نشده</strong>
        <ul>{state.needState.pending_requirements.map(item => <li key={item.key}>{item.source_text}</li>)}</ul>
      </div> : null}
      <p ref={resultCount} tabIndex={-1} className="ub-meta" role="status">{numbers.format(results.page.items.length)} محصول بارگذاری‌شده؛ این شمارش کل نتایج نیست.</p>
      {!results.page.items.length && <Empty title="با این عبارت و شرایط، نتیجه‌ای در کاتالوگ ثبت نشده">
        <p>عبارت یا بودجه را تغییر دهید؛ نبود نتیجه به معنی ناموجودبودن قطعی کالا نیست.</p>
      </Empty>}
      {results.page.items.map(product => <ProductCard key={product.product_id} product={product} stale={stale || loading}
        nearestSort={results.search.sort === 'nearest'} evidence={results.explanation?.products.find(item => item.product_id === product.product_id)} />)}
      <div className="ua-pagination" aria-label="ادامهٔ نتایج محصولات">
        {pages.result.status === 'error' ? <>
          <ErrorCard message={pages.result.error} onRetry={!stale ? () => void pages.more() : undefined} />
          <Button tone="ghost" disabled={loading || !currentSearch.query.trim()} onClick={refresh}>از نو جست‌وجو کن</Button>
        </> : results.page.has_more ? <Button tone="secondary" disabled={stale || loading} onClick={() => void pages.more()}>
          {pages.result.status === 'loading' ? 'در حال دریافت محصولات بیشتر…' : 'محصولات بیشتر'}
        </Button> : results.page.items.length > 0 && <p className="ub-meta">پایان نتایج ثبت‌شده با این شرایط.</p>}
        {results.page.has_more && <p className="ub-meta">نتایج ادامه دارند؛ با انتخاب شما صفحهٔ بعد از همان کاتالوگ دریافت می‌شود، بدون درخواست تازه به مدل.</p>}
      </div>
    </>}
    <ProductComparison />
  </section>;
}
