import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowRight,Check,MapPin,MessageSquare,SlidersHorizontal,Wallet} from 'lucide-react';
import type {Shopping} from './state';
import {digits,fa,money} from './data';
import {replyContext,runReply} from './QuickReplies';
import {budgetPresets,replyPlan,type ReplyPanel} from './replySuggestions';

export default function QuickReplySheet({a,panel,onOpen}:{a:Shopping;panel:ReplyPanel;onOpen:(panel:ReplyPanel)=>void}){
  const [value,setValue]=useState(panel==='budget'?a.filters.max:panel==='topic'?(a.need?.topic_query??a.product?.persian_title??(a.screen==='decide'?'':a.query)).slice(0,120):''),[error,setError]=useState('');
  const [selected,setSelected]=useState<string[]>([]),input=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{input.current?.focus({preventScroll:true});},[panel]);
  const context=replyContext(a),plan=replyPlan(context);
  if(panel==='suggestions'){
    const actions=[...new Map([...plan.primary,...plan.more].map(action=>[action.id,action])).values()];
    return <div className="reply-sheet"><p className="reply-intro">{plan.hint}</p><div className="reply-options">{actions.map(action=>{const Icon=action.kind==='budget'||action.kind==='panel'&&action.panel==='budget'?Wallet:action.kind==='map'||action.kind==='gps'||action.kind==='overlay'&&action.overlay==='location'?MapPin:action.kind==='message'?MessageSquare:SlidersHorizontal;return <button type="button" key={action.id} onClick={()=>runReply(a,action,onOpen)}><Icon size={18} aria-hidden="true"/><span>{action.label}</span><ArrowRight size={15} aria-hidden="true"/></button>;})}</div>{!actions.length&&<button className="secondary-action" onClick={()=>onOpen('topic')}>کالای موردنظرم را می‌نویسم</button>}</div>;
  }
  const editableRequirements=[...new Map([...(a.need?.pending_requirements??[]),...(context.appliedFields??[]).map(key=>({key}))].map(item=>[item.key,item])).values()];
  const presets=budgetPresets(context.topic);
  const apply=(max:string)=>{
    if(max&&(!/^\d{1,19}$/.test(max)||BigInt(max)>9223372036854775807n)){setError('مبلغ را به تومان و به‌صورت عدد صحیح وارد کن.');return;}
    if(max&&a.filters.min&&BigInt(max)<BigInt(a.filters.min)){setError(`حداقل قیمت فعلی ${money(a.filters.min)} تومان است؛ سقف نمی‌تواند از آن کمتر باشد.`);return;}
    a.applySuggestedBudget(max);
  };
  const submit=()=>{
    setError('');
    if(panel==='budget'){if(!value){setError('سقف بودجه را انتخاب یا وارد کن.');return;}apply(value);}
    else if(panel==='topic'){if(!value.trim()){setError('نام کالا یا مدل را بنویس.');return;}a.setOverlay(null);a.ask(value.trim());}
    else if(panel==='battery'){if(!/^\d{1,7}$/.test(value)||BigInt(value)>1000000n){setError('حداقل ظرفیت معتبر را به میلی‌آمپرساعت وارد کن.');return;}a.setOverlay(null);a.ask(`حداقل ${value} میلی‌آمپرساعت`);}
    else if(panel==='requirements'){a.setOverlay(null);a.ask(selected.map(key=>`${key} را حذف کن`).join('؛ '));}
  };
  return <form className="reply-sheet" onSubmit={event=>{event.preventDefault();submit();}}>
    {panel==='budget'?<><p className="reply-intro">فقط سقف بودجهٔ همین خرید تغییر می‌کند؛ موقعیت و بقیهٔ شرایط محفوظ‌اند.</p><div className="reply-presets" role="group" aria-label="بودجه‌های آماده">{presets.map(p=><button type="button" key={p.value} onClick={()=>apply(p.value)}>{p.label}</button>)}</div><label className="live-label">سقف بودجه (تومان)<input data-reply-focus ref={input} aria-label="سقف بودجه (تومان)" aria-describedby="reply-budget-hint" value={value} inputMode="numeric" maxLength={25} placeholder="مثلاً ۳۰۰۰۰۰۰" onChange={e=>{setValue(digits(e.target.value));setError('');}}/></label><p id="reply-budget-hint" className="reply-hint">{value&&/^\d{1,19}$/.test(value)?`${money(value)} تومان`:'مبلغ دلخواه را به تومان وارد کن یا یکی از پیشنهادها را بزن.'}</p></>:panel==='topic'?<><p className="reply-intro">فقط نام کالا یا مدل را اصلاح کن؛ لازم نیست دوباره همهٔ شرایط را بنویسی.</p><label className="live-label">کالا یا مدل موردنظر<input data-reply-focus ref={input} aria-label="کالا یا مدل موردنظر" value={value} maxLength={120} onChange={e=>setValue(e.target.value)} placeholder="مثلاً شارژر موبایل"/></label></>:panel==='battery'?<><p className="reply-intro">حداقل ظرفیت ثبت‌شده را مشخص کن؛ این مقدار تضمین دوام واقعی باتری نیست.</p><label className="live-label">حداقل ظرفیت (میلی‌آمپرساعت)<input data-reply-focus ref={input} inputMode="numeric" aria-label="حداقل ظرفیت (میلی‌آمپرساعت)" maxLength={7} value={value} onChange={e=>setValue(digits(e.target.value))}/></label></>:<><p className="reply-intro">فقط شرط‌هایی را انتخاب کن که می‌خواهی کنار بگذاری؛ بقیه باقی می‌مانند.</p><div className="reply-requirements">{editableRequirements.map(requirement=><label key={requirement.key}><input type="checkbox" checked={selected.includes(requirement.key)} onChange={e=>setSelected(old=>e.target.checked?[...old,requirement.key]:old.filter(k=>k!==requirement.key))}/><span>{requirement.key}</span></label>)}</div></>}
    {error&&<p role="alert" className="reply-error">{error}</p>}
    <button type="submit" className="primary-action" disabled={a.busy||panel==='requirements'&&!selected.length}><Check size={17}/>{panel==='requirements'?`ادامه بدون ${fa(selected.length)} شرط انتخاب‌شده`:'تأیید و ادامهٔ همین خرید'}</button>
    {panel==='budget'&&<button type="button" className="reply-skip" onClick={()=>apply('')}>بدون سقف بودجه ادامه بده</button>}
    {panel==='battery'&&<button type="button" className="reply-skip" onClick={()=>{a.setOverlay(null);a.ask('ظرفیت باتری مهم نیست');}}>بدون حداقل ظرفیت ادامه بده</button>}
  </form>;
}
