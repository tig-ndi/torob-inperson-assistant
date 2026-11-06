import {useLayoutEffect,useRef} from 'react';
import {ArrowRight,ArrowUp,MapPin,MessageSquareMore,Mic,Route,Sparkles,Square} from 'lucide-react';
import type {Shopping} from './state';
import {replyContext,runReply} from './QuickReplies';
import {replyPlan,type ReplyAction,type ReplyPanel} from './replySuggestions';
import TouchAction from './TouchAction';

type Props={a:Shopping;draft:string;onDraft:(text:string)=>void;onSubmit:()=>void;onOpen:(panel:ReplyPanel)=>void;journey:boolean;compactJourney:boolean;hint:string|null;onInset:(height:number)=>void};
export default function MobileMapHeader({a,draft,onDraft,onSubmit,onOpen,journey,compactJourney,hint,onInset}:Props){
 const root=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const el=root.current;if(!el)return;
  const measure=()=>onInset(Math.ceil(el.getBoundingClientRect().bottom+8));
  measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
 },[onInset]);
 const plan=replyPlan(replyContext(a));
 const initial:ReplyAction[]=[{id:'phone',label:'گوشی',kind:'message',text:'گوشی می‌خواهم'},{id:'shoe',label:'کفش',kind:'message',text:'کفش می‌خواهم'},{id:'other',label:'کالای دیگر',kind:'panel',panel:'topic'}];
 const actions=!a.thread.length?initial:plan.primary;
 const chips=[...actions];
 if(!a.questionCode&&!a.needsLocation&&a.thread.length&&!chips.some(c=>c.kind==='panel'&&c.panel==='budget'))chips.push({id:'budget',label:'بودجه',kind:'panel',panel:'budget'});
 const submit=()=>{if(!draft.trim()||a.busy)return;root.current?.querySelector<HTMLInputElement>('input')?.blur();onSubmit();};
 return <div className="mobile-map-header map-topbar" ref={root} data-mobile-map-header>
  <form className="map-message-form" onSubmit={e=>{e.preventDefault();submit();}}>
   <Sparkles size={18} aria-hidden="true"/>
   <input aria-label="پیام به دستیار روی نقشه" placeholder="چی می‌خوای بخری؟" value={draft} onChange={e=>onDraft(e.target.value)} maxLength={1000} enterKeyHint="send" autoComplete="off" onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}}/>
   <TouchAction className="icon-button" aria-label="گفتن پیام با صدا روی نقشه" action={()=>a.openVoice(null,'record')}><Mic size={19}/></TouchAction>
   {a.busy?<TouchAction className="map-send" aria-label="توقف بررسی روی نقشه" action={a.stop}><Square size={16} fill="currentColor"/></TouchAction>:<TouchAction className="map-send" aria-label="ارسال پیام روی نقشه" disabled={!draft.trim()} action={submit}><ArrowUp size={20}/></TouchAction>}
  </form>
  <div className="map-header-tools">
   <TouchAction className="map-location-shortcut" data-map-initial-focus aria-label="موقعیت جست‌وجو" action={()=>a.setOverlay('location')}><MapPin size={15}/><span>{a.picking?'روی محل موردنظر بزن':a.position?.label??'انتخاب موقعیت'}</span></TouchAction>
   <TouchAction className="map-ready-replies" aria-label="پاسخ‌های آماده" aria-haspopup="dialog" disabled={a.busy} action={()=>onOpen('suggestions')}><MessageSquareMore size={18}/></TouchAction>
   <TouchAction className="map-return-chat" aria-label="بازگشت به گفت‌وگو" action={()=>{a.setPicking(false);a.setMapMode('closed');}}><ArrowRight size={17}/><span>گفت‌وگو</span></TouchAction>
   {journey&&compactJourney&&<TouchAction className="map-ready-replies" aria-label="ادامهٔ مراحل خرید" title="جزئیات و ادامهٔ همین خرید" action={()=>a.setOverlay('journey')}><Route size={18}/></TouchAction>}
  </div>
  {a.picking?<p className="map-header-hint">نقشه را جابه‌جا کن و روی نقطهٔ شروع بزن.</p>:journey?<p className="map-header-hint">{hint}</p>:<div className="map-prompt-chips" role="group" aria-label="پیشنهادهای خرید روی نقشه">{chips.slice(0,4).map(action=><button type="button" key={action.id} disabled={a.busy} onClick={()=>runReply(a,action,onOpen)}>{action.label}</button>)}{!a.questionCode&&!a.needsLocation&&!!a.thread.length&&<button type="button" onClick={()=>a.setOverlay('filters')}>شرایط خرید</button>}</div>}
 </div>;
}
