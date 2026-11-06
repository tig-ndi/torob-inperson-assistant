import {ArrowRight,ChevronLeft} from 'lucide-react';
import type {Shopping} from './state';
import {fa,money} from './data';

// Use the same products, questions and actions as the conversation. Only their
// presentation changes on the mobile map.
export default function MobileMapFeedback({a,retry}:{a:Shopping;retry:()=>void}){
 if(a.selected&&['contact','trip'].includes(a.screen))return null;
 if(a.error)return <div className="map-agent-feedback" role="alert"><p>{a.error}</p><button className="secondary-action" onClick={retry}>تلاش دوباره</button></div>;
 if(a.busy)return <p className="map-agent-feedback" role="status">دارم همین خرید را بررسی می‌کنم…</p>;
 const question=a.screen==='decide'?a.thread.filter(m=>m.role==='assistant'&&m.kind!=='action').at(-1)?.text:null;
 if(question)return <p className="map-agent-feedback" role="status">{question}</p>;
 if(a.screen==='stores'&&a.product)return <div className="map-agent-feedback"><button className="map-product-back" onClick={()=>{a.setSelected(null);a.go('results');}}><ArrowRight size={16}/>تغییر مدل محصول</button>{!a.mapOffers.length&&<p>با این شرایط، فروشگاهی پیدا نشد؛ شرایط خرید یا مدل را تغییر بده.</p>}</div>;
 if(a.screen!=='results')return <p className="map-agent-feedback">{a.position?'موقعیت ثبت شد؛ بالای نقشه بنویس چه می‌خواهی یا یکی از پیشنهادها را بزن.':'بالای نقشه بنویس چه می‌خواهی؛ برای فروشگاه‌های نزدیک، موقعیت جست‌وجو را هم انتخاب کن.'}</p>;
 return <div className="map-agent-feedback">
  <b>انتخاب محصول{a.products.length?` · ${fa(a.products.length)} مدل`:''}</b>
  {a.products.length?<div className="map-product-options" aria-label="انتخاب محصول روی نقشه">{a.products.map(p=><button key={p.product_id} data-map-product={p.product_id} onClick={()=>a.choose(p)}><b>{p.persian_title??'محصول ثبت‌شده'}</b><span>از {money(p.offer_summary.min_price_toman)} تومان</span><small>فروشگاه‌های این مدل <ChevronLeft size={14}/></small></button>)}</div>:<p>با این شرایط محصولی پیدا نشد؛ بودجه یا کالای موردنظر را تغییر بده.</p>}
  {a.productPage?.has_more&&<button className="map-sheet-more" onClick={()=>a.search(a.query,true,true)}>مدل‌های بیشتر</button>}
 </div>;
}
