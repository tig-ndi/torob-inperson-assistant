import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {ArrowRight,Check,ChevronUp,Map,MessageCircle,Navigation,Store} from 'lucide-react';
import TouchAction from './TouchAction';
import {Price} from '../prototype/ui';
import {distance,fa,openLabel,type Offer} from './data';

export function MobileViewSwitch({view,onChat,onMap,mapLabel='نقشه و فروشگاه‌ها',mapHint}:{view:'chat'|'map';onChat:()=>void;onMap:()=>void;mapLabel?:string;mapHint?:string}){
  return <nav className="mobile-view-switch" aria-label="نمای خرید"><button aria-label="رفتن به گفت‌وگو" aria-pressed={view==='chat'} onClick={onChat} type="button"><MessageCircle size={17}/>گفت‌وگو</button><button aria-label="رفتن به نقشه" aria-description={mapHint} title={mapHint} data-map-context-action aria-pressed={view==='map'} onClick={onMap} type="button"><Map size={17}/><span>{mapLabel}</span></button></nav>;
}

type Props={active?:boolean;offers:Offer[];selected:Offer|null;productName:string|null;viewportHeight:number;busy:boolean;hasMore:boolean;
  productNames?:Record<string,string>;comparedIds?:ReadonlySet<string>;onNavigate:()=>void;onComplete?:()=>void;onSelect:(o:Offer)=>void;onInspect:(o:Offer)=>void;onMore:()=>void;onChat:()=>void;onPick:()=>void;onHeight:(height:number)=>void};
export default function MobileMapSheet(p:Props){
  const [snap,setSnap]=useState<'peek'|'half'|'full'>('peek'),[dragHeight,setDragHeight]=useState<number|null>(null);
  const [selectedPeek,setSelectedPeek]=useState(304);
  const sheet=useRef<HTMLElement>(null),cleanup=useRef<(()=>void)|null>(null),body=useRef<HTMLDivElement>(null);
  const full=Math.max(190,p.viewportHeight-(p.viewportHeight<=500?104:220)),peek=Math.min(p.selected?selectedPeek:196,full),half=Math.max(peek,Math.min(full,p.viewportHeight*.48));
  const height={peek,half,full}[snap];
  useLayoutEffect(()=>{
    const panel=sheet.current,list=body.current;
    if(!panel||!list||!p.selected)return;
    const card=list.querySelector<HTMLElement>(`[data-map-choice="${CSS.escape(p.selected.offer_id)}"]`);
    if(!card)return;
    const chrome=Array.from(panel.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==list);
    const measure=()=>{
      const panelStyle=getComputedStyle(panel),listStyle=getComputedStyle(list),cardStyle=getComputedStyle(card);
      const edges=(style:CSSStyleDeclaration)=>parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      const needed=chrome.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+edges(panelStyle)+edges(listStyle)+card.getBoundingClientRect().height+parseFloat(cardStyle.marginBottom);
      setSelectedPeek(Math.max(280,Math.ceil(needed)));
    };
    measure();const observer=new ResizeObserver(measure);[panel,card,...chrome].forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[p.selected?.offer_id,p.viewportHeight,snap]);
  useEffect(()=>{p.onHeight(height);},[height,p.onHeight]);
  useEffect(()=>()=>cleanup.current?.(),[]);
  useEffect(()=>{if(p.active===false)return;const reveal=()=>{const list=body.current,selected=list?.querySelector<HTMLElement>(`[data-map-choice="${CSS.escape(p.selected?.offer_id??'')}"]`);if(!list||!selected||!list.clientHeight)return;const row=selected.getBoundingClientRect(),view=list.getBoundingClientRect();if(row.top<view.top)list.scrollTop-=view.top-row.top;else if(row.bottom>view.bottom)list.scrollTop+=row.bottom-view.bottom;};reveal();const timer=setTimeout(reveal,280);return()=>clearTimeout(timer);},[p.selected?.offer_id,snap,p.active]);
  const visibleOffers=snap==='peek'&&p.selected?[p.selected]:p.offers;
  const cycle=()=>setSnap(v=>v==='peek'?'half':v==='half'?'full':'peek');
  const start=(e:PointerEvent<HTMLButtonElement>)=>{
    if(e.button!==0)return;if(e.pointerType!=='touch')e.preventDefault();cleanup.current?.();
    const startY=e.clientY,id=e.pointerId,target=e.currentTarget;let next=height;target.setPointerCapture(id);
    const move=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;next=Math.min(full,Math.max(peek,height+startY-event.clientY));setDragHeight(next);};
    const remove=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);if(target.hasPointerCapture(id))target.releasePointerCapture(id);cleanup.current=null;};
    const up=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;remove();if(Math.abs(next-height)<4)cycle();else setSnap(([['peek',peek],['half',half],['full',full]] as const).reduce((best,item)=>Math.abs(item[1]-next)<Math.abs(best[1]-next)?item:best)[0]);setDragHeight(null);};
    const cancel=(event:globalThis.PointerEvent)=>{if(event.pointerId!==id)return;remove();setDragHeight(null);};
    cleanup.current=remove;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
  };
  return <section ref={sheet} className="mobile-map-sheet" data-mobile-store-sheet data-sheet-stop={snap} style={{height:dragHeight??height,transition:dragHeight===null?'height 240ms ease':'none'}} aria-label="فروشگاه‌های روی نقشه">
    <button className="map-sheet-handle" title="فهرست فروشگاه‌ها را بالا بکش؛ با زدن هم ارتفاع آن تغییر می‌کند" aria-label="تغییر ارتفاع فهرست فروشگاه‌ها" aria-expanded={snap!=='peek'} aria-controls="mobile-map-offers" onPointerDown={start} onClick={e=>{if(e.detail===0)cycle();}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle();}}}><span/></button>
    <header className="map-sheet-heading"><Store size={18}/><div><b>{p.selected?.shop.name??'فروشگاه‌ها روی همین نقشه'}</b><p>{p.productName??'گفت‌وگو و انتخاب‌هایت سر جایشان هستند'}</p></div><button onClick={cycle} aria-label="باز و بسته کردن فهرست فروشگاه‌ها" title="بازکردن یا جمع‌کردن فهرست فروشگاه‌های نقشه"><span>{p.offers.length?`${fa(p.offers.length)} پیشنهاد`:'فهرست'}</span><ChevronUp size={16} className={snap==='full'?'sheet-chevron-open':''}/></button></header>
    <div ref={body} id="mobile-map-offers" className="map-sheet-content">
      {visibleOffers.length?visibleOffers.map(o=><button key={o.offer_id} data-map-choice={o.offer_id} aria-pressed={p.selected?.offer_id===o.offer_id} className={'map-store-choice'+(p.selected?.offer_id===o.offer_id?' selected':'')} onClick={()=>p.onSelect(o)}><div className="map-store-name"><b>{o.shop.name??'فروشگاه بدون نام'}</b>{p.selected?.offer_id===o.offer_id&&<Check size={16}/>}</div><Price v={o.price_toman} size={14}/><p className="map-store-product">{p.productNames?.[o.product_id]}{p.comparedIds?.has(o.offer_id)?' · انتخاب مقایسه':''}</p><p className="map-store-facts">{distance(o.direct_distance_meters)} · {openLabel(o)}</p></button>):<div className="map-sheet-empty"><p>برای دیدن فروشگاه‌ها، محصولت را در گفت‌وگو انتخاب کن. می‌توانی همین‌جا موقعیت را مشخص کنی.</p><button className="secondary-action" onClick={p.onPick}>انتخاب موقعیت روی نقشه</button></div>}
      {p.busy&&<p className="map-sheet-status" role="status">در حال دریافت فروشگاه‌ها…</p>}
      {p.hasMore&&<button className="map-sheet-more" disabled={p.busy} onClick={p.onMore}>پیشنهادهای بیشتر</button>}
    </div>
    {p.selected&&<div className="map-selected-actions" data-map-selected-actions><div className={'map-selected-buttons'+(p.onComplete?' has-completion':'')}><TouchAction className="primary-action" action={p.onNavigate} aria-label="مسیریابی این فروشگاه"><Navigation size={15}/>مسیریابی</TouchAction><TouchAction className="secondary-action" aria-label="ادامه با این فروشگاه در گفت‌وگو" action={()=>p.onInspect(p.selected!)}><ArrowRight size={15}/>ادامهٔ بررسی</TouchAction>{p.onComplete&&<TouchAction className="secondary-action" action={p.onComplete}><Check size={15}/>پایان این برنامه</TouchAction>}</div></div>}
    <MobileViewSwitch view="map" onChat={p.onChat} onMap={()=>setSnap('peek')}/>
  </section>;
}
