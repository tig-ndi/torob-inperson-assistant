import {integer,record,text} from '../app/base/domain/validation.ts';

/** Both the active visit and recent results must restore the same calendar day. */
export function parseVisitSession(value:unknown){
  const i=record(value),clock=i.localTime;
  if(clock!==null&&(typeof clock!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)))throw new Error('clock');
  const km=i.nearbyKm;
  if(typeof km!=='number'||!Number.isFinite(km)||km<=0||km>50)throw new Error('radius');
  let visitDate:string|null|undefined;
  if(i.visitDate!==undefined){
    if(i.visitDate===null)visitDate=null;
    else{
      visitDate=text(i.visitDate,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(visitDate))throw new Error('date');
      const [year,month,day]=visitDate.split('-').map(Number);
      integer(year,1,9999);
      const date=new Date(`${visitDate}T00:00:00Z`);
      if(!Number.isFinite(date.getTime())||date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)throw new Error('date');
    }
  }
  return {topic:text(i.topic,120),nearbyKm:km,localTime:clock as string|null,
    ...(visitDate===undefined?{}:{visitDate}),reuseProduct:i.reuseProduct===true};
}
