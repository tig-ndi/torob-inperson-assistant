import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as api from './client';
import {type ArrivalCheck,recommendation} from './journey';
import {useJourneyState,readSession,writeSession} from './session';
import { DEFAULT_FILTERS, type Filters, type Product, type Offer, type Position, type Screen, type Overlay, type Summary, type NeedState, type PreparedFollowup, type SavedTrip, type Probable, type Place, type VisitInsights, directMeters } from './data';
import {visitIntent as parseVisitIntent,visitClock as parseVisitClock,visitGuidance,visitPreferences,type ChatEntry,type VisitIntent} from './conversation';
import {purchaseTopics,conversationHistory,recommendedFirst} from './requestPlanning';
import type { AssistantMessage } from '../api';
import type { CataloguePage, CatalogueProduct, Explanation } from '../app/base/domain/contracts';
import {useUpgrades} from './useUpgrades';
import {travelFromText,firstShopOffers,sellerConcern as getSellerConcern,type TravelMode} from './upgrades';
import { parsePrepared } from '../app/base/domain/parsers';

export type RecentResult={id:string;query:string;page:CataloguePage;need:NeedState|null;filters:Filters;assistant:boolean;visit:VisitIntent|null;createdAt:string};
export function useShopping() {
  const [purchaseQueue,setPurchaseQueue]=useJourneyState<string[]>('purchaseQueue',[]);
  const [journeyId,setJourneyId]=useJourneyState<string>('query',crypto.randomUUID(),':journey');
  const [completedVisit,setCompletedVisit]=useJourneyState<{id:string;shopName:string;productName:string}|null>('completed',null);
  const [voiceRequest,setVoiceRequest]=useState<{text:string|null;mode:'record'|'listen'}>({text:null,mode:'record'});
  const [screen,setScreen]=useJourneyState<Screen>('screen','home'),[overlay,setOverlay]=useState<Overlay>(null);
  const [filters,setFilters]=useJourneyState<Filters>('filters',{...DEFAULT_FILTERS}),[position,setPosition]=useJourneyState<Position|null>('position',null);
  const [summary,setSummary]=useState<Summary|null>(null),[saved,setSaved]=useState<SavedTrip[]>([]);
  const [query,setQuery]=useJourneyState('query',''),[products,setProducts]=useJourneyState<CatalogueProduct[]>('products',[]),[productPage,setProductPage]=useJourneyState<CataloguePage|null>('productPage',null);
  const [product,setProduct]=useJourneyState<Product|null>('product',null),[offers,setOffers]=useJourneyState<Offer[]>('offers',[]),[hasMore,setHasMore]=useState(false);
  const [selected,setSelected]=useJourneyState<Offer|null>('selected',null),[compare,setCompare]=useJourneyState<Offer[]>('compare',[]),[models,setModels]=useJourneyState<Product[]>('models',[]);
  const [probable,setProbable]=useState<Probable[]>([]),[prepared,setPrepared]=useState<PreparedFollowup|null>(null);
  const [status,setStatus]=useState<Awaited<ReturnType<typeof api.assistantStatus>>|null>(null);
  const [statusChecked,setStatusChecked]=useState(false),deferredAsk=useRef<string|null>(null);
  const agentMessage=!status?'وضعیت دستیار دریافت نشده؛ اتصال را دوباره بررسی کنید.':{
    ready:'دستیار آمادهٔ گفت‌وگوست.',
    disabled:'دستیار در اجرای فعلی غیرفعال است؛ TOROB_ASSISTANT_ENABLED=1 را تنظیم و بک‌اند را بدون Offline دوباره اجرا کنید.',
    missing_key:'کلید BoxAPI در تنظیمات اجرای فعلی پیدا نشد؛ پس از ذخیرهٔ .env بک‌اند را دوباره اجرا کنید.',
    invalid_config:'تنظیمات دستیار معتبر نیست؛ نام مدل، قالب کلید و سقف درخواست را در .env بررسی کنید.',
    attempt_limit:'سقف درخواست‌های ثبت‌شدهٔ دستیار تمام شده است. جست‌وجوی مستقیم همچنان فعال است.',
  }[status.reason];
  const [agent,setAgent]=useState(true),[messages,setMessages]=useJourneyState<AssistantMessage[]>('messages',[]),[need,setNeed]=useJourneyState<NeedState|null>('need',null);
  const [thread,setThread]=useJourneyState<ChatEntry[]>('thread',[]),[visitIntent,setVisitIntent]=useJourneyState<VisitIntent|null>('visit',null),[needsLocation,setNeedsLocation]=useJourneyState('bool',false,':needsLocation');
  const [insights,setInsights]=useState<VisitInsights|null>(null),[insightsBusy,setInsightsBusy]=useState(false),[insightsError,setInsightsError]=useState<string|null>(null);
  const [mapMode,setMapMode]=useJourneyState<'auto'|'open'|'closed'>('mapMode','auto'),[picking,setPicking]=useState(false),[mapFocus,setMapFocus]=useJourneyState<Place|null>('mapFocus',null);
  const [mapLibrary,setMapLibrary]=useJourneyState<Offer[]>('mapLibrary',[]),[knownProducts,setKnownProducts]=useJourneyState<Record<string,Product>>('knownProducts',{}),[recentResults,setRecentResults]=useJourneyState<RecentResult[]>('recentResults',[]);
  const [mapPreviewBusy,setMapPreviewBusy]=useState(false),[mapPreviewError,setMapPreviewError]=useState<string|null>(null);
  const [travelMode,setTravelMode]=useJourneyState<TravelMode>('mode','walking'),[travelMinutes,setTravelMinutes]=useJourneyState('duration','');
  const [arrivalChecks,setArrivalChecks]=useState<Record<string,ArrivalCheck>>({}),[arrivalError,setArrivalError]=useState<string|null>(null),[arrivalBusy,setArrivalBusy]=useState(false);
  const [destinationCoverage,setDestinationCoverage]=useState<{models:number;shops:number}|null>(null);
  const [candidateVisits,setCandidateVisits]=useState<{product:Product;insights:VisitInsights}[]>([]),[candidateBusy,setCandidateBusy]=useState(false),[candidateError,setCandidateError]=useState<string|null>(null);
  const [followupEvent,setFollowupEvent]=useState<{id:string;offer_id:string;outcome:'closed'|'out_of_stock'|'no_answer';source:'user_report'|'simulated'}|null>(null);
  const [safetyAcknowledged,setSafetyAcknowledged]=useJourneyState('query','',':safety');
  const pending=useRef(thread.filter(m=>m.role==='user'&&m.kind!=='action').at(-1)?.text??''),lastGuidance=useRef(readSession('guidance','',v=>typeof v==='string'?v:''));
  const retainOffers=useCallback((rows:Offer[])=>setMapLibrary(old=>[...new Map([...old,...rows].map(o=>[o.offer_id,o])).values()]),[]);
  const say=useCallback((role:ChatEntry['role'],text:string,kind:ChatEntry['kind']='message')=>setThread(t=>[...t.slice(-99),{id:crypto.randomUUID(),role,text,kind}]),[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[toast,setToast]=useState<string|null>(null);
  const [reload,setReload]=useState(0),[weight,setWeight]=useJourneyState('weight',50);
  const [explanation,setExplanation]=useState<Explanation|null>(null),[assistantResults,setAssistantResults]=useJourneyState('bool',false,':assistantResults'),[restoredTrip,setRestoredTrip]=useState<SavedTrip|null>(null);
  const controller=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const loadedOffersKey=useRef<string|null>(null);
  const flash=useCallback((s:string)=>{setToast(s);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(null),3500);},[]);
  const run=useCallback(async(fn:(signal:AbortSignal)=>Promise<void>)=>{
    controller.current?.abort();const c=new AbortController();controller.current=c;setError(null);setBusy(true);
    try{await fn(c.signal);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'ارتباط برقرار نشد. دوباره تلاش کنید.');}
    finally{if(!c.signal.aborted)setBusy(false);}
  },[]);
  useEffect(()=>()=>{controller.current?.abort();if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{
    const c=new AbortController();
    api.summary(c.signal).then(setSummary).catch(e=>{if(!c.signal.aborted)setError(String(e.message));});
    api.assistantStatus(c.signal).then(setStatus).catch(()=>{if(!c.signal.aborted)setStatus(null);}).finally(()=>{if(!c.signal.aborted)setStatusChecked(true);});
    api.trips(c.signal).then(setSaved).catch(e=>{if(!c.signal.aborted)setError(String(e.message));});
    return()=>c.abort();
  },[reload]);
  useEffect(()=>{const rows=[...products,...models,...candidateVisits.map(v=>v.product),...(product?[product]:[])];if(rows.length)setKnownProducts(old=>({...old,...Object.fromEntries(rows.map(p=>[p.product_id,p]))}));},[products,models,product,candidateVisits]);
  useEffect(()=>{if(!productPage?.items.length)return;const item:RecentResult={id:crypto.randomUUID(),query,page:{...productPage,items:products},need,filters:{...filters},assistant:assistantResults,visit:visitIntent,createdAt:new Date().toISOString()};setRecentResults(old=>[item,...old.filter(r=>r.query!==query||JSON.stringify(r.filters)!==JSON.stringify(filters)||r.visit?.localTime!==visitIntent?.localTime)].slice(0,12));},[productPage]);
  useEffect(()=>{const rows=[...offers,...compare,...(insights?.open_offers.items??[]),...(selected?[selected]:[])];if(rows.length)retainOffers(rows);},[offers,compare,insights,selected,retainOffers]);
  useEffect(()=>{
    const candidates=[...new Map([...models,...products.slice(0,3)].map(p=>[p.product_id,p])).values()];
    if(!candidates.length){setMapPreviewBusy(false);return;}
    const c=new AbortController();setMapPreviewBusy(true);setMapPreviewError(null);
    Promise.allSettled(candidates.map(async p=>{const page=await api.offers(p.product_id,{...filters,sort:position?'nearest':'price'},position,c.signal,0,visitIntent?.localTime??null);if(!c.signal.aborted)retainOffers(page.items);return page;})).then(results=>{if(c.signal.aborted)return;if(results.some(r=>r.status==='rejected'))setMapPreviewError('بعضی فروشگاه‌ها روی نقشه دریافت نشدند. برای تلاش دوباره، محصول را انتخاب کن.');setMapPreviewBusy(false);});return()=>c.abort();
  },[products,models,filters,position,visitIntent?.localTime,retainOffers]);
  useEffect(()=>{
    setCandidateVisits([]);setCandidateError(null);setCandidateBusy(false);setDestinationCoverage(null);
    if(!position||!visitIntent||!products.length||need?.pending_requirements.length)return;
    const c=new AbortController();setCandidateBusy(true);
    void (async()=>{
      try{
        const found=await api.destinations(need?.topic_query||visitIntent.topic||query,position,filters,visitIntent,travelMode,need,c.signal);
        if(c.signal.aborted)return;setDestinationCoverage({models:found.models,shops:found.shops});
        const results=await Promise.allSettled(found.ids.map(async id=>{
          const p=products.find(p=>p.product_id===id)??await api.product(id,c.signal);
          const [insights,chosen]=await Promise.all([api.visit(id,position,filters,visitIntent,c.signal),Promise.all(found.selections.filter(s=>s.product_id===id).map(s=>api.destinationOffer(s,position,visitIntent.localTime,c.signal)))]);
          insights.open_offers.items=[...new Map([...chosen,...insights.open_offers.items].map(o=>[o.offer_id,o])).values()].slice(0,3);
          return {product:p,insights};
        }));
        if(c.signal.aborted)return;const rows=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);setCandidateVisits(rows);rows.forEach(r=>retainOffers(r.insights.open_offers.items));
        if(results.some(r=>r.status==='rejected'))setCandidateError('بررسی بعضی مقصدها کامل نشد؛ نتیجهٔ نبود فروشگاه باز قطعی نیست.');
      }catch(e){if(!c.signal.aborted)setCandidateError(e instanceof Error?e.message:'بررسی مقصدها دریافت نشد.');}
      finally{if(!c.signal.aborted)setCandidateBusy(false);}
    })();return()=>c.abort();
  },[products,position,filters,visitIntent,travelMode,reload]);
  const [roadConsent,setRoadConsent]=useJourneyState('bool',false,':roadConsent');
  const routeTargets=useMemo(()=>firstShopOffers([...(selected?[selected]:[]),...compare,...candidateVisits.flatMap(v=>v.insights.open_offers.items),...offers,...mapLibrary.filter(o=>models.some(p=>p.product_id===o.product_id))]).slice(0,3),[selected,compare,candidateVisits,offers,mapLibrary,models]);
  const upgrades=useUpgrades({journeyId,position,mode:travelMode,targets:routeTargets,products,query:need?.topic_query??query,radius:filters.radius,consent:roadConsent,flash});
  const arrivalOffers=useMemo(()=>[...new Map([...(selected?[selected]:[]),...compare,...candidateVisits.flatMap(v=>v.insights.open_offers.items),...offers,...mapLibrary.filter(o=>models.some(p=>p.product_id===o.product_id))].map(o=>[o.offer_id,o])).values()].slice(0,30),[selected,compare,candidateVisits,offers,mapLibrary,models]);
  const [arrivalTick,setArrivalTick]=useState(0);
  useEffect(()=>{if(!selected||!['stores','contact','trip'].includes(screen))return;const timer=setInterval(()=>setArrivalTick(n=>n+1),60000);return()=>clearInterval(timer);},[selected?.offer_id,screen]);
  const arrivalKey=JSON.stringify([screen,arrivalTick,arrivalOffers.map(o=>[o.offer_id,o.product_id,o.shop_id]),position,visitIntent?.localTime,travelMode,travelMinutes,selected?.offer_id,reload,roadConsent,upgrades.roadRevision]);
  useEffect(()=>{
    setArrivalChecks({});setArrivalError(null);setArrivalBusy(false);if(!arrivalOffers.length)return;
    const c=new AbortController();setArrivalBusy(true);
    api.arrivals(arrivalOffers,position,visitIntent?.localTime??null,travelMode,travelMinutes,selected?.offer_id??null,c.signal,roadConsent).then(rows=>{if(!c.signal.aborted)setArrivalChecks(Object.fromEntries(rows.map(r=>[r.offer_id,r])));}).catch(e=>{if(!c.signal.aborted)setArrivalError(e.message);}).finally(()=>{if(!c.signal.aborted)setArrivalBusy(false);});return()=>c.abort();
  },[arrivalKey]);
  const candidateOffers=recommendation(candidateVisits.flatMap(v=>v.insights.open_offers.items),arrivalChecks,weight);
  const [agentAlternatives,setAgentAlternatives]=useState<{active:boolean;busy:boolean;items:Offer[];error:string|null}>({active:false,busy:false,items:[],error:null});
  const [alternativeRefresh,setAlternativeRefresh]=useState(0),announcedReply=useRef('');
  const latestReply=selected?upgrades.replyByOffer[selected.offer_id]:null;
  const autoAlternativeKey=JSON.stringify([selected?.offer_id,latestReply?.responded_at,latestReply?.outcome,filters,position,visitIntent?.localTime,alternativeRefresh]);
  useEffect(()=>{
    setAgentAlternatives({active:false,busy:false,items:[],error:null});
    if(!selected||!latestReply||!['closed','out_of_stock','no_answer'].includes(latestReply.outcome))return;
    const c=new AbortController(),stamp=selected.offer_id+latestReply.responded_at;
    setAgentAlternatives({active:true,busy:true,items:[],error:null});
    if(announcedReply.current!==stamp){announcedReply.current=stamp;say('assistant','پاسخ آزمایشی فروشگاه برای مراجعه مناسب نیست؛ جایگزین‌های باز با همان نیاز و شرایط را بررسی می‌کنم.','action');}
    api.alternatives(selected,{...filters,open:true},position,latestReply.outcome as 'closed'|'out_of_stock'|'no_answer','simulated',c.signal,0,visitIntent?.localTime??null).then(result=>{
      if(c.signal.aborted)return;const rows=result.alternatives.items.slice(0,3);retainOffers(rows);setAgentAlternatives({active:true,busy:false,items:rows,error:null});
    }).catch(e=>{if(!c.signal.aborted)setAgentAlternatives({active:true,busy:false,items:[],error:e instanceof Error?e.message:'جایگزین‌ها دریافت نشدند.'});});
    return()=>c.abort();
  },[autoAlternativeKey]);
  const sellerConcern=selected?getSellerConcern(upgrades.replyByOffer[selected.offer_id],arrivalChecks[selected.offer_id]?.arrival_at):null;
  const safetyKey=JSON.stringify([sellerConcern,position,upgrades.roadRevision,selected?.offer_id,visitIntent?.localTime,travelMode,travelMinutes,arrivalChecks[selected?.offer_id??'']?.risk,selected?.opening_hours.status]);
  const safetyRisk=selected?(arrivalChecks[selected.offer_id]?.risk??(selected.opening_hours.status==='declared_closed'?'closed':selected.opening_hours.status==='unknown'?'unknown':'ready')):null;
  const needsSafetyReview=!!selected&&(!!sellerConcern||safetyRisk!=='ready'||arrivalBusy||!!arrivalError)&&safetyAcknowledged!==safetyKey;
  const restoreResult=(item:RecentResult)=>{setCompletedVisit(null);controller.current?.abort();setBusy(false);setError(null);setProducts(item.page.items);setProductPage(item.page);setQuery(item.query);setNeed(item.need);setMessages([{role:'user',content:item.query.slice(0,1000)}]);setVisitIntent(item.visit);setNeedsLocation(false);setExplanation(null);setPrepared(null);setRestoredTrip(null);setFilters({...item.filters});setAssistantResults(item.assistant);setScreen('results');setOverlay(null);setProduct(null);setSelected(null);setMapFocus(null);say('assistant',`نتایج «${item.query}» را دوباره آوردم. نشانگرهای قبلی روی نقشه مانده‌اند؛ ساعت و موجودی را هنگام انتخاب فروشگاه دوباره بررسی می‌کنیم.`,'action');};
  const mapOffers=useMemo(()=>mapLibrary.map(o=>({...o,direct_distance_meters:position&&o.shop.lat!=null&&o.shop.lon!=null?directMeters(position,{lat:o.shop.lat,lon:o.shop.lon}):null})),[mapLibrary,position]);
  useEffect(()=>{if(screen==='compare'){setScreen(product?'stores':'results');setOverlay('comparison');}},[screen,product]);
  const clearComparison=()=>{setCompare([]);setModels([]);flash('انتخاب‌های مقایسه پاک شدند؛ نتایج و گفت‌وگو محفوظ‌اند.');};
  const go=(next:Screen)=>{
    if(next==='compare'){setOverlay('comparison');return;}
    if(['stores','compare','contact','trip'].includes(next)&&!product){flash('ابتدا یک محصول انتخاب کنید');return;}
    if(['contact','trip'].includes(next)&&!selected){flash('ابتدا یک پیشنهاد فروشگاه انتخاب کنید');return;}
    controller.current?.abort();setBusy(false);setError(null);setScreen(next);setOverlay(null);
  };
  const search=(value:string,more=false,preserveContext=false,silent=false,localIntent:VisitIntent|null=visitIntent)=>{
    const q=value.trim();if(!q)return;setCompletedVisit(null);const effectiveFilters=silent?{...filters,...visitPreferences(pending.current)}:filters;
    setQuery(q);setScreen('results');setOverlay(null);
    if(!more){setProducts([]);setProductPage(null);setExplanation(null);}
    if(!more&&!preserveContext){setAssistantResults(false);setExplanation(null);setNeed(null);setMessages(silent&&pending.current?[{role:'user',content:pending.current}]:[]);setProduct(null);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);if(!silent){say('user',q);setVisitIntent(null);setNeedsLocation(false);}}
    void run(async signal=>{
      const result=(more||preserveContext)&&assistantResults&&need?await api.searchCatalogue({query:need.topic_query??q,maxPrice:effectiveFilters.max||null,categoryName:need.category_name,categoryCleared:need.category_cleared,minimumBattery:need.battery_requirement.minimum_mah,sort:need.offer_sort==='nearest'?'nearest':'relevance',position,offset:more?products.length:0,limit:12},signal):localIntent&&position&&(silent||more||preserveContext)?await api.searchCatalogue({query:q,maxPrice:effectiveFilters.max||null,sort:'nearest',position,offset:more?products.length:0,limit:12},signal):await api.search(q,filters,signal,more?products.length:0);
      if(signal.aborted)return;setProductPage(result);setProducts(old=>more?[...old,...result.items]:result.items);
      if(silent&&localIntent){
        setAssistantResults(true);
        setNeed(old=>old?.topic_query===q?{...old,max_price_toman:effectiveFilters.max||null,offer_sort:'nearest'}:{version:1,topic_query:q,category_name:result.category_name??null,category_cleared:false,max_price_toman:effectiveFilters.max||null,budget_needs_input:false,offer_sort:'nearest',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]});
      }
      if(!more){
        const answer=result.items.length?'این گزینه‌ها در اطلاعات ثبت‌شده پیدا شدند. مدل مناسب را انتخاب کن تا فروشگاه‌ها، ساعت کاری و مسیر رفتن را بررسی کنم.':'با این عبارت و بودجه، محصولی در مجموعه پیدا نکردم. نام کوتاه‌تر یا بودجهٔ دیگری را امتحان کن.';
        say('assistant',answer);
        if(silent)setMessages(old=>old.at(-1)?.role==='user'?[...old.slice(-4),{role:'assistant',content:answer}]:old);
      }
    });
  };
  const ask=(value:string,retrying=false)=>{
    let q=value.trim().slice(0,1000);if(!q)return;setCompletedVisit(null);
    if(!statusChecked){deferredAsk.current=q;pending.current=q;if(!retrying)say('user',q);setScreen('decide');setBusy(true);return;}
    const requestedTopics=purchaseTopics(q);
    if(requestedTopics.length>1){
      controller.current?.abort();setBusy(false);setError(null);
      if(!retrying)say('user',q);
      setPurchaseQueue(requestedTopics);setFilters(f=>({...f,...Object.fromEntries(Object.entries(visitPreferences(q)).filter(([key])=>key!=='max'))}));
      const clock=parseVisitClock(q);if(clock)setVisitIntent({topic:'',nearbyKm:visitIntent?.nearbyKm??2,localTime:clock});
      setNeedsLocation(false);setScreen('decide');
      say('assistant',`هر ${requestedTopics.length} کالا را نگه داشتم: ${requestedTopics.join('، ')}. اول کدام را بررسی کنیم؟ بودجهٔ هر کالا را جدا مشخص کن؛ بقیهٔ کالاها هم اینجا می‌مانند.`);return;
    }
    if(purchaseQueue.length&&requestedTopics.length===1){
      const chosen=requestedTopics[0]!;
      setPurchaseQueue(old=>old.filter(topic=>!purchaseTopics(topic).some(t=>purchaseTopics(chosen).includes(t))));
      if(!/نزدیک|اطراف|حضوری|کجا/.test(q))q+='؛ فروشگاه‌های نزدیک برای خرید حضوری را بررسی کن';
    }
    if(/(?:روی|تو(?:ی)?)\s*نقشه|نقشه.*(?:نشان|نشون|ببین)/.test(q)&&!/گوشی|شارژر|هدفون|کفش|لپ.?تاپ|موبایل|کابل/.test(q)&&(products.length||selected)){
      if(!retrying)say('user',q);if(selected)showOffer(selected);else{setMapFocus(null);setMapMode('open');}return;
    }
    const transport=travelFromText(q);if(transport){setTravelMode(transport);setTravelMinutes('');if((products.length||product)&&!/گوشی|شارژر|هدفون|کفش|لپ.?تاپ|موبایل|کابل/.test(q)){if(!retrying)say('user',q);say('assistant','روش رفتن را به‌روز کردم. زمان رسیدن و وضعیت فروشگاه با همین روش بررسی می‌شود.');return;}}
    if(selected&&!/اگر|اگه|فرض/.test(q)&&/بسته بود|بسته است|بسته‌ست|ناموجود|موجود نبود|جواب نداد|پاسخ نداد|(?:جواب|پاسخ)\s*نمی[‌ ]?(?:ده|دهد)/.test(q)){if(!retrying)say('user',q);setScreen('contact');setOverlay(null);setFollowupEvent({id:crypto.randomUUID(),offer_id:selected.offer_id,outcome:/بسته/.test(q)?'closed':/ناموجود|موجود نبود/.test(q)?'out_of_stock':'no_answer',source:'user_report'});return;}
    if(/مقایسه|کدوم بهتر|کدام بهتر|(?:کدوم|کدام).*(?:بخرم|مناسب|پیشنهاد)/.test(q)&&!/(گوشی|شارژر|کفش|هدفون|لپ.?تاپ|کابل)/.test(q)&&(products.length||offers.length||models.length)){
      controller.current?.abort();setBusy(false);setError(null);if(!retrying)say('user',q);
      if(!compare.length&&!models.length){
        if(offers.length>=2)setCompare(recommendation(offers,arrivalChecks,weight).slice(0,2));
        else if(products.length>=2)setModels(products.slice(0,2));
        else{say('assistant','برای مقایسه گزینهٔ دیگری هم لازم است؛ محصول یا محدوده را تغییر بده.');return;}
      }
      setOverlay('comparison');return;
    }
    pending.current=q;if(!retrying)say('user',q);
    const preferences=visitPreferences(q);setFilters(f=>({...f,...preferences}));
    const context=need?.topic_query??product?.category_name??visitIntent?.topic??(query||null);
    const wantsVisit=/نزدیک|اطراف|حضوری|کجا.*بخر|کجا.*برم|پیاده|فروشگاه.*باز/.test(q);
    const requestedTime=parseVisitClock(q)??(/الان|همین حالا|ساعت فعلی/.test(q)?null:visitIntent?.localTime??null);
    let intent=parseVisitIntent(q,context);
    if(!intent&&context&&Object.keys(preferences).length&&!requestedTopics.length)intent={topic:context,nearbyKm:visitIntent?.nearbyKm??2,localTime:requestedTime,reuseProduct:true};if(intent&&!intent.localTime&&requestedTime)intent={...intent,localTime:requestedTime};
    setVisitIntent(intent??(requestedTime||wantsVisit?{topic:context??'',nearbyKm:visitIntent?.nearbyKm??2,localTime:requestedTime}:null));
    if(intent&&intent.topic===context&&need?.pending_requirements.length)intent=null;
    if(intent){
      if(intent.topic!==context){setNeed(null);setAssistantResults(false);setProduct(null);setSelected(null);}
      setQuery(intent.topic);
      setMessages(old=>retrying?old:[...old.slice(-4),{role:'user',content:q}]);
      if(!position){setNeedsLocation(true);setScreen('decide');say('assistant','برای بررسی فروشگاه‌های اطرافت، نقطهٔ جست‌وجو را انتخاب کن. لازم نیست دسترسی GPS بدهی؛ روی نقشه نقطه بگذار و تأیید کن، یا محله را انتخاب کن.');return;}
      setNeedsLocation(false);setFilters(f=>({...f,...visitPreferences(q),sort:'nearest'}));
      if(product&&intent.reuseProduct){setScreen('stores');setMapMode('auto');say('assistant','همین محصول را با موقعیت و ساعت انتخابی دوباره بررسی می‌کنم.','action');return;}
      search(intent.topic,false,intent.topic===context&&!!need,true,intent);return;
    }
    if(!status?.ready){setNeedsLocation(false);say('assistant','در حال حاضر جست‌وجوی مستقیم اطلاعات ثبت‌شده در دسترس است. '+agentMessage);search(q.slice(0,120),false,false,true);return;}
    setNeedsLocation(false);
    const history=conversationHistory(messages,{role:'user' as const,content:q},thread.filter(m=>m.role==='assistant'&&m.kind!=='action').at(-1)?.text);
    setScreen('decide');setQuery(q);setOverlay(null);setProduct(null);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);
    void run(async signal=>{
      const turn=await api.sendAssistant({messages:history,needState:need,position,budgetOverride:filters.max||null,offerSortOverride:filters.sort},signal).catch(async error=>{
        if(!signal.aborted){try{setStatus(await api.assistantStatus(signal));}catch{/* Preserve the original failure if the status check also fails. */}}
        throw error;
      });
      if(signal.aborted)return;
      const answer=turn.question??turn.explanation?.summary??'نتیجهٔ جست‌وجوی اطلاعات ثبت‌شده آماده است.';
      setMessages([...history,{role:'assistant',content:answer.slice(0,1000)}]);setNeed(turn.need_state);if(requestedTime||wantsVisit)setVisitIntent({topic:turn.need_state.topic_query??turn.query??'',nearbyKm:visitIntent?.nearbyKm??2,localTime:requestedTime});
      say('assistant',answer);if(/موقعیت|مختصات/.test(answer))setNeedsLocation(true);
      setExplanation(turn.explanation);setAssistantResults(true);
      setFilters(f=>({...f,...visitPreferences(q),max:turn.max_price_toman??visitPreferences(q).max??'',sort:turn.offer_sort}));
      if(turn.products){const ordered=recommendedFirst(turn.products.items,turn.explanation?.recommended_product_id);setProductPage({...turn.products,items:ordered});setProducts(ordered);setQuery(turn.query??q);setScreen('results');}
      setStatus(await api.assistantStatus(signal));
    });
  };
  useEffect(()=>{if(statusChecked&&deferredAsk.current){const text=deferredAsk.current;deferredAsk.current=null;setBusy(false);ask(text,true);}},[statusChecked]);
  const choose=(p:Product)=>{setCompletedVisit(null);controller.current?.abort();setRestoredTrip(null);setProduct(p);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);setPrepared(null);setScreen('stores');setMapMode('auto');setOverlay(null);say('assistant',`فروشگاه‌های «${p.persian_title??'این محصول'}» را بررسی می‌کنم. قیمت و ساعت کاری را با فاصلهٔ رفتن کنار هم می‌بینیم.`,'action');setReload(n=>n+1);};
  useEffect(()=>{
    if(!product||!['stores','compare'].includes(screen))return;
    const key=JSON.stringify([product.product_id,filters,position,reload,visitIntent?.localTime]);
    if(loadedOffersKey.current===key)return;
    loadedOffersKey.current=null;
    setOffers([]);setHasMore(false);setProbable([]);
    void run(async signal=>{const page=await api.offers(product.product_id,filters,position,signal,0,visitIntent?.localTime??null);if(signal.aborted)return;loadedOffersKey.current=key;setOffers(page.items);setHasMore(page.has_more);});
  },[screen,product?.product_id,filters,position,reload,visitIntent?.localTime,run]);
  useEffect(()=>{
    setInsights(null);setInsightsError(null);setInsightsBusy(false);
    if(!product||!position)return;
    const c=new AbortController();setInsightsBusy(true);
    api.visit(product.product_id,position,filters,visitIntent,c.signal).then(v=>{if(!c.signal.aborted){setInsights(v);const key=JSON.stringify([product.product_id,position.lat,position.lon,filters,visitIntent?.localTime,v.nearby,v.open_offers.items[0]?.offer_id]);if(lastGuidance.current!==key){lastGuidance.current=key;writeSession('guidance',key);say('assistant',visitGuidance(v,position.label));}}}).catch(e=>{if(!c.signal.aborted)setInsightsError(e.message);}).finally(()=>{if(!c.signal.aborted)setInsightsBusy(false);});
    return()=>c.abort();
  },[product?.product_id,position,filters,visitIntent,reload]);
  useEffect(()=>{
    setProbable([]);if(!product?.category_name||!position||filters.open||filters.credit||filters.pay||filters.kala||filters.fast)return;
    const c=new AbortController();api.probable(product.category_name,product.product_id,position,filters,c.signal).then(setProbable).catch(e=>{if(!c.signal.aborted)flash('فروشگاه‌های احتمالی بارگذاری نشدند: '+e.message);});return()=>c.abort();
  },[product?.product_id,product?.category_name,position,filters,flash]);
  const moreOffers=()=>{if(!product)return;void run(async signal=>{const page=await api.offers(product.product_id,filters,position,signal,offers.length,visitIntent?.localTime??null);if(signal.aborted)return;setOffers(old=>[...old,...page.items]);setHasMore(page.has_more);});};
  const contact=(o:Offer)=>{
    setRestoredTrip(null);selectOffer(o);setScreen('contact');setOverlay(null);setPrepared(null);
    say('assistant',`پیش‌نویس پیگیری برای «${o.shop.name??'فروشگاه انتخاب‌شده'}» را آماده می‌کنم. تماس و واتساپ در این دیتاست به‌صورت شبیه‌سازی‌اند.`,'action');
    void run(async signal=>{if(product?.product_id!==o.product_id){const item=knownProducts[o.product_id]??await api.product(o.product_id,signal);if(signal.aborted)return;setProduct(item);}const p=await api.prepare(o,position,signal,visitIntent?.localTime??null);if(!signal.aborted){setPrepared(p);setSelected(p.selected_offer);}});
  };
  const restore=(trip:SavedTrip)=>{setJourneyId('saved:'+trip.id);setCompletedVisit(null);setVisitIntent(null);setFilters({...DEFAULT_FILTERS,sort:position?'nearest':'price'});void run(async signal=>{
    const [p,prepared]=await Promise.all([api.product(trip.product_id,signal),api.request('/api/followups/prepare',signal,{product_id:trip.product_id,offer_id:trip.offer_id,shop_id:trip.shop_id,user_lat:position?.lat??null,user_lon:position?.lon??null})]);
    const ready=parsePrepared(prepared);
    const others=await Promise.all(trip.alternatives.map(async selection=>parsePrepared(await api.request('/api/followups/prepare',signal,{...selection,user_lat:position?.lat??null,user_lon:position?.lon??null})).selected_offer));
    if(signal.aborted)return;setProduct(p);selectOffer(ready.selected_offer);setRestoredTrip(trip);setPrepared(ready);setCompare(others);setScreen('trip');setOverlay(null);
  });};
  useEffect(()=>{
    if(!selected||!['contact','trip'].includes(screen))return;
    const c=new AbortController();api.prepare(selected,position,c.signal,visitIntent?.localTime??null).then(p=>{if(!c.signal.aborted){setPrepared(p);setSelected(p.selected_offer);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
  },[position,screen,selected?.offer_id,visitIntent?.localTime]);
  const toggleCompare=(o:Offer)=>{const removing=compare.some(x=>x.offer_id===o.offer_id);if(!removing&&compare.length>=3){flash('حداکثر سه پیشنهاد برای مقایسه');return;}if(!removing){if(!product&&knownProducts[o.product_id])setProduct(knownProducts[o.product_id]!);selectOffer(o);setMapFocus(null);retainOffers([o]);}setCompare(old=>old.some(x=>x.offer_id===o.offer_id)?old.filter(x=>x.offer_id!==o.offer_id):[...old,o]);};
  const toggleModel=(p:Product)=>{setMapFocus(null);setModels(old=>old.some(x=>x.product_id===p.product_id)?old.filter(x=>x.product_id!==p.product_id):old.length<3?[...old,p]:(flash('حداکثر سه محصول برای مقایسه'),old));};
  const locate=()=>{
    if(!navigator.geolocation){flash('موقعیت‌یابی در مرورگر در دسترس نیست؛ موقعیت دستی را انتخاب کنید.');setOverlay('location');return;}
    flash('در انتظار اجازهٔ موقعیت‌یابی…');
    navigator.geolocation.getCurrentPosition(p=>{updatePosition({lat:p.coords.latitude,lon:p.coords.longitude,source:'gps',label:'موقعیت من',accuracyMeters:p.coords.accuracy});setOverlay(null);},()=>{flash('موقعیت دریافت نشد؛ روی نقشه یا محله انتخاب کنید.');setOverlay('location');},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  };
  const updatePosition=(p:Position|null)=>{setPosition(p);if(p)setFilters(f=>({...f,sort:'nearest'}));setPicking(false);setMapFocus(null);setMapMode('closed');};
  const beginPick=()=>{setPicking(true);setMapFocus(null);setMapMode('open');setOverlay(null);};
  const finishPick=(lat:number,lon:number)=>{updatePosition({lat,lon,source:'manual',label:'نقطهٔ انتخاب‌شده روی نقشه',accuracyMeters:null});flash('موقعیت جست‌وجو ثبت شد');};
  const showPlace=(place:Place)=>{setMapFocus({...place});setMapMode('open');setOverlay(null);};
  const selectOffer=(o:Offer|null)=>{if(o&&['contact','trip'].includes(screen)&&o.product_id!==product?.product_id&&knownProducts[o.product_id])setProduct(knownProducts[o.product_id]!);if(selected?.offer_id!==o?.offer_id){setPrepared(null);setRestoredTrip(null);}setSelected(current=>current?.offer_id===o?.offer_id?current:o);if(o?.shop.lat!=null&&o.shop.lon!=null)setMapFocus({lat:o.shop.lat,lon:o.shop.lon,label:o.shop.name??'فروشگاه'});};
  const showOffer=(o:Offer)=>{selectOffer(o);if(o.shop.lat!==null&&o.shop.lon!==null)showPlace({lat:o.shop.lat,lon:o.shop.lon,label:o.shop.name??'فروشگاه'});else{setOverlay('nav');flash('مختصات این فروشگاه ثبت نشده؛ آدرس متنی را بررسی کن.');}};
  const resumeVisit=()=>{
    if(!position)return;
    const topic=need?.topic_query||visitIntent?.topic.trim()||query;
    setNeedsLocation(false);setFilters(f=>({...f,sort:'nearest'}));
    if(need?.pending_requirements.length){say('assistant','موقعیت ثبت شد و نیاز قبلی محفوظ است؛ شرطِ باقی‌مانده را در همین گفت‌وگو مشخص کنیم.');return;}
    if(product&&visitIntent?.reuseProduct){setScreen('stores');setReload(n=>n+1);return;}
    if(topic){say('assistant',`موقعیت ثبت شد؛ بررسی «${topic}» را از همان‌جا ادامه می‌دهم.`,'action');search(topic,false,true,true,visitIntent);}
    else if(pending.current)ask(pending.current,true);
  };
  // Resume the suspended request only after React has committed the new
  // coordinates. This covers GPS, map taps, neighbourhoods and session reload.
  useEffect(()=>{if(position&&needsLocation&&!busy)resumeVisit();},[position?.lat,position?.lon,needsLocation,busy]);
  const stop=()=>{deferredAsk.current=null;controller.current?.abort();setBusy(false);say('assistant','بررسی را متوقف کردم. می‌توانی پیامت را ویرایش کنی یا دوباره تلاش کنی.');};
  const finishTrip=()=>{
    if(screen!=='trip'||!selected)return;setJourneyId(crypto.randomUUID());controller.current?.abort();setBusy(false);setError(null);setCompletedVisit({id:crypto.randomUUID(),shopName:selected.shop.name??'فروشگاه انتخاب‌شده',productName:product?.persian_title??'محصول انتخاب‌شده'});
    say('user','این برنامهٔ مراجعه را تمام کردم.','action');say('assistant','این برنامه را بستیم. حالا برای خرید حضوری چی لازم داری؟ می‌توانیم اطراف همین موقعیت ادامه بدهیم یا نقطهٔ دیگری انتخاب کنیم. گفت‌وگو و نتایج قبلی هم در دسترس‌اند.');
    setProduct(null);setProducts([]);setProductPage(null);setSelected(null);setCompare([]);setModels([]);setOffers([]);setHasMore(false);setPrepared(null);setRestoredTrip(null);setNeed(null);setMessages([]);setQuery('');setVisitIntent(null);setInsights(null);setNeedsLocation(false);setExplanation(null);setAssistantResults(false);setProbable([]);setMapPreviewError(null);setFilters({...DEFAULT_FILTERS,sort:position?'nearest':'price'});loadedOffersKey.current=null;lastGuidance.current='';writeSession('guidance','');pending.current='';setPicking(false);setMapFocus(null);setOverlay(null);setTravelMinutes('');setSafetyAcknowledged('');setMapMode('closed');setScreen('home');
  };
  const newConversation=()=>{setPurchaseQueue([]);deferredAsk.current=null;setJourneyId(crypto.randomUUID());setTravelMinutes('');setTravelMode('walking');setCompletedVisit(null);controller.current?.abort();setBusy(false);setError(null);setThread([]);setMessages([]);setNeed(null);setQuery('');setProducts([]);setProductPage(null);setProduct(null);setOffers([]);setSelected(null);setCompare([]);setModels([]);setPrepared(null);setExplanation(null);setInsights(null);setVisitIntent(null);setNeedsLocation(false);setRestoredTrip(null);setFilters({...DEFAULT_FILTERS});setMapMode('auto');setMapFocus(null);setMapLibrary([]);setPicking(false);lastGuidance.current='';setScreen('home');setOverlay(null);pending.current='';};
  const applyFilters=(f:Filters)=>{
    setFilters(f);setOverlay(null);
    if(screen==='results'&&query){setProducts([]);void run(async signal=>{const page=assistantResults&&need?await api.searchCatalogue({query:need.topic_query??query,maxPrice:f.max||null,categoryName:need.category_name,categoryCleared:need.category_cleared,minimumBattery:need.battery_requirement.minimum_mah,sort:need.offer_sort==='nearest'?'nearest':'relevance',position,limit:12},signal):await api.search(query,f,signal);if(!signal.aborted){setProducts(page.items);setProductPage(page);}});}
    else if(product&&['contact','trip'].includes(screen))setScreen('stores');
  };
  return {...upgrades,purchaseQueue,agentAlternatives,retryAgentAlternatives:()=>setAlternativeRefresh(n=>n+1),sellerConcern,voiceRequest,openVoice:(text:string|null=null,mode:'record'|'listen'='record')=>{setVoiceRequest({text,mode});setOverlay('voice');},setFollowupFromCheck:(o:Offer,outcome:'closed'|'out_of_stock'|'no_answer')=>setFollowupEvent({id:crypto.randomUUID(),offer_id:o.offer_id,outcome,source:'simulated'}),roadConsent,setRoadConsent,routeTargets,followupEvent,journeyId,expandVisit:()=>{setFilters(f=>({...f,radius:Math.min(1000,Math.max(30,f.radius*2))}));setVisitIntent(i=>i?{...i,nearbyKm:Math.min(50,Math.max(5,i.nearbyKm*2))}:i);},setVisitTime:(clock:string|null)=>setVisitIntent(i=>({topic:i?.topic??query??product?.category_name??'',nearbyKm:i?.nearbyKm??2,localTime:clock,reuseProduct:true})),travelMode,setTravelMode,travelMinutes,setTravelMinutes,arrivalChecks,arrivalBusy,arrivalError,destinationCoverage,candidateVisits,candidateOffers,candidateBusy,candidateError,needsSafetyReview,safetyRisk,acknowledgeSafety:()=>setSafetyAcknowledged(safetyKey),completedVisit,finishTrip,rememberOffers:retainOffers,mapOffers,knownProducts,recentResults,restoreResult,mapPreviewBusy,mapPreviewError,screen,go,setScreen,overlay,setOverlay,filters,setFilters,applyFilters,position,setPosition:updatePosition,summary,saved,setSaved,query,products,productPage,product,offers,hasMore,selected,setSelected:selectOffer,compare,toggleCompare,models,toggleModel,clearComparison,probable,prepared,status,agentMessage,agent,setAgent,messages,need,explanation,restoredTrip,busy,error,setError,toast,flash,search,ask,choose,moreOffers,contact,restore,locate,weight,setWeight,retry:()=>setReload(n=>n+1),run,thread,say,needsLocation,resumeVisit,insights,insightsBusy,insightsError,visitIntent,mapMode,setMapMode,picking,beginPick,finishPick,setPicking,mapFocus,clearMapFocus:()=>setMapFocus(null),showPlace,showOffer,stop,newConversation,retryMessage:()=>ask(pending.current,true)};
}
export type Shopping = ReturnType<typeof useShopping>;
