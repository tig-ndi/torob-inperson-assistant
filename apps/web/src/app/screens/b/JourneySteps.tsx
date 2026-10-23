import { CheckIcon } from '../../../presentation/icons-motion/icons.tsx';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import type { Screen } from '../../base/domain/contracts.ts';

const steps: { screen: Screen; label: string }[] = [
  { screen: 'results', label: 'انتخاب محصول' },
  { screen: 'stores', label: 'فروشگاه‌های نزدیک' },
  { screen: 'compare', label: 'مقایسه' },
  { screen: 'trip', label: 'تأیید و مراجعه' },
];

/** Figma-style journey header. The shared shell stepper stays untouched for A. */
export function JourneySteps() {
  const { state, dispatch } = useWorkspace();
  const current = state.screen === 'stores' ? 1 : state.screen === 'compare' ? 2
    : state.screen === 'contact' || state.screen === 'trip' ? 3 : 0;
  return <nav className="uv-steps" aria-label="مسیر خرید حضوری">
    {steps.map((step, index) => {
      const done = index < current || (index === 2 && state.compareOffers.length >= 2 && current > 2);
      return <button key={step.screen} type="button" className="uv-step"
        data-state={index === current ? 'current' : done ? 'done' : 'todo'}
        aria-current={index === current ? 'step' : undefined}
        onClick={() => dispatch({ type: 'navigate', screen: step.screen })}>
        <span className="uv-step-dot">{done ? <CheckIcon size={13} /> : <bdi>{new Intl.NumberFormat('fa-IR').format(index + 1)}</bdi>}</span>
        <span>{step.label}</span>
      </button>;
    })}
  </nav>;
}
