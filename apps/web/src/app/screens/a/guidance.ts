import { useEffect, useState } from 'react';

export type Guidance = { starters: string[]; brands: string[]; budget_samples: string[]; sample_size: number; query: string | null };
export function parseGuidance(value: unknown): Guidance {
  if (!value || typeof value !== 'object') throw new Error('پیشنهادها معتبر نیستند.');
  const data = value as Record<string, unknown>;
  const brands: unknown = data.brands ?? [];
  if (!Array.isArray(brands) || brands.length > 4 || !brands.every(item => typeof item === 'string' && item.length > 0 && item.length <= 500) ||
      !Array.isArray(data.starters) || data.starters.length > 6 ||
      !data.starters.every(item => typeof item === 'string' && item.length > 0 && item.length <= 500) ||
      !Array.isArray(data.budget_samples) || data.budget_samples.length > 3 ||
      !data.budget_samples.every(item => typeof item === 'string' && /^\d{1,19}$/.test(item) && BigInt(item) <= 9223372036854775807n) ||
      typeof data.sample_size !== 'number' || !Number.isInteger(data.sample_size) || data.sample_size < 0 || data.sample_size > 40 ||
      !(data.query === null || typeof data.query === 'string')) throw new Error('پیشنهادها معتبر نیستند.');
  return { starters: data.starters, brands, budget_samples: data.budget_samples, sample_size: data.sample_size, query: data.query };
}

export function useGuidance(query: string | null) {
  const [data, setData] = useState<Guidance | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setError(true); controller.abort(); }, 8000);
    setData(null); setError(false);
    void fetch(`/api/assistant/guidance${query ? `?q=${encodeURIComponent(query)}` : ''}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('پیشنهادها در دسترس نیستند.');
        const result = parseGuidance(await response.json());
        if (result.query !== query) throw new Error('موضوع پیشنهادها تغییر کرده است.');
        if (!controller.signal.aborted) setData(result);
      }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, revision]);
  return { data, error, retry: () => setRevision(value => value + 1) };
}
