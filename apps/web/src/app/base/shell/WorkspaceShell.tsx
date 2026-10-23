import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { catalogueSearchForWorkspace } from '../state/model.ts';
import { useResolvedTheme } from '../state/useResolvedTheme.ts';
import { MapViewProvider } from './MapView.tsx';

export function WorkspaceShell() {
  const { state, dispatch } = useWorkspace();
  const catalogue = useCatalogue();
  const [overlay, setOverlay] = useState<'filters' | 'location' | null>(null);
  const [sheet, setSheet] = useState<'half' | 'full'>('half');
  const mapElement = useRef<HTMLDivElement>(null);
  const panelElement = useRef<HTMLElement>(null);
  const theme = useResolvedTheme();
  useEffect(() => { if (state.screen === 'stores') setSheet('full'); }, [state.screen]);
  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
  }, [theme]);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    const page = await catalogue.search(catalogueSearchForWorkspace(state));
    if (page) dispatch({ type: 'navigate', screen: 'results' });
  };
  const steps: { label: string; screen: Screen }[] = [
    { label: 'انتخاب محصول', screen: 'results' }, { label: 'فروشندگان', screen: 'stores' },
    { label: 'مقایسه', screen: 'compare' }, { label: 'پیگیری و مراجعه', screen: 'contact' },
  ];
  const visit = ['stores', 'compare', 'contact', 'trip'].includes(state.screen);
  const revealMap = () => {
    setSheet('half');
    requestAnimationFrame(() => {
      mapElement.current?.focus({ preventScroll: true });
      mapElement.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  const showList = () => {
    setSheet('full');
    requestAnimationFrame(() => {
      panelElement.current?.focus({ preventScroll: true });
      panelElement.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  return <MapViewProvider value={{ revealMap, showList }}><div className="ub-app" data-sheet={sheet} data-visit={visit}
    data-layout={visit && state.product ? 'visit' : 'discovery'} data-resolved-theme={theme}>
    <a href="#workspace-panel" className="ub-skip">رفتن به محتوای اصلی</a>
    <header className="ub-header">
      <button type="button" className="ub-brand" aria-label="رفتن به شروع" onClick={() => dispatch({ type: 'navigate', screen: 'home' })}><span aria-hidden="true">ت</span><div>خرید حضوری<small>دستیار انتخاب در تهران</small></div></button>
      <div className="ub-header-actions"><label className="ub-theme">نمایش<select aria-label="تم نمایش" value={state.theme}
        onChange={e => dispatch({ type: 'theme', value: e.target.value === 'dark' ? 'dark' : e.target.value === 'light' ? 'light' : 'system' })}>
        <option value="system">سیستم</option><option value="light">روشن</option><option value="dark">تیره</option></select></label>
      </div>
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
      <div className="ub-map" ref={mapElement} tabIndex={-1} aria-label="فضای نقشهٔ فروشندگان"><MapLayer userPosition={state.position} radiusKm={state.filters.radiusKm} pins={pinsForWorkspace(state)}
        selectedPinId={state.selectedOffer?.shop_id ?? null} onPinSelect={shopId => dispatch({ type: 'focusShop', shopId })} cameraIntent={state.cameraIntent}
        padding={{ top: 20, left: 20, right: 20, bottom: 20 }} /></div>
      <section id="workspace-panel" ref={panelElement} className="ub-panel" aria-label="فضای انتخاب کالا" tabIndex={-1}>
        <div className="ub-panel-top"><Button tone="ghost" disabled={!state.navigation.length} onClick={() => dispatch({ type: 'back' })} aria-label="بازگشت به مرحلهٔ قبل"><ChevronRightIcon /></Button>
          <strong>{screenLabels[state.screen]}</strong>{visit && <Button className="ub-sheet-control" tone="ghost" aria-expanded={sheet === 'full'}
            onClick={() => setSheet(s => s === 'full' ? 'half' : 'full')}>{sheet === 'full' ? 'نقشه و فهرست' : 'فهرست کامل'}</Button>}</div>
        <nav className="ub-stepper" aria-label="مسیر خرید">{steps.map((step, i) => <button key={step.screen}
          aria-current={state.screen === step.screen || (i === 0 && ['home', 'decide'].includes(state.screen)) ||
            (i === 3 && state.screen === 'trip') ? 'step' : undefined}
          onClick={() => dispatch({ type: 'navigate', screen: step.screen })}><span>{new Intl.NumberFormat('fa').format(i + 1)}</span>{step.label}</button>)}</nav>
        <div className="ub-panel-body">
          {catalogue.result.status === 'loading' && <Skeleton />}
          {catalogue.result.status === 'error' && <ErrorCard message={catalogue.result.error} failure={catalogue.result.failure} />}
          <ScreenOutlet screen={state.screen} catalogue={catalogue.result.data} />
        </div>
        <footer className="ub-panel-footer">
          <span>قیمت تاریخی ≠ موجودی قطعی</span>
          {state.selectedOffer && <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'contact' })}>پیگیری انتخاب</Button>}</footer>
      </section>
    </main>
    <Toast message={state.notice} onClose={() => dispatch({ type: 'notice', value: null })} />
    {overlay === 'filters' && <FiltersDialog onClose={() => setOverlay(null)} />}
    {overlay === 'location' && <LocationDialog onClose={() => setOverlay(null)} />}
  </div></MapViewProvider>;
}
