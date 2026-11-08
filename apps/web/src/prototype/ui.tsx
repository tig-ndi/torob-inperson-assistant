import { ReactNode, useState } from "react";
import {
  Check, ChevronDown, CircleHelp, Clock, ShieldCheck, TriangleAlert, XCircle, Sparkles, Info, CircleCheck, Hourglass,
} from "lucide-react";
import { PStore, NOW, fa, hhmm, openState, openLabel } from "./data";

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(" ");

export function Btn({
  kind = "primary", size = "md", full, children, className, ...p
}: { kind?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; full?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const k = {
    primary: "bg-brand text-[var(--on-primary)] hover:bg-brand-press active:bg-brand-press",
    secondary: "bg-surface2 text-ink hover:bg-line",
    ghost: "bg-transparent text-ink hover:bg-surface2",
    danger: "bg-bad-soft text-bad border border-bad/40",
  }[kind];
  const s = { sm: "min-h-11 px-3 text-[14px]", md: "min-h-11 px-4 text-[14px]", lg: "min-h-12 px-5 text-[16px]" }[size];
  return (
    <button
      {...p}
      className={cx("inline-flex items-center justify-center gap-2 rounded-[14px] font-bold transition-colors duration-200 disabled:opacity-45 disabled:pointer-events-none", k, s, full && "w-full", className)}
      style={kind === "danger" ? { background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
    >
      {children}
    </button>
  );
}

export function Chip({ active, children, onClick, icon, className }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-200",
        active ? "border-brand bg-brand-soft text-brand font-bold" : "border-line bg-bg text-ink hover:bg-surface",
        className,
      )}
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      {active && <Check size={15} strokeWidth={2.5} />}
      {icon}
      {children}
    </button>
  );
}

type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";
const tones: Record<Tone, string> = {
  ok: "bg-[var(--success-soft)] text-ok",
  warn: "bg-[var(--warning-soft)] text-warn",
  bad: "bg-[var(--danger-soft)] text-bad",
  info: "bg-[var(--info-soft)] text-info",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface2 text-ink2",
};
export function Badge({ tone = "neutral", icon, children, dashed }: { tone?: Tone; icon?: ReactNode; children: ReactNode; dashed?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", tones[tone], dashed && "border border-dashed border-ink2/50 bg-transparent")}>
      {icon}
      {children}
    </span>
  );
}

export function OpenBadge({ s }: { s: PStore }) {
  const st = openState(s);
  const map = {
    open: { t: "ok" as Tone, i: <CircleCheck size={13} /> },
    soon: { t: "warn" as Tone, i: <Hourglass size={13} /> },
    closed: { t: "bad" as Tone, i: <XCircle size={13} /> },
    unknown: { t: "neutral" as Tone, i: <CircleHelp size={13} /> },
  }[st];
  return <Badge tone={map.t} icon={map.i} dashed={st === "unknown"}>{st === "soon" ? `به‌زودی بسته می‌شود · ${hhmm(s.close)}` : openLabel(s)}</Badge>;
}

export type Fresh = { kind: "verified" | "stale" | "listed"; label: string; sub: string };
export function freshOf(s: PStore, verifiedOverride?: string): Fresh {
  const v = verifiedOverride ?? s.verified;
  if (v) return { kind: "verified", label: "تأییدشده", sub: v };
  if (s.changed >= 30) return { kind: "stale", label: "قدیمی", sub: `${fa(s.changed)} روز پیش · تأیید با فروشنده` };
  return { kind: "listed", label: "قیمت ثبت‌شده", sub: `آخرین تغییر قیمت: ${fa(s.changed)} روز پیش` };
}
export function FreshTag({ f, full }: { f: Fresh; full?: boolean }) {
  const m = {
    verified: { t: "ok" as Tone, i: <ShieldCheck size={13} /> },
    stale: { t: "warn" as Tone, i: <TriangleAlert size={13} /> },
    listed: { t: "neutral" as Tone, i: <Clock size={13} /> },
  }[f.kind];
  return (
    <span className={cx("inline-flex items-center gap-1 text-[12px]", full && "w-full")}>
      <Badge tone={m.t} icon={m.i}>{f.label}</Badge>
      <span className="text-ink2">{f.kind === "listed" ? f.sub : `· ${f.sub}`}</span>
    </span>
  );
}

export function Price({ v, size = 18, old, unknown }: { v?: number | string | null; size?: number; old?: boolean; unknown?: boolean }) {
  if (unknown || v == null)
    return <span className="rounded-md border border-dashed border-ink2/50 px-1.5 text-[12px] text-ink2">قیمت نامشخص</span>;
  return (
    <span className={cx("whitespace-nowrap font-bold text-ink", old && "text-ink2 line-through decoration-bad")} style={{ fontSize: size }}>
      {fa((typeof v === 'string' ? BigInt(v) : v).toLocaleString("en-US"))}
      <span className="ms-1 text-[12px] font-normal text-ink2">تومان</span>
    </span>
  );
}

export function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div role="tablist" className="flex rounded-[12px] bg-surface2 p-1">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} tabIndex={value === k ? 0 : -1} onClick={() => onChange(k)}
          onKeyDown={event => {
            const index = items.findIndex(([key]) => key === k);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : event.key === "ArrowLeft" ? (index + 1) % items.length
              : event.key === "ArrowRight" ? (index - 1 + items.length) % items.length : null;
            if (next === null) return;
            event.preventDefault();
            const item = items[next];
            if (item) onChange(item[0]);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
          className={cx("min-h-9 flex-1 rounded-[9px] px-2 text-[13px] transition-all duration-200", value === k ? "bg-bg font-bold text-ink shadow-sm" : "text-ink2")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return (
    <input aria-label={label} className="rng" type="range" min={min} max={max} step={step} value={value}
      style={{ ["--p" as string]: `${((value - min) / (max - min)) * 100}%` }} onChange={(e) => onChange(+e.target.value)} />
  );
}

export function Check2({ on, onClick, label, disabled=false }: { on: boolean; onClick: () => void; label: string; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} role="checkbox" aria-checked={on} className="flex min-h-11 items-center gap-2 text-[13px] text-ink disabled:opacity-50">
      <span className={cx("grid size-[22px] place-items-center rounded-md border-2 transition-colors", on ? "border-brand bg-brand text-[var(--on-primary)]" : "border-ink2/60 bg-bg")}>
        {on && <Check size={14} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="flex min-h-11 items-center">
      <span className={cx("relative h-7 w-12 rounded-full transition-colors", on ? "bg-brand" : "bg-surface2 border border-line")}>
        <span className={cx("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all duration-200", on ? "right-0.5" : "right-[22px]")} />
      </span>
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}
export function ListSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="در حال بارگذاری">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-line p-3">
          <div className="flex gap-3"><Skeleton className="size-9 !rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-5 w-20" /></div>
          <Skeleton className="h-3 w-full" /><Skeleton className="h-6 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="anim-up flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-surface2 text-ink2">{icon}</div>
      <h3 className="text-[16px] font-bold text-ink">{title}</h3>
      <p className="max-w-[280px] text-[14px] text-ink2">{text}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

export function Bubble({ who, children }: { who: "agent" | "user" | "system"; children: ReactNode }) {
  if (who === "system") return <div className="mx-auto w-fit rounded-full bg-surface2 px-3 py-1 text-[12px] text-ink2">{children}</div>;
  return (
    <div className={cx("anim-up flex gap-2", who === "user" && "flex-row-reverse")}>
      {who === "agent" && <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[var(--on-primary)]"><Sparkles size={16} /></div>}
      <div className={cx("max-w-[86%] rounded-2xl px-3.5 py-2 text-[14px]", who === "agent" ? "rounded-tr-md bg-surface text-ink" : "rounded-tl-md bg-brand-soft text-ink")}>{children}</div>
    </div>
  );
}

export function AgentLog({ items, title = "دستیار چه کار کرد؟" }: { items: string[]; title?: string }) {
  const [o, setO] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setO(!o)} aria-expanded={o} className="flex min-h-11 w-full items-center gap-2 px-3 text-[13px] font-medium text-ink">
        <Info size={16} className="text-info" />
        {title}
        <ChevronDown size={16} className={cx("ms-auto text-ink2 transition-transform", o && "rotate-180")} />
      </button>
      {o && (
        <ul className="anim-up space-y-1.5 border-t border-line px-3 py-2.5">
          {items.map((t) => (
            <li key={t} className="flex gap-2 text-[13px] text-ink2"><Check size={14} className="mt-1.5 shrink-0 text-ok" />{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HoursBar({ s, arrive, compact }: { s: PStore; arrive?: number; compact?: boolean }) {
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  if (!s.hoursKnown)
    return (
      <div className="w-full">
        <div className="h-2.5 w-full rounded-full border border-dashed border-ink2/50" />
        <div className="mt-1 text-[11px] text-ink2">نامشخص</div>
      </div>
    );
  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full rounded-full bg-surface2">
        <div className="absolute inset-y-0 rounded-full bg-ok/80" style={{ right: pct(s.open), width: pct(s.close - s.open) }} />
        <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink" style={{ right: pct(NOW) }} title="الان" />
        {arrive != null && <div className="absolute -top-0.5 size-3.5 rounded-full border-2 border-bg bg-info" style={{ right: `calc(${pct(arrive)} - 7px)` }} title="رسیدن تو" />}
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between text-[11px] text-ink2"><span>{fa("00")}</span><span>{fa("12")}</span><span>{fa("24")}</span></div>
      )}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="status" className="anim-up pointer-events-none absolute inset-x-0 top-24 z-[60] flex justify-center px-4">
      <div className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bg shadow-lg">{msg}</div>
    </div>
  );
}

export function StepProgress({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  const L = ["انتخاب محصول", "فروشگاه‌های نزدیک", "مقایسه", "تأیید و مراجعه"];
  return (
    <ol className="flex gap-1.5 px-4" aria-label="مراحل">
      {L.map((l, i) => {
        const n = i + 1, done = n < step, cur = n === step;
        return (
          <li key={l} className="min-w-0 flex-1">
            <button disabled={n > step} onClick={() => onGo(n)} aria-current={cur ? "step" : undefined} className="block w-full text-start disabled:cursor-default">
              <div className={cx("h-1 rounded-full transition-colors duration-300", cur || done ? "bg-brand" : "bg-surface2", done && "opacity-50")} />
              <div className={cx("mt-1 flex items-start gap-1 text-[11px] leading-[1.35]", cur ? "font-bold text-ink" : "text-ink2")}>
                <span className={cx("grid size-4 shrink-0 place-items-center rounded-full text-[10px]", cur ? "bg-brand text-[var(--on-primary)]" : "bg-surface2")}>{done ? <Check size={10} strokeWidth={3} /> : fa(n)}</span>
                <span>{l}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
