import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseCoordinateWithValidation } from '../../../api.ts';
import { tehranDistricts } from '../../../tehranNeighborhoods.ts';
import { useWorkspace } from '../state/Workspace.tsx';
import { Button, Dialog, ErrorCard } from './primitives.tsx';

export function LocationDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const [lat, setLat] = useState(state.position?.lat.toString() ?? ''), [lon, setLon] = useState(state.position?.lon.toString() ?? '');
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const manual = (event: FormEvent) => {
    event.preventDefault();
    const a = parseCoordinateWithValidation(lat, 'lat'), b = parseCoordinateWithValidation(lon, 'lon');
    if (a.status !== 'valid' || b.status !== 'valid') { setError('طول و عرض جغرافیایی معتبر را وارد کنید.'); return; }
    dispatch({ type: 'position', value: { lat: a.value, lon: b.value, source: 'manual', label: 'نقطهٔ انتخاب‌شدهٔ شما', accuracyMeters: null } }); onClose();
  };
  const locate = () => {
    if (!navigator.geolocation) { setError('موقعیت‌یابی در این مرورگر در دسترس نیست؛ دستی انتخاب کنید.'); return; }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(p => {
      if (!alive.current) return;
      dispatch({ type: 'position', value: { lat: p.coords.latitude, lon: p.coords.longitude, source: 'gps',
        label: 'موقعیت مرورگر', accuracyMeters: p.coords.accuracy } }); onClose();
    }, () => { if (alive.current) { setBusy(false); dispatch({ type: 'locationDenied' }); setError('موقعیت دریافت نشد؛ از انتخاب دستی استفاده کنید.'); } },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
  };
  return <Dialog title="موقعیت جست‌وجو" onClose={onClose}>
    <p>موقعیت فقط برای جست‌وجوی همین صفحه استفاده می‌شود و به مدل ارسال نمی‌شود.</p>
    <Button tone="secondary" onClick={locate} disabled={busy}>{busy ? 'در حال دریافت موقعیت…' : 'دریافت موقعیت با اجازهٔ من'}</Button>
    <div className="ub-form"><label>انتخاب تقریبی منطقه<select defaultValue="" onChange={event => {
      const d = tehranDistricts.find(d => d.id === event.target.value);
      if (d) { dispatch({ type: 'position', value: { lat: d.lat, lon: d.lon, source: 'manual', label: `${d.label} (تقریبی)`, accuracyMeters: null } }); onClose(); }
    }}><option value="" disabled>انتخاب منطقهٔ تهران</option>{tehranDistricts.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
      <p className="ub-meta">این نقاط، مرکز تقریبی مناطق از نسخهٔ موجود پروژه‌اند؛ آدرس شما یا شاهد پوشش همهٔ منطقه نیستند.</p></div>
    <form onSubmit={manual} className="ub-form"><label>عرض جغرافیایی<input inputMode="decimal" dir="ltr" value={lat} onChange={e => setLat(e.target.value)} /></label>
      <label>طول جغرافیایی<input inputMode="decimal" dir="ltr" value={lon} onChange={e => setLon(e.target.value)} /></label>
      {error && <ErrorCard message={error} />}<Button type="submit">انتخاب این نقطه</Button></form>
  </Dialog>;
}
