import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Button } from '../../base/ui/primitives.tsx';
import { MapPinIcon } from '../../../presentation/icons-motion/icons.tsx';

export function LocationNudge({ onManual, disabled }: { onManual: () => void; disabled: boolean }) {
  const { state, dispatch } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (state.position) return null;
  const locate = () => {
    if (busy || disabled) return;
    if (!navigator.geolocation) { setError('اینجا موقعیت‌یابی در دسترس نیست؛ محله‌ات را دستی انتخاب کن.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      setBusy(false);
      dispatch({ type: 'position', value: { lat: position.coords.latitude, lon: position.coords.longitude,
        source: 'gps', label: 'موقعیت مرورگر', accuracyMeters: position.coords.accuracy } });
    }, () => {
      if (!alive.current) return;
      setBusy(false); dispatch({ type: 'locationDenied' });
      setError('موقعیت دریافت نشد؛ می‌توانی محله‌ات را دستی انتخاب کنی.');
    }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
  };
  return <section className="uc-location-nudge" aria-labelledby="uc-location-title">
    <div><MapPinIcon size={23} /><h3 id="uc-location-title">موقعیتت رو بدی؟</h3></div>
    <p>تا فروشگاه‌های اطرافت رو پیدا کنیم. فقط برای همین خرید استفاده می‌شه و به مدل فرستاده نمی‌شه؛ بدون موقعیت هم می‌تونی ادامه بدی.</p>
    <div className="uc-location-actions"><Button onClick={locate} disabled={busy || disabled}>{busy ? 'دارم موقعیتت رو می‌گیرم…' : 'بله، موقعیتم رو بده'}</Button>
      <Button tone="secondary" onClick={onManual} disabled={busy || disabled}>انتخاب دستی محله</Button></div>
    {error && <p role="status">{error}</p>}
  </section>;
}
