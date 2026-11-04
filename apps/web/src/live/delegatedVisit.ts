import type {Offer} from './data.ts';
import type {ArrivalCheck} from './journey.ts';
import type {RoadRoute} from './upgrades.ts';

export type DelegatedVisit={id:string;goal:'nearest'|'balanced'|'cheapest';status:'pending'|'planned'|'blocked';request:string;phoneKind:'ask'|'smart'|'basic'|'any'|null;excluded:string[];offerId:string|null;note:string};
const clean=(s:string)=>s.replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
export function visitCommand(text:string):'delegate'|'alternative'|'cancel'|null{
 const s=clean(text);
 if(/انتخاب\s*نکن|خودم\s+(?:انتخاب|بررسی)|برنامه.*(?:لغو کن|متوقف کن)|منصرف شدم/.test(s))return 'cancel';
 if(/اگر|اگه|فرض|چطور|چگونه|می تونی|میتونی|می کنی/.test(s))return null;
 if(/(?:گزینه|فروشگاه|مقصد)(?: ی|ای)?\s*(?:دیگه|دیگر)|(?:یکی|یه|یک)\s+(?:نزدیک تر|نزدیکتر)|(?:این|همین).*نمی\s*خوا/.test(s))return 'alternative';
 if(/(?:انتخاب(?:ش)?|تصمیم(?:ش)?)\s*(?:را\s*|رو\s*)?(?:بگیر|کن)|خودت.*(?:برگزین|پیدا کن)|برنامه(?: ی|ٔ)?\s*(?:رفتن|مراجعه).*بچین|(?:مسیر.*(?:تعیین|آماده|مشخص)\s*کن)|(?:همین|دومی|اولی)\s+(?:خوبه|خوب است|را بردار|رو بردار)/.test(s))return 'delegate';
 return null;
}
export function visitGoal(text:string,fallback:DelegatedVisit['goal']='balanced'):DelegatedVisit['goal']{
 const s=clean(text);return /نزدیک|کوتاه ترین|سریع ترین|زودتر/.test(s)?'nearest':/ارزان|ارزون|کمترین قیمت/.test(s)?'cheapest':fallback;
}
export function phoneKind(text:string):DelegatedVisit['phoneKind']{
 const s=clean(text);return /فرقی نداره|فرقی ندارد|تفاوتی ندارد|هر نوع|هرکدام|هر کدوم/.test(s)?'any':/دکمه|گوشی ساده/.test(s)?'basic':/هوشمند|اندروید|android|ios|آیفون/i.test(s)?'smart':null;
}
export function broadPhone(topic:string){return /^(?:گوشی(?: موبایل)?|موبایل)$/.test(clean(topic));}

// Safety is a hard boundary. Distance or price never makes a closed shop valid.
// Compare only the bounded, source-backed candidates for which street routes exist.
export function selectVisit(offers:Offer[],checks:Record<string,ArrivalCheck>,routes:RoadRoute[],goal:DelegatedVisit['goal'],excluded:string[]=[]):Offer|null{
 const roads=new Map(routes.map(r=>[r.offer_id,r]));
 const rows=offers.filter(o=>!excluded.includes(o.shop_id)&&checks[o.offer_id]?.risk==='ready'&&checks[o.offer_id]?.basis==='street_route'&&roads.has(o.offer_id));
 const price=(a:Offer,b:Offer)=>a.price_toman===null?b.price_toman===null?0:1:b.price_toman===null?-1:BigInt(a.price_toman)<BigInt(b.price_toman)?-1:BigInt(a.price_toman)>BigInt(b.price_toman)?1:0;
 return rows.sort((a,b)=>{
  const ar=roads.get(a.offer_id)!,br=roads.get(b.offer_id)!;
  return (goal==='cheapest'?price(a,b):0)||(goal==='nearest'?ar.distance_meters-br.distance_meters:0)||ar.duration_seconds-br.duration_seconds||ar.distance_meters-br.distance_meters||price(a,b)||a.offer_id.localeCompare(b.offer_id);
 })[0]??null;
}
