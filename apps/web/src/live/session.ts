import {useEffect,useState} from 'react';
import {parseProduct,parseOfferPage} from '../api';
import {parseCataloguePage,parseCatalogueProduct,parseNeedState} from '../app/base/domain/parsers';
import {record,text,list,bool,oneOf,integer,pairedCoordinates,money} from '../app/base/domain/validation';

const prefix='inperson-journey:v2:';
const nullable=<T,>(parse:(v:unknown)=>T)=>(v:unknown)=>v===null?null:parse(v);
const number=(v:unknown)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new Error('number');return v;};
const point=(v:unknown)=>{const p=record(v);const c=pairedCoordinates(p.lat,p.lon);if(!c)throw new Error('point');return {...c,label:text(p.label,200)};};
const position=(v:unknown)=>{const p=record(v);return {...point(v),source:oneOf(p.source,['gps','manual']),accuracyMeters:p.accuracyMeters===null?null:number(p.accuracyMeters)};};
const filters=(v:unknown)=>{const f=record(v);return {min:money(f.min||null)??'',max:money(f.max||null)??'',radius:integer(f.radius,1,1000),withinRadius:bool(f.withinRadius),open:bool(f.open),credit:bool(f.credit),pay:bool(f.pay),kala:bool(f.kala),fast:bool(f.fast),sort:oneOf(f.sort,['price','nearest'])};};
const visit=(v:unknown)=>{const i=record(v),clock=i.localTime;if(clock!==null&&(typeof clock!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)))throw new Error('clock');const km=number(i.nearbyKm);if(km<=0||km>50)throw new Error('radius');return {topic:text(i.topic,120),nearbyKm:km,localTime:clock as string|null,reuseProduct:i.reuseProduct===true};};
const offers=(v:unknown)=>parseOfferPage({items:list(v,x=>{if(record(x).inventory_status!=='unconfirmed')throw new Error('stock');return x;},500),has_more:false,provenance:{currency:'toman',inventory_status:'unconfirmed'},hours_evaluated_at:new Date().toISOString()}).items;
const recent=(v:unknown)=>{const r=record(v);return {id:text(r.id,100),query:text(r.query,1000),page:parseCataloguePage(r.page),need:nullable(parseNeedState)(r.need),filters:filters(r.filters),assistant:bool(r.assistant),visit:nullable(visit)(r.visit),createdAt:text(r.createdAt,100)};};
const parsers={
  delegation:(v:unknown)=>{if(v===null)return null;const d=record(v);return {id:text(d.id,100),goal:oneOf(d.goal,['nearest','fastest','balanced','cheapest']),status:oneOf(d.status,['pending','planned','blocked']),request:text(d.request,1000),phoneKind:d.phoneKind===null?null:oneOf(d.phoneKind,['ask','smart','basic','any']),excluded:list(d.excluded,x=>text(x,120),20),offerId:d.offerId===null?null:text(d.offerId,120),note:text(d.note,1000)};},
  purchaseQueue:(v:unknown)=>list(v,x=>text(x,120),10),
  mode:(v:unknown)=>oneOf(v,['walking','driving','cycling','manual']),duration:(v:unknown)=>text(v,3),
  screen:(v:unknown)=>oneOf(v,['home','decide','results','stores','compare','contact','trip']),
  filters,position:nullable(position),query:(v:unknown)=>text(v,1000),draft:(v:unknown)=>text(v,1000),
  theme:(v:unknown)=>oneOf(v,['system','light','dark']),
  products:(v:unknown)=>list(v,parseCatalogueProduct,200),productPage:nullable(parseCataloguePage),product:nullable(parseProduct),
  offers,compare:offers,selected:(v:unknown)=>v===null?null:offers([v])[0],models:(v:unknown)=>list(v,parseProduct,3),
  messages:(v:unknown)=>list(v,x=>{const m=record(x);return {role:oneOf(m.role,['user','assistant']),content:text(m.content,1000)};},8),
  need:nullable(parseNeedState),
  thread:(v:unknown)=>list(v,x=>{const m=record(x);return {id:text(m.id,100),role:oneOf(m.role,['user','assistant']),text:text(m.text),kind:m.kind===undefined?undefined:oneOf(m.kind,['message','action'])};},100),
  visit:nullable(visit),bool,weight:(v:unknown)=>integer(v,0,100),scroll:(v:unknown)=>integer(v,0,10000000),
  mapMode:(v:unknown)=>oneOf(v,['auto','open','closed']),mapFocus:nullable(point),mapLibrary:offers,
  knownProducts:(v:unknown)=>Object.fromEntries(Object.entries(record(v)).slice(-200).map(([k,p])=>[k,parseProduct(p)])),
  recentResults:(v:unknown)=>list(v,recent,12),checklist:(v:unknown)=>list(v,x=>text(x,200),8),
  completed:(v:unknown)=>v===null?null:{id:text(record(v).id,100),shopName:text(record(v).shopName,1000),productName:text(record(v).productName,1000)},
};
export function readSession<T>(key:string,fallback:T,parse:(v:unknown)=>T):T{
  try{const raw=sessionStorage.getItem(prefix+key);return raw===null?fallback:parse(JSON.parse(raw));}catch{return fallback;}
}
export function writeSession(key:string,value:unknown){try{sessionStorage.setItem(prefix+key,JSON.stringify(value));}catch{/* Browsers may deny storage; the current journey still works in memory. */}}
export function useJourneyState<T>(kind:keyof typeof parsers,initial:T,suffix=''){
  const key=kind+suffix;
  const [value,setValue]=useState<T>(()=>readSession(key,initial,v=>parsers[kind](v) as T));
  useEffect(()=>{writeSession(key,value);},[key,value]);
  return [value,setValue] as const;
}
