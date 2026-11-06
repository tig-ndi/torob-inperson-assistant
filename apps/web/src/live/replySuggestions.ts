export type ReplyPanel='suggestions'|'budget'|'topic'|'battery'|'requirements';
type Choice={id:string;label:string};
export type ReplyAction=Choice&(
  {kind:'message';text:string}|{kind:'budget';value:string}|{kind:'panel';panel:ReplyPanel}|
  {kind:'overlay';overlay:'location'|'travel'|'alts'|'comparison'}|{kind:'map'|'gps'|'finish'}
);
export type ReplyContext={screen:string;topic:string;questionCode:string;lastQuestion:string;history:string;
  budget:string;needsLocation:boolean;selected:boolean;openOnly:boolean;batteryStatus:string;pending:string[];
  completed:boolean;hasResults:boolean;delegatedState?:'pending'|'planned'|'blocked';appliedFields?:string[]};
export type ReplyPlan={hint:string;primary:ReplyAction[];more:ReplyAction[]};
const message=(id:string,label:string,text:string):ReplyAction=>({id,label,kind:'message',text});
const panel=(id:ReplyPanel,label:string):ReplyAction=>({id,label,kind:'panel',panel:id});
const budget=panel('budget','بودجهٔ دلخواه');
const compare=message('compare','مقایسهٔ گزینه‌ها','گزینه‌ها را مقایسه کن');

export function budgetPresets(topic:string):{label:string;value:string}[]{
  const amounts=/شارژر|کابل/.test(topic)?[500000,1000000,2000000]:/کفش|کتانی|هدفون|هندزفری/.test(topic)?[1000000,3000000,5000000]:/دکمه|ساده/.test(topic)?[2000000,3000000,5000000]:/لپ.?تاپ/.test(topic)?[30000000,50000000,80000000]:[10000000,20000000,30000000];
  return amounts.map(value=>({value:String(value),label:`تا ${new Intl.NumberFormat('fa-IR').format(value/1000000)} میلیون`}));
}
export function replyPlan(c:ReplyContext):ReplyPlan{
  const common:ReplyAction[]=[budget,panel('topic','اصلاح کالای موردنظر'),{id:'location',label:'تغییر موقعیت جست‌وجو',kind:'overlay',overlay:'location'}];
  if(c.questionCode==='requirement_choice'&&c.appliedFields?.length)return {hint:'فقط شرطی را انتخاب کن که می‌خواهی حذف شود.',primary:[panel('requirements','انتخاب شرط برای حذف')],more:[]};
  if(c.questionCode==='phone_kind')return {hint:'فقط نوع گوشی را انتخاب کن؛ بقیهٔ تصمیم با همراه خرید است.',primary:[message('smartphone','هوشمند','گوشی هوشمند می‌خواهم'),message('keypad','دکمه‌ای','گوشی دکمه ای می‌خواهم'),message('any-phone','فرقی ندارد','نوع گوشی فرقی ندارد')],more:[]};
  if(c.questionCode==='connector')return {hint:'فقط درگاه دستگاه لازم است؛ کالای موردنظر همان شارژر است.',primary:[message('usb-c','تایپ سی','درگاه تایپ سی باشد'),message('micro-usb','میکرو USB','درگاه میکرو USB باشد'),message('lightning','لایتنینگ','درگاه لایتنینگ باشد')],more:[]};
  if(c.needsLocation)return {hint:'نقطهٔ شروع جست‌وجو را مشخص کن.',primary:[{id:'map',label:'روی نقشه انتخاب می‌کنم',kind:'map'},{id:'gps',label:'موقعیت فعلی من',kind:'gps'}],more:[{id:'location',label:'انتخاب محله یا مختصات',kind:'overlay',overlay:'location'}]};
  if(c.questionCode==='product_kind'&&/شارژر/.test(c.lastQuestion)&&/دستگاه|درگاه/.test(c.lastQuestion))return {hint:'شارژر را برای کدام دستگاه می‌خواهی؟',primary:[message('phone-charger','برای گوشی','شارژر برای گوشی می‌خواهم'),message('laptop-charger','برای لپ‌تاپ','شارژر برای لپ‌تاپ می‌خواهم')],more:[panel('topic','دستگاه یا مدل دیگری دارم')]};
  if(c.questionCode==='budget')return {hint:'فقط سقف بودجه را تعیین کن؛ باقی نیازت تغییر نمی‌کند.',primary:budgetPresets(c.topic).map(p=>({id:'budget-'+p.value,...p,kind:'budget'})),more:[budget]};
  if(c.questionCode==='battery_scope')return {hint:'برای این کالا، حداقل ظرفیت را کنار بگذاریم یا کالا را تغییر بدهیم؟',primary:[message('no-minimum','بدون حداقل ظرفیت','بدون حداقل'),panel('topic','تغییر کالا')],more:[]};
  if(c.questionCode==='specific_model')return {hint:'فقط نام مدل یا کالای دقیق‌تر لازم است.',primary:[panel('topic','مدل را وارد می‌کنم')],more:[budget]};
  if(c.questionCode==='priority'&&c.topic)return {hint:'کاربرد اصلی همین کالا را انتخاب کن.',primary:/کفش|کتانی|کتونی/.test(c.topic)?[message('walking-use','پیاده‌روی روزانه',`${c.topic} برای پیاده‌روی روزانه می‌خواهم`),message('everyday-use','استفادهٔ روزمره',`${c.topic} برای استفاده روزمره می‌خواهم`)]:[message('everyday-use','کارهای روزمره',`${c.topic} برای استفاده روزمره می‌خواهم`),panel('topic','کاربرد یا مدل دقیق‌تر')],more:[budget]};
  if(c.questionCode==='battery_capacity'||c.batteryStatus==='awaiting_minimum')return {hint:'حداقل ظرفیت ثبت‌شدهٔ باتری را انتخاب کن.',primary:[message('battery-5000','حداقل ۵۰۰۰ میلی‌آمپرساعت','حداقل ۵۰۰۰ میلی‌آمپرساعت'),message('no-battery-min','بدون حداقل ظرفیت','ظرفیت باتری مهم نیست')],more:[panel('battery','ظرفیت دلخواه')]};
  if(c.pending.length)return {hint:'شرط‌های بررسی‌نشده را مشخص کنیم؛ بقیهٔ نیازت محفوظ است.',primary:c.pending.length===1?[message('waive','بدون این شرط','بدون این شرط'),panel('requirements','بررسی شرط باقی‌مانده')]:[panel('requirements','انتخاب شرط‌ها'),message('waive-all','بدون شرط‌های بررسی‌نشده','همه شرط های اجرا نشده را حذف کن')],more:[budget,panel('topic','تغییر کالا')]};
  if(c.screen==='decide'&&!c.topic)return {hint:'چه کالایی برای خرید حضوری لازم داری؟',primary:[message('phone','گوشی','گوشی می‌خواهم'),message('shoe','کفش','کفش می‌خواهم')],more:[panel('topic','کالای دیگری می‌خواهم')]};
  const footwear=/کفش|کتانی/.test(c.topic)&&/پیاده|دویدن|ورزش/.test(c.history)&&!/مردانه|زنانه|بچگانه|کودک|دخترانه|پسرانه/.test(c.history);
  if(c.screen==='results'&&c.hasResults&&footwear)return {hint:'برای انتخاب کفش، گروه موردنظر را مشخص کن.',primary:['مردانه','زنانه','کودک'].map(kind=>message('shoe-'+kind,`کفش ${kind}`,`کفش ${kind==='کودک'?'بچگانه':kind} می‌خواهم`)),more:[budget,compare]};
  if(c.screen==='results'&&!c.hasResults&&c.appliedFields?.length)return {hint:'تطابق ثبت‌شده پیدا نشد؛ فقط همان شرط یا مدل را تغییر بده.',primary:[message('remove-applied','بدون شرط '+c.appliedFields[0],c.appliedFields[0]+' را حذف کن'),panel('topic','مدل دیگری بررسی کنیم')],more:[budget]};
  if(c.screen==='results'&&!c.hasResults)return {hint:'گزینه‌ای با این شرایط پیدا نشد؛ فقط همان مورد لازم را تغییر بده.',primary:[panel('budget','بودجهٔ دیگری انتخاب می‌کنم'),panel('topic','کالای دیگری بررسی کنیم')],more:[{id:'location',label:'تغییر موقعیت جست‌وجو',kind:'overlay',overlay:'location'}]};
  if(c.delegatedState==='planned')return {hint:'مقصد انتخاب شده؛ با گفت‌وگو هم می‌توانی ادامه بدهی.',primary:[message('start-trip','شروع کنیم','بزن بریم'),budget],more:[...common,message('finish-trip','این خرید تمام شد','این خرید تمام شد')]};
  if(c.delegatedState)return {hint:'همین خرید محفوظ است؛ فقط شرط موردنیاز را تغییر بده.',primary:[],more:common};
  if(c.screen==='results')return {hint:'قدم بعدی همین خرید را انتخاب کن.',primary:c.budget?[compare,message('nearest','فروشگاه نزدیک‌تر','نزدیک‌ترین فروشگاه همین کالا را بررسی کن')]:[{id:'budget-preset',kind:'budget',...budgetPresets(c.topic)[1]!},compare],more:[message('delegate','خودت انتخاب و برنامه‌ریزی کن','خودت نزدیک ترین مقصد را انتخاب کن و برنامه رفتن را بچین'),...common,message('nearest','فروشگاه نزدیک‌تر','نزدیک‌ترین فروشگاه همین کالا را بررسی کن')]};
  if(c.screen==='stores')return {hint:'پیش از رفتن، فروشگاه‌ها را با شرایط خودت بررسی کن.',primary:[message('compare-shops','مقایسهٔ فروشگاه‌ها','فروشگاه‌ها را مقایسه کن'),c.openOnly?message('all-hours','همهٔ ساعت‌ها','فیلتر فقط باز را بردار'):message('open-only','فقط فروشگاه باز','فقط فروشگاه‌های باز همین کالا را بررسی کن')],more:[...common,{id:'travel',label:'روش رفتن و ساعت مراجعه',kind:'overlay',overlay:'travel'}]};
  if(c.selected&&c.screen==='contact')return {hint:'نتیجهٔ پیگیری خودت را بگو تا قدم بعدی همین خرید را بررسی کنم.',primary:[message('report-stock','کالا موجود نبود','کالا موجود نبود'),message('report-answer','پاسخی نگرفتم','فروشگاه جواب نداد')],more:common};
  if(c.selected)return {hint:'برنامهٔ مراجعه را از همین‌جا ادامه بده.',primary:[{id:'alternatives',label:'جایگزین‌ها را ببینیم',kind:'overlay',overlay:'alts'},{id:'travel',label:'روش رفتن و زمان',kind:'overlay',overlay:'travel'}],more:[...common,...(c.screen==='trip'?[{id:'finish',label:'این خرید را تمام کردم',kind:'finish'} as ReplyAction]:[])]};
  if(c.completed)return {hint:'برای خرید بعدی از همین موقعیت ادامه بده.',primary:[panel('topic','خرید بعدی'),{id:'location',label:'تغییر موقعیت',kind:'overlay',overlay:'location'}],more:[]};
  return {hint:'همین گفت‌وگو و نقشه محفوظ می‌مانند.',primary:c.topic?[budget,panel('topic','اصلاح نیاز')]:[],more:[]};
}
