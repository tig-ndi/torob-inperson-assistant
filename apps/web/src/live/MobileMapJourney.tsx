import {SafetyGate} from './VisitDecision';
import {Bike,Car,Clock,Footprints,MoreHorizontal,Navigation} from 'lucide-react';
import TouchAction from './TouchAction';
import {PurchaseSteps,JourneyDeparture} from './PurchaseJourney';
import type {Shopping} from './state';
import {fa,money} from './data';
import {travelLabels} from './upgrades';

export default function MobileMapJourney({a}:{a:Shopping}){
 const p=a.activePurchase;
 if(!p||!a.selected)return null;
 const open=()=>a.setOverlay('journey');
 const main=p.stage==='ready'&&a.agentAlternatives.active?{label:'جایگزین‌ها',action:open}:p.stage==='ready'?{label:'بزن بریم',action:()=>a.actOnPurchase('start')}
  :p.stage==='en_route'?{label:'رسیدم به فروشگاه',action:()=>a.actOnPurchase('arrive')}
  :p.stage==='arrived'?{label:'خریدم؛ خرید انجام شد',action:()=>a.actOnPurchase('purchased')}
  :p.stage==='problem'?{label:'جایگزین‌ها',action:open}:{label:'خرید تازه',action:a.newConversation};
 const road=a.roadRoutes.find(r=>r.offer_id===a.selected?.offer_id);
 const Mode={walking:Footprints,driving:Car,cycling:Bike,manual:Clock}[a.travelMode];
 return <section className="mobile-map-journey" aria-label="مراحل خرید روی نقشه" data-mobile-journey data-purchase-stage={p.stage}>
  <p className="map-destination-summary">مقصد انتخاب‌شده: {a.selected.shop.name} · {money(a.selected.price_toman)} تومان؛ قیمت ثبت‌شده</p>
  <div className="map-journey-steps"><PurchaseSteps a={a}/></div>
  {p.stage==='done'&&<p role="status">{p.result==='purchased'?'خریدت انجام شد؛ این خرید تمام است':p.result==='later'?'برای مراجعهٔ بعد ذخیره شد':'بدون ثبت خرید؛ این مراجعه تمام شد'}</p>}
   {p.stage==='ready'&&<><JourneyDeparture a={a}/><SafetyGate a={a}/></>}<div className="mobile-journey-actions">
    <TouchAction className="primary-action" disabled={a.busy||p.stage==='ready'&&a.needsSafetyReview&&!a.agentAlternatives.active} action={main.action}>{main.label}</TouchAction>
    {['ready','en_route'].includes(p.stage)?<TouchAction className="secondary-action" aria-label="وسیله و زمان حرکت" title="تغییر وسیله، زمان حرکت و جزئیات مسیر" action={()=>a.setOverlay('travel')}><Mode size={16}/><span>{travelLabels[a.travelMode]}{p.stage==='en_route'&&road?` · ${fa(Math.max(1,Math.ceil(road.duration_seconds/60)))} دقیقه`:''}</span></TouchAction>:<TouchAction className="secondary-action" action={open}>{p.stage==='arrived'?'مشکلی بود؟':'جزئیات'}</TouchAction>}
    {p.stage!=='done'&&<TouchAction className="icon-button journey-navigator" aria-label="بازکردن مسیریاب" title="بازکردن مسیر در مسیریاب" action={()=>a.setOverlay('nav')}><Navigation size={18}/></TouchAction>}
    <TouchAction className="icon-button" aria-label="جزئیات این مرحله" title="جزئیات، استعلام و گزینه‌های همین مرحله" action={open}><MoreHorizontal size={19}/></TouchAction>
   </div>
 </section>;
}
