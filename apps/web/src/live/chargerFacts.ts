import {comparisonValue} from './comparisonValues.ts';

type Source={category_name?:string|null;persian_title:string|null;specs:{key:string|null;value:string|null}[]};
export type ChargerFact={value:string|null;note:string;conflicting:boolean};
const missing=():ChargerFact=>({value:null,note:'شاهد صریحی در منبع ثبت نشده',conflicting:false});
export function chargerFacts(p:Source):{power:ChargerFact;connector:ChargerFact}|null{
 if(!/شارژر/.test(p.category_name??p.persian_title??''))return null;
 const watt=(s:string)=>[...comparisonValue(s).matchAll(/(\d+(?:\.\d+)?)\s*(?:وات|\bw\b)/g)].map(m=>m[1]!);
 const direct=p.specs.filter(s=>/^(?:حداکثر )?توان(?: خروجی)?$/.test((s.key??'').trim()));
 const title=[p.persian_title??'',...p.specs.filter(s=>/^(?:نام و مدل|نام محصول)$/.test(s.key??'')).map(s=>s.value??'')];
 const watts=[...new Set([...direct.flatMap(s=>watt(s.value??'')),...title.flatMap(watt)])];
 const power:ChargerFact=watts.length>1?{value:null,note:'توان‌های متفاوت در عنوان یا مشخصات ثبت شده؛ پیش از خرید بررسی شود',conflicting:true}:watts.length===1?{value:`${watts[0]} وات`,note:direct.some(s=>watt(s.value??'').length)?'طبق فیلد توان در مشخصات منبع':'توان ذکرشده در عنوان/نام‌ومدل؛ حداکثر توان و سازگاری تأیید نشده',conflicting:false}:missing();
 const rows=p.specs.filter(s=>/درگاه خروجی|رابط خروجی|کانکتور خروجی/.test(s.key??''));
 const ports=[...new Set(rows.flatMap(s=>{
  const value=comparisonValue(s.value??'');
  if(/ندارد|نامشخص|ثبت نشده/.test(value))return [];
  return [...(/(?:usb\s*[- ]*)?(?:type\s*[- ]*c|تایپ\s*سی)|usb\s*[- ]*c/.test(value)?['USB Type-C']:[]),...(/micro\s*[- ]*usb|میکرو/.test(value)?['Micro USB']:[]),...(/lightning|لایتنینگ/.test(value)?['Lightning']:[])];
 }))];
 const connector:ChargerFact=ports.length?{value:ports.join(' / '),note:'طبق فیلد خروجی منبع؛ نوع کابل همراه به‌تنهایی خروجی شارژر را ثابت نمی‌کند',conflicting:false}:missing();
 return {power,connector};
}
