import { Empty } from '../../base/ui/primitives.tsx';
import type { Screen } from '../../base/domain/contracts.ts';
import type { CataloguePage } from '../../base/domain/contracts.ts';
import { CataloguePreview } from '../../base/ui/ContractPreview.tsx';

/** Stable mount point. A may replace this file and add files only in screens/a. */
export function DiscoveryScreen({ screen, catalogue }: { screen: Screen; catalogue: CataloguePage | null }) {
  if (screen === 'results' && catalogue) return <CataloguePreview page={catalogue} />;
  return <Empty title={screen === 'decide' ? 'نیازتان را دقیق‌تر بررسی کنیم' : screen === 'results' ? 'انتخاب محصول' : 'برای خرید حضوری، از نیازتان شروع کنید'}>
    <p>ورودی بالای صفحه به کاتالوگ واقعی وصل است. صفحه‌های کشف، گفت‌وگو و مقایسهٔ محصول در تسک A تکمیل می‌شوند.</p>
  </Empty>;
}
