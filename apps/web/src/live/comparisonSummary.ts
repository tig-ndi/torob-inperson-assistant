const fa=(value:number)=>new Intl.NumberFormat('fa-IR').format(value);
const money=(value:string)=>new Intl.NumberFormat('fa-IR').format(BigInt(value));

export function comparisonPriceSummary(prices:(string|null)[]):string|null{
  const known=prices.map((price,index)=>({price,index})).filter((row):row is {price:string;index:number}=>row.price!==null);
  if(known.length<2)return null;
  const sorted=[...known].sort((a,b)=>BigInt(a.price)<BigInt(b.price)?-1:BigInt(a.price)>BigInt(b.price)?1:0);
  const first=sorted[0]!,next=sorted[1]!,gap=BigInt(next.price)-BigInt(first.price);
  if(!gap)return `کمترین قیمت ثبت‌شدهٔ گزینه‌های ${sorted.filter(p=>p.price===first.price).map(p=>fa(p.index+1)).join(' و ')} برابر است؛ تناسب و موجودی را جدا بررسی کن.`;
  return `کمترین قیمت منبع: گزینهٔ ${fa(first.index+1)}؛ ${money(String(gap))} تومان کمتر از گزینهٔ ${fa(next.index+1)}. تناسب و موجودی تأیید نشده‌اند.`;
}
