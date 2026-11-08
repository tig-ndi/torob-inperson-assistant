import PurchaseJourney from './PurchaseJourney';
import {Navigation,RotateCcw,X} from 'lucide-react';
import type {Shopping} from './state';
import Hint from './Hint';

export default function DelegatedVisitCard({a}:{a:Shopping}){
 const task=a.delegation;if(!task)return null;
 const planned=task.status==='planned'&&a.selected?.offer_id===task.offerId;
 const waiting=a.busy||a.candidateBusy||a.arrivalBusy||a.roadBusy;

 return <section className="delegated-visit" aria-label="انتخاب و برنامهٔ خودکار" data-delegated-status={task.status}>
  <header><Navigation size={19}/><b>{planned?'مقصد و برنامهٔ ذخیره‌شده آماده است':'انتخاب و برنامهٔ ذخیره‌شده با من'}</b><Hint text="لغو انتخاب خودکار؛ گفت‌وگو و نتایج قبلی باقی می‌مانند"><button className="icon-button" aria-label="لغو انتخاب خودکار" onClick={a.cancelDelegation}><X size={17}/></button></Hint></header>
  {planned&&a.selected?<PurchaseJourney a={a}/>:task.status==='blocked'?<><p role="status">{task.note}</p><div className="inline-actions"><button className="primary-action" onClick={()=>a.setOverlay('travel')}>تغییر روش یا زمان</button><button className="secondary-action" onClick={a.retryDelegation}><RotateCcw size={16}/>بررسی دوباره</button></div></>:<>
   <p role="status">{task.phoneKind==='ask'?'فقط نوع گوشی را مشخص کن؛ انتخاب فروشگاه و برنامهٔ ذخیره‌شده را ادامه می‌دهم.':a.needsLocation?'نقطهٔ شروع را مشخص کن؛ درخواستت محفوظ است.':a.need?.pending_requirements.length?'شرط باقی‌مانده را مشخص کنیم؛ بعد انتخاب را ادامه می‌دهم.':waiting?'دارم مقصدها، مسیر و فرصت خرید هنگام رسیدن را بررسی می‌کنم.':'مقصد را با بودجه و روش رفتنت انتخاب می‌کنم.'}</p>
   {!a.roadConsent&&task.phoneKind!=='ask'&&!a.needsLocation&&!a.busy&&!a.need?.pending_requirements.length&&!!a.products.length&&<div className="delegated-consent"><p>برای مقایسهٔ مسیر تا ۳ مقصد نزدیک، مختصات نقطهٔ شروع و فروشگاه‌ها به سرویس عمومی FOSSGIS فرستاده می‌شود؛ ترافیک زنده ندارد.</p><button className="primary-action" onClick={()=>a.setRoadConsent(true)}>اجازهٔ مسیر و ادامهٔ انتخاب خودکار</button></div>}
  </>}
 </section>;
}
