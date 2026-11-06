import {useState} from 'react';
import {Check,Copy,MapPin} from 'lucide-react';

export default function DestinationAddress({address}:{address:string|null}){
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 return <div className="destination-address" data-destination-address>
  <MapPin size={16} aria-hidden="true"/>
  <p><b>آدرس مقصد: </b><span>{address?.trim()||'آدرس متنی در منبع ثبت نشده؛ محل فروشگاه را روی نقشه بررسی کن.'}</span></p>
  {address&&<button type="button" className="icon-button" aria-label="کپی آدرس مقصد" title="کپی آدرس مقصد" onClick={async()=>{
   try{await navigator.clipboard.writeText(address);setCopied(true);setCopyError(false);}catch{setCopyError(true);}
  }}>{copied?<Check size={17}/>:<Copy size={17}/>}</button>}
  <span className="destination-copy-status" role="status">{copyError?'کپی در دسترس نیست؛ متن آدرس را انتخاب و کپی کن.':copied?'آدرس کپی شد.':''}</span>
 </div>;
}
