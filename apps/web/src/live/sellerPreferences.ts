import type {Filters} from './data';

// Keep clause boundaries for negation; compact only inside each clause.
export function sellerPreferences(text:string):Partial<Filters>{
  const result:Partial<Filters>={};
  const clauses=text.replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/ي/g,'ی').replace(/ك/g,'ک').split(/[؛;،!؟\n]|ولی|اما|بعدش/);
  const flags:[keyof Pick<Filters,'open'|'credit'|'pay'|'kala'|'fast'>,RegExp][]=[
    ['open',/فقط(?:فروشگاه|مغازه)?(?:های)?باز|فروشگاه(?:های)?باز|مغازه(?:های)?باز/],
    ['credit',/قسطی|اعتباری/],['pay',/تربپی/],['kala',/کالابرگ/],['fast',/ارسالفوری/],
  ];
  const normalized=text.replace(/\u200c/g,' ').replace(/\s+/g,' ');
  if(/همه(?:ٔ| ی)?\s*فروشگاه/.test(normalized)&&/(?:قسطی|اقساط|اعتباری|ترب\s*پی).*(?:لازم نیست|نیاز نیست|نمی\s*خوا|بردار|حذف(?!\s*نکن))/.test(normalized))
    Object.assign(result,{credit:false,pay:false,kala:false});
  for(const clause of clauses){
    const input=clause.replace(/[\s\u200c٬,]/g,'');
    const keep=/حذفنکن|برندار|لغونکن|غیرفعالنکن|تغییرنده|حفظکن|نگهدار/.test(input);
    for(const [key,pattern] of flags){
      if(!pattern.test(input))continue;
      if(keep)continue;
      const remove=/بردار|حذف|لغو|غیرفعال|خاموش|مهمنیست|فرقیندار|نمیخوا(?:م|هم)|نباش|لازمنیست|نیازنیست/.test(input);
      // "فقط باز نباشد" removes the restriction; it does not mean closed-only.
      result[key]=!remove;
    }
    if(!keep&&/همه(?:ی)?فیلتر(?:ها)?(?:را|رو)?(?:بردار|حذف|پاک|لغو)|بدونهیچفیلتر/.test(input))
      Object.assign(result,{open:false,credit:false,pay:false,kala:false,fast:false,min:'',max:'',withinRadius:false});
    if(!keep&&/(?:بودجه|سقفقیمت|محدودیتقیمت).*(?:بردار|حذف|لغو|مهمنیست)|بدون(?:سقف|محدودیت)قیمت/.test(input))result.max='';
    const wordBudget=clause.replace(/\u200c/g,' ').match(/(?:زیر|حداکثر|سقف(?: بودجه| قیمت)?|بودجه(?: ام)?|تا)(?:\s+(?:را|رو))?\s+([آ-ی\s]+?)\s*(?=می\s*خوا|باش|بخر|کن|است|هست|که|برای|با|$|[.،؛؟!])/);
    if(wordBudget&&/هزار|میلیون|میلیارد/.test(wordBudget[1]!)){const amount=wordToman(wordBudget[1]!.replace(/\s*(?:تومان|تومن)$/,''));if(amount!==null)result.max=amount;}
    const price=input.match(/(?:زیر|حداکثر|سقف(?:بودجه|قیمت)?|بودجه(?:ام)?|تا)(?:را|رو)?(\d+(?:\.\d+)?)(میلیون|میلیارد|تومان|تومن)/);
    if(price){
      const [whole,fraction='']=price[1]!.split('.');
      const multiplier=price[2]==='میلیارد'?1000000000n:price[2]==='میلیون'?1000000n:1n;
      const scale=10n**BigInt(fraction.length),value=(BigInt(whole!)*scale+BigInt(fraction||'0'))*multiplier;
      if(value%scale===0n&&value/scale<=9223372036854775807n)result.max=String(value/scale);
    }
  }
  return result;
}

// Whole Persian amounts only; preserve exact integer money without floating point.
export function wordToman(text:string):string|null{
 const values:Record<string,bigint>=Object.fromEntries('صفر یک دو سه چهار پنج شش هفت هشت نه ده یازده دوازده سیزده چهارده پانزده شانزده هفده هجده نوزده'.split(' ').map((w,i)=>[w,BigInt(i)]));
 for(const [i,w] of 'بیست سی چهل پنجاه شصت هفتاد هشتاد نود'.split(' ').entries())values[w]=BigInt(20+i*10);
 for(const [i,w] of 'صد دویست سیصد چهارصد پانصد ششصد هفتصد هشتصد نهصد'.split(' ').entries())values[w]=BigInt((i+1)*100);
 const scales:Record<string,bigint>={هزار:1000n,میلیون:1000000n,میلیارد:1000000000n};
 let total=0n,group=0n,lastScale=1000000000000n,lastRank=4,number=false;
 for(const token of text.trim().split(/\s+/)){
  if(token==='و'){if(!number)return null;number=false;continue;}
  if(scales[token]!==undefined){const scale=scales[token]!;if(!number||!group||scale>=lastScale)return null;total+=group*scale;group=0n;lastScale=scale;lastRank=4;number=true;}
  else if(token==='نیم'&&!number){group+=1n;lastRank=0;number=true;}
  else if(values[token]!==undefined){const value=values[token]!,rank=value>=100n?3:value>=20n?2:1;if(number||rank>=lastRank)return null;group+=value*2n;lastRank=rank;number=true;}
  else return null;
 }
 const amount=total+group;return number&&amount%2n===0n&&amount/2n<=9223372036854775807n?String(amount/2n):null;
}
