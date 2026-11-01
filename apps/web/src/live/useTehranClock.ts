import {useEffect,useState} from 'react';

const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

// The displayed default follows Tehran's clock. A null visit time still means
// depart now, so opening this input never turns now into a fixed appointment.
export function useTehranClock(){
  const [now,setNow]=useState(()=>clock.format(new Date()));
  useEffect(()=>{
    const update=()=>setNow(clock.format(new Date()));
    const timer=window.setInterval(update,1000);
    window.addEventListener('focus',update);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);};
  },[]);
  return now;
}
