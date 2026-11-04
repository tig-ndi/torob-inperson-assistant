import {directMeters,type Filters,type Offer,type Position,type Product} from './data.ts';

// The library retains history; the visible map is always scoped to this purchase.
export function currentMapOffers(library:Offer[],products:Product[],filters:Filters,position:Position|null):Offer[]{
  const ids=new Set(products.map(p=>p.product_id));
  return library.filter(o=>ids.has(o.product_id))
    .map(o=>({...o,direct_distance_meters:position&&o.shop.lat!==null&&o.shop.lon!==null?directMeters(position,{lat:o.shop.lat,lon:o.shop.lon}):null}))
    .filter(o=>{
      if(filters.max&&(o.price_toman===null||BigInt(o.price_toman)>BigInt(filters.max)))return false;
      if(filters.min&&(o.price_toman===null||BigInt(o.price_toman)<BigInt(filters.min)))return false;
      if(filters.withinRadius&&(o.direct_distance_meters===null||o.direct_distance_meters>filters.radius*1000))return false;
      if(filters.open&&o.opening_hours.status!=='declared_open')return false;
      if(filters.credit&&o.in_person_credit.status!=='matches_declared_terms')return false;
      if(filters.pay||filters.kala){const names=filters.kala?['کالابرگ','کالا برگ']:['ترب پی','تربپی'];if(!o.in_person_credit.options.some(option=>option.status==='matches_declared_terms'&&names.includes((option.provider_name??'').replace(/\u200c/g,' '))))return false;}
      if(filters.fast&&!o.shop.supports_fast_delivery)return false;
      return true;
    });
}
