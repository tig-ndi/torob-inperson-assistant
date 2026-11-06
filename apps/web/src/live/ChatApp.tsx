import TouchAction from './TouchAction';
import MobileMapJourney from './MobileMapJourney';
import PurchaseJourney from './PurchaseJourney';
import {Component,Suspense,lazy,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {ArrowRight,ArrowUp,Copy,History,LocateFixed,Map as MapIcon,MapPin,Mic,Plus,SlidersHorizontal,Square,SquarePen,Volume2,X,Scale,MessageSquare,MessageSquareMore} from 'lucide-react';
import {Toast} from '../prototype/ui';
import {useShopping} from './state';
import {useJourneyState,readSession,writeSession} from './session';
import {Body,ErrorBox,copyText} from './screens';
import {AlternativesSheet,FilterSheet,LocationSheet,NavigationSheet} from './overlays';
import VoicePanel from './VoicePanel';
import BrandMark from './BrandMark';
import HistoryPanel from './HistoryPanel';
import Hint from './Hint';
import ComparisonSheet from './ComparisonSheet';
import QuickReplies,{RepliesTrigger} from './QuickReplies';
import QuickReplySheet from './QuickReplySheet';
import type {ReplyPanel} from './replySuggestions';
import DelegatedVisitCard from './DelegatedVisitCard';
import ThemePicker from './ThemePicker';
import {TravelSheet,NeedSummary,AutoAlternatives} from './RoadUI';
import {ChecksSheet} from './ChecksUI';
import {travelLabels} from './upgrades';
import MobileMapSheet,{MobileViewSwitch} from './MobileMapSheet';
import {useVoiceSpeaker} from '../app/voice/useVoiceSpeaker';
import {fa,type Offer,type Screen} from './data';
import './live.css';
import './chat.css';
const RealMap=lazy(()=>import('./Map'));
class MapBoundary extends Component<{children:ReactNode;onClose:()=>void},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="map-load-state"><p>بارگذاری نقشه انجام نشد؛ می‌توانی خرید را در گفت‌وگو ادامه بدهی.</p><button className="secondary-action" onClick={this.props.onClose}>بازگشت به گفت‌وگو</button></div>:this.props.children;}
}

const TITLES:Record<Screen,string>={home:'همراه خرید حضوری',decide:'گفت‌وگو',results:'انتخاب محصول',stores:'بررسی فروشگاه‌ها',compare:'مقایسهٔ پیشنهادها',contact:'پیگیری با فروشگاه',trip:'برنامهٔ رفتن'};
const BACK:Partial<Record<Screen,Screen>>={results:'home',stores:'results',compare:'stores',contact:'stores',trip:'contact'};

export default function ChatApp(){
  const [replyPanel,setReplyPanel]=useState<ReplyPanel>('suggestions');
  const a=useShopping();const [q,setQ]=useJourneyState('draft',''),[theme,setTheme]=useJourneyState<'system'|'light'|'dark'>('theme','system');
  const [viewport,setViewport]=useState({w:innerWidth,h:visualViewport?.height??innerHeight}),[systemDark,setSystemDark]=useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [recenter,setRecenter]=useState(0),[country,setCountry]=useState(0),[spoken,setSpoken]=useState<string|null>(null),[voiceReady,setVoiceReady]=useState(false);
  const [hasOpenedMap,setHasOpenedMap]=useState(false),[mapSheetHeight,setMapSheetHeight]=useState(196),[mapJourneyInset,setMapJourneyInset]=useState(104);
  const root=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),atBottom=useRef(true);
  const speaker=useVoiceSpeaker();
  const desktop=viewport.w>=1000,dark=theme==='dark'||theme==='system'&&systemDark;
  const mapVisible=desktop||a.mapMode==='open',mapMounted=mapVisible||hasOpenedMap;
  const chatWidth=Math.min(640,Math.max(400,viewport.w*.38));
  const journeyVisible=!!a.selected&&['contact','trip'].includes(a.screen);
  const following=journeyVisible&&['en_route','arrived','done'].includes(a.activePurchase?.stage??'');
  const mapOffers=useMemo(()=>following?[a.selected!]:a.mapOffers,[following,a.selected,a.mapOffers]);
  const visibleRoutes=useMemo(()=>following?a.roadRoutes.filter(r=>r.offer_id===a.selected?.offer_id):a.roadRoutes,[following,a.selected?.offer_id,a.roadRoutes]);
  const comparedIds=useMemo(()=>new Set([...a.compare.map(o=>o.offer_id),...mapOffers.filter(o=>a.models.some(p=>p.product_id===o.product_id)).map(o=>o.offer_id)]),[a.compare,a.models,mapOffers]);
  const offerComparedIds=useMemo(()=>new Set(a.compare.map(o=>o.offer_id)),[a.compare]);
  const productNames=useMemo(()=>Object.fromEntries(Object.entries(a.knownProducts).map(([id,p])=>[id,p.persian_title??'محصول ثبت‌شده'])),[a.knownProducts]);
  const places=useMemo(()=>a.insights?.markets.map(m=>({lat:m.lat,lon:m.lon,label:m.name}))??[],[a.insights]);
  const restoredScroll=useRef(readSession('scroll',0,v=>typeof v==='number'&&Number.isFinite(v)?v:0)),restoring=useRef(a.thread.length>0);
  const navigated=useRef('');
  const navigationKey=JSON.stringify([journeyVisible?a.activePurchase?.stage:null,a.screen,a.screen==='results'?a.need?.topic_query??a.query:a.product?.product_id??null,['contact','trip'].includes(a.screen)?a.selected?.offer_id:null]);
  const openReply=(panel:ReplyPanel)=>{setReplyPanel(panel);a.setOverlay('reply');};
  const overlayTitle=a.overlay?{reply:{suggestions:'پاسخ‌های آماده',budget:'سقف بودجهٔ همین خرید',topic:'اصلاح کالای موردنظر',battery:'حداقل ظرفیت باتری',requirements:'شرط‌های همین خرید'}[replyPanel],filters:'شرایط خرید',location:'موقعیت جست‌وجو',alts:'گزینه‌های جایگزین',nav:'انتخاب مسیریاب',menu:'تنظیمات و برنامه‌ها',voice:'گفتن پیام با صدا',journey:'ادامهٔ همین خرید',history:'برنامه‌ها و نتایج قبلی',comparison:'مقایسهٔ کامل انتخاب‌ها',travel:'وسیله، مسیر و زمان رسیدن',checks:'استعلام و رزرو آزمایشی'}[a.overlay]:'';
  useEffect(()=>{if(mapVisible)setHasOpenedMap(true);},[mapVisible]);
  useEffect(()=>{const on=()=>setViewport({w:innerWidth,h:visualViewport?.height??innerHeight});const mq=matchMedia('(prefers-color-scheme: dark)'),change=(e:MediaQueryListEvent)=>setSystemDark(e.matches);window.addEventListener('resize',on);visualViewport?.addEventListener('resize',on);mq.addEventListener('change',change);return()=>{window.removeEventListener('resize',on);visualViewport?.removeEventListener('resize',on);mq.removeEventListener('change',change);};},[]);
  useEffect(()=>{const c=new AbortController();fetch('/api/voice/status',{signal:c.signal,cache:'no-store'}).then(r=>r.json()).then((v:unknown)=>{if(typeof v==='object'&&v!==null&&'ready'in v)setVoiceReady(v.ready===true);}).catch(()=>{});return()=>c.abort();},[]);
  useEffect(()=>{if(restoring.current||!scroll.current||!desktop&&mapVisible||!['home','decide'].includes(a.screen))return;if(atBottom.current||a.thread.at(-1)?.role==='user')scroll.current.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'});},[a.thread.length,a.busy]);
  useEffect(()=>{if(!desktop&&mapVisible)scroll.current?.scrollTo({top:scroll.current.scrollTop,behavior:'instant'});},[desktop,mapVisible]);
  useEffect(()=>{if(restoring.current){scroll.current?.scrollTo({top:restoredScroll.current,behavior:'instant'});const timer=setTimeout(()=>{scroll.current?.scrollTo({top:restoredScroll.current,behavior:'instant'});restoring.current=false;navigated.current=navigationKey;},350);return()=>clearTimeout(timer);}if(a.busy||!desktop&&mapVisible||navigated.current===navigationKey)return;navigated.current=navigationKey;const recommended=a.screen==='results'?root.current?.querySelector<HTMLElement>('[data-recommended-product]')?.closest<HTMLElement>('section'):null;const target=recommended??(['home','results','stores','compare','contact','trip'].includes(a.screen)?root.current?.querySelector<HTMLElement>('[data-active-tool]'):root.current?.querySelector<HTMLElement>('.chat-message:last-child'));scroll.current?.scrollTo({top:Math.max(0,(target?.offsetTop??0)-16),behavior:'smooth'});},[navigationKey,a.busy,desktop,mapVisible]);
  useLayoutEffect(()=>{
    const el=composer.current;if(!el)return;
    const base=desktop?48:36,limit=desktop?140:Math.max(base,Math.min(96,Math.floor(viewport.h*.18)));
    // An empty textarea's scrollHeight can include its wrapped placeholder or
    // a measurement made while the chat was hidden. Never size from that.
    el.style.height=`${base}px`;
    const height=q.length?Math.min(limit,Math.max(base,el.scrollHeight)):base;
    el.style.height=`${height}px`;el.style.overflowY=q.length&&el.scrollHeight>height?'auto':'hidden';
  },[q,desktop,viewport.w,viewport.h,mapVisible]);
  useEffect(()=>{
    if(!a.overlay&&(desktop||!mapVisible))return;const previous=document.activeElement,dialog=root.current?.querySelector<HTMLElement>(a.overlay?'.dialog-backdrop [role="dialog"]':'[data-map-panel]');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]')??[]).filter(el=>el.getClientRects().length);
    (dialog?.querySelector<HTMLElement>('[data-reply-focus]')??focusable()[0])?.focus({preventScroll:true});const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();if(a.overlay)a.setOverlay(null);else{a.setPicking(false);a.setMapMode('closed');}}if(e.key==='Tab'){const t=focusable();if(e.shiftKey&&document.activeElement===t[0]){e.preventDefault();t.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===t.at(-1)){e.preventDefault();t[0]?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[a.overlay,desktop,mapVisible]);
  const revealOffer=(o:Offer)=>{if(o.product_id!==a.product?.product_id){a.contact(o);return;}a.setSelected(o);a.setMapMode('closed');setTimeout(()=>{const card=root.current?.querySelector<HTMLElement>(`[data-offer="${CSS.escape(o.offer_id)}"]`),target=card??root.current?.querySelector<HTMLElement>('[data-active-tool]');const details=card?.querySelector('details');if(details)details.open=true;target?.scrollIntoView({block:'center',behavior:'smooth'});},80);};
  const speak=(id:string,text:string)=>{if(!voiceReady){a.flash('برای شنیدن پاسخ، کلید AvalAI و TOROB_VOICE_ENABLED=1 را در .env تنظیم و بک‌اند را دوباره اجرا کن.');return;}if(spoken===id&&speaker.playbackBlocked){void speaker.resumePlayback();return;}if(spoken===id&&(speaker.isPlaying||speaker.isLoading)){speaker.stop();setSpoken(null);}else{speaker.stop();setSpoken(id);void speaker.speak(text.slice(0,2000));}};
  useEffect(()=>{if(a.completedVisit&&a.activePurchase?.stage!=='done'){atBottom.current=true;composer.current?.focus({preventScroll:true});composer.current?.select();}},[a.completedVisit?.id]);
  const comparisonCount=a.models.length+a.compare.length;
  const comparing=!journeyVisible&&(a.models.length>0||a.compare.length>0);
  const journeyHint=journeyVisible&&a.activePurchase?{ready:'مقصد آماده است؛ قدم بعدی، شروع حرکت',en_route:'در مسیر فروشگاه همراهت هستم',arrived:'رسیدی؛ نتیجهٔ خرید را ثبت کنیم',problem:'با همین نیاز، جایگزین را پیدا کنیم',done:'این خرید تمام شده است'}[a.activePurchase.stage]:null;
  const mapLabel=comparing?'این مقایسه روی نقشه':a.selected?(a.screen==='trip'?'مقصد و مسیر روی نقشه':'این فروشگاه روی نقشه'):a.screen==='results'||a.screen==='stores'?'این نتایج روی نقشه':'نقشه و فروشگاه‌ها';
  const showCurrentOnMap=()=>{if(comparing){a.clearMapFocus();setRecenter(n=>n+1);a.setMapMode('open');}else if(a.selected)a.showOffer(a.selected);else{a.clearMapFocus();setRecenter(n=>n+1);a.setMapMode('open');}};
  const continueFromMap=(o:Offer)=>{if(!['contact','trip'].includes(a.screen)||a.selected?.offer_id!==o.offer_id)a.contact(o);};
  const submit=()=>{if(!q.trim()||a.busy)return;atBottom.current=true;a.ask(q);setQ('');};
  const retry=()=>{if(a.screen==='decide')a.retryMessage();else if(a.screen==='results')a.search(a.query,false,true);else if(a.screen==='contact'&&a.selected)a.contact(a.selected);else a.retry();};
  return <div ref={root} dir="rtl" lang="fa" className={(dark?'theme-dark':'theme-light')+' agent-app'} style={{height:viewport.h,'--floating-chat-width':`${chatWidth}px`} as CSSProperties} data-layout={desktop?'desktop':'mobile'}>
    <div className={'agent-layout'+(mapVisible?' has-map':'')} inert={a.overlay?true:undefined} aria-hidden={a.overlay?true:undefined}>
      <section className="chat-pane" aria-label="گفت‌وگوی خرید" aria-hidden={!desktop&&mapVisible?true:undefined} inert={!desktop&&mapVisible?true:undefined}>
        <header className="chat-header"><BrandMark className="brand-mark"/><div className="header-title"><h1>همراه خرید حضوری</h1><p><span className="status-dot"/>{journeyHint??'پیش از راه افتادن، با هم بررسی کنیم'}</p></div><div className="header-actions"><Hint text={comparisonCount?`نمایش مقایسهٔ کامل ${fa(a.models.length)} محصول و ${fa(a.compare.length)} پیشنهاد فروشگاه`:'برای مقایسه، گزینهٔ مقایسه را روی کارت محصول یا فروشگاه بزن'}><button type="button" className={'icon-button comparison-launcher'+(comparisonCount?' has-selection':'')} aria-label="مقایسهٔ انتخاب‌ها" aria-haspopup="dialog" aria-disabled={!comparisonCount} onClick={()=>{if(comparisonCount)a.setOverlay('comparison');}}><Scale size={21}/>{comparisonCount>0&&<span className="comparison-count" aria-hidden="true">{fa(comparisonCount)}</span>}</button></Hint><Hint text="دیدن برنامه‌های ذخیره‌شده و برگشت به نتایج قبلی"><button className="icon-button" aria-label="برنامه‌ها و نتایج قبلی" onClick={()=>a.setOverlay('history')}><History size={21}/></button></Hint><Hint text="شروع گفت‌وگوی تازه؛ برنامه‌های ذخیره‌شده باقی می‌مانند"><button className="icon-button" aria-label="گفت‌وگوی تازه" onClick={a.newConversation}><SquarePen size={21}/></button></Hint></div><ThemePicker theme={theme} onChange={setTheme} compact={!desktop}/></header>
        <nav className="context-bar" aria-label="ابزارهای خرید"><button onClick={()=>a.setOverlay('location')} className={a.position?'location-selected':''}><MapPin size={15}/><span>{a.position?.label??'انتخاب موقعیت'}</span></button>{a.selected&&!journeyVisible&&<button className="checks-context-button" onClick={()=>a.setOverlay('checks')} aria-label="استعلام و رزرو"><MessageSquare size={15}/><span>استعلام</span></button>}{a.screen!=='home'&&!journeyVisible&&<button onClick={()=>a.setOverlay('filters')}><SlidersHorizontal size={15}/>شرایط خرید</button>}<button aria-pressed={desktop?undefined:mapVisible} onClick={()=>{if(desktop){a.clearMapFocus();setRecenter(n=>n+1);}else if(mapVisible)a.setMapMode('closed');else showCurrentOnMap();}}><MapIcon size={15}/>{desktop?(journeyVisible?'مقصد این خرید':'همهٔ نتایج'):mapVisible?'بازگشت به گفت‌وگو':'نقشه'}</button></nav>
        <div ref={scroll} data-chat-scroll className="chat-scroll" onScroll={e=>{const el=e.currentTarget;if(!restoring.current)writeSession('scroll',Math.round(el.scrollTop));atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
          <div className="conversation-width">
            <div className="chat-thread" role="log" aria-label="پیام‌های گفت‌وگو" aria-live="polite" aria-relevant="additions text">
              {a.thread.map(entry=><article key={entry.id} className={'chat-message '+entry.role+(entry.kind==='action'?' action-message':'')} data-message-role={entry.role}>
                {entry.role==='assistant'&&<BrandMark className="assistant-mark"/>}<div className="message-content"><p>{entry.text}</p>{entry.role==='assistant'&&entry.kind!=='action'&&<div className="message-actions"><Hint text="خواندن همین پاسخ با صدا؛ با انتخاب دوباره متوقف می‌شود"><button aria-label="خواندن این پاسخ" onClick={()=>speak(entry.id,entry.text)}>{spoken===entry.id&&(speaker.isPlaying||speaker.isLoading)?<Square size={14}/>:<Volume2 size={16}/>}</button></Hint><Hint text="کپی متن همین پاسخ"><button aria-label="کپی پاسخ" onClick={()=>void copyText(entry.text,a)}><Copy size={15}/></button></Hint></div>}</div>
              </article>)}
            </div>
            {a.needsLocation&&<section className="inline-location"><div><MapPin size={22}/><b>{a.position?'موقعیت آماده است':'کجا را بررسی کنم؟'}</b></div><p>{a.position?a.position.label:'می‌توانی بدون دسترسی به GPS، نقطهٔ جست‌وجو را روی نقشه انتخاب کنی.'}</p><div className="inline-actions">{a.position?<button className="primary-action" onClick={a.resumeVisit}>بررسی اطراف این نقطه</button>:<><button className="primary-action" onClick={a.beginPick}>انتخاب با یک کلیک روی نقشه</button><button className="secondary-action" onClick={a.locate}>موقعیت فعلی من</button></>}</div></section>}
            {a.busy&&<div role="status" className="assistant-working"><span className="thinking-dots"><i/><i/><i/></span><span>{a.screen==='contact'?'آماده‌کردن پیش‌نویس پیگیری…':a.screen==='stores'?'بررسی پیشنهادها و ساعت کاری…':'در حال بررسی درخواستت…'}</span></div>}
            {a.error&&<ErrorBox message={a.error} retry={retry}/>}
            {speaker.error&&<ErrorBox message={speaker.error}/>}
            {speaker.playbackBlocked&&<button className="secondary-action" onClick={()=>void speaker.resumePlayback()}><Volume2 size={16}/>پخش صدای آماده</button>}
            {!journeyVisible&&!!a.purchaseQueue.length&&<details className="purchase-queue" open={a.screen==='decide'&&!a.busy}><summary>کالاهای بعدی · {fa(a.purchaseQueue.length)}</summary><div className="inline-actions">{a.purchaseQueue.map(topic=><button key={topic} className="secondary-action" disabled={a.busy} onClick={()=>a.ask(`${topic} نزدیک من برای خرید حضوری می‌خواهم`)}>{topic}</button>)}</div><small>بودجهٔ هر کالا را جدا تعیین کن؛ انتخاب بعدی، نتایج فعلی را به سابقه می‌برد.</small></details>}
            {!journeyVisible&&<>{!a.delegation&&<AutoAlternatives a={a}/>}<NeedSummary a={a} onEdit={()=>openReply('topic')}/></>}<section data-active-tool data-screen={a.screen} className="active-tool" aria-label={TITLES[a.screen]}>
              {!journeyVisible&&!a.delegation&&BACK[a.screen]&&<div className="tool-heading"><Hint text="بازگشت به مرحلهٔ قبلی همین خرید"><button onClick={()=>a.go(BACK[a.screen]!)} aria-label="بازگشت"><ArrowRight size={16}/></button></Hint><h2>{TITLES[a.screen]}</h2></div>}
              {a.activePurchase?.stage==='done'?<PurchaseJourney a={a}/>:a.delegation?<DelegatedVisitCard a={a}/>:<Body a={a}/>}
            </section>
          </div>
        </div>
        <footer className="composer-area"><div className="conversation-width">{!q.trim()&&(desktop||viewport.h>650)&&<QuickReplies a={a} onOpen={openReply}/>}<form className="message-composer" onSubmit={e=>{e.preventDefault();submit();}}>
          <textarea ref={composer} value={q} maxLength={1000} rows={1} aria-label="پیام به دستیار خرید" placeholder={a.completedVisit?'برای خرید بعدی چی لازم داری؟':desktop?'چی لازم داری؟ با هم برای خریدش برنامه می‌ریزیم…':'پیامت را بنویس یا بگو…'} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/>
          <div className="composer-actions"><Hint text="گفتن پیام با میکروفون و مرور متن پیش از ارسال"><button type="button" className="icon-button" aria-label="گفتن پیام با صدا" onClick={()=>a.openVoice(null,'record')}><Mic size={21}/></button></Hint><Hint text="انتخاب نقطهٔ جست‌وجو روی نقشه بدون نیاز به GPS"><button type="button" className="icon-button" aria-label="افزودن موقعیت" onClick={a.beginPick}><Plus size={21}/></button></Hint>{!a.busy&&!a.needsLocation&&!!a.thread.length&&!journeyVisible&&(!!q.trim()||!desktop&&viewport.h<=650||a.screen==='home')&&<RepliesTrigger onOpen={openReply}/>}<span className="composer-hint">{a.busy?'می‌توانی بررسی را متوقف کنی':'پیامت را بنویس یا بگو'}</span>{a.busy?<Hint text="متوقف‌کردن بررسی جاری دستیار"><button type="button" className="send-button" aria-label="توقف بررسی" onClick={a.stop}><Square size={17} fill="currentColor"/></button></Hint>:<Hint text="ارسال پیام به همراه خرید؛ با Enter هم می‌توانی بفرستی"><button className="send-button" aria-label="ارسال پیام" disabled={!q.trim()}><ArrowUp size={23}/></button></Hint>}</div>
        </form><p className="composer-note">قیمت و موجودی ثبت‌شده، پیش از رفتن نیاز به بررسی دارند.</p><MobileViewSwitch view="chat" mapLabel={mapLabel} mapHint={a.selected?.shop.name??(comparing?'نمایش هم‌زمان گزینه‌های مقایسه':'نمایش فروشگاه‌های همین بررسی')} onChat={()=>a.setMapMode('closed')} onMap={showCurrentOnMap}/></div></footer>
      </section>
      {mapMounted&&<section className="map-pane" hidden={!mapVisible} role={desktop?'region':'dialog'} aria-modal={!desktop?true:undefined} aria-label="نقشهٔ خرید حضوری" data-map-panel inert={a.overlay||!mapVisible?true:undefined}>
        <MapBoundary onClose={()=>a.setMapMode('closed')}><Suspense fallback={<div className="map-load-state" role="status">در حال آماده‌کردن نقشه…</div>}><RealMap replyByOffer={a.replyByOffer} roadRoutes={visibleRoutes} active={mapVisible} dark={dark} offers={mapOffers} selected={a.selected?.offer_id??null} position={a.position} radius={a.insights?.nearby_km??a.visitIntent?.nearbyKm??(a.filters.withinRadius?a.filters.radius:2)} showRadius={!!a.position} route={a.screen==='trip'} desktop={desktop} topInset={!desktop&&journeyVisible&&!a.picking?mapJourneyInset:undefined} rightInset={desktop?chatWidth+40:0} bottom={!desktop&&!a.picking?mapSheetHeight+12:0} recenter={recenter} country={country} pick={a.picking} focus={a.mapFocus} places={places} onPick={a.finishPick} onOffer={a.setSelected} comparedIds={comparedIds} offerComparedIds={offerComparedIds} productNames={productNames} onCompare={a.toggleCompare} onInspect={a.contact}/></Suspense></MapBoundary>
        <div className="map-topbar"><BrandMark className="map-brand-mark"/><div><b>{a.picking?'یک بار روی محل موردنظرت بزن':a.mapFocus?.label??'همراهت برای خرید حضوری'}</b><span>{a.picking?'بدون نیاز به دسترسی موقعیت فعلی':journeyHint&&a.activePurchase?.stage!=='en_route'?journeyHint:a.roadRoutes.find(r=>r.offer_id===a.selected?.offer_id)?`${travelLabels[a.travelMode]} · ${fa(Math.max(1,Math.ceil(a.roadRoutes.find(r=>r.offer_id===a.selected?.offer_id)!.duration_seconds/60)))} دقیقه روی معابر · بدون ترافیک زنده`:'بکش: جابه‌جایی · دوبار بزن: انتخاب موقعیت'}</span></div>{!desktop&&journeyVisible&&viewport.h-mapSheetHeight<270&&<TouchAction className="icon-button" aria-label="ادامهٔ مراحل خرید" title="جزئیات و ادامهٔ همین خرید" action={()=>a.setOverlay('journey')}><MessageSquareMore size={19}/></TouchAction>}{!desktop&&!journeyVisible&&!!a.thread.length&&<Hint text="پاسخ‌های آماده برای ادامهٔ همین خرید، بدون خروج از نقشه"><button className="map-ready-replies" aria-label="پاسخ‌های آماده" aria-haspopup="dialog" onClick={()=>openReply('suggestions')}><MessageSquareMore size={19}/></button></Hint>}{!desktop&&<button className="map-return-chat" aria-label="بازگشت به گفت‌وگو" onClick={()=>{a.setPicking(false);a.setMapMode('closed');}}><ArrowRight size={18}/><span>گفت‌وگو</span></button>}</div>
        <div className="map-buttons"><Hint text="انتخاب نقطهٔ جست‌وجو با یک کلیک روی نقشه؛ بدون نیاز به GPS"><button className="map-control" aria-label="انتخاب موقعیت روی نقشه" onClick={a.beginPick}><MapPin size={20}/></button></Hint><Hint text="جا دادن فروشگاه‌های همین خرید در نمای نقشه"><button className="map-control" aria-label="نمایش همهٔ فروشگاه‌ها" onClick={()=>{a.clearMapFocus();setRecenter(n=>n+1);}}><LocateFixed size={20}/></button></Hint><Hint text="دیدن نقشهٔ سراسر ایران؛ فروشگاه‌های این دیتاست در تهران‌اند"><button className="map-control" aria-label="نمای کل ایران" onClick={()=>{a.clearMapFocus();setCountry(n=>n+1);}}><MapIcon size={20}/></button></Hint></div>
        {!desktop&&journeyVisible&&!a.picking&&<MobileMapJourney a={a} active={mapVisible} availableHeight={viewport.h-mapSheetHeight} onInset={setMapJourneyInset}/>}
        {a.mapPreviewBusy&&<div className="map-sync-status" role="status">در حال آوردن فروشگاه‌ها روی نقشه…</div>}{a.mapPreviewError&&<div className="map-sync-status" role="status">{a.mapPreviewError}</div>}
        {a.picking?<div className="map-bottom-callout"><MapPin size={19}/><p>نقشه را جابه‌جا کن و روی محل جست‌وجو بزن.</p><button onClick={()=>a.setOverlay('location')}>انتخاب محله</button></div>:!desktop?<MobileMapSheet journeyActive={journeyVisible} active={mapVisible} productNames={productNames} comparedIds={comparedIds} offers={a.mapOffers} selected={a.selected} productName={a.selected?productNames[a.selected.product_id]??null:a.product?.persian_title??null} viewportHeight={viewport.h} busy={a.busy} hasMore={a.hasMore} onMore={a.moreOffers} onHeight={setMapSheetHeight} onSelect={a.setSelected} onInspect={continueFromMap} onNavigate={()=>a.setOverlay('nav')}  onChat={()=>a.setMapMode('closed')} onPick={a.beginPick}/>:journeyVisible?null:a.selected?<div className="map-bottom-callout"><div><b>{a.selected.shop.name}</b><p>{a.selected.shop.address??'آدرس ثبت نشده'}</p></div><button className="primary-action" onClick={()=>revealOffer(a.selected!)}>دیدن جزئیات</button></div>:<div className="map-bottom-callout"><p>{a.position?'برای انتخاب دوبارهٔ محل، دکمهٔ نشانگر را بزن.':'یک بار روی نقشه بزن و تأیید کن؛ با دوبار کلیک هم انتخاب می‌شود.'}</p><button className="primary-action" onClick={a.beginPick}>انتخاب موقعیت</button></div>}
      </section>}
    </div>
    {a.overlay&&<div className="dialog-backdrop" onClick={()=>a.setOverlay(null)}><section role="dialog" aria-modal="true" aria-label={overlayTitle} className={'chat-dialog'+(a.overlay==='comparison'?' comparison-dialog':'')} onClick={e=>e.stopPropagation()}><header><h2>{overlayTitle}</h2><Hint text="بستن این پنجره و ادامهٔ همان مرحلهٔ خرید"><button className="icon-button" aria-label="بستن" onClick={()=>a.setOverlay(null)}><X size={20}/></button></Hint></header><div className="dialog-content">
      {a.overlay==='reply'&&<QuickReplySheet key={replyPanel} a={a} panel={replyPanel} onOpen={openReply}/>}
      {a.overlay==='journey'&&<PurchaseJourney a={a} onMap/>}
      {a.overlay==='travel'&&<TravelSheet a={a}/>}
      {a.overlay==='checks'&&<ChecksSheet a={a}/>}
      {a.overlay==='history'&&<HistoryPanel a={a}/>}
      {a.overlay==='comparison'&&<ComparisonSheet a={a} onMap={()=>{a.setOverlay(null);if(journeyVisible)a.go('stores');a.clearMapFocus();setRecenter(n=>n+1);a.setMapMode('open');}}/>}
      {a.overlay==='filters'&&<FilterSheet a={a}/>}{a.overlay==='location'&&<LocationSheet a={a} onPickMap={a.beginPick}/>}{a.overlay==='alts'&&<AlternativesSheet a={a}/>}{a.overlay==='nav'&&<NavigationSheet a={a}/>}{a.overlay==='voice'&&<VoicePanel initialTab={a.voiceRequest.mode} responseText={a.voiceRequest.text??a.thread.filter(m=>m.role==='assistant').at(-1)?.text} onText={text=>{setQ(text);a.setOverlay(null);setTimeout(()=>composer.current?.focus(),20);}}/>}

    </div></section></div>}
    <Toast msg={a.toast}/>
  </div>;
}
