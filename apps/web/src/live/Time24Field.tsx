import {Clock} from 'lucide-react';

export default function Time24Field({label,value,onChange,describedBy}:{label:string;value:string;onChange:(value:string)=>void;describedBy?:string}){
 const [hour,minute]=value.split(':');
 return <div className="time24-field" role="group" aria-label={label} aria-describedby={describedBy} dir="ltr">
  <select aria-label={`${label}: ساعت`} value={hour} onChange={e=>onChange(`${e.target.value}:${minute}`)}>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select>
  <span aria-hidden="true">:</span>
  <select aria-label={`${label}: دقیقه`} value={minute} onChange={e=>onChange(`${hour}:${e.target.value}`)}>{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select>
  <Clock size={18} aria-hidden="true"/>
 </div>;
}
