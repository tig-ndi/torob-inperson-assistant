import {useRef,type ComponentPropsWithoutRef} from 'react';

type Props=Omit<ComponentPropsWithoutRef<'button'>,'onClick'|'onPointerDown'|'onPointerUp'|'onPointerCancel'> & {action:()=>void};
// A map gesture can suppress a compatibility click. Activate a short touch at
// pointer-up, while keeping native mouse/keyboard clicks and preventing repeats.
export default function TouchAction({action,disabled,children,...props}:Props){
  const touch=useRef<{id:number;x:number;y:number;at:number}|null>(null),handled=useRef(0);
  return <button {...props} type={props.type??'button'} disabled={disabled}
    onPointerDown={e=>{if(e.pointerType==='touch'&&!disabled){e.preventDefault();touch.current={id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now()};}else touch.current=null;}}
    onPointerCancel={e=>{if(e.pointerType==='touch')handled.current=Date.now();touch.current=null;}}
    onPointerUp={e=>{const start=touch.current;touch.current=null;if(!start||start.id!==e.pointerId)return;handled.current=Date.now();if(disabled||Date.now()-start.at>700||Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;handled.current=Date.now();action();}}
    onClick={e=>{if(e.detail>0&&Date.now()-handled.current<700){e.preventDefault();e.stopPropagation();return;}action();}}>{children}</button>;
}
