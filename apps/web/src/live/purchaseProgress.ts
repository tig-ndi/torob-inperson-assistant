export type PurchaseStage='ready'|'en_route'|'arrived'|'problem'|'done';
export type PurchaseResult='purchased'|'not_purchased'|'cancelled'|'later';
export type PurchaseProgress={offerId:string;stage:PurchaseStage;result:PurchaseResult|null;startedAt:string|null;finishedAt:string|null;problem:'closed'|'out_of_stock'|null;evidence:{outcome:'available'|'price_changed'|'closed'|'out_of_stock'|'no_answer';source:'user_report'|'simulated'}|null};
export type PurchaseAction='available'|'start'|'arrive'|'purchased'|'not_purchased'|'cancelled'|'later'|'closed'|'out_of_stock';
export const freshProgress=(offerId:string):PurchaseProgress=>({offerId,stage:'ready',result:null,startedAt:null,finishedAt:null,problem:null,evidence:null});
export function advancePurchase(p:PurchaseProgress,action:PurchaseAction,now=new Date().toISOString()):PurchaseProgress{
 if(p.stage==='done')return p;
 if(action==='start'&&p.stage==='ready')return {...p,stage:'en_route',startedAt:now};
 if(action==='arrive'&&p.stage==='en_route')return {...p,stage:'arrived'};
 if(action==='closed'||action==='out_of_stock')return {...p,stage:'problem',problem:action};
 if(action==='purchased'||action==='not_purchased')return p.stage==='arrived'?{...p,stage:'done',result:action,finishedAt:now}:p;
 if(action==='cancelled'||action==='later')return {...p,stage:'done',result:action,finishedAt:now};
 return p;
}
export function purchaseAction(text:string):PurchaseAction|null{
 const s=text.replace(/\u200c/g,' ').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[.!؟،]/g,'').trim();
 if(/^(?:بزن بریم|شروع کن|شروع حرکت|شروع مسیریابی|راه بیفتیم|حرکت کنیم)$/.test(s))return 'start';
 if(/^(?:رسیدم|رسیدم به فروشگاه|به مقصد رسیدم|به فروشگاه رسیدم)$/.test(s))return 'arrive';
 if(/^(?:خریدم|خرید کردم|خریدم تموم شد|خریدم تمام شد)$/.test(s))return 'purchased';
 if(/^(?:نخریدم|خرید نکردم)$/.test(s))return 'not_purchased';
 if(/^(?:منصرف شدم|پشیمون شدم|لغو کن|این خرید تمام شد|پایان این خرید|کارم تمام شد)$/.test(s))return 'cancelled';
 if(/^(?:بعدا ادامه میدم|بعداً ادامه میدم|بعدا میرم|برای بعد|ادامه در فرصتی دیگر)$/.test(s))return 'later';
 if(/^(?:موجود بود|بله موجود بود|بله، موجود بود|باز بود و موجود بود)$/.test(s))return 'available';
 if(/^(?:بسته بود|فروشگاه بسته بود|مغازه بسته بود)$/.test(s))return 'closed';
 if(/^(?:موجود نبود|ناموجود بود|نداشت|کالا موجود نبود)$/.test(s))return 'out_of_stock';
 return null;
}
