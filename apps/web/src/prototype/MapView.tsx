import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { MALLS, U, fa } from "./data";

export type MapPin = {
  id: string; x: number; y: number; label: string; rank?: number;
  state: "default" | "selected" | "closed" | "unknown" | "maybe"; verified?: boolean; dim?: boolean;
};
export type Pad = { top: number; bottom: number; left: number; right: number };
type Pt = { x: number; y: number };

const H_ROADS = [100, 230, 340, 470, 560, 680, 790, 920, 1010, 1130, 1260, 1370, 1480];
const V_ROADS = [90, 210, 330, 450, 580, 700, 840, 960, 1080, 1200, 1330, 1450];
const H_MAJOR = [470, 920, 1260];
const V_MAJOR = [450, 840, 1200];
const PARKS = [
  { x: 330, y: 560, w: 120, h: 120, n: "پارک ملت" },
  { x: 960, y: 340, w: 120, h: 130, n: "پارک ساعی" },
  { x: 580, y: 1010, w: 120, h: 120, n: "پارک شهر" },
  { x: 1080, y: 790, w: 120, h: 130, n: "باغ‌موزه" },
];
const WATER = { x: 1080, y: 1260, w: 250, h: 110, n: "دریاچه‌ی مصنوعی" };
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const BASE = (() => {
  const blocks: { x: number; y: number; w: number; h: number; k: number }[] = [];
  let k = 0;
  for (let i = 0; i < V_ROADS.length - 1; i++)
    for (let j = 0; j < H_ROADS.length - 1; j++) {
      const x0 = V_ROADS[i], x1 = V_ROADS[i + 1], y0 = H_ROADS[j], y1 = H_ROADS[j + 1];
      if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const inZone = [...PARKS, WATER].some((p) => cx >= p.x && cx <= p.x + p.w + 6 && cy >= p.y && cy <= p.y + p.h + 6);
      k++;
      if (inZone) continue;
      const m = 10 + rnd(k) * 6;
      const split = rnd(k + 99) > 0.55;
      if (split) {
        const mid = x0 + (x1 - x0) * (0.4 + rnd(k + 5) * 0.2);
        blocks.push({ x: x0 + m, y: y0 + m, w: mid - x0 - m - 3, h: y1 - y0 - 2 * m, k });
        blocks.push({ x: mid + 3, y: y0 + m, w: x1 - mid - m - 3, h: y1 - y0 - 2 * m, k: k + 1000 });
      } else blocks.push({ x: x0 + m, y: y0 + m, w: x1 - x0 - 2 * m, h: y1 - y0 - 2 * m, k });
    }
  return blocks;
})();

const BaseMap = ({ z }: { z: number }) => {
  const fs = 11 / z;
  const roads = (w: number, major: boolean) => (
    <>
      {(major ? H_MAJOR : H_ROADS.filter((r) => !H_MAJOR.includes(r))).map((y) => (
        <line key={"h" + y} x1={0} x2={1600} y1={y} y2={y} strokeWidth={w} />
      ))}
      {(major ? V_MAJOR : V_ROADS.filter((r) => !V_MAJOR.includes(r))).map((x) => (
        <line key={"v" + x} y1={0} y2={1600} x1={x} x2={x} strokeWidth={w} />
      ))}
    </>
  );
  const Lbl = ({ x, y, t, o = 1, b }: { x: number; y: number; t: string; o?: number; b?: boolean }) => (
    <text x={x} y={y} className="halo" textAnchor="middle" fontSize={fs} fill="var(--m-label)" opacity={o} fontWeight={b ? 700 : 500} style={{ strokeWidth: 3 / z }}>
      {t}
    </text>
  );
  return (
    <g>
      <rect width={1600} height={1600} fill="var(--m-land)" />
      {BLOCKS()}
      {PARKS.map((p) => (<rect key={p.n} x={p.x} y={p.y} width={p.w} height={p.h} rx={10} fill="var(--m-park)" />))}
      <rect x={WATER.x} y={WATER.y} width={WATER.w} height={WATER.h} rx={50} fill="var(--m-water)" />
      <g stroke="var(--m-casing)" fill="none">{roads(13, false)}{roads(22, true)}<path d="M770 0 L800 600 L850 1000 L830 1600" strokeWidth={22} /></g>
      <g stroke="var(--m-road)" fill="none" strokeLinecap="round">{roads(10, false)}{roads(18, true)}<path d="M770 0 L800 600 L850 1000 L830 1600" strokeWidth={18} /></g>
      {PARKS.map((p) => (<Lbl key={p.n} x={p.x + p.w / 2} y={p.y + p.h / 2} t={p.n} />))}
      <Lbl x={WATER.x + WATER.w / 2} y={WATER.y + WATER.h / 2} t={WATER.n} />
      <Lbl x={850} y={250} t="بلوار ولیعصر" b />
      <Lbl x={450} y={915} t="بزرگراه نیایش" o={0.8} b />
      <Lbl x={1000} y={465} t="خیابان شریعتی" o={0.8} b />
      <Lbl x={520} y={720} t="سعادت‌آباد" b />
      <Lbl x={1000} y={900} t="پاسداران" b />
      <Lbl x={900} y={330} t="تجریش" b />
      <Lbl x={640} y={440} t="ولنجک" b />
      <Lbl x={890} y={730} t="ونک" b />
      <Lbl x={470} y={1050} t="میدان انقلاب" b />
      <Lbl x={1250} y={640} t="گلبرگ" b />
    </g>
  );
};
const BLOCKS_CACHE = BASE.map((b) => <rect key={b.k} x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--m-block)" />);
const BLOCKS = () => BLOCKS_CACHE;

function chevrons(pts: Pt[], z: number) {
  const out: ReactElement[] = [];
  const s = 5 / z;
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    for (let t = 40 / z; t < len; t += 90 / z) {
      const x = a.x + ((b.x - a.x) * t) / len, y = a.y + ((b.y - a.y) * t) / len;
      out.push(<path key={n++} d={`M${-s} ${-s} L${s} 0 L${-s} ${s}`} transform={`translate(${x} ${y}) rotate(${ang})`} fill="none" stroke="#fff" strokeWidth={2 / z} strokeLinecap="round" strokeLinejoin="round" />);
    }
  }
  return out;
}

export default function MapView({
  pins, selected, onPin, fit, fitKey, pad, radius, onRadius, showRadius, showIso, malls = [], route, stops, routeChip, userLabel,
  W, H, dropKey, onDragState,
}: {
  pins: MapPin[]; selected?: string | null; onPin: (id: string) => void; fit: Pt[]; fitKey: string; pad: Pad;
  radius: number; onRadius: (km: number) => void; showRadius: boolean; showIso: boolean; malls?: string[];
  route?: Pt[]; stops?: (Pt & { n: number })[]; routeChip?: Pt & { text: string }; userLabel?: string;
  W: number; H: number; dropKey: string; onDragState?: (d: boolean) => void;
}) {
  const [cam, setCam] = useState({ z: 0.3, tx: 0, ty: 0 });
  const drag = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const compute = () => {
    const pts = fit.length ? fit : [U];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const aw = Math.max(80, W - pad.left - pad.right), ah = Math.max(80, H - pad.top - pad.bottom);
    const bw = Math.max(maxX - minX, 160), bh = Math.max(maxY - minY, 160);
    const z = Math.min(1.5, Math.max(0.22, Math.min(aw / bw, ah / bh)));
    const tx = pad.left + aw / 2 - ((minX + maxX) / 2) * z;
    const ty = pad.top + ah / 2 - ((minY + maxY) / 2) * z;
    setCam({ z, tx, ty });
  };
  useEffect(() => {
    if (!drag.current && W > 0) compute();
    // eslint-disable-next-line
  }, [fitKey, W, H, pad.top, pad.bottom, pad.left, pad.right]);

  const { z, tx, ty } = cam;
  const sx = (x: number) => tx + x * z, sy = (y: number) => ty + y * z;
  const R = radius * 200;

  const iso = useMemo(() => {
    const r = 0.8 * 200;
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const k = r * (0.72 + 0.28 * Math.abs(Math.sin(i * 1.9 + 0.5)));
      return `${U.x + Math.cos(a) * k},${U.y + Math.sin(a) * k}`;
    }).join(" ");
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = true;
    onDragState?.(true);
    const move = (ev: PointerEvent) => {
      const r = box.current!.getBoundingClientRect();
      const wx = (ev.clientX - r.left - tx) / z, wy = (ev.clientY - r.top - ty) / z;
      const km = Math.hypot(wx - U.x, wy - U.y) / 200;
      onRadius(Math.min(5, Math.max(0.5, Math.round(km * 10) / 10)));
    };
    const up = () => {
      drag.current = false;
      onDragState?.(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const shown = useMemo(() => {
    const placed: { id: string; pins: [MapPin, ...MapPin[]]; x: number; y: number }[] = [];
    [...pins].sort((a, b) => (a.state === "selected" ? -1 : 0) - (b.state === "selected" ? -1 : 0)).forEach((p) => {
      const X = sx(p.x), Y = sy(p.y);
      const c = p.state === "selected" ? undefined : placed.find((q) => !q.pins.some((x) => x.state === "selected") && Math.hypot(q.x - X, q.y - Y) < 30);
      if (c) c.pins.push(p);
      else placed.push({ id: p.id, pins: [p], x: X, y: Y });
    });
    return placed;
    // eslint-disable-next-line
  }, [pins, cam]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-[var(--m-land)]" aria-label="نقشه">
      <svg width={W} height={H} className="absolute inset-0">
        <g style={{ transform: `translate(${tx}px,${ty}px) scale(${z})`, transition: drag.current ? "none" : "transform 700ms cubic-bezier(.2,.8,.2,1)", transformOrigin: "0 0" }}>
          <BaseMap z={z} />
          {MALLS.map((m) => {
            const on = malls.includes(m.name);
            return (
              <g key={m.name}>
                <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={6} fill="var(--m-mall)" stroke={on ? "var(--primary)" : "var(--m-casing)"} strokeWidth={on ? 2 : 1} vectorEffect="non-scaling-stroke" />
                {on && (
                  <text x={m.x + m.w / 2} y={m.y - 6 / z} textAnchor="middle" className="halo" fontSize={11 / z} fontWeight={700} fill="var(--primary)">{m.name}</text>
                )}
              </g>
            );
          })}
          {showIso && <polygon points={iso} fill="var(--info)" fillOpacity={0.08} stroke="var(--info)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
          {showRadius && (
            <circle cx={U.x} cy={U.y} r={R} fill="var(--primary)" fillOpacity={0.055} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="7 6" vectorEffect="non-scaling-stroke" style={{ transition: drag.current ? "none" : "r 300ms ease-out" }} />
          )}
          {route && route.length > 1 && (
            <g key={dropKey + "r"}>
              <polyline points={route.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={0.16} />
              <polyline points={route.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ ["--len" as string]: 1, animation: "draw 1.1s ease-out both" }} />
              {chevrons(route, z)}
            </g>
          )}
        </g>
      </svg>

      {/* user */}
      <div className="pointer-events-none absolute" style={{ left: sx(U.x), top: sy(U.y), transition: drag.current ? "none" : "left 700ms cubic-bezier(.2,.8,.2,1), top 700ms cubic-bezier(.2,.8,.2,1)" }}>
        <div className="absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info/10 ring-1 ring-info/30" />
        <div className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info/40" style={{ animation: "pulse-ring 2.2s ease-out infinite" }} />
        <div className="absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-info shadow-md" />
        {userLabel && <div className="absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-bg/90 px-2 py-0.5 text-[11px] font-bold text-info">{userLabel}</div>}
      </div>

      {/* radius handle */}
      {showRadius && (
        <>
          <button
            aria-label="تغییر محدوده جست‌وجو"
            onPointerDown={startDrag}
            className="absolute z-20 grid size-11 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center"
            style={{ left: sx(U.x + R * Math.cos(Math.PI * 0.8)), top: sy(U.y + R * Math.sin(Math.PI * 0.8)), cursor: "grab" }}
          >
            <span className="grid size-6 place-items-center rounded-full border-2 border-brand bg-bg shadow-md"><span className="size-1.5 rounded-full bg-brand" /></span>
          </button>
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-bg px-2.5 py-0.5 text-[12px] font-bold text-brand shadow" style={{ left: sx(U.x + R * Math.cos(Math.PI * 0.8)), top: sy(U.y + R * Math.sin(Math.PI * 0.8)) + 20 }}>
            {fa(radius.toFixed(1).replace(".0", "").replace(".", "٫"))} کیلومتر
          </div>
          {showIso && (
            <div className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-info shadow" style={{ left: sx(U.x), top: sy(U.y - 0.8 * 200 * 0.72) - 22 }}>
              ۱۰ دقیقه پیاده
            </div>
          )}
        </>
      )}

      {routeChip && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[12px] font-bold text-bg shadow-lg" style={{ left: sx(routeChip.x), top: sy(routeChip.y) }}>
          {routeChip.text}
        </div>
      )}
      {stops?.map((s) => (
        <div key={s.n} className="pointer-events-none absolute z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-ink text-[12px] font-bold text-bg" style={{ left: sx(s.x), top: sy(s.y) }}>{fa(s.n)}</div>
      ))}

      {/* pins */}
      {shown.map((c, idx) =>
        c.pins.length > 1 ? (
          <button key={"c" + c.id + c.pins.length} onClick={() => onPin(c.pins[0].id)} aria-label={`${fa(c.pins.length)} فروشگاه`}
            className="absolute z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-brand bg-bg text-[13px] font-bold text-brand shadow-md"
            style={{ left: c.x, top: c.y, transition: "left 700ms cubic-bezier(.2,.8,.2,1), top 700ms cubic-bezier(.2,.8,.2,1)" }}>
            {fa(c.pins.length)}
          </button>
        ) : (
          <Pin key={c.pins[0].id} p={c.pins[0]} x={c.x} y={c.y} i={idx} dropKey={dropKey} sel={selected === c.pins[0].id} onPin={onPin} />
        ),
      )}
    </div>
  );
}

function Pin({ p, x, y, i, dropKey, sel, onPin }: { p: MapPin; x: number; y: number; i: number; dropKey: string; sel: boolean; onPin: (id: string) => void }) {
  const st = sel ? "selected" : p.state;
  const cls = {
    default: "bg-[var(--pin-bg)] text-[var(--pin-ink)] border border-line",
    selected: "bg-brand text-[var(--on-primary)] border border-brand scale-110",
    closed: "bg-surface2 text-ink2 border border-line",
    unknown: "bg-[var(--pin-bg)] text-ink2 border border-dashed border-ink2",
    maybe: "bg-[var(--pin-bg)] text-ink2 border border-dashed border-ink2",
  }[st];
  return (
    <div className="absolute" style={{ left: x, top: y, zIndex: sel ? 30 : 10, opacity: p.dim ? 0.55 : 1, transition: "left 700ms cubic-bezier(.2,.8,.2,1), top 700ms cubic-bezier(.2,.8,.2,1)" }}>
      <button
        key={dropKey}
        onClick={() => onPin(p.id)}
        aria-label={`فروشگاه ${p.label}`}
        className={`absolute flex h-8 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold shadow-lg transition-[background,transform] duration-200 ${cls}`}
        style={{ transform: "translate(-50%,-100%)", animation: `pin-drop 460ms cubic-bezier(.34,1.56,.64,1) ${i * 110}ms both`, marginTop: -5 }}
      >
        {p.rank != null && <span className={`grid size-4 place-items-center rounded-full text-[10px] ${st === "selected" ? "bg-white/25" : "bg-brand-soft text-brand"}`}>{fa(p.rank)}</span>}
        {p.label}
        {p.verified && <Check size={12} strokeWidth={3.5} className={st === "selected" ? "" : "text-ok"} />}
        <span className={`absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 ${st === "selected" ? "bg-brand" : "bg-[var(--pin-bg)] border-b border-r border-line"}`} />
      </button>
    </div>
  );
}
