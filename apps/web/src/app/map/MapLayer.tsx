import type { Position } from '../base/domain/contracts.ts';
export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  offerIds: string[];
  state: 'declared_open' | 'declared_closed' | 'unknown';
};
export type MapLayerProps = {
  userPosition: Position | null;
  radiusKm: number | null;
  pins: MapPin[];
  selectedPinId: string | null;
  onPinSelect: (pinId: string) => void;
  onPositionPick?: (lat: number, lon: number) => void;
  cameraIntent: { revision: number; kind: 'all' | 'user' | 'selection' } | null;
  padding: { top: number; right: number; bottom: number; left: number };
};
/** B owns the implementation. This neutral surface must never impersonate a map. */
export function MapLayer({ pins, userPosition, onPinSelect, selectedPinId }: MapLayerProps) {
  return <section className="ub-map-placeholder" aria-label="جایگاه نقشه">
    <div className="ub-map-message"><span className="ub-map-symbol" aria-hidden="true">⌖</span>
      <h2>فروشگاه‌ها روی نقشه</h2><p>نقشهٔ واقعی در بخش B متصل می‌شود؛ فهرست فروشندگان مستقل از نقشه در دسترس است.</p>
      <span className="ub-meta">{userPosition?.label ?? 'موقعیت هنوز انتخاب نشده'}</span>
      {pins.length > 0 && <ul>{pins.map(p => <li key={p.id}><button aria-pressed={p.id === selectedPinId} onClick={() => onPinSelect(p.id)}>{p.label}</button></li>)}</ul>}
    </div>
  </section>;
}
