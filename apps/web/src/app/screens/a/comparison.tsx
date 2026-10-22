import { useEffect, useRef, useState } from 'react';
import type { CatalogueProduct } from '../../base/domain/contracts.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Badge, Button, Dialog, Empty, Price } from '../../base/ui/primitives.tsx';
import { comparisonRows } from './comparisonData.ts';
import './comparison.css';

const numbers = new Intl.NumberFormat('fa-IR');
const titleOf = (product: CatalogueProduct) => product.persian_title ?? 'عنوان ثبت نشده';

function ComparisonDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const products = state.compareProducts;
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const summary = useRef<HTMLParagraphElement>(null);
  const selectionKey = JSON.stringify(products.map(product => product.product_id));
  const previousKey = useRef(selectionKey);
  useEffect(() => {
    if (selectionKey === previousKey.current) return;
    previousKey.current = selectionKey;
    summary.current?.focus({ preventScroll: true });
    summary.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [selectionKey]);
  const rows = comparisonRows(products);
  const visibleRows = differencesOnly ? rows.filter(row => row.difference !== 'same') : rows;
  const remove = (product: CatalogueProduct) => {
    dispatch({ type: 'notice', value: null });
    dispatch({ type: 'compareProduct', value: product });
  };
  const select = (product: CatalogueProduct) => {
    onClose();
    dispatch({ type: 'product', value: product });
    dispatch({ type: 'navigate', screen: 'stores' });
  };
  return <Dialog title="مقایسهٔ محصولات" className="ua-comparison-dialog" onClose={onClose}>
    <div className="ua-comparison">
      <p ref={summary} tabIndex={-1} role="status">{numbers.format(products.length)} محصول انتخاب‌شده</p>
      <p className="ub-meta">قیمت‌ها تاریخی‌اند؛ موجودی و تناسب کالا تأیید نشده است.</p>
      {products.length < 2 ? <Empty title="برای مقایسه، دست‌کم دو محصول انتخاب کنید">
        {products.map(product => <div className="ua-comparison-choice" key={product.product_id}>
          <span>{titleOf(product)}</span><Button tone="ghost" onClick={() => remove(product)}>حذف از مقایسه</Button>
        </div>)}
        <Button tone="secondary" onClick={onClose}>بازگشت به نتایج</Button>
      </Empty> : <>
        {new Set(products.map(product => product.category_name)).size > 1 &&
          <p className="ua-notice">دسته‌های این انتخاب‌ها یکسان نیستند؛ کنار هم قرارگرفتن نام مشخصات، اثبات هم‌رده‌بودن یا تناسب کالاها نیست.</p>}
        <label className="ua-comparison-filter"><input type="checkbox" checked={differencesOnly}
          onChange={event => setDifferencesOnly(event.target.checked)} />فقط تفاوت‌ها و اطلاعات ناقص</label>
        <p className="ub-meta">جدول را افقی جابه‌جا کنید؛ ستون مشخصه ثابت می‌ماند.</p>
        <div className="ua-comparison-scroll" tabIndex={0} role="region" aria-label="جدول مقایسهٔ محصولات؛ قابل پیمایش افقی">
          <table className="ua-comparison-table" style={{ minWidth: `calc(var(--ua-label-width) + ${products.length * 192}px)` }}>
            <caption>مشخصات منبع و قیمت ثبت‌شدهٔ محصولات انتخاب‌شده</caption>
            <colgroup><col style={{ width: 'var(--ua-label-width)' }} />{products.map(product => <col key={product.product_id} />)}</colgroup>
            <thead><tr><th scope="col" className="ua-comparison-label">مشخصهٔ منبع</th>
              {products.map(product => <th scope="col" key={product.product_id}>
                <h3>{titleOf(product)}</h3>
                <div className="ua-comparison-column-actions">
                  <Button tone="ghost" aria-label={`حذف ${titleOf(product)} از مقایسه`} onClick={() => remove(product)}>حذف از مقایسه</Button>
                  <Button tone="secondary" onClick={() => select(product)}>دیدن فروشندگان</Button>
                </div>
              </th>)}
            </tr></thead>
            <tbody>
              <tr><th scope="row" className="ua-comparison-label">دستهٔ ثبت‌شده</th>{products.map(product => <td key={product.product_id}>{product.category_name ?? 'ثبت نشده'}</td>)}</tr>
              <tr><th scope="row" className="ua-comparison-label">برند · مدل</th>{products.map(product => <td key={product.product_id}>{product.brand_name ?? 'برند ثبت نشده'} · {product.model ?? 'مدل ثبت نشده'}</td>)}</tr>
              <tr><th scope="row" className="ua-comparison-label">کمترین قیمت ثبت‌شده</th>{products.map(product => <td key={product.product_id}><Price value={product.offer_summary.min_price_toman} /></td>)}</tr>
              <tr><th scope="row" className="ua-comparison-label">بیشترین قیمت ثبت‌شده</th>{products.map(product => <td key={product.product_id}><Price value={product.offer_summary.max_price_toman} /></td>)}</tr>
              {visibleRows.map(row => <tr key={row.id} className={`ua-comparison-row--${row.difference}`}>
                <th scope="row" className="ua-comparison-label"><span>{row.section?.trim() ? row.section : 'بخش ثبت نشده'}</span>
                  <strong>{row.key?.trim() ? row.key : 'کلید ثبت نشده'}</strong>
                  <Badge tone={row.difference === 'different' ? 'brand' : 'neutral'}>
                    {row.difference === 'different' ? 'تفاوت ثبت‌شده' : row.difference === 'same' ? 'متن یکسان' : 'اطلاعات ناقص'}
                  </Badge>{!row.aligned && <small>هم‌ترازی انجام نشد</small>}</th>
                {row.cells.map((cell, column) => <td key={products[column]?.product_id ?? column}>
                  {!cell.length ? <span className="ua-comparison-missing">ردیف متناظر ثبت نشده</span> : <>
                    {cell.length > 1 && <small>چند ردیف در منبع ثبت شده؛ همه حفظ شده‌اند.</small>}
                    <ul>{cell.map(item => <li key={item.sourceIndex}>{item.value?.trim() ? item.value : <span className="ua-comparison-missing">مقدار ثبت نشده</span>}</li>)}</ul>
                  </>}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        {!rows.length ? <p className="ua-notice">مشخصات فنی کافی برای هم‌ترازی در این پاسخ ثبت نشده است.</p>
          : !visibleRows.length && <p className="ua-notice">متن ردیف‌های قابل مقایسه یکسان است؛ این به معنی کیفیت یا کارایی یکسان نیست.</p>}
        <details className="ua-comparison-help"><summary>دربارهٔ شرایط و روش مقایسه</summary>
          <p>قیمت‌ها خلاصهٔ همهٔ آفرهای هر محصول‌اند، نه قیمتِ نزدیک‌ترین فروشنده.
            انتخاب‌های مقایسه مستقل از فیلتر فعلی‌اند؛ شرایط فعلی هنگام دریافت آفرهای فروشندگان بررسی می‌شوند.</p>
          <p>هم‌ترازی فقط با بخش و کلید دقیق منبع است. برچسب «تفاوت» دربارهٔ متن ثبت‌شده است، نه برتری کیفیت.</p>
        </details>
        <p className="ub-meta">مقدار غایب یا نامشخص، با مقدار منفی مانند «بدون دوربین» یکی نیست. هیچ امتیاز کیفیت یا برنده‌ای حدس زده نشده است.</p>
      </>}
    </div>
  </Dialog>;
}

export function ProductComparison() {
  const { state, dispatch } = useWorkspace();
  const products = state.compareProducts;
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    if (products.length < 2) requestAnimationFrame(() => document.getElementById('ua-results-title')?.focus());
  };
  const clear = () => {
    for (const product of products) dispatch({ type: 'compareProduct', value: product });
    dispatch({ type: 'notice', value: null });
    requestAnimationFrame(() => document.getElementById('ua-results-title')?.focus());
  };
  return <>
    {products.length > 0 && <aside className="ua-comparison-tray" aria-label="انتخاب‌های مقایسهٔ محصول">
      <div className="ua-comparison-tray-heading"><strong>{numbers.format(products.length)} محصول برای مقایسه</strong>
        <Button tone="ghost" onClick={clear}>حذف انتخاب‌ها</Button></div>
      {products.length < 2 && <p>یک محصول دیگر انتخاب کنید؛ سقف انتخاب ۳ محصول است.</p>}
      <Button disabled={products.length < 2} onClick={() => setOpen(true)}>مقایسه محصولات</Button>
    </aside>}
    {open && <ComparisonDialog onClose={close} />}
  </>;
}
