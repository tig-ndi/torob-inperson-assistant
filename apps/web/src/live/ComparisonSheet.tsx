import {useEffect,useState,useRef,isValidElement,type ReactNode} from 'react';
import {MapPin,Package,Store,Trash2,CheckCircle2,XCircle,AlertTriangle,RotateCcw,ChevronDown,MessageSquare} from 'lucide-react';
import {HOURS_REASON_TEXT,CREDIT_REASON_TEXT} from '../api';
import type {Shopping} from './state';
import {date,distance,fa,money,openLabel,safeImage,type Offer,type Product} from './data';
import {CompareAdvice,ModelAdvice} from './VisitDecision';
import {Slider} from '../prototype/ui';
import Hint from './Hint';
import {comparisonValue} from './comparisonValues';

type Field<T>={key:string;label:string;value:(item:T)=>ReactNode};
const missing='در منبع ثبت نشده';
function cellText(value:ReactNode):string{if(value==null||typeof value==='boolean')return '';if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(cellText).join(' ');if(isValidElement<{children?:ReactNode}>(value))return cellText(value.props.children);return '';}

function literal(value:unknown):string{
  if(value===null||value===undefined||value==='')return missing;
  if(typeof value==='boolean')return value?'بله':'خیر';
  if(Array.isArray(value))return value.length?value.map(literal).join('، '):missing;
  if(typeof value==='object')return Object.entries(value).map(([key,v])=>`${key}: ${literal(v)}`).join('\n');
  return String(value);
}
type Tone='positive'|'negative'|'caution';
function Signal({tone,children}:{tone:Tone;children:ReactNode}){const Icon=tone==='positive'?CheckCircle2:tone==='negative'?XCircle:AlertTriangle;return <span className={'comparison-signal '+tone}><Icon size={16} aria-hidden="true"/><span>{children}</span></span>;}
function specValue(value:string|null){
  if(value===null||!value.trim())return <span className="comparison-muted">{missing}</span>;
  const normalized=value.trim().toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک');
  if(/^(دارد|بله|yes|true|supported)$/.test(normalized))return <Signal tone="positive">{value}</Signal>;
  if(/^(ندارد|خیر|نه|no|false|not supported|پشتیبانی نمی‌کند)$/.test(normalized))return <Signal tone="negative">{value}</Signal>;
  return value;
}
type Column={id:string;name:string;sub?:string;removeLabel?:string;remove?:()=>void;action?:()=>void;actionLabel?:string;images?:string[]};
function Fields<T>({items,fields,id,columns,actions=false}:{items:T[];fields:Field<T>[];id:(item:T)=>string;columns:Column[];actions?:boolean}){
  return <div className="comparison-table-wrap"><table className="comparison-table" style={{'--compare-count':items.length} as import('react').CSSProperties}>
    <caption className="sr-only">مقایسهٔ اطلاعات ثبت‌شدهٔ {fa(items.length)} گزینه</caption>
    <thead><tr><th scope="col">معیار مقایسه</th>{columns.map((column,i)=><th key={column.id} scope="col"><small>گزینهٔ {fa(i+1)}</small><strong>{column.name}</strong>{column.sub&&<span className="comparison-column-sub">{column.sub}</span>}{actions&&<div className="comparison-column-actions">{column.remove&&<Hint text="حذف فقط این گزینه از مقایسه"><button type="button" className="icon-button" aria-label={column.removeLabel} onClick={column.remove}><Trash2 size={17}/></button></Hint>}{column.action&&<button className="comparison-continue" onClick={column.action}>{column.actionLabel}</button>}</div>}{actions&&!!column.images?.length&&<details><summary><ChevronDown size={14} aria-hidden="true"/><span>تصاویر</span></summary><div className="comparison-images">{column.images.map((url,j)=><img key={j} src={url} loading="lazy" alt={`تصویر ${fa(j+1)} ${column.name}`} referrerPolicy="no-referrer"/>)}</div></details>}</th>)}</tr></thead>
    <tbody>{fields.map(field=><tr key={field.key} data-comparison-field={field.key}><th scope="row">{field.label}</th>{items.map((item,i)=><td key={id(item)}><span className="comparison-mobile-label" title={columns[i]?.name}>گزینهٔ {fa(i+1)} · {columns[i]?.name}</span><div className="comparison-cell">{field.value(item)}</div></td>)}</tr>)}</tbody>
  </table></div>;
}
const productFields:Field<Product>[]=[
  {key:'brand',label:'برند',value:p=>p.brand_name??missing},
  {key:'model',label:'مدل',value:p=>p.model??missing},
  {key:'category',label:'دسته‌بندی',value:p=>p.category_name??missing},
  {key:'min-price',label:'کمترین قیمت ثبت‌شده · تومان',value:p=>money(p.offer_summary.min_price_toman)},
  {key:'max-price',label:'بیشترین قیمت ثبت‌شده · تومان',value:p=>money(p.offer_summary.max_price_toman)},
  {key:'offers',label:'تعداد پیشنهادهای ثبت‌شده',value:p=>fa(p.offer_summary.offer_count)},
  {key:'missing-prices',label:'پیشنهادهای بدون قیمت',value:p=>fa(p.offer_summary.missing_price_count)},
];
const offerFields:Field<Offer>[]=[
  {key:'seller-title',label:'عنوان ثبت‌شدهٔ فروشنده',value:o=>o.seller_title??missing},
  {key:'price',label:'قیمت ثبت‌شده · تومان',value:o=>money(o.price_toman)},
  {key:'price-date',label:'آخرین تغییر قیمت',value:o=>date(o.last_price_changed_at)},
  {key:'inventory',label:'موجودی',value:()=><Signal tone="caution">تأیید نشده؛ پیشنهاد تاریخی منبع</Signal>},
  {key:'distance',label:'فاصلهٔ مستقیم · مسیر خیابانی نیست',value:o=>distance(o.direct_distance_meters)},
  {key:'hours',label:'وضعیت ساعت کاری در زمان بررسی',value:o=><Signal tone={o.opening_hours.status==='declared_open'?'positive':o.opening_hours.status==='declared_closed'?'negative':'caution'}>{openLabel(o)}</Signal>},
  {key:'hours-reason',label:'دلیل وضعیت ساعت کاری',value:o=>HOURS_REASON_TEXT[o.opening_hours.reason]},
  {key:'shifts',label:'همهٔ شیفت‌های روز بررسی',value:o=>o.opening_hours.today_shifts.map(s=>`${fa(s.start_time.slice(0,5))} تا ${fa(s.end_time.slice(0,5))}${s.ends_next_day?' روز بعد':''}`).join('، ')||missing},
  {key:'overnight',label:'ادامهٔ شیفت روز قبل',value:o=>o.opening_hours.previous_day_overnight_shifts.map(s=>`${fa(s.start_time.slice(0,5))} تا ${fa(s.end_time.slice(0,5))} روز بعد`).join('، ')||missing},
  {key:'address',label:'آدرس کامل',value:o=>o.shop.address??missing},
  {key:'location',label:'توضیحات محل',value:o=>o.shop.location_label??missing},
  {key:'description',label:'توضیحات فروشنده',value:o=>o.description??missing},
  {key:'warranty',label:'گارانتی ثبت‌شده',value:o=>literal(o.warranty)},
  {key:'credit',label:'شرایط خرید اعتباری حضوری',value:o=><><Signal tone={o.in_person_credit.status==='matches_declared_terms'?'positive':o.in_person_credit.status==='unknown'?'caution':'negative'}>{o.in_person_credit.status==='matches_declared_terms'?'منطبق با شرایط ثبت‌شده':o.in_person_credit.status==='unknown'?'نامشخص':'با شرایط ثبت‌شده منطبق نیست'}</Signal>{o.in_person_credit.options.map((c,i)=><p key={i}>{c.provider_name??'نام سرویس ثبت نشده'} · کانال {c.channel??'نامشخص'} · حداقل {money(c.min_price_toman)} و حداکثر {money(c.max_price_toman)} تومان · {c.status==='matches_declared_terms'?'منطبق با شرایط حضوری':'تطابق حضوری تأیید نشده'} · {CREDIT_REASON_TEXT[c.reason]} · دسته‌های مجاز: {c.category_names?.join('، ')||'نامشخص'}</p>)}</>},
  {key:'delivery',label:'ارسال فوری ثبت‌شده',value:o=>o.shop.supports_fast_delivery==null?<span className="comparison-muted">{missing}</span>:<Signal tone={o.shop.supports_fast_delivery?'positive':'negative'}>{o.shop.supports_fast_delivery?'طبق منبع دارد':'طبق منبع ندارد'}</Signal>},
  {key:'day',label:'روز بررسی ساعت کاری',value:o=>({mon:'دوشنبه',tue:'سه‌شنبه',wed:'چهارشنبه',thu:'پنجشنبه',fri:'جمعه',sat:'شنبه',sun:'یکشنبه'}[o.opening_hours.local_day]??o.opening_hours.local_day)},
];

export default function ComparisonSheet({a,onMap}:{a:Shopping;onMap:()=>void}){
  const [tab,setTab]=useState<'products'|'offers'>(a.screen==='results'&&a.models.length||!a.compare.length?'products':'offers');
  const [reset,setReset]=useState(false),[differences,setDifferences]=useState(false);
  const cancelReset=useRef<HTMLButtonElement>(null),resetTrigger=useRef<HTMLButtonElement>(null),emptyBack=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(reset)cancelReset.current?.focus();},[reset]);
  useEffect(()=>{if(!a.models.length&&!a.compare.length)emptyBack.current?.focus();},[a.models.length,a.compare.length]);
  const keepComparison=()=>{setReset(false);requestAnimationFrame(()=>resetTrigger.current?.focus());};
  useEffect(()=>{if(tab==='products'&&!a.models.length&&a.compare.length)setTab('offers');else if(tab==='offers'&&!a.compare.length&&a.models.length)setTab('products');},[a.models.length,a.compare.length,tab]);
  const specs=new Map<string,{label:string;section:string|null;key:string|null}>();
  for(const p of a.models)for(const s of p.specs){const key=JSON.stringify([s.section,s.key]);if(!specs.has(key))specs.set(key,{label:[s.section,s.key].filter(Boolean).join(' · ')||'مشخصهٔ بدون عنوان',section:s.section,key:s.key});}
  const allSpecs:Field<Product>[]=[...specs.entries()].map(([key,s])=>({key:'spec:'+key,label:s.label,value:p=>{const rows=p.specs.filter(x=>x.section===s.section&&x.key===s.key);return rows.length?rows.map((x,i)=><p key={i}>{specValue(x.value)}</p>):<span className="comparison-muted">{missing}</span>;}}));
  const productColumns:Column[]=a.models.map(p=>({id:p.product_id,name:p.persian_title??missing,removeLabel:`حذف محصول ${p.persian_title??p.product_id} از مقایسه`,remove:()=>a.toggleModel(p),action:()=>a.choose(p),actionLabel:'فروشگاه‌ها',images:p.image_urls.map(safeImage).filter((url):url is string=>!!url)}));
  const offerColumns:Column[]=a.compare.map(o=>({id:o.offer_id,name:o.shop.name??missing,sub:a.knownProducts[o.product_id]?.persian_title??undefined,removeLabel:`حذف پیشنهاد ${o.shop.name??o.offer_id} از مقایسه`,remove:()=>a.toggleCompare(o),action:()=>a.contact(o),actionLabel:'بررسی فروشگاه'}));
  const count=tab==='products'?a.models.length:a.compare.length;
  if(!a.models.length&&!a.compare.length)return <div className="comparison-sheet"><p className="comparison-note">انتخاب‌های مقایسه خالی شد. از کارت‌های محصول یا فروشگاه دوباره گزینه اضافه کن.</p><button ref={emptyBack} className="secondary-action" onClick={()=>a.setOverlay(null)}>بازگشت به انتخاب‌ها</button></div>;
  const productRows=[...productFields,...allSpecs,...(a.models.some(p=>p.battery_capacity)?[{key:'battery-evidence',label:'اطلاعات و شواهد ظرفیت باتری',value:(p:Product)=>p.battery_capacity?.capacity_mah!=null?`${fa(p.battery_capacity.capacity_mah)} میلی‌آمپرساعت، طبق مشخصات منبع`:p.battery_capacity?.status==='not_applicable'?'برای این کالا کاربرد ندارد':'ظرفیت معتبر و یکسانی در منبع ثبت نشده'}]:[])];
  const important=/حافظه داخلی|ظرفیت حافظه|مقدار RAM|ظرفیت باتری|توان خروجی|نوع درگاه|جنس زیره|جنس رویه|سایز/;
  const highlighted=allSpecs.filter(f=>important.test(f.label)).slice(0,4);
  const primaryProducts=[...productFields.filter(f=>['brand','min-price'].includes(f.key)),...highlighted];
  const detailedProducts=productRows.filter(f=>!primaryProducts.some(x=>x.key===f.key));
  const primaryOffers=offerFields.filter(f=>['price','price-date','inventory','distance','hours','address','warranty','credit'].includes(f.key));
  const detailedOffers=offerFields.filter(f=>!primaryOffers.some(x=>x.key===f.key));
  const visible=<T,>(fields:Field<T>[],items:T[])=>differences?fields.filter(f=>new Set(items.map(item=>comparisonValue(cellText(f.value(item))))).size>1):fields;
  const arrival:Field<Offer>={key:'arrival',label:'زمان رسیدن و فرصت خرید',value:o=>{const c=a.arrivalChecks[o.offer_id];return c?.minutes_max!=null?<Signal tone={c.risk==='ready'?'positive':c.risk==='closed'?'negative':'caution'}>{fa(c.minutes_min!)}{c.minutes_min===c.minutes_max?'':` تا ${fa(c.minutes_max)}`} دقیقه · {c.basis==='street_route'?'مسیر خیابانی بدون ترافیک زنده':c.basis==='user_duration'?'زمان واردشده از مسیریاب یا کاربر':'برآورد تقریبی پیاده'} · {c.risk==='ready'?'طبق برنامه فرصت مراجعه دارد':c.risk==='closed'?'طبق برنامه بسته است':c.risk==='closing_soon'?'خطر بسته‌شدن هنگام رسیدن':'نیاز به بررسی ساعت دارد'}</Signal>:<Signal tone="caution">زمان رسیدن نامشخص است</Signal>;}};
  return <div className="comparison-sheet">
    <nav className="comparison-tabs" aria-label="نوع مقایسه">{(['products','offers'] as const).map(kind=><button key={kind} type="button" aria-pressed={tab===kind} disabled={!(kind==='products'?a.models.length:a.compare.length)} onClick={()=>setTab(kind)}>{kind==='products'?<Package size={17}/>:<Store size={17}/>} {kind==='products'?'محصول‌ها':'فروشگاه‌ها'} · {fa(kind==='products'?a.models.length:a.compare.length)}</button>)}</nav>
    <div className="comparison-toolbar"><button className="secondary-action" aria-label="استعلام همین انتخاب‌ها" onClick={()=>a.setOverlay('checks')}><MessageSquare size={16}/><span className="comparison-action-long">استعلام همین انتخاب‌ها</span><span className="comparison-action-short">استعلام</span></button><button className="secondary-action" aria-label="همین مقایسه روی نقشه" onClick={onMap}><MapPin size={16}/><span className="comparison-action-long">همین مقایسه روی نقشه</span><span className="comparison-action-short">نقشه</span></button><button ref={resetTrigger} className="comparison-reset" aria-label="پاک‌کردن مقایسه" onClick={()=>setReset(v=>!v)} aria-expanded={reset}><RotateCcw size={16}/><span className="comparison-action-long">پاک‌کردن مقایسه</span><span className="comparison-action-short">پاک‌کردن</span></button></div>
    {reset&&<section className="comparison-reset-confirm" role="alertdialog" aria-label="تأیید پاک‌کردن مقایسه" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();keepComparison();}}}><p>همهٔ محصولات و پیشنهادها از مقایسه برداشته شوند؟ نتایج جست‌وجو و برنامه‌های ذخیره‌شده باقی می‌مانند.</p><div className="inline-actions"><button ref={cancelReset} className="secondary-action" onClick={keepComparison}>انصراف</button><button className="primary-action" onClick={()=>{a.clearComparison();setReset(false);}}>بله، پاک‌کردن همهٔ انتخاب‌ها</button></div></section>}
    {count<2&&<p className="comparison-note">برای دیدن تفاوت‌ها، گزینهٔ دیگری را از کارت‌های نتایج به مقایسه اضافه کن. انتخاب فعلی محفوظ است.</p>}
    <p className="comparison-note">قیمت و موجودی نیاز به تأیید دارند؛ جزئیات کامل پایین جدول است.</p>
    <label className="comparison-differences"><input type="checkbox" checked={differences} onChange={e=>setDifferences(e.target.checked)}/>فقط تفاوت‌ها را نشان بده</label>
    <details className="comparison-key-details"><summary><ChevronDown size={14} aria-hidden="true"/><span>راهنمای نشانه‌ها</span></summary><div className="comparison-key" aria-label="راهنمای نشانه‌های مقایسه"><Signal tone="positive">وجود قابلیت / وضعیت مناسب</Signal><Signal tone="negative">نبود قابلیت / وضعیت نامناسب</Signal><Signal tone="caution">نامشخص / نیاز به بررسی</Signal></div><p className="comparison-note">عدد بزرگ‌تر یا قیمت کمتر الزاماً بهتر نیست؛ قابلیت‌ها فقط با عبارت صریح منبع علامت می‌گیرند.</p></details>
    {tab==='products'?<>{a.models.length>1&&<details className="comparison-reasoning"><summary><ChevronDown size={14} aria-hidden="true"/><span>راهنمای انتخاب برای مراجعه</span></summary><ModelAdvice a={a}/></details>}<Fields items={a.models} fields={visible(primaryProducts,a.models)} columns={productColumns} actions id={p=>p.product_id}/><details className="comparison-all-fields"><summary><ChevronDown size={14}/><span>همهٔ مشخصات و اطلاعات تکمیلی محصولات</span></summary><Fields items={a.models} fields={visible(detailedProducts,a.models)} columns={productColumns} id={p=>p.product_id}/></details></>:<>
      <details className="comparison-reasoning"><summary><ChevronDown size={14} aria-hidden="true"/><span>اولویت قیمت و فاصله و دلیل پیشنهاد</span></summary><div className="comparison-priority"><b>اولویت قیمت و فاصله</b><div><span>قیمت کمتر</span><span>نزدیک‌تر</span></div><Slider value={a.weight} min={0} max={100} step={10} onChange={a.setWeight} label="اهمیت فاصله در مقایسه"/></div>
      <CompareAdvice a={a} offers={a.compare}/></details><Fields items={a.compare} fields={visible([...primaryOffers,arrival],a.compare)} columns={offerColumns} actions id={o=>o.offer_id}/><details className="comparison-all-fields"><summary><ChevronDown size={14}/><span>همهٔ شرایط و اطلاعات تکمیلی فروشگاه‌ها</span></summary><Fields items={a.compare} fields={visible(detailedOffers,a.compare)} columns={offerColumns} id={o=>o.offer_id}/></details>
    </>}
    <details><summary><ChevronDown size={14} aria-hidden="true"/><span>شناسه‌ها و اطلاعات تکمیلی منبع</span></summary>{tab==='products'?<Fields items={a.models} fields={[{key:'product-id',label:'شناسهٔ محصول در منبع',value:p=>p.product_id}]} columns={productColumns} id={p=>p.product_id}/>:<Fields items={a.compare} fields={[{key:'offer-id',label:'شناسهٔ پیشنهاد',value:o=>o.offer_id},{key:'product-id',label:'شناسهٔ محصول',value:o=>o.product_id},{key:'shop-id',label:'شناسهٔ فروشگاه',value:o=>o.shop_id},{key:'coordinate',label:'مختصات فروشگاه',value:o=>o.shop.lat!==null&&o.shop.lon!==null?`${o.shop.lat}, ${o.shop.lon}`:missing},{key:'price-quality',label:'کیفیت ثبت مبلغ',value:o=>o.price_quality==='missing'?'قیمت ثبت نشده':o.price_quality==='above_js_safe_integer'?'مبلغ بزرگ؛ با دقت عدد صحیح نمایش داده شده':'اعتبار بازار قیمت ارزیابی نشده'},{key:'credit-reason',label:'دلیل وضعیت کلی اعتبار',value:o=>({matching_option:'حداقل یک روش با شرایط حضوری منطبق است',all_recorded_options_mismatch:'روش‌های ثبت‌شده با شرایط منطبق نیستند',incomplete_conditions:'شرایط کامل نیست',not_recorded:'روش اعتباری ثبت نشده',invalid_data:'دادهٔ شرایط معتبر نیست'}[o.in_person_credit.reason])}]} columns={offerColumns} id={o=>o.offer_id}/>}</details>
  </div>;
}
