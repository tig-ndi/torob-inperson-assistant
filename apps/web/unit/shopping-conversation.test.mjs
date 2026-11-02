import test from 'node:test';
import assert from 'node:assert/strict';
import {sellerPreferences} from '../src/live/sellerPreferences.ts';
import {purchaseTopics,conversationHistory,recommendedFirst} from '../src/live/requestPlanning.ts';
import {memoryVariants} from '../src/live/memoryVariants.ts';

test('removing seller constraints respects Persian typography and preserves unrelated filters',()=>{
  for(const text of ['فیلتر فقط باز را بردار','فقط فروشگاه‌های باز رو نمی‌خوام','فقط باز مهم نیست','فقط باز نباشد'])assert.equal(sellerPreferences(text).open,false,text);
  assert.deepEqual(sellerPreferences('فیلتر فقط باز را حذف نکن'),{});
  assert.deepEqual(sellerPreferences('همه فیلترها را حذف نکن'),{});
  assert.deepEqual(sellerPreferences('قسطی نمی‌خواهم؛ اما فقط فروشگاه‌های باز'),{credit:false,open:true});
  assert.deepEqual(sellerPreferences('فقط باز زیر ۱.۵ میلیون تومان'),{open:true,max:'1500000'});
  assert.equal(sellerPreferences('سقف قیمت را بردار').max,'');
  assert.deepEqual(sellerPreferences('ترب‌پی را حذف کن؛ ارسال فوری هم لازم نیست'),{pay:false,fast:false});
});
test('multiple products are retained, while accessory phrases and aliases are one purchase',()=>{
  assert.equal(purchaseTopics('گوشی و شارژر می‌خواهم؛ نزدیک من').length,2);
  assert.equal(purchaseTopics('شارژر موبایل نزدیک من').length,1);
  assert.equal(purchaseTopics('شارژر برای گوشی می‌خواهم').length,1);
  assert.equal(purchaseTopics('کابل برای گوشی می‌خواهم').length,1);
  assert.equal(purchaseTopics('قاب گوشی و کابل شارژ').length,2);
  assert.equal(purchaseTopics('لپ‌تاپ و هدفون و کفش می‌خواهم').length,3);
  assert.equal(purchaseTopics('گوشی موبایل می‌خوام').length,1);
  assert.equal(purchaseTopics('گوشی با باتری حداقل ۵۰۰۰ تا ده میلیون نزدیک من').length,1);
  assert.equal(purchaseTopics('گوشی و باتری می‌خواهم').length,2);
  assert.deepEqual(purchaseTopics('گوشی نمی‌خواهم؛ کفش می‌خواهم'),['کفش']);
  assert.deepEqual(purchaseTopics('گوشی سامسونگ گارانتی نمی‌خوام'),['گوشی']);
});
test('history repair retains the fresh turn and whole previous pairs within the API bound',()=>{
  const result=conversationHistory([{role:'user',content:'گوشی نزدیک من'}],{role:'user',content:'تا دو میلیون'},'موقعیتت را بده');
  assert.deepEqual(result.map(m=>m.role),['user','assistant','user']);assert.equal(result.at(-1).content,'تا دو میلیون');
  const long=conversationHistory(Array.from({length:4},(_,i)=>({role:i%2?'assistant':'user',content:'a'.repeat(900)})),{role:'user',content:'b'.repeat(900)},'');
  assert.equal(long.length,3);assert.equal(long[0].role,'user');
});
test('the recommended card is actionable first without dropping or mutating other source products',()=>{
  const source=Array.from({length:12},(_,i)=>({product_id:String(i)}));
  const ranked=recommendedFirst(source,'7');assert.equal(ranked[0],source[7]);assert.equal(ranked.length,12);
  assert.equal(source[0].product_id,'0');assert.equal(new Set(ranked.map(p=>p.product_id)).size,12);
  assert.equal(recommendedFirst(source,'missing'),source);
});
const source=(title,rows)=>({persian_title:title,specs:rows.map(([key,value])=>({key,value}))});
test('combined capacities resolve only against the explicitly titled variant',()=>{
  const p=source('گوشی | حافظه ۱۲۸ گیگابایت',[['ترکیب حافظه داخلی و رم','128 گیگابایت / 8 گیگابایت رم 256 گیگابایت / 12 گیگابایت رم']]);
  const result=memoryVariants(p);assert.equal(result.storage.value,'128 گیگابایت');assert.equal(result.ram.value,'8 گیگابایت');assert.equal(result.ram.status,'matched_variant');
  p.persian_title='گوشی';assert.equal(memoryVariants(p).ram.status,'unknown');
});
test('conflicting RAM and unrecognized qualifiers stay uncertain rather than being guessed',()=>{
  const rows=[['ترکیب حافظه داخلی و رم','128 GB / 8 GB رم 128 GB / 12 GB رم']];
  assert.equal(memoryVariants(source('حافظه 128 GB',rows)).ram.status,'conflicting');
  assert.equal(memoryVariants(source('حافظه 128 GB',[['ترکیب حافظه داخلی و رم','تا 128 GB / 8 GB رم']])).ram.status,'unknown');
  assert.equal(memoryVariants(source('حافظه 128 GB',[['حافظه داخلی','256 GB']])).storage.status,'conflicting');
  assert.equal(memoryVariants(source('گوشی',[['رم','8 گیگابایت رم']])).ram.status,'recorded');
  assert.equal(memoryVariants(source('گوشی حافظه ۳۲ مگابایت',[['حافظه داخلی','32 مگابایت']])).storage.value,'32 مگابایت');
});
