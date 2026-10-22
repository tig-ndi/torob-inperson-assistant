import type { Product, Spec } from './api';

export type SpecFocus = 'camera' | 'battery' | 'both';
export type SpecTopic = Exclude<SpecFocus, 'both'>;
export type SpecEvidence = { index: number; spec: Spec; topic: SpecTopic; state: 'recorded' | 'negative' | 'unknown' };
export type EvidenceGroup = { topic: SpecTopic; entries: SpecEvidence[] };

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// This selects which source fields to show. It does not infer quality or eligibility.
export function focusFromNeed(text: string): SpecFocus | null {
  const value = normalized(text);
  const camera = /عکاسی|دوربین|سلفی|\bcamera\b|\bphotography\b/.test(value);
  const battery = /باتری|باطری|\bbattery\b/.test(value);
  return camera && battery ? 'both' : camera ? 'camera' : battery ? 'battery' : null;
}

function valueState(value: string | null): SpecEvidence['state'] {
  const text = normalized(value ?? '');
  if (['', '-', '—', 'null', 'none', 'undefined', 'title', 'n/a', 'نامشخص', 'ثبت نشده'].includes(text)) return 'unknown';
  if (/^(?:ندارد|خیر|فاقد(?: دوربین)?|بدون دوربین|no|no camera|not supported)$/.test(text)) return 'negative';
  return 'recorded';
}

function rank(entry: SpecEvidence): number {
  const key = normalized(entry.spec.key ?? '').replace(/[.:：]/g, ' ').trim();
  if (entry.state === 'unknown') return 10;
  if (entry.topic === 'battery') return /ظرفیت|capacity/.test(key) ? 0 : 2;
  if (/^(?:دوربین|دوربین اصلی|تعداد دوربین های پشت گوشی|رزولوشن دوربین اصلی)$/.test(key)) return 0;
  return /سلفی|selfie|front/.test(key) ? 3 : 1;
}

export function evidenceGroups(product: Product, focus: SpecFocus): EvidenceGroup[] {
  // A shared word in an accessory/medical spec must not become phone evidence.
  if (normalized(product.category_name ?? '') !== 'گوشی موبایل') return [];
  const topics: SpecTopic[] = focus === 'both' ? ['camera', 'battery'] : [focus];
  return topics.map(topic => {
    const entries: SpecEvidence[] = [];
    product.specs.forEach((spec, index) => {
      const key = normalized(spec.key ?? '');
      const section = normalized(spec.section ?? '');
      // A generic resolution field in «مشخصات کلی» is usually the display.
      const matches = topic === 'camera' ? /دوربین|\bcamera\b/.test(key) || /^دوربین(?: ها)?$/.test(section)
        : /باتری|باطری|\bbattery\b/.test(key) || /^(?:باتری|باطری|battery)$/.test(section);
      if (matches) entries.push({ index, spec, topic, state: valueState(spec.value) });
    });
    entries.sort((a, b) => rank(a) - rank(b) || a.index - b.index);
    return { topic, entries };
  });
}

export function previewEvidence(groups: EvidenceGroup[]): SpecEvidence[] {
  const selected: SpecEvidence[] = [];
  // Give each requested topic a place before adding a third field.
  const length = Math.max(0, ...groups.map(group => group.entries.length));
  for (let position = 0; position < length && selected.length < 3; position++) {
    for (const group of groups) {
      const entry = group.entries[position];
      if (entry && !selected.some(item => item.index === entry.index)) {
        selected.push(entry);
      }
      if (selected.length === 3) break;
    }
  }
  return selected;
}
