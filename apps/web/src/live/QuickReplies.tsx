import type {Shopping} from './state';

export default function QuickReplies({a}:{a:Shopping}){
  if(a.busy||a.needsLocation||!a.thread.length||a.screen==='home')return null;
  const context=a.messages.filter(m=>m.role==='user').map(m=>m.content).join(' ');
  const shoeChoice=a.screen==='results'&&/کفش|کتانی/.test(a.need?.topic_query??a.query)&&/پیاده|دویدن|ورزش/.test(context)&&!/مردانه|زنانه|بچگانه|کودک|دخترانه|پسرانه/.test(context);
  const actions=shoeChoice?
    ['مردانه','زنانه','کودک'].map(kind=>({label:`کفش ${kind}`,run:()=>a.ask(`کفش ${kind==='کودک'?'بچگانه':kind} می‌خواهم`)})):
    a.screen==='results'?
    [{label:'مقایسهٔ گزینه‌ها',run:()=>a.ask('گزینه‌ها را مقایسه کن')},{label:'فروشگاه نزدیک‌تر',run:()=>a.ask('نزدیک‌ترین فروشگاه همین کالا را بررسی کن')}]:
    a.screen==='stores'?
    [{label:'مقایسهٔ فروشگاه‌ها',run:()=>a.ask('فروشگاه‌ها را مقایسه کن')},{label:'فقط فروشگاه باز',run:()=>a.ask('فقط فروشگاه‌های باز همین کالا را بررسی کن')}]:
    a.selected?
    [{label:'جایگزین‌ها را ببینیم',run:()=>a.setOverlay('alts')},{label:'روش رفتن و زمان',run:()=>a.setOverlay('travel')}]:
    a.need?.battery_requirement.status==='awaiting_minimum'?
    [{label:'حداقل ۵۰۰۰ میلی‌آمپرساعت',run:()=>a.ask('حداقل ۵۰۰۰ میلی‌آمپرساعت')},{label:'ظرفیت مهم نیست',run:()=>a.ask('ظرفیت باتری مهم نیست')}]:[];
  if(!actions.length)return null;
  return <div className="quick-replies" role="group" aria-label="پیشنهادهای ادامهٔ گفت‌وگو">{actions.map(action=><button type="button" key={action.label} onClick={action.run}>{action.label}</button>)}</div>;
}
