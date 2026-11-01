import {cloneElement,useId,useLayoutEffect,useRef,useState,type ReactElement,type HTMLAttributes} from 'react';
import {createPortal} from 'react-dom';

export default function Hint({text,children}:{text:string;children:ReactElement<HTMLAttributes<HTMLElement>>}){
  const id=useId(),anchor=useRef<HTMLSpanElement>(null),bubble=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  const close=()=>{if(timer.current)clearTimeout(timer.current);setOpen(false);setPosition(null);};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const a=anchor.current?.getBoundingClientRect(),b=bubble.current?.getBoundingClientRect();if(!a||!b)return;const width=visualViewport?.width??innerWidth,height=visualViewport?.height??innerHeight;setPosition({left:Math.max(10,Math.min(a.left+a.width/2-b.width/2,width-b.width-10)),top:a.bottom+b.height+9<height?a.bottom+8:Math.max(8,a.top-b.height-8)});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',close,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',close,true);};
  },[open]);
  useLayoutEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const described=children.props['aria-describedby'];
  return <span ref={anchor} className="hint-anchor" onPointerEnter={e=>{if(e.pointerType!=='touch')timer.current=setTimeout(()=>setOpen(true),250);}} onPointerLeave={close} onFocus={e=>{if(e.target instanceof HTMLElement&&e.target.matches(':focus-visible'))setOpen(true);}} onBlur={close} onClickCapture={close} onKeyDown={e=>{if(e.key==='Escape')close();}}>
    {cloneElement(children,{'aria-describedby':open?[described,id].filter(Boolean).join(' '):described})}
    {open&&createPortal(<div ref={bubble} id={id} role="tooltip" dir="rtl" className="control-hint" style={{left:position?.left??0,top:position?.top??0,visibility:position?'visible':'hidden'}}>{text}</div>,document.querySelector('.agent-app')??document.body)}
  </span>;
}
