import type {Product,Offer} from './data.ts';
import type {ArrivalCheck} from './journey.ts';
import type {RoadRoute} from './upgrades.ts';
import {choiceReason} from './journey.ts';
import {distance,fa} from './data.ts';
import {chargerFacts} from './chargerFacts.ts';

type Context={product:Product|null;recommended:Product|null;products:Product[];selected:Offer|null;offers:Offer[];checks:Record<string,ArrivalCheck>;routes:RoadRoute[];note:string};
export function purchaseQuestion(text:string):'reason'|'compatibility'|null{
 const s=text.replace(/\u200c/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک');
 if(/به جای|عوض کن|جدید.*می\s*خوا|دیگه.*می\s*خوا/.test(s))return null;
 if(/(?:چرا|دلیل).*(?:انتخاب|پیشنهاد|همین|این فروشگاه)/.test(s))return 'reason';
 if(/(?:این|همین|همون|اولی|دومی|سومی).*(?:می\s*خوره|سازگار|مناسب.*هست)|(?:سازگاری|سازگار بودن).*(?:این|همین|مدل)/.test(s))return 'compatibility';
 return null;
}
export function answerPurchaseQuestion(text:string,c:Context):string|null{
 const kind=purchaseQuestion(text);if(!kind)return null;
 const index=/دومی/.test(text)?1:/سومی/.test(text)?2:/اولی/.test(text)?0:null;
 const p=index===null?c.product??c.recommended??c.products[0]:c.products[index];
 if(!p&&!c.selected)return null;
 if(kind==='reason'&&c.selected){
  const o=c.selected,route=c.routes.find(r=>r.offer_id===o.offer_id);
  return `«${o.shop.name}» را برای همین خرید انتخاب کردم. ${c.note||choiceReason(o,c.checks,c.offers)}${route?` مسیر ${distance(route.distance_meters)} و حدود ${fa(Math.ceil(route.duration_seconds/60))} دقیقه است؛ بدون ترافیک زنده.`:''} موجودی و پذیرش فروشگاه هنوز تأیید نشده‌اند. انتخاب و نقشه محفوظ‌اند.`;
 }
 if(!p)return 'برای بررسی سازگاری، مدل کالای همین انتخاب را مشخص کن؛ مقصد و شرایط خریدت محفوظ‌اند.';
 if(kind==='reason')return `پیشنهاد فعلی «${p.persian_title}» است. این گزینه در داده‌های منبع با شرایط جست‌وجویت پیدا شده؛ موجودی و تناسب نهایی هنوز تأیید نشده‌اند. برای مقایسهٔ دقیق‌تر، مشخصات و فروشگاه‌های همین کارت را بررسی کنیم؛ انتخاب فعلی محفوظ است.`;
 const charger=chargerFacts(p);
 const specs=p.specs.filter(s=>s.value&&(/درگاه|رابط|توان|پروتکل|فناوری شارژ|سازگار|مناسب برای/.test(s.key??''))&&!/ورودی|تعداد/.test(s.key??'')).slice(0,3);
 const protocol=p.specs.find(s=>/PD|PPS|QC|Quick Charge|Power Delivery|شارژ سریع/i.test(s.value??''));
 const facts=charger?[
  charger.connector.value?`درگاه خروجی: ${charger.connector.value}`:'درگاه خروجی نیاز به بررسی دارد',
  charger.power.value?`توان: ${fa(charger.power.value)} (${charger.power.note})`:charger.power.note,
  protocol?`${protocol.key}: ${protocol.value}`:'پروتکل سازگار با دستگاه در این اطلاعات تأیید نشده',
 ].join('؛ '):specs.map(s=>`${s.key}: ${s.value}`).join('؛ ');
 return `اگر منظورت «${p.persian_title}» است، ${facts?`در منبع ثبت شده: ${facts}.`:'شاهد کافی دربارهٔ سازگاری این مدل ثبت نشده است.'} یکسان بودن درگاه به‌تنهایی سازگاری قطعی را ثابت نمی‌کند؛ توان، پروتکل و مدل دستگاه باید تطبیق داده شوند. این سازگاری را بدون شاهد تأیید نمی‌کنم. محصول و شرایط خریدت محفوظ‌اند.`;
}
