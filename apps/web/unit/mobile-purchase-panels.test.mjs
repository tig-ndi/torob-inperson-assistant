import test from 'node:test';
import assert from 'node:assert/strict';
import {openPanel} from '../src/live/panelNavigation.ts';
import {freshProgress,advancePurchase,revisitPurchase} from '../src/live/purchaseProgress.ts';
import {googleNavigation} from '../src/live/navigationLinks.ts';
import {purchaseImageLines,wrapImageText} from '../src/live/purchaseImage.ts';

test('journey children retain their parent and returning does not duplicate entries',()=>{
 let stack=openPanel([],'journey');stack=openPanel(stack,'travel');assert.deepEqual(stack,['journey','travel']);
 stack=openPanel(stack,'nav');assert.deepEqual(stack,['journey','travel','nav']);
 assert.deepEqual(openPanel(stack,'journey'),['journey']);assert.deepEqual(openPanel(stack,null),[]);
 assert.deepEqual(openPanel(['filters'],'history'),['history']);
});

test('follow-up views preserve the buyer panel and return without reopening hidden siblings',()=>{
 const root=openPanel([],'followup');
 for(const child of ['report','draft','demo','checks']){
  const stack=openPanel(root,child);assert.deepEqual(stack,['followup',child]);
  assert.deepEqual(openPanel(stack,'followup'),root);assert.deepEqual(openPanel(stack,null),[]);
 }
 assert.deepEqual(openPanel(['journey','followup'],'demo'),['journey','followup','demo']);
 assert.deepEqual(openPanel(['followup','demo'],'report'),['followup','demo','report']);
});
test('ready reply tools and check children return to their task panel',()=>{
 assert.deepEqual(openPanel(['reply'],'location'),['reply','location']);
 assert.deepEqual(openPanel(['checks'],'voice'),['checks','voice']);
 assert.deepEqual(openPanel(['reply','location'],'reply'),['reply']);
});
test('stage tabs rewind to any reached stage without marking a purchase or losing evidence',()=>{
 const ready={...freshProgress('offer'),evidence:{source:'simulated',outcome:'available'}};
 const moving=advancePurchase(ready,'start','2026-11-08T10:00:00Z'),arrived=advancePurchase(moving,'arrive'),done=advancePurchase(arrived,'purchased');
 assert.equal(revisitPurchase(done,2).stage,'arrived');assert.equal(revisitPurchase(done,1).stage,'en_route');
 const back=revisitPurchase(done,0);assert.equal(back.stage,'ready');assert.equal(back.startedAt,null);assert.equal(back.finishedAt,null);assert.equal(back.result,null);assert.equal(back.evidence,ready.evidence);
 assert.equal(done.result,'purchased');
});
test('unreached, fractional and invalid stages cannot fabricate arrival or purchase',()=>{
 const ready=freshProgress('offer');for(const i of [-1,1,2,3,4,.5,NaN])assert.equal(revisitPurchase(ready,i),null);
 assert.equal(revisitPurchase(ready,0),ready);
 const later=advancePurchase(ready,'later');assert.equal(revisitPurchase(later,1),null);assert.equal(revisitPurchase(later,2),null);
});
test('Google Maps gets exact origin, destination, navigation action and mode',()=>{
 const url=new URL(googleNavigation({lat:35.7,lon:51.4},{lat:35.71,lon:51.41},null,'cycling'));
 assert.equal(url.hostname,'www.google.com');assert.equal(url.searchParams.get('origin'),'35.7,51.4');assert.equal(url.searchParams.get('destination'),'35.71,51.41');assert.equal(url.searchParams.get('travelmode'),'bicycling');assert.equal(url.searchParams.get('dir_action'),'navigate');
});
test('navigation handles absent origin, manual mode, missing address and invalid coordinates honestly',()=>{
 const url=new URL(googleNavigation({lat:91,lon:51},{lat:NaN,lon:0},'تهران، کوچهٔ نمونه','manual'));
 assert.equal(url.searchParams.get('origin'),null);assert.equal(url.searchParams.get('travelmode'),null);assert.equal(url.searchParams.get('destination'),'تهران، کوچهٔ نمونه');
 assert.equal(googleNavigation(null,null,'  ','walking'),null);
});
test('export keeps the full address, recorded-price status and user-reported result',()=>{
 const address='پاساژ نمونه، طبقهٔ سوم، واحد ۱۲، درب ورودی آسانسور';
 const lines=purchaseImageLines({product:'گوشی نمونه',shop:'فروشگاه نمونه',address,price:'123456',result:'خرید طبق اعلام کاربر',time:'زمان نمونه',mode:'پیاده',origin:null,destination:null,route:null});
 assert.ok(lines.some(s=>s.includes(address)));assert.ok(lines.some(s=>s.includes('قیمت ثبت‌شده')));assert.ok(lines.some(s=>s.includes('پرداخت یا سفارش آنلاین انجام نشده')));assert.ok(lines.some(s=>s.includes('نیاز به بررسی')));
});
test('export wraps long Persian text and unbroken model names without truncating them',()=>{
 const text='آدرس کامل '+ 'VeryLongLaptopModel1234567890'.repeat(4)+' طبقه سه واحد شش';
 const lines=wrapImageText(text,15,s=>Array.from(s).length);assert.ok(lines.every(s=>Array.from(s).length<=15));assert.equal(lines.join('').replace(/\s/g,''),text.replace(/\s/g,''));
});
