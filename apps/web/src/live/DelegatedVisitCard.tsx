import {Bookmark,Check,MapPin,Navigation,RotateCcw,X} from 'lucide-react';
import type {Shopping} from './state';
import {ArrivalFacts,SafetyGate} from './VisitDecision';
import {money,fa} from './data';
import {travelLabels} from './upgrades';
import Hint from './Hint';

export default function DelegatedVisitCard({a}:{a:Shopping}){
 const task=a.delegation;if(!task)return null;
 const planned=task.status==='planned'&&a.selected?.offer_id===task.offerId;
 const route=a.roadRoutes.find(r=>r.offer_id===task.offerId);
 const waiting=a.busy||a.candidateBusy||a.arrivalBusy||a.roadBusy;
 const saved=a.saved.some(t=>t.offer_id===task.offerId);

 return <section className="delegated-visit" aria-label="انتخاب و برنامهٔ خودکار" data-delegated-status={task.status}>
  <header><Navigation size={19}/><b>{planned?'مقصد و برنامهٔ رفتن آماده است':'انتخاب و برنامهٔ رفتن با من'}</b><Hint text="لغو انتخاب خودکار؛ گفت‌وگو و نتایج قبلی باقی می‌مانند"><button className="icon-button" aria-label="لغو انتخاب خودکار" onClick={a.cancelDelegation}><X size={17}/></button></Hint></header>
  {planned&&a.selected?<>
   <h3><Check size={17}/>{a.selected.shop.name}</h3><p>{a.product?.persian_title}</p><p>{money(a.selected.price_toman)} تومان · {travelLabels[a.travelMode]}{route?` · حدود ${fa(Math.max(1,Math.ceil(route.duration_seconds/60)))} دقیقه`:''}</p>
   <small>موجودی هنوز تأیید نشده است؛ پیش از حرکت بررسی کن.</small><SafetyGate a={a}/>
   <div className="inline-actions"><button className="primary-action" onClick={()=>a.showOffer(a.selected!)}><MapPin size={17}/>{route?'مسیر همین انتخاب':'همین مقصد روی نقشه'}</button><button className="secondary-action" onClick={()=>a.ask('یک فروشگاه دیگر انتخاب کن')}>گزینهٔ دیگر</button></div>
   <details><summary>جزئیات برنامه و قدم بعدی</summary><ArrivalFacts a={a} o={a.selected}/><small>{task.note}</small><p>{a.selected.shop.address??'آدرس متنی ثبت نشده است.'}</p><div className="inline-actions"><button className="secondary-action" onClick={()=>a.setOverlay('nav')}>شروع مسیریابی</button><button className="secondary-action" onClick={()=>a.setOverlay('travel')}>وسیله و زمان حرکت</button><button className="secondary-action" onClick={()=>a.setOverlay('checks')}>استعلام آزمایشی</button><button className="secondary-action" disabled={a.busy||saved||a.needsSafetyReview} onClick={a.saveCurrentPlan}><Bookmark size={16}/>{saved?'برنامه ذخیره شده':a.busy?'در حال ذخیره…':'ذخیرهٔ برنامه'}</button><button className="secondary-action" onClick={a.finishTrip}>پایان این خرید</button></div></details>
  </>:task.status==='blocked'?<><p role="status">{task.note}</p><div className="inline-actions"><button className="primary-action" onClick={()=>a.setOverlay('travel')}>تغییر روش یا زمان</button><button className="secondary-action" onClick={a.retryDelegation}><RotateCcw size={16}/>بررسی دوباره</button></div></>:<>
   <p role="status">{task.phoneKind==='ask'?'فقط نوع گوشی را مشخص کن؛ انتخاب فروشگاه و برنامهٔ رفتن را ادامه می‌دهم.':a.needsLocation?'نقطهٔ شروع را مشخص کن؛ درخواستت محفوظ است.':a.need?.pending_requirements.length?'شرط باقی‌مانده را مشخص کنیم؛ بعد انتخاب را ادامه می‌دهم.':waiting?'دارم مقصدها، مسیر و فرصت خرید هنگام رسیدن را بررسی می‌کنم.':'مقصد را با بودجه و روش رفتنت انتخاب می‌کنم.'}</p>
   {!a.roadConsent&&task.phoneKind!=='ask'&&!a.needsLocation&&!a.busy&&!a.need?.pending_requirements.length&&!!a.products.length&&<div className="delegated-consent"><p>برای مقایسهٔ مسیر تا ۳ مقصد نزدیک، مختصات نقطهٔ شروع و فروشگاه‌ها به سرویس عمومی FOSSGIS فرستاده می‌شود؛ ترافیک زنده ندارد.</p><button className="primary-action" onClick={()=>a.setRoadConsent(true)}>اجازهٔ مسیر و ادامهٔ انتخاب خودکار</button></div>}
  </>}
 </section>;
}
