import TouchAction from './TouchAction';
import {useState} from 'react';
import {CheckCircle2,Navigation,MapPin,Store,ArrowLeft,ArrowRight,Clock,ShoppingBag,SlidersHorizontal,ChevronDown,Download} from 'lucide-react';
import type {Shopping} from './state';
import {date,fa,money} from './data';
import {SafetyGate} from './VisitDecision';
import {IndoorGuide,ModeSelector} from './RoadUI';
import {travelLabels} from './upgrades';
import DestinationAddress from './DestinationAddress';
import {downloadPurchaseImage} from './purchaseImage';
import {revisitPurchase} from './purchaseProgress';

export default function PurchaseJourney({a,onMap=false}:{a:Shopping;onMap?:boolean}){
 const [showReview,setShowReview]=useState(false);
 const p=a.activePurchase,o=a.selected;if(!p||!o)return null;
 const route=a.roadRoutes.find(r=>r.offer_id===o.offer_id);
 const evidence=p.evidence,available=evidence&&['available','price_changed'].includes(evidence.outcome);
 const stageLabels={ready:'آمادهٔ رفتن',en_route:'در راه فروشگاه',arrived:'در فروشگاه',problem:'پیداکردن جایگزین',done:'پایان این خرید'};
 const finished=p.stage==='done',inMotion=p.stage==='en_route',arrived=p.stage==='arrived';
 return <section className="purchase-journey" aria-label="همراهی تا پایان خرید" data-purchase-stage={p.stage} data-completed-visit={finished?'true':undefined}>
  <header><span>{finished?<CheckCircle2 size={20}/>:inMotion?<Navigation size={20}/>:<Store size={20}/>}</span><div><small>{stageLabels[p.stage]}</small><h3>{finished?(p.result==='purchased'?'خریدت انجام شد':p.result==='later'?'ادامهٔ خرید در فرصتی دیگر':'این مراجعه تمام شد'):o.shop.name}</h3></div></header>
  <PurchaseSteps a={a}/>
  {finished?<><p>{p.result==='purchased'?`خرید از «${o.shop.name}» را ثبت کردیم. کار این خرید تمام است؛ می‌توانی با خیال راحت از برنامه خارج شوی.`:p.result==='later'?'فعلاً اقدامی لازم نیست. مقصد در برنامه‌های قبلی ذخیره شد؛ همین‌جا یا از سابقه می‌توانی ادامه بدهی.':'بدون ثبت خرید، این مراجعه را بستیم. قدم اجباری دیگری نداری.'}</p><div className="journey-receipt"><b>{a.product?.persian_title??a.knownProducts[o.product_id]?.persian_title}</b><span>{o.shop.name}</span><small>نتیجه بر اساس اعلام تو ثبت شده است؛ پرداخت یا سفارش آنلاین انجام نشده.</small></div><DestinationAddress address={o.shop.address}/><PurchaseDownload a={a}/><TouchAction className="primary-action" action={a.newConversation}>شروع یک خرید تازه <ArrowLeft size={16}/></TouchAction>{p.result==='later'&&<TouchAction className="secondary-action" action={a.resumePurchase}>ادامهٔ همین خرید</TouchAction>}<details><summary>خلاصه و اطلاعات فروشگاه</summary><p>{o.shop.address}</p><TouchAction className="secondary-action" action={()=>a.showOffer(o)}><MapPin size={16}/>این فروشگاه روی نقشه</TouchAction></details></>:<>
  <p className="journey-product">{a.product?.product_id===o.product_id?a.product.persian_title:a.knownProducts[o.product_id]?.persian_title}</p>
  <DestinationAddress key={o.offer_id} address={o.shop.address}/><TouchAction className="journey-navigator" aria-label="بازکردن مسیریاب" action={()=>a.setOverlay('nav')}><Navigation size={17}/><span>مسیریاب</span></TouchAction>
  {p.stage==='ready'&&<><JourneyDeparture a={a}/><p>{available?(evidence.source==='user_report'?'طبق گزارش تو، کالا موجود است. آماده‌ای راه بیفتیم؟':'پاسخ آزمایشی: موجود است؛ این پاسخ موجودی واقعی را تأیید نمی‌کند.'):'مقصد مشخص است؛ موجودی هنوز تأیید نشده. اگر خودت بررسی کرده‌ای، نتیجه را ثبت کن؛ یا با آگاهی از این موضوع حرکت کن.'}</p><SafetyGate a={a}/><TouchAction className="primary-action" disabled={a.needsSafetyReview||a.busy||a.agentAlternatives.active} action={()=>a.actOnPurchase('start')}><Navigation size={17}/>بزن بریم</TouchAction>{!available&&<TouchAction className="secondary-action" aria-expanded={showReview} action={()=>setShowReview(v=>!v)}>نتیجهٔ بررسی من</TouchAction>}{showReview&&<div className="journey-report"><p>خودت تماس گرفتی یا حضوری بررسی کردی؟</p><TouchAction className="secondary-action" action={()=>{a.recordVisitResult('available');setShowReview(false);}}>بله، موجود بود</TouchAction><TouchAction className="secondary-action" action={()=>a.recordVisitResult('closed')}>بسته بود</TouchAction><TouchAction className="secondary-action" action={()=>a.recordVisitResult('out_of_stock')}>موجود نبود</TouchAction></div>}</>}
  {inMotion&&<><p>به سمت فروشگاه می‌رویم. وقتی به مقصد رسیدی، همین‌جا «رسیدم» را بزن.</p>{route?<p className="journey-route"><Clock size={16}/>{travelLabels[a.travelMode]} · حدود {fa(Math.ceil(route.duration_seconds/60))} دقیقه روی معابر</p>:<p className="upgrade-note">{a.roadBusy?'مسیر خیابانی در حال دریافت است…':'مسیر خیابانی هنوز آماده نیست؛ مسیر مستقیم، راهنمای حرکت نیست.'}</p>}<p className="upgrade-note">موقعیت زنده دنبال نمی‌شود؛ رسیدن را خودت اعلام کن. زمان مسیر تخمینی و بدون ترافیک زنده است.</p><TouchAction className="primary-action" action={()=>a.actOnPurchase('arrive')}><MapPin size={17}/>رسیدم به فروشگاه</TouchAction>{!route&&<TouchAction className="secondary-action" action={()=>a.setOverlay('travel')}>دریافت مسیر خیابانی</TouchAction>}{!onMap&&<TouchAction className="secondary-action" action={()=>a.showOffer(o)}>ادامه روی نقشه</TouchAction>}</>}
  {arrived&&<><p>رسیدی به مقصد. فروشگاه باز بود و کالا را پیدا کردی؟</p><details><summary>راهنمای پیدا کردن ورودی فروشگاه</summary><IndoorGuide address={o.shop.address}/></details><TouchAction className="primary-action" action={()=>a.actOnPurchase('purchased')}><CheckCircle2 size={17}/>خریدم؛ خرید انجام شد</TouchAction><div className="journey-choice-pair"><TouchAction className="secondary-action" action={()=>a.actOnPurchase('closed')}>بسته بود</TouchAction><TouchAction className="secondary-action" action={()=>a.actOnPurchase('out_of_stock')}>موجود نبود</TouchAction></div><TouchAction className="journey-text-action" action={()=>a.actOnPurchase('not_purchased')}>نخریدم؛ مراجعه را تمام کنیم</TouchAction></>}
  {(p.stage==='problem'||p.stage==='ready'&&a.agentAlternatives.active)&&<div className="journey-alternatives"><b>{p.problem==='closed'?'فروشگاه بسته بود؛ مقصد بعدی را پیدا کنیم':p.problem==='out_of_stock'?'کالا موجود نبود؛ با همین نیاز ادامه می‌دهیم':'این مقصد مناسب نبود؛ جایگزین‌ها'}</b>{a.agentAlternatives.busy?<p role="status">در حال بررسی جایگزین‌های همین کالا…</p>:a.agentAlternatives.error?<><p role="status">{a.agentAlternatives.error}</p><TouchAction className="secondary-action" action={a.retryAgentAlternatives}>بررسی دوباره</TouchAction></>:a.agentAlternatives.items.length?a.agentAlternatives.items.map(next=><TouchAction className="secondary-action" key={next.offer_id} action={()=>a.contact(next)}><Store size={15}/>{next.shop.name} · {money(next.price_toman)} تومان</TouchAction>):<><p>با این شرایط جایگزینی پیدا نشد؛ می‌توانی محدوده را تغییر بدهی یا مراجعه را برای بعد بگذاری.</p><TouchAction className="secondary-action" action={()=>a.setOverlay('filters')}>تغییر شرایط جست‌وجو</TouchAction></>}</div>}
  <TouchAction className="secondary-action" data-journey-action="followup" action={()=>a.setOverlay('followup')}>بررسی موجودی و پاسخ فروشگاه</TouchAction>
  <details className="journey-more"><summary className="disclosure-trigger"><SlidersHorizontal size={18} className="disclosure-icon" aria-hidden="true"/><span className="disclosure-label">جزئیات و گزینه‌های بیشتر</span><ChevronDown size={17} className="disclosure-chevron" aria-hidden="true"/></summary>
   <p>{money(o.price_toman)} تومان · قیمت ثبت‌شده در منبع</p>
   <div className="journey-more-actions" aria-label="گزینه‌های همین مرحله">
    {route&&<TouchAction className="secondary-action" action={()=>a.setOverlay('directions')}>راهنمای مسیر خیابانی</TouchAction>}
    <TouchAction className="secondary-action" action={()=>a.setOverlay('travel')}>وسیله و زمان حرکت</TouchAction>
    <TouchAction className="secondary-action" action={()=>a.setOverlay('shops')}>بررسی فروشگاه‌های دیگر</TouchAction>
    {a.delegation?.status==='planned'&&<TouchAction className="secondary-action" action={()=>a.ask('یک فروشگاه دیگر انتخاب کن')}>گزینهٔ دیگر</TouchAction>}
   </div>
   <details className="journey-secondary"><summary>ذخیره، ادامه در فرصتی دیگر و نمایش آزمایشی</summary><div className="journey-more-actions">
    <TouchAction className="secondary-action" disabled={a.busy||a.needsSafetyReview||a.saved.some(t=>t.offer_id===o.offer_id)} action={()=>a.setOverlay('plan')}>{a.saved.some(t=>t.offer_id===o.offer_id)?'برنامهٔ ذخیره‌شده':'ذخیرهٔ برنامه'}</TouchAction>
    <TouchAction className="secondary-action" disabled={a.busy} action={()=>a.setOverlay('postpone')}>ادامه در فرصتی دیگر</TouchAction>
    <TouchAction data-journey-action="checks" className="secondary-action" action={()=>a.setOverlay('checks')}>نمایش آزمایشی؛ پاسخ و رزرو</TouchAction>
    <TouchAction className="journey-text-action" action={()=>a.actOnPurchase('cancelled')}>منصرف شدم؛ پایان مراجعه</TouchAction>
   </div></details>
  </details>
  </>}
 </section>;
}

export function PurchaseSteps({a}:{a:Shopping}){
 const p=a.activePurchase;if(!p)return null;
 const backLabel=p.stage==='done'?'بازگشت برای اصلاح نتیجه':p.stage==='en_route'?'بازگشت به آماده‌شدن':p.stage==='arrived'?'بازگشت به مسیر':'بازگشت به انتخاب فروشگاه';
 return <nav className="journey-step-nav" aria-label="قدم‌های خرید"><ol className="purchase-steps" aria-label="مراحل مراجعه">{([['انتخاب مقصد',Store],['حرکت',Navigation],['رسیدن',MapPin],['نتیجهٔ خرید',ShoppingBag]] as const).map(([label,Icon],i)=>{const step={ready:0,en_route:1,arrived:2,problem:p.startedAt?2:0,done:3}[p.stage];return <li key={label} aria-label={label} title={label} aria-current={i===step?'step':undefined} className={i<=step?'reached':''}><TouchAction className="purchase-step-button" aria-label={`رفتن به مرحلهٔ ${label}`} disabled={a.busy||revisitPurchase(p,i)===null} action={()=>a.jumpPurchase(i)}><Icon size={14} aria-hidden="true"/><span>{label}</span></TouchAction></li>;})}</ol><TouchAction className="icon-button journey-back" aria-label={backLabel} title={backLabel} disabled={a.busy} action={a.backPurchase}><ArrowRight size={19}/></TouchAction></nav>;
}

export function PurchaseDownload({a}:{a:Shopping}){
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);const o=a.selected;if(!o)return null;
 const download=async()=>{setBusy(true);setError(null);try{const route=a.roadRoutes.find(r=>r.offer_id===o.offer_id);await downloadPurchaseImage({
  product:a.knownProducts[o.product_id]?.persian_title??a.product?.persian_title??'محصول انتخاب‌شده',shop:o.shop.name??'فروشگاه',address:o.shop.address,price:o.price_toman,
  result:a.activePurchase?.stage==='done'?(a.activePurchase.result==='purchased'?'خرید انجام شد — طبق اعلام تو':a.activePurchase.result==='later'?'برنامهٔ مراجعه برای بعد':'مراجعه بدون ثبت خرید پایان یافت'):'برنامهٔ مراجعه به فروشگاه',
  time:a.activePurchase?.finishedAt?'زمان ثبت نتیجه: '+new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(a.activePurchase.finishedAt)):'زمان مراجعه: '+(a.visitIntent?.visitDate?date(a.visitIntent.visitDate)+' · ':'')+(a.visitIntent?.localTime?fa(a.visitIntent.localTime):'حرکت اکنون'),
  mode:travelLabels[a.travelMode],origin:a.position?`${a.position.lat}, ${a.position.lon}`:null,destination:o.shop.lat!=null&&o.shop.lon!=null?`${o.shop.lat}, ${o.shop.lon}`:null,
  route:route?`مسیر خیابانی: ${fa(Math.ceil(route.duration_seconds/60))} دقیقه · ${fa(Math.round(route.distance_meters))} متر؛ تخمینی و بدون ترافیک زنده`:null,
 });}catch(e){setError(e instanceof Error?e.message:'دانلود تصویر انجام نشد.');}finally{setBusy(false);}};
 return <div className="purchase-download"><TouchAction className="secondary-action" disabled={busy} action={()=>void download()}><Download size={17}/>{busy?'در حال ساخت تصویر…':'دانلود تصویر خلاصهٔ خرید'}</TouchAction>{error&&<p role="alert">{error}</p>}</div>;
}

export function JourneyDeparture({a}:{a:Shopping}){const route=a.roadRoutes.find(r=>r.offer_id===a.selected?.offer_id);return <><div className="journey-travel"><ModeSelector a={a} compact/><TouchAction data-journey-action="travel" className="journey-travel-details" aria-label="تنظیم زمان حرکت و جزئیات مسیر" aria-haspopup="dialog" action={()=>a.setOverlay('travel')}><Clock size={15}/><span>{a.visitIntent?.visitDate?`${date(a.visitIntent.visitDate)} · `:''}{a.visitIntent?.localTime?`حرکت ${fa(a.visitIntent.localTime)}`:'حرکت همین الان'}{a.travelMode==='manual'?' · زمان راه دستی':''}</span><SlidersHorizontal size={15}/></TouchAction>{route&&<small>حدود {fa(Math.ceil(route.duration_seconds/60))} دقیقه روی معابر · بدون ترافیک زنده</small>}</div>{a.travelMode!=='manual'&&!route&&<div className="journey-route-request"><TouchAction className="secondary-action" disabled={a.roadBusy||!a.position||!a.routeTargets.length} action={()=>{a.setRoadConsent(true);a.retryRoad();}}><Navigation size={16}/>{a.roadBusy?'در حال دریافت مسیر…':'دریافت مسیر خیابانی'}</TouchAction><small>با دریافت مسیر، موقعیت شروع و مقصد به سرویس نقشه فرستاده می‌شود. زمان مسیر تخمینی است.</small>{a.roadError&&<p className="upgrade-error" role="status">مسیر دریافت نشد؛ دوباره امتحان کن یا حرکت را در مسیریاب ادامه بده.</p>}</div>}</>;}
