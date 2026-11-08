import Time24Field from './Time24Field';
import { useEffect, useState } from 'react';
import { Btn, Check2, Seg, Slider } from '../prototype/ui';
import { digits, fa, type Filters, type Offer, type Report } from './data';
import { tehranDistricts } from '../tehranNeighborhoods';
import { useVoiceRecorder } from '../app/voice/useVoiceRecorder';
import type { Shopping } from './state';
import { ErrorBox, Note, OfferCard } from './screens';
import * as api from './client';
import {BudgetRange,RouteDirections} from './RoadUI';
import {useTehranClock} from './useTehranClock';
import {createFilterDraft,resetFilterDraft,filterDraftError} from './filterDraft';
import {SafetyGate,ArrivalFacts} from './VisitDecision';
import {neshanLink,baladLink} from '../app/screens/b/model';
import {googleNavigation} from './navigationLinks';
import {PurchaseDownload} from './PurchaseJourney';

export function FilterSheet({a}:{a:Shopping}){
  const now=useTehranClock();
  const [draft,setDraft]=useState(()=>createFilterDraft(a.filters,a.visitIntent?.localTime??null));
  const [error,setError]=useState<string|null>(null),f=draft.filters;
  const setF=(update:(filters:Filters)=>Filters)=>setDraft(old=>({...old,filters:update(old.filters)}));
  const toggle=(k:'open'|'credit'|'pay'|'kala'|'fast'|'withinRadius')=>setF(v=>({...v,[k]:!v[k],...(k==='pay'?{kala:false}:k==='kala'?{pay:false}:{})}));
  const apply=()=>{
    const problem=filterDraftError(draft,!!a.position);setError(problem);if(problem)return;
    if(draft.clockChanged)a.setVisitTime(draft.clock);
    a.applyFilters(f);
  };
  return <div className="filter-sheet">
    <div className="filter-sheet-body space-y-4">
      <BudgetRange a={a} value={f.max} onChange={max=>setF(v=>({...v,max}))}/>
      <div className="live-label"><span>زمان مراجعه · ۲۴ ساعته</span><Time24Field label="ساعت مراجعه" describedBy="visit-time-hint" value={draft.clock??now} onChange={clock=>setDraft(v=>({...v,clock,clockChanged:true}))}/></div>
      <p id="visit-time-hint" className="upgrade-note">{draft.clock?'زمان انتخابی تهران؛ با اعمال فیلترها ثبت می‌شود.':'ساعت فعلی تهران؛ تغییر ساعت اختیاری است.'}</p>
      <Btn kind="ghost" onClick={()=>setDraft(v=>({...v,clock:null,clockChanged:true}))}>بررسی برای همین الان</Btn>
      <div className="grid grid-cols-2 gap-3">{(['min','max'] as const).map(k=><label className="live-label" key={k}>{k==='min'?'حداقل':'حداکثر'} قیمت (تومان)<input className="live-input" inputMode="numeric" value={f[k]} placeholder="بدون محدودیت" onChange={e=>setF(v=>({...v,[k]:digits(e.target.value)}))}/></label>)}</div>
      <Check2 on={f.withinRadius} onClick={()=>toggle('withinRadius')} label="فقط در محدودهٔ انتخابی"/>
      <div className="flex justify-between text-sm"><span>شعاع جست‌وجو</span><b>{fa(f.radius)} کیلومتر</b></div>
      <Slider value={f.radius} min={1} max={50} step={1} onChange={radius=>setF(v=>({...v,radius}))} label="شعاع جست‌وجو"/>
      <Note>برای محدودکردن فاصله، موقعیت لازم است. فیلترهای زیر روی پیشنهاد فروشگاه اعمال می‌شوند.</Note>
      {([['open',draft.clock?`باز طبق برنامه در ساعت ${fa(draft.clock)}`:'الان باز طبق برنامه'],['credit','فقط اعتبار حضوری'],['pay','ترب‌پی حضوری'],['fast','ارسال فوری ثبت‌شده'],['kala','کالابرگ']] as const).map(([k,label])=><Check2 key={k} on={f[k]} onClick={()=>toggle(k)} label={label}/>)}
      <Note>کالابرگ در دیتاست فعلی ثبت نشده است. اطلاعات نامشخص، مطابق فیلتر فرض نمی‌شود.</Note>
    </div>
    <footer className="filter-sheet-actions">{error&&<p role="alert" className="reply-error">{error}</p>}<div><Btn full onClick={apply}>اعمال فیلترها</Btn><Btn full kind="ghost" onClick={()=>{setDraft(resetFilterDraft());setError(null);}}>پاک‌کردن فیلترها</Btn></div></footer>
  </div>;
}
export function LocationSheet({a,onPickMap}:{a:Shopping;onPickMap:()=>void}){
  const [lat,setLat]=useState(''),[lon,setLon]=useState(''),[error,setError]=useState<string|null>(null);
  const manual=()=>{const latitude=Number(digits(lat)),longitude=Number(digits(lon));if(!lat||!lon||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){setError('عرض و طول جغرافیایی معتبر وارد کنید.');return;}a.setPosition({lat:latitude,lon:longitude,label:'موقعیت دستی',source:'manual',accuracyMeters:null});a.setOverlay(null);};
  return <div className="space-y-4"><Btn full onClick={a.locate}>دریافت موقعیت من</Btn><Btn full kind="secondary" onClick={onPickMap}>انتخاب نقطه روی نقشه</Btn><label className="live-label">محلهٔ تهران (مرکز تقریبی)<select className="live-input" value="" onChange={e=>{const d=tehranDistricts.find(x=>x.id===e.target.value);if(d){a.setPosition({...d,source:'manual',accuracyMeters:null});a.setOverlay(null);}}}><option value="" disabled>محله را انتخاب کنید</option>{tehranDistricts.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label><Note>نقشه شامل سراسر ایران است. فروشگاه‌های دیتاست کنونی فقط در تهران ثبت شده‌اند.</Note><div className="grid grid-cols-2 gap-2"><label className="live-label">عرض جغرافیایی<input className="live-input" inputMode="decimal" value={lat} onChange={e=>setLat(e.target.value)}/></label><label className="live-label">طول جغرافیایی<input className="live-input" inputMode="decimal" value={lon} onChange={e=>setLon(e.target.value)}/></label></div>{error&&<ErrorBox message={error}/>}<Btn full kind="secondary" onClick={manual}>اعمال مختصات</Btn>{a.position&&<Btn full kind="ghost" onClick={()=>{a.setPosition(null);a.applyFilters({...a.filters,withinRadius:false,sort:'price'});a.setOverlay(null);}}>حذف موقعیت این نشست</Btn>}</div>;
}
export function AlternativesSheet({a}:{a:Shopping}){
  const [origin]=useState(a.selected);
  const [source,setSource]=useState<Report['source']>('simulated'),[outcome,setOutcome]=useState<'closed'|'no_answer'|'out_of_stock'>('no_answer');
  const [items,setItems]=useState<Offer[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  useEffect(()=>{if(!origin)return;const c=new AbortController();setError(null);setBusy(true);if(!offset)setItems([]);api.alternatives(origin,a.filters,a.position,outcome,source,c.signal,offset,a.visitIntent?.localTime??null).then(r=>{if(c.signal.aborted)return;setItems(old=>offset?[...old,...r.alternatives.items]:r.alternatives.items);setMore(r.alternatives.has_more);a.rememberOffers(r.alternatives.items);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[origin?.offer_id,a.filters,a.position,outcome,source,offset,retry,a.visitIntent?.localTime]);
  return <div className="space-y-3"><Note>فروشگاه فعلی با تمام پیشنهادهایش کنار گذاشته می‌شود. شرایط بودجه، فاصله و پرداخت حفظ می‌شوند.</Note><Seg value={source} onChange={v=>{setSource(v);setOffset(0);}} items={[["simulated","شبیه‌سازی"],["user_report","گزارش من"]]}/><label className="live-label">دلیل جست‌وجوی جایگزین<select className="live-input" value={outcome} onChange={e=>{setOutcome(e.target.value as typeof outcome);setOffset(0);}}><option value="no_answer">بی‌پاسخ</option><option value="closed">بسته</option><option value="out_of_stock">ناموجود</option></select></label>{error&&<ErrorBox message={error} retry={()=>setRetry(v=>v+1)}/>} {items.map(o=><OfferCard key={o.offer_id} a={a} o={o} compact/>)}{busy?<Note>در حال دریافت جایگزین‌ها…</Note>:!items.length&&!error?<Note>فروشگاه جایگزینی با شرایط فعلی پیدا نشد.</Note>:null}{more&&!busy&&<Btn full kind="secondary" onClick={()=>setOffset(items.length)}>جایگزین‌های بیشتر</Btn>}</div>;
}
export function NavigationSheet({a}:{a:Shopping}){
 const o=a.selected;if(!o)return null;const s=o.shop,destination=s.lat!=null&&s.lon!=null?{lat:s.lat,lon:s.lon}:null;
 const google=googleNavigation(a.position,destination,s.address,a.travelMode),neshan=neshanLink(o),balad=baladLink(o);
 return <div className="space-y-3 navigator-panel"><b>{s.name}</b><p>{s.address??'آدرس ثبت نشده'}</p><Note>مبدأ: {a.position?.label??'موقعیت فعلی در مسیریاب'} · روش رفتن: {a.travelMode==='manual'?'در مسیریاب انتخاب کن':({walking:'پیاده',driving:'خودرو',cycling:'دوچرخه'} as const)[a.travelMode]}</Note>
  {a.needsSafetyReview&&<><SafetyGate a={a}/><ArrivalFacts a={a} o={o} controls/></>}
  {google&&<a className="live-link" href={google} target="_blank" rel="noopener noreferrer">بازکردن در Google Maps</a>}
  {neshan&&<a className="live-link secondary" href={neshan} target="_blank" rel="noopener noreferrer">بازکردن مقصد در نشان</a>}
  {balad&&<a className="live-link secondary" href={balad} target="_blank" rel="noopener noreferrer">بازکردن مقصد در بلد</a>}
  {destination&&<><a className="live-link secondary" href={`https://neshan.org/maps/share/${s.lat},${s.lon}`} target="_blank" rel="noopener noreferrer">نمایش نشان در مرورگر</a><a className="live-link secondary" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`} target="_blank" rel="noopener noreferrer">نمایش مقصد در OpenStreetMap</a></>}
  <Note>Google Maps مبدأ ثبت‌شده، مقصد و روش رفتن را می‌گیرد. لینک نشان و بلد مقصد را باز می‌کند؛ مبدأ را داخل آن‌ها بررسی کن. هر مسیریاب مسیر خودش را محاسبه می‌کند؛ شروع حرکت را همان‌جا تأیید کن.</Note>
  {!google&&<Note>آدرس و مختصات مقصد ثبت نشده است.</Note>}
 </div>;
}
export function DirectionsSheet({a}:{a:Shopping}){const route=a.roadRoutes.find(r=>r.offer_id===a.selected?.offer_id);return route?<RouteDirections route={route} expanded/>:<Note>مسیر خیابانی آماده نیست؛ از «وسیله و زمان حرکت» آن را دریافت کن.</Note>;}
export function ShopsSheet({a}:{a:Shopping}){return <div className="space-y-3"><Note>فروشگاه‌های همین محصول؛ قیمت و موجودی ثبت‌شده‌اند.</Note>{a.offers.map(o=><OfferCard key={o.offer_id} a={a} o={o} compact/>)}{a.hasMore&&<Btn full disabled={a.busy} onClick={a.moreOffers}>فروشگاه‌های بیشتر</Btn>}</div>;}
export function PlanSheet({a}:{a:Shopping}){const o=a.selected;if(!o)return null;return <div className="space-y-3"><b>{a.knownProducts[o.product_id]?.persian_title??a.product?.persian_title}</b><p>{o.shop.name}</p><p>{o.shop.address??'آدرس ثبت نشده'}</p><PurchaseDownload a={a}/><SafetyGate a={a}/><Btn full disabled={a.busy||a.needsSafetyReview||a.saved.some(t=>t.offer_id===o.offer_id)} onClick={a.saveCurrentPlan}>{a.saved.some(t=>t.offer_id===o.offer_id)?'برنامه ذخیره شده':'ذخیرهٔ برنامه'}</Btn><Note>تصویر دانلودشده بدون اینترنت هم قابل مشاهده است؛ قیمت و موجودی واقعی باید بررسی شود.</Note></div>;}
export function PostponeSheet({a}:{a:Shopping}){return <div className="space-y-3"><p>مقصد را برای فرصتی دیگر نگه داریم؟</p><Btn full disabled={a.busy} onClick={()=>a.actOnPurchase('later')}>{a.busy?'در حال ذخیره…':'ذخیره و ادامه در فرصتی دیگر'}</Btn><Note>برنامه از بخش «برنامه‌ها و نتایج قبلی» قابل دسترسی خواهد بود.</Note></div>;}
export function VoiceSheet({onText}:{onText:(s:string)=>void}){const [ready,setReady]=useState(false),[status,setStatus]=useState('در حال بررسی سرویس صوت…');const recorder=useVoiceRecorder(onText);useEffect(()=>{const c=new AbortController();api.request('/api/voice/status',c.signal).then(v=>{const r=typeof v==='object'&&v!==null&&'ready'in v&&v.ready===true;setReady(r);setStatus(r?'صدایت پس از توقف ضبط برای تبدیل به متن ارسال می‌شود.':'سرویس صوت نیاز به تنظیم جداگانهٔ AvalAI دارد. می‌توانی جست‌وجو را تایپ کنی.');}).catch(()=>{if(!c.signal.aborted)setStatus('وضعیت سرویس صوت دریافت نشد.');});return()=>c.abort();},[]);return <div className="space-y-4"><Note>{status}</Note>{recorder.error&&<ErrorBox message={recorder.error}/>}<p>{recorder.state==='recording'?`در حال ضبط · ${fa(recorder.duration)} ثانیه`:recorder.state==='transcribing'?'در حال تبدیل به متن…':''}</p><Btn full disabled={!ready||!recorder.isSupported||['requesting','transcribing'].includes(recorder.state)} onClick={()=>recorder.state==='recording'?void recorder.stopRecording():void recorder.startRecording()}>{recorder.state==='recording'?'توقف و تبدیل به متن':'شروع ضبط'}</Btn><Note>متن دریافت‌شده در کادر جست‌وجو قرار می‌گیرد؛ ارسال جست‌وجو با خودت است.</Note></div>;}
