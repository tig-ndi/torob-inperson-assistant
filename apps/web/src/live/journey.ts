import {distance,money,type Offer} from './data.ts';
export type ArrivalCheck={offer_id:string;product_id:string;shop_id:string;departure_at:string;arrival_at:string|null;minutes_min:number|null;minutes_max:number|null;basis:'unknown'|'user_duration'|'rough_walking_range'|'street_route';departure_status:'declared_open'|'declared_closed'|'unknown';arrival_status:'declared_open'|'declared_closed'|'unknown';margin_status:'declared_open'|'declared_closed'|'unknown';margin_minutes:number;risk:'ready'|'unknown'|'closing_soon'|'closed';inventory_status:'unconfirmed'};
export function visitTier(o:Offer,arrival?:ArrivalCheck){return arrival?{ready:0,unknown:1,closing_soon:2,closed:3}[arrival.risk]:o.opening_hours.status==='declared_open'?0:o.opening_hours.status==='unknown'?1:3;}
export function recommendation(offers:Offer[],checks:Record<string,ArrivalCheck>,weight=50){
  const prices=[...new Set(offers.flatMap(o=>o.price_toman===null?[]:[o.price_toman]))].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  const distances=[...new Set(offers.flatMap(o=>o.direct_distance_meters===null?[]:[o.direct_distance_meters]))].sort((a,b)=>a-b);
  const score=(o:Offer)=>(1-weight/100)*(o.price_toman===null?1:prices.indexOf(o.price_toman)/Math.max(1,prices.length-1))+(weight/100)*(o.direct_distance_meters===null?1:distances.indexOf(o.direct_distance_meters)/Math.max(1,distances.length-1));
  return [...offers].sort((a,b)=>visitTier(a,checks[a.offer_id])-visitTier(b,checks[b.offer_id])||score(a)-score(b)||a.offer_id.localeCompare(b.offer_id));
}
export function choiceReason(o:Offer,checks:Record<string,ArrivalCheck>,others:Offer[]){
  const tier=visitTier(o,checks[o.offer_id]);
  if(tier===3)return 'این فروشگاه طبق برنامه بسته است؛ برای رفتن در این زمان پیشنهادش نمی‌کنم.';
  if(tier===2)return 'تا زمان رسیدن یا فرصت خرید ممکن است بسته شود؛ اول جایگزین باز را بررسی کن.';
  if(tier===1)return 'ساعت یا زمان رسیدن نامشخص است؛ بدون بررسی فروشنده، گزینهٔ مطمئن برای راه افتادن نیست.';
  const cheaper=others.filter(x=>x.price_toman!==null&&o.price_toman!==null&&BigInt(x.price_toman)<BigInt(o.price_toman));
  const closedCheaper=cheaper.some(x=>visitTier(x,checks[x.offer_id])>=2);
  return `طبق برنامه باز است${checks[o.offer_id]?.risk==='ready'?' و برای رسیدن و ۱۰ دقیقه فرصت خرید هم باز می‌ماند':''}؛ ${distance(o.direct_distance_meters)} فاصلهٔ مستقیم${o.price_toman===null?' و قیمت نامشخص':` و ${money(o.price_toman)} تومان قیمت ثبت‌شده`}.${closedCheaper?' گزینهٔ ارزان‌تر، برای این زمان وضعیت مراجعهٔ مناسبی ندارد.':''} موجودی را پیش از رفتن بررسی کن.`;
}
