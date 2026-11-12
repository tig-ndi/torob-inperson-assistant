import type {Offer} from './data.ts';
import type {ArrivalCheck} from './journey.ts';
import type {RoadRoute} from './upgrades.ts';
import {wordToman} from './sellerPreferences.ts';

export type DelegatedVisit={id:string;goal:'nearest'|'fastest'|'balanced'|'cheapest';status:'pending'|'planned'|'blocked';request:string;phoneKind:'ask'|'smart'|'basic'|'any'|null;excluded:string[];offerId:string|null;note:string};
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
 const s=clean(text);return /سریع\s*ترین|زودتر|کمترین زمان/.test(s)?'fastest':/نزدیک|کوتاه\s*ترین|کمترین مسافت/.test(s)?'nearest':/ارزان|ارزون|کمترین قیمت/.test(s)?'cheapest':fallback;
}
export function phoneKind(text:string):DelegatedVisit['phoneKind']{
 const s=clean(text);return /فرقی نداره|فرقی ندارد|تفاوتی ندارد|هر نوع|هرکدام|هر کدوم/.test(s)?'any':/دکمه|گوشی ساده/.test(s)?'basic':/هوشمند|اندروید|android|ios|آیفون/i.test(s)?'smart':null;
}
export function broadPhone(topic:string){return /^(?:گوشی(?: موبایل)?|موبایل)$/.test(clean(topic));}

// Safety is a hard boundary. Distance or price never makes a closed shop valid.
// Compare only the bounded, source-backed candidates for which street routes exist.
export function selectVisit(offers:Offer[],checks:Record<string,ArrivalCheck>,routes:RoadRoute[],goal:DelegatedVisit['goal'],excluded:string[]=[],limit:number|null=null):Offer|null{
 const roads=new Map(routes.map(r=>[r.offer_id,r]));
 const rows=offers.filter(o=>withinTravelLimit(o,checks,limit)&&!excluded.includes(o.shop_id)&&checks[o.offer_id]?.risk==='ready'&&checks[o.offer_id]?.basis==='street_route'&&roads.has(o.offer_id));
 const price=(a:Offer,b:Offer)=>a.price_toman===null?b.price_toman===null?0:1:b.price_toman===null?-1:BigInt(a.price_toman)<BigInt(b.price_toman)?-1:BigInt(a.price_toman)>BigInt(b.price_toman)?1:0;
 return rows.sort((a,b)=>{
  const ar=roads.get(a.offer_id)!,br=roads.get(b.offer_id)!;
  return (goal==='cheapest'?price(a,b):0)||(goal==='nearest'?ar.distance_meters-br.distance_meters:0)||ar.duration_seconds-br.duration_seconds||ar.distance_meters-br.distance_meters||price(a,b)||a.offer_id.localeCompare(b.offer_id);
 })[0]??null;
}

export function travelLimit(text:string):number|null|undefined{
 const s=clean(text).replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
 if(/محدودیت زمان.*(?:ندارم|مهم نیست|حذف)|وقت رفتن.*مهم نیست/.test(s))return null;
 const word='(?:صفر|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد)';
 const amount=`(?:\\d+|${word}(?:\\s+و\\s+${word})*|نیم)`;
 const values:number[]=[];
 const numeric=(value:string)=>value==='نیم'?0.5:/^\d+$/.test(value)?Number(value):Number(wordToman(value)??NaN);
 for(const m of s.matchAll(new RegExp(`(^|[\\s؛،])(${amount})\\s*(دقیقه|ساعت)(?:\\s+و\\s+(نیم|${amount}\\s*دقیقه))?(?=$|[\\s؛،.!؟])`,'g'))){
  const before=s.slice(0,m.index!+m[1]!.length),after=s.slice(m.index!+m[0].length);
  if(!/(?:فقط|حداکثر(?: تا)?)\s*$/.test(before)&&!/^\s+بیشتر\s+(?:برای\s+(?:رفتن|رسیدن)\s+)?(?:وقت|فرصت)\s+ندارم/.test(after))continue;
  const n=numeric(m[2]!);
  values.push(n*(m[3]==='ساعت'?60:1)+(m[4]?m[4]==='نیم'?(m[3]==='ساعت'?30:0.5):numeric(m[4].replace(/\s*دقیقه$/,'')):0));
 }
 const n=values[0];return n!==undefined&&Number.isInteger(n)&&n>0&&n<=999&&values.every(v=>v===n)?n:undefined;
}
export function hasTravelDeadline(text:string):boolean{
 const s=clean(text);return /(?:دقیقه|ساعت)/.test(s)&&(/(?:فقط|حداکثر).*?(?:وقت|فرصت|رفتن|رسیدن)/.test(s)||/(?:وقت|فرصت)\s+ندارم/.test(s));
}
export function withinTravelLimit(offer:Offer,checks:Record<string,ArrivalCheck>,limit:number|null):boolean{
 if(limit===null)return true;
 const check=checks[offer.offer_id];return check?.minutes_max!=null&&check.minutes_max<=limit;
}
