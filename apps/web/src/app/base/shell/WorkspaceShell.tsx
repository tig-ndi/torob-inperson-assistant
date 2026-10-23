import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronRightIcon, SparklesIcon, MapPinIcon, RestartIcon } from '../../../presentation/icons-motion/icons.tsx';
import { MapLayer } from '../../map/MapLayer.tsx';
import { ScreenOutlet, screenLabels } from '../registry.tsx';
import { DiscoveryScreen } from '../../screens/a/index.tsx';
import { useWorkspace } from '../state/Workspace.tsx';
import { Badge, Button, Toast } from '../ui/primitives.tsx';
import { FiltersDialog } from '../ui/FiltersDialog.tsx';
import { LocationDialog } from '../ui/LocationDialog.tsx';
import { pinsForWorkspace } from '../domain/mapPins.ts';
import { canPlanOffer } from '../state/model.ts';
import { useResolvedTheme } from '../state/useResolvedTheme.ts';
import { MapViewProvider } from './MapView.tsx';
import { JourneySteps } from './JourneySteps.tsx';
import { useMapPadding } from './useMapPadding.ts';
import { ThemeControl } from '../ui/ThemeControl.tsx';

export function WorkspaceShell() {
  const { state, dispatch } = useWorkspace();
  const [overlay, setOverlay] = useState<'filters' | 'location' | null>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const panelElement = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const chat = state.screen === 'home' || state.screen === 'decide';
  useEffect(() => { document.documentElement.dataset.uiTheme = theme; }, [theme]);
  const mapPadding = useMapPadding(mapElement, panelElement, toolbar, true, 'persistent');
  const focusAgent = () => {
    dispatch({ type: 'navigate', screen: 'decide' });
    requestAnimationFrame(() => document.getElementById('ua-need')?.focus({ preventScroll: false }));
  };
  const revealMap = () => { mapElement.current?.focus({ preventScroll: true }); };
  const sendMapPrompt = (event: FormEvent) => {
    event.preventDefault();
    if (!state.needDraft.trim()) return;
    dispatch({ type: 'navigate', screen: 'decide' });
    // Native form submission reuses the sole conversation handler and its guards.
    const form = document.getElementById('uc-agent-message-form');
    if (form instanceof HTMLFormElement) form.requestSubmit();
  };
  const showList = () => { panelElement.current?.focus({ preventScroll: true }); };
  useEffect(() => { if (panelBody.current) panelBody.current.scrollTop = 0; }, [state.screen]);
  return <MapViewProvider value={{ revealMap, showList }}><div className="ub-app uc-map-workspace" data-layout="visit" data-screen={state.screen} data-resolved-theme={theme}>
    <a href="#workspace-panel" className="ub-skip">رفتن به محتوای اصلی</a>
    <header className="uc-workspace-header"><button type="button" className="ub-brand" aria-label="رفتن به شروع" onClick={focusAgent}><span aria-hidden="true">ترب</span><div>همراه خرید حضوری<small>از گفت‌وگو تا مراجعه، در یک جا</small></div></button>
      <Badge>تهران · کاتالوگ تاریخی</Badge><ThemeControl /></header>
    <main className="ub-workspace">
      <div className="ub-map" ref={mapElement} tabIndex={-1} aria-label="فضای نقشهٔ فروشندگان"><MapLayer userPosition={state.position} radiusKm={state.filters.radiusKm} pins={pinsForWorkspace(state)}
        selectedPinId={state.selectedOffer?.shop_id ?? null} onPinSelect={shopId => dispatch({ type: 'focusShop', shopId })}
        onPositionPick={(lat, lon) => {
          dispatch({ type: 'position', value: { lat, lon, source: 'manual', label: 'موقعیت انتخابی روی نقشه', accuracyMeters: null } });
          dispatch({ type: 'notice', value: 'مبدأ روی نقشه تنظیم شد؛ فاصله‌ها بر اساس همین نقطه‌اند.' });
        }} cameraIntent={state.cameraIntent} padding={mapPadding} /></div>
      <aside className="uc-map-tools" ref={toolbar} aria-label="همراه روی نقشه">
        <form className="uc-map-agent uc-map-prompt" onSubmit={sendMapPrompt}>
          <SparklesIcon size={23} />
          <input aria-label="پیام به دستیار روی نقشه" placeholder="چی می‌خوای بخری؟" value={state.needDraft} maxLength={1000}
            onChange={event => dispatch({ type: 'needDraft', value: event.target.value })}
            onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} />
          <Button type="button" tone="ghost" aria-label="گفت‌وگوی صوتی از نقشه" title="گفت‌وگوی صوتی" onClick={() => {
            focusAgent(); document.querySelector<HTMLButtonElement>('[data-uc-voice]')?.click();
          }}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg></Button>
          <Button type="submit" disabled={!state.needDraft.trim()} aria-label="ارسال پیام از نقشه" title="ارسال پیام">←</Button>
        </form>
        <div><Button tone="secondary" onClick={() => setOverlay('location')}><MapPinIcon size={16} />{state.position?.label ?? 'انتخاب موقعیت'}</Button>
          <Button tone="secondary" onClick={() => setOverlay('filters')}>شرایط خرید</Button>
          {state.filters.radiusKm !== null && <Badge>شعاع {new Intl.NumberFormat('fa-IR').format(state.filters.radiusKm)} کیلومتر</Badge>}</div>
      </aside>
      <section id="workspace-panel" ref={panelElement} className="ub-panel" aria-label="فضای انتخاب کالا" tabIndex={-1}>
        <div className="ub-panel-top"><Button tone="ghost" disabled={!state.navigation.length} onClick={() => dispatch({ type: 'back' })} aria-label="بازگشت به مرحلهٔ قبل"><ChevronRightIcon size={20} /></Button>
          <Button tone="ghost" className="uc-agent-tab" aria-current={chat ? 'page' : undefined} aria-label="ادامهٔ گفت‌وگو با دستیار" onClick={focusAgent}>گفت‌وگو</Button>
          <h2>{chat ? 'دستیار خرید حضوری' : screenLabels[state.screen]}</h2>
          {chat && state.history.length > 0 && <Button tone="ghost" aria-label="گفت‌وگوی تازه" onClick={() => dispatch({ type: 'newConversation' })}><RestartIcon size={16} /></Button>}
          {state.productResults && !chat && <Button tone="ghost" onClick={() => dispatch({ type: 'navigate', screen: 'results' })}>محصولات</Button>}</div>
        <div className="ub-sheet-steps"><JourneySteps /></div>
        <div id="workspace-panel-content" className="ub-panel-body" ref={panelBody}>
          {/* One mounted conversation; only the surrounding stage changes. */}
          <div className="uc-agent-slot" hidden={!chat}><DiscoveryScreen screen={chat ? state.screen : 'decide'} catalogue={null} /></div>
          {!chat && <ScreenOutlet screen={state.screen} catalogue={null} />}
        </div>
        <footer className="ub-panel-footer"><span>موجودی زنده تأیید نشده</span>
          {chat && state.productResults && <Button onClick={() => dispatch({ type: 'navigate', screen: 'results' })}>بررسی محصولات ←</Button>}
          {state.selectedOffer && ['stores', 'compare'].includes(state.screen) && <Button onClick={() => dispatch({ type: 'navigate', screen: 'contact' })}>ادامه با آفر انتخابی ←</Button>}
          {state.selectedOffer && state.screen === 'contact' && <Button disabled={!state.visitPlan && !canPlanOffer(state, state.selectedOffer)} onClick={() => {
            if (!state.visitPlan) dispatch({ type: 'plan', primary: state.selectedOffer! });
            dispatch({ type: 'navigate', screen: 'trip' });
          }}>برنامهٔ مراجعه ←</Button>}
          {state.screen === 'trip' && state.selectedOffer && <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'contact' })}>بازگشت به پیگیری</Button>}
        </footer>
      </section>
    </main>
    <Toast message={state.notice} onClose={() => dispatch({ type: 'notice', value: null })} />
    {overlay === 'filters' && <FiltersDialog onClose={() => setOverlay(null)} />}
    {overlay === 'location' && <LocationDialog onClose={() => setOverlay(null)} />}
  </div></MapViewProvider>;
}
