import { parseOffers, parseCataloguePage, parsePrepared, parseAlternatives } from '../app/base/domain/parsers';
import { record, list, text, integer, bool, identifier, oneOf, nullableText, money } from '../app/base/domain/validation';
import { parseProduct } from '../api';
import {parseReservation} from './upgrades';
import { selection, type Offer, type Filters, type Position, type Summary, type Report, type SavedTrip, type Probable, type VisitInsights } from './data';
import type {VisitIntent} from './conversation';
export { sendAssistant, assistantStatus, searchCatalogue } from '../app/base/domain/client';

export async function request(path: string, signal?: AbortSignal, body?: unknown, method?: string): Promise<unknown> {
  const response=await fetch(path,{signal,method:method??(body===undefined?'GET':'POST'),cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===204) return null;
  const value:unknown=await response.json();
  if(!response.ok){const v=record(value);throw new Error(typeof v.detail==='string'?v.detail:'درخواست انجام نشد؛ دوباره تلاش کنید.');}
  return value;
}
export function params(f: Filters, p:Position|null) {
  return {min_price_toman:f.min||null,max_price_toman:f.max||null,max_distance_km:p&&f.withinRadius?f.radius:null,
    open_now_only:f.open,in_person_credit_only:f.credit,payment_provider:f.kala?'kalabarg':f.pay?'torobpay':null,
    fast_delivery_only:f.fast,sort_by:p?f.sort:'price',user_lat:p?.lat??null,user_lon:p?.lon??null};
}
function query(values: Record<string,string|number|boolean|null|undefined>){return new URLSearchParams(Object.entries(values).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>[k,String(v)])).toString();}
export async function search(q:string,f:Filters,signal:AbortSignal,offset=0){return parseCataloguePage(await request('/api/products?'+query({q,max_price_toman:f.max||null,offset,limit:12}),signal));}
export async function product(id:string,signal?:AbortSignal){return parseProduct(record(await request(`/api/products/${encodeURIComponent(id)}`,signal)).product);}
export async function offers(id:string,f:Filters,p:Position|null,signal:AbortSignal,offset=0,visitTime:string|null=null){return parseOffers(await request(`/api/products/${encodeURIComponent(id)}/offers?`+query({...params(f,p),offset,limit:20,visit_time:visitTime}),signal));}
export async function prepare(o:Offer,p:Position|null,signal?:AbortSignal,visitTime:string|null=null){return parsePrepared(await request('/api/followups/prepare',signal,{...selection(o),user_lat:p?.lat??null,user_lon:p?.lon??null,visit_time:visitTime}));}
export async function alternatives(o:Offer,f:Filters,p:Position|null,outcome:'closed'|'out_of_stock'|'no_answer',source:Report['source'],signal?:AbortSignal,offset=0,visitTime:string|null=null){return parseAlternatives(await request('/api/followups/alternatives',signal,{...selection(o),...params(f,p),outcome,outcome_source:source,offset,limit:20,visit_time:visitTime}));}
export async function summary(signal:AbortSignal):Promise<Summary>{const v=record(await request('/api/local/summary',signal)),c=record(v.counts);return {counts:{products:integer(c.products),offers:integer(c.offers),shops:integer(c.shops)},categories:list(v.categories,x=>{const i=record(x);return{name:text(i.name),count:integer(i.count)};}),coverage:text(v.coverage),contacts_synthetic:bool(v.contacts_synthetic),kalabarg_recorded:bool(v.kalabarg_recorded)};}
export async function probable(category:string,id:string,p:Position,f:Filters,signal:AbortSignal):Promise<Probable[]>{const v=record(await request('/api/local/probable-shops?'+query({category,product_id:id,lat:p.lat,lon:p.lon,radius:f.radius}),signal));return list(v.items,x=>{const i=record(x);if(typeof i.lat!=='number'||typeof i.lon!=='number')throw new Error('مختصات نامعتبر');return {shop_id:identifier(i.shop_id),name:nullableText(i.name),address:nullableText(i.address),location_label:nullableText(i.location_label),lat:i.lat,lon:i.lon,direct_distance_meters:integer(i.direct_distance_meters),inventory_status:oneOf(i.inventory_status,['unknown'])};});}
function parseReport(x:unknown):Report{const v=record(x);return{id:identifier(v.id),created_at:text(v.created_at),product_id:identifier(v.product_id),offer_id:identifier(v.offer_id),shop_id:identifier(v.shop_id),source:oneOf(v.source,['simulated','user_report']),outcome:oneOf(v.outcome,['available','price_changed','out_of_stock','no_answer','closed']),price_toman:money(v.price_toman),note:text(v.note),seller_confirmation:false};}
export async function saveReport(o:Offer,data:Pick<Report,'source'|'outcome'|'price_toman'|'note'>){return parseReport(await request('/api/local/followups',undefined,{...selection(o),...data}));}
export async function reports(o:Offer,signal?:AbortSignal){return list(record(await request('/api/local/followups?'+query({offer_id:o.offer_id}),signal)).items,parseReport);}
function parseTrip(x:unknown):SavedTrip{const v=record(x);return{reservation:v.reservation?parseReservation(v.reservation):null,id:identifier(v.id),created_at:text(v.created_at),product_id:identifier(v.product_id),offer_id:identifier(v.offer_id),shop_id:identifier(v.shop_id),product_name:nullableText(v.product_name),shop_name:nullableText(v.shop_name),checklist:list(v.checklist,x=>text(x,200),8),alternatives:list(v.alternatives,x=>{const a=record(x);return{product_id:identifier(a.product_id),offer_id:identifier(a.offer_id),shop_id:identifier(a.shop_id)};},2)};}
export async function saveTrip(o:Offer,others:Offer[],checklist:string[],reservationId?:string){return parseTrip(await request('/api/local/trips',undefined,{...selection(o),alternatives:others.map(selection),checklist,...(reservationId?{reservation_id:reservationId}:{})}));}
export async function trips(signal?:AbortSignal){return list(record(await request('/api/local/trips',signal)).items,parseTrip);}
export async function removeTrip(id:string){await request('/api/local/trips/'+encodeURIComponent(id),undefined,undefined,'DELETE');}
export async function visit(id:string,p:Position,f:Filters,intent:VisitIntent|null,signal:AbortSignal):Promise<VisitInsights>{
  const v=record(await request('/api/local/visit-insights',signal,{product_id:id,lat:p.lat,lon:p.lon,nearby_km:intent?.nearbyKm??2,search_km:Math.max(intent?.nearbyKm??2,f.radius,15),local_time:intent?.localTime??null,min_price_toman:f.min||null,max_price_toman:f.max||null,credit:f.credit,payment_provider:f.kala?'kalabarg':f.pay?'torobpay':null,fast_delivery_only:f.fast}));
  const n=record(v.nearby);
  return {evaluated_at:text(v.evaluated_at),time_source:oneOf(v.time_source,['selected_time','server_clock']),nearby_km:Number(v.nearby_km),search_km:Number(v.search_km),
    nearby:{shops:integer(n.shops),declared_open:integer(n.declared_open),declared_closed:integer(n.declared_closed),unknown:integer(n.unknown),truncated:bool(n.truncated)},
    open_offers:parseOffers(v.open_offers),markets:list(v.markets,x=>{const m=record(x);if(typeof m.lat!=='number'||typeof m.lon!=='number'||!Number.isFinite(m.lat)||!Number.isFinite(m.lon)||Math.abs(m.lat)>90||Math.abs(m.lon)>180)throw new Error('مختصات مرکز خرید معتبر نیست');return {name:text(m.name),address:text(m.address),lat:m.lat,lon:m.lon,direct_distance_meters:integer(m.direct_distance_meters),category_shops:integer(m.category_shops),inventory_status:oneOf(m.inventory_status,['unknown']),opening_status:oneOf(m.opening_status,['unknown']),evidence:oneOf(m.evidence,['recorded_shop_address']),shop_id:identifier(m.shop_id)};},3),limitations:list(v.limitations,x=>text(x))};
}

export async function arrivals(offers:Offer[],p:Position|null,time:string|null,mode:import('./upgrades').TravelMode,minutes:string,selectedId:string|null,signal:AbortSignal,useRoad=false):Promise<import('./journey').ArrivalCheck[]>{
  const v=record(await request('/api/local/arrival-checks',signal,{selections:offers.map(selection),lat:p?.lat??null,lon:p?.lon??null,local_time:time,mode,use_road_route:useRoad,manual_minutes:mode==='manual'&&minutes?Number(minutes):null,manual_offer_id:selectedId}));
  return list(v.items,x=>{const i=record(x);return {offer_id:identifier(i.offer_id),product_id:identifier(i.product_id),shop_id:identifier(i.shop_id),departure_at:text(i.departure_at),arrival_at:nullableText(i.arrival_at),minutes_min:i.minutes_min===null?null:integer(i.minutes_min,1,1000000),minutes_max:i.minutes_max===null?null:integer(i.minutes_max,1,1000000),basis:oneOf(i.basis,['unknown','user_duration','rough_walking_range','street_route']),departure_status:oneOf(i.departure_status,['declared_open','declared_closed','unknown']),arrival_status:oneOf(i.arrival_status,['declared_open','declared_closed','unknown']),margin_status:oneOf(i.margin_status,['declared_open','declared_closed','unknown']),margin_minutes:integer(i.margin_minutes),risk:oneOf(i.risk,['ready','unknown','closing_soon','closed']),inventory_status:oneOf(i.inventory_status,['unconfirmed'])};},30);
}

export async function destinations(q:string,p:Position,f:Filters,intent:VisitIntent,mode:import('./upgrades').TravelMode,need:import('../app/base/domain/contracts').NeedState|null,signal:AbortSignal){
  const v=record(await request('/api/local/destinations',signal,{mode,query:q,lat:p.lat,lon:p.lon,nearby_km:intent.nearbyKm,search_km:Math.max(intent.nearbyKm,f.radius,15),local_time:intent.localTime,min_price_toman:f.min||null,max_price_toman:f.max||null,credit:f.credit,payment_provider:f.kala?'kalabarg':f.pay?'torobpay':null,fast_delivery_only:f.fast,category_name:need?.category_name??null,category_cleared:need?.category_cleared??false,reference_product_id:need?.reference_product_id??null,minimum_battery_mah:need?.battery_requirement.minimum_mah??null,source_filters:need?.source_filters??{colour:null,size:null,connector:null}}));
  return {ids:list(v.product_ids,identifier),selections:list(v.selections??[],x=>{const s=record(x);return {product_id:identifier(s.product_id),offer_id:identifier(s.offer_id),shop_id:identifier(s.shop_id)};}),models:integer(v.matched_models),shops:integer(v.matched_shops)};
}

export async function destinationOffer(s:{product_id:string;offer_id:string;shop_id:string},p:Position,time:string|null,signal:AbortSignal){return parsePrepared(await request('/api/followups/prepare',signal,{...s,user_lat:p.lat,user_lon:p.lon,visit_time:time})).selected_offer;}
