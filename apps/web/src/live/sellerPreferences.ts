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
    const price=input.match(/(?:زیر|حداکثر|بودجه(?:ام)?|تا)(\d+(?:\.\d+)?)(میلیون|میلیارد|تومان|تومن)/);
    if(price){
      const [whole,fraction='']=price[1]!.split('.');
      const multiplier=price[2]==='میلیارد'?1000000000n:price[2]==='میلیون'?1000000n:1n;
      const scale=10n**BigInt(fraction.length),value=(BigInt(whole!)*scale+BigInt(fraction||'0'))*multiplier;
      if(value%scale===0n&&value/scale<=9223372036854775807n)result.max=String(value/scale);
    }
  }
  return result;
}
