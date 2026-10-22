import { Empty } from '../../base/ui/primitives.tsx';
import type { Screen } from '../../base/domain/contracts.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { OffersPreview } from '../../base/ui/ContractPreview.tsx';

/** Stable mount point. B owns this file, screens/b and map. */
export function VisitScreen({ screen }: { screen: Screen }) {
  const { state } = useWorkspace();
  if (screen === 'stores' && state.product) return <OffersPreview />;
  const title = { stores: 'فروشندگان همین محصول', compare: 'مقایسهٔ آفرها', contact: 'پیش‌نویس پیگیری', trip: 'برنامهٔ مراجعه' };
  return <Empty title={title[screen as keyof typeof title] ?? 'انتخاب فروشنده'}>
    <p>نقشه و صفحه‌های مراجعه در تسک B تکمیل می‌شوند. تماس و تأیید موجودی واقعی در این نسخه وجود ندارد.</p>
  </Empty>;
}
