import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Banknote, Building2, Check, ChevronLeft, CircleAlert, Clock, Copy, DoorClosed, Footprints, Car, History, Layers, MapPin, MapPinned,
  MessageCircle, Navigation, Phone, PhoneCall, RefreshCw, Route, Send, Share2, ShieldCheck, Sparkles, SearchX, TriangleAlert, WifiOff, X, XCircle, Zap, CreditCard, Ticket, Wallet,
} from "lucide-react";
import type { AppState } from "./App";
import {
  MODELS, NEIGHBORHOODS, NOW, PStore, STORES, applyFilters, dist, fa, hhmm, mil, money, openState, priceOf, rangeOf, reasonFor, Model, Outcome, DEFAULT_FILTERS,
} from "./data";
import {
  AgentLog, Badge, Bubble, Btn, Check2, Chip, Empty, FreshTag, HoursBar, ListSkeleton, OpenBadge, Price, Seg, Skeleton, Slider, Toggle, cx, freshOf,
} from "./ui";

type A = { a: AppState };

const Sticky = ({ children }: { children: ReactNode }) => (
  <div className="sticky bottom-0 z-10 -mx-0 border-t border-line bg-bg/95 p-3 backdrop-blur">{children}</div>
);

/* ------------------------------- S0 HOME ------------------------------- */
export function HomeS({ a }: A) {
  const quick = [
    ["کفش کتونی", <Footprints size={16} key="1" />],
    ["گوشی", <Phone size={16} key="2" />],
    ["لپ‌تاپ", <Layers size={16} key="3" />],
    ["لوازم خانگی", <Building2 size={16} key="4" />],
  ] as const;
  return (
    <div className="space-y-5 p-4 pb-8">
      <div className="anim-up">
        <h1 className="text-[22px] font-bold leading-snug text-ink">سلام سارا، امروز دنبال چی می‌گردی؟</h1>
        <p className="mt-1 text-[14px] text-ink2">قیمت‌ها رو مقایسه می‌کنم، نزدیک‌ترین فروشگاه رو پیدا می‌کنم و اگه خواستی خودم با فروشنده تماس می‌گیرم.</p>
      </div>

      {a.loc === "ask" && (
        <section className="anim-up space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--info-soft)] text-info"><MapPin size={22} /></div>
            <div>
              <h2 className="text-[16px] font-bold text-ink">موقعیتت رو بدم؟</h2>
              <p className="text-[14px] text-ink2">موقعیتت رو برای پیدا کردن نزدیک‌ترین فروشگاه‌ها بدم؟ فقط همین حالا و فقط برای جست‌وجو استفاده می‌شه.</p>
            </div>
          </div>
          <div className="design-actions flex gap-2">
            <Btn full onClick={() => { a.setLoc("granted"); a.flash("موقعیت نمونه برای پیش‌نمایش انتخاب شد"); }}>بله، موقعیتم رو بده</Btn>
            <Btn kind="secondary" full onClick={() => a.setLoc("denied")}>انتخاب دستی محله</Btn>
          </div>
        </section>
      )}
      {a.loc === "denied" && (
        <section className="anim-up space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start gap-2 text-[14px] text-ink">
            <CircleAlert size={18} className="mt-1 shrink-0 text-warn" />
            <p><b>به موقعیتت دسترسی نداریم.</b> اشکالی نداره؛ محله‌ی خودت رو انتخاب کن تا همون اطراف رو بگردم.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEIGHBORHOODS.map((n) => (
              <Chip key={n} active={a.hood === n} onClick={() => { a.setHood(n); a.setLoc("manual"); a.flash(`محله‌ی ${n} انتخاب شد`); }}>{n}</Chip>
            ))}
          </div>
          <button onClick={() => a.setLoc("ask")} className="min-h-11 text-[13px] font-medium text-info">دوباره اجازه‌ی موقعیت بدم</button>
        </section>
      )}
      {(a.loc === "granted" || a.loc === "manual") && (
        <div className="anim-up flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--info-soft)] px-3 text-[14px] text-info">
          <MapPin size={18} />
          <span className="font-medium">{a.loc === "granted" ? `موقعیت دقیق · نزدیک ${a.hood}` : `محله‌ی ${a.hood}`}</span>
          <button onClick={() => a.setLoc("ask")} className="ms-auto min-h-11 text-[13px] font-bold">تغییر</button>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-ink2">شروع سریع</h2>
        <div className="flex flex-wrap gap-2">
          {quick.map(([t, i]) => (
            <Chip key={t} icon={i} onClick={() => { if (t !== "کفش کتونی") a.flash("نمونه‌ی نمایشی: داده‌ها برای کفش کتونی است"); a.go("decide"); }}>{t}</Chip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[14px] font-bold text-ink2">جست‌وجوهای اخیر</h2>
        {[
          ["کفش کتونی مخصوص پیاده‌روی", "۲ روز پیش", "results"],
          ["هدفون بی‌سیم زیر ۲ میلیون", "هفته‌ی پیش", "decide"],
          ["قابلمه‌ی ضدچسب ۲۴ سانتی", "۳ هفته پیش", "decide"],
        ].map(([t, w, to]) => (
          <button key={t} onClick={() => a.go(to as never)} className="flex min-h-12 w-full items-center gap-3 border-b border-line text-start last:border-0">
            <History size={18} className="text-ink2" />
            <span className="flex-1 text-[14px] text-ink">{t}</span>
            <span className="text-[12px] text-ink2">{w}</span>
            <ChevronLeft size={16} className="text-ink2" />
          </button>
        ))}
      </section>
    </div>
  );
}

/* ----------------------------- S1a DECIDE ------------------------------ */
export function DecideS({ a }: A) {
  const uses = ["پیاده‌روی روزانه", "باشگاه", "دویدن", "رفت‌وآمد روزمره"];
  const brands = ["اسکچرز", "آدیداس", "نایک", "فرقی نداره"];
  return (
    <div className="space-y-4 p-4 pb-6">
      <Bubble who="user">کفش کتونی مخصوص پیاده‌روی می‌خوام، بودجه‌م تا ۳ میلیونه</Bubble>
      <Bubble who="agent">باشه! برای اینکه دقیق‌تر پیشنهاد بدم، دو سه تا سؤال کوتاه دارم. فقط یه ضربه بزن.</Bubble>

      <section className="anim-up space-y-2 rounded-2xl border border-line p-3">
        <h3 className="text-[14px] font-bold text-ink">۱. بیشتر برای چی می‌خوایش؟</h3>
        <div className="flex flex-wrap gap-2">
          {uses.map((u) => <Chip key={u} active={a.answers.use === u} onClick={() => a.setAnswers({ ...a.answers, use: u })}>{u}</Chip>)}
        </div>
      </section>

      <section className="anim-up space-y-1 rounded-2xl border border-line p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[14px] font-bold text-ink">۲. بودجه‌ت چقدره؟</h3>
          <Price v={a.filters.budgetMax} size={16} />
        </div>
        <Slider label="سقف بودجه" min={1000000} max={6000000} step={100000} value={a.filters.budgetMax} onChange={(v) => a.setFilters({ ...a.filters, budgetMax: v })} />
        <div className="flex justify-between text-[12px] text-ink2"><span>{fa("۱")} میلیون</span><span>{fa("۶")} میلیون</span></div>
        <p className="text-[12px] text-ink2">{fa(MODELS.filter((m) => rangeOf(m).lo <= a.filters.budgetMax).length)} مدل از ۳ مدل پرفروش توی بودجه‌ته.</p>
      </section>

      <section className="anim-up space-y-2 rounded-2xl border border-line p-3">
        <h3 className="text-[14px] font-bold text-ink">۳. برند دلخواه داری؟</h3>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => <Chip key={b} active={a.answers.brand === b} onClick={() => a.setAnswers({ ...a.answers, brand: b })}>{b}</Chip>)}
        </div>
      </section>

      <Btn size="lg" full onClick={() => a.go("results")}>پیشنهاد بده <ArrowLeft size={18} /></Btn>
    </div>
  );
}

/* ----------------------------- S1b RESULTS ----------------------------- */
function ModelCard({ m, a }: { m: Model; a: AppState }) {
  const r = rangeOf(m);
  const sel = a.modelId === m.id;
  const cmp = a.cmpModels.includes(m.id);
  const tone = { brand: "brand", ok: "ok", info: "info" }[m.tagTone] as "brand" | "ok" | "info";
  return (
    <article className={cx("w-[262px] shrink-0 snap-center overflow-hidden rounded-2xl border bg-bg transition-colors", sel ? "border-brand" : "border-line")} style={{ boxShadow: "var(--shadow-2)" }}>
      <div className="relative h-[116px] bg-surface2">
        <img src={m.img} alt={m.name} className="size-full object-cover" loading="lazy" />
        <div className="absolute start-2 top-2"><Badge tone={tone} icon={<Sparkles size={12} />}>{m.tag}</Badge></div>
      </div>
      <div className="space-y-2 p-3">
        <div>
          <h3 className="text-[16px] font-bold text-ink">{m.name}</h3>
          <p className="text-[13px] text-ink2">از <b className="text-ink">{mil(r.lo)}</b> تا <b className="text-ink">{mil(r.hi)}</b> میلیون در {fa(r.n)} فروشگاه</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-xl bg-surface p-2 text-[12px]">
          {m.specs.map(([k, v]) => (<div key={k} className="flex justify-between gap-1"><dt className="text-ink2">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>))}
        </dl>
        <p className="flex gap-1.5 text-[13px] text-ink"><Sparkles size={14} className="mt-1.5 shrink-0 text-brand" /><span><b>چرا این مدل؟</b> {m.reason}</span></p>
        <div className="flex items-center gap-2 pt-1">
          <Btn size="sm" kind={sel ? "primary" : "secondary"} className="flex-1" onClick={() => a.setModelId(m.id)}>{sel ? <><Check size={16} />انتخاب شد</> : "این رو می‌خوام"}</Btn>
          <Check2 on={cmp} label="مقایسه" onClick={() => a.setCmpModels(cmp ? a.cmpModels.filter((x) => x !== m.id) : a.cmpModels.length < 3 ? [...a.cmpModels, m.id] : a.cmpModels)} />
        </div>
      </div>
    </article>
  );
}

export function ResultsS({ a }: A) {
  const cm = MODELS.filter((m) => a.cmpModels.includes(m.id));
  if (a.loading) return <div><div className="p-4 pb-0"><Bubble who="agent">دارم قیمت‌ها و مدل‌ها رو بررسی می‌کنم…</Bubble></div><div className="flex gap-3 overflow-hidden p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-[330px] w-[262px] shrink-0 !rounded-2xl" />)}</div></div>;
  return (
    <div>
      <div className="space-y-3 p-4 pb-2">
        <Bubble who="agent"><b>۳ مدل پیشنهادی</b> برای {a.answers.use} تا سقف {money(a.filters.budgetMax)} تومان پیدا کردم. هر کدوم رو که دوست داشتی انتخاب کن.</Bubble>
        <AgentLog items={["قیمت ۳۴ مدل کفش پیاده‌روی را مقایسه کردم", "فقط مدل‌هایی که در فروشگاه‌های حضوری تهران موجود است ماندند", "نظر خریداران و وزن کفش را بررسی کردم"]} />
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-1" tabIndex={0} aria-label="مدل‌های پیشنهادی">
        {MODELS.map((m) => <ModelCard key={m.id} m={m} a={a} />)}
      </div>
      {cm.length >= 2 && (
        <section className="design-table-scroll anim-up mx-4 mb-4 rounded-2xl border border-line" tabIndex={0} aria-label="جدول مقایسه مدل‌ها">
          <h3 className="bg-surface px-3 py-2 text-[14px] font-bold text-ink">مقایسه‌ی {fa(cm.length)} مدل</h3>
          <div className="design-model-table grid text-[12px]" style={{ gridTemplateColumns: `52px repeat(${cm.length},minmax(100px,1fr))` }}>
            <div />
            {cm.map((m) => <div key={m.id} className="px-1 py-2 text-center font-bold text-ink">{m.name}</div>)}
            {["قیمت از", "فروشگاه", ...(cm[0]?.specs ?? []).map((s) => s[0])].map((lbl, ri) => (
              <div key={lbl} className="contents">
                <div className="border-t border-line px-2 py-1.5 text-ink2">{lbl}</div>
                {cm.map((m) => (
                  <div key={m.id + lbl} className="border-t border-line px-1 py-1.5 text-center text-ink">
                    {ri === 0 ? mil(rangeOf(m).lo) + " م" : ri === 1 ? fa(rangeOf(m).n) : m.specs[ri - 2]?.[1] ?? "—"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
      <Sticky>
        <Btn size="lg" full onClick={() => a.go("stores")}><MapPinned size={18} />فروشگاه‌های نزدیک رو پیدا کن</Btn>
      </Sticky>
    </div>
  );
}

/* ------------------------------ STORE CARD ------------------------------ */
export function StoreCard({ s, rank, a, model }: { s: PStore; rank: number; a: AppState; model: Model }) {
  const open = a.expanded === s.id;
  const sel = a.sel === s.id;
  const v = a.ver[s.id];
  const p = a.priceFor(s);
  const f = freshOf(s, a.verText(s));
  const inCmp = a.cmpStores.includes(s.id);
  const st = openState(s);
  return (
    <article
      id={"card-" + s.id}
      className={cx("anim-up rounded-2xl border bg-bg transition-colors duration-200", sel ? "border-brand" : "border-line", st === "closed" && "bg-surface")}
      style={{ boxShadow: sel ? "var(--shadow-2)" : "var(--shadow-1)" }}
    >
      <button onClick={() => { a.setSel(s.id); a.setExpanded(open ? null : s.id); }} aria-expanded={open} className="block w-full space-y-2 p-3 text-start">
        <div className="flex items-start gap-2.5">
          <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold", sel ? "bg-brand text-[var(--on-primary)]" : "bg-brand-soft text-brand")}>{fa(rank + 1)}</span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[16px] font-bold text-ink">{s.name}</h3>
            <p className="text-[13px] text-ink2">{s.cat} · {s.area}</p>
          </div>
          <div className="text-end">
            {v?.outcome === "changed" && <div className="-mb-1"><Price v={Math.round((s.base * model.mult) / 10000) * 10000} size={12} old /></div>}
            <Price v={p} />
            {v?.outcome === "oos" && <div className="text-[12px] font-bold text-bad">ناموجود</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink2">
          <span className="inline-flex items-center gap-1"><Navigation size={14} className="flip" />{dist(s.d)}</span>
          <span className="inline-flex items-center gap-1"><Footprints size={14} />{fa(s.walk)} دقیقه</span>
          <span className="inline-flex items-center gap-1"><Car size={14} />{fa(s.drive)} دقیقه</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><OpenBadge s={s} />{s.mall && <Badge tone="neutral" icon={<Building2 size={12} />}>{s.mall} · طبقه {fa(s.floor!)} · واحد {fa(s.unit!)}</Badge>}</div>
        <div className="flex flex-wrap gap-1.5">
          {s.inst && <Badge tone="info" icon={<CreditCard size={12} />}>قسطی</Badge>}
          {s.pay && <Badge tone="brand" icon={<Wallet size={12} />}>ترب‌پی</Badge>}
          {s.fast && <Badge tone="neutral" icon={<Zap size={12} />}>ارسال فوری</Badge>}
          {s.kala && <Badge tone="neutral" icon={<Ticket size={12} />}>کالابرگ</Badge>}
        </div>
        <FreshTag f={f} />
        <p className="flex gap-1.5 text-[13px] text-ink"><Sparkles size={14} className="mt-1.5 shrink-0 text-brand" /><span><b className="font-medium">چرا پیشنهاد شد؟</b> {reasonFor(s, model, rank)}</span></p>
      </button>
      {open && (
        <div className="anim-up space-y-3 border-t border-line p-3">
          <div>
            <div className="mb-1 flex justify-between text-[12px] text-ink2"><span>ساعت کاری امروز</span><span>{s.hoursKnown ? `${hhmm(s.open)} تا ${hhmm(s.close)}` : "نامشخص"}</span></div>
            <HoursBar s={s} arrive={NOW + s.walk} />
          </div>
          <p className="text-[13px] text-ink2"><MapPin size={14} className="me-1 inline" />{s.address}</p>
          {s.mall && <p className="text-[13px] text-ink2"><Building2 size={14} className="me-1 inline" />{s.hint}</p>}
          <div className="flex gap-2">
            <Btn size="sm" kind={inCmp ? "primary" : "secondary"} className="flex-1" onClick={() => a.toggleCmp(s.id)}>{inCmp ? <><Check size={16} />در مقایسه</> : "افزودن به مقایسه"}</Btn>
            <Btn size="sm" kind="secondary" className="flex-1" onClick={() => { a.setSel(s.id); a.go("contact"); }}><PhoneCall size={16} />بپرس</Btn>
          </div>
          <AgentLog title="دستیار چه کار کرد؟" items={[`فاصله تا ${s.name} را از موقعیت تو محاسبه کردم`, "ساعت کاری را با اطلاعات ثبت‌شده تطبیق دادم", s.verified ? "قیمت را با تماس تلفنی تأیید کردم" : "قیمت از لیست فروشگاه خوانده شد و هنوز تأیید نشده"]} />
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line px-3">
        <Check2 on={inCmp} onClick={() => a.toggleCmp(s.id)} label="مقایسه" />
        <button onClick={() => { a.setSel(s.id); a.go("trip"); }} className="flex min-h-11 items-center gap-1 text-[13px] font-bold text-brand"><Route size={16} />مسیر <ChevronLeft size={14} /></button>
      </div>
    </article>
  );
}

/* ------------------------------ S2 STORES ------------------------------- */
export function StoresS({ a }: A) {
  const m = a.model;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (a.sel && a.fromPin) document.getElementById("card-" + a.sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [a.sel, a.fromPin]);
  if (a.sim === "error") return <ErrorCard a={a} />;
  if (a.loading) return <ListSkeleton />;
  const hidden = applyFilters(m, { ...a.filters, budgetMax: 99e6, budgetMin: 0 }, ["radius"]).filter((s) => priceOf(s, m) > a.filters.budgetMax && s.d <= a.filters.radius * 1000).length;
  return (
    <div ref={ref} className="space-y-3 p-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-2.5">
        <img src={m.img} alt="" className="size-12 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-ink">{m.name}</div>
          <div className="text-[12px] text-ink2">{fa(a.list.length)} فروشگاه نزدیک · {fa(a.probable.length)} احتمالی</div>
        </div>
        <button onClick={() => a.go("results")} className="min-h-11 px-2 text-[13px] font-bold text-info">تغییر مدل</button>
      </div>

      {a.filters.inst && a.list.length > 0 && (
        <div className="anim-up flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-[14px] font-bold text-brand"><CreditCard size={16} />{fa(a.list.length)} فروشگاه با خرید اعتباری</div>
      )}
      <AgentLog items={[`قیمت ${m.name} را در ${fa(rangeOf(m).n)} فروشگاه مقایسه کردم`, "ساعت کاری و مسافت پیاده را بررسی کردم", `فقط فروشگاه‌های داخل ${fa(a.filters.radius)} کیلومتر را نگه داشتم`]} />

      <div className="flex items-center gap-2">
        <div className="flex-1"><Seg value={a.filters.sort} onChange={(v) => a.setFilters({ ...a.filters, sort: v })} items={[["smart", "پیشنهادی"], ["near", "نزدیک‌ترین"], ["cheap", "ارزان‌ترین"]]} /></div>
      </div>
      <Btn kind="secondary" full onClick={() => a.setOverlay("alts")}><DoorClosed size={18} />فروشگاه بسته بود؟</Btn>

      {a.list.length === 0 ? (
        <Empty icon={<SearchX size={26} />} title="فروشگاهی با این فیلترها پیدا نشد" text={a.filters.inst ? `توی ${fa(a.filters.radius)} کیلومتری تو فروشگاهی با فروش قسطی نیست. محدوده رو بیشتر کنم؟` : "فیلترها رو کمی شل‌تر کن تا نتیجه بیشتری ببینی."}>
          <Btn onClick={() => a.setFilters({ ...a.filters, radius: Math.min(5, a.filters.radius + 1) })}>محدوده رو بیشتر کنم؟</Btn>
          <Btn kind="secondary" onClick={() => a.setFilters({ ...DEFAULT_FILTERS, budgetMax: a.filters.budgetMax })}>حذف فیلترها</Btn>
        </Empty>
      ) : (
        <div className="space-y-3">{a.list.map((s, i) => <StoreCard key={s.id} s={s} rank={i} a={a} model={m} />)}</div>
      )}
      {hidden > 0 && <p className="text-center text-[12px] text-ink2">{fa(hidden)} فروشگاه بالاتر از بودجه‌ات پنهان شد. <button className="min-h-11 font-bold text-info" onClick={() => a.setFilters({ ...a.filters, budgetMax: a.filters.budgetMax + 200000 })}>سقف رو ببر بالا</button></p>}

      {a.probable.length > 0 && (
        <section className="space-y-2 pt-2">
          <h3 className="text-[14px] font-bold text-ink">احتمالی — موجودی نامشخص</h3>
          <p className="flex gap-2 rounded-xl bg-surface p-3 text-[13px] text-ink2"><TriangleAlert size={16} className="mt-1 shrink-0 text-warn" />این فروشگاه‌ها فقط توی همین دسته فعالیت دارند و کالا رو ثبت نکرده‌اند. صرف اینکه فروشگاه کفش می‌فروشه به معنی موجود بودن این مدل نیست؛ حتماً قبل از رفتن بپرس.</p>
          {a.probable.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-ink2/50 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-ink">{p.name}</div>
                <div className="text-[12px] text-ink2">{p.cat} · {p.area} · {dist(p.d)} · {fa(p.walk)} دقیقه پیاده</div>
                <div className="mt-1 flex gap-1.5"><Badge dashed>موجودی نامشخص</Badge><Badge dashed>قیمت نامشخص</Badge></div>
              </div>
              <Btn size="sm" kind="secondary" onClick={() => a.flash("پیش‌نمایش استعلام برای " + p.name + "؛ درخواستی ارسال نمی‌شود")}>استعلام</Btn>
            </div>
          ))}
        </section>
      )}

      <Sticky>
        {a.cmpStores.length >= 2 ? (
          <Btn size="lg" full onClick={() => a.go("compare")}>مقایسه‌ی {fa(a.cmpStores.length)} فروشگاه<ArrowLeft size={18} /></Btn>
        ) : (
          <div className="flex gap-2">
            <p className="flex-1 self-center text-[13px] text-ink2">{a.cmpStores.length === 1 ? "یکی دیگه هم انتخاب کن" : "۲ یا ۳ فروشگاه رو برای مقایسه تیک بزن"}</p>
            <Btn kind="secondary" disabled={a.list.length < 2} onClick={() => { a.setCmpStores(a.list.slice(0, 3).map((s) => s.id)); a.go("compare"); }}>۳ تای برتر</Btn>
          </div>
        )}
      </Sticky>
    </div>
  );
}

export function ErrorCard({ a }: A) {
  return (
    <Empty icon={<WifiOff size={26} />} title="نتونستم نتایج رو بیارم" text="یه مشکل کوتاه پیش اومد. اطلاعاتی که قبلاً دیدی سر جاشه؛ دوباره تلاش کن.">
      <Btn onClick={() => { a.setSim("none"); a.flash("دوباره وصل شدیم"); }}><RefreshCw size={16} />تلاش دوباره</Btn>
    </Empty>
  );
}

/* ----------------------------- S3 COMPARE ------------------------------ */
export function CompareS({ a }: A) {
  const w = 1 - a.weight / 100;
  const cols = useMemo(() => {
    const items = a.cmpStores.map((id) => (STORES as PStore[]).find((s) => s.id === id)!).filter(Boolean);
    const prices = items.map((s) => a.priceFor(s));
    const lo = Math.min(...prices), hi = Math.max(...prices), dm = Math.max(...items.map((s) => s.d));
    const sc = (s: PStore) => w * ((a.priceFor(s) - lo) / (hi - lo || 1)) + (1 - w) * (s.d / dm) + (openState(s) === "closed" ? 0.5 : 0);
    return [...items].sort((x, y) => sc(x) - sc(y)).map((s) => ({ s, sc: sc(s) }));
  }, [a.cmpStores, a.weight, a.ver, a.model]);
  if (a.loading) return <ListSkeleton />;
  if (cols.length < 2) return <Empty icon={<SearchX size={26} />} title="برای مقایسه حداقل ۲ فروشگاه لازمه" text="برگرد و فروشگاه‌ها رو تیک بزن."><Btn onClick={() => a.go("stores")}>برگرد به فهرست</Btn></Empty>;
  const best = cols[0]!.s;
  const cheapest = [...cols].sort((x, y) => a.priceFor(x.s) - a.priceFor(y.s))[0]!.s.id;
  const nearest = [...cols].sort((x, y) => x.s.d - y.s.d)[0]!.s.id;
  const warns = cols.map(({ s }) => ({ s, left: s.close - (NOW + s.walk) })).filter((x) => x.s.hoursKnown && x.left <= 45);
  const row = (label: string, f: (s: PStore) => ReactNode, last?: boolean) => (
    <div className={cx("contents")}>
      <div className={cx("flex items-center px-2 py-2.5 text-[12px] text-ink2", !last && "border-b border-line")}>{label}</div>
      {cols.map(({ s }) => <div key={s.id + label} className={cx("flex flex-col items-start justify-center gap-0.5 px-1.5 py-2.5 text-[13px] text-ink", !last && "border-b border-line", a.sel === s.id && "bg-brand-soft/50")}>{f(s)}</div>)}
    </div>
  );
  return (
    <div className="space-y-3 p-4 pb-2">
      <div className="rounded-2xl bg-surface p-3">
        <div className="mb-1 flex justify-between text-[13px] font-bold text-ink"><span>قیمت</span><span className="text-ink2">↔</span><span>نزدیکی</span></div>
        <Slider label="وزن قیمت در برابر نزدیکی" min={0} max={100} step={5} value={a.weight} onChange={a.setWeight} />
        <p className="text-[12px] text-ink2">{a.weight < 35 ? "بیشتر روی ارزان‌ترین قیمت تمرکز کردم." : a.weight > 65 ? "بیشتر روی نزدیک‌ترین فروشگاه تمرکز کردم." : "تعادل بین قیمت و فاصله."} رتبه‌ها زنده عوض می‌شن.</p>
      </div>

      {warns.map(({ s, left }) => (
        <div key={s.id} role="alert" className="anim-up flex gap-2 rounded-2xl bg-[var(--warning-soft)] p-3 text-[13px] text-warn">
          <Clock size={18} className="mt-0.5 shrink-0" />
          <span><b>{s.name}:</b> {left <= 0 ? "تا رسیدن تو بسته شده." : `تا رسیدن تو ${fa(left)} دقیقه به بسته شدن می‌مونه.`} بهتره قبل از رفتن تماس بگیری.</span>
        </div>
      ))}

      <div className="design-table-scroll rounded-2xl border border-line" tabIndex={0} aria-label="جدول مقایسه فروشگاه‌ها"><div className="design-store-table" style={{ display: "grid", gridTemplateColumns: `58px repeat(${cols.length},minmax(120px,1fr))` }}>
        <div className="border-b border-line bg-surface" />
        {cols.map(({ s }, i) => (
          <button key={s.id} onClick={() => a.setSel(s.id)} className={cx("flex flex-col items-start gap-1 border-b border-line bg-surface px-1.5 py-2 text-start", a.sel === s.id && "bg-brand-soft")}>
            <span className="grid size-6 place-items-center rounded-full bg-brand text-[12px] font-bold text-[var(--on-primary)]">{fa(i + 1)}</span>
            <span className="text-[13px] font-bold leading-tight text-ink">{s.name}</span>
            <span className="flex flex-col gap-0.5">
              {best.id === s.id && <Badge tone="brand">بهترین کلی</Badge>}
              {cheapest === s.id && <Badge tone="ok">ارزان‌ترین</Badge>}
              {nearest === s.id && <Badge tone="info">نزدیک‌ترین</Badge>}
            </span>
          </button>
        ))}
        {row("قیمت", (s) => <Price v={a.priceFor(s)} size={14} />)}
        {row("وضعیت قیمت", (s) => { const f = freshOf(s, a.verText(s)); return <><Badge tone={f.kind === "verified" ? "ok" : f.kind === "stale" ? "warn" : "neutral"}>{f.label}</Badge><span className="text-[11px] leading-tight text-ink2">{f.sub}</span></>; })}
        {row("فاصله", (s) => <b>{dist(s.d)}</b>)}
        {row("زمان رسیدن", (s) => <><span className="flex items-center gap-1 text-[12px]"><Footprints size={13} />{fa(s.walk)} دقیقه</span><span className="flex items-center gap-1 text-[12px] text-ink2"><Car size={13} />{fa(s.drive)} دقیقه</span></>)}
        {row("ساعت کاری", (s) => <><HoursBar s={s} arrive={NOW + s.walk} compact /><span className="text-[11px] text-ink2">{s.hoursKnown ? `${hhmm(s.open)} – ${hhmm(s.close)}` : "نامشخص"}</span><span className="text-[11px] text-info">رسیدن: {hhmm(NOW + s.walk)}</span></>)}
        {row("قسطی", (s) => s.inst ? <Badge tone="ok" icon={<Check size={12} />}>دارد</Badge> : <Badge tone="neutral" icon={<X size={12} />}>ندارد</Badge>)}
        {row("اطمینان", (s) => <><span className="text-[12px] font-bold">{fa(s.conf)}٪</span><span className="h-1.5 w-full rounded-full bg-surface2"><span className="block h-full rounded-full bg-ink2" style={{ width: s.conf + "%" }} /></span></>, true)}
      </div>
      </div><p className="text-[12px] text-ink2">نوار ساعت کاری: خط مشکی = الان، نقطه‌ی آبی = زمان رسیدن تو، سبز = ساعت باز بودن.</p>
      <AgentLog items={["فاصله‌ها را با سرعت پیاده‌روی ۵ کیلومتر بر ساعت حساب کردم", "ساعت رسیدن تو را با ساعت بسته شدن هر فروشگاه تطبیق دادم", "اطمینان بر اساس تازگی قیمت و تأیید تلفنی محاسبه شد"]} />
      <Sticky>
        <Btn size="lg" full onClick={() => { a.setSel(best.id); a.go("contact"); }}>انتخاب {best.name} و تأیید با فروشنده<ArrowLeft size={18} /></Btn>
      </Sticky>
    </div>
  );
}

/* ------------------------------ S4/S5 CONTACT --------------------------- */
const QS = [["stock", "موجودی؟", "سلام، کفش {m} سایز ۴۲ موجوده؟"], ["price", "قیمت امروز؟", "قیمتش امروز چنده؟"], ["hours", "ساعت کاری؟", "تا چه ساعتی باز هستید؟"]] as const;
const CH = { call: ["تماس", <Phone size={15} key="p" />], wa: ["واتساپ", <MessageCircle size={15} key="w" />], bale: ["بله", <Send size={15} key="b" />] } as const;

export function AltCard({ s, a, onPick }: { s: PStore; a: AppState; onPick: () => void }) {
  const f = freshOf(s, a.verText(s));
  return (
    <article className="w-[250px] shrink-0 snap-center space-y-1.5 rounded-2xl border border-line bg-bg p-3" style={{ boxShadow: "var(--shadow-1)" }}>
      <div className="flex items-start justify-between gap-2"><div><h4 className="text-[15px] font-bold text-ink">{s.name}</h4><p className="text-[12px] text-ink2">{s.area} · {dist(s.d)} · {fa(s.walk)} دقیقه پیاده</p></div><Price v={a.priceFor(s)} size={15} /></div>
      <OpenBadge s={s} />
      <FreshTag f={f} />
      <Btn size="sm" full onClick={onPick}>جایگزین کن</Btn>
    </article>
  );
}

export function ContactS({ a }: A) {
  const s = (STORES as PStore[]).find((x) => x.id === a.sel) ?? a.list[0];
  const m = a.model;
  const [qs, setQs] = useState({ stock: true, price: true, hours: false });
  const compose = (q: typeof qs) => QS.filter(([k]) => q[k]).map(([, , t]) => t.replace("{m}", m.name)).join("\n");
  const [msg, setMsg] = useState(compose(qs));
  const [ch, setCh] = useState<"call" | "wa" | "bale">(s?.channels[0] ?? "call");
  const [demo, setDemo] = useState<Outcome | "auto">("auto");
  const [phase, setPhase] = useState(0);
  const v = s ? a.ver[s.id] : undefined;
  const outcome: Outcome = demo === "auto" ? s?.outcome ?? "verified" : demo;
  useEffect(() => { setCh(s?.channels[0] ?? "call"); setPhase(v?.outcome ? 3 : 0); setMsg(compose(qs)); /* eslint-disable-next-line */ }, [s?.id]);
  useEffect(() => {
    if (phase === 1) { const t = setTimeout(() => setPhase(2), 1500); return () => clearTimeout(t); }
    if (phase === 2 && s) { const t = setTimeout(() => { setPhase(3); a.setVerOutcome(s.id, outcome); }, 1400); return () => clearTimeout(t); }
    // eslint-disable-next-line
  }, [phase]);
  if (!s) return <Empty icon={<SearchX size={26} />} title="فروشگاهی انتخاب نشده" text="اول یه فروشگاه رو انتخاب کن."><Btn onClick={() => a.go("stores")}>برگرد به فهرست</Btn></Empty>;
  const done = phase === 3 && v?.outcome;
  const res = v?.outcome ?? outcome;
  const oldP = Math.round((s.base * m.mult) / 10000) * 10000;
  const alts = a.alternatives(s.id).slice(0, 2);
  const closed = openState(s) === "closed";
  const time = hhmm(NOW + 2);
  const toggleQ = (k: keyof typeof qs) => { const n = { ...qs, [k]: !qs[k] }; setQs(n); setMsg(compose(n)); };
  return (
    <div className="space-y-3 p-4 pb-4">
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
        <div className="min-w-0 flex-1"><h3 className="truncate text-[16px] font-bold text-ink">{s.name}</h3><p className="text-[12px] text-ink2">{s.area} · {dist(s.d)} · <OpenInline s={s} /></p></div>
        <Price v={oldP} size={15} />
      </div>
      <FreshTag f={freshOf(s, a.verText(s))} />

      {closed && !done && (
        <div className="anim-up space-y-2 rounded-2xl bg-[var(--danger-soft)] p-3 text-[13px]" style={{ color: "var(--danger)" }}>
          <p className="flex gap-2"><XCircle size={18} className="mt-0.5 shrink-0" /><span><b>الان بسته‌ست.</b> می‌تونی پیام بذاری تا صبح جواب بده، یا جایگزین باز ببینی.</span></p>
          <Btn size="sm" kind="secondary" onClick={() => a.setOverlay("alts")}>جایگزین‌های باز</Btn>
        </div>
      )}

      {phase === 0 && (
        <>
          <section className="space-y-2">
            <h3 className="text-[14px] font-bold text-ink">از فروشگاه بپرس</h3>
            <div className="flex flex-wrap gap-2">{QS.map(([k, l]) => <Chip key={k} active={qs[k]} onClick={() => toggleQ(k)}>{l}</Chip>)}</div>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} aria-label="متن پیام" className="w-full resize-none rounded-2xl border border-line bg-surface p-3 text-[14px] text-ink outline-none focus:border-info" />
          </section>
          <section className="space-y-2">
            <h3 className="text-[14px] font-bold text-ink">از کجا؟</h3>
            <div className="flex gap-2">{s.channels.map((c) => <Chip key={c} active={ch === c} icon={CH[c][1]} onClick={() => setCh(c)}>{CH[c][0]}</Chip>)}</div>
            {s.channels.length < 3 && <p className="text-[12px] text-ink2">فقط راه‌های ارتباطی ثبت‌شده‌ی این فروشگاه نشان داده می‌شود.</p>}
          </section>
          <Btn size="lg" full disabled={!msg.trim()} onClick={() => { a.startVer(s.id); setPhase(1); }}><Send size={18} className="flip" />بفرست و منتظر جواب باش</Btn>
          <div className="space-y-1">
            <p className="text-[12px] text-ink2">نتیجه‌ی نمایشی (برای دیدن هر چهار حالت):</p>
            <Seg value={demo} onChange={setDemo} items={[["auto", "پیش‌فرض"], ["verified", "تأیید"], ["changed", "قیمت جدید"], ["oos", "ناموجود"], ["noanswer", "بی‌پاسخ"]]} />
          </div>
        </>
      )}

      {phase > 0 && (
        <section aria-live="polite" className="space-y-0 rounded-2xl border border-line p-3">
          <h3 className="mb-2 flex items-center justify-between text-[14px] font-bold text-ink">کارهای دستیار<Badge>شبیه‌سازی</Badge></h3>
          {[
            ["پیام آماده و ارسال شد", `کانال: ${CH[ch][0]}`],
            [phase < 2 ? "در حال تماس…" : "تماس برقرار شد", phase < 2 ? "منتظر برداشتن" : "با فروشنده صحبت شد"],
            [phase < 3 ? "منتظر پاسخ…" : res === "noanswer" ? "پاسخی نیومد" : "پاسخ دریافت شد", phase < 3 ? "چند ثانیه صبر کن" : `ساعت ${time}`],
          ].map(([t, sub], i) => {
            const st = i + 1 < phase ? "done" : i + 1 === phase ? "now" : phase === 3 ? "done" : "wait";
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cx("grid size-6 place-items-center rounded-full", st === "done" ? (i === 2 && res === "noanswer" ? "bg-surface2 text-ink2" : "bg-ok text-white") : st === "now" ? "border-2 border-brand text-brand" : "border border-line text-ink2")}>
                    {st === "done" ? (i === 2 && res === "noanswer" ? <X size={13} /> : <Check size={13} strokeWidth={3} />) : <span className={cx("size-2 rounded-full bg-current", st === "now" && "animate-[blink_1s_infinite]")} />}
                  </span>
                  {i < 2 && <span className="h-6 w-px bg-line" />}
                </div>
                <div className="pb-3"><div className={cx("text-[14px]", st === "now" ? "font-bold text-ink" : "text-ink")}>{t}</div><div className="text-[12px] text-ink2">{sub}</div></div>
              </div>
            );
          })}
        </section>
      )}

      {done && <ResultCard a={a} s={s} res={res} oldP={oldP} time={time} onRetry={() => { setPhase(0); a.clearVer(s.id); }} />}

      {done && (res === "noanswer" || res === "oos") && alts.length > 0 && (
        <section className="anim-up space-y-2">
          <div className="flex gap-2 rounded-2xl bg-brand-soft p-3 text-[14px] font-bold text-ink"><Sparkles size={18} className="mt-0.5 shrink-0 text-brand" />{res === "noanswer" ? "فروشگاه پاسخ نداد؛" : "این فروشگاه ناموجود بود؛"} {fa(alts.length)} جایگزین نزدیک پیدا کردم</div>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {alts.map((x) => <AltCard key={x.id} s={x} a={a} onPick={() => { a.setSel(x.id); a.flash(`${x.name} جایگزین شد`); }} />)}
          </div>
        </section>
      )}
      <AgentLog items={[`پیام را با ${CH[ch][0]} برای ${s.name} فرستادم`, "پاسخ را با سابقه‌ی قیمت ثبت‌شده مقایسه کردم", "اگر جواب نیاید یا ناموجود باشد جایگزین نزدیک پیشنهاد می‌دهم"]} />
    </div>
  );
}
const OpenInline = ({ s }: { s: PStore }) => <span className={cx("font-medium", openState(s) === "closed" ? "text-bad" : openState(s) === "soon" ? "text-warn" : openState(s) === "open" ? "text-ok" : "")}>{openState(s) === "closed" ? "بسته" : openState(s) === "unknown" ? "ساعت نامشخص" : "باز"}</span>;

function ResultCard({ a, s, res, oldP, time, onRetry }: { a: AppState; s: PStore; res: Outcome; oldP: number; time: string; onRetry: () => void }) {
  const newP = oldP + 140000;
  const cfg = {
    verified: { cls: "border-ok bg-[var(--success-soft)]", c: "text-ok", i: <ShieldCheck size={22} />, t: "تأیید شد", q: "بله، موجوده. سایز ۴۲ و ۴۳ هم هست. قیمت همونه که ثبت شده." },
    changed: { cls: "border-warn bg-[var(--warning-soft)]", c: "text-warn", i: <TriangleAlert size={22} />, t: "قیمت تغییر کرده", q: "موجوده، ولی از دیروز قیمت رفته بالا؛ الان ۲,۹۹۰,۰۰۰ حساب می‌کنیم." },
    oos: { cls: "border-bad bg-[var(--danger-soft)]", c: "text-bad", i: <XCircle size={22} />, t: "ناموجود", q: "متأسفانه تموم شده؛ هفته‌ی بعد محموله می‌رسه." },
    noanswer: { cls: "border-line bg-surface2 border-dashed", c: "text-ink2", i: <PhoneCall size={22} />, t: "بی‌پاسخ", q: "" },
  }[res];
  return (
    <section className={cx("anim-up space-y-2 rounded-2xl border p-3", cfg.cls)} aria-live="polite">
      <h3 className={cx("flex items-center gap-2 text-[16px] font-bold", cfg.c)}>{cfg.i}{cfg.t}{res !== "noanswer" && <span className="ms-auto text-[12px] font-normal">امروز {time}</span>}</h3>
      {res === "changed" && <div className="flex items-center gap-3"><Price v={oldP} size={14} old /><ArrowLeft size={16} className="text-warn" /><Price v={newP} size={20} /></div>}
      {res === "verified" && <Price v={oldP} size={20} />}
      {cfg.q ? <blockquote className="border-s-4 border-current/30 ps-3 text-[14px] italic text-ink" style={{ borderColor: "currentColor" }}>«{cfg.q}»<footer className="mt-0.5 text-[12px] not-italic text-ink2">پاسخ {s.name}</footer></blockquote> : <p className="text-[14px] text-ink2">بعد از چند بار تلاش کسی جواب نداد. اطلاعاتی تأیید نشد و قیمت همان «ثبت‌شده» باقی می‌ماند.</p>}
      <div className="flex gap-2 pt-1">
        {(res === "verified" || res === "changed") && <Btn full onClick={() => a.go("trip")}>{res === "changed" ? "با قیمت جدید ادامه بده" : "برو سراغ فروشگاه"}<ArrowLeft size={16} /></Btn>}
        {res === "noanswer" && <Btn kind="secondary" full onClick={onRetry}><RefreshCw size={16} />دوباره تلاش کن</Btn>}
        {res !== "verified" && res !== "noanswer" && <Btn kind="secondary" onClick={() => a.setOverlay("alts")}>جایگزین</Btn>}
      </div>
    </section>
  );
}

/* -------------------------------- S7 TRIP ------------------------------- */
export function TripS({ a }: A) {
  const s = (STORES as PStore[]).find((x) => x.id === a.sel) ?? a.list[0];
  const [chk, setChk] = useState<Record<string, boolean>>({});
  if (!s) return <Empty icon={<SearchX size={26} />} title="فروشگاهی انتخاب نشده" text="اول یه فروشگاه رو انتخاب کن."><Btn onClick={() => a.go("stores")}>برگرد به فهرست</Btn></Empty>;
  const arrive = NOW + s.walk;
  const left = s.close - arrive;
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.address); a.flash("آدرس کپی شد"); }
    catch { a.flash("کپی خودکار ممکن نشد؛ آدرس را از متن بالا انتخاب کن"); }
  };
  const share = async () => {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: s.name, text: s.address }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) a.flash("اشتراک‌گذاری انجام نشد؛ دوباره تلاش کن"); }
  };
  return (
    <div className="space-y-3 p-4 pb-6">
      <div className="space-y-2 rounded-2xl bg-surface p-3">
        <div className="flex items-start justify-between gap-2"><div><h3 className="text-[18px] font-bold text-ink">{s.name}</h3><p className="text-[13px] text-ink2">{s.cat} · {s.area}</p></div><Price v={a.priceFor(s)} /></div>
        <div className="flex flex-wrap gap-1.5"><OpenBadge s={s} /><FreshTag f={freshOf(s, a.verText(s))} /></div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[[<Footprints size={18} key="1" />, `${fa(s.walk)} دقیقه`, "پیاده"], [<Car size={18} key="2" />, `${fa(s.drive)} دقیقه`, "با ماشین"], [<Clock size={18} key="3" />, hhmm(arrive), "رسیدن"]].map(([i, t, l], k) => (
          <div key={k} className="rounded-2xl border border-line p-2"><div className="mx-auto w-fit text-ink2">{i}</div><div className="text-[15px] font-bold text-ink">{t}</div><div className="text-[12px] text-ink2">{l}</div></div>
        ))}
      </div>

      <div className={cx("flex gap-2 rounded-2xl p-3 text-[13px]", left < 30 ? "bg-[var(--warning-soft)] text-warn" : "bg-[var(--success-soft)] text-ok")}>
        {left < 30 ? <TriangleAlert size={18} className="mt-0.5 shrink-0" /> : <Check size={18} className="mt-0.5 shrink-0" />}
        <span><b>زمان پیشنهادی:</b> {openState(s) === "closed" ? `الان بسته‌ست؛ فردا ${hhmm(s.open)} برو.` : s.hoursKnown ? `همین الان راه بیفت تا ${hhmm(arrive)} برسی؛ ${fa(Math.max(left, 0))} دقیقه تا بسته شدن وقت داری.` : "ساعت کاری نامشخصه؛ قبل از رفتن تماس بگیر."}</span>
      </div>

      {a.cmpStores.length >= 2 && (
        <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
          <Route size={18} className="text-brand" /><div className="flex-1 text-[14px] text-ink"><b>مسیر خرید چندفروشگاهی</b><div className="text-[12px] text-ink2">از {fa(a.cmpStores.length)} فروشگاه انتخابی به ترتیب نزدیکی</div></div>
          <Toggle on={a.multiRoute} onChange={a.setMultiRoute} label="مسیر خرید" />
        </div>
      )}

      {s.mall && (
        <section className="space-y-3 rounded-2xl border border-line p-3">
          <div className="design-mall-heading flex items-center justify-between"><h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Building2 size={18} />داخل {s.mall}</h3><Badge tone="info" icon={<Info2 />}>آدرس دقیق از روی اطلاعات متنی</Badge></div>
          <div className="flex items-stretch gap-3">
            <div className="flex w-16 flex-col-reverse gap-1" aria-label="طبقات">
              {[0, 1, 2, 3].map((f) => (
                <div key={f} className={cx("flex h-8 items-center justify-center rounded-md text-[12px] font-bold", f === s.floor ? "bg-brand text-[var(--on-primary)]" : "bg-surface2 text-ink2")}>{f === 0 ? "همکف" : `ط ${fa(f)}`}</div>
              ))}
            </div>
            <div className="flex-1 space-y-1.5 text-[13px]">
              <div className="design-breadcrumb flex items-center gap-1 text-ink"><span className="rounded bg-surface2 px-1.5">{s.mall}</span><ChevronLeft size={14} className="text-ink2" /><span className="rounded bg-surface2 px-1.5">طبقه {fa(s.floor!)}</span><ChevronLeft size={14} className="text-ink2" /><span className="rounded bg-brand-soft px-1.5 font-bold text-brand">واحد {fa(s.unit!)}</span></div>
              <p className="text-ink2">{s.hint}</p>
              <p className="text-[12px] text-ink2">این راهنما از متن آدرس ثبت‌شده استخراج شده، نه نقشه‌ی داخلی دقیق.</p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-2xl border border-line p-3">
        <p className="flex gap-2 text-[14px] text-ink"><MapPin size={18} className="mt-0.5 shrink-0 text-ink2" />{s.address}</p>
        <div className="design-address-actions grid grid-cols-3 gap-2">
          <Btn size="sm" kind="secondary" onClick={copy}><Copy size={15} />کپی آدرس</Btn>
          <Btn size="sm" kind="secondary" onClick={share}><Share2 size={15} />اشتراک</Btn>
          <Btn size="sm" onClick={() => a.setOverlay("nav")}><Navigation size={15} className="flip" />مسیریابی</Btn>
        </div>
      </section>

      <section className="rounded-2xl border border-line p-3">
        <h3 className="mb-1 text-[15px] font-bold text-ink">چی از فروشنده بپرسم؟</h3>
        {["گارانتی معتبر دارد؟ چند ماهه؟", "مدل دقیق و سایز ۴۲ را ببینم", "پرداخت قسطی و ترب‌پی قبول می‌کنید؟", "فاکتور رسمی می‌دهید؟"].map((t) => <Check2 key={t} on={!!chk[t]} onClick={() => setChk({ ...chk, [t]: !chk[t] })} label={t} />)}
      </section>
      <Btn kind="secondary" full onClick={() => a.setOverlay("alts")}><DoorClosed size={18} />فروشگاه بسته بود؟</Btn>
    </div>
  );
}
const Info2 = () => <ShieldCheck size={12} />;

/* ------------------------------ DUAL SLIDER ----------------------------- */
function DualSlider({ min, max, step, lo, hi, onChange }: { min: number; max: number; step: number; lo: number; hi: number; onChange: (lo: number, hi: number) => void }) {
  const tr = useRef<HTMLDivElement>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const start = (which: "lo" | "hi") => (e: React.PointerEvent) => {
    e.preventDefault();
    const mv = (ev: PointerEvent) => {
      const r = tr.current!.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (r.right - ev.clientX) / r.width));
      const v = Math.round((min + f * (max - min)) / step) * step;
      if (which === "lo") onChange(Math.min(v, hi - step), hi); else onChange(lo, Math.max(v, lo + step));
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const th = (v: number, which: "lo" | "hi", l: string) => (
    <button aria-label={l} role="slider" aria-valuenow={v} aria-valuemin={min} aria-valuemax={max} onPointerDown={start(which)}
      onKeyDown={(e) => {
        const d = ["ArrowLeft", "ArrowUp"].includes(e.key) ? step : ["ArrowRight", "ArrowDown"].includes(e.key) ? -step : 0;
        if (!d && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const next = e.key === "Home" ? min : e.key === "End" ? max : v + d;
        if (which === "lo") onChange(Math.max(min, Math.min(next, hi - step)), hi);
        else onChange(lo, Math.min(max, Math.max(next, lo + step)));
      }}
      className="absolute top-1/2 grid size-11 -translate-y-1/2 translate-x-1/2 touch-none place-items-center" style={{ right: pct(v) + "%" }}>
      <span className="size-6 rounded-full border-2 border-brand bg-bg shadow-md" />
    </button>
  );
  return (
    <div ref={tr} className="relative mx-3 h-11">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface2" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand" style={{ right: pct(lo) + "%", left: 100 - pct(hi) + "%" }} />
      {th(lo, "lo", "حداقل بودجه")}{th(hi, "hi", "حداکثر بودجه")}
    </div>
  );
}

/* ------------------------------ S8 FILTERS ------------------------------ */
export function FiltersSheet({ a }: A) {
  const f = a.filters;
  const set = (p: Partial<typeof f>) => a.setFilters({ ...f, ...p });
  const count = applyFilters(a.model, f).length;
  const active = [f.openNow, f.inst, f.pay, f.kala, f.fast, f.budgetMax !== DEFAULT_FILTERS.budgetMax || f.budgetMin !== DEFAULT_FILTERS.budgetMin, f.radius !== DEFAULT_FILTERS.radius].filter(Boolean).length;
  const rows: [keyof typeof f, string, ReactNode][] = [
    ["openNow", "فقط الان باز", <Clock size={18} key="a" />], ["inst", "فقط قسطی", <CreditCard size={18} key="b" />], ["pay", "ترب‌پی", <Wallet size={18} key="c" />], ["fast", "ارسال فوری", <Zap size={18} key="d" />], ["kala", "کالابرگ", <Ticket size={18} key="e" />],
  ];
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2"><h2 className="text-[18px] font-bold text-ink">فیلترها</h2>{active > 0 && <Badge tone="brand">{fa(active)} فعال</Badge>}<button onClick={() => a.setFilters({ ...DEFAULT_FILTERS })} className="ms-auto min-h-11 px-2 text-[14px] font-bold text-info">بازنشانی</button><button aria-label="بستن" onClick={() => a.setOverlay(null)} className="grid size-11 place-items-center rounded-full bg-surface2"><X size={18} /></button></div>
      <section>
        <div className="flex items-baseline justify-between"><h3 className="flex items-center gap-2 text-[14px] font-bold text-ink"><Banknote size={18} />بودجه</h3><span className="text-[13px] text-ink2">{mil(f.budgetMin)} تا {mil(f.budgetMax)} میلیون تومان</span></div>
        <DualSlider min={1000000} max={6000000} step={100000} lo={f.budgetMin} hi={f.budgetMax} onChange={(lo, hi) => set({ budgetMin: lo, budgetMax: hi })} />
      </section>
      <section>
        <div className="flex items-baseline justify-between"><h3 className="flex items-center gap-2 text-[14px] font-bold text-ink"><MapPin size={18} />محدوده</h3><span className="text-[13px] font-bold text-brand">{fa(f.radius.toFixed(1).replace(".0", "").replace(".", "٫"))} کیلومتر</span></div>
        <Slider label="محدوده جست‌وجو" min={0.5} max={5} step={0.1} value={f.radius} onChange={(v) => set({ radius: Math.round(v * 10) / 10 })} />
      </section>
      <section className="divide-y divide-line rounded-2xl border border-line px-3">
        {rows.map(([k, l, i]) => (<div key={k} className="flex items-center gap-3"><span className="text-ink2">{i}</span><span className="flex-1 text-[14px] text-ink">{l}</span><Toggle on={f[k] as boolean} onChange={(v) => set({ [k]: v })} label={l} /></div>))}
      </section>
      <section><h3 className="mb-2 text-[14px] font-bold text-ink">مرتب‌سازی</h3><Seg value={f.sort} onChange={(v) => set({ sort: v })} items={[["smart", "پیشنهادی"], ["near", "نزدیک‌ترین"], ["cheap", "ارزان‌ترین"]]} /></section>
      <Btn size="lg" full onClick={() => a.setOverlay(null)}>{count > 0 ? `نمایش ${fa(count)} فروشگاه` : "نتیجه‌ای نیست؛ فیلترها رو شل کن"}</Btn>
    </div>
  );
}

/* ------------------------------ ALTS / NAV ------------------------------ */
export function AltsSheet({ a }: A) {
  const list = a.alternatives(a.sel);
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2"><h2 className="text-[18px] font-bold text-ink">فروشگاه بسته بود؟</h2><button aria-label="بستن" onClick={() => a.setOverlay(null)} className="ms-auto grid size-11 place-items-center rounded-full bg-surface2"><X size={18} /></button></div>
      <p className="text-[13px] text-ink2">اول فروشگاه‌های باز، بعد نزدیک‌ترین‌ها. با یک ضربه جایگزین کن.</p>
      {list.length === 0 && <Empty icon={<SearchX size={24} />} title="جایگزینی پیدا نشد" text="محدوده رو بیشتر کن تا گزینه‌های دورتر هم بیایند."><Btn onClick={() => { a.setFilters({ ...a.filters, radius: Math.min(5, a.filters.radius + 1) }); }}>محدوده رو بیشتر کنم؟</Btn></Empty>}
      <div className="space-y-2">
        {list.map((s) => (
          <div key={s.id} className="space-y-1.5 rounded-2xl border border-line p-3">
            <div className="flex justify-between gap-2"><div><h4 className="text-[15px] font-bold text-ink">{s.name}</h4><p className="text-[12px] text-ink2">{s.area} · {dist(s.d)} · {fa(s.walk)} دقیقه پیاده</p></div><Price v={a.priceFor(s)} size={15} /></div>
            <div className="flex items-center gap-2"><OpenBadge s={s} /><Btn size="sm" className="ms-auto" onClick={() => { a.setSel(s.id); a.setOverlay(null); a.flash(`${s.name} جایگزین شد`); }}>جایگزین کن</Btn></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NavSheet({ a }: A) {
  const apps = [["نشان", "neshan"], ["بلد", "balad"], ["Google Maps", "gmaps"]];
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center"><h2 className="text-[18px] font-bold text-ink">مسیریابی با…</h2><button aria-label="بستن" onClick={() => a.setOverlay(null)} className="ms-auto grid size-11 place-items-center rounded-full bg-surface2"><X size={18} /></button></div>
      {apps.map(([n]) => (
        <button key={n} onClick={() => { a.setOverlay(null); a.flash(`مسیریابی با ${n} در این نسخه نمایشی است`); }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line px-3 text-[15px] font-medium text-ink hover:bg-surface"><Navigation size={18} className="flip text-brand" />{n}<ChevronLeft size={16} className="ms-auto text-ink2" /></button>
      ))}
    </div>
  );
}
