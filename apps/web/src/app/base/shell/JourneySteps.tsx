import { useWorkspace } from '../state/Workspace.tsx';
import type { Screen } from '../domain/contracts.ts';

export function JourneySteps() {
  const { state, dispatch } = useWorkspace();
  const steps: { screen: Screen; label: string; short: string; available: boolean }[] = [
    { screen: state.productResults ? 'results' : 'decide', label: 'انتخاب محصول', short: 'انتخاب کالا', available: true },
    { screen: 'stores', label: 'فروشندگان', short: 'فروشگاه‌ها', available: state.product !== null },
    { screen: 'compare', label: 'مقایسه', short: 'مقایسه', available: state.compareOffers.length >= 2 },
    { screen: state.visitPlan ? 'trip' : 'contact', label: 'پیگیری و مراجعه', short: 'مراجعه', available: state.selectedOffer !== null || state.visitPlan !== null },
  ];
  const current = state.screen === 'stores' ? 1 : state.screen === 'compare' ? 2
    : state.screen === 'contact' || state.screen === 'trip' ? 3 : 0;
  return <nav className="ub-stepper" aria-label="مسیر خرید">
    {steps.map((step, index) => {
      return <button key={index} type="button" disabled={!step.available}
        aria-label={`${new Intl.NumberFormat('fa-IR').format(index + 1)} ${step.label}`}
        title={!step.available ? index === 1 ? 'ابتدا محصول را انتخاب کنید' : index === 2 ? 'دو آفر را برای مقایسه انتخاب کنید' : 'ابتدا یک آفر را انتخاب کنید' : undefined}
        aria-current={index === current ? 'step' : undefined}
        onClick={() => dispatch({ type: 'navigate', screen: step.screen })}>
        <span aria-hidden="true">{new Intl.NumberFormat('fa-IR').format(index + 1)}</span>
        <span className="ub-step-label" aria-hidden="true">{step.short}</span>
      </button>;
    })}
  </nav>;
}
