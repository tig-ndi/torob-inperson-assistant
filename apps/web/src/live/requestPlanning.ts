import {sellerPreferences} from './sellerPreferences.ts';
// Longest phrase wins within a family, but never hides a different purchase.
const families=[['قاب برای گوشی','کاور برای گوشی','قاب گوشی','کاور گوشی','قاب','کاور'],['کیف گوشی','کیف برای گوشی','کیف'],['شارژر برای گوشی','شارژر برای موبایل','شارژر برای لپ تاپ','شارژر لپ تاپ','شارژر موبایل','شارژر گوشی','شارژر'],['کابل برای گوشی','کابل شارژ','کابل'],['هدفون','هندزفری'],['گوشی دکمه ای','گوشی','موبایل'],['کفش','کتانی'],['لپ تاپ'],['باتری','باطری'],['پاوربانک']];
const normalized=(text:string)=>text.replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
export function selectedProductIndex(text:string,count:number):number|null{
  const value=normalized(text).replace(/[.؟!،]+$/,'');
  const match=/^(?:(?:همین|همون|همان|اون|آن|این)\s+)?(?:گزینه\s+)?(اولی|اول|دومی|دوم|سومی|سوم)(?:\s+(?:را|رو))?\s+(?:می\s*(?:خواهم|خوام)|انتخاب\s*کن|خوبه|خوب\s*است|بردار|فروشگاه(?:\s*ها)?(?:ش|یش)?\s*(?:را|رو)?\s*(?:ببینیم|نشان\s*بده|نشون\s*بده))$/.exec(value);
  if(!match)return null;
  const index=/^اول/.test(match[1]!)?0:/^دوم/.test(match[1]!)?1:2;
  return index<count?index:null;
}
export function purchaseTopics(text:string):string[]{
  if(/^(?:اگر|اگه)(?:\s|$)/.test(normalized(text)))return [];
  const positive=normalized(text).replace(/(?:به\s*جای|بجای)\s+.+?(?=\s+(?:یک|یه)\s+)/g,'').replace(/(?:به\s*جای|بجای)\s+\S+\s+/g,'');
  const priority=/(?:اول|فعلا|فعلاً)\s+فقط\s+(?:یک\s+|یه\s+)?(.+?)(?=[؛;،]|$)/.exec(positive);
  const active=priority&&/برای بعد|بعدا|بعداً/.test(positive)?priority[1]!:positive;
  const clauses=active.split(/[؛;،,!؟\n]|(?:^|\s)(?:اما|ولی)(?:\s|$)/);
  let rest=clauses.map(clause=>{
    if(/^\s*نه\s+(?:خود\s+)?(?:گوشی|موبایل|شارژر|کابل|هدفون|پاوربانک|کفش|لپ\s*تاپ)(?:\s|$)/.test(clause))return '';
    const refused=/نمی\s*(?:خواهم|خوام)/.exec(clause);
    if(!refused)return clause;
    const before=clause.slice(0,refused.index);
    const fieldRefusal=/(?:گارانتی|سایز|رنگ|حافظه|رم|باتری|دوربین)(?:\s+\S+){0,3}\s*$/.test(before);
    const earlierPurchase=/(?<!ن)می\s*(?:خواهم|خوام)/.test(before);
    return !fieldRefusal&&!earlierPurchase?clause.slice(refused.index+refused[0].length):clause;
  }).join(' ؛ ');
  // A shared «برای گوشی» belongs to the coordinated accessories, not the queue.
  if(/شارژر|کابل|قاب|کاور|کیف/.test(rest))
    rest=rest.replace(/(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|لپ تاپ)/g,'');
  const found:string[]=[];
  // Qualitative battery clauses describe the phone; explicit «و باتری» stays a purchase.
  if(/گوشی|موبایل|لپ تاپ/.test(rest))
    rest=rest.replace(/(?:باتری|باطری)\s+(?:هم\s+)?(?:خوب|قوی|مناسب|بادوام)(?:\s|$)/g,'')
      .replace(/(?:با|ظرفیت|دوام|شارژدهی|حداقل)[^؛،]{0,25}(?:باتری|باطری)|(?:باتری|باطری)[^؛،]{0,15}(?:میلی آمپر|mah)/gi,'');
  const phrases=families.flatMap((names,family)=>names.map(name=>({name,family}))).sort((a,b)=>b.name.length-a.name.length);
  const seen=new Set<number>();
  for(const {name,family} of phrases){
    const pattern=new RegExp(`(^|[\\s،؛])(${name})(?=$|[\\s،؛؟])`,'g');
    if(!pattern.test(rest))continue;
    pattern.lastIndex=0;
    rest=rest.replace(pattern,(_match,before)=>`${before} `);
    if(!seen.has(family)){seen.add(family);const topic=name.replace(' برای ',' ');found.push(topic==='شارژر گوشی'?'شارژر موبایل':topic==='موبایل'?'گوشی':topic);}
  }
  return found;
}

export function accessoryDeviceReply(text:string,topic:string|null):boolean{
  return /^(?:شارژر|کابل|قاب|کاور|کیف|محافظ|باتری)/.test(normalized(topic??''))&&
    /^(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|دستگاه|مدل|سامسونگ|ردمی|آیفون|لپ\s*تاپ)/.test(normalized(text))&&
    !/خود\s+(?:گوشی|لپ\s*تاپ).*(?<![\wن])می\s*خوا|به\s*جای|عوض/.test(normalized(text));
}

export function shortPurchaseTopic(text:string):string|null{
  const value=normalized(text);
  if(value&&value.length<=120&&value.split(/\s+/).length<=12&&!/[؛;،!?؟]|می\s*خوا|انتخاب|موقعیت/.test(value))return value;
  return purchaseTopics(value)[0]??null;
}

export function exclusivePurchase(text:string){return /(?:^|[؛،\s])فقط\s+(?:یه\s+|یک\s+)?(?:شارژر|کابل|قاب|کاور|کیف|گوشی|موبایل|کفش|کتانی|هدفون|لپ\s*تاپ)(?:\s|$)/.test(normalized(text))&&purchaseTopics(text).length===1&&!/برای بعد|بعدا|بعداً/.test(text);}

export function conversationHistory<T extends {role:'user'|'assistant';content:string}>(previous:T[],fresh:T,visibleAnswer:string|undefined):T[]{
  const history=[...previous.slice(-4)];
  if(history.at(-1)?.role==='user')history.push({role:'assistant',content:(visibleAnswer??'نیاز ذخیره‌شده برای ادامهٔ بررسی خرید محفوظ است.').slice(0,1000)} as T);
  history.push(fresh);
  while(history[0]?.role==='assistant')history.shift();
  while(history.reduce((n,m)=>n+m.content.length,0)>3000&&history.length>1)history.splice(0,2);
  return history;
}

export function recommendedFirst<T extends {product_id:string}>(items:T[],id:string|null|undefined):T[]{
  const candidate=items.find(p=>p.product_id===id);
  return candidate?[candidate,...items.filter(p=>p.product_id!==id)]:items;
}

export function productReferenceIndex(text:string,count:number):number|null{
 const value=normalized(text);
 const match=/^(?:(?:همین|همون|همان|اون|آن|این)\s+)?(اولی|دومی|سومی)(?=\s|$)/.exec(value);
 if(!match||!/رنگ|سایز|سفید|مشکی|آبی|قرمز|سبز|طوسی|صورتی/.test(value)||/نمی\s*خوا|نباش|نه\b/.test(value))return null;
 const index=match[1]==='اولی'?0:match[1]==='دومی'?1:2;return index<count?index:null;
}

export function samePurchaseFamily(a:string,b:string){
 const family=(s:string)=>families.findIndex(names=>names.some(n=>n===normalized(s)||n.replace(" برای "," ")===normalized(s)));
 const index=family(a);return index>=0&&index===family(b);
}


// The offline fallback accepts only an unambiguous item plus a validated budget.
// Unknown attributes stay a clarification, rather than silently becoming filters.
export function directPurchaseQuery(text:string):string|null{
 const topics=purchaseTopics(text);if(topics.length!==1)return null;
 if(/بودجه|حداکثر|(?:^|\s)(?:تا|زیر)(?:\s|$)/.test(normalized(text))&&!sellerPreferences(text).max)return null;
 let rest=normalized(text).replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
 rest=rest.replace(/(?:زیر|حداکثر|تا|بودجه(?: ام)?)\s+(?:(?:[0-9٬,.]+|صفر|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد|هزار|میلیون|میلیارد|و)(?:\s+|(?=[؛;،.!؟]|$)))+(?:(?:تومان|تومن)\s*)?/g,' ')
  .replace(/(?:می\s*(?:خواهم|خوام)|لازم دارم|نیاز دارم|لطفا|لطفاً|یک|یه|را|رو)(?=$|[\s؛;،.!؟])/g,' ')
  .replace(/[؛;،.!؟]/g,' ').replace(/\s+/g,' ').trim();
 const topic=topics[0]!;return samePurchaseFamily(rest,topic)?topic:null;
}

// A queue item inherits device/connector context, never the other item nouns.
export function queuedPurchase(original:string,chosen:string,budget:string):string{
 const source=normalized(original);
 const device=/(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|لپ تاپ).*?(?=\s+(?:تا|بودجه)|[؛،.]|$)/.exec(source)?.[0]??'';
 const port=/(?:تایپ\s*سی|usb[ -]?c|میکرو\s*usb|لایتنینگ)/i.exec(source)?.[0]??'';
 return `${chosen} ${port} ${device} تا ${budget} تومان می‌خواهم`.replace(/\s+/g,' ').trim();
}
export function restoredNeedSummary(need:{topic_query:string|null;max_price_toman:string|null;source_filters?:{colour:string|null;size:string|null;connector:string|null};battery_requirement:{minimum_mah:number|null};pending_requirements:{source_text:string}[]}):string{
 const f=need.source_filters??{colour:null,size:null,connector:null};
 return [need.topic_query,need.max_price_toman?`سقف بودجه ${need.max_price_toman} تومان`:null,f.colour?`رنگ ${f.colour}`:null,f.size?`سایز ${f.size}`:null,f.connector?`درگاه ${f.connector}`:null,need.battery_requirement.minimum_mah?`حداقل باتری ${need.battery_requirement.minimum_mah} میلی‌آمپرساعت`:null,...need.pending_requirements.map(p=>`شرط هنوز بررسی‌نشده: ${p.source_text}`)].filter(Boolean).join('؛ ');
}

export function rankingNeedContext(need:{preferences?:string[];review_topics:string[];category_cleared?:boolean}):string{
 if(need.category_cleared)return '';
 const labels:Record<string,string>={coding:'برنامه نویسی',lightweight:'سبک',walking:'پیاده روی',anc:'حذف نویز فعال',energy:'کم مصرف',family:'خانواده',camera:'دوربین',battery:'باتری'};
 return [...(need.preferences??[]),...need.review_topics].map(key=>labels[key]??'').join(' ');
}
