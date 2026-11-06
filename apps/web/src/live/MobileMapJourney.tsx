import {useLayoutEffect,useRef} from 'react';
import {Bike,Car,Clock,Footprints,MoreHorizontal} from 'lucide-react';
import TouchAction from './TouchAction';
import {PurchaseSteps} from './PurchaseJourney';
import type {Shopping} from './state';
import {travelLabels} from './upgrades';

export default function MobileMapJourney({a,active,availableHeight,onInset}:{a:Shopping;active:boolean;availableHeight:number;onInset:(height:number)=>void}){
 const root=useRef<HTMLElement>(null),p=a.activePurchase;
 const hidden=availableHeight<160,compact=availableHeight<270;
 useLayoutEffect(()=>{
  const panel=root.current;
  if(!panel||!active){onInset(104);return;}
  const header=panel.closest('[data-map-panel]')?.querySelector<HTMLElement>('.map-topbar');
  const measure=()=>{panel.style.top=`${Math.ceil((header?.getBoundingClientRect().bottom??96)+8)}px`;onInset(Math.ceil(panel.getBoundingClientRect().bottom+8));};
  measure();const observer=new ResizeObserver(measure);observer.observe(panel);if(header)observer.observe(header);
  return()=>observer.disconnect();
 },[active,availableHeight,hidden,compact,p?.stage,onInset]);
 if(!p||!a.selected||hidden)return null;
 const open=()=>a.setOverlay('journey');
 const main=p.stage==='ready'&&a.agentAlternatives.active?{label:'جایگزین‌ها',action:open}:p.stage==='ready'?{label:a.needsSafetyReview?'بررسی و حرکت':'بزن بریم',action:a.needsSafetyReview?open:()=>a.actOnPurchase('start')}
  :p.stage==='en_route'?{label:'رسیدم به فروشگاه',action:()=>a.actOnPurchase('arrive')}
  :p.stage==='arrived'?{label:'خریدم؛ خرید انجام شد',action:()=>a.actOnPurchase('purchased')}
  :p.stage==='problem'?{label:'جایگزین‌ها',action:open}:{label:'خرید تازه',action:a.newConversation};
 const Mode={walking:Footprints,driving:Car,cycling:Bike,manual:Clock}[a.travelMode];
 return <section ref={root} className="mobile-map-journey" aria-label="مراحل خرید روی نقشه" data-mobile-journey data-purchase-stage={p.stage}>
  <PurchaseSteps a={a}/>
  {!compact&&<>{p.stage==='done'&&<p role="status">{p.result==='purchased'?'خریدت انجام شد؛ این خرید تمام است':p.result==='later'?'برای مراجعهٔ بعد ذخیره شد':'بدون ثبت خرید؛ این مراجعه تمام شد'}</p>}
   <div className="mobile-journey-actions">
    <TouchAction className="primary-action" disabled={a.busy} action={main.action}>{main.label}</TouchAction>
    {['ready','en_route'].includes(p.stage)?<TouchAction className="secondary-action" aria-label="وسیله و زمان حرکت" title="تغییر وسیله، زمان حرکت و جزئیات مسیر" action={()=>a.setOverlay('travel')}><Mode size={16}/><span>{travelLabels[a.travelMode]}</span></TouchAction>:<TouchAction className="secondary-action" action={open}>{p.stage==='arrived'?'مشکلی بود؟':'جزئیات'}</TouchAction>}
    <TouchAction className="icon-button" aria-label="جزئیات این مرحله" title="جزئیات، استعلام و گزینه‌های همین مرحله" action={open}><MoreHorizontal size={19}/></TouchAction>
   </div>
  </>}
 </section>;
}
