import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as api from './client';
import {advancePurchase,rewindPurchase,revisitPurchase,freshProgress,purchaseAction,type PurchaseAction,type PurchaseProgress} from './purchaseProgress';
import {type ArrivalCheck,recommendation} from './journey';
import {useJourneyState,readSession,writeSession} from './session';
import { DEFAULT_FILTERS, type Filters, type Product, type Offer, type Position, type Screen, type Overlay, type Summary, type NeedState, type PreparedFollowup, type SavedTrip, type Probable, type Place, type VisitInsights } from './data';
import {visitIntent as parseVisitIntent,visitClock as parseVisitClock,visitDate as parseVisitDate,visitGuidance,visitPreferences,type ChatEntry,type VisitIntent} from './conversation';
import {rankingNeedContext,queuedPurchase,restoredNeedSummary,restoredPurchaseEdit,budgetOnlyEdit,purchaseTopics,exclusivePurchase,samePurchaseFamily,conversationHistory,recommendedFirst,selectedProductIndex,productReferenceIndex,accessoryDeviceReply,shortPurchaseTopic,directPurchaseQuery,canUseSimplePurchase} from './requestPlanning';
import {answerPurchaseQuestion} from './purchaseQuestions';
import type { AssistantMessage } from '../api';
import {ApiError} from '../app/base/domain/errors';
import type { CataloguePage, CatalogueProduct, Explanation } from '../app/base/domain/contracts';
import {travelLimit,hasTravelDeadline,withinTravelLimit,visitCommand,visitGoal,phoneKind,broadPhone,selectVisit,type DelegatedVisit} from './delegatedVisit';
import {currentMapOffers} from './mapResults';
import {useUpgrades} from './useUpgrades';
import {shouldConfirmNewConversation} from './navigationHistory';
import {openPanel} from './panelNavigation';
import {useFollowupAlternatives,type FollowupEvent} from './useFollowupAlternatives';
import {travelFromText,firstShopOffers,sellerConcern as getSellerConcern,type TravelMode} from './upgrades';
import { parsePrepared } from '../app/base/domain/parsers';

export type RecentResult={id:string;query:string;page:CataloguePage;need:NeedState|null;filters:Filters;assistant:boolean;visit:VisitIntent|null;createdAt:string};
export function useShopping() {
  const [newConversationPending,setNewConversationPending]=useState(false);
  const [questionCode,setQuestionCode]=useJourneyState('query','',':questionCode');
  const [delegation,setDelegation]=useJourneyState<DelegatedVisit|null>('delegation',null);
  const [purchaseQueue,setPurchaseQueue]=useJourneyState<string[]>('purchaseQueue',[]);
  const [queueSource,setQueueSource]=useJourneyState('query','',':queueSource');
  const [queueBudget,setQueueBudget]=useJourneyState('query','',':queueBudget');
  const [queuedTopic,setQueuedTopic]=useJourneyState('query','',':queuedTopic');
  const [assistantFailure,setAssistantFailure]=useJourneyState('query','',':assistantFailure');
  const [providerFailure,setProviderFailure]=useJourneyState('query','',':providerFailure');
  const [simpleSearchPending,setSimpleSearchPending]=useJourneyState('bool',false,':simpleSearchPending');
  const [travelLimitText,setTravelLimitText]=useJourneyState('duration','',':travelLimit');
  const travelLimitMinutes=travelLimitText?Number(travelLimitText):null;
  const [journeyId,setJourneyId]=useJourneyState<string>('query',crypto.randomUUID(),':journey');
  const [pendingDeparture,setPendingDeparture]=useState<string|null>(null);
  const [purchaseProgress,setPurchaseProgress]=useJourneyState<PurchaseProgress|null>('purchaseProgress',null);
  const [completedVisit,setCompletedVisit]=useJourneyState<{id:string;shopName:string;productName:string}|null>('completed',null);
  const [voiceRequest,setVoiceRequest]=useState<{text:string|null;mode:'record'|'listen'}>({text:null,mode:'record'});
  const [screen,setScreen]=useJourneyState<Screen>('screen','home');
  const [overlayStack,setOverlayStack]=useState<NonNullable<Overlay>[]>([]),overlay=overlayStack.at(-1)??null;
  const setOverlay=(next:Overlay)=>setOverlayStack(stack=>openPanel(stack,next));
  const backOverlay=()=>setOverlayStack(stack=>stack.slice(0,-1));
  const [filters,setFilters]=useJourneyState<Filters>('filters',{...DEFAULT_FILTERS}),[position,setPosition]=useJourneyState<Position|null>('position',null);
  const [summary,setSummary]=useState<Summary|null>(null),[saved,setSaved]=useState<SavedTrip[]>([]);
  const [query,setQuery]=useJourneyState('query',''),[products,setProducts]=useJourneyState<CatalogueProduct[]>('products',[]),[productPage,setProductPage]=useJourneyState<CataloguePage|null>('productPage',null);
  const [product,setProduct]=useJourneyState<Product|null>('product',null),[offers,setOffers]=useJourneyState<Offer[]>('offers',[]),[hasMore,setHasMore]=useState(false);
  const [selected,setSelected]=useJourneyState<Offer|null>('selected',null),[compare,setCompare]=useJourneyState<Offer[]>('compare',[]),[models,setModels]=useJourneyState<Product[]>('models',[]);
  const [probable,setProbable]=useState<Probable[]>([]),[prepared,setPrepared]=useState<PreparedFollowup|null>(null);
  const [status,setStatus]=useState<Awaited<ReturnType<typeof api.assistantStatus>>|null>(null);
  const [statusChecked,setStatusChecked]=useState(false),deferredAsk=useRef<string|null>(null);
  const [restoreRequest,setRestoreRequest]=useState<string|null>(null);
  const agentMessage=!status?'وضعیت دستیار دریافت نشده؛ اتصال را دوباره بررسی کنید.':{
    ready:'دستیار آمادهٔ گفت‌وگوست.',
    disabled:'دستیار گفت‌وگو فعلاً در دسترس نیست؛ نام کالا را برای جست‌وجوی ساده بنویس.',
    missing_key:'دستیار گفت‌وگو فعلاً در دسترس نیست؛ جست‌وجوی سادهٔ کالا فعال است.',
    invalid_config:'دستیار گفت‌وگو فعلاً در دسترس نیست؛ جست‌وجوی سادهٔ کالا فعال است.',
    attempt_limit:'سقف درخواست‌های ثبت‌شدهٔ دستیار تمام شده است. جست‌وجوی مستقیم همچنان فعال است.',
  }[status.reason];
  const [agent,setAgent]=useState(true),[messages,setMessages]=useJourneyState<AssistantMessage[]>('messages',[]),[need,setNeed]=useJourneyState<NeedState|null>('need',null);
  const [purchaseMemories,setPurchaseMemories]=useJourneyState<NeedState[]>('purchaseMemories',[]);
  useEffect(()=>{if(!need?.topic_query)return;const names=purchaseTopics(need.topic_query);setPurchaseMemories(old=>[need,...old.filter(n=>!names.some(t=>purchaseTopics(n.topic_query??'').some(other=>samePurchaseFamily(t,other))))].slice(0,12));},[need]);
  const [thread,setThread]=useJourneyState<ChatEntry[]>('thread',[]),[visitIntent,setVisitIntent]=useJourneyState<VisitIntent|null>('visit',null),[needsLocation,setNeedsLocation]=useJourneyState('bool',false,':needsLocation');
  const [insights,setInsights]=useState<VisitInsights|null>(null),[insightsBusy,setInsightsBusy]=useState(false),[insightsError,setInsightsError]=useState<string|null>(null);
  const [mapMode,setMapMode]=useJourneyState<'auto'|'open'|'closed'>('mapMode','auto'),[picking,setPicking]=useState(false),[mapFocus,setMapFocus]=useJourneyState<Place|null>('mapFocus',null);
  const [mapLibrary,setMapLibrary]=useJourneyState<Offer[]>('mapLibrary',[]),[knownProducts,setKnownProducts]=useJourneyState<Record<string,Product>>('knownProducts',{}),[recentResults,setRecentResults]=useJourneyState<RecentResult[]>('recentResults',[]);
  const [mapPreviewBusy,setMapPreviewBusy]=useState(false),[mapPreviewError,setMapPreviewError]=useState<string|null>(null);
  const [travelMode,setTravelMode]=useJourneyState<TravelMode>('mode','walking'),[travelMinutes,setTravelMinutes]=useJourneyState('duration','');
  const [arrivalChecks,setArrivalChecks]=useState<Record<string,ArrivalCheck>>({}),[arrivalError,setArrivalError]=useState<string|null>(null),[arrivalBusy,setArrivalBusy]=useState(false);
  const [destinationCoverage,setDestinationCoverage]=useState<{models:number;shops:number}|null>(null);
  const [candidateVisits,setCandidateVisits]=useState<{product:Product;insights:VisitInsights}[]>([]),[candidateBusy,setCandidateBusy]=useState(false),[candidateError,setCandidateError]=useState<string|null>(null);
  const [candidateVersion,setCandidateVersion]=useState(''),[arrivalVersion,setArrivalVersion]=useState('');
  const [followupEvent,setFollowupEvent]=useJourneyState<FollowupEvent|null>('followupEvent',null);
  const [safetyAcknowledged,setSafetyAcknowledged]=useJourneyState('query','',':safety');
  const pending=useRef(thread.filter(m=>m.role==='user'&&m.kind!=='action').at(-1)?.text??''),lastGuidance=useRef(readSession('guidance','',v=>typeof v==='string'?v:''));
  const retainOffers=useCallback((rows:Offer[])=>setMapLibrary(old=>[...new Map([...old,...rows].map(o=>[o.offer_id,o])).values()].slice(-500)),[]);
  const say=useCallback((role:ChatEntry['role'],text:string,kind:ChatEntry['kind']='message')=>setThread(t=>[...t.slice(-99),{id:crypto.randomUUID(),role,text,kind}]),[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[toast,setToast]=useState<string|null>(null);
  const [reload,setReload]=useState(0),[weight,setWeight]=useJourneyState('weight',50);
  const candidateContext=JSON.stringify([products.map(p=>p.product_id),position,filters,visitIntent,travelMode,travelLimitMinutes,need,reload,delegation?.id]);
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
  useEffect(()=>{if(!productPage)return;const item:RecentResult={id:crypto.randomUUID(),query,page:{...productPage,items:products},need,filters:{...filters},assistant:assistantResults,visit:visitIntent,createdAt:new Date().toISOString()};setRecentResults(old=>[item,...old.filter(r=>r.query!==query||JSON.stringify(r.filters)!==JSON.stringify(filters)||r.visit?.localTime!==visitIntent?.localTime)].slice(0,12));},[productPage]);
  useEffect(()=>{const rows=[...offers,...compare,...(insights?.open_offers.items??[]),...(selected?[selected]:[])];if(rows.length)retainOffers(rows);},[offers,compare,insights,selected,retainOffers]);
  useEffect(()=>{
    const candidates=[...new Map([...models,...products.slice(0,3)].map(p=>[p.product_id,p])).values()];
    if(!candidates.length){setMapPreviewBusy(false);return;}
    const c=new AbortController();setMapPreviewBusy(true);setMapPreviewError(null);
    Promise.allSettled(candidates.map(async p=>{const page=await api.offers(p.product_id,{...filters,sort:position?'nearest':'price'},position,c.signal,0,visitIntent?.localTime??null,visitIntent?.visitDate??null);if(!c.signal.aborted)retainOffers(page.items);return page;})).then(results=>{if(c.signal.aborted)return;if(results.some(r=>r.status==='rejected'))setMapPreviewError('بعضی فروشگاه‌ها روی نقشه دریافت نشدند. برای تلاش دوباره، محصول را انتخاب کن.');setMapPreviewBusy(false);});return()=>c.abort();
  },[products,models,filters,position,visitIntent?.localTime,visitIntent?.visitDate,retainOffers]);
  useEffect(()=>{
    setCandidateVersion('');setCandidateVisits([]);setCandidateError(null);setCandidateBusy(false);setDestinationCoverage(null);
    if(!position||!visitIntent||!products.length||need?.pending_requirements.length)return;
    const c=new AbortController();setCandidateBusy(true);
    void (async()=>{
      try{
        const found=await api.destinations(need?.topic_query||visitIntent.topic||query,position,filters,visitIntent,travelMode,need,c.signal,delegation?.excluded);
        if(c.signal.aborted)return;setDestinationCoverage({models:found.models,shops:found.shops});
        const results=await Promise.allSettled(found.ids.map(async id=>{
          const p=products.find(p=>p.product_id===id)??await api.product(id,c.signal);
          const [insights,chosen]=await Promise.all([api.visit(id,position,filters,visitIntent,c.signal),Promise.all(found.selections.filter(s=>s.product_id===id).map(s=>api.destinationOffer(s,position,visitIntent.localTime,c.signal,visitIntent.visitDate??null)))]);
          insights.open_offers.items=[...new Map([...chosen,...insights.open_offers.items].map(o=>[o.offer_id,o])).values()].slice(0,3);
          return {product:p,insights};
        }));
        if(c.signal.aborted)return;const rows=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);setCandidateVisits(rows);setCandidateVersion(candidateContext);rows.forEach(r=>retainOffers(r.insights.open_offers.items));
        if(results.some(r=>r.status==='rejected'))setCandidateError('بررسی بعضی مقصدها کامل نشد؛ نتیجهٔ نبود فروشگاه باز قطعی نیست.');
      }catch(e){if(!c.signal.aborted){setCandidateError(e instanceof Error?e.message:'بررسی مقصدها دریافت نشد.');setCandidateVersion(candidateContext);}}
      finally{if(!c.signal.aborted)setCandidateBusy(false);}
    })();return()=>c.abort();
  },[candidateContext]);
  const [roadConsent,setRoadConsent]=useJourneyState('bool',false,':roadConsent');
  const delegationCandidates=useMemo(()=>firstShopOffers(delegation?.offerId&&selected?.offer_id===delegation.offerId?[selected]:candidateVisits.flatMap(v=>v.insights.open_offers.items)).filter(o=>!delegation?.excluded.includes(o.shop_id)).slice(0,3),[delegation?.offerId,delegation?.excluded,selected,candidateVisits]);
  const routeTargets=useMemo(()=>delegation?.status==='pending'&&!delegation.phoneKind?.includes('ask')?delegationCandidates:firstShopOffers(selected?[selected]:compare).slice(0,3),[delegation?.status,delegation?.phoneKind,delegationCandidates,selected,compare]);
  const upgrades=useUpgrades({journeyId,position,mode:travelMode,targets:routeTargets,products,query:need?.topic_query??query,radius:filters.radius,consent:roadConsent,flash});
  const arrivalOffers=useMemo(()=>[...new Map([...(selected?[selected]:[]),...compare,...candidateVisits.flatMap(v=>v.insights.open_offers.items),...offers,...mapLibrary.filter(o=>models.some(p=>p.product_id===o.product_id))].map(o=>[o.offer_id,o])).values()].slice(0,30),[selected,compare,candidateVisits,offers,mapLibrary,models]);
  const [arrivalTick,setArrivalTick]=useState(0);
  useEffect(()=>{if(!selected||!['stores','contact','trip'].includes(screen))return;const timer=setInterval(()=>setArrivalTick(n=>n+1),60000);return()=>clearInterval(timer);},[selected?.offer_id,screen]);
  const arrivalKey=JSON.stringify([screen,arrivalTick,arrivalOffers.map(o=>[o.offer_id,o.product_id,o.shop_id]),position,visitIntent?.localTime,visitIntent?.visitDate,travelMode,travelMinutes,selected?.offer_id,reload,roadConsent,upgrades.roadRevision]);
  useEffect(()=>{
    setArrivalVersion('');setArrivalChecks({});setArrivalError(null);setArrivalBusy(false);if(!arrivalOffers.length)return;
    const c=new AbortController();setArrivalBusy(true);
    api.arrivals(arrivalOffers,position,visitIntent?.localTime??null,travelMode,travelMinutes,selected?.offer_id??null,c.signal,roadConsent,visitIntent?.visitDate??null).then(rows=>{if(!c.signal.aborted){setArrivalChecks(Object.fromEntries(rows.map(r=>[r.offer_id,r])));setArrivalVersion(arrivalKey);}}).catch(e=>{if(!c.signal.aborted){setArrivalError(e.message);setArrivalVersion(arrivalKey);}}).finally(()=>{if(!c.signal.aborted)setArrivalBusy(false);});return()=>c.abort();
  },[arrivalKey]);
  const candidateOffers=recommendation(candidateVisits.flatMap(v=>v.insights.open_offers.items),arrivalChecks,weight).filter(o=>withinTravelLimit(o,arrivalChecks,travelLimitMinutes));
  const {agentAlternatives,retryAgentAlternatives}=useFollowupAlternatives({offer:delegation?null:selected,reply:!delegation&&selected?upgrades.replyByOffer[selected.offer_id]??null:null,event:followupEvent,filters,position,visitTime:visitIntent?.localTime??null,visitDate:visitIntent?.visitDate??null,onOffers:retainOffers,onMessage:say});
  const sellerConcern=selected?getSellerConcern(upgrades.replyByOffer[selected.offer_id],arrivalChecks[selected.offer_id]?.arrival_at):null;
  const safetyKey=JSON.stringify([sellerConcern,position,upgrades.roadRevision,selected?.offer_id,visitIntent?.localTime,visitIntent?.visitDate,travelMode,travelMinutes,arrivalChecks[selected?.offer_id??'']?.risk,selected?.opening_hours.status]);
  const safetyRisk=selected?(arrivalChecks[selected.offer_id]?.risk??(selected.opening_hours.status==='declared_closed'?'closed':selected.opening_hours.status==='unknown'?'unknown':'ready')):null;
  const needsSafetyReview=!!selected&&(!!sellerConcern||safetyRisk!=='ready'||arrivalBusy||!!arrivalError)&&safetyAcknowledged!==safetyKey;
  const restoreResult=(item:RecentResult)=>{setDelegation(null);setFollowupEvent(null);setQuestionCode('');setCompletedVisit(null);controller.current?.abort();setBusy(false);setError(null);setProducts(item.page.items);setProductPage(item.page);setQuery(item.query);setNeed(item.need);setMessages([{role:'user',content:item.query.slice(0,1000)}]);setVisitIntent(item.visit);setNeedsLocation(false);setExplanation(null);setPrepared(null);setRestoredTrip(null);setFilters({...item.filters});setAssistantResults(item.assistant);setScreen('results');setOverlay(null);setProduct(null);setSelected(null);setMapFocus(null);say('assistant',`نتایج «${item.query}» را دوباره آوردم. نقشه با همین نتایج به‌روز شد؛ ساعت و موجودی را هنگام انتخاب فروشگاه دوباره بررسی می‌کنیم.`,'action');};
  const mapOffers=useMemo(()=>currentMapOffers(mapLibrary,[...products,...(product?[product]:[]),...candidateVisits.map(v=>v.product)],filters,position),[mapLibrary,products,product,candidateVisits,filters,position]);
  useEffect(()=>{if(screen==='compare'){setScreen(product?'stores':'results');setOverlay('comparison');}},[screen,product]);
  const clearComparison=()=>{setCompare([]);setModels([]);flash('انتخاب‌های مقایسه پاک شدند؛ نتایج و گفت‌وگو محفوظ‌اند.');};
  const go=(next:Screen)=>{
    if(next==='compare'){setOverlay('comparison');return;}
    if(['stores','compare','contact','trip'].includes(next)&&!product){flash('ابتدا یک محصول انتخاب کنید');return;}
    if(['contact','trip'].includes(next)&&!selected){flash('ابتدا یک پیشنهاد فروشگاه انتخاب کنید');return;}
    controller.current?.abort();setBusy(false);setError(null);setScreen(next);setOverlay(null);
  };
  const search=(value:string,more=false,preserveContext=false,silent=false,localIntent:VisitIntent|null=visitIntent,filterOverride?:Filters,basicPurchase=false)=>{
    const q=value.trim();if(!q)return;setCompletedVisit(null);const effectiveFilters=filterOverride??(silent?{...filters,...visitPreferences(pending.current)}:filters);
    if(filterOverride)setFilters(filterOverride);
    setQuery(q);setScreen('results');setOverlay(null);
    if(!more){setProducts([]);setProductPage(null);setExplanation(null);setQuestionCode('');}
    if(!more&&!preserveContext){setAssistantResults(false);setExplanation(null);setNeed(null);setMessages(silent&&pending.current?[{role:'user',content:pending.current}]:[]);setProduct(null);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);if(!silent){say('user',q);setVisitIntent(null);setNeedsLocation(false);}}
    void run(async signal=>{
      const result=(more||preserveContext)&&assistantResults&&need?await api.searchCatalogue({query:need.topic_query??q,maxPrice:effectiveFilters.max||null,categoryName:need.category_name,categoryCleared:need.category_cleared,minimumBattery:need.battery_requirement.minimum_mah,sourceFilters:need.source_filters,referenceProductId:need.reference_product_id,minimumCapacity:need.minimum_capacity_kg,minimumRam:need.minimum_ram_gb,rankingContext:rankingNeedContext(need),requireAnc:need.preferences?.includes('anc'),excludedKinds:need.excluded_kinds,sort:need.offer_sort==='nearest'?'nearest':'relevance',position,offset:more?products.length:0,limit:12},signal):localIntent&&position&&(silent||more||preserveContext)?await api.searchCatalogue({query:q,maxPrice:effectiveFilters.max||null,sort:'nearest',position,offset:more?products.length:0,limit:12},signal):await api.search(q,effectiveFilters,signal,more?products.length:0);
      if(signal.aborted)return;setProductPage(result);setProducts(old=>more?[...old,...result.items]:result.items);
      if(silent&&(localIntent||basicPurchase)){
        const sort=localIntent?'nearest' as const:'price' as const;
        setAssistantResults(true);
        setNeed(old=>old?.topic_query===q?{...old,max_price_toman:effectiveFilters.max||null,offer_sort:sort}:{version:1,topic_query:q,category_name:result.category_name??null,category_cleared:false,max_price_toman:effectiveFilters.max||null,budget_needs_input:false,offer_sort:sort,battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]});
      }
      if(!more){
        const answer=result.items.length&&!!delegation?'گزینه‌های مرتبط را پیدا کردم؛ انتخاب مقصد و خرید جاری را با شرایطت ادامه می‌دهم.':result.items.length?'این گزینه‌ها در اطلاعات ثبت‌شده پیدا شدند. مدل مناسب را انتخاب کن تا فروشگاه‌ها، ساعت کاری و مسیر رفتن را بررسی کنم.':'با این عبارت و بودجه، محصولی در مجموعه پیدا نکردم. نام کوتاه‌تر یا بودجهٔ دیگری را امتحان کن.';
        say('assistant',answer);
        if(silent)setMessages(old=>old.at(-1)?.role==='user'?[...old.slice(-4),{role:'assistant',content:answer}]:old);
      }
    });
  };
  const continueSimpleSearch=(text=assistantFailure,automatic=false)=>{
    const simple=directPurchaseQuery(text);
    if(!simple){setSimpleSearchPending(true);setScreen('decide');setError(null);return;}
    setAssistantFailure('');setSimpleSearchPending(false);setDelegation(null);setVisitIntent(null);setNeedsLocation(false);
    pending.current=text;
    if(!automatic)say('assistant','جست‌وجوی ساده فقط نام کالا و سقف بودجهٔ همین پیام را اعمال می‌کند؛ موجودی تأیید نشده است.');
    const preserve=automatic&&need?.topic_query===simple;
    const next=preserve?{...filters,...visitPreferences(text)}:{...DEFAULT_FILTERS,max:visitPreferences(text).max??''};
    search(simple,false,preserve,true,null,next,true);
  };
  const ask=(value:string,retrying=false,restoring=false)=>{
    const displayText=value.trim().slice(0,1000);let q=displayText;let queueSelection=false;if(!q)return;
    if(simpleSearchPending&&!retrying){
      if(!retrying)say('user',displayText);
      if(directPurchaseQuery(q))continueSimpleSearch(q);
      else say('assistant','شرایط پیام را حذف نکردم. جست‌وجوی ساده فقط نام کوتاه کالا و سقف بودجه را می‌فهمد؛ مثلاً «گوشی تا ده میلیون می‌خواهم». برای بررسی سایر ویژگی‌ها، دوباره با دستیار تلاش کن.');
      return;
    }
    setAssistantFailure('');setSimpleSearchPending(false);
    const cap=travelLimit(q);if(cap!==undefined)setTravelLimitText(cap===null?'':String(cap));
    else if(hasTravelDeadline(q)){if(!retrying)say('user',displayText);say('assistant','سقف زمان رفتن روشن نیست؛ چند دقیقه برای رسیدن وقت داری؟ مثلاً «حداکثر ۲۵ دقیقه برای رسیدن وقت دارم». محدودیت قبلی را تغییر ندادم.');return;}
    const restoreTopic=/برگردیم|برگرد به/.test(q)?purchaseTopics(q)[0]:null;
    if(restoreTopic){
      const memory=purchaseMemories.find(n=>purchaseTopics(n.topic_query??'').some(t=>samePurchaseFamily(t,restoreTopic)));
      const old=recentResults.find(r=>r.need&&JSON.stringify(r.need)===JSON.stringify(memory));
      if(memory){
        if(!retrying)say('user',displayText);
        const edit=restoredPurchaseEdit(q,restoreTopic);
        if(edit){
          controller.current?.abort();setBusy(false);setError(null);setDelegation(null);setProduct(null);setSelected(null);setProducts([]);setProductPage(null);setExplanation(null);setPrepared(null);setOverlay(null);setQuestionCode('');setNeed(memory);setAssistantResults(true);setFilters({...DEFAULT_FILTERS,...old?.filters,max:memory.max_price_toman??''});setVisitIntent(old?.visit??null);setNeedsLocation(false);setQuery(memory.topic_query??restoreTopic);setMessages([{role:'user',content:memory.topic_query??restoreTopic}]);setScreen('decide');setRestoreRequest(edit);return;
        }
        if(old&&!memory.pending_requirements.length&&!memory.budget_needs_input&&memory.battery_requirement.status!=='awaiting_minimum')restoreResult({...old,need:memory,filters:{...old.filters,max:memory.max_price_toman??''}});
        else{controller.current?.abort();setBusy(false);setNeed(memory);setFilters(f=>({...f,max:memory.max_price_toman??''}));setProduct(null);setSelected(null);setProducts([]);setProductPage(null);setScreen('decide');setQuery(memory.topic_query??'');setQuestionCode(memory.pending_requirements.length?'unsupported_filter':memory.budget_needs_input?'budget':memory.battery_requirement.status==='awaiting_minimum'?'battery_capacity':'');setMessages([{role:'user',content:memory.topic_query??restoreTopic}]);}
        say('assistant',`شرایط همان خرید را برگرداندم: ${restoredNeedSummary(memory)}`);return;
      }
    }
    const progressAction=purchaseAction(q);if(selected&&progressAction){if(!retrying)say('user',displayText);actOnPurchase(progressAction);return;}
    if(purchaseProgress?.stage==='done'){newConversation();setThread(thread);if(!retrying)say('user',displayText);deferredAsk.current=q;setBusy(true);setScreen('decide');return;}
    setCompletedVisit(null);
    if(!statusChecked){deferredAsk.current=q;pending.current=q;if(!retrying)say('user',displayText);setScreen('decide');setBusy(true);return;}
    const aboutSelection=answerPurchaseQuestion(q,{product:product??(selected?knownProducts[selected.product_id]:null)??null,recommended:products.find(p=>p.product_id===explanation?.recommended_product_id)??null,products,selected,offers:candidateOffers.length?candidateOffers:offers,checks:arrivalChecks,routes:upgrades.roadRoutes,note:delegation?.status==='planned'?delegation.note:''});
    if(aboutSelection){if(!retrying)say('user',displayText);say('assistant',aboutSelection);return;}
    if(delegation?.status==='planned'&&/اگر|اگه|فرض/.test(q)&&/بسته|ناموجود|جواب نداد/.test(q)){
      if(!retrying)say('user',displayText);say('assistant','اگر هنگام پیگیری بسته یا ناموجود بود، همین‌جا نتیجه را بگو؛ آن فروشگاه را کنار می‌گذارم و مقصد بعدی را با همین شرایط بررسی می‌کنم. فعلاً انتخاب فعلی محفوظ است.');return;
    }
    if(selected&&/برنامه.*ذخیره\s*کن/.test(q)){if(!retrying)say('user',displayText);saveCurrentPlan();return;}
    if(selected&&/مسیر.*(?:نشون|نشان|ببین)|برو(?: به)? نقشه/.test(q)&&!/اگر|اگه|فرض/.test(q)){
      if(!retrying)say('user',displayText);showOffer(selected);return;
    }
    const command=visitCommand(q),contextBefore=need?.topic_query??product?.category_name??shortPurchaseTopic(visitIntent?.topic??query);
    const deviceReply=accessoryDeviceReply(q,contextBefore);
    const namedTopics=deviceReply?[]:purchaseTopics(q),oldTopics=purchaseTopics(contextBefore??'');
    const changesPurchase=namedTopics.length>0&&oldTopics.length>0&&!namedTopics.some(t=>oldTopics.some(old=>samePurchaseFamily(t,old)));
    if(command==='cancel'){
      controller.current?.abort();setBusy(false);setDelegation(null);setQuestionCode('');if(!retrying)say('user',displayText);say('assistant','انتخاب خودکار را متوقف کردم؛ می‌توانی خودت گزینه‌ها را بررسی کنی.');return;
    }
    let task=changesPurchase?null:delegation;
    if(changesPurchase)setDelegation(null);
    if(command==='delegate'||command==='alternative'){
      task={id:crypto.randomUUID(),goal:visitGoal(q,task?.goal),status:'pending',request:q,phoneKind:phoneKind(q)??task?.phoneKind??null,excluded:command==='alternative'?[...new Set([...(task?.excluded??[]),...(selected?[selected.shop_id]:[])])].slice(-20):[],offerId:command!=='alternative'&&/همین|این فروشگاه/.test(q)?selected?.offer_id??null:null,note:''};
      controller.current?.abort();setBusy(false);setError(null);setDelegation(task);if(!task.offerId){setSelected(null);setPrepared(null);}
    }
    if(task?.status==='pending'){
      const kind=phoneKind(q),topic=namedTopics[0]??contextBefore??'';
      if(task.phoneKind==='ask'){
        if(kind){q=(task.request+'؛ '+q+'؛ '+(kind==='smart'?'گوشی هوشمند می‌خواهم':kind==='basic'?'گوشی دکمه ای می‌خواهم':'نوع گوشی فرقی ندارد')).slice(-1000);task={...task,phoneKind:kind,request:q};setDelegation(task);setQuestionCode('');}
        else{if(!retrying)say('user',displayText);setDelegation({...task,request:(task.request+'؛ '+q).slice(-1000)});say('assistant','این توضیح را نگه داشتم. فقط نوع گوشی را بگو: هوشمند، دکمه‌ای یا فرقی ندارد؟');return;}
      }else if(!task.phoneKind&&!task.offerId&&!product&&selectedProductIndex(q,products.length)===null&&broadPhone(topic)&&!/[a-z0-9۰-۹]|سامسونگ|شیائومی|نوکیا|هواوی|آنر|موتورولا/i.test(q)){
        task={...task,phoneKind:kind??'ask'};setDelegation(task);
        if(!kind){if(!retrying)say('user',displayText);setQuery('گوشی');setScreen('decide');setQuestionCode('phone_kind');setNeedsLocation(false);say('assistant','انتخاب و همراهی خرید با من. فقط گوشی هوشمند می‌خواهی یا دکمه‌ای؟ اگر فرقی ندارد بگو تا خودم انتخاب کنم.');return;}
      }
      if((command==='delegate'||command==='alternative')&&contextBefore&&products.length&&!namedTopics.length&&!/بودجه|تومان|میلیون|رنگ|سایز|درگاه/.test(q)){
        if(!retrying)say('user',displayText);const transport=travelFromText(q);if(transport){setTravelMode(transport);setTravelMinutes('');}
        setVisitIntent({topic:contextBefore,nearbyKm:visitIntent?.nearbyKm??2,visitDate:parseVisitDate(q)??visitIntent?.visitDate??null,localTime:parseVisitClock(q)??visitIntent?.localTime??null,reuseProduct:true});setNeedsLocation(!position);setScreen('results');setQuestionCode('');setOverlay(null);
        say('assistant',position?'خودم مقصدِ قابل مراجعه را انتخاب می‌کنم؛ زمان رسیدن و فرصت خرید را هم بررسی می‌کنم.':'درخواست انتخاب خودکار محفوظ است. فقط نقطهٔ شروع را روی نقشه مشخص کن؛ بعد خودم ادامه می‌دهم.');return;
      }
    }
    const referencedIndex=selectedProductIndex(q,products.length);
    if(referencedIndex!==null&&!need?.pending_requirements.length&&!need?.budget_needs_input&&need?.battery_requirement.status!=='awaiting_minimum'){
      if(!retrying)say('user',displayText);const chosen=products[referencedIndex]!;if(task?.status==='pending'){setProducts([chosen]);setNeed(old=>old?{...old,reference_product_id:chosen.product_id}:old);setVisitIntent({topic:need?.topic_query??chosen.category_name??query,nearbyKm:visitIntent?.nearbyKm??2,visitDate:visitIntent?.visitDate??null,localTime:visitIntent?.localTime??null,reuseProduct:true});setNeedsLocation(!position);setScreen('results');setQuestionCode('');return;}choose(chosen);return;
    }
    const requestedTopics=deviceReply?[]:purchaseTopics(q);
    if(requestedTopics.length>1){
      controller.current?.abort();setBusy(false);setError(null);
      if(!retrying)say('user',displayText);
      setQueueSource(q);setQueueBudget('');setQueuedTopic('');setPurchaseQueue(requestedTopics);setFilters(f=>({...f,...Object.fromEntries(Object.entries(visitPreferences(q)).filter(([key])=>key!=='max'))}));
      const clock=parseVisitClock(q);if(clock)setVisitIntent({topic:'',nearbyKm:visitIntent?.nearbyKm??2,visitDate:parseVisitDate(q)??visitIntent?.visitDate??null,localTime:clock});
      setNeedsLocation(false);setScreen('decide');
      say('assistant',`هر ${requestedTopics.length} کالا را نگه داشتم: ${requestedTopics.join('، ')}. اول کدام را بررسی کنیم؟ بودجهٔ هر کالا را جدا مشخص کن؛ بقیهٔ کالاها هم اینجا می‌مانند.`);return;
    }
    if(queueSource&&(queuedTopic||purchaseQueue.length&&requestedTopics.length===1)){
      const chosen=requestedTopics[0]??queuedTopic;
      const ownBudget=visitPreferences(q).max;
      const each=/هر\s*(?:کالا|کدوم|کدام)|برای هر/.test(q);
      const sharedBudget=visitPreferences(queueSource).max;
      const budget=ownBudget||(each?sharedBudget:null)||queueBudget||(/همان بودجه|همون بودجه/.test(q)?need?.max_price_toman:null);
      if(!budget){
        if(!retrying)say('user',displayText);setQueuedTopic(chosen);
        say('assistant',`«${chosen}» و مشخصات دستگاه و درگاه را نگه داشتم. ${sharedBudget?'بودجهٔ گفته‌شده برای هر کالا است یا مجموع خرید؟ اگر مجموع است، سقف این کالا را جدا بگو.':'سقف بودجهٔ همین کالا را بگو؛ بقیهٔ کالاها برای بعد محفوظ‌اند.'}`);return;
      }
      if(each)setQueueBudget(budget);
      q=queuedPurchase(queueSource,chosen,budget);queueSelection=true;setQueuedTopic('');
      setPurchaseQueue(old=>exclusivePurchase(displayText)?[]:old.filter(topic=>!samePurchaseFamily(topic,chosen)));
    }
    if(/(?:روی|تو(?:ی)?)\s*نقشه|نقشه.*(?:نشان|نشون|ببین)/.test(q)&&!/گوشی|شارژر|هدفون|کفش|لپ.?تاپ|موبایل|کابل/.test(q)&&(products.length||selected)){
      if(!retrying)say('user',displayText);if(selected)showOffer(selected);else{setMapFocus(null);setMapMode('open');}return;
    }
    const transport=travelFromText(q);if(transport){setTravelMode(transport);setTravelMinutes('');if(delegation?.status==='planned'){setDelegation({...delegation,id:crypto.randomUUID(),status:'pending',offerId:null,note:''});setSelected(null);}if(task?.status!=='pending'&&(products.length||product)&&!/گوشی|شارژر|هدفون|کفش|لپ.?تاپ|موبایل|کابل/.test(q)){if(!retrying)say('user',displayText);say('assistant','روش رفتن را به‌روز کردم. زمان رسیدن و وضعیت فروشگاه با همین روش بررسی می‌شود.');return;}}
    if(selected&&!/اگر|اگه|فرض/.test(q)&&/بسته بود|بسته است|بسته‌ست|ناموجود|موجود نبود|جواب نداد|پاسخ نداد|(?:جواب|پاسخ)\s*نمی[‌ ]?(?:ده|دهد)/.test(q)){if(!retrying)say('user',displayText);setScreen('contact');setOverlay(null);setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:'pending',offerId:null,excluded:[...new Set([...old.excluded,selected.shop_id])].slice(-20),note:''}:old);setFollowupEvent({id:crypto.randomUUID(),offer_id:selected.offer_id,outcome:/بسته/.test(q)?'closed':/ناموجود|موجود نبود/.test(q)?'out_of_stock':'no_answer',source:'user_report',createdAt:Date.now()});return;}
    if(!/[a-z]{1,8}\s*\d/i.test(q)&&/مقایسه|کدوم بهتر|کدام بهتر|(?:کدوم|کدام).*(?:بخرم|مناسب|پیشنهاد)/.test(q)&&!/(گوشی|شارژر|کفش|هدفون|لپ.?تاپ|کابل)/.test(q)&&(products.length||offers.length||models.length)){
      controller.current?.abort();setBusy(false);setError(null);if(!retrying)say('user',displayText);
      if(!compare.length&&!models.length){
        if(offers.length>=2)setCompare(recommendation(offers,arrivalChecks,weight).slice(0,2));
        else if(products.length>=2)setModels(products.slice(0,2));
        else{say('assistant','برای مقایسه گزینهٔ دیگری هم لازم است؛ محصول یا محدوده را تغییر بده.');return;}
      }
      setOverlay('comparison');return;
    }
    if(task&&task.status!=='pending'){setDelegation({...task,id:crypto.randomUUID(),status:'pending',offerId:null,note:''});}
    pending.current=q;if(!retrying)say('user',displayText);
    const preferences=visitPreferences(q);setFilters(f=>({...f,...preferences}));
    const context=need?.topic_query??product?.category_name??shortPurchaseTopic(visitIntent?.topic??query);
    const wantsVisit=/نزدیک|اطراف|حضوری|کجا.*بخر|کجا.*برم|پیاده|فروشگاه.*باز/.test(q);
    const parsedDate=parseVisitDate(q);
    const requestedDate=parsedDate===undefined?visitIntent?.visitDate??null:parsedDate;
    const requestedTime=parseVisitClock(q)??(/الان|همین حالا|ساعت فعلی/.test(q)?null:visitIntent?.localTime??null);
    let intent=restoring?null:parseVisitIntent(q,context);
    if(!restoring&&!intent&&context&&Object.keys(preferences).length&&!requestedTopics.length&&!queueSelection)intent={topic:context,nearbyKm:visitIntent?.nearbyKm??2,visitDate:requestedDate,localTime:requestedTime,reuseProduct:true};if(intent&&!intent.localTime&&requestedTime)intent={...intent,visitDate:requestedDate,localTime:requestedTime};
    if(intent)intent={...intent,visitDate:requestedDate};
    setVisitIntent(intent??(requestedTime||requestedDate||wantsVisit||task?.status==='pending'?{topic:context??'',nearbyKm:visitIntent?.nearbyKm??2,visitDate:requestedDate,localTime:requestedTime}:!changesPurchase?visitIntent:null));
    if(intent&&intent.topic===context&&need?.pending_requirements.length)intent=null;
    if(intent){
      if(intent.topic!==context){setNeed(null);setAssistantResults(false);setProduct(null);setSelected(null);}
      setQuery(intent.topic);
      setMessages(old=>retrying?old:[...old.slice(-4),{role:'user',content:q}]);
      if(!position){setNeedsLocation(true);setScreen('decide');say('assistant','برای بررسی فروشگاه‌های اطرافت، نقطهٔ جست‌وجو را انتخاب کن. لازم نیست دسترسی GPS بدهی؛ روی نقشه نقطه بگذار و تأیید کن، یا محله را انتخاب کن.');return;}
      setNeedsLocation(false);setFilters(f=>({...f,...visitPreferences(q),sort:'nearest'}));
      if(product&&intent.reuseProduct){setScreen('stores');setMapMode(current=>current==='open'?'open':'auto');say('assistant','همین محصول را با موقعیت و ساعت انتخابی دوباره بررسی می‌کنم.','action');return;}
      search(intent.topic,false,intent.topic===context&&!!need,true,intent);return;
    }
    if(providerFailure&&!retrying&&!restoring&&!queueSelection&&!task){
      const simple=directPurchaseQuery(q);
      if(simple&&canUseSimplePurchase(simple,need,assistantFailure)){continueSimpleSearch(q,true);return;}
      const unresolved=simple&&assistantFailure&&!directPurchaseQuery(assistantFailure)&&purchaseTopics(assistantFailure).some(t=>samePurchaseFamily(t,simple));
      if(unresolved||['provider_budget','provider_auth','attempt_limit'].includes(providerFailure)){
        const failed=unresolved?assistantFailure:q;pending.current=failed;setAssistantFailure(failed);setError(new ApiError(503,providerFailure).message);setNeedsLocation(false);setScreen('decide');return;
      }
    }
    if(!status?.ready){
      setNeedsLocation(false);const simple=directPurchaseQuery(q);
      if(!simple){setScreen('decide');say('assistant',agentMessage+' فقط نام کوتاه کالا و در صورت نیاز سقف بودجه را بنویس؛ مثلاً «گوشی تا ده میلیون می‌خواهم».');return;}
      say('assistant',agentMessage);search(simple,false,false,true,null);return;
    }
    setNeedsLocation(false);
    const history=conversationHistory(messages,{role:'user' as const,content:q},thread.filter(m=>m.role==='assistant'&&m.kind!=='action').at(-1)?.text);
    setScreen('decide');setQuery(q);setOverlay(null);setProduct(null);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);
    void run(async signal=>{
      const referenceIndex=productReferenceIndex(q,products.length);
      const turn=await api.sendAssistant({messages:history,needState:need,referenceProductId:referenceIndex===null?undefined:products[referenceIndex]?.product_id,position,budgetOverride:filters.max||null,offerSortOverride:filters.sort},signal).catch(async error=>{
        if(!signal.aborted){
          setAssistantFailure(q);
          const unavailable=error instanceof ApiError&&(error.status===0||/^(?:provider_(?:failed|timeout|rate_limit|auth|budget)|attempt_limit|disabled|missing_key|invalid_config)$/.test(error.code));
          if(unavailable){
            setProviderFailure(error.code);
            const simple=directPurchaseQuery(q);
            if(simple&&!restoring&&!queueSelection&&!task&&canUseSimplePurchase(simple,need,assistantFailure)){continueSimpleSearch(q,true);return null;}
          }
          try{setStatus(await api.assistantStatus(signal));}catch{/* Preserve the original failure if the status check also fails. */}
        }
        throw error;
      });
      if(signal.aborted||!turn)return;
      setProviderFailure('');setAssistantFailure('');
      const answer=turn.question??turn.explanation?.summary??'نتیجهٔ جست‌وجوی اطلاعات ثبت‌شده آماده است.';
      setMessages([...history,{role:'assistant',content:answer.slice(0,1000)}]);setNeed(turn.need_state);setQuestionCode(turn.question_code??'');if(requestedTime||requestedDate||wantsVisit||visitIntent&&!changesPurchase)setVisitIntent({topic:turn.need_state.topic_query??turn.query??'',nearbyKm:visitIntent?.nearbyKm??2,visitDate:requestedDate,localTime:requestedTime});
      say('assistant',answer);if(turn.question_code==='location'||/موقعیت|مختصات/.test(answer))setNeedsLocation(true);
      setExplanation(turn.explanation);setAssistantResults(true);
      setFilters(f=>({...f,...visitPreferences(q),max:turn.max_price_toman??visitPreferences(q).max??'',sort:turn.offer_sort}));
      if(turn.products){setProduct(null);setSelected(null);setOffers([]);setPrepared(null);setFollowupEvent(null);const ordered=recommendedFirst(turn.products.items,turn.explanation?.recommended_product_id);setProductPage({...turn.products,items:ordered});setProducts(ordered);setQuery(turn.query??q);setScreen('results');}
      setStatus(await api.assistantStatus(signal));
    });
  };
  useEffect(()=>{if(restoreRequest&&statusChecked){setRestoreRequest(null);const max=budgetOnlyEdit(restoreRequest);if(max!==undefined)applySuggestedBudget(max);else ask(restoreRequest,true,true);}},[restoreRequest,statusChecked]);
  useEffect(()=>{if(statusChecked&&deferredAsk.current){const text=deferredAsk.current;deferredAsk.current=null;setBusy(false);ask(text,true);}},[statusChecked,purchaseProgress?.stage]);
  const choose=(p:Product)=>{setQuestionCode('');setCompletedVisit(null);controller.current?.abort();setRestoredTrip(null);setProduct(p);setMapFocus(null);setSelected(null);setCompare([]);setOffers([]);setPrepared(null);setScreen('stores');setMapMode(current=>current==='open'?'open':'auto');setOverlay(null);say('assistant',`فروشگاه‌های «${p.persian_title??'این محصول'}» را بررسی می‌کنم. قیمت و ساعت کاری را با فاصلهٔ رفتن کنار هم می‌بینیم.`,'action');setReload(n=>n+1);};
  useEffect(()=>{
    if(!product||!['stores','compare'].includes(screen))return;
    const key=JSON.stringify([product.product_id,filters,position,reload,visitIntent?.localTime,visitIntent?.visitDate]);
    if(loadedOffersKey.current===key)return;
    loadedOffersKey.current=null;
    setOffers([]);setHasMore(false);setProbable([]);
    void run(async signal=>{const page=await api.offers(product.product_id,filters,position,signal,0,visitIntent?.localTime??null,visitIntent?.visitDate??null);if(signal.aborted)return;loadedOffersKey.current=key;setOffers(page.items);setHasMore(page.has_more);});
  },[screen,product?.product_id,filters,position,reload,visitIntent?.localTime,visitIntent?.visitDate,run]);
  useEffect(()=>{
    setInsights(null);setInsightsError(null);setInsightsBusy(false);
    if(!product||!position)return;
    const c=new AbortController();setInsightsBusy(true);
    api.visit(product.product_id,position,filters,visitIntent,c.signal).then(v=>{if(!c.signal.aborted){setInsights(v);const key=JSON.stringify([product.product_id,position.lat,position.lon,{...filters,sort:undefined},visitIntent?.localTime,visitIntent?.visitDate,v.nearby,v.open_offers.items[0]?.offer_id]);if(lastGuidance.current!==key){lastGuidance.current=key;writeSession('guidance',key);if(!delegation&&!['en_route','arrived','problem','done'].includes(purchaseProgress?.stage??''))say('assistant',visitGuidance(v,position.label,travelLimitMinutes));}}}).catch(e=>{if(!c.signal.aborted)setInsightsError(e.message);}).finally(()=>{if(!c.signal.aborted)setInsightsBusy(false);});
    return()=>c.abort();
  },[product?.product_id,position,filters,visitIntent,travelLimitMinutes,reload,delegation?.id]);
  useEffect(()=>{
    setProbable([]);if(!product?.category_name||!position||filters.open||filters.credit||filters.pay||filters.kala||filters.fast)return;
    const c=new AbortController();api.probable(product.category_name,product.product_id,position,filters,c.signal).then(setProbable).catch(e=>{if(!c.signal.aborted)flash('فروشگاه‌های احتمالی بارگذاری نشدند: '+e.message);});return()=>c.abort();
  },[product?.product_id,product?.category_name,position,filters,flash]);
  const moreOffers=()=>{if(!product)return;void run(async signal=>{const page=await api.offers(product.product_id,filters,position,signal,offers.length,visitIntent?.localTime??null,visitIntent?.visitDate??null);if(signal.aborted)return;setOffers(old=>[...old,...page.items]);setHasMore(page.has_more);});};
  const contact=(o:Offer)=>{
    if(purchaseProgress?.stage==='done')setPurchaseProgress(freshProgress(o.offer_id));
    setDelegation(null);setRestoredTrip(null);selectOffer(o);setScreen('contact');setOverlay(null);setPrepared(null);
    say('assistant',`متن پیشنهادی برای «${o.shop.name??'فروشگاه انتخاب‌شده'}» را آماده می‌کنم. آزمایشی؛ بدون ارتباط واقعی با فروشنده.`,'action');
    void run(async signal=>{if(product?.product_id!==o.product_id){const item=knownProducts[o.product_id]??await api.product(o.product_id,signal);if(signal.aborted)return;setProduct(item);}const p=await api.prepare(o,position,signal,visitIntent?.localTime??null,visitIntent?.visitDate??null);if(!signal.aborted){setPrepared(p);setSelected(p.selected_offer);}});
  };
  const restore=(trip:SavedTrip)=>{setPurchaseProgress(null);setDelegation(null);setFollowupEvent(null);setQuestionCode('');setJourneyId('saved:'+trip.id);setCompletedVisit(null);setVisitIntent(null);setFilters({...DEFAULT_FILTERS,sort:position?'nearest':'price'});void run(async signal=>{
    const [p,prepared]=await Promise.all([api.product(trip.product_id,signal),api.request('/api/followups/prepare',signal,{product_id:trip.product_id,offer_id:trip.offer_id,shop_id:trip.shop_id,user_lat:position?.lat??null,user_lon:position?.lon??null})]);
    const ready=parsePrepared(prepared);
    const others=await Promise.all(trip.alternatives.map(async selection=>parsePrepared(await api.request('/api/followups/prepare',signal,{...selection,user_lat:position?.lat??null,user_lon:position?.lon??null})).selected_offer));
    if(signal.aborted)return;setProduct(p);selectOffer(ready.selected_offer);setRestoredTrip(trip);setPrepared(ready);setCompare(others);setScreen('trip');setOverlay(null);
  });};
  useEffect(()=>{
    if(!selected||!['contact','trip'].includes(screen))return;
    const c=new AbortController();api.prepare(selected,position,c.signal,visitIntent?.localTime??null,visitIntent?.visitDate??null).then(p=>{if(!c.signal.aborted){setPrepared(p);setSelected(p.selected_offer);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
  },[position,screen,selected?.offer_id,visitIntent?.localTime,visitIntent?.visitDate]);
  const toggleCompare=(o:Offer)=>{const removing=compare.some(x=>x.offer_id===o.offer_id);if(!removing&&compare.length>=3){flash('حداکثر سه پیشنهاد برای مقایسه');return;}if(!removing){if(!product&&knownProducts[o.product_id])setProduct(knownProducts[o.product_id]!);selectOffer(o);setMapFocus(null);retainOffers([o]);}setCompare(old=>old.some(x=>x.offer_id===o.offer_id)?old.filter(x=>x.offer_id!==o.offer_id):[...old,o]);};
  const toggleModel=(p:Product)=>{setMapFocus(null);setModels(old=>old.some(x=>x.product_id===p.product_id)?old.filter(x=>x.product_id!==p.product_id):old.length<3?[...old,p]:(flash('حداکثر سه محصول برای مقایسه'),old));};
  const locate=()=>{
    if(!navigator.geolocation){flash('موقعیت‌یابی در مرورگر در دسترس نیست؛ موقعیت دستی را انتخاب کنید.');setOverlay('location');return;}
    flash('در انتظار اجازهٔ موقعیت‌یابی…');
    navigator.geolocation.getCurrentPosition(p=>{updatePosition({lat:p.coords.latitude,lon:p.coords.longitude,source:'gps',label:'موقعیت من',accuracyMeters:p.coords.accuracy});setOverlay(null);},()=>{flash('موقعیت دریافت نشد؛ روی نقشه یا محله انتخاب کنید.');setOverlay('location');},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  };
  const updatePosition=(p:Position|null)=>{if(delegation){setDelegation({...delegation,id:crypto.randomUUID(),status:'pending',offerId:null,note:''});setSelected(null);}setPosition(p);if(p)setFilters(f=>({...f,sort:'nearest'}));setPicking(false);setMapFocus(null);};
  const beginPick=()=>{setPicking(true);setMapFocus(null);setMapMode('open');setOverlay(null);};
  const finishPick=(lat:number,lon:number)=>{updatePosition({lat,lon,source:'manual',label:'نقطهٔ انتخاب‌شده روی نقشه',accuracyMeters:null});flash('موقعیت جست‌وجو ثبت شد');};
  const showPlace=(place:Place)=>{setMapFocus({...place});setMapMode('open');setOverlay(null);};
  const selectOffer=(o:Offer|null)=>{if(o&&delegation?.status==='planned'&&o.offer_id!==delegation.offerId)setDelegation(null);if(o&&['contact','trip'].includes(screen)&&o.product_id!==product?.product_id&&knownProducts[o.product_id])setProduct(knownProducts[o.product_id]!);if(selected?.offer_id!==o?.offer_id){setPrepared(null);setRestoredTrip(null);setPurchaseProgress(o?freshProgress(o.offer_id):null);setCompletedVisit(null);}setSelected(current=>current?.offer_id===o?.offer_id&&current?.direct_distance_meters===o?.direct_distance_meters?current:o);if(o?.shop.lat!=null&&o.shop.lon!=null)setMapFocus({lat:o.shop.lat,lon:o.shop.lon,label:o.shop.name??'فروشگاه'});};
  const showOffer=(o:Offer)=>{selectOffer(o);if(o.shop.lat!==null&&o.shop.lon!==null)showPlace({lat:o.shop.lat,lon:o.shop.lon,label:o.shop.name??'فروشگاه'});else{setOverlay('nav');flash('مختصات این فروشگاه ثبت نشده؛ آدرس متنی را بررسی کن.');}};
  const resumeVisit=()=>{
    if(!position)return;
    const topic=need?.topic_query||shortPurchaseTopic(visitIntent?.topic??query);
    setNeedsLocation(false);setFilters(f=>({...f,sort:'nearest'}));
    if(need?.pending_requirements.length){say('assistant','موقعیت ثبت شد و نیاز قبلی محفوظ است؛ شرطِ باقی‌مانده را در همین گفت‌وگو مشخص کنیم.');return;}
    if(product&&visitIntent?.reuseProduct){setScreen('stores');setReload(n=>n+1);return;}
    // A suspended natural-language request still needs intent interpretation.
    // Never search its accumulated conversation as a literal product query.
    if(!need?.topic_query&&pending.current&&status?.ready){ask(pending.current,true);return;}
    if(topic){say('assistant',`موقعیت ثبت شد؛ بررسی «${topic}» را از همان‌جا ادامه می‌دهم.`,'action');search(topic,false,true,true,visitIntent);}
    else if(pending.current)ask(pending.current,true);
  };
  // Resume the suspended request only after React has committed the new
  // coordinates. This covers GPS, map taps, neighbourhoods and session reload.
  useEffect(()=>{if(position&&needsLocation&&!busy)resumeVisit();},[position?.lat,position?.lon,needsLocation,busy]);
  useEffect(()=>{if(delegation?.status==='pending'&&delegation.phoneKind!=='ask'&&products.length&&!position&&!busy&&!questionCode)setNeedsLocation(true);},[delegation,products,position,busy,questionCode]);
  const stop=()=>{setDelegation(null);deferredAsk.current=null;controller.current?.abort();setBusy(false);say('assistant','بررسی را متوقف کردم. می‌توانی پیامت را ویرایش کنی یا دوباره تلاش کنی.');};
  useEffect(()=>{
    if(!selected)return;
    const reply=upgrades.replyByOffer[selected.offer_id];
    const event=followupEvent?.offer_id===selected.offer_id?followupEvent:null;
    const latest=event&&(!reply||event.createdAt>=Date.parse(reply.responded_at))?{outcome:event.outcome,source:event.source}:reply?{outcome:reply.outcome,source:'simulated' as const}:null;
    if(!latest)return;
    setPurchaseProgress(old=>{
      const p=old?.offerId===selected.offer_id?old:freshProgress(selected.offer_id);
      if(p.stage==='done'||JSON.stringify(p.evidence)===JSON.stringify(latest))return p;
      if(['closed','out_of_stock','no_answer'].includes(latest.outcome))return {...p,evidence:latest,stage:'problem',problem:latest.outcome==='closed'?'closed':latest.outcome==='out_of_stock'?'out_of_stock':null};
      return {...p,evidence:latest,...(p.stage==='problem'?{stage:p.startedAt?'arrived' as const:'ready' as const,problem:null}:{})};
    });
  },[selected?.offer_id,followupEvent,upgrades.replyByOffer]);
  const activePurchase=selected?(purchaseProgress?.offerId===selected.offer_id?purchaseProgress:freshProgress(selected.offer_id)):null;
  const actOnPurchase=(action:PurchaseAction,postponementSaved=false)=>{
    if(!selected||!activePurchase)return;
    if(action==='later'&&!postponementSaved&&!saved.some(t=>t.offer_id===selected.offer_id)){
      void run(async signal=>{const trip=await api.saveTrip(selected,[],[]);if(signal.aborted)return;setSaved(old=>[trip,...old]);actOnPurchase('later',true);});return;
    }
    if(action==='available'){recordVisitResult('available');flash('طبق گزارش تو، کالا موجود است.');return;}
    if(action==='start'&&(visitIntent?.localTime||visitIntent?.visitDate)){setPendingDeparture(selected.offer_id);setVisitIntent(i=>i?{...i,visitDate:null,localTime:null}:null);flash('ساعت حرکت را به الان تغییر دادم؛ بازبودن هنگام رسیدن را دوباره بررسی می‌کنم.');return;}
    if(action==='start'&&needsSafetyReview){setScreen('trip');flash('هشدار مراجعه را بررسی کن؛ بعد حرکت را شروع کنیم.');return;}
    if(action==='start'&&!position){setOverlay('location');return;}
    const current=(action==='purchased'||action==='not_purchased')&&activePurchase.stage!=='done'?{...activePurchase,stage:'arrived' as const}:activePurchase;
    const next=advancePurchase(current,action);
    if(next===activePurchase){flash(action==='arrive'?'اول حرکت را شروع کن.':'نتیجهٔ خرید را بعد از رسیدن ثبت کنیم.');return;}
    setPurchaseProgress(next);setScreen('trip');setOverlay(null);
    if(action==='start'){
      setDelegation(null);setVisitIntent(i=>i?{...i,visitDate:null,localTime:null}:null);showOffer(selected);
      say('assistant',`راه افتادیم به سمت «${selected.shop.name??'فروشگاه'}». مسیر و قدم بعدی روی نقشه است؛ وقتی رسیدی «رسیدم» را بزن.`,'action');
    }else if(action==='arrive')say('assistant','رسیدی؛ حالا بازبودن و موجودی را بررسی کن. خرید کردی یا مشکلی پیش آمد؟','action');
    else if(action==='closed'||action==='out_of_stock'){
      setDelegation(null);setFollowupEvent({id:crypto.randomUUID(),offer_id:selected.offer_id,outcome:action,source:'user_report',createdAt:Date.now()});
    }else if(next.stage==='done'){
      setDelegation(null);setCompletedVisit({id:crypto.randomUUID(),shopName:selected.shop.name??'فروشگاه',productName:product?.persian_title??'محصول انتخاب‌شده'});
      say('assistant',action==='purchased'?'خریدت انجام شد؛ این خرید تمام شد. می‌توانی از برنامه خارج شوی؛ خرید بعدی هر وقت خودت خواستی.':action==='later'?'مراجعه را برای بعد گذاشتیم؛ فعلاً کاری باقی نمانده. ادامهٔ همین خرید از این صفحه در دسترس است.':'این مراجعه تمام شد؛ خریدی ثبت نکردیم. می‌توانی خارج شوی یا هر وقت خواستی خرید دیگری شروع کنی.','action');
    }
  };
  useEffect(()=>{
    if(!pendingDeparture)return;
    if(selected?.offer_id!==pendingDeparture||activePurchase?.stage!=='ready'){setPendingDeparture(null);return;}
    if(visitIntent?.localTime||visitIntent?.visitDate||arrivalBusy||arrivalVersion!==arrivalKey)return;
    setPendingDeparture(null);
    if(needsSafetyReview){flash('برای حرکت در همین زمان، هشدار مراجعه را بررسی کن.');return;}
    actOnPurchase('start');
  },[pendingDeparture,selected?.offer_id,activePurchase?.stage,visitIntent?.localTime,visitIntent?.visitDate,arrivalBusy,arrivalVersion,arrivalKey,needsSafetyReview]);
  const backPurchase=()=>{
    if(!activePurchase||busy)return;
    setPendingDeparture(null);setOverlay(null);setDelegation(null);
    if(activePurchase.stage==='ready'||activePurchase.stage==='problem'){setScreen('stores');return;}
    setPurchaseProgress(rewindPurchase(activePurchase));setCompletedVisit(null);setSafetyAcknowledged('');setScreen('trip');
  };
  const jumpPurchase=(index:number)=>{
    if(!activePurchase||busy)return;
    const next=revisitPurchase(activePurchase,index);if(!next)return;
    setPendingDeparture(null);setDelegation(null);setOverlay(null);
    if(next!==activePurchase){setPurchaseProgress(next);setCompletedVisit(null);setSafetyAcknowledged('');}
    setScreen('trip');
  };
  const finishTrip=()=>actOnPurchase('cancelled');
  const resumePurchase=()=>{if(!selected)return;setFollowupEvent(null);setVisitIntent(i=>i?{...i,visitDate:null,localTime:null}:null);setPurchaseProgress(freshProgress(selected.offer_id));setCompletedVisit(null);setScreen('trip');};
  const recordVisitResult=(outcome:'available'|'closed'|'out_of_stock',source:'user_report'|'simulated'='user_report')=>{
    if(!selected)return;setDelegation(null);setFollowupEvent({id:crypto.randomUUID(),offer_id:selected.offer_id,outcome,source,createdAt:Date.now()});
    if(activePurchase&&(outcome==='closed'||outcome==='out_of_stock'))setPurchaseProgress({...advancePurchase(activePurchase,outcome),evidence:{outcome,source}});
  };
  const clearConversation=()=>{setProviderFailure('');setAssistantFailure('');setSimpleSearchPending(false);setRestoreRequest(null);setNewConversationPending(false);setPendingDeparture(null);setPurchaseProgress(null);setDelegation(null);setFollowupEvent(null);setQuestionCode('');setPurchaseQueue([]);setPurchaseMemories([]);setQueueSource('');setQueueBudget('');setQueuedTopic('');setTravelLimitText('');deferredAsk.current=null;setJourneyId(crypto.randomUUID());setTravelMinutes('');setTravelMode('walking');setCompletedVisit(null);controller.current?.abort();setBusy(false);setError(null);setThread([]);setMessages([]);setNeed(null);setQuery('');setProducts([]);setProductPage(null);setProduct(null);setOffers([]);setSelected(null);setCompare([]);setModels([]);setPrepared(null);setExplanation(null);setInsights(null);setVisitIntent(null);setNeedsLocation(false);setRestoredTrip(null);setFilters({...DEFAULT_FILTERS});setMapMode(current=>current==='open'?'open':'auto');setMapFocus(null);setMapLibrary([]);setPicking(false);lastGuidance.current='';setScreen('home');setOverlay(null);pending.current='';};
  const newConversation=()=>{if(shouldConfirmNewConversation(thread.length))setNewConversationPending(true);else clearConversation();};
  const restoreNavigation=(next:Screen,progress?:PurchaseProgress|null)=>{
    controller.current?.abort();setBusy(false);setError(null);setOverlay(null);setPendingDeparture(null);
    if(progress&&progress.offerId===selected?.offer_id){setPurchaseProgress(progress);setCompletedVisit(null);setSafetyAcknowledged('');}
    setScreen(next);
  };
  useEffect(()=>{
    if(delegation?.status!=='pending'||delegation.phoneKind==='ask'||needsLocation||busy||candidateBusy||arrivalBusy||upgrades.roadBusy||!position||!products.length||questionCode||need?.pending_requirements.length||need?.budget_needs_input||need?.battery_requirement.status==='awaiting_minimum')return;
    if(candidateVersion!==candidateContext)return;
    if(travelMode==='manual'){setDelegation(old=>old?{...old,status:'blocked',note:'برای انتخاب خودکار بین مسیرها، پیاده، خودرو یا دوچرخه را انتخاب کن؛ زمان دستی فقط برای مقصد مشخص قابل استفاده است.'}:old);return;}
    if(!roadConsent)return;
    if(delegationCandidates.length&&arrivalVersion!==arrivalKey)return;
    // Effects that fetch candidates/checks run first; wait for their committed data.
    if(!candidateVisits.length&&!candidateError&&candidateBusy===false&&!destinationCoverage)return;
    if(delegationCandidates.length&&(!upgrades.roadRoutes.length&&!upgrades.roadError||delegationCandidates.some(o=>!arrivalChecks[o.offer_id])&&!arrivalError))return;
    const winner=selectVisit(delegationCandidates,arrivalChecks,upgrades.roadRoutes,delegation.goal,delegation.excluded,travelLimitMinutes);
    const p=winner?(knownProducts[winner.product_id]??candidateVisits.find(v=>v.product.product_id===winner.product_id)?.product):null;
    if(!winner||!p){setSelected(null);setDelegation(old=>old?{...old,status:'blocked',note:candidateError??arrivalError??upgrades.roadError??'بین مقصدهای بررسی‌شده، مسیر و فرصت خرید مطمئن پیدا نشد. ساعت، روش رفتن یا محدوده را تغییر بده.'}:old);return;}
    setProduct(p);selectOffer(winner);retainOffers([winner]);setScreen('trip');setOverlay(null);setMapMode(current=>current==='open'?'open':'auto');setRestoredTrip(null);setDelegation(old=>old?{...old,status:'planned',offerId:winner.offer_id,note:`از بین ${delegationCandidates.length} مقصد نزدیکِ بررسی‌شده، ${delegation.goal==='cheapest'?'کمترین قیمتِ دارای فرصت مراجعه':delegation.goal==='nearest'?'مسیر کوتاه‌ترِ دارای فرصت مراجعه':'مسیر سریع‌ترِ دارای فرصت مراجعه'} انتخاب شد؛ موجودی هنوز تأیید نشده است.`}:old);
    say('assistant',`«${winner.shop.name}» را انتخاب کردم و مقصد خرید جاری آماده است. مسیر و جزئیات همین انتخاب روی نقشه هم آماده‌اند. موجودی را پیش از حرکت بررسی کن.`,'action');
  },[candidateVersion,candidateContext,arrivalVersion,arrivalKey,travelMode,delegation,needsLocation,busy,candidateBusy,arrivalBusy,upgrades.roadBusy,upgrades.roadRoutes,upgrades.roadError,position,products,questionCode,need,candidateVisits,candidateError,destinationCoverage,delegationCandidates,arrivalChecks,arrivalError,roadConsent]);
  useEffect(()=>{
    if(delegation?.status==='pending'&&delegation.phoneKind!=='ask'&&!busy&&!questionCode&&productPage&&!products.length){setDelegation(old=>old?{...old,status:'blocked',note:'با شرایط فعلی کالای منطبق پیدا نشد؛ بودجه یا شرط همین خرید را تغییر بده تا انتخاب را ادامه بدهم.'}:old);}
  },[delegation,busy,questionCode,productPage,products.length]);
  const saveCurrentPlan=()=>{
    if(!selected)return;
    if(saved.some(t=>t.offer_id===selected.offer_id)){flash('این برنامه قبلاً ذخیره شده است.');return;}
    if(needsSafetyReview){flash('هشدار زمان رسیدن را پیش از ذخیره بررسی کن.');return;}
    void run(async signal=>{const trip=await api.saveTrip(selected,[],[]);if(signal.aborted)return;setSaved(old=>[trip,...old]);say('assistant','برنامهٔ همین مقصد در برنامه‌های قبلی ذخیره شد.','action');});
  };
  const applyFilters=(f:Filters)=>{
    setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:"pending",note:""}:old);setFilters(f);setOverlay(null);
    if(screen==='results'&&query){setProducts([]);void run(async signal=>{const page=assistantResults&&need?await api.searchCatalogue({query:need.topic_query??query,maxPrice:f.max||null,categoryName:need.category_name,categoryCleared:need.category_cleared,minimumBattery:need.battery_requirement.minimum_mah,sourceFilters:need.source_filters,referenceProductId:need.reference_product_id,minimumCapacity:need.minimum_capacity_kg,minimumRam:need.minimum_ram_gb,rankingContext:rankingNeedContext(need),requireAnc:need.preferences?.includes('anc'),excludedKinds:need.excluded_kinds,sort:need.offer_sort==='nearest'?'nearest':'relevance',position,limit:12},signal):await api.search(query,f,signal);if(!signal.aborted){setProducts(page.items);setProductPage(page);}});}
    else if(product&&['contact','trip'].includes(screen))setScreen('stores');
  };
  const applySuggestedBudget=(max:string)=>{
    if(max&&(!/^\d{1,19}$/.test(max)||BigInt(max)>9223372036854775807n)){flash('مبلغ معتبر به تومان وارد کن.');return;}
    if(max&&filters.min&&BigInt(max)<BigInt(filters.min)){flash('سقف بودجه از حداقل قیمت فعلی کمتر است؛ ابتدا حداقل را اصلاح کن.');return;}
    const topic=need?.topic_query??visitIntent?.topic??query;
    if(!topic){flash('ابتدا کالای موردنظرت را مشخص کن.');return;}
    pending.current=topic;
    setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:"pending",note:""}:old);
    const next={...filters,max};setFilters(next);setOverlay(null);setExplanation(null);
    setNeed(old=>old?{...old,max_price_toman:max||null,budget_needs_input:false}:old);
    flash(max?'سقف بودجه برای همین خرید ثبت شد.':'سقف بودجه برداشته شد.');
    if(selected&&(selected.price_toman===null||max&&BigInt(selected.price_toman)>BigInt(max))){setSelected(null);setPrepared(null);setRestoredTrip(null);setMapFocus(null);}
    if(need?.pending_requirements.length){setQuestionCode('unsupported_filter');say('assistant','بودجه ثبت شد. شرط‌های بررسی‌نشده را از پاسخ‌های آماده مشخص کنیم؛ بقیهٔ نیازت محفوظ است.');return;}
    if(need?.battery_requirement.status==='awaiting_minimum'){setQuestionCode('battery_capacity');say('assistant','بودجه ثبت شد. حداقل ظرفیت ثبت‌شدهٔ باتری را چند میلی‌آمپرساعت در نظر بگیرم؟');return;}
    setQuestionCode('');
    if(!position&&(needsLocation||need?.offer_sort==='nearest')){setNeedsLocation(true);setScreen('decide');return;}
    if(product&&['stores','contact','trip'].includes(screen)){setScreen('stores');return;}
    setQuery(topic);setScreen('results');setProducts([]);setProductPage(null);
    void run(async signal=>{
      const page=need?await api.searchCatalogue({query:topic,maxPrice:max||null,categoryName:need.category_name,categoryCleared:need.category_cleared,minimumBattery:need.battery_requirement.minimum_mah,sourceFilters:need.source_filters,referenceProductId:need.reference_product_id,minimumCapacity:need.minimum_capacity_kg,minimumRam:need.minimum_ram_gb,rankingContext:rankingNeedContext(need),requireAnc:need.preferences?.includes('anc'),excludedKinds:need.excluded_kinds,sort:position&&need.offer_sort==='nearest'?'nearest':'relevance',position,limit:12},signal):await api.search(topic,next,signal);
      if(!signal.aborted){setProducts(page.items);setProductPage(page);}
    });
  };
  return {...upgrades,assistantFailure,simpleSearchPending,continueSimpleSearch,travelLimitMinutes,overlayStack,backOverlay,restorePanels:(stack:NonNullable<Overlay>[])=>setOverlayStack(stack),jumpPurchase,newConversationPending,cancelNewConversation:()=>setNewConversationPending(false),confirmNewConversation:clearConversation,restoreNavigation,activePurchase,backPurchase,actOnPurchase,resumePurchase,recordVisitResult,saveCurrentPlan,delegation,cancelDelegation:()=>{setDelegation(null);setQuestionCode('');},retryDelegation:()=>{setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:'pending',note:''}:old);setReload(n=>n+1);upgrades.retryRoad();},questionCode,applySuggestedBudget,purchaseQueue,agentAlternatives,retryAgentAlternatives,sellerConcern,voiceRequest,openVoice:(text:string|null=null,mode:'record'|'listen'='record')=>{setVoiceRequest({text,mode});setOverlay('voice');},recordFollowup:(o:Offer,outcome:import('./data').Report['outcome'],source:import('./data').Report['source'])=>setFollowupEvent({id:crypto.randomUUID(),offer_id:o.offer_id,outcome,source,createdAt:Date.now()}),setFollowupFromCheck:(o:Offer,outcome:'closed'|'out_of_stock'|'no_answer')=>{if(upgrades.replyByOffer[o.offer_id]?.outcome!==outcome)setFollowupEvent({id:crypto.randomUUID(),offer_id:o.offer_id,outcome,source:'simulated',createdAt:Date.now()});},roadConsent,setRoadConsent,routeTargets,followupEvent,journeyId,expandVisit:()=>{setFilters(f=>({...f,radius:Math.min(1000,Math.max(30,f.radius*2))}));setVisitIntent(i=>i?{...i,nearbyKm:Math.min(50,Math.max(5,i.nearbyKm*2))}:i);},setVisitTime:(clock:string|null)=>{setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:'pending',offerId:null,note:''}:old);setVisitIntent(i=>({topic:i?.topic??query??product?.category_name??'',nearbyKm:i?.nearbyKm??2,visitDate:clock?i?.visitDate??null:null,localTime:clock,reuseProduct:true}));},travelMode,setTravelMode:(mode:TravelMode)=>{setDelegation(old=>old?{...old,id:crypto.randomUUID(),status:'pending',offerId:null,note:''}:old);setTravelMode(mode);},travelMinutes,setTravelMinutes,arrivalChecks,arrivalBusy,arrivalError,destinationCoverage,candidateVisits,candidateOffers,candidateBusy,candidateError,needsSafetyReview,safetyRisk,acknowledgeSafety:()=>setSafetyAcknowledged(safetyKey),completedVisit,finishTrip,rememberOffers:retainOffers,mapOffers,knownProducts,recentResults,restoreResult,mapPreviewBusy,mapPreviewError,screen,go,setScreen,overlay,setOverlay,filters,setFilters,applyFilters,position,setPosition:updatePosition,summary,saved,setSaved,query,products,productPage,product,offers,hasMore,selected,setSelected:selectOffer,compare,toggleCompare,models,toggleModel,clearComparison,probable,prepared,status,agentMessage,agent,setAgent,messages,need,explanation,restoredTrip,busy,error,setError,toast,flash,search,ask,choose,moreOffers,contact,restore,locate,weight,setWeight,retry:()=>setReload(n=>n+1),run,thread,say,needsLocation,resumeVisit,insights,insightsBusy,insightsError,visitIntent,mapMode,setMapMode,picking,beginPick,finishPick,setPicking,mapFocus,clearMapFocus:()=>setMapFocus(null),showPlace,showOffer,stop,newConversation,retryMessage:()=>ask(pending.current,true)};
}
export type Shopping = ReturnType<typeof useShopping>;
