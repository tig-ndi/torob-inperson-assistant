import {record,list,text,integer,bool,identifier,oneOf,money,nullableText} from '../app/base/domain/validation';
import {request} from './client';
import {selection,type Offer,type Position} from './data';
export type TravelMode='walking'|'driving'|'cycling'|'manual';
export const travelLabels:Record<TravelMode,string>={walking:'پیاده',driving:'خودرو',cycling:'دوچرخه',manual:'زمان واردشده'};
export function travelFromText(value:string):TravelMode|null{
 const input=value.replace(/‌/g,' ').replace(/ي/g,'ی');let chosen:TravelMode|null=null;
 for(const clause of input.split(/[،,؛;.!؟]|اما|ولی|بلکه/)){
  const matches=[...clause.matchAll(/دوچرخه|پیاده|ماشین|خودرو/g)];if(matches.length>1&&/\sیا\s/.test(clause))continue;
  for(let i=0;i<matches.length;i++){const match=matches[i]!,at=match.index!,word=match[0],before=clause.slice(Math.max(0,at-10),at),after=clause.slice(at+word.length,matches[i+1]?.index??clause.length);
   if(/بدون\s*$|نه\s*(?:با\s*)?$/.test(before)||/نمی\s*(?:روم|رم|آیم|ام)|ندارم|نیستم/.test(after))continue;
   if(word==='پیاده'&&/^\s*روی/.test(after))continue;
   if(word==='ماشین'&&/^\s*(?:اصلاح|لباسشویی|ظرفشویی|حساب|کنترلی)/.test(after))continue;
   const explicit=/با\s*$/.test(before)||/دارم|می\s*(?:روم|رم|آیم|ام)/.test(after)||clause.trim()===word||word==='پیاده';
   if(explicit)chosen=word==='دوچرخه'?'cycling':word==='پیاده'?'walking':'driving';
  }
 }return chosen;
}

export type RoadRoute={offer_id:string;product_id:string;shop_id:string;mode:Exclude<TravelMode,'manual'>;geometry:{type:'LineString';coordinates:[number,number][]};distance_meters:number;duration_seconds:number;endpoint_offset_meters:number;computed_at:string;steps:{name:string;type:string;modifier:string;distance_meters:number;duration_seconds:number}[]};
export type RouteResponse={routes:RoadRoute[];errors:string[]};
export type Reservation={id:string;code:string;status:'active'|'expired'|'cancelled'|'unknown';created_at:string;expires_at:string;price_toman:string;source:'simulated'};
export type SellerReply={outcome:'available'|'price_changed'|'out_of_stock'|'closed'|'no_answer';price_toman:string|null;hold_minutes:number;closes_at:string|null;note:string;responded_at:string;source:'simulated'};
export type CheckItem={product_id:string;offer_id:string;shop_id:string;shop_name:string|null;product_name:string|null;source_price_toman:string|null;source:'simulated';channel:'local_seller_panel';seller_token:string;reply:SellerReply|null;reservation:Reservation|null};
export type SellerBatch={id:string;journey_id:string;created_at:string;source:'simulated';items:CheckItem[]};
export type CatalogueContext={budget:null|{min_toman:string;max_toman:string;typical_min_toman:string;typical_max_toman:string;model_count:number;truncated:boolean};products:Record<string,{authenticity:null|{label:string;evidence:string;declared_non_original:boolean};unusual_offer_ids:string[];nearby_shop_count:number|null;radius_km:number}>};
const requiredMoney=(v:unknown)=>{const m=money(v);if(m===null)throw new Error('مبلغ نامشخص است');return m;};
export function parseReservation(value:unknown):Reservation{const r=record(value);return{id:identifier(r.id),code:text(r.code,20),status:oneOf(r.status,['active','expired','cancelled','unknown']),created_at:text(r.created_at),expires_at:text(r.expires_at),price_toman:requiredMoney(r.price_toman),source:oneOf(r.source,['simulated'])};}
export function parseCheck(value:unknown):CheckItem{const r=record(value),p=r.reply===null?null:record(r.reply);return{product_id:identifier(r.product_id),offer_id:identifier(r.offer_id),shop_id:identifier(r.shop_id),shop_name:nullableText(r.shop_name),product_name:nullableText(r.product_name),source_price_toman:money(r.source_price_toman),source:oneOf(r.source,['simulated']),channel:oneOf(r.channel,['local_seller_panel']),seller_token:identifier(r.seller_token),reservation:r.reservation===null?null:parseReservation(r.reservation),reply:p?{outcome:oneOf(p.outcome,['available','price_changed','out_of_stock','closed','no_answer']),price_toman:money(p.price_toman),hold_minutes:integer(p.hold_minutes,0,120),closes_at:nullableText(p.closes_at),note:text(p.note,600),responded_at:text(p.responded_at),source:oneOf(p.source,['simulated'])}:null};}
function parseBatch(value:unknown):SellerBatch{const b=record(value);return{id:identifier(b.id),journey_id:text(b.journey_id),created_at:text(b.created_at),source:oneOf(b.source,['simulated']),items:list(b.items,parseCheck,3)};}
export async function getChecks(journey:string,signal?:AbortSignal){return list(record(await request('/api/local/checks?journey_id='+encodeURIComponent(journey),signal)).items,parseBatch,12);}
export async function createChecks(journey:string,offers:Offer[]){return parseBatch(await request('/api/local/checks',undefined,{journey_id:journey,selections:offers.map(selection)}));}
export async function sellerInfo(batch:string,token:string,signal?:AbortSignal){return parseCheck(await request(`/api/local/seller-demo/${encodeURIComponent(batch)}/${encodeURIComponent(token)}`,signal));}
export async function replyToCheck(batch:string,token:string,reply:Omit<SellerReply,'source'|'responded_at'>){return parseCheck(await request(`/api/local/seller-demo/${encodeURIComponent(batch)}/${encodeURIComponent(token)}`,undefined,reply));}
export async function reserve(batch:string,offer:string){return parseReservation(await request(`/api/local/checks/${encodeURIComponent(batch)}/${encodeURIComponent(offer)}/reserve`,undefined,{}));}
export async function cancelReservation(batch:string,offer:string){return parseReservation(await request(`/api/local/checks/${encodeURIComponent(batch)}/${encodeURIComponent(offer)}/cancel`,undefined,{}));}
export async function roadRoutes(offers:Offer[],position:Position,mode:Exclude<TravelMode,'manual'>,signal:AbortSignal):Promise<RouteResponse>{
 const data=record(await request('/api/local/road-routes',signal,{selections:offers.map(selection),lat:position.lat,lon:position.lon,mode,consent:true})),routes:RoadRoute[]=[],errors:string[]=[];
 for(const value of list(data.items,x=>x,3)){
  const r=record(value);if(r.status==='unavailable'){errors.push(`${offers.find(o=>o.offer_id===r.offer_id)?.shop.name??'یکی از فروشگاه‌ها'}: ${text(r.reason)}`);continue;}if(r.status!=='ready')throw new Error('وضعیت مسیر معتبر نیست');const g=record(r.geometry);if(g.type!=='LineString')throw new Error('هندسهٔ مسیر معتبر نیست');
  const coordinates=list(g.coordinates,p=>{if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('مختصات مسیر معتبر نیست');return [p[0] as number,p[1] as number] as [number,number];},40000);if(coordinates.length<2)throw new Error('مسیر خالی است');
  routes.push({offer_id:identifier(r.offer_id),product_id:identifier(r.product_id),shop_id:identifier(r.shop_id),mode:oneOf(r.mode,['walking','driving','cycling']),geometry:{type:'LineString',coordinates},distance_meters:integer(r.distance_meters,0,2000000),duration_seconds:integer(r.duration_seconds,0,1000000),endpoint_offset_meters:integer(r.endpoint_offset_meters,0,10000),computed_at:text(r.computed_at),steps:list(r.steps,s=>{const v=record(s);return{name:text(v.name,200),type:text(v.type,40),modifier:text(v.modifier,40),distance_meters:integer(v.distance_meters,0,1000000),duration_seconds:integer(v.duration_seconds,0,1000000)};},200)});
 }return{routes,errors};
}
export async function catalogueContext(query:string,ids:string[],position:Position|null,radius:number,signal:AbortSignal,category:string|null=null):Promise<CatalogueContext>{
 const v=record(await request('/api/local/catalogue-context',signal,{query:query.slice(0,120),category_name:category,product_ids:ids.slice(0,12),lat:position?.lat??null,lon:position?.lon??null,radius_km:radius}));const b=v.budget===null?null:record(v.budget);
 const products=Object.fromEntries(Object.entries(record(v.products)).map(([id,value])=>{const p=record(value),a=p.authenticity===null?null:record(p.authenticity);return[id,{authenticity:a?{label:text(a.label),evidence:text(a.evidence),declared_non_original:bool(a.declared_non_original)}:null,unusual_offer_ids:list(p.unusual_offer_ids,x=>identifier(x)),nearby_shop_count:p.nearby_shop_count===null?null:integer(p.nearby_shop_count),radius_km:Number(p.radius_km)}];}));
 return{budget:b?{min_toman:requiredMoney(b.min_toman),max_toman:requiredMoney(b.max_toman),typical_min_toman:requiredMoney(b.typical_min_toman),typical_max_toman:requiredMoney(b.typical_max_toman),model_count:integer(b.model_count),truncated:bool(b.truncated)}:null,products};
}
export function priceAge(iso:string|null,now=Date.now()){if(!iso)return 'زمان ثبت قیمت نامشخص';const age=now-Date.parse(iso);if(!Number.isFinite(age)||age<0)return 'زمان ثبت نیاز به بررسی دارد';const days=Math.floor(age/86400000);return days===0?'قیمت کمتر از ۲۴ ساعت پیش در منبع ثبت شده':`قیمت ${new Intl.NumberFormat('fa-IR').format(days)} روز پیش ثبت شده` ;}
export function indoorGuide(address:string|null){if(!address)return[];const result:string[]=[];const building=address.match(/(?:پاساژ|مجتمع|مرکز خرید|بازارچه|سرای)\s*[^،,\n]{1,65}/)?.[0];const floor=address.match(/(?:طبقه|همکف|زیرزمین)(?:\s*[آ-ی\d۰-۹-]{1,12})?/)?.[0];const unit=address.match(/(?:واحد|غرفه|پلاک)\s*[\d۰-۹A-Za-z/-]{1,12}/)?.[0];if(building)result.push(building);if(floor)result.push(floor);if(unit)result.push(unit);return [...new Set(result)];}

export function firstShopOffers(offers:Offer[]){const seen=new Set<string>();return offers.filter(o=>{if(seen.has(o.shop_id))return false;seen.add(o.shop_id);return true;});}

export function sellerConcern(reply:SellerReply|undefined,arrival:string|null|undefined):string|null{
 if(!reply)return null;
 if(reply.outcome==='out_of_stock')return 'در پاسخ آزمایشی، کالا ناموجود گزارش شده؛ جایگزین را بررسی کن.';
 if(reply.outcome==='closed')return 'در پاسخ آزمایشی، فروشگاه بسته گزارش شده است.';
 if(reply.outcome==='no_answer')return 'پاسخ آزمایشی فروشنده نرسیده؛ موجودی و ساعت هنوز نیاز به بررسی دارند.';
 if(reply.closes_at&&arrival){const zone=reply.responded_at.match(/([+-]\d{2}:\d{2}|Z)$/)?.[0]??'+03:30';let closing=Date.parse(reply.responded_at.slice(0,10)+'T'+reply.closes_at+':00'+zone);if(closing<=Date.parse(reply.responded_at))closing+=86400000;if(Date.parse(arrival)+600000>=closing)return 'طبق ساعت بسته‌شدن پاسخ آزمایشی، ممکن است فرصت رسیدن و خرید نداشته باشی.';}
 return null;
}
