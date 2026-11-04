import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { money, distance, openLabel, fa, type Offer, type Position, type Place } from './data';
import {readSession,writeSession} from './session';
maplibregl.setWorkerUrl(workerUrl);

function style(dark:boolean):StyleSpecification {
  const c=dark?{land:'#14141a',block:'#191920',road:'#24242d',casing:'#1b1b22',park:'#17221b',water:'#14202b',label:'#8e8e9a'}:{land:'#f1f0ee',block:'#eae8e5',road:'#ffffff',casing:'#e2e2e6',park:'#e3eedf',water:'#dce9f2',label:'#6b6a72'};
  return {version:8,sources:{world:{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenFreeMap · © OpenStreetMap contributors'}},layers:[
    {id:'land',type:'background',paint:{'background-color':c.land}},
    {id:'landuse',type:'fill',source:'world','source-layer':'landuse',paint:{'fill-color':c.block}},
    {id:'park',type:'fill',source:'world','source-layer':'park',paint:{'fill-color':c.park}},
    {id:'cover',type:'fill',source:'world','source-layer':'landcover',filter:['in',['get','class'],['literal',['wood','grass']]],paint:{'fill-color':c.park,'fill-opacity':0.7}},
    {id:'water',type:'fill',source:'world','source-layer':'water',paint:{'fill-color':c.water}},
    {id:'waterway',type:'line',source:'world','source-layer':'waterway',paint:{'line-color':c.water,'line-width':2}},
    {id:'buildings',type:'fill',source:'world','source-layer':'building',minzoom:14,paint:{'fill-color':c.block,'fill-outline-color':c.casing}},
    {id:'road-casing',type:'line',source:'world','source-layer':'transportation',filter:['!=',['get','class'],'rail'],paint:{'line-color':c.casing,'line-width':['interpolate',['linear'],['zoom'],5,1,12,3,16,12,19,30]}},
    {id:'roads',type:'line',source:'world','source-layer':'transportation',filter:['!=',['get','class'],'rail'],paint:{'line-color':c.road,'line-width':['interpolate',['linear'],['zoom'],5,0.5,12,2,16,9,19,27]}},
    {id:'boundaries',type:'line',source:'world','source-layer':'boundary',paint:{'line-color':c.label,'line-opacity':0.25,'line-dasharray':[3,3]}},
    {id:'road-names',type:'symbol',source:'world','source-layer':'transportation_name',minzoom:13,layout:{'symbol-placement':'line','text-field':['coalesce',['get','name:fa'],['get','name'],['get','name:en']],'text-font':['Vazirmatn'],'text-size':12,'text-max-angle':35},paint:{'text-color':c.label,'text-halo-color':c.road,'text-halo-width':2}},
    {id:'places',type:'symbol',source:'world','source-layer':'place',layout:{'text-field':['coalesce',['get','name:fa'],['get','name'],['get','name:en']],'text-font':['Vazirmatn'],'text-size':['interpolate',['linear'],['zoom'],4,12,13,16],'text-max-width':8},paint:{'text-color':c.label,'text-halo-color':c.land,'text-halo-width':2}},
    {id:'pois',type:'symbol',source:'world','source-layer':'poi',minzoom:15,layout:{'text-field':['coalesce',['get','name:fa'],['get','name']],'text-font':['Vazirmatn'],'text-size':11,'text-max-width':8},paint:{'text-color':c.label,'text-halo-color':c.land,'text-halo-width':2}},
  ]};
}
type Props={replyByOffer?:Record<string,import('./upgrades').SellerReply>;roadRoutes?:import('./upgrades').RoadRoute[];active?:boolean;dark:boolean;offers:Offer[];selected:string|null;position:Position|null;radius:number;showRadius:boolean;route:boolean;desktop:boolean;rightInset?:number;leftInset?:number;bottom:number;recenter:number;country:number;pick:boolean;focus?:Place|null;places?:Place[];onPick:(lat:number,lon:number)=>void;onOffer:(o:Offer)=>void;comparedIds?:ReadonlySet<string>;offerComparedIds?:ReadonlySet<string>;productNames?:Record<string,string>;onCompare?:(o:Offer)=>void;onInspect?:(o:Offer)=>void};
function visiblePadding(m:maplibregl.Map,p:Props){
  const width=m.getContainer().clientWidth||innerWidth,height=m.getContainer().clientHeight||innerHeight;
  const top=Math.min(104,Math.max(20,height-150)),left=Math.min(p.desktop&&p.leftInset?p.leftInset:Math.min(100,width*.25),width-240);
  return {top,left,right:Math.min(p.desktop?(p.rightInset??0)+100:Math.min(100,width*.25),Math.max(0,width-left-140)),bottom:Math.min(p.desktop?100:p.bottom+12,Math.max(0,height-top-130))};
}
export default function RealMap(p:Props){
  const el=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(p);latest.current=p;
  const pins=useRef(new Map<string,{marker:maplibregl.Marker;button:HTMLButtonElement;popup:maplibregl.Popup;rows:Offer[];closeTimer:number|null}>()),activePopup=useRef<maplibregl.Popup|null>(null),clearChoice=useRef<(()=>void)|null>(null);
  const placePins=useRef<maplibregl.Marker[]>([]);
  const density=useRef<()=>void>(()=>{}),densityFrame=useRef<number|null>(null);
  density.current=()=>{
    const m=map.current;if(!m)return;
    const occupied:{x:number;y:number;w:number;h:number}[]=[];
    const rows=[...pins.current.values(),...placePins.current.map(marker=>({marker,button:marker.getElement()}))].sort((a,b)=>Number(b.button.classList.contains('chosen'))-Number(a.button.classList.contains('chosen'))||Number(b.button.classList.contains('comparing'))-Number(a.button.classList.contains('comparing')));
    for(const pin of rows){
      pin.button.classList.remove('pin-compact');const point=m.project(pin.marker.getLngLat()),w=pin.button.offsetWidth,h=pin.button.offsetHeight;
      const box={x:point.x-w/2,y:point.y-h,w,h};
      const overlap=occupied.some(o=>box.x<o.x+o.w+8&&box.x+box.w+8>o.x&&box.y<o.y+o.h+6&&box.y+box.h+6>o.y);
      if(overlap&&!pin.button.classList.contains('chosen'))pin.button.classList.add('pin-compact');else occupied.push(box);
    }
  };
  const scheduleDensity=()=>{if(densityFrame.current!==null)cancelAnimationFrame(densityFrame.current);densityFrame.current=requestAnimationFrame(()=>{densityFrame.current=null;density.current();});};
  const fitted=useRef(''),cameraRestored=useRef(false);
  const savedCamera=useRef(readSession<{lon:number;lat:number;zoom:number;key:string}|null>('map-camera',null,v=>{if(!v||typeof v!=='object')throw new Error('camera');const c=v as Record<string,unknown>;if(typeof c.lon!=='number'||!Number.isFinite(c.lon)||Math.abs(c.lon)>180||typeof c.lat!=='number'||!Number.isFinite(c.lat)||Math.abs(c.lat)>90||typeof c.zoom!=='number'||c.zoom<0||c.zoom>22||typeof c.key!=='string')throw new Error('camera');return {lon:c.lon,lat:c.lat,zoom:c.zoom,key:c.key};}));
  const cameraKey=()=>JSON.stringify([latest.current.offers.map(o=>o.offer_id),latest.current.position,[...(latest.current.comparedIds??[])]]);
  const [ready,setReady]=useState(0),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[rendered,setRendered]=useState(false);
  useEffect(()=>{
    if(!el.current)return;
    let m:maplibregl.Map;
    try{m=new maplibregl.Map({container:el.current,style:style(latest.current.dark),center:savedCamera.current?[savedCamera.current.lon,savedCamera.current.lat]:[51.41,35.72],zoom:savedCamera.current?.zoom??14,attributionControl:false});}
    catch{setError(true);return;}
    map.current=m;m.jumpTo({padding:visiblePadding(m,latest.current)});m.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');
    let failed=false;
    m.on('error',()=>{failed=true;setError(true);});m.on('idle',()=>{setRendered(!failed&&!!m.isStyleLoaded()&&m.areTilesLoaded());});
    m.on('move',scheduleDensity);m.on('movestart',()=>setRendered(false));m.on('moveend',()=>{if(latest.current.active!==false){const c=m.getCenter();writeSession('map-camera',{lon:c.lng,lat:c.lat,zoom:m.getZoom(),key:cameraKey()});}});
    m.on('style.load',()=>setReady(n=>n+1));
    m.doubleClickZoom.disable();
    let candidate:maplibregl.Marker|null=null,choice:maplibregl.Popup|null=null;
    const clearCandidate=()=>{candidate?.remove();choice?.remove();candidate=null;choice=null;};clearChoice.current=clearCandidate;
    m.on('click',e=>{
      if((e.originalEvent.target as HTMLElement)?.closest('.maplibregl-marker,.maplibregl-popup'))return;
      clearCandidate();if(latest.current.pick){latest.current.onPick(e.lngLat.lat,e.lngLat.lng);return;}
      const lat=e.lngLat.lat,lon=e.lngLat.lng,icon=document.createElement('div');icon.className='location-candidate';icon.setAttribute('aria-label','نقطهٔ پیشنهادی برای موقعیت');
      candidate=new maplibregl.Marker({element:icon,anchor:'bottom'}).setLngLat([lon,lat]).addTo(m);
      const panel=document.createElement('div');panel.dir='rtl';panel.className='location-choice';panel.setAttribute('role','region');panel.setAttribute('aria-label','انتخاب موقعیت جست‌وجو');
      const title=document.createElement('b');title.textContent='اطراف این نقطه را بررسی کنم؟';const hint=document.createElement('p');hint.textContent='برای جابه‌جایی، نقشه را بکش. با دوبار کلیک هم انتخاب می‌شود.';
      const buttons=document.createElement('div'),accept=document.createElement('button'),cancel=document.createElement('button');buttons.className='inline-actions';accept.className='primary-action';accept.textContent='این موقعیت من است';accept.onclick=()=>{clearCandidate();latest.current.onPick(lat,lon);};cancel.className='secondary-action';cancel.textContent='انصراف';cancel.onclick=clearCandidate;buttons.append(accept,cancel);panel.append(title,hint,buttons);
      choice=new maplibregl.Popup({closeButton:false,closeOnClick:false,maxWidth:'280px',offset:32,className:'location-popup',focusAfterOpen:false}).setLngLat([lon,lat]).setDOMContent(panel).addTo(m);
    });
    m.on('dblclick',e=>{if((e.originalEvent.target as HTMLElement)?.closest('.maplibregl-marker,.maplibregl-popup'))return;e.preventDefault();clearCandidate();latest.current.onPick(e.lngLat.lat,e.lngLat.lng);});
    const ro=new ResizeObserver(()=>{if(latest.current.active!==false)m.resize();});ro.observe(el.current);
    return()=>{if(densityFrame.current!==null)cancelAnimationFrame(densityFrame.current);ro.disconnect();clearCandidate();for(const pin of pins.current.values()){if(pin.closeTimer!==null)clearTimeout(pin.closeTimer);pin.popup.remove();pin.marker.remove();}pins.current.clear();activePopup.current=null;m.remove();map.current=null;};
  },[attempt]);
  useEffect(()=>{clearChoice.current?.();},[p.position,p.selected]);
  const previousTheme=useRef(p.dark);
  useEffect(()=>{if(previousTheme.current!==p.dark){previousTheme.current=p.dark;setRendered(false);map.current?.setStyle(style(p.dark));}},[p.dark]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const markers:maplibregl.Marker[]=[];const groups=new Map<string,Offer[]>();
    for(const o of p.offers){if(o.shop.lat===null||o.shop.lon===null)continue;const g=groups.get(o.shop_id)??[];g.push(o);groups.set(o.shop_id,g);}
    for(const [id,pin] of pins.current){if(!groups.has(id)){if(pin.closeTimer!==null)clearTimeout(pin.closeTimer);pin.marker.remove();pin.popup.remove();pins.current.delete(id);}}
    const details=(rows:Offer[],keepOpen:()=>void,close:()=>void)=>{
      const panel=document.createElement('section');panel.dir='rtl';panel.className='map-shop-details';panel.setAttribute('aria-label','مشخصات فروشگاه روی نقشه');panel.setAttribute('role','region');panel.onpointerenter=keepOpen;panel.onpointerleave=close;
      const h=document.createElement('h3');h.textContent=rows[0]?.shop.name??'فروشگاه';panel.append(h);
      const address=document.createElement('p');address.textContent=rows[0]?.shop.address??'آدرس ثبت نشده';panel.append(address);
      for(const o of rows){const row=document.createElement('article'),name=document.createElement('b'),facts=document.createElement('p'),note=document.createElement('small');name.textContent=latest.current.productNames?.[o.product_id]??'پیشنهاد ثبت‌شده';facts.textContent=`${money(o.price_toman)} تومان · ${distance(o.direct_distance_meters)} مستقیم`;note.textContent=`${openLabel(o)} · روز بررسی ${fa(o.opening_hours.local_day)} · موجودی تأیید نشده`;row.append(name,facts,note);
        const actions=document.createElement('div');actions.className='inline-actions';
        const select=document.createElement('button');select.className='secondary-action';select.textContent='انتخاب این پیشنهاد';select.onclick=()=>latest.current.onOffer(o);actions.append(select);
        if(latest.current.onCompare){const compare=document.createElement('button');compare.className='secondary-action';compare.textContent=latest.current.offerComparedIds?.has(o.offer_id)?'حذف پیشنهاد از مقایسه':'افزودن پیشنهاد به مقایسه';compare.setAttribute('aria-pressed',String(!!latest.current.offerComparedIds?.has(o.offer_id)));compare.onclick=()=>latest.current.onCompare?.(o);actions.append(compare);}
        if(latest.current.onInspect){const inspect=document.createElement('button');inspect.className='primary-action';inspect.textContent='بررسی حضوری این پیشنهاد';inspect.onclick=()=>{latest.current.onInspect?.(o);activePopup.current?.remove();};actions.append(inspect);}
        const reply=latest.current.replyByOffer?.[o.offer_id];if(reply){const note=document.createElement('p');note.className='map-demo-reply';note.textContent='پاسخ آزمایشی فروشنده: '+(reply.outcome==='out_of_stock'?'ناموجود':reply.outcome==='closed'?'بسته':reply.outcome==='no_answer'?'بی‌پاسخ':'موجود گزارش شده')+(reply.price_toman!==null?' · '+money(reply.price_toman)+' تومان':'');row.append(note);}
        row.append(actions);panel.append(row);
      }return panel;
    };
    for(const [id,rows] of groups){
      let pin=pins.current.get(id);
      if(!pin){
        const button=document.createElement('button'),popup=new maplibregl.Popup({closeButton:true,focusAfterOpen:false,closeOnClick:false,maxWidth:'320px',offset:35,className:'shop-popup'});
        pin={marker:new maplibregl.Marker({element:button,anchor:'bottom'}),button,popup,rows,closeTimer:null};const entry=pin;
        const keepOpen=()=>{if(entry.closeTimer!==null)clearTimeout(entry.closeTimer);entry.closeTimer=null;};
        const close=()=>{keepOpen();entry.closeTimer=window.setTimeout(()=>{if(!entry.popup.getElement()?.contains(document.activeElement))entry.popup.remove();},180);};
        const show=()=>{if(!latest.current.desktop)return;keepOpen();if(activePopup.current!==popup)activePopup.current?.remove();activePopup.current=popup;popup.setLngLat(entry.marker.getLngLat()).setDOMContent(details(entry.rows,keepOpen,close)).addTo(m);const closeButton=popup.getElement()?.querySelector('.maplibregl-popup-close-button');closeButton?.setAttribute('aria-label','بستن مشخصات فروشگاه');closeButton?.setAttribute('title','بستن مشخصات فروشگاه روی نقشه');};
        button.onpointerenter=show;button.onpointerleave=close;button.onfocus=show;button.onblur=close;button.onclick=e=>{e.stopPropagation();const selected=entry.rows.find(o=>o.offer_id===latest.current.selected)??entry.rows[0];if(selected)latest.current.onOffer(selected);show();};button.ondblclick=e=>e.stopPropagation();
        pins.current.set(id,pin);pin.marker.setLngLat([rows[0]!.shop.lon!,rows[0]!.shop.lat!]).addTo(m);
      }
      pin.rows=rows;
      const chosen=rows.find(o=>o.offer_id===p.selected)??rows.find(o=>p.comparedIds?.has(o.offer_id))??rows.find(o=>p.replyByOffer?.[o.offer_id])??rows[0]!;
      const reply=p.replyByOffer?.[chosen.offer_id];
      const compared=rows.some(o=>p.comparedIds?.has(o.offer_id));pin.button.classList.add('real-pin');pin.button.classList.toggle('chosen',rows.some(o=>o.offer_id===p.selected));pin.button.classList.toggle('comparing',compared);pin.button.dir='rtl';pin.button.classList.toggle('demo-replied',!!reply);pin.button.textContent=money(reply?.price_toman??chosen.price_toman)+(reply?reply.outcome==='out_of_stock'?' · ناموجود آزمایشی':reply.outcome==='closed'?' · بسته آزمایشی':reply.outcome==='no_answer'?' · بی‌پاسخ آزمایشی':' · پاسخ آزمایشی':'')+(rows.length>1?` · ${fa(rows.length)} پیشنهاد`:'')+(compared?' · مقایسه':'');pin.button.dataset.mapShop=id;pin.button.dataset.compared=String(compared);pin.button.setAttribute('aria-label',`${chosen.shop.name??'فروشگاه'} · ${money(reply?.price_toman??chosen.price_toman)} تومان${reply?' · پاسخ آزمایشی فروشنده':''}`);
      pin.marker.setLngLat([chosen.shop.lon!,chosen.shop.lat!]);
      if(pin.popup.isOpen()){const entry=pin;const keep=()=>{if(entry.closeTimer!==null)clearTimeout(entry.closeTimer);};const close=()=>{entry.closeTimer=window.setTimeout(()=>entry.popup.remove(),180);};pin.popup.setDOMContent(details(rows,keep,close));}
    }
    if(p.position){const b=document.createElement('div');b.className='user-dot';b.title=p.position.label;markers.push(new maplibregl.Marker({element:b}).setLngLat([p.position.lon,p.position.lat]).addTo(m));}
    for(const place of p.places??[]){const b=document.createElement('div');b.className='real-pin probable-pin';b.textContent='؟ '+place.label;b.title='موجودی و ساعت کاری نامشخص';markers.push(new maplibregl.Marker({element:b}).setLngLat([place.lon,place.lat]).addTo(m));}
    if(p.focus&&!p.offers.some(o=>o.shop.lat===p.focus!.lat&&o.shop.lon===p.focus!.lon)&&!p.places?.some(place=>place.lat===p.focus!.lat&&place.lon===p.focus!.lon)){const b=document.createElement('div');b.className='real-pin';b.textContent=p.focus.label;markers.push(new maplibregl.Marker({element:b}).setLngLat([p.focus.lon,p.focus.lat]).addTo(m));}
    placePins.current=markers.filter(marker=>marker.getElement().classList.contains('real-pin'));
    scheduleDensity();
    return()=>markers.forEach(x=>x.remove());
  },[ready,p.offers,p.selected,p.position,p.places,p.focus,p.comparedIds,p.offerComparedIds,p.productNames,p.replyByOffer]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const features:GeoJSON.Feature[]=[];
    if(p.position&&p.showRadius){const {lat,lon}=p.position;const coords=Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return[lon+p.radius*Math.cos(t)/(111.32*Math.cos(lat*Math.PI/180)),lat+p.radius*Math.sin(t)/111.32];});features.push({type:'Feature',properties:{kind:'radius'},geometry:{type:'Polygon',coordinates:[coords]}});}
    for(const road of p.roadRoutes??[])features.push({type:'Feature',properties:{kind:road.offer_id===p.selected?'route':'compare'},geometry:road.geometry});
    const data:GeoJSON.FeatureCollection={type:'FeatureCollection',features};
    const source=m.getSource('local') as GeoJSONSource|undefined;
    if(source)source.setData(data);else{m.addSource('local',{type:'geojson',data});m.addLayer({id:'radius',type:'fill',source:'local',filter:['==',['get','kind'],'radius'],paint:{'fill-color':'#e5384a','fill-opacity':0.06}});m.addLayer({id:'radius-line',type:'line',source:'local',filter:['==',['get','kind'],'radius'],paint:{'line-color':'#e5384a','line-opacity':0.35,'line-width':2,'line-dasharray':[3,3]}});m.addLayer({id:'comparison-road-lines',type:'line',source:'local',filter:['==',['get','kind'],'compare'],paint:{'line-color':'#5278d3','line-width':3,'line-opacity':0.65}});m.addLayer({id:'street-route-line',type:'line',source:'local',filter:['==',['get','kind'],'route'],paint:{'line-color':'#e5384a','line-width':5}});}
      if(el.current)el.current.dataset.mapRouteState=(p.roadRoutes?.length??0)>0?'drawn':'none';
  },[ready,p.position,p.radius,p.showRadius,p.route,p.selected,p.offers,p.comparedIds,p.roadRoutes,p.active]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready||p.active===false)return;m.resize();
    const key=JSON.stringify([ready,p.offers.map(o=>[o.offer_id,o.shop.lat,o.shop.lon]),p.position,p.recenter,p.desktop,[...(p.comparedIds??[])]]);if(fitted.current===key)return;fitted.current=key;if(!cameraRestored.current){cameraRestored.current=true;if(savedCamera.current?.key===cameraKey())return;}
    const compared=p.offers.filter(o=>p.comparedIds?.has(o.offer_id));
    const points=(compared.length>1?compared:p.offers).filter(o=>o.shop.lat!==null&&o.shop.lon!==null).map(o=>[o.shop.lon!,o.shop.lat!] as [number,number]);
    if(p.position)points.push([p.position.lon,p.position.lat]);if(!points.length)return;
    const bounds=new maplibregl.LngLatBounds();points.forEach(point=>bounds.extend(point));
    if(p.focus)m.flyTo({center:[p.focus.lon,p.focus.lat],zoom:15,padding:visiblePadding(m,p),duration:600});
    else m.fitBounds(bounds,{absolutePadding:true,padding:visiblePadding(m,p),maxZoom:15,duration:650});
  },[ready,p.offers,p.position,p.recenter,p.desktop,p.comparedIds,p.active]);
  useEffect(()=>{if(p.country)map.current?.fitBounds([[44,25],[63.5,40]],{absolutePadding:true,padding:visiblePadding(map.current!,latest.current),duration:650});},[p.country]);
  useEffect(()=>{if(p.focus)map.current?.flyTo({center:[p.focus.lon,p.focus.lat],zoom:15,padding:visiblePadding(map.current!,latest.current),duration:600});},[p.focus,ready]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;m.easeTo({center:p.focus?[p.focus.lon,p.focus.lat]:m.getCenter(),padding:visiblePadding(m,p),duration:260});},[p.bottom,p.rightInset,p.leftInset,p.desktop]);
  useEffect(()=>{const m=map.current;if(!m||!ready||p.active===false)return;const route=p.roadRoutes?.find(r=>r.offer_id===p.selected);if(!route)return;const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(point=>bounds.extend(point));m.fitBounds(bounds,{absolutePadding:true,padding:visiblePadding(m,p),maxZoom:16,duration:600});},[ready,p.roadRoutes,p.selected,p.active]);
  return <><div ref={el} data-road-point-count={p.roadRoutes?.reduce((n,r)=>n+r.geometry.coordinates.length,0)??0} data-map-ready={rendered} className="absolute inset-0" aria-label="نقشهٔ تعاملی ایران" style={{position:'absolute',inset:0,cursor:p.pick?'crosshair':undefined}}/>{error&&<div role="status" className="map-failure">نقشه دریافت نشد؛ فهرست فروشگاه‌ها همچنان در دسترس است.<button onClick={()=>{setError(false);setAttempt(n=>n+1);}}>تلاش دوباره</button></div>}<div className="map-credit" style={{bottom:p.desktop?8:p.bottom+6}}>© <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>{!!p.roadRoutes?.length&&<> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS / OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">اصلاح نقشه</a></>}</div></>;
}
