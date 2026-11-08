import {useRef,useEffect,useState} from 'react';
import {ArrowUpLeft,Bookmark,History,Trash2} from 'lucide-react';
import type {Shopping} from './state';
import type {SavedTrip} from './data';
import {date,fa} from './data';
import * as api from './client';
import Hint from './Hint';

export default function HistoryPanel({a}:{a:Shopping}){
  const [pending,setPending]=useState<SavedTrip|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const cancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(pending)cancel.current?.focus();},[pending]);
  const remove=async()=>{if(!pending)return;setBusy(true);setError(null);try{await api.removeTrip(pending.id);a.setSaved(old=>old.filter(t=>t.id!==pending.id));setPending(null);a.flash('برنامهٔ خرید حذف شد');}catch(e){setError(e instanceof Error?e.message:'حذف انجام نشد.');}finally{setBusy(false);}};
  if(pending)return <section role="alertdialog" data-navigation-confirm aria-label="تأیید حذف برنامهٔ خرید" className="history-confirm"><span className="history-confirm-icon"><Trash2 size={25}/></span><h3>این برنامهٔ خرید حذف شود؟</h3><p>برنامهٔ «{pending.product_name}» از «{pending.shop_name}» حذف می‌شود. این کار قابل بازگردانی نیست.</p>{error&&<p role="alert">{error}</p>}<div className="inline-actions"><button data-navigation-dismiss ref={cancel} className="secondary-action" disabled={busy} onClick={()=>setPending(null)}>انصراف، نگهش دار</button><button className="primary-action" disabled={busy} onClick={()=>void remove()}>{busy?'در حال حذف…':'بله، حذف برنامه'}</button></div></section>;
  return <div className="history-panel"><section><h3><Bookmark size={18}/>برنامه‌های ذخیره‌شده <span>{fa(a.saved.length)}</span></h3>{!a.saved.length&&<p className="history-empty">هنوز برنامه‌ای ذخیره نکرده‌ای. پس از انتخاب فروشگاه، برنامهٔ ذخیره‌شده را همین‌جا نگه می‌داریم.</p>}{a.saved.map(t=><div className="history-item" key={t.id} data-trip={t.id}><button onClick={()=>a.restore(t)}><b>{t.product_name}</b><span>{t.shop_name} · {date(t.created_at)}</span></button><Hint text="حذف برنامهٔ ذخیره‌شده؛ پیش از حذف از تو تأیید می‌گیریم"><button className="icon-button" aria-label={'حذف برنامه '+t.shop_name} onClick={()=>setPending(t)}><Trash2 size={18}/></button></Hint></div>)}</section><section><h3><History size={18}/>نتایج قبلی این گفت‌وگو <span>{fa(a.recentResults.length)}</span></h3>{!a.recentResults.length&&<p className="history-empty">نتایج جست‌وجوهای همین نشست اینجا می‌مانند؛ بدون گم‌کردن گفت‌وگو می‌توانی برگردی.</p>}{a.recentResults.map(r=><button key={r.id} className="history-result" data-result={r.id} onClick={()=>a.restoreResult(r)}><div><b>{r.query}</b><span>{fa(r.page.items.length)} محصول بررسی‌شده · {date(r.createdAt)}</span></div><ArrowUpLeft size={18}/></button>)}</section></div>;
}
