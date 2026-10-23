import { useWorkspace } from '../state/Workspace.tsx';
import { useResolvedTheme } from '../state/useResolvedTheme.ts';

export function ThemeControl() {
  const { state, dispatch } = useWorkspace();
  const resolved = useResolvedTheme();
  return <label className="uc-theme" title="انتخاب تم نمایش">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {state.theme === 'system' ? <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>
        : resolved === 'dark' ? <path d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z" />
        : <><circle cx="12" cy="12" r="4" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></>}
    </svg>
    <select aria-label="تم نمایش" value={state.theme} onChange={event => dispatch({ type: 'theme', value: event.target.value === 'dark' ? 'dark' : event.target.value === 'light' ? 'light' : 'system' })}>
      <option value="system">هماهنگ با سیستم</option><option value="dark">تیره</option><option value="light">روشن</option>
    </select>
  </label>;
}
