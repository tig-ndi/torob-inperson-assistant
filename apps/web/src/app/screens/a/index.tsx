import type { Screen, CataloguePage } from '../../base/domain/contracts.ts';
import { DecideScreen } from './decide.tsx';
import { ResultsScreen } from './results.tsx';
import './discovery.css';

export function DiscoveryScreen({ screen }: { screen: Screen; catalogue: CataloguePage | null }) {
  if (screen === 'results') return <ResultsScreen />;
  if (screen !== 'home' && screen !== 'decide') return null;
  return <div className="uc-discovery">
    <DecideScreen start={screen === 'home'} />
  </div>;
}
