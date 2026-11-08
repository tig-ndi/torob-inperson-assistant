import type { Offer, Product } from '../api';
export type { Offer, Product };
export type { Position, NeedState, PreparedFollowup, AssistantTurn } from '../app/base/domain/contracts';
export type Screen = 'home' | 'decide' | 'results' | 'stores' | 'compare' | 'contact' | 'trip';
export type Overlay = 'filters' | 'location' | 'alts' | 'nav' | 'menu' | 'voice' | 'history' | 'comparison' | 'travel' | 'checks' | 'reply' | 'journey' | 'directions' | 'shops' | 'plan' | 'postpone' | null;
export type Place = {lat:number;lon:number;label:string};
export type VisitInsights = {evaluated_at:string;time_source:'selected_time'|'server_clock';nearby_km:number;search_km:number;
  nearby:{shops:number;declared_open:number;declared_closed:number;unknown:number;truncated:boolean};
  open_offers:import('../app/base/domain/contracts').OfferPage;
  markets:{name:string;address:string;lat:number;lon:number;direct_distance_meters:number;category_shops:number;inventory_status:'unknown';opening_status:'unknown';evidence:'recorded_shop_address';shop_id:string}[];limitations:string[]};
export type Filters = { min: string; max: string; radius: number; withinRadius: boolean; open: boolean;
  credit: boolean; pay: boolean; kala: boolean; fast: boolean; sort: 'price' | 'nearest' };
export const DEFAULT_FILTERS: Filters = { min:'',max:'',radius:10,withinRadius:false,open:false,credit:false,pay:false,kala:false,fast:false,sort:'price' };
export const fa = (value: string | number | bigint) => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'.charAt(+d));
export const digits = (value: string) => value.replace(/[۰-۹٠-٩]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.includes(d) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) : '٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g,'');
export const money = (v: string | null | undefined) => v == null ? 'نامشخص' : fa(BigInt(v).toLocaleString('en-US'));
export const distance = (v: number | null) => v == null ? 'فاصله نامشخص' : v < 1000 ? `${fa(v)} متر` : `${fa((v/1000).toFixed(1))} کیلومتر`;
export const date = (v: string | null) => v && Number.isFinite(Date.parse(v)) ? new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeZone:'Asia/Tehran'}).format(new Date(v)) : 'تاریخ نامشخص';
export const selection = (o: Offer) => ({product_id:o.product_id, offer_id:o.offer_id, shop_id:o.shop_id});
export function openLabel(o: Offer) {
  const h = o.opening_hours;
  if (h.status === 'unknown') return 'ساعت کاری نامشخص';
  if (h.status === 'declared_closed') return 'بسته طبق برنامه';
  const end = h.today_shifts.at(-1)?.end_time.slice(0,5);
  return end ? `باز طبق برنامه · تا ${fa(end)}` : 'باز طبق برنامه';
}
export function ranked(offers: Offer[], weight: number) {
  // Rank ordinal price/distance, preserving large integer money exactly.
  const prices = [...new Set(offers.flatMap(o => o.price_toman === null ? [] : [o.price_toman]))].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  const distances = [...new Set(offers.flatMap(o=>o.direct_distance_meters === null ? [] : [o.direct_distance_meters]))].sort((a,b)=>a-b);
  const score = (o: Offer) => (1-weight/100)*(o.price_toman === null ? 1 : prices.indexOf(o.price_toman)/Math.max(1,prices.length-1)) + (weight/100)*(o.direct_distance_meters === null ? 1 : distances.indexOf(o.direct_distance_meters)/Math.max(1,distances.length-1));
  return [...offers].sort((a,b)=>score(a)-score(b)||a.offer_id.localeCompare(b.offer_id));
}
export type Summary = {counts:{products:number;offers:number;shops:number};categories:{name:string;count:number}[];coverage:string;contacts_synthetic:boolean;kalabarg_recorded:boolean};
export type Probable = {shop_id:string;name:string|null;address:string|null;location_label:string|null;lat:number;lon:number;direct_distance_meters:number;inventory_status:'unknown'};
export type Report = {id:string;created_at:string;product_id:string;offer_id:string;shop_id:string;source:'simulated'|'user_report';outcome:'available'|'price_changed'|'out_of_stock'|'no_answer'|'closed';price_toman:string|null;note:string;seller_confirmation:false};
export type SavedTrip = {reservation?:import('./upgrades').Reservation|null;id:string;created_at:string;product_id:string;offer_id:string;shop_id:string;product_name:string|null;shop_name:string|null;checklist:string[];alternatives:{product_id:string;offer_id:string;shop_id:string}[]};
export const outcomeLabels: Record<Report['outcome'],string> = {available:'موجود گزارش شد',price_changed:'قیمت جدید',out_of_stock:'ناموجود',no_answer:'بی‌پاسخ',closed:'فروشگاه بسته بود'};
export const safeImage = (url: string | undefined) => { try { const u=new URL(url??''); return ['https:','http:'].includes(u.protocol)?u.href:undefined; } catch { return undefined; } };

export function directMeters(a:{lat:number;lon:number},b:{lat:number;lon:number}){const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h))));}
