export type AssistantActivityPhase =
  | 'idle'
  | 'checking'
  | 'pending'
  | 'success'
  | 'error'
  | 'cancelled';

const LABELS = {
  checking: 'در حال بررسی دسترسی دستیار…',
  pending: 'در حال بررسی درخواست…',
};

export function AssistantActivity({ phase }: { phase: AssistantActivityPhase }) {
  if (phase !== 'checking' && phase !== 'pending') return null;
  return (
    <p className="tia-activity" role="status" aria-atomic="true" data-phase={phase}>
      <span className="tia-motion-spinner" aria-hidden="true" />
      <span>{LABELS[phase]}</span>
    </p>
  );
}
