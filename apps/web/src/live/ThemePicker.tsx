import {useEffect,useRef,useState} from 'react';
import {Monitor,Moon,Sun} from 'lucide-react';
import Hint from './Hint';

type Theme='system'|'light'|'dark';
const choices=[['system',Monitor,'سیستم','هماهنگ با ظاهر دستگاه'],['light',Sun,'روشن','استفاده از ظاهر روشن'],['dark',Moon,'تیره','استفاده از ظاهر تیره']] as const;
export default function ThemePicker({theme,onChange,compact}:{theme:Theme;onChange:(theme:Theme)=>void;compact:boolean}){
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const Current=choices.find(c=>c[0]===theme)![1];
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div ref={root} className={'theme-picker'+(compact?' compact':'')}>
    {compact&&<Hint text="انتخاب ظاهر روشن، تیره یا هماهنگ با دستگاه"><button ref={trigger} className="icon-button" aria-label="انتخاب ظاهر برنامه" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Current size={20}/><span>{theme==='system'?'مطابق سیستم':theme==='light'?'حالت روشن':'حالت تاریک'}</span></button></Hint>}
    {(!compact||open)&&<div className="theme-switch" role="group" aria-label="ظاهر برنامه">{choices.map(([value,Icon,label,hint])=><Hint key={value} text={hint}><button type="button" aria-label={`ظاهر ${label}`} aria-pressed={theme===value} onClick={()=>{onChange(value);setOpen(false);if(compact)trigger.current?.focus();}}><Icon size={18}/><span>{value==='system'?'مطابق سیستم':value==='light'?'روشن':'تاریک'}</span></button></Hint>)}</div>}
  </div>;
}
