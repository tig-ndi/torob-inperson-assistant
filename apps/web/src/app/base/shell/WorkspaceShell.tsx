import { useEffect, useState, type FormEvent } from 'react';
import { SearchIcon, ChevronRightIcon } from '../../../presentation/icons-motion/icons.tsx';
import { MapLayer } from '../../map/MapLayer.tsx';
import { ScreenOutlet, screenLabels } from '../registry.tsx';
import { useWorkspace } from '../state/Workspace.tsx';
import { useCatalogue } from '../state/hooks.ts';
import { Badge, Button, ErrorCard, Skeleton, Toast } from '../ui/primitives.tsx';
import { FiltersDialog } from '../ui/FiltersDialog.tsx';
import { LocationDialog } from '../ui/LocationDialog.tsx';
import { formatMoney } from '../domain/presentation.ts';
import type { Screen } from '../domain/contracts.ts';
import { pinsForWorkspace } from '../domain/mapPins.ts';

export function WorkspaceShell() {
  const { state, dispatch } = useWorkspace();
  const catalogue = useCatalogue();
  const [overlay, setOverlay] = useState<'filters' | 'location' | null>(null);
  const [sheet, setSheet] = useState<'half' | 'full'>('half');
  useEffect(() => { if (state.screen === 'stores') setSheet('full'); }, [state.screen]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.uiTheme = state.theme === 'system' ? (media.matches ? 'dark' : 'light') : state.theme; };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state.theme]);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    const context = state.needState?.topic_query === state.query ? state.needState : null;
    const page = await catalogue.search({ query: state.query, maxPrice: state.filters.maxPrice,
      categoryName: context?.category_name, categoryCleared: context?.category_cleared,
      minimumBattery: context?.battery_requirement.status === 'minimum' ? context.battery_requirement.minimum_mah : null,
      sort: state.filters.sort === 'nearest' ? 'nearest' : 'relevance', position: state.position });
    if (page) dispatch({ type: 'navigate', screen: 'results' });
  };
  const steps: { label: string; screen: Screen }[] = [
    { label: 'انتخاب محصول', screen: 'results' }, { label: 'فروشندگان', screen: 'stores' },
    { label: 'مقایسه', screen: 'compare' }, { label: 'پیگیری و مراجعه', screen: 'contact' },
  ];
  const visit = ['stores', 'compare', 'contact', 'trip'].includes(state.screen);
  return <div className="ub-app" data-sheet={sheet} data-visit={visit}>
    <a href="#workspace-panel" className="ub-skip">رفتن به محتوای اصلی</a>
    <header className="ub-header">
      <a className="ub-brand" href="/design.html"><span aria-hidden="true">ت</span><div>خرید حضوری<small>دستیار انتخاب در تهران</small></div></a>
      <div className="ub-header-actions"><label className="ub-theme">نمایش<select aria-label="تم نمایش" value={state.theme}
        onChange={e => dispatch({ type: 'theme', value: e.target.value === 'dark' ? 'dark' : e.target.value === 'light' ? 'light' : 'system' })}>
        <option value="system">سیستم</option><option value="light">روشن</option><option value="dark">تیره</option></select></label>
        <a className="ub-legacy-link" href="/">رابط فعلی</a></div>
    </header>
    <section className="ub-search-area" aria-label="جست‌وجو و شرایط">
      <form className="ub-search" onSubmit={search}>
        <SearchIcon size={22} /><label className="ub-sr-only" htmlFor="workspace-query">نام کالا در کاتالوگ</label>
        <input id="workspace-query" value={state.query} onChange={e => dispatch({ type: 'query', value: e.target.value })}
          maxLength={120} placeholder="چه کالایی می‌خواهید؟ مثلاً گوشی سامسونگ" />
        <Button type="submit" disabled={!state.query.trim() || catalogue.result.status === 'loading'}>جست‌وجو</Button>
      </form>
      <div className="ub-filter-row"><Button tone="secondary" onClick={() => setOverlay('location')}>⌖ {state.position?.label ?? 'انتخاب موقعیت'}</Button>
        <Button tone="secondary" onClick={() => setOverlay('filters')}>شرایط جست‌وجو</Button>
        {state.filters.maxPrice !== null && <button className="ub-chip" onClick={() => dispatch({ type: 'filters', value: { maxPrice: null } })}
          aria-label="حذف سقف بودجه">تا {formatMoney(state.filters.maxPrice)} ×</button>}
        {state.filters.radiusKm !== null && <Badge>شعاع هوایی {state.filters.radiusKm} کیلومتر</Badge>}
        {state.filters.openNowOnly && <Badge>باز طبق برنامه</Badge>}{state.filters.creditOnly && <Badge>اعتبار حضوری</Badge>}
      </div>
    </section>
    <main className="ub-workspace">
      <div className="ub-map"><MapLayer userPosition={state.position} radiusKm={state.filters.radiusKm} pins={pinsForWorkspace(state)}
        selectedPinId={state.selectedOffer?.shop_id ?? null} onPinSelect={shopId => dispatch({ type: 'focusShop', shopId })} cameraIntent={state.cameraIntent}
        padding={{ top: 20, left: 20, right: 20, bottom: 20 }} /></div>
      <section id="workspace-panel" className="ub-panel" aria-label="فضای انتخاب کالا" tabIndex={-1}>
        <div className="ub-panel-top"><Button tone="ghost" disabled={!state.navigation.length} onClick={() => dispatch({ type: 'back' })} aria-label="بازگشت به مرحلهٔ قبل"><ChevronRightIcon /></Button>
          <strong>{screenLabels[state.screen]}</strong>{visit && <Button className="ub-sheet-control" tone="ghost" aria-expanded={sheet === 'full'}
            onClick={() => setSheet(s => s === 'full' ? 'half' : 'full')}>{sheet === 'full' ? 'نقشه و فهرست' : 'فهرست کامل'}</Button>}</div>
        <nav className="ub-stepper" aria-label="مسیر خرید">{steps.map((step, i) => <button key={step.screen}
          aria-current={state.screen === step.screen || (i === 0 && ['home', 'decide'].includes(state.screen)) ||
            (i === 3 && state.screen === 'trip') ? 'step' : undefined}
          onClick={() => dispatch({ type: 'navigate', screen: step.screen })}><span>{new Intl.NumberFormat('fa').format(i + 1)}</span>{step.label}</button>)}</nav>
        <div className="ub-panel-body">
          <div className="ub-base-note"><Badge tone="brand">پایهٔ مشترک A/B</Badge><p>اتصال کاتالوگ واقعی است؛ صفحه‌های اختصاصی و نقشه هنوز در حال تکمیل‌اند.</p></div>
          {catalogue.result.status === 'loading' && <Skeleton />}
          {catalogue.result.status === 'error' && <ErrorCard message={catalogue.result.error} />}
          <ScreenOutlet screen={state.screen} catalogue={catalogue.result.data} />
        </div>
        <footer className="ub-panel-footer"><details className="ub-base-pages"><summary>صفحه‌های پایه</summary><nav aria-label="صفحه‌های پایه">{Object.entries(screenLabels).map(([screen, label]) =>
          <button key={screen} onClick={() => dispatch({ type: 'navigate', screen: screen as Screen })}>{label}</button>)}</nav></details>
          <span>قیمت تاریخی ≠ موجودی قطعی</span>
          {state.selectedOffer && <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'contact' })}>پیگیری انتخاب</Button>}</footer>
      </section>
    </main>
    <Toast message={state.notice} onClose={() => dispatch({ type: 'notice', value: null })} />
    {overlay === 'filters' && <FiltersDialog onClose={() => setOverlay(null)} />}
    {overlay === 'location' && <LocationDialog onClose={() => setOverlay(null)} />}
  </div>;
}
