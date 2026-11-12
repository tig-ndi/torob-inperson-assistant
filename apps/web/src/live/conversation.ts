import {digits,distance,fa,type VisitInsights} from './data.ts';
import {sellerPreferences as visitPreferences} from './sellerPreferences.ts';
import {purchaseTopics} from './requestPlanning.ts';
export {sellerPreferences as visitPreferences} from './sellerPreferences.ts';
export type ChatEntry = {id:string;role:'user'|'assistant';text:string;kind?:'message'|'action'};
export type VisitIntent = {topic:string;nearbyKm:number;localTime:string|null;visitDate?:string|null;reuseProduct?:boolean};
export function visitDate(text:string,now=new Date()):string|null|undefined{
  const input=text.replace(/\u200c/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک');
  if(/الان|همین حالا|ساعت فعلی/.test(input))return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
  const date=new Date(Date.UTC(part('year'),part('month')-1,part('day')));
  const relative=/پس\s*فردا/.test(input)?2:/فردا/.test(input)?1:/امروز/.test(input)?0:null;
  const days:Record<string,number>={'یکشنبه':0,'دوشنبه':1,'سه شنبه':2,'چهارشنبه':3,'پنجشنبه':4,'جمعه':5,'شنبه':6};
  const day=Object.keys(days).find(day=>new RegExp(`(?:^|\\s)${day}(?=$|\\s|[،.!؟])`).test(input));
  if(relative===null&&!day)return undefined;
  date.setUTCDate(date.getUTCDate()+(relative??((days[day!]!-date.getUTCDay()+7)%7)));
  return date.toISOString().slice(0,10);
}
export function visitClock(text:string):string|null {
  const input=text.replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\u200c/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک');
  const hourWords:Record<string,number>={'دوازده':12,'یازده':11,'ده':10,'نه':9,'هشت':8,'هفت':7,'شش':6,'پنج':5,'چهار':4,'سه':3,'دو':2,'یک':1};
  const hour='(?:دوازده|یازده|ده|نه|هشت|هفت|شش|پنج|چهار|سه|دو|یک|\\d{1,2})';
  const period='(?:بعد\\s*از\\s*ظهر|بعدازظهر|ظهر|شب|عصر|صبح)';
  const boundary='(?=$|[\\s،؛,.!؟])';
  const clock=input.match(new RegExp('(?:^|[\\s،؛])(?:ساعت\\s*)?(\\d{1,2})[:٫.](\\d{2})\\s*('+period+')?'+boundary));
  const natural=input.match(new RegExp('(?:^|\\s)(?:ساعت\\s*)?('+hour+')\\s*و\\s*(نیم|ربع|سی(?:\\s*دقیقه)?|پانزده(?:\\s*دقیقه)?)\\s*('+period+')?'+boundary));
  const plain=input.match(new RegExp('(?:^|\\s)ساعت\\s*('+hour+')\\s*('+period+')?'+boundary));
  const match=clock??natural??plain;
  if(!match)return null;
  let h=hourWords[match[1]!]??Number(match[1]);
  const m=clock?Number(match[2]):natural?(/ربع|پانزده/.test(match[2]!)?15:30):0;
  const p=(clock||natural)?match[3]:match[2];
  if(h>23||m>59||p&&h>12)return null;
  if(/شب|صبح/.test(p??'')&&h===12)h=0;
  else if(/شب|عصر|ظهر/.test(p??'')&&h<12)h+=12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
export function needsProductInterpretation(text:string):boolean{return /رنگ|سایز|دوربین|حافظه|ظرفیت|گارانتی|هوشمند|اندروید|سیستم.?عامل|سامسونگ|شیائومی|آیفون|اپل|نوکیا|هانوفر|دکمه|سالمند|پدر|مادر|باتری|باطری|سبک|درشت|بلند|مناسب|ضد|پیاده.?روی|تایپ.?سی|نوع.?سی|فردا|دیروز|هفته|شنبه|جمعه|[a-z]/i.test(digits(text).replace(/\u200c/g,''))||/(?:^|[\s،؛])رم(?=$|[\s،؛0-9۰-۹])/.test(text.replace(/\u200c/g,' '));}
export function visitIntent(text:string,context:string|null):VisitIntent|null {
  const input=digits(text).replace(/\u200c/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک');
  if(!/نزدیک|اطراف|حضوری|الان.*باز|فروشگاه.*باز|شب|کیلومتر|کجا.*بخر/.test(input))return null;
  if(/زنگ|تماس|قسطی|اعتباری|اقساط|تربپی/.test(input))return null;
  // Leave additional product/payment requirements to the bounded intent interpreter.
  if(needsProductInterpretation(text))return null;
  if(/تومان|تومن|میلیون|میلیارد|بودجه/.test(input)&&!visitPreferences(text).max)return null;
  if(purchaseTopics(text).length>1||/نمی.?خوا(?:هم|م)|نمی.?خوام/.test(text))return null;
  const topics=['قاب گوشی','کاور گوشی','کیف گوشی','شارژر موبایل','شارژر گوشی','شارژر','کابل شارژ','هدفون','گوشی','موبایل','کفش','لپ تاپ','لپ‌تاپ','باتری','پاوربانک'];
  const explicit=topics.find(t=>input.includes(digits(t)));
  if(explicit==='شارژر')return null; // Ask for the device instead of mixing medical/laptop adapters.
  const topic=explicit==='شارژر گوشی'?'شارژر موبایل':explicit??context;
  if(!topic)return null;
  const localTime=visitClock(text);
  if(!localTime&&/ساعت/.test(input))return null;
  const radius=input.match(/(?:زیر|تا|شعاع|فاصله|محدوده)?(\d+(?:\.\d+)?)کیلومتر/);
  const words:Record<string,number>={'یک':1,'دو':2,'سه':3,'چهار':4,'پنج':5,'شش':6,'هفت':7,'هشت':8,'نه':9,'ده':10};
  const word=Object.keys(words).find(w=>input.includes(w+'کیلومتر'));
  const nearbyKm=radius?Math.max(0.1,Math.min(50,Number(radius[1]))):word?words[word]!:2;
  return {topic,nearbyKm,localTime,visitDate:visitDate(text),reuseProduct:!explicit&&!!context};
}

export function visitGuidance(v:VisitInsights,_label:string,limit:number|null=null){
  const n=v.nearby,time=new Intl.DateTimeFormat('fa-IR',{weekday:'long',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(new Date(v.evaluated_at));
  const near=n.declared_open?`${fa(n.declared_open)} فروشگاه در شعاع ${fa(v.nearby_km)} کیلومتری، طبق برنامه بازند.`:n.shops&&n.declared_closed===n.shops&&!n.truncated?'تمام فروشگاه‌های ثبت‌شدهٔ نزدیک، طبق برنامه بسته‌اند.':`در محدودهٔ نزدیک، فروشگاهِ باز طبق برنامه پیدا نشد؛ ساعت ${fa(n.unknown)} فروشگاه هم نامشخص است.`;
  if(limit!==null)return `برای ساعت ${time}: ${near} سقف زمان رفتن تو ${fa(limit)} دقیقه است؛ بازبودن به‌تنهایی کافی نیست. فقط مقصدی را پیشنهاد می‌کنم که برآورد رسیدن آن هم در این زمان باشد.`;
  const open=v.open_offers.items[0];

  const market=v.markets[0];return `برای ساعت ${time}: ${near} ${open?`گزینهٔ باز «${open.shop.name??'فروشگاه ثبت‌شده'}» در فاصلهٔ ${distance(open.direct_distance_meters)} است.`:`تا شعاع ${fa(v.search_km)} کیلومتر، پیشنهاد باز و منطبق با شرایط پیدا نشد.`}${market?` «${market.name}» هم یک محدودهٔ احتمالی با موجودی و ساعت نامشخص است.`:''} کارت تصمیم و گزینه‌های بعدی را پایین گذاشتم.`;

}
