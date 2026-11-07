/** Opaque browser entries carry navigation only; purchase data stays in React. */
export type NavigationFrame={key:string;enter:()=>void;leave:()=>void};
export const shouldConfirmNewConversation=(threadLength:number)=>threadLength>0;
type Entry={id:number;path:NavigationFrame[]};
type Port={replaceState:(state:unknown,title:string)=>void;pushState:(state:unknown,title:string)=>void;go:(delta:number)=>void};
const same=(a:NavigationFrame[],b:NavigationFrame[])=>a.length===b.length&&a.every((f,i)=>f.key===b[i]?.key);
export class NavigationHistory{
  private entries=new Map<number,Entry>();
  private current:Entry|null=null;
  private sequence=0;
  private desired:NavigationFrame[]=[];
  private travelling=false;
  private restoring=false;
  private port:Port;
  private session:string;
  private restore:(next:NavigationFrame[],previous:NavigationFrame[])=>void;
  constructor(port:Port,session:string,restore:(next:NavigationFrame[],previous:NavigationFrame[])=>void){this.port=port;this.session=session;this.restore=restore;}
  private marker(id:number){return {torobMobile:{session:this.session,id}};}
  sync(path:NavigationFrame[]){
    if(!path.length)return;
    this.desired=path;
    if(this.travelling||this.restoring)return;
    if(!this.current){
      this.current={id:++this.sequence,path:path.slice(0,1)};
      this.entries.set(this.current.id,this.current);
      this.port.replaceState(this.marker(this.current.id),'');
    }
    const old=this.current.path;
    if(same(old,path)){this.current.path=path;return;}
    let common=0;while(common<old.length&&old[common]?.key===path[common]?.key)common++;
    if(common<old.length){
      // Dismissals consume their entries, instead of leaving a ghost Back step.
      this.travelling=true;
      this.port.go(Math.max(1,common)-old.length);
      return;
    }
    for(let size=old.length+1;size<=path.length;size++){
      this.current={id:++this.sequence,path:path.slice(0,size)};
      this.entries.set(this.current.id,this.current);
      this.port.pushState(this.marker(this.current.id),'');
    }
  }
  pop(state:unknown){
    const marker=(state as {torobMobile?:{session?:unknown;id?:unknown}}|null)?.torobMobile;
    if(marker?.session!==this.session||typeof marker.id!=='number')return false;
    const next=this.entries.get(marker.id);if(!next||!this.current)return false;
    const previous=this.current;this.current=next;
    if(this.travelling){this.travelling=false;this.sync(this.desired);}
    else{this.restoring=true;this.restore(next.path,previous.path);}
    return true;
  }
  finishRestore(){this.restoring=false;}
  back(){
    if(this.travelling||this.restoring)return true;
    if(!this.current||this.current.path.length<=1)return false;
    this.port.go(-1);return true;
  }
}
