import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, LocateFixed, Layers, Mic, Moon, SlidersHorizontal, Sparkles, Sun, WifiOff, X, RotateCcw,
} from "lucide-react";
import MapView, { MapPin } from "./MapView";
import {
  DEFAULT_FILTERS, Filters, MODELS, PROBABLE, PStore, STORES, U, applyFilters, dist, fa, mil, openState, priceOf, score, short, Outcome,
} from "./data";
import { Check2, Chip, Seg, StepProgress, Toast, cx } from "./ui";
import { AltsSheet, CompareS, ContactS, DecideS, FiltersSheet, HomeS, NavSheet, ResultsS, StoresS, TripS } from "./screens";

export type Screen = "home" | "decide" | "results" | "stores" | "compare" | "contact" | "trip";
type Ver = { status: "calling" | "done"; outcome?: Outcome };

const BACK: Partial<Record<Screen, Screen>> = { decide: "home", results: "decide", stores: "results", compare: "stores", contact: "compare", trip: "contact" };
const STEP: Record<Screen, number> = { home: 1, decide: 1, results: 1, stores: 2, compare: 3, contact: 4, trip: 4 };
const TITLE: Record<Screen, string> = {
  home: "دستیار خرید حضوری", decide: "انتخاب محصول", results: "مدل‌های پیشنهادی", stores: "فروشگاه‌های نزدیک",
  compare: "مقایسه‌ی فروشگاه‌ها", contact: "تأیید با فروشگاه", trip: "برنامه‌ی رفتن",
};

function useAppState() {
  const [screen, setScreen] = useState<Screen>("home");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [sim, setSim] = useState<"none" | "offline" | "error">("none");
  const [loc, setLoc] = useState<"ask" | "granted" | "denied" | "manual">("ask");
  const [hood, setHood] = useState("ولیعصر");
  const [answers, setAnswers] = useState({ use: "پیاده‌روی روزانه", brand: "فرقی نداره" });
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [modelId, setModelId] = useState("m1");
  const [cmpModels, setCmpModels] = useState<string[]>([]);
  const [sel, setSelRaw] = useState<string | null>(null);
  const [fromPin, setFromPin] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cmpStores, setCmpStores] = useState<string[]>([]);
  const [weight, setWeight] = useState(50);
  const [ver, setVer] = useState<Record<string, Ver>>({});
  const [overlay, setOverlay] = useState<null | "filters" | "alts" | "nav" | "menu">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [multiRoute, setMultiRoute] = useState(false);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half");
  const tm = useRef<number>(0);

  const model = MODELS.find((m) => m.id === modelId)!;
  const flash = useCallback((t: string) => { setToast(t); clearTimeout(tm.current); tm.current = window.setTimeout(() => setToast(null), 2200); }, []);
  const setSel = (id: string | null) => { setSelRaw(id); setFromPin(false); };

  const priceFor = (s: PStore) => priceOf(s, model) + (ver[s.id]?.outcome === "changed" ? 140000 : 0);
  const verText = (s: PStore) => (ver[s.id]?.outcome === "verified" || ver[s.id]?.outcome === "changed" ? "امروز ۲۰:۱۲" : undefined);

  const list = useMemo(() => {
    const l = applyFilters(model, filters);
    const w = 0.5;
    return [...l].sort((a, b) => (filters.sort === "near" ? a.d - b.d : filters.sort === "cheap" ? priceOf(a, model) - priceOf(b, model) : score(a, model, w) - score(b, model, w)));
  }, [model, filters]);
  const probable = useMemo(
    () => (filters.openNow || filters.inst || filters.pay || filters.kala || filters.fast ? [] : PROBABLE.filter((p) => p.d <= filters.radius * 1000)),
    [filters],
  );
  const alternatives = (excl: string | null) =>
    applyFilters(model, { ...filters, openNow: false })
      .filter((s) => s.id !== excl)
      .sort((a, b) => Number(openState(a) === "closed") - Number(openState(b) === "closed") || a.d - b.d);

  const go = (s: Screen) => {
    if ((s === "contact" || s === "trip") && !sel) setSel(cmpStores[0] ?? list[0]?.id ?? null);
    setScreen(s);
    setOverlay(null);
    setSheet((h) => (h === "peek" ? "half" : h));
    if (s === "results" || s === "stores" || s === "compare") {
      setLoading(true);
      window.setTimeout(() => setLoading(false), 900);
    }
  };
  const toggleCmp = (id: string) => setCmpStores((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 3 ? [...c, id] : (flash("حداکثر ۳ فروشگاه رو می‌شه مقایسه کرد"), c)));
  const reset = () => {
    setScreen("home"); setFilters({ ...DEFAULT_FILTERS }); setSel(null); setCmpStores([]); setCmpModels([]); setVer({}); setLoc("ask"); setSim("none");
    setMultiRoute(false); setOverlay(null); setModelId("m1"); setSheet("half");
  };

  return {
    screen, go, theme, setTheme, sim, setSim, loc, setLoc, hood, setHood, answers, setAnswers, filters, setFilters, modelId, setModelId,
    cmpModels, setCmpModels, sel, setSel, fromPin, setFromPin, expanded, setExpanded, cmpStores, setCmpStores, toggleCmp, weight, setWeight,
    ver, startVer: (id: string) => setVer((v) => ({ ...v, [id]: { status: "calling" } })),
    setVerOutcome: (id: string, outcome: Outcome) => setVer((v) => ({ ...v, [id]: { status: "done", outcome } })),
    clearVer: (id: string) => setVer((v) => { const n = { ...v }; delete n[id]; return n; }),
    overlay, setOverlay, toast, flash, loading, setLoading, multiRoute, setMultiRoute, sheet, setSheet, model, list, probable, alternatives,
    priceFor, verText, reset,
  };
}
export type AppState = ReturnType<typeof useAppState>;

export default function App() {
  const a = useAppState();
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [sysDark, setSysDark] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [dim, setDim] = useState({ w: 390, h: 844 });
  const [dragH, setDragH] = useState<number | null>(null);
  const [radiusDrag, setRadiusDrag] = useState(0);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState({ radius: true, iso: false });
  const [recenter, setRecenter] = useState(0);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.visualViewport?.height ?? window.innerHeight });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const mm = (e: MediaQueryListEvent) => setSysDark(e.matches);
    window.addEventListener("resize", on); mq.addEventListener("change", mm);
    window.visualViewport?.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); window.visualViewport?.removeEventListener("resize", on); mq.removeEventListener("change", mm); };
  }, []);

  useEffect(() => {
    if (!a.overlay) return;
    const previous = document.activeElement;
    const dialog = frame.current?.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]') ?? [])
      .filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); a.setOverlay(null); }
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [a.overlay]);

  const desktop = vp.w >= 1000 || (vp.w >= 700 && vp.h < 500);
  const panelWidth = vp.w < 1000 ? 360 : 420;
  const dark = a.theme === "dark" || (a.theme === "system" && sysDark);
  const { screen, model, list } = a;

  useEffect(() => {
    if (!frame.current) return;
    const ro = new ResizeObserver(([e]) => { if (e) setDim({ w: e.contentRect.width, h: e.contentRect.height }); });
    ro.observe(frame.current);
    return () => ro.disconnect();
  }, [desktop]);

  const fullH = Math.max(160, dim.h - 84);
  const peekH = Math.min(112, fullH), halfH = Math.min(fullH, Math.max(240, Math.round(dim.h * 0.52)));
  const snapH = { peek: peekH, half: halfH, full: fullH }[a.sheet];

  const startSheetDrag = (e: React.PointerEvent, tap = false) => {
    if (!tap && (e.target as HTMLElement).closest("button")) return;
    const y0 = e.clientY, h0 = snapH;
    let last = h0;
    const mv = (ev: PointerEvent) => { last = Math.min(fullH, Math.max(peekH, h0 + (y0 - ev.clientY))); setDragH(last); };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      if (Math.abs(last - h0) < 4) { if (tap) a.setSheet(a.sheet === "half" ? "full" : a.sheet === "full" ? "half" : "half"); }
      else { const t = [["peek", peekH], ["half", halfH], ["full", fullH]] as const; a.setSheet(t.reduce((b, c) => (Math.abs(c[1] - last) < Math.abs(b[1] - last) ? c : b))[0]); }
      setDragH(null);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  /* ---- map data ---- */
  const storeOf = (id: string) => (STORES as PStore[]).find((s) => s.id === id)!;
  const pinFor = (s: PStore, rank?: number): MapPin => {
    const st = openState(s);
    return { id: s.id, x: s.x, y: s.y, label: short(a.priceFor(s)), rank, state: st === "closed" ? "closed" : st === "unknown" ? "unknown" : "default", verified: !!s.verified || ["verified", "changed"].includes(a.ver[s.id]?.outcome ?? "") };
  };
  let pins: MapPin[] = [];
  let route: { x: number; y: number }[] | undefined, stops: { x: number; y: number; n: number }[] | undefined, chip: { x: number; y: number; text: string } | undefined;
  const sSel = a.sel ? storeOf(a.sel) : undefined;
  if (screen === "stores") {
    pins = [...list.map((s, i) => pinFor(s, i + 1)), ...a.probable.map((p) => ({ id: p.id, x: p.x, y: p.y, label: "؟", state: "maybe" as const }))];
  } else if (screen === "compare") {
    pins = a.cmpStores.filter((id) => list.some((s) => s.id === id)).map((id, i) => pinFor(storeOf(id), i + 1));
  } else if (screen === "contact" && sSel) pins = [pinFor(sSel)];
  else if (screen === "trip" && sSel) {
    const chain = (from: { x: number; y: number }, to: { x: number; y: number }) => { const my = (from.y + to.y) / 2; return [from, { x: from.x, y: my }, { x: to.x, y: my }, to]; };
    if (a.multiRoute && a.cmpStores.length >= 2) {
      const ss = a.cmpStores.map(storeOf).sort((p, q) => p.d - q.d);
      route = [U]; stops = [];
      ss.forEach((s, i) => { route = [...route!, ...chain(route!.at(-1) ?? U, s).slice(1)]; stops!.push({ x: s.x, y: s.y, n: i + 1 }); });
      pins = ss.map((s) => pinFor(s));
      const first = ss[0] ?? sSel;
      chip = { x: (U.x + first.x) / 2, y: (U.y + first.y) / 2 - 10, text: `${fa(ss.length)} توقف · ${dist(ss.reduce((t, s) => t + s.d, 0) * 1.1)}` };
    } else {
      route = chain(U, sSel); pins = [pinFor(sSel)];
      chip = { x: (U.x + sSel.x) / 2, y: (U.y + sSel.y) / 2, text: `${dist(sSel.d)} · ${fa(sSel.walk)} دقیقه پیاده` };
    }
  }
  const radiusOn = layers.radius && ["home", "decide", "results", "stores"].includes(screen);
  const fit = pins.length ? [...pins, U] : [{ x: U.x - a.filters.radius * 200, y: U.y - a.filters.radius * 200 }, { x: U.x + a.filters.radius * 200, y: U.y + a.filters.radius * 200 }];
  const fitKey = [screen, a.modelId, pins.map((p) => p.id).join(","), pins.length ? "" : a.filters.radius, desktop, a.multiRoute, recenter, radiusDrag].join("|");
  const mallNames = pins.map((p) => storeOf(p.id)?.mall).filter(Boolean) as string[];
  const pad = desktop ? { top: 150, bottom: 40, left: vp.w < 1000 ? 70 : 90, right: panelWidth + 60 } : { top: 150, bottom: (a.sheet === "peek" ? peekH : halfH) + 24, left: 64, right: 28 };

  const onPin = (id: string) => {
    if (id.startsWith("p")) return a.flash("این فروشگاه فقط در همین دسته فعالیت دارد؛ موجودی کالا نامشخص است");
    a.setSel(id); a.setFromPin(true); a.setExpanded(null);
    if (screen === "stores") a.setSheet((h) => (h === "peek" ? "half" : h));
  };

  const f = a.filters;
  const instCount = applyFilters(model, f).length;
  const setF = (p: Partial<Filters>) => a.setFilters({ ...f, ...p });
  const budgetActive = f.budgetMax !== DEFAULT_FILTERS.budgetMax || f.budgetMin !== DEFAULT_FILTERS.budgetMin;

  const Body = () => {
    switch (screen) {
      case "home": return <HomeS a={a} />;
      case "decide": return <DecideS a={a} />;
      case "results": return <ResultsS a={a} />;
      case "stores": return <StoresS a={a} />;
      case "compare": return <CompareS a={a} />;
      case "contact": return <ContactS a={a} />;
      case "trip": return <TripS a={a} />;
    }
  };

  const header = (
    <>
      {!desktop && (
        <button aria-label="تغییر ارتفاع پنل" onPointerDown={(e) => startSheetDrag(e, true)} className="mx-auto grid h-6 w-full touch-none place-items-center">
          <span className="h-1.5 w-10 rounded-full bg-line" style={{ background: "var(--border)" }} />
        </button>
      )}
      <div className={desktop ? "pt-4" : ""} onPointerDown={desktop ? undefined : startSheetDrag} style={{ touchAction: "none" }}>
        <StepProgress step={STEP[screen]} onGo={(n) => a.go((["results", "stores", "compare", "contact"] as Screen[])[n - 1] ?? "home")} />
        <div className="flex h-10 items-center gap-1 px-2">
          {BACK[screen] ? (
            <button aria-label="بازگشت" onPointerDown={(e) => e.stopPropagation()} onClick={() => a.go(BACK[screen]!)} className="grid size-11 place-items-center rounded-full text-ink hover:bg-surface2"><ArrowRight size={20} /></button>
          ) : <span className="w-3" />}
          <h2 className="flex-1 truncate text-[16px] font-bold text-ink">{TITLE[screen]}</h2>
          {screen === "stores" && (
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => a.setOverlay("filters")} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-bold text-brand"><SlidersHorizontal size={16} />فیلتر</button>
          )}
        </div>
      </div>
    </>
  );

  const panel = (
    <div
      data-design-panel data-screen={screen} role="region" aria-label={TITLE[screen]}
      className={cx("design-panel absolute z-30 flex flex-col overflow-hidden bg-bg", desktop ? "bottom-4 right-4 top-4 rounded-3xl" : "inset-x-0 bottom-0 rounded-t-3xl")}
      style={{ width: desktop ? panelWidth : undefined, height: desktop ? undefined : dragH ?? snapH, boxShadow: "var(--shadow-3)", transition: dragH == null && !desktop ? "height 300ms cubic-bezier(.3,1.2,.4,1)" : "none" }}
    >
      {header}
      <div data-panel-content className="scroll-soft min-h-0 flex-1 overflow-y-auto border-t border-line" key={screen}>
        {a.sim === "error" && screen !== "stores" ? <ErrBody a={a} /> : Body()}
      </div>
    </div>
  );

  return (
    <div dir="rtl" lang="fa" className={cx(dark ? "theme-dark" : "theme-light", "design-app min-h-full font-sans text-ink")} data-layout={desktop ? "desktop" : "mobile"}>
      <div ref={frame} className="design-frame fixed inset-x-0 top-0 bg-bg" style={{ height: vp.h }}>
        <div className="absolute inset-0 overflow-hidden">
          <MapView
            pins={pins} selected={a.sel} onPin={onPin} fit={fit} fitKey={fitKey} pad={pad} radius={f.radius} onRadius={(r) => setF({ radius: r })}
            showRadius={radiusOn} showIso={layers.iso && radiusOn} malls={mallNames} route={route} stops={stops} routeChip={chip} W={dim.w} H={dim.h}
            dropKey={screen + a.modelId + (a.sel ?? "")} userLabel={a.loc === "granted" ? "موقعیت تو" : undefined}
            onDragState={(d) => !d && setRadiusDrag((n) => n + 1)}
          />

          {/* top: assistant pill + chips */}
          <div className="design-toolbar absolute top-0 z-20 space-y-2 pt-3" style={{ right: desktop ? panelWidth + 32 : 0, left: 0 }}>
            <AssistantPill a={a} />
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1">
              <Chip active={budgetActive} onClick={() => a.setOverlay("filters")}>بودجه · تا {mil(f.budgetMax)} م</Chip>
              <Chip active={f.radius !== DEFAULT_FILTERS.radius} onClick={() => a.setOverlay("filters")}>محدوده · {fa(f.radius)} کم</Chip>
              <Chip active={f.inst} onClick={() => setF({ inst: !f.inst })}>{f.inst ? `فقط قسطی · ${fa(instCount)}` : "فقط قسطی"}</Chip>
              <Chip active={f.openNow} onClick={() => setF({ openNow: !f.openNow })}>الان باز</Chip>
              <Chip active={f.pay} onClick={() => setF({ pay: !f.pay })}>ترب‌پی</Chip>
              <Chip active={f.fast} onClick={() => setF({ fast: !f.fast })}>ارسال فوری</Chip>
              <Chip active={f.kala} onClick={() => setF({ kala: !f.kala })}>کالابرگ</Chip>
            </div>
            {a.sim === "offline" && (
              <div role="status" className="anim-up mx-3 flex items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-[13px] text-bg shadow-lg">
                <WifiOff size={16} />آفلاین هستی؛ قیمت‌ها مال آخرین بروزرسانی‌اند.
                <button onClick={() => { a.setSim("none"); a.flash("دوباره آنلاین شدی"); }} className="ms-auto min-h-11 font-bold underline">تلاش دوباره</button>
              </div>
            )}
          </div>

          {/* map controls, left side */}
          <div className="absolute left-3 z-20 flex flex-col gap-2" style={{ top: a.sim === "offline" ? 196 : 138 }}>
            {[
              [<LocateFixed size={20} key="l" />, "برگشت به موقعیت من", () => setRecenter((n) => n + 1)],
              [<Layers size={20} key="y" />, "لایه‌ها", () => setLayersOpen((o) => !o)],
              [dark ? <Sun size={20} key="s" /> : <Moon size={20} key="m" />, "تغییر تم", () => a.setTheme(dark ? "light" : "dark")],
            ].map(([i, l, fn]) => (
              <button key={l as string} aria-label={l as string} onClick={fn as () => void} className="grid size-11 place-items-center rounded-full border border-line bg-bg text-ink transition-colors hover:bg-surface" style={{ boxShadow: "var(--shadow-2)" }}>{i as never}</button>
            ))}
            {layersOpen && (
              <div className="anim-up absolute left-14 top-12 w-52 rounded-2xl border border-line bg-bg p-2" style={{ boxShadow: "var(--shadow-2)" }}>
                <Check2 on={layers.radius} onClick={() => setLayers({ ...layers, radius: !layers.radius })} label="دایره‌ی محدوده" />
                <Check2 on={layers.iso} onClick={() => setLayers({ ...layers, iso: !layers.iso, radius: true })} label="۱۰ دقیقه پیاده" />
              </div>
            )}
          </div>

          {panel}

          {/* overlays */}
          {a.overlay && a.overlay !== "menu" && (
            <>
              <div className="absolute inset-0 z-40" style={{ background: "var(--scrim)" }} onClick={() => a.setOverlay(null)} />
              <div className={cx("design-dialog anim-up scroll-soft absolute z-50 overflow-y-auto bg-bg", desktop ? "bottom-4 right-4 max-h-[90%] rounded-3xl" : "inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl")} style={{ width: desktop ? panelWidth : undefined, boxShadow: "var(--shadow-3)" }} role="dialog" aria-modal="true" aria-label={a.overlay === "filters" ? "فیلترها" : a.overlay === "alts" ? "فروشگاه‌های جایگزین" : "مسیریابی"}>
                {a.overlay === "filters" && <FiltersSheet a={a} />}
                {a.overlay === "alts" && <AltsSheet a={a} />}
                {a.overlay === "nav" && <NavSheet a={a} />}
              </div>
            </>
          )}
          {a.overlay === "menu" && <MenuPop a={a} />}
          <Toast msg={a.toast} />
        </div>
      </div>
    </div>
  );
}

function ErrBody({ a }: { a: AppState }) {
  return (
    <div className="anim-up flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-surface2 text-ink2"><WifiOff size={26} /></div>
      <h3 className="text-[16px] font-bold">نتونستم این بخش رو بیارم</h3>
      <p className="text-[14px] text-ink2">مشکل از سمت ما بود. دوباره تلاش کن؛ اطلاعات قبلی سر جاشه.</p>
      <button onClick={() => a.setSim("none")} className="min-h-11 rounded-[14px] bg-brand px-5 font-bold text-[var(--on-primary)]">تلاش دوباره</button>
    </div>
  );
}

function AssistantPill({ a }: { a: AppState }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="mx-3 flex h-[52px] max-w-[560px] items-center gap-1 rounded-full border border-line bg-bg pe-1.5 ps-4"
      style={{ boxShadow: "var(--shadow-2)" }}
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) { a.go("decide"); setQ(""); } }}
    >
      <Sparkles size={18} className="shrink-0 text-brand" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="چی می‌خوای بخری؟" aria-label="چی می‌خوای بخری؟" className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-ink outline-none placeholder:text-ink2" />
      <button type="button" aria-label="جست‌وجوی صوتی" onClick={() => a.flash("جست‌وجوی صوتی در این نسخه نمایشی است")} className="grid size-11 place-items-center rounded-full text-ink hover:bg-surface2"><Mic size={20} /></button>
      <button type="button" aria-label="پروفایل و تنظیمات" onClick={() => a.setOverlay(a.overlay === "menu" ? null : "menu")} className="grid size-10 place-items-center rounded-full bg-brand-soft text-[15px] font-bold text-brand">س</button>
    </form>
  );
}

function MenuPop({ a }: { a: AppState }) {
  const sims: [string, () => void][] = [
    ["شبیه‌سازی آفلاین", () => a.setSim("offline")],
    ["شبیه‌سازی خطا", () => a.setSim("error")],
    ["حالت بارگذاری", () => { a.setLoading(true); setTimeout(() => a.setLoading(false), 2500); }],
    ["موقعیت رد شد", () => { a.go("home"); a.setLoc("denied"); }],
  ];
  return (
    <>
      <div className="absolute inset-0 z-40" onClick={() => a.setOverlay(null)} />
      <div role="dialog" aria-modal="true" aria-label="تنظیمات" className="anim-up absolute left-3 top-[68px] z-50 max-h-[calc(100%-80px)] w-72 space-y-3 overflow-y-auto rounded-2xl border border-line bg-bg p-3" style={{ boxShadow: "var(--shadow-2)" }}>
        <div className="flex items-center justify-between"><b className="text-[14px]">تنظیمات</b><button aria-label="بستن" onClick={() => a.setOverlay(null)} className="grid size-9 place-items-center"><X size={16} /></button></div>
        <div><div className="mb-1 text-[12px] text-ink2">تم</div><Seg value={a.theme} onChange={a.setTheme} items={[["light", "روشن"], ["dark", "تاریک"], ["system", "سیستم"]]} /></div>
        <div>
          <div className="mb-1 text-[12px] text-ink2">دیدن حالت‌های خاص</div>
          <div className="grid grid-cols-2 gap-1.5">{sims.map(([l, fn]) => <button key={l} onClick={() => { fn(); a.setOverlay(null); }} className="min-h-11 rounded-xl bg-surface2 px-2 text-[12px] font-medium text-ink">{l}</button>)}</div>
        </div>
        <button onClick={() => { a.reset(); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-[13px] font-bold text-ink"><RotateCcw size={15} />شروع دوباره‌ی دمو</button>
      </div>
    </>
  );
}
