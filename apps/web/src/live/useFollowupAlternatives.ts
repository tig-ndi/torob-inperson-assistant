import {useEffect,useRef,useState} from 'react';
import * as api from './client';
import type {Offer,Filters,Position,Report} from './data';
import type {SellerReply} from './upgrades';

export type FollowupEvent={id:string;offer_id:string;outcome:Report['outcome'];source:Report['source'];createdAt:number};
type Input={offer:Offer|null;reply:SellerReply|null;event:FollowupEvent|null;filters:Filters;position:Position|null;
  visitTime:string|null;onOffers:(offers:Offer[])=>void;onMessage:(role:'assistant',text:string,kind:'action')=>void};

// Seller-panel replies and user reports share one request and one visible list.
export function useFollowupAlternatives(input:Input){
  const [state,setState]=useState<{active:boolean;busy:boolean;items:Offer[];error:string|null}>({active:false,busy:false,items:[],error:null});
  const [refresh,setRefresh]=useState(0),announced=useRef('');
  const event=input.event?.offer_id===input.offer?.offer_id?input.event:null;
  const reply=input.reply;
  const fromEvent=!!event&&(!reply||event.createdAt>=Date.parse(reply.responded_at));
  const outcome=fromEvent?event!.outcome:reply?.outcome,source=fromEvent?event!.source:'simulated';
  const stamp=(input.offer?.offer_id??'')+':'+(fromEvent?event!.id:reply?.responded_at??'');
  const key=JSON.stringify([stamp,outcome,source,input.filters,input.position,input.visitTime,refresh]);
  useEffect(()=>{
    setState({active:false,busy:false,items:[],error:null});
    if(!input.offer||!outcome||!['closed','out_of_stock','no_answer'].includes(outcome))return;
    const c=new AbortController();setState({active:true,busy:true,items:[],error:null});
    if(announced.current!==stamp){announced.current=stamp;input.onMessage('assistant',`${source==='simulated'?'شبیه‌سازی':'گزارش تو'}: این فروشگاه برای مراجعه مناسب نیست؛ جایگزین‌های باز با همان شرایط را بررسی می‌کنم.`,'action');}
    api.alternatives(input.offer,{...input.filters,open:true},input.position,outcome as 'closed'|'out_of_stock'|'no_answer',source,c.signal,0,input.visitTime).then(result=>{
      if(c.signal.aborted)return;const items=result.alternatives.items.slice(0,3);input.onOffers(items);setState({active:true,busy:false,items,error:null});
    }).catch(error=>{if(!c.signal.aborted)setState({active:true,busy:false,items:[],error:error instanceof Error?error.message:'جایگزین‌ها دریافت نشدند.'});});
    return()=>c.abort();
  },[key]);
  return {agentAlternatives:state,retryAgentAlternatives:()=>setRefresh(n=>n+1)};
}
