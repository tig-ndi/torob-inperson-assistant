import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Button, Price } from '../../base/ui/primitives.tsx';
import { CompareIcon, StoreIcon } from '../../../presentation/icons-motion/icons.tsx';
import { catalogueSearchKey, catalogueSearchForWorkspace } from '../../base/state/model.ts';
import { ProductComparison } from './comparison.tsx';

export function ChatProducts() {
  const { state, dispatch } = useWorkspace();
  const results = state.productResults;
  if (!results || results.source !== 'assistant') return null;
  const stale = catalogueSearchKey(results.search) !== catalogueSearchKey(catalogueSearchForWorkspace(state));
  return <section className="uc-product-preview" aria-label="گزینه‌های همین پاسخ">
    <div className="uc-section-title"><h3>گزینه‌ها را با هم ببینیم</h3>
      <span>از نتایج ثبت‌شده؛ بدون رتبه‌بندی تناسب</span></div>
    {stale && <p role="status">شرایط تغییر کرده؛ برای استفاده از این نتایج، جست‌وجو را به‌روز کن.</p>}
    {results.page.items.slice(0, 3).map(product => {
      const compared = state.compareProducts.some(item => item.product_id === product.product_id);
      return <article className="uc-product" key={product.product_id}>
        <div><h4>{product.persian_title ?? 'محصول بدون عنوان'}</h4>
          <p>{product.category_name ?? 'دسته ثبت نشده'}</p><Price value={product.offer_summary.min_price_toman} /></div>
        <div className="uc-product-actions"><Button disabled={stale} tone="secondary" onClick={() => {
          dispatch({ type: 'product', value: product }); dispatch({ type: 'navigate', screen: 'stores' });
        }}><StoreIcon size={16} />فروشگاه‌ها</Button>
          <Button disabled={stale && !compared} tone="ghost" aria-pressed={compared} aria-label={`${compared ? 'حذف' : 'افزودن'} ${product.persian_title ?? 'محصول'} ${compared ? 'از' : 'به'} مقایسه`}
            onClick={() => dispatch({ type: 'compareProduct', value: product })}><CompareIcon size={16} />{compared ? 'انتخاب شد' : 'مقایسه'}</Button></div>
      </article>;
    })}
    <p className="ub-meta">کمترین قیمت تاریخی هر محصول؛ قیمت و موجودی امروز باید پیش از مراجعه بررسی شود.</p>
    <ProductComparison />
  </section>;
}
