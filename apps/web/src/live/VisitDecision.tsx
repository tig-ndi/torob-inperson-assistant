import {Clock,MapPin,Navigation,ShieldAlert,ChevronDown} from 'lucide-react';
import type {Shopping} from './state';
import {distance,fa,money,type Offer} from './data';
import {choiceReason,recommendation} from './journey';
import {comparisonValue} from './comparisonValues';

export function ArrivalFacts({a,o,controls=false,status=true}:{a:Shopping;o:Offer;controls?:boolean;status?:boolean}){
  const check=a.arrivalChecks[o.offer_id];
  return <div className="arrival-facts" data-arrival={o.offer_id}>
    {check?.minutes_max!=null&&<p><Clock size={14}/>{check.basis==='street_route'?'برآورد مسیر خیابانی':check.basis==='user_duration'?'زمان راه واردشده':'برآورد اولیهٔ پیاده'}: {fa(check.minutes_min!)}{check.minutes_min!==check.minutes_max?` تا ${fa(check.minutes_max)}`:''} دقیقه · رسیدن حدود {new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(new Date(check.arrival_at!))}</p>}
    {check&&status&&<p className={check.risk==='ready'?'':'arrival-warning'}>{check.risk==='ready'?'طبق برنامه تا زمان رسیدن و ۱۰ دقیقه فرصت خرید باز است.':check.risk==='closed'?'برای این زمان، فروشگاه طبق برنامه بسته است.':check.risk==='closing_soon'?'خطر بسته‌شدن تا زمان رسیدن یا تمام‌شدن فرصت خرید.':'ساعت یا زمان رسیدن نامشخص است؛ قبل از حرکت بررسی کن.'}</p>}
    {controls&&<button className="travel-manual" onClick={()=>a.setOverlay('travel')}>زمان و روش رسیدن را تغییر بده</button>}
    {a.arrivalBusy&&controls&&<p role="status">بررسی ساعت فروشگاه در زمان رسیدن…</p>}
    {a.arrivalError&&controls&&<p role="status">بررسی زمان رسیدن دریافت نشد؛ ساعت فروشگاه را پیش از حرکت بررسی کن.</p>}
  </div>;
}

export function SafetyGate({a}:{a:Shopping}){
  if(!a.selected||!a.needsSafetyReview)return null;
  return <section className="visit-safety" role="alert" data-visit-safety><ShieldAlert size={20}/><div><b>{a.sellerConcern?a.sellerConcern:a.safetyRisk==='closed'?'برای این زمان راه نیفت':a.safetyRisk==='closing_soon'?'ممکن است تا رسیدن بسته شود':'پیش از رفتن بررسی لازم است'}</b><p>{a.arrivalBusy?'دارم زمان رسیدن و ساعت کاری را تطبیق می‌دهم.':a.safetyRisk==='closed'?'فروشگاه طبق برنامه بسته است. فروشگاه جایگزین یا زمان دیگری را بررسی کن.':'بازبودن هنگام رسیدن یا فرصت خرید هنوز مطمئن نیست. موجودی هم تأیید نشده است.'}</p><div className="inline-actions">{!a.agentAlternatives.active&&<button className="primary-action" onClick={()=>a.setOverlay('alts')}>بررسی جایگزین‌ها</button>}<button className="secondary-action" disabled={a.arrivalBusy} onClick={a.acknowledgeSafety}>با آگاهی از هشدار ادامه می‌دهم</button></div></div></section>;
}

export default function VisitDecision({a}:{a:Shopping}){
  if(!a.visitIntent||!a.position||a.need?.pending_requirements.length)return null;
  const list=recommendation(a.candidateOffers,a.arrivalChecks,a.weight).slice(0,3);
  const safe=list.filter(o=>a.arrivalChecks[o.offer_id]?.risk==='ready');
  const markets=[...new Map(a.candidateVisits.flatMap(v=>v.insights.markets).map(m=>[m.name,m])).values()].slice(0,2);
  const candidate=(o:Offer,first:boolean)=><article key={o.offer_id} data-visit-candidate={o.offer_id}><b>{a.arrivalChecks[o.offer_id]?.risk==='ready'?(first?'پیشنهاد اول: ':'قابل بررسی برای مراجعه: '):'نیازمند بررسی زمان رسیدن: '}{o.shop.name}</b><span>{a.knownProducts[o.product_id]?.persian_title??a.candidateVisits.find(v=>v.product.product_id===o.product_id)?.product.persian_title}</span><p>{choiceReason(o,a.arrivalChecks,list)}</p><ArrivalFacts a={a} o={o} status={false}/><div className="inline-actions"><button className="primary-action" onClick={()=>a.contact(o)}>بررسی همین مقصد</button><button className="secondary-action" onClick={()=>a.showOffer(o)}><MapPin size={15}/>روی نقشه</button></div></article>;
  return <section className="visit-decision" aria-label="پیشنهاد برای مراجعه" data-visit-decision><header><Navigation size={19}/><b>اول مقصدِ قابل مراجعه را پیدا کنیم</b></header>
    {a.candidateBusy?<p role="status">بررسی فروشگاه‌های باز بین مدل‌های پیدا‌شده…</p>:<>
      <p>{list.length?safe.length?`از بین ${fa(a.destinationCoverage?.models??a.candidateVisits.length)} مدل مرتبط در محدوده، مقصدِ دارای فرصت مراجعه پیدا شد؛ موجودی و سازگاری را هم بررسی کن.`:`${fa(list.length)} مقصد ثبت‌شده برای بررسی زمان رسیدن و فرصت خرید پیدا شد.`:a.candidateError?'بررسی بعضی مدل‌ها کامل نشد؛ نمی‌توانم نبودِ فروشگاه باز را نتیجه بگیرم.':`بین ${fa(a.destinationCoverage?.models??a.candidateVisits.length)} مدل مرتبط در محدوده، پیشنهاد باز تا شعاع ${fa(Math.max(15,a.filters.radius,a.visitIntent.nearbyKm))} کیلومتر پیدا نشد. برای این ساعت مقصد مطمئن پیشنهاد نمی‌کنم.`}</p>
      {list.slice(0,1).map(o=>candidate(o,true))}
      {list.length>1&&<details className="decision-details"><summary><ChevronDown size={16}/>مقصدهای دیگر · {fa(list.length-1)}</summary>{list.slice(1).map(o=>candidate(o,false))}</details>}
      {!safe.length&&!a.candidateBusy&&!a.candidateError&&<div className="visit-next-step" data-visit-next-step><b>قدم بعدی همین خرید</b><p>{a.travelMode==='walking'&&list.length?'اول بررسی کنیم با وسیلهٔ دیگری فرصت رسیدن داری؛ بازبودن هنگام حرکت به‌تنهایی کافی نیست.':'ساعت یا روش رفتن را تغییر بدهیم و دوباره فرصت خرید را بررسی کنیم.'}</p><div className="inline-actions"><button className="primary-action" onClick={()=>{if(list[0])a.contact(list[0]);a.setOverlay('travel');}}>بررسی روش رفتن و زمان</button><button className="secondary-action" onClick={()=>a.setOverlay('filters')}>تغییر شرایط خرید</button></div></div>}
      {!!markets.length&&<div className="decision-markets"><p>این محدوده‌ها در آدرس فروشگاه‌های همین دسته آمده‌اند؛ بازبودن و موجودی مغازه‌های خارج از مجموعه مشخص نیست.</p>{markets.map(m=><article key={m.name} className="decision-market"><b>{m.name} · گزینهٔ احتمالی</b><p>{distance(m.direct_distance_meters)} فاصلهٔ مستقیم</p><button className="secondary-action" onClick={()=>a.showPlace({lat:m.lat,lon:m.lon,label:m.name})}>دیدن محدوده روی نقشه</button></article>)}</div>}
      {!list.length&&<div className="inline-actions"><button className="secondary-action" onClick={a.expandVisit}>بررسی محدودهٔ بزرگ‌تر</button></div>}
      {a.candidateError&&<p role="status">{a.candidateError}</p>}
      <small>{a.destinationCoverage?`پیشنهاد مراجعه از کل آفرهای مرتبط در محدوده بررسی شد؛ ${fa(a.destinationCoverage.shops)} فروشگاه از دیتاست تهران. موجودی هنوز تأیید نشده است.`:'بررسی مقصدها فقط بر داده‌های تاریخی تهران تکیه دارد.'}</small>
    </>}
  </section>;
}

export function CompareAdvice({a,offers}:{a:Shopping;offers:Offer[]}){
  if(!offers.length)return null;const ordered=recommendation(offers,a.arrivalChecks,a.weight),best=ordered[0]!;
  return <section className="compare-advice" data-compare-advice><b>برای مراجعه: {best.shop.name}</b><p>{choiceReason(best,a.arrivalChecks,offers)}</p>{ordered.slice(1).map(o=><p key={o.offer_id}><b>{o.shop.name}:</b> {choiceReason(o,a.arrivalChecks,offers)}</p>)}<button className="secondary-action" onClick={()=>a.showOffer(best)}>پیشنهاد اول روی نقشه</button></section>;
}

export function ModelAdvice({a}:{a:Shopping}){
  if(a.models.length<2)return null;
  const priced=a.models.filter(p=>p.offer_summary.min_price_toman!==null).sort((x,y)=>BigInt(x.offer_summary.min_price_toman!)<BigInt(y.offer_summary.min_price_toman!)?-1:1),cheap=priced[0];
  const rows=recommendation(a.mapOffers.filter(o=>a.models.some(p=>p.product_id===o.product_id)),a.arrivalChecks,a.weight),best=rows[0];
  const keys=[...new Set(a.models.flatMap(p=>p.specs.filter(s=>/کاربرد|مناسب برای|نوع درگاه|ظرفیت باتری|حافظه رم|جنس زیره|پشتیبانی از زبان فارسی/.test(s.key??'')).map(s=>s.key!)))];
  const differences=keys.map(key=>({key,values:a.models.map(p=>p.specs.filter(s=>s.key===key&&s.value).map(s=>s.value).join(' / ')||'ثبت نشده')})).filter(row=>new Set(row.values.map(comparisonValue)).size>1).slice(0,3);
  return <section className="compare-advice"><b>تفاوت کاربردی این انتخاب‌ها</b>{cheap&&<p>برای شروع بررسی قیمت، «{cheap.persian_title}»: {money(cheap.offer_summary.min_price_toman)} تومان. قیمت کمتر به‌تنهایی تناسب یا موجودی را ثابت نمی‌کند.</p>}{differences.map(row=><div className="model-difference" key={row.key}><b>{row.key}</b>{row.values.map((value,i)=><p key={a.models[i]!.product_id}>{a.models[i]!.persian_title}: {value}</p>)}</div>)}{!differences.length&&<p>در ویژگی‌های اصلیِ ثبت‌شده، تفاوت قابل اتکایی برای ترجیح یکی پیدا نشد؛ قیمت، شرایط فروشگاه و بررسی حضوری را ملاک بعدی بگذار.</p>}{best&&<p>برای مراجعه، «{a.knownProducts[best.product_id]?.persian_title}» در «{best.shop.name}»: {choiceReason(best,a.arrivalChecks,rows)}</p>}<p>ویژگی ثبت‌نشده تأیید نمی‌شود؛ جزئیات کامل در جدول در دسترس است.</p></section>;
}

export function FeatureComparison({a}:{a:Shopping}){
  const groups=new Map<string,{label:string;values:Map<string,string[]>}>();
  for(const p of a.models)for(const spec of p.specs){
    if(!spec.key?.trim())continue;
    const id=JSON.stringify([spec.section?.trim()??'',spec.key.trim()]);
    const group=groups.get(id)??{label:[spec.section,spec.key].filter(Boolean).join(' · '),values:new Map<string,string[]>()};
    group.values.set(p.product_id,[...(group.values.get(p.product_id)??[]),spec.value??'ثبت نشده']);groups.set(id,group);
  }
  const common=[...groups.values()].filter(g=>g.values.size>=2).slice(0,8);
  if(!common.length)return null;
  return <details className="feature-comparison" open><summary>مقایسهٔ ویژگی‌های هم‌نام</summary><ol>{a.models.map((p,i)=><li key={p.product_id}><b>گزینهٔ {fa(i+1)}:</b> {p.persian_title}</li>)}</ol>{common.map(g=><section key={g.label}><b>{g.label}</b><dl>{a.models.map((p,i)=><div key={p.product_id}><dt>گزینهٔ {fa(i+1)}</dt><dd>{g.values.get(p.product_id)?.join(' / ')??'در منبع ثبت نشده'}</dd></div>)}</dl></section>)}<small>فقط مقادیر منبع مقایسه شده‌اند؛ مقدار منفی یا نامشخص به قابلیت مثبت تبدیل نمی‌شود.</small></details>;
}
