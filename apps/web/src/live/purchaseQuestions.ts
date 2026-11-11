import type {Product,Offer} from './data.ts';
import type {ArrivalCheck} from './journey.ts';
import type {RoadRoute} from './upgrades.ts';
import {choiceReason} from './journey.ts';
import {distance,fa} from './data.ts';
import {chargerFacts} from './chargerFacts.ts';

type Context={product:Product|null;recommended:Product|null;products:Product[];selected:Offer|null;offers:Offer[];checks:Record<string,ArrivalCheck>;routes:RoadRoute[];note:string};
export function purchaseQuestion(text:string):'reason'|'compatibility'|'reservation'|'price'|null{
 const s=text.replace(/\u200c/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک');
 if(/به جای|عوض کن|جدید.*می\s*خوا|دیگه.*می\s*خوا/.test(s))return null;
 if(/رزرو|زنگ بزن|تماس واقعی/.test(s)&&/قطعی|واقعی|شد|بزن|انجام/.test(s))return 'reservation';
 if(/قیمت ثبت.*قیمت پاسخ|قیمت پاسخ.*قیمت ثبت/.test(s))return 'price';
 if(/(?:چرا|دلیل).*(?:انتخاب|پیشنهاد|همین|این فروشگاه)/.test(s))return 'reason';
 if(/(?:این|همین|همون|اولی|دومی|سومی).*(?:می\s*خوره|سازگار|مناسب.*هست)|(?:سازگاری|سازگار بودن).*(?:این|همین|مدل)/.test(s))return 'compatibility';
 return null;
}
export function answerPurchaseQuestion(text:string,c:Context):string|null{
 const kind=purchaseQuestion(text);if(!kind)return null;
 if(kind==='reservation')return 'نه؛ رزرو قطعی یا تماس واقعی انجام نشده است. پاسخ و رزروِ نمایش آزمایشی، بدون ارتباط واقعی با فروشنده‌اند. انتخاب و شرایط خریدت محفوظ است.';
 if(kind==='price')return 'نه؛ قیمت ثبت‌شده از دادهٔ منبع است. قیمت پاسخ فروشنده مربوط به نتیجهٔ بررسی فروشنده است و ممکن است فرق کند؛ اگر پاسخ آزمایشی باشد، قیمت آن هم تأیید واقعی نیست. موجودی نیز جداگانه نیاز به بررسی دارد. شرایط خریدت محفوظ است.';
 const index=/دومی/.test(text)?1:/سومی/.test(text)?2:/اولی/.test(text)?0:null;
 const p=index===null?c.product??c.recommended??c.products[0]:c.products[index];
 if(!p&&!c.selected)return null;
 if(kind==='reason'&&c.selected){
  const o=c.selected,route=c.routes.find(r=>r.offer_id===o.offer_id);
  return `«${o.shop.name}» را برای همین خرید انتخاب کردم. ${c.note||choiceReason(o,c.checks,c.offers)}${route?` مسیر ${distance(route.distance_meters)} و حدود ${fa(Math.ceil(route.duration_seconds/60))} دقیقه است؛ بدون ترافیک زنده.`:''} موجودی و پذیرش فروشگاه هنوز تأیید نشده‌اند. انتخاب و نقشه محفوظ‌اند.`;
 }
 if(!p)return 'برای بررسی سازگاری، مدل کالای همین انتخاب را مشخص کن؛ مقصد و شرایط خریدت محفوظ‌اند.';
 if(kind==='reason'){
  const relevant=/دوربین|رزولوشن|ظرفیت باتری|حذف نویز|کاربری|کاربرد|وزن|حافظه رم|درگاه|رابط|سایز|رنگ/;
  const facts=p.specs.filter(s=>s.key&&s.value&&relevant.test(s.key)&&!/نامشخص|ثبت نشده/.test(s.value)&&!p.specs.some(other=>other.key===s.key&&other.value!==s.value)).slice(0,5);
  const alternatives=c.products.filter(other=>other.product_id!==p.product_id).slice(0,2);
  const witness=facts.map(s=>`${s.key}: ${s.value}`).join('؛ ');
  const comparisons=alternatives.map(other=>{
   const common=other.specs.filter(s=>facts.some(f=>f.key===s.key)&&s.value).slice(0,2);
   return common.length?`«${other.persian_title}»: ${common.map(s=>`${s.key}: ${s.value}`).join('؛ ')}`:'';
  }).filter(Boolean).join(' / ');
  return `پیشنهاد فعلی «${p.persian_title}» است. ${witness?`شاهد ثبت‌شده: ${witness}.`:'شاهد کافی برای برتری این مدل در مشخصات ثبت نشده؛ آن را انتخاب قطعی معرفی نمی‌کنم.'} ${comparisons?`برای مقایسه با گزینه‌های همین نتیجه: ${comparisons}.`:''} این اعداد کیفیت واقعی، سازگاری یا موجودی را ثابت نمی‌کنند؛ تعداد مگاپیکسل هم به‌تنهایی معیار کیفیت عکس نیست. قیمت و فاصله می‌توانند با گزینه‌های دیگر فرق کنند؛ اگر شاهد خواسته‌ات کافی نیست، شرط یا مدل را دوباره بررسی کنیم.`;
 }
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
