import {MessageSquareMore} from 'lucide-react';
import type {Shopping} from './state';
import Hint from './Hint';
import {replyPlan,type ReplyAction,type ReplyContext,type ReplyPanel} from './replySuggestions';

export function replyContext(a:Shopping):ReplyContext{return {
  screen:a.screen,topic:a.need?.topic_query??a.product?.persian_title??(a.screen==='decide'?'':a.query),questionCode:a.questionCode||(a.need?.budget_needs_input?'budget':''),
  lastQuestion:a.thread.filter(m=>m.role==='assistant'&&m.kind!=='action').at(-1)?.text??'',
  history:a.messages.filter(m=>m.role==='user').map(m=>m.content).join(' '),budget:a.filters.max,
  appliedFields:Object.entries(a.need?.source_filters??{}).filter(([,v])=>v!==null).map(([key])=>({colour:'رنگ',size:'سایز',connector:'درگاه'} as Record<string,string>)[key]!),needsLocation:a.needsLocation,selected:!!a.selected,openOnly:a.filters.open,
  batteryStatus:a.need?.battery_requirement.status??'unspecified',pending:a.need?.pending_requirements.map(r=>r.key)??[],completed:!!a.completedVisit,hasResults:!!a.products.length,
};}
export function runReply(a:Shopping,action:ReplyAction,onOpen:(panel:ReplyPanel)=>void){
  if(action.kind==='panel'){onOpen(action.panel);return;}
  a.setOverlay(null);
  if(action.kind==='message')a.ask(action.text);
  else if(action.kind==='budget')a.applySuggestedBudget(action.value);
  else if(action.kind==='overlay')a.setOverlay(action.overlay);
  else if(action.kind==='map')a.beginPick();
  else if(action.kind==='gps')a.locate();
  else if(action.kind==='finish')a.finishTrip();
}
export function RepliesTrigger({onOpen}:{onOpen:(panel:ReplyPanel)=>void}){return <button type="button" className="replies-trigger" aria-label="پاسخ‌های آماده" aria-haspopup="dialog" onClick={()=>onOpen('suggestions')}><MessageSquareMore size={17}/><span>پاسخ آماده</span></button>;}
export default function QuickReplies({a,onOpen}:{a:Shopping;onOpen:(panel:ReplyPanel)=>void}){
  if(a.busy||a.needsLocation||!a.thread.length||a.screen==='home')return null;
  const plan=replyPlan(replyContext(a));if(!plan.primary.length)return null;
  return <div className="suggestions-strip"><div className="quick-replies" role="group" aria-label="پیشنهادهای ادامهٔ گفت‌وگو">{plan.primary.map(action=><button type="button" key={action.id} onClick={()=>runReply(a,action,onOpen)}>{action.label}</button>)}</div><Hint text="پاسخ‌های آمادهٔ بیشتر؛ فقط اطلاعات مرتبط با همین مرحلهٔ خرید"><button type="button" className="replies-more icon-button" aria-label="پاسخ‌های آماده" aria-haspopup="dialog" onClick={()=>onOpen('suggestions')}><MessageSquareMore size={18}/></button></Hint></div>;
}
