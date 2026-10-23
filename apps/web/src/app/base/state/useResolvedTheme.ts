import { useEffect, useState } from 'react';
import { useWorkspace } from './Workspace.tsx';

export function useResolvedTheme(): 'light' | 'dark' {
  const { state } = useWorkspace();
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return state.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.theme;
}
