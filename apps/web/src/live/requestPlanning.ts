// Longest phrase wins within a family, but never hides a different purchase.
const families=[['قاب برای گوشی','کاور برای گوشی','قاب گوشی','کاور گوشی'],['کیف گوشی','کیف برای گوشی'],['شارژر برای گوشی','شارژر برای موبایل','شارژر برای لپ تاپ','شارژر لپ تاپ','شارژر موبایل','شارژر گوشی','شارژر'],['کابل برای گوشی','کابل شارژ','کابل'],['هدفون','هندزفری'],['گوشی دکمه ای','گوشی','موبایل'],['کفش','کتانی'],['لپ تاپ'],['باتری','باطری'],['پاوربانک']];
const normalized=(text:string)=>text.replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
export function selectedProductIndex(text:string,count:number):number|null{
  const value=normalized(text).replace(/[.؟!،]+$/,'');
  const match=/^(?:(?:همین|همون|همان|اون|آن|این)\s+)?(?:گزینه\s+)?(اولی|اول|دومی|دوم|سومی|سوم)(?:\s+(?:را|رو))?\s+(?:می\s*(?:خواهم|خوام)|انتخاب\s*کن|خوبه|خوب\s*است|بردار|فروشگاه(?:\s*ها)?(?:ش|یش)?\s*(?:را|رو)?\s*(?:ببینیم|نشان\s*بده|نشون\s*بده))$/.exec(value);
  if(!match)return null;
  const index=/^اول/.test(match[1]!)?0:/^دوم/.test(match[1]!)?1:2;
  return index<count?index:null;
}
export function purchaseTopics(text:string):string[]{
  const clauses=normalized(text).split(/[؛;،,!؟\n]|(?:^|\s)(?:اما|ولی)(?:\s|$)/);
  let rest=clauses.map(clause=>{
    const refused=/نمی\s*(?:خواهم|خوام)/.exec(clause);
    if(!refused)return clause;
    const before=clause.slice(0,refused.index);
    const fieldRefusal=/(?:گارانتی|سایز|رنگ|حافظه|رم|باتری|دوربین)(?:\s+\S+){0,3}\s*$/.test(before);
    const earlierPurchase=/(?<!ن)می\s*(?:خواهم|خوام)/.test(before);
    return !fieldRefusal&&!earlierPurchase?clause.slice(refused.index+refused[0].length):clause;
  }).join(' ؛ ');
  // Attributes between the accessory and «برای» still describe one purchase.
  // Keep coordinated nouns intact: «گوشی و شارژر» remains two purchases.
  rest=rest.replace(/(شارژر|کابل|قاب|کاور|کیف)([^؛،]{0,60}?)\s+(?:برای|واسه|مخصوص)\s+(گوشی|موبایل|لپ تاپ)/g,(full,head,middle,device)=>
    /(?:^|\s)و(?:\s|$)|می\s*خوا|شارژر|کابل|قاب|کاور|کیف/.test(middle)?full:`${head} برای ${device}`);
  const found:string[]=[];
  // Battery/camera specifications of a phone are not additional purchases.
  // Keep the actual coordinated request "گوشی و باتری" recognizable.
  if(/گوشی|موبایل|لپ تاپ/.test(rest)&&/(?:با|ظرفیت|دوام|شارژدهی|حداقل)[^؛،]{0,25}(?:باتری|باطری)|(?:باتری|باطری)[^؛،]{0,15}(?:میلی آمپر|mah)/i.test(rest))
    rest=rest.replace(/باتری|باطری/g,'');
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

export function exclusivePurchase(text:string){return /(?:^|[؛،\s])فقط\s+(?:یه\s+|یک\s+)?(?:شارژر|کابل|قاب|کاور|کیف|گوشی|موبایل|کفش|کتانی|هدفون|لپ\s*تاپ)(?:\s|$)/.test(normalized(text))&&purchaseTopics(text).length===1;}

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
