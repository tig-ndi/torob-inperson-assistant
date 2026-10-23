import { useEffect } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Button, Empty } from '../../base/ui/primitives.tsx';
import type { Screen } from '../../base/domain/contracts.ts';
import { StoresScreen } from './Stores.tsx';
import { CompareScreen } from './Compare.tsx';
import { FollowupScreen } from './Followup.tsx';
import { TripScreen } from './Trip.tsx';
import { JourneySteps } from './JourneySteps.tsx';
import './b.css';

/** Stable mount point. B owns this file, screens/b and map. */
export function VisitScreen({ screen }: { screen: Screen }) {
  const { state, dispatch } = useWorkspace();
  useEffect(() => {
    const panel = document.getElementById('workspace-panel');
    if (!panel) return;
    if (window.matchMedia('(max-width: 959px)').matches) {
      // A selected product starts the visit workspace; keeping the old list scroll would hide its first store.
      panel.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo(0, 0);
      panel.querySelector('.ub-panel-body')?.scrollTo({ top: 0 });
    }
    // After navigation the previous action can be gone; focus the named panel instead of losing focus.
    panel.focus({ preventScroll: true });
  }, [screen]);
  if (!state.product) return <Empty title="برای فروشندگان و مراجعه، ابتدا یک محصول انتخاب کنید">
    <p>آفرها همیشه برای یک محصول مشخص‌اند؛ انتخاب محصول در بخش کشف/نتایج انجام می‌شود.</p>
    <Button onClick={() => dispatch({ type: 'navigate', screen: 'results' })}>رفتن به انتخاب محصول</Button>
  </Empty>;
  return <div className="uv-visit" data-theme-mode={state.theme} data-screen={screen}>
    <JourneySteps />
    <div className="uv-visit-screen">
      {screen === 'stores' ? <StoresScreen /> : screen === 'compare' ? <CompareScreen />
        : screen === 'contact' ? <FollowupScreen key={state.selectedOffer?.offer_id ?? 'no-offer'} />
          : screen === 'trip' ? <TripScreen />
            : <Empty title="این صفحه متعلق به بخش فروشندگان نیست"><p>صفحهٔ انتخاب کالا و نتایج در بخش A قرار دارد.</p></Empty>}
    </div>
  </div>;
}
