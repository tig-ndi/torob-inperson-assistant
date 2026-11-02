import {digits,distance,fa,type VisitInsights} from './data.ts';
import {sellerPreferences as visitPreferences} from './sellerPreferences.ts';
import {purchaseTopics} from './requestPlanning.ts';
export {sellerPreferences as visitPreferences} from './sellerPreferences.ts';
export type ChatEntry = {id:string;role:'user'|'assistant';text:string;kind?:'message'|'action'};
export type VisitIntent = {topic:string;nearbyKm:number;localTime:string|null;reuseProduct?:boolean};
export function visitClock(text:string):string|null {
  const input=digits(text).replace(/\u200c/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک');
  let localTime:string|null=null;
  const clock=input.match(/(?:ساعت)?(\d{1,2})[:٫.](\d{2})/);
  const hourWords:Record<string,number>={'دوازده':12,'یازده':11,'ده':10,'نه':9,'هشت':8,'هفت':7,'شش':6,'پنج':5,'چهار':4,'سه':3,'دو':2,'یک':1};
  const natural=input.replace(/\u200c/g,'').match(/(?:ساعت)?(دوازده|یازده|ده|نه|هشت|هفت|شش|پنج|چهار|سه|دو|یک|\d{1,2})(ونیم|وربع|وسی(?:دقیقه)?|وپانزده(?:دقیقه)?)(?:شب|عصر|صبح)?/);
  if(clock||natural){let hour=clock?Number(clock[1]):Number.isNaN(Number(natural![1]))?hourWords[natural![1]!]!:Number(natural![1]);const minute=clock?Number(clock[2]):/ربع|پانزده/.test(natural![2]!)?15:30;if(/شب/.test(input)&&hour===12)hour=0;else if(/شب|عصر/.test(input)&&hour<12)hour+=12;if(hour<24&&minute<60)localTime=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;}
  return localTime;
}
export function visitIntent(text:string,context:string|null):VisitIntent|null {
  const input=digits(text).replace(/\u200c/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک');
  if(!/نزدیک|اطراف|حضوری|الان.*باز|فروشگاه.*باز|شب|کیلومتر|کجا.*بخر/.test(input))return null;
  // Leave additional product/payment requirements to the bounded intent interpreter.
  if(/رنگ|سایز|دوربین|حافظه|گارانتی|سامسونگ|شیائومی|آیفون|اپل|نوکیا|هانوفر|دکمه|سالمند|پدر|مادر|باتری|باطری|سبک|درشت|بلند|مناسب|ضد|پیاده.?روی|تایپ.?سی|نوع.?سی|فردا|دیروز|هفته|شنبه|جمعه|[a-z]/i.test(input))return null;
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
  return {topic,nearbyKm,localTime,reuseProduct:!explicit&&!!context};
}

export function visitGuidance(v:VisitInsights,_label:string){
  const n=v.nearby,time=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(new Date(v.evaluated_at));
  const near=n.declared_open?`${fa(n.declared_open)} فروشگاه در شعاع ${fa(v.nearby_km)} کیلومتری، طبق برنامه بازند.`:n.shops&&n.declared_closed===n.shops&&!n.truncated?'تمام فروشگاه‌های ثبت‌شدهٔ نزدیک، طبق برنامه بسته‌اند.':`در محدودهٔ نزدیک، فروشگاهِ باز طبق برنامه پیدا نشد؛ ساعت ${fa(n.unknown)} فروشگاه هم نامشخص است.`;
  const open=v.open_offers.items[0];

  const market=v.markets[0];return `برای ساعت ${time}: ${near} ${open?`گزینهٔ باز «${open.shop.name??'فروشگاه ثبت‌شده'}» در فاصلهٔ ${distance(open.direct_distance_meters)} است.`:`تا شعاع ${fa(v.search_km)} کیلومتر، پیشنهاد باز و منطبق با شرایط پیدا نشد.`}${market?` «${market.name}» هم یک محدودهٔ احتمالی با موجودی و ساعت نامشخص است.`:''} کارت تصمیم و گزینه‌های بعدی را پایین گذاشتم.`;

}
