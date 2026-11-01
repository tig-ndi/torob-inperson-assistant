const FA = "۰۱۲۳۴۵۶۷۸۹";
export const fa = (v: string | number) => String(v).replace(/\d/g, (d) => FA.charAt(+d));
export const money = (n: number) => fa(n.toLocaleString("en-US"));
export const short = (n: number) => fa((n / 1e6).toFixed(2).replace(/0$/, "").replace(/\.0$/, "").replace(".", "٫")) + "م";
export const mil = (n: number) => fa((n / 1e6).toFixed(1).replace(".", "٫"));
export const hhmm = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return fa(String(h).padStart(2, "0") + ":" + String(Math.round(m % 60)).padStart(2, "0"));
};
export const dist = (m: number) => (m < 1000 ? fa(m) + " متر" : fa((m / 1000).toFixed(1).replace(".", "٫")) + " کیلومتر");

export const NOW = 20 * 60 + 10; // 20:10 demo clock
export const U = { x: 800, y: 800 }; // user position in map world (1km = 200 units)

export type Model = {
  id: string; name: string; brand: string; img: string; mult: number;
  tag: string; tagTone: "brand" | "ok" | "info"; reason: string;
  specs: [string, string][]; lists: string[];
};
export const MODELS: Model[] = [
  {
    id: "m1", name: "اسکچرز گو واک ۶", brand: "اسکچرز", mult: 1,
    img: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=480&h=360&fit=crop&auto=format",
    tag: "پیشنهاد دستیار", tagTone: "brand",
    reason: "کفی نرم و سبک؛ برای پیاده‌روی روزانه کم‌خستگی‌ترین انتخاب توی بودجه‌ته.",
    specs: [["وزن", "۲۴۰ گرم"], ["کفی", "فوم خنک‌کننده"], ["زیره", "ضدلغزش"], ["گارانتی", "۶ ماه"]],
    lists: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"],
  },
  {
    id: "m2", name: "آدیداس ران‌فالکون ۵", brand: "آدیداس", mult: 0.93,
    img: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=480&h=360&fit=crop&auto=format",
    tag: "ارزان‌ترین", tagTone: "ok",
    reason: "ارزون‌تر از بقیه‌ست و برای مسافت کوتاه عالیه؛ فقط کفی‌اش کمی سفت‌تره.",
    specs: [["وزن", "۲۷۵ گرم"], ["کفی", "فوم استاندارد"], ["زیره", "لاستیکی"], ["گارانتی", "۳ ماه"]],
    lists: ["a1", "a2", "a3", "a4", "a6"],
  },
  {
    id: "m3", name: "نایک اینویژن ۱۰", brand: "نایک", mult: 0.98,
    img: "https://images.unsplash.com/photo-1625860191460-10a66c7384fb?w=480&h=360&fit=crop&auto=format",
    tag: "متعادل‌ترین", tagTone: "info",
    reason: "بین قیمت، دوام و راحتی تعادل خوبی داره و توی بیشتر فروشگاه‌ها پیدا می‌شه.",
    specs: [["وزن", "۲۶۰ گرم"], ["کفی", "فوم دوگانه"], ["زیره", "ضدسایش"], ["گارانتی", "۱۲ ماه"]],
    lists: ["a1", "a2", "a4", "a5", "a6", "a7"],
  },
];

export type Store = {
  id: string; name: string; cat: string; area: string; d: number; ang: number;
  walk: number; drive: number; open: number; close: number; hoursKnown: boolean;
  base: number; changed: number; verified?: string;
  mall?: string; floor?: number; unit?: string; hint?: string;
  inst: boolean; pay: boolean; fast: boolean; kala: boolean;
  channels: ("call" | "wa" | "bale")[]; phone?: string; address: string; outcome: Outcome; conf: number;
};
export type Outcome = "verified" | "changed" | "oos" | "noanswer";

const pos = (d: number, ang: number) => ({
  x: U.x + (d / 1000) * 200 * Math.cos((ang * Math.PI) / 180),
  y: U.y - (d / 1000) * 200 * Math.sin((ang * Math.PI) / 180),
});

export const STORES: Store[] = [
  { id: "a1", name: "اسپورت‌لند", cat: "کفش ورزشی", area: "ولیعصر", d: 450, ang: 50, walk: 6, drive: 3, open: 600, close: 1260, hoursKnown: true, base: 2850000, changed: 12,
    mall: "پاساژ ستاره", floor: 2, unit: "۲۱۴", hint: "روبروی پله‌برقی، کنار صرافی ستاره", inst: true, pay: true, fast: false, kala: false,
    channels: ["call", "wa"], address: "خیابان ولیعصر، نرسیده به میدان ونک، پاساژ ستاره، طبقه ۲، واحد ۲۱۴", outcome: "changed", conf: 82 },
  { id: "a2", name: "کفش ملی ونک", cat: "کفش و کیف", area: "ونک", d: 780, ang: 20, walk: 10, drive: 5, open: 540, close: 1320, hoursKnown: true, base: 2950000, changed: 3, verified: "امروز ۱۴:۲۰",
    inst: false, pay: false, fast: true, kala: false,
    channels: ["call", "wa", "bale"], address: "میدان ونک، ابتدای ملاصدرا، پلاک ۱۲۲", outcome: "verified", conf: 94 },
  { id: "a3", name: "ورزشی آلفا", cat: "پوشاک ورزشی", area: "سعادت‌آباد", d: 1200, ang: 160, walk: 16, drive: 7, open: 540, close: 1200, hoursKnown: true, base: 2600000, changed: 64,
    mall: "پاساژ نگین", floor: 1, unit: "۱۰۸", hint: "کنار ورودی غربی، دومین مغازه بعد از آبمیوه‌فروشی", inst: true, pay: true, fast: false, kala: false,
    channels: ["call"], address: "بلوار سعادت‌آباد، خیابان سرو غربی، پاساژ نگین، طبقه ۱، واحد ۱۰۸", outcome: "noanswer", conf: 55 },
  { id: "a4", name: "کفش آرتا", cat: "کفش ورزشی", area: "تجریش", d: 1800, ang: 85, walk: 24, drive: 11, open: 600, close: 1290, hoursKnown: true, base: 2700000, changed: 38,
    inst: true, pay: false, fast: false, kala: true,
    channels: ["call", "bale"], address: "تجریش، خیابان شریعتی، روبروی بازار قائم، پلاک ۵۴", outcome: "oos", conf: 61 },
  { id: "a5", name: "پاتوق ورزش", cat: "فروشگاه ورزشی", area: "ولنجک", d: 2100, ang: 120, walk: 28, drive: 13, open: 0, close: 0, hoursKnown: false, base: 2990000, changed: 21,
    mall: "مجتمع پارسیان", floor: 3, unit: "۳۰۵", hint: "طبقه فود‌کورت؛ بعد از پله‌برقی سمت چپ", inst: true, pay: true, fast: false, kala: true,
    channels: ["wa"], address: "ولنجک، بلوار دانشجو، مجتمع پارسیان، طبقه ۳، واحد ۳۰۵", outcome: "noanswer", conf: 48 },
  { id: "a6", name: "ورزش‌پوش سعادت", cat: "پوشاک ورزشی", area: "سعادت‌آباد", d: 2600, ang: 195, walk: 34, drive: 15, open: 600, close: 1230, hoursKnown: true, base: 3100000, changed: 5, verified: "دیروز ۱۸:۴۰",
    inst: false, pay: false, fast: true, kala: false,
    channels: ["call", "wa", "bale"], address: "سعادت‌آباد، میدان کاج، ابتدای بلوار دریا، پلاک ۸", outcome: "verified", conf: 90 },
  { id: "a7", name: "کفش رها", cat: "کفش و کیف", area: "میدان انقلاب", d: 3000, ang: 235, walk: 40, drive: 18, open: 540, close: 1260, hoursKnown: true, base: 2750000, changed: 45,
    inst: true, pay: true, fast: false, kala: false,
    channels: ["call", "wa"], address: "خیابان انقلاب، نرسیده به ۱۶ آذر، پلاک ۹۷۰", outcome: "changed", conf: 70 },
].map((s) => ({ ...s, ...pos(s.d, s.ang) })) as (Store & { x: number; y: number })[];

export type PStore = Store & { x: number; y: number };
export const PROBABLE = [
  { id: "p1", name: "کفش ایران‌زمین", cat: "کفش و کیف", area: "ولیعصر", d: 1500, ang: 300, walk: 20, open: 600, close: 1260 },
  { id: "p2", name: "ورزش‌سرای گلبرگ", cat: "فروشگاه ورزشی", area: "پاسداران", d: 2200, ang: 10, walk: 29, open: 600, close: 1290 },
].map((s) => ({ ...s, ...pos(s.d, s.ang) }));

export const priceOf = (s: Store, m: Model) => Math.round((s.base * m.mult) / 10000) * 10000;
export const listed = (s: Store, m: Model) => m.lists.includes(s.id);
export const rangeOf = (m: Model) => {
  const ps = (STORES as PStore[]).filter((s) => listed(s, m)).map((s) => priceOf(s, m));
  return { lo: Math.min(...ps), hi: Math.max(...ps), n: ps.length };
};

export type OpenState = "open" | "soon" | "closed" | "unknown";
export const openState = (s: Store, at = NOW): OpenState => {
  if (!s.hoursKnown) return "unknown";
  if (at < s.open || at >= s.close) return "closed";
  return s.close - at <= 60 ? "soon" : "open";
};
export const openLabel = (s: Store) => {
  const st = openState(s);
  if (st === "unknown") return "ساعت کاری نامشخص";
  if (st === "closed") return NOW >= s.close ? `بسته است · فردا از ${hhmm(s.open)}` : `بسته است · از ${hhmm(s.open)}`;
  return `تا ${hhmm(s.close)} باز است`;
};

export const NEIGHBORHOODS = ["ولیعصر", "ونک", "تجریش", "صادقیه", "سعادت‌آباد", "میدان انقلاب"];
export const MALLS = [
  { name: "پاساژ ستاره", x: 862, y: 745, w: 52, h: 40, floors: 4 },
  { name: "پاساژ نگین", x: 560, y: 760, w: 54, h: 36, floors: 3 },
  { name: "مجتمع پارسیان", x: 600, y: 480, w: 60, h: 44, floors: 5 },
];

export type Filters = {
  budgetMin: number; budgetMax: number; radius: number; openNow: boolean;
  inst: boolean; pay: boolean; kala: boolean; fast: boolean; sort: "smart" | "near" | "cheap";
};
export const DEFAULT_FILTERS: Filters = {
  budgetMin: 1500000, budgetMax: 3000000, radius: 3, openNow: false, inst: false, pay: false, kala: false, fast: false, sort: "smart",
};

export const applyFilters = (m: Model, f: Filters, ignore: (keyof Filters)[] = []) => {
  const on = (k: keyof Filters) => !ignore.includes(k);
  return (STORES as PStore[]).filter(
    (s) =>
      listed(s, m) &&
      (!on("radius") || s.d <= f.radius * 1000) &&
      (!on("budgetMax") || (priceOf(s, m) <= f.budgetMax && priceOf(s, m) >= f.budgetMin)) &&
      (!f.openNow || ["open", "soon"].includes(openState(s))) &&
      (!f.inst || s.inst) && (!f.pay || s.pay) && (!f.kala || s.kala) && (!f.fast || s.fast),
  );
};

export const score = (s: Store, m: Model, w: number) => {
  const prices = (STORES as PStore[]).filter((x) => listed(x, m)).map((x) => priceOf(x, m));
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const p = (priceOf(s, m) - lo) / (hi - lo || 1);
  const d = s.d / 3000;
  const open = openState(s) === "closed" ? 0.25 : openState(s) === "unknown" ? 0.1 : 0;
  return w * p + (1 - w) * d + open;
};

export const reasonFor = (s: Store, m: Model, rank: number) => {
  const st = openState(s);
  if (s.verified) return "قیمتش امروز با تماس تأیید شده و نزدیکه.";
  if (rank === 0) return "نزدیک‌ترین گزینه با قیمت منطقی؛ همین الان هم باز است.";
  if (priceOf(s, m) === rangeOf(m).lo) return "ارزان‌ترین قیمت ثبت‌شده بین فروشگاه‌های اطراف.";
  if (st === "closed") return "قیمت خوبی داره ولی الان بسته‌ست؛ فردا صبح گزینه‌ی خوبیه.";
  if (s.inst && s.pay) return "امکان خرید قسطی با ترب‌پی داره و تا امشب باز است.";
  if (s.d < 1500) return "فاصله‌ی کمی داره و داخل مسیر شماست.";
  return "قیمت متوسط و ساعت کاری مشخص؛ گزینه‌ی پشتیبان خوبیه.";
};

export const OUTCOME_TEXT: Record<Outcome, string> = {
  verified: "بله، موجوده. سایز ۴۲ و ۴۳ هم هست. قیمت همونه که ثبت شده.",
  changed: "موجوده ولی از دیروز قیمت رفته بالا؛ الان ۲,۹۹۰,۰۰۰ تومان حساب می‌کنیم.",
  oos: "متأسفانه تموم شده؛ هفته‌ی بعد محموله می‌رسه.",
  noanswer: "",
};
