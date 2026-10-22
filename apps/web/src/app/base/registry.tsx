import type { CataloguePage, Screen } from './domain/contracts.ts';
import { DiscoveryScreen } from '../screens/a/index.tsx';
import { VisitScreen } from '../screens/b/index.tsx';

export const screenLabels: Record<Screen, string> = {
  home: 'شروع', decide: 'بررسی نیاز', results: 'محصول‌ها', stores: 'فروشندگان', compare: 'مقایسهٔ آفر', contact: 'پیگیری', trip: 'مراجعه',
};
export function ScreenOutlet({ screen, catalogue }: { screen: Screen; catalogue: CataloguePage | null }) {
  return ['home', 'decide', 'results'].includes(screen) ? <DiscoveryScreen screen={screen} catalogue={catalogue} /> : <VisitScreen screen={screen} />;
}
