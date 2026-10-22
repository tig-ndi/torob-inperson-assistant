import { useState, type FormEvent } from 'react';
import { formatBudgetInput, normalizeBudget, numberToPersianWords, validateBudget } from '../../../api.ts';
import { useWorkspace } from '../state/Workspace.tsx';
import { Button, Dialog, ErrorCard } from './primitives.tsx';

export function FiltersDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const [budget, setBudget] = useState(state.filters.maxPrice ?? '');
  const [radius, setRadius] = useState(state.filters.radiusKm?.toString() ?? '');
  const [sort, setSort] = useState(state.filters.sort), [open, setOpen] = useState(state.filters.openNowOnly);
  const [credit, setCredit] = useState(state.filters.creditOnly), [error, setError] = useState<string | null>(null);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeBudget(budget), valid = validateBudget(normalized);
    if (!valid.valid) { setError(valid.error ?? 'بودجه معتبر نیست.'); return; }
    const radiusKm = radius.trim() ? Number(radius) : null;
    if (radiusKm !== null && (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 1000)) { setError('شعاع باید بزرگ‌تر از صفر و حداکثر ۱۰۰۰ کیلومتر باشد.'); return; }
    if (!state.position && (radiusKm !== null || sort === 'nearest')) { setError('برای شعاع یا نزدیک‌ترین، ابتدا موقعیت را مشخص کنید.'); return; }
    dispatch({ type: 'filters', value: { maxPrice: normalized || null, radiusKm, sort, openNowOnly: open, creditOnly: credit } });
    onClose();
  };
  return <Dialog title="شرایط جست‌وجو" onClose={onClose}><form onSubmit={apply} className="ub-form">
    <label>سقف بودجه به تومان<input inputMode="numeric" value={formatBudgetInput(budget)} onChange={e => setBudget(e.target.value)} placeholder="بدون سقف بودجه" />
      <span className="ub-meta" aria-live="polite">{!budget.trim() ? 'بدون سقف بودجه' : numberToPersianWords(normalizeBudget(budget)) ?? 'مبلغ را با ارقام وارد کنید.'}</span></label>
    <label>شعاع هوایی به کیلومتر<input type="number" min="0.1" max="1000" step="0.1" value={radius} onChange={e => setRadius(e.target.value)} placeholder="بدون فیلتر شعاع" /></label>
    <label>مرتب‌سازی<select value={sort} onChange={e => setSort(e.target.value === 'nearest' ? 'nearest' : 'price')}>
      <option value="price">کمترین قیمت ثبت‌شده</option><option value="nearest">نزدیک‌ترین فروشنده</option></select></label>
    <label className="ub-check"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} />فقط باز طبق برنامهٔ اعلام‌شده</label>
    <label className="ub-check"><input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)} />فقط منطبق با شرایط ثبت‌شدهٔ اعتبار حضوری</label>
    <p className="ub-meta">شعاع، ساعت و اعتبار روی آفرهای فروشندگان اعمال می‌شوند؛ بودجه در جست‌وجوی محصول هم اثر دارد.</p>
    <p className="ub-meta">ساعت و شرایط پرداخت اعلامی‌اند؛ موجودی و تأیید اعتبار خریدار را اثبات نمی‌کنند.</p>
    {error && <ErrorCard message={error} />}<Button type="submit">اعمال شرایط</Button>
  </form></Dialog>;
}
