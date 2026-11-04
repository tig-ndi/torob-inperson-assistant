import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseTopics,exclusivePurchase} from '../src/live/requestPlanning.ts';
import {visitGoal,selectVisit} from '../src/live/delegatedVisit.ts';
import {purchaseQuestion,answerPurchaseQuestion} from '../src/live/purchaseQuestions.ts';
import {chargerFacts} from '../src/live/chargerFacts.ts';

test('accessory attributes and target devices are one purchase, coordinated purchases remain separate',()=>{
 for(const text of ['شارژر تایپ سی برای گوشی میخوام','کابل USB-C برای گوشی','قاب شفاف برای گوشی','شارژر ۶۵ وات واسه لپ تاپ'])assert.equal(purchaseTopics(text).length,1,text);
 for(const text of ['گوشی و شارژر میخوام','شارژر و کابل برای گوشی','قاب برای گوشی و هدفون'])assert.equal(purchaseTopics(text).length,2,text);
 assert.equal(exclusivePurchase('فقط شارژر میخوام، تایپ سی'),true);
 assert.equal(exclusivePurchase('فقط فروشگاه باز میخوام'),false);
 assert.equal(exclusivePurchase('فقط گوشی و شارژر میخوام'),false);
});
test('fastest and shortest choose different safe roads, never an unsafe shortcut',()=>{
 const offers=['a','b','c'].map(offer_id=>({offer_id,shop_id:offer_id,price_toman:'100'}));
 const checks={a:{risk:'ready',basis:'street_route'},b:{risk:'ready',basis:'street_route'},c:{risk:'closed',basis:'street_route'}};
 const routes=[{offer_id:'a',distance_meters:1000,duration_seconds:1200},{offer_id:'b',distance_meters:1500,duration_seconds:600},{offer_id:'c',distance_meters:100,duration_seconds:60}];
 for(const text of ['سریع ترین را انتخاب کن','سریع‌ترین مقصد','زودتر برسم','کمترین زمان'])assert.equal(visitGoal(text),'fastest');
 assert.equal(selectVisit(offers,checks,routes,visitGoal('سریعترین')).offer_id,'b');
 assert.equal(selectVisit(offers,checks,routes,visitGoal('نزدیکترین')).offer_id,'a');
 assert.equal(selectVisit(offers,checks,routes,'fastest',['b']).offer_id,'a');
 assert.equal(selectVisit(offers,checks,[],'fastest'),null);
});
const product={product_id:'p',persian_title:'شارژر ۱۵ وات',category_name:'شارژر گوشی',specs:[{key:'نوع درگاه خروجی',value:'Type-C'}]};
const context={product:null,recommended:product,products:[product],selected:null,offers:[],checks:{},routes:[],note:''};
test('compatibility questions cite source facts and preserve uncertainty without changing state',()=>{
 const before=JSON.stringify(context),answer=answerPurchaseQuestion('این مدل به A54 من میخوره؟',context);
 assert.match(answer,/شارژر ۱۵ وات/);assert.match(answer,/Type-C/);assert.match(answer,/به‌تنهایی/);assert.match(answer,/بدون شاهد تأیید نمی‌کنم/);
 assert.equal(JSON.stringify(context),before);
 assert.equal(purchaseQuestion('به جای این گوشی جدید میخوام'),null);
 assert.equal(answerPurchaseQuestion('این مدل میخوره؟',{...context,recommended:null,products:[]}),null);
});
test('seller explanations use the prepared route and keep the same destination',()=>{
 const c={...context,selected:{offer_id:'o',shop_id:'s',shop:{name:'فروشگاه'},product_id:'p'},note:'از بین ۳ مقصد، مسیر کوتاه‌تر انتخاب شد.',routes:[{offer_id:'o',distance_meters:1500,duration_seconds:600}]};
 const original=JSON.stringify(c),answer=answerPurchaseQuestion('چرا همین فروشگاه رو انتخاب کردی؟',c);
 assert.match(answer,/فروشگاه/);assert.match(answer,/۱۰ دقیقه/);assert.match(answer,/۳ مقصد/);assert.equal(JSON.stringify(c),original);
});
const charger=(title,rows=[])=>({category_name:'شارژر گوشی',persian_title:title,specs:rows.map(([key,value])=>({key,value}))});
test('charger comparison shows explicit title evidence without calling it maximum power',()=>{
 const p=charger('شارژر EP-T1510 توان 15 وات',[['نام و مدل','شارژر ۱۵ وات']]);
 assert.equal(chargerFacts(p).power.value,'15 وات');assert.match(chargerFacts(p).power.note,/عنوان/);assert.match(chargerFacts(p).power.note,/حداکثر توان.*تأیید نشده/);
 assert.equal(chargerFacts(charger('شارژر',[['حداکثر توان خروجی','25 وات']])).power.value,'25 وات');
});
test('charger comparison retains conflicts, absent data and output versus bundled cable distinctions',()=>{
 assert.equal(chargerFacts(charger('شارژر ۱۵ وات',[['توان خروجی','25 وات']])).power.conflicting,true);
 assert.equal(chargerFacts(charger('شارژر',[['توان خروجی','نامشخص']])).power.value,null);
 assert.equal(chargerFacts(charger('شارژر',[['نوع کابل همراه','USB Type-C']])).connector.value,null);
 assert.equal(chargerFacts(charger('شارژر',[['تعداد درگاه خروجی','یک عدد TYPE-C']])).connector.value,'USB Type-C');
 assert.equal(chargerFacts({category_name:'کفش',persian_title:'کفش',specs:[]}),null);
});
