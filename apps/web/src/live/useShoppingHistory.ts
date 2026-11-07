import {useLayoutEffect,useRef,type RefObject} from 'react';
import type {Shopping} from './state';
import type {PurchaseProgress,PurchaseStage} from './purchaseProgress';
import {rewindPurchase} from './purchaseProgress';
import {NavigationHistory,type NavigationFrame} from './navigationHistory';
import type {SheetStop} from './MobileMapSheet';

/** One history owner for the active chat, map, native disclosures and dialogs. */
export function useShoppingHistory(root:RefObject<HTMLDivElement|null>,a:Shopping,mapVisible:boolean,desktop:boolean,stop:SheetStop,setStop:(s:SheetStop)=>void){
  const latest=useRef({a,mapVisible,desktop,stop,setStop});latest.current={a,mapVisible,desktop,stop,setStop};
  const scan=useRef<()=>void>(()=>{});
  const details=useRef<HTMLDetailsElement[]>([]),ids=useRef(new WeakMap<Element,number>()),sequence=useRef(0);
  const history=useRef<NavigationHistory|null>(null);
  const elementKey=(el:Element)=>{if(!ids.current.has(el))ids.current.set(el,++sequence.current);return String(ids.current.get(el));};
  const frame=(key:string,enter:()=>void,leave=()=>{})=>({key,enter,leave});
  scan.current=()=>{
    const node=root.current;if(!node||!history.current)return;
    const {a,mapVisible,desktop,stop,setStop}=latest.current;
    const p=a.activePurchase;
    const at=(stage:PurchaseStage):PurchaseProgress|null=>{
      if(!p)return null;let value=p;
      for(let n=0;n<4&&value.stage!==stage;n++){const next=rewindPurchase(value);if(next===value)break;value=next;}
      return value.stage===stage?value:null;
    };
    const route=(screen:Shopping['screen'],progress?:PurchaseProgress|null)=>()=>latest.current.a.restoreNavigation(screen,progress);
    const path:NavigationFrame[]=[frame('home',route('home'))];
    if(!['home','decide'].includes(a.screen))path.push(frame('results',route('results')));
    if(['stores','compare','contact','trip'].includes(a.screen)&&a.product)path.push(frame('stores',route('stores')));
    if(['contact','trip'].includes(a.screen)&&a.selected){
      path.push(frame('contact',route('contact',at('ready'))));
      if(p&&p.stage!=='ready'){
        if(p.startedAt)path.push(frame('en_route',route('trip',at('en_route'))));
        if(p.stage==='arrived'||p.stage==='done'&&['purchased','not_purchased'].includes(p.result??''))path.push(frame('arrived',route('trip',at('arrived'))));
        if(p.stage==='problem'||p.stage==='done')path.push(frame(p.stage,route('trip',p)));
      }else if(a.screen==='trip')path.push(frame('trip',route('trip',p)));
    }else if(a.screen==='decide')path.push(frame('decide',route('decide')));
    details.current=details.current.filter(el=>el.isConnected&&el.open);
    const disclosures=(scope:'chat'|'map'|'dialog')=>details.current.filter(el=>scope==='dialog'?!!el.closest('.dialog-backdrop'):scope==='map'?!!el.closest('.map-pane')&&!el.closest('.dialog-backdrop'):!el.closest('.map-pane,.dialog-backdrop')).map(el=>frame('details:'+elementKey(el),()=>{el.open=true;},()=>{el.open=false;}));
    path.push(...disclosures('chat'));
    if(mapVisible&&!desktop){
      path.push(frame('map',()=>latest.current.a.setMapMode('open'),()=>{latest.current.a.setPicking(false);latest.current.a.setMapMode('closed');}));
      if(a.picking)path.push(frame('picking',()=>latest.current.a.setPicking(true),()=>latest.current.a.setPicking(false)));
      if(stop!=='collapsed')path.push(frame('map-sheet',()=>setStop(stop),()=>setStop('collapsed')));
      path.push(...disclosures('map'));
      for(const popup of node.querySelectorAll<HTMLElement>('.maplibregl-popup')){
        const dismiss=popup.querySelector<HTMLButtonElement>('.maplibregl-popup-close-button')??popup.querySelector<HTMLButtonElement>('.secondary-action');
        if(!dismiss)continue;const shop=popup.dataset.popupShop;
        path.push(frame('map-popup:'+elementKey(popup),()=>{if(shop)node.querySelector<HTMLButtonElement>(`[data-map-shop="${CSS.escape(shop)}"]`)?.click();},()=>dismiss.click()));
      }
    }
    if(a.overlay){const overlay=a.overlay;path.push(frame('dialog:'+overlay,()=>latest.current.a.setOverlay(overlay),()=>latest.current.a.setOverlay(null)));path.push(...disclosures('dialog'));}
    if(a.sellerDialog){const seller=a.sellerDialog;path.push(frame('seller',()=>latest.current.a.setSellerDialog(seller),()=>latest.current.a.setSellerDialog(null)));}
    if(a.newConversationPending)path.push(frame('new-conversation',()=>latest.current.a.newConversation(),()=>latest.current.a.cancelNewConversation()));
    for(const el of node.querySelectorAll<HTMLElement>('[data-navigation-confirm]')){
      if(!el.checkVisibility())continue;
      const dismiss=el.querySelector<HTMLButtonElement>('[data-navigation-dismiss]');
      if(dismiss)path.push(frame('confirm:'+elementKey(el),()=>{},()=>dismiss.click()));
    }
    const theme=node.querySelector<HTMLButtonElement>('.theme-picker.compact [aria-expanded=true]');
    if(theme)path.push(frame('theme',()=>{},()=>theme.click()));
    history.current.sync(path);
  };
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return;let raf=0;
    history.current=new NavigationHistory(window.history,crypto.randomUUID(),(next,previous)=>{
      let common=0;while(common<next.length&&next[common]?.key===previous[common]?.key)common++;
      for(const layer of previous.slice(common).reverse())layer.leave();
      if(common<next.length)for(const layer of next.slice(common))layer.enter();
      else next.at(-1)?.enter();
      cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{history.current?.finishRestore();scan.current();});
    });
    const pop=(e:PopStateEvent)=>history.current?.pop(e.state);
    const click=(e:Event)=>{const summary=(e.target as Element).closest('summary'),detail=summary?.parentElement;if(detail instanceof HTMLDetailsElement&&!detail.open&&!details.current.includes(detail))details.current.push(detail);};
    // MapLibre auto-opens attribution on resize. Only a user summary click should
    // add those controls to Back history; app disclosures may also open by code.
    const observer=new MutationObserver(records=>{for(const record of records){const el=record.target;if(record.attributeName==='open'&&el instanceof HTMLDetailsElement&&el.open&&!el.closest('.maplibregl-control-container')&&!details.current.includes(el))details.current.push(el);}scan.current();});observer.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['open','data-sheet-stop','aria-expanded']});
    node.addEventListener('click',click,true);window.addEventListener('popstate',pop);scan.current();
    return()=>{cancelAnimationFrame(raf);observer.disconnect();node.removeEventListener('click',click,true);window.removeEventListener('popstate',pop);history.current=null;};
  },[root]);
  useLayoutEffect(()=>scan.current());
  return ()=>history.current?.back()??false;
}
