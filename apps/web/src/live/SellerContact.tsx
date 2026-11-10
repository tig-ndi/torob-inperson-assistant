import {useState} from 'react';
import {Phone,MessageCircle,MessageSquare,Copy,Share2} from 'lucide-react';
import {money,type Offer} from './data';
import type {Shopping} from './state';
import {sellerContactLinks,sellerQuestion} from './sellerContactLinks';

export default function SellerContact({a,offer}:{a:Shopping;offer:Offer}){
 const [number,setNumber]=useState(''),[confirmed,setConfirmed]=useState(false);
 const product=a.knownProducts[offer.product_id]?.persian_title??a.product?.persian_title??'کالای انتخاب‌شده';
 const [text,setText]=useState(()=>sellerQuestion(product,offer.shop.name??'فروشگاه',money(offer.price_toman)));
 const links=confirmed?sellerContactLinks(number,text):null;
 const copy=async()=>{try{await navigator.clipboard.writeText(text);a.flash('متن پیشنهادی کپی شد.');}catch{a.flash('کپی انجام نشد؛ متن را انتخاب و کپی کن.');}};
 const share=async()=>{if(!navigator.share){await copy();return;}try{await navigator.share({title:offer.shop.name??'بررسی فروشگاه',text});}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))a.flash('اشتراک‌گذاری انجام نشد؛ از کپی متن استفاده کن.');}};
 return <section className="seller-contact" aria-label={`راه‌های ارتباط با ${offer.shop.name}`}>
  <p>شماره‌های کاتالوگ آزمایشی‌اند. برای تماس واقعی، شمارهٔ معتبر فروشگاه را خودت وارد کن. ارسال و تماس فقط با انتخاب تو در برنامهٔ مربوط انجام می‌شود؛ پاسخ واقعی به‌طور خودکار دریافت نمی‌شود.</p>
  <label className="live-label">شمارهٔ معتبر فروشگاه<input className="live-input" type="tel" inputMode="tel" autoComplete="off" value={number} placeholder="۰۹… یا +۹۸…" onChange={e=>{setNumber(e.target.value);setConfirmed(false);}}/></label>
  <label className="route-consent"><input type="checkbox" checked={confirmed} disabled={!sellerContactLinks(number,text)} onChange={e=>setConfirmed(e.target.checked)}/><span>این شماره را برای همین فروشگاه بررسی کرده‌ام.</span></label>
  {number&&!sellerContactLinks(number,text)&&<p role="status">شمارهٔ کامل ایران یا شماره با کد کشور را وارد کن.</p>}
  <label className="live-label">متن پیشنهادی برای فروشنده<textarea aria-label="متن پیشنهادی برای فروشنده" className="live-input" rows={4} maxLength={1800} value={text} onChange={e=>setText(e.target.value)}/></label>
  <div className="seller-contact-actions">
   {links?<><a href={links.call}><Phone size={18}/>تماس</a><a href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>واتساپ</a><a href={links.sms}><MessageSquare size={18}/>پیامک</a></>:<p>با تأیید شماره، تماس، واتساپ و پیامک فعال می‌شوند.</p>}
   <button type="button" onClick={()=>void copy()}><Copy size={18}/>کپی متن</button><button type="button" onClick={()=>void share()}><Share2 size={18}/>اشتراک متن در پیام‌رسان‌ها</button>
  </div><small>می‌توانی از چند راه پیگیری کنی؛ نتیجه را در «نتیجهٔ بررسی من» ثبت کن. برای بله و پیام‌رسان‌های نصب‌شده از اشتراک متن استفاده کن.</small>
 </section>;
}
