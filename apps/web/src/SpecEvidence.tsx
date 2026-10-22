import type { Product } from './api';
import { evidenceGroups, previewEvidence, type SpecEvidence as Entry, type SpecFocus } from './specEvidenceData';

const topics = { camera: 'دوربین', battery: 'باتری' };
function EvidenceEntry({ entry }: { entry: Entry }) {
  const value = entry.spec.value ?? 'مقدار ثبت نشده';
  const characters = Array.from(value);
  return <div className={`spec-evidence-entry evidence-${entry.state}`} data-spec-index={entry.index}>
    <dt>{entry.spec.key?.trim() || 'ویژگی بدون عنوان'}</dt>
    <dd>{entry.state === 'unknown' && <span className="caption">مقدار قابل اتکا ثبت نشده است. </span>}
      {entry.state === 'negative' && <strong className="evidence-negative-label">نبود این ویژگی در منبع ذکر شده: </strong>}
      {characters.length > 160 ? <details><summary>{characters.slice(0, 160).join('')}… (متن کامل)</summary>
        <span className="evidence-source-value">{value}</span></details>
        : <span className="evidence-source-value">{value}</span>}
      <small className="evidence-source-section">بخش منبع: {entry.spec.section?.trim() || 'بخش ثبت نشده'}</small>
    </dd>
  </div>;
}

export function SpecEvidence({ product, focus }: { product: Product; focus: SpecFocus }) {
  const groups = evidenceGroups(product, focus);
  if (groups.length === 0) return null;
  const preview = previewEvidence(groups);
  const remaining = groups.flatMap(group => group.entries).filter(entry => !preview.some(item => item.index === entry.index));
  return <section className="spec-evidence" aria-label="مشخصات مرتبط از منبع">
    <h4>مشخصات ثبت‌شدهٔ مرتبط</h4>
    {groups.map(group => group.entries.length === 0 && <p className="caption evidence-missing" key={group.topic}>
      مشخصات مرتبط با {topics[group.topic]} در این نمایش پیدا نشد؛ این به معنی نبود قابلیت نیست.
    </p>)}
    <dl>{preview.map(entry => <EvidenceEntry key={entry.index} entry={entry} />)}</dl>
    {remaining.length > 0 && <details className="more-evidence">
      <summary>سایر مشخصات مرتبط ({remaining.length.toLocaleString('fa-IR')})</summary>
      <dl>{remaining.map(entry => <EvidenceEntry key={`${entry.topic}-${entry.index}`} entry={entry} />)}</dl>
    </details>}
    <p className="caption">این داده‌ها معیار مقایسه‌اند؛ کیفیت عکاسی یا دوام واقعی باتری از آن‌ها به‌تنهایی تأیید نمی‌شود.</p>
  </section>;
}
