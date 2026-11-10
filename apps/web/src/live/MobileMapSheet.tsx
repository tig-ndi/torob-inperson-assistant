import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {ArrowRight,Check,ChevronUp,ChevronDown,List,Map,MessageCircle,Navigation,Store,MapPin} from 'lucide-react';
import TouchAction from './TouchAction';
import {Price} from '../prototype/ui';
import {distance,fa,openLabel,type Offer} from './data';
import DestinationAddress from './DestinationAddress';

export function MobileViewSwitch({view,onChat,onMap,mapLabel='نقشه و فروشگاه‌ها',mapHint}:{view:'chat'|'map';onChat:()=>void;onMap:()=>void;mapLabel?:string;mapHint?:string}){
  return <nav className="mobile-view-switch" aria-label="نمای خرید"><button aria-label="رفتن به گفت‌وگو" aria-pressed={view==='chat'} onClick={onChat} type="button"><MessageCircle size={17}/>{view==='map'?'برگشت به گفت‌وگو':'گفت‌وگو'}</button><button aria-label="رفتن به نقشه" aria-description={mapHint} title={mapHint} data-map-context-action aria-pressed={view==='map'} onClick={onMap} type="button"><Map size={17}/><span>{mapLabel}</span></button></nav>;
}

export type SheetStop='collapsed'|'peek'|'half'|'full';
type Props={stop?:SheetStop;onStop?:(stop:SheetStop)=>void;choosingProduct?:boolean;journey?:ReactNode;notice?:string;onLocation?:()=>void;feedback?:ReactNode;journeyActive?:boolean;compactJourney?:boolean;active?:boolean;offers:Offer[];selected:Offer|null;productName:string|null;viewportHeight:number;busy:boolean;hasMore:boolean;
  productNames?:Record<string,string>;comparedIds?:ReadonlySet<string>;onShopList?:()=>void;onOtherShops?:()=>void;onNavigate:()=>void;onSelect:(o:Offer)=>void;onInspect:(o:Offer)=>void;onMore:()=>void;onChat:()=>void;onPick:()=>void;onHeight:(height:number)=>void};
export default function MobileMapSheet(p:Props){
  const [localSnap,setLocalSnap]=useState<SheetStop>('collapsed'),[dragHeight,setDragHeight]=useState<number|null>(null);
  const snap=p.stop??localSnap;
  const setSnap=(next:SheetStop|((old:SheetStop)=>SheetStop))=>{const value=typeof next==='function'?next(snap):next;setLocalSnap(value);p.onStop?.(value);};
  const [selectedPeek,setSelectedPeek]=useState(304),[safeInset,setSafeInset]=useState(0);
  const [addressHeight,setAddressHeight]=useState(0),address=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const node=address.current;if(!node){setAddressHeight(0);return;}const measure=()=>setAddressHeight(Math.ceil(node.getBoundingClientRect().height));measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[p.selected?.offer_id,p.selected?.shop.address]);
  const sheet=useRef<HTMLElement>(null),cleanup=useRef<(()=>void)|null>(null),body=useRef<HTMLDivElement>(null);
  const collapsed=snap==='collapsed',compact=!!p.compactJourney&&snap!=='full';
  const [compactHeight,setCompactHeight]=useState(220);
  useLayoutEffect(()=>{if(!compact||!sheet.current)return;const panel=sheet.current;const children=Array.from(panel.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&!el.hidden&&el!==body.current);const measure=()=>setCompactHeight(Math.ceil(children.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0))+safeInset+2);measure();const observer=new ResizeObserver(measure);children.forEach(el=>observer.observe(el));return()=>observer.disconnect();},[compact,snap,p.selected?.offer_id,safeInset,p.journey]);
  const [contentHeight,setContentHeight]=useState<number|null>(null);
  useLayoutEffect(()=>{
    const panel=sheet.current;if(!panel||p.active===false)return;
    const outer=(el:HTMLElement)=>{const style=getComputedStyle(el);return el.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);};
    const visible=(el:HTMLElement)=>!el.hidden&&getComputedStyle(el).display!=='none';
    const children=Array.from(panel.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&visible(el));
    const measure=()=>{
      const style=getComputedStyle(panel);
      const edges=(style:CSSStyleDeclaration)=>(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0)+(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
      const natural=children.reduce((sum,el)=>{
        // Measure intrinsic content, not the flex area stretched by a snap stop.
        if(el===body.current||el.classList.contains('map-sheet-journey'))return sum+edges(getComputedStyle(el))+Array.from(el.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&visible(child)).reduce((n,child)=>n+outer(child),0);
        return sum+outer(el);
      },edges(style));
      setContentHeight(Math.ceil(natural));
    };
    measure();const observer=new ResizeObserver(measure);
    children.forEach(el=>{observer.observe(el);if(el===body.current||el.classList.contains('map-sheet-journey'))Array.from(el.children).forEach(child=>observer.observe(child));});
    return()=>observer.disconnect();
  },[snap,compact,p.active,p.journey,p.offers,p.selected,p.viewportHeight,safeInset]);
  const pool=p.selected&&!p.offers.some(o=>o.offer_id===p.selected?.offer_id)?[p.selected,...p.offers]:p.offers;
  const full=Math.max(190,p.viewportHeight-(p.viewportHeight<=500?104:220)),peek=Math.min(p.selected?selectedPeek:p.choosingProduct?260:196,full),half=Math.max(peek,Math.min(full,p.viewportHeight*.48));
  const stops={collapsed:92+safeInset+addressHeight,peek:Math.max(peek,92+safeInset+addressHeight),half:Math.max(half,92+safeInset+addressHeight),full:Math.max(full,92+safeInset+addressHeight)};
  const requestedHeight=p.journeyActive&&!collapsed?Math.min(p.viewportHeight-104,Math.max(stops[snap],p.viewportHeight*.78)):stops[snap];
  const expandedLimit=Math.max(stops.collapsed,Math.min(p.journeyActive?p.viewportHeight-104:full,contentHeight??Infinity));
  const height=compact?compactHeight:collapsed?stops.collapsed:Math.min(requestedHeight,expandedLimit);
  useLayoutEffect(()=>{
    const panel=sheet.current,list=body.current;
    if(!panel||!list||!p.selected||collapsed)return;
    const card=list.querySelector<HTMLElement>(`[data-map-choice="${CSS.escape(p.selected.offer_id)}"]`);
    if(!card)return;
    const chrome=Array.from(panel.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==list);
    const measure=()=>{
      const panelStyle=getComputedStyle(panel),listStyle=getComputedStyle(list),cardStyle=getComputedStyle(card);
      const edges=(style:CSSStyleDeclaration)=>parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      const needed=chrome.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+edges(panelStyle)+edges(listStyle)+card.getBoundingClientRect().height+parseFloat(cardStyle.marginBottom);
      setSelectedPeek(Math.max(p.journeyActive?196:280,Math.ceil(needed)));
    };
    measure();const observer=new ResizeObserver(measure);[panel,card,...chrome].forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[p.selected?.offer_id,p.viewportHeight,snap,p.journeyActive]);
  useLayoutEffect(()=>{if(sheet.current)setSafeInset(parseFloat(getComputedStyle(sheet.current).paddingBottom)||0);},[p.viewportHeight,p.active,snap]);
  useEffect(()=>{p.onHeight(height);},[height,p.onHeight]);
  useEffect(()=>()=>cleanup.current?.(),[]);
  useLayoutEffect(()=>{if(collapsed&&p.active!==false)sheet.current?.querySelector<HTMLButtonElement>('.map-sheet-handle')?.focus({preventScroll:true});},[collapsed,p.active]);
  useEffect(()=>{if(p.active===false)return;const reveal=()=>{const list=body.current,selected=list?.querySelector<HTMLElement>(`[data-map-choice="${CSS.escape(p.selected?.offer_id??'')}"]`);if(!list||!selected||!list.clientHeight)return;const row=selected.getBoundingClientRect(),view=list.getBoundingClientRect();if(row.top<view.top)list.scrollTop-=view.top-row.top;else if(row.bottom>view.bottom)list.scrollTop+=row.bottom-view.bottom;};reveal();const timer=setTimeout(reveal,280);return()=>clearTimeout(timer);},[p.selected?.offer_id,snap,p.active]);
  const visibleOffers=snap==='peek'&&p.selected?[p.selected]:pool;
  const cycle=()=>setSnap(v=>p.compactJourney?(v==='full'?'collapsed':'full'):v==='collapsed'?'peek':v==='peek'?'half':v==='half'?'full':'collapsed');
  const start=(e:PointerEvent<HTMLButtonElement>)=>{
    if(e.button!==0)return;if(e.pointerType!=='touch')e.preventDefault();cleanup.current?.();
    const startY=e.clientY,id=e.pointerId,target=e.currentTarget;let next=height,moved=false;target.setPointerCapture(id);
    const move=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;if(Math.abs(event.clientY-startY)>4)moved=true;next=Math.min(expandedLimit,Math.max(p.compactJourney?compactHeight:stops.collapsed,height+startY-event.clientY));setDragHeight(next);};
    const remove=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);if(target.hasPointerCapture(id))target.releasePointerCapture(id);cleanup.current=null;};
    const up=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;remove();const choices:ReadonlyArray<readonly [SheetStop,number]>=p.compactJourney?[['collapsed',compactHeight],['full',expandedLimit]]:[['collapsed',stops.collapsed],['peek',Math.min(peek,expandedLimit)],['half',Math.min(half,expandedLimit)],['full',expandedLimit]];if(!moved)cycle();else setSnap(choices.reduce((best,item)=>Math.abs(item[1]-next)<Math.abs(best[1]-next)?item:best)[0]);setDragHeight(null);};
    const cancel=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;remove();setDragHeight(null);};
    cleanup.current=remove;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
  };
  return <section ref={sheet} className="mobile-map-sheet" data-mobile-store-sheet data-sheet-stop={snap} data-compact-journey={compact?'true':undefined} data-journey-list={p.journeyActive?'true':undefined} style={{height:dragHeight??height,transition:dragHeight===null?'height 240ms ease':'none'}} aria-label="فروشگاه‌های روی نقشه">
    <button className="map-sheet-handle" title="فهرست فروشگاه‌ها را بالا بکش؛ با زدن هم ارتفاع آن تغییر می‌کند" aria-label="تغییر ارتفاع فهرست فروشگاه‌ها" aria-expanded={!collapsed} aria-controls="mobile-map-offers" onPointerDown={start} onClick={e=>{if(e.detail===0)cycle();}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='End'){e.preventDefault();setSnap('collapsed');return;}if(e.key==='ArrowUp'||e.key==='Home'){e.preventDefault();setSnap(p.compactJourney?'full':'peek');return;}if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle();}}}><span/>{collapsed&&<><b>فروشگاه‌ها{pool.length?` · ${fa(pool.length)} پیشنهاد`:''}</b><ChevronUp size={16}/></>}</button>
    {!collapsed&&!compact&&!p.journeyActive&&<header className="map-sheet-heading"><Store size={18}/><div><b>{p.selected?.shop.name??'فروشگاه‌ها روی همین نقشه'}</b><p>{p.productName??'گفت‌وگو و انتخاب‌هایت سر جایشان هستند'}</p></div><TouchAction className="icon-button map-sheet-location" action={p.onLocation??p.onPick} aria-label="موقعیت جست‌وجو" title="انتخاب یا تغییر موقعیت جست‌وجو"><MapPin size={17}/></TouchAction><TouchAction action={()=>setSnap('collapsed')} aria-label="جمع کردن فهرست برای دیدن کامل نقشه" title="جمع کردن فهرست برای دیدن کامل نقشه"><span>{p.offers.length?`${fa(p.offers.length)} پیشنهاد`:'فهرست'}</span><ChevronDown size={16}/></TouchAction></header>}
    {p.selected&&<div ref={address} className="map-sheet-address"><DestinationAddress key={p.selected.offer_id} address={p.selected.shop.address}/></div>}
    {p.journeyActive&&!collapsed&&!compact&&<nav className="map-journey-shops" aria-label="فروشگاه‌های همین خرید">
     <TouchAction className="secondary-action" action={()=>p.onShopList?.()}><ArrowRight size={18}/>برگشت به فهرست فروشگاه‌ها</TouchAction>
     <TouchAction className="secondary-action" action={()=>p.onOtherShops?.()}><List size={18}/>دیدن فروشگاه‌های دیگر</TouchAction>
    </nav>}
    {p.journey&&<div hidden={collapsed&&!compact} className="map-sheet-journey">{p.journey}</div>}
    {p.notice&&!collapsed&&!compact&&<p className="map-result-notice" role="status">{p.notice}</p>}
    <div hidden={collapsed||compact||p.journeyActive} ref={body} id="mobile-map-offers" className="map-sheet-content">
      {p.feedback}
      {visibleOffers.length?visibleOffers.map(o=><button key={o.offer_id} data-map-choice={o.offer_id} aria-pressed={p.selected?.offer_id===o.offer_id} className={'map-store-choice'+(p.selected?.offer_id===o.offer_id?' selected':'')} onClick={()=>p.onSelect(o)}><div className="map-store-name"><b>{o.shop.name??'فروشگاه بدون نام'}</b>{p.selected?.offer_id===o.offer_id&&<Check size={16}/>}</div><Price v={o.price_toman} size={14}/><p className="map-store-product">{p.productNames?.[o.product_id]}{p.comparedIds?.has(o.offer_id)?' · انتخاب مقایسه':''}</p><p className="map-store-facts">{distance(o.direct_distance_meters)} · {openLabel(o)}</p></button>):!p.feedback?<div className="map-sheet-empty"><p>بالای نقشه بنویس چه می‌خواهی؛ فروشگاه‌های همان خرید اینجا نمایش داده می‌شوند.</p><button className="secondary-action" onClick={p.onPick}>انتخاب موقعیت روی نقشه</button></div>:null}
      {p.busy&&!p.feedback&&<p className="map-sheet-status" role="status">در حال دریافت فروشگاه‌ها…</p>}
      {p.hasMore&&<button className="map-sheet-more" disabled={p.busy} onClick={p.onMore}>پیشنهادهای بیشتر</button>}
    </div>
    {!collapsed&&!p.journeyActive&&p.selected&&<div className="map-selected-actions" data-map-selected-actions><div className="map-selected-buttons"><TouchAction className="primary-action" action={()=>p.onInspect(p.selected!)} aria-label="بررسی و شروع خرید از این فروشگاه"><Navigation size={15}/>بررسی و شروع خرید</TouchAction><TouchAction className="secondary-action" aria-label="بازکردن مسیریاب" action={p.onNavigate}><ArrowRight size={15}/>بازکردن مسیریاب</TouchAction></div></div>}
    <MobileViewSwitch view="map" onChat={p.onChat} onMap={()=>setSnap(v=>v==='collapsed'?'peek':v)}/>
  </section>;
}
