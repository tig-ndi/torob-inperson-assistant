import {MapPin,Clock,ArrowLeft,Store} from 'lucide-react';
import type {Shopping} from './state';
import {distance,fa} from './data';
import {Badge,Btn} from '../prototype/ui';
import {Note,OfferCard} from './screens';

export default function VisitCards({a}:{a:Shopping}){
  if(!a.position)return <section className="visit-card"><MapPin size={22}/><div><b>فاصله و ساعت رفتن را با هم بسنجیم</b><p>با انتخاب یک نقطه، فروشگاه باز و گزینه‌های نزدیک‌تر را بررسی می‌کنم.</p></div><Btn onClick={a.beginPick}>انتخاب روی نقشه</Btn></section>;
  if(a.insightsBusy)return <div className="visit-working" role="status"><Clock size={17}/>بررسی ساعت کاری و گزینه‌های نزدیک…</div>;
  if(a.insightsError)return <section className="visit-card"><Note>بررسی شرایط مراجعه دریافت نشد: {a.insightsError}</Note><Btn kind="secondary" onClick={a.retry}>تلاش دوباره</Btn></section>;
  const v=a.insights;if(!v)return null;
  const time=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(new Date(v.evaluated_at));
  const nearby=v.nearby;
  const headline=nearby.declared_open?`${fa(nearby.declared_open)} فروشگاه نزدیک، طبق برنامه بازند`:nearby.shops&&nearby.declared_closed===nearby.shops&&!nearby.truncated?'همهٔ فروشگاه‌های ثبت‌شدهٔ نزدیک، طبق برنامه بسته‌اند':'گزینهٔ بازِ تأییدپذیر در محدودهٔ نزدیک پیدا نشد';
  return <section className="visit-insights" aria-label="تصمیم برای خرید حضوری"><header><span className="insight-icon"><Clock size={19}/></span><div><b>قبل از راه افتادن</b><p>{v.time_source==='selected_time'?'ساعت انتخابی':'ساعت بررسی'} {time} · اطراف {a.position.label}</p></div></header><h3>{headline}</h3><div className="insight-facts"><span>شعاع {fa(v.nearby_km)} کیلومتر</span><span>{nearby.truncated?'حداقل ':''}{fa(nearby.shops)} فروشگاه بررسی‌شده</span><span>{fa(nearby.unknown)} ساعت نامشخص</span></div>
    {!nearby.declared_open&&v.open_offers.items.length>0&&<div className="visit-option"><div className="option-label"><Store size={17}/><b>گزینهٔ باز طبق برنامه</b>{(v.open_offers.items[0]!.direct_distance_meters??0)>v.nearby_km*1000&&<Badge tone="info">بیرون از محدودهٔ نزدیک</Badge>}</div><p>نزدیک‌ترین پیشنهاد ثبت‌شده در فاصلهٔ {distance(v.open_offers.items[0]!.direct_distance_meters)} است. قبل از رفتن، موجودی و ساعت را بررسی کن.</p><OfferCard a={a} o={v.open_offers.items[0]!} compact/></div>}
    {!v.open_offers.items.length&&<Note>تا شعاع {fa(v.search_km)} کیلومتر، پیشنهاد منطبق با شرایطت و ساعت کاری باز پیدا نشد. این نتیجه دربارهٔ اطلاعات ثبت‌شده است.</Note>}
    {v.markets.map(m=><article key={m.shop_id} className="market-option"><div className="option-label"><MapPin size={18}/><b>{m.name}</b><Badge tone="warn">گزینهٔ احتمالی</Badge></div><p>این محدوده {distance(m.direct_distance_meters)} با تو فاصله دارد و در آدرس فروشگاه‌های این دسته ثبت شده است.</p><Note>{m.address}</Note><Note>ممکن است مغازهٔ دیگری پیدا کنی، اما بازبودن و موجودی آن‌ها را نمی‌دانیم؛ این پیشنهاد، فروشندهٔ دارای موجودی نیست.</Note><button className="secondary-action" onClick={()=>a.showPlace({lat:m.lat,lon:m.lon,label:m.name})}>دیدن محدوده روی نقشه <ArrowLeft size={15}/></button></article>)}
    {!nearby.declared_open&&!v.markets.length&&<Note>برای این دسته، مرکز خرید نزدیک دیگری از آدرس‌های مجموعه پیدا نکردم؛ دربارهٔ مغازه‌های خارج از مجموعه اطلاعاتی ندارم.</Note>}
    <Note>فاصله‌ها مستقیم و ساعت‌ها مطابق منبع‌اند؛ موجودی و قیمت لحظه‌ای تأیید نشده است.</Note>
  </section>;
}
