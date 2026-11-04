// A touch action can open a dialog before the browser synthesizes its click.
// Capture that one compatibility click even if its target is now in the dialog.
// The next intentional pointer-down or any keyboard action clears the guard.
export function guardTouchClick(doc:Document,x:number,y:number){
 let timer:ReturnType<typeof setTimeout>;
 const dispose=()=>{clearTimeout(timer);doc.removeEventListener('click',click,{capture:true});doc.removeEventListener('pointerdown',dispose,{capture:true});};
 const click=(event:Event)=>{
  const e=event as MouseEvent&{pointerType?:string};
  dispose();
  if(e.detail===0||e.pointerType&&e.pointerType!=='touch'||Math.hypot(e.clientX-x,e.clientY-y)>12)return;
  e.preventDefault();e.stopImmediatePropagation();
 };
 doc.addEventListener('click',click,{capture:true});doc.addEventListener('pointerdown',dispose,{capture:true});
 timer=setTimeout(dispose,700);
 return dispose;
}
