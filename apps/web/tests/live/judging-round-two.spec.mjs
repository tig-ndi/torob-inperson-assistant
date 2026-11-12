import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

const sizes=[[320,568],[360,640],[390,844]];
const output=join(tmpdir(),'torob-round-two');
const need=async page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:need')));
async function base(page){
 for(const ep of ['checks','trips','followups'])await page.route(`**/api/local/${ep}**`,r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 await page.route('**/api/voice/**',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
}
async function capture(page,name){await page.getByRole('button',{name:'توقف بررسی',exact:true}).waitFor({state:'hidden'});await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`${name}-${page.viewportSize().width}.png`)});}

for(const [width,height] of sizes){
 test(`empty RAM results explain the constraint and allow deliberate edits at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await base(page);const calls=[],searches=[];
  const products=await mockAssistant(page,request,[],'لپ تاپ');
  await page.route(/\/api\/products\?/,r=>{searches.push(new URL(r.request().url()));return r.continue();});
  await page.route('**/api/assistant/turn',r=>{
   const input=r.request().postDataJSON();calls.push(input);
   const ram=Number(/رم حداقل (\d+)/.exec(input.messages.at(-1).content)?.[1]??16);
   const max=input.context_need_state?.max_price_toman??'60000000';
   const battery={status:'unspecified',minimum_mah:null};
   return r.fulfill({json:{request_id:input.request_id,status:'no_evidence',query:'لپ تاپ',category_name:'لپ تاپ و نوت بوک',max_price_toman:max,question:null,question_code:null,products:{...products,items:[],has_more:false},battery_requirement:battery,offer_sort:'price',explanation:null,need_state:{version:1,topic_query:'لپ تاپ',category_name:'لپ تاپ و نوت بوک',category_cleared:false,max_price_toman:max,budget_needs_input:false,offer_sort:'price',minimum_ram_gb:ram,battery_requirement:battery,review_topics:[],pending_requirements:[]}}});
  });
  await page.goto('/');await send(page,'لپ تاپ با رم حداقل شانزده گیگ تا شصت میلیون میخوام');
  const empty=page.locator('.product-results');await expect(empty).toContainText('رم ثبت‌شدهٔ حداقل ۱۶ گیگابایت');
  await expect(empty).toContainText('شرطت حفظ شده');await expect(empty).not.toContainText('نام کوتاه‌تر');
  await expect(page.locator('.need-summary>summary')).toContainText('رم حداقل ۱۶');
  await expect(empty.getByRole('button',{name:'تغییر بودجه',exact:true})).toBeInViewport();await capture(page,'empty-ram');
  await empty.getByRole('button',{name:'تغییر بودجه',exact:true}).click();
  await page.getByLabel('حداکثر قیمت (تومان)',{exact:true}).fill('10000000');await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).click();
  await expect.poll(()=>searches.some(u=>u.searchParams.get('minimum_ram_gb')==='16'&&u.searchParams.get('max_price_toman')==='10000000')).toBe(true);
  expect((await need(page)).minimum_ram_gb).toBe(16);expect(calls).toHaveLength(1);
  await empty.getByText('تغییر حداقل رم',{exact:true}).click();await empty.getByLabel('حداقل رم · گیگابایت',{exact:true}).fill('8');
  await empty.getByRole('button',{name:'اعمال شرط جدید',exact:true}).click();await expect.poll(()=>calls.length).toBe(2);
  expect(calls[1].messages.at(-1).content).toContain('رم حداقل 8 گیگابایت');
  await expect.poll(async()=> (await need(page)).minimum_ram_gb).toBe(8);
  expect((await need(page)).max_price_toman).toBe('10000000');await layout(page);
 });

 test(`powerbank capacity crosses refresh, budget and destinations at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await base(page);const searches=[],destinations=[];
  const products=await mockAssistant(page,request,[],'پاوربانک');
  const matched=await(await request.get('/api/products?q='+encodeURIComponent('پاوربانک')+'&minimum_powerbank_mah=20000&max_price_toman=2000000&limit=12')).json();
  expect(matched.items.length).toBeGreaterThan(0);
  await page.route(/\/api\/products\?/,r=>{searches.push(new URL(r.request().url()));return r.continue();});
  await page.route('**/api/local/destinations',r=>{destinations.push(r.request().postDataJSON());return r.continue();});
  await page.route('**/api/assistant/turn',r=>{const battery={status:'unspecified',minimum_mah:null};return r.fulfill({json:{request_id:r.request().postDataJSON().request_id,status:'results',query:'پاوربانک',category_name:null,max_price_toman:'2000000',question:null,question_code:null,products:{...products,...matched},offer_sort:'price',battery_requirement:battery,explanation:null,need_state:{version:1,topic_query:'پاوربانک',category_name:null,category_cleared:false,max_price_toman:'2000000',budget_needs_input:false,offer_sort:'price',minimum_powerbank_mah:20000,battery_requirement:battery,review_topics:[],pending_requirements:[]}}});});
  await page.goto('/');await chooseLocation(page);await send(page,'پاوربانک حداقل ظرفیت ۲۰۰۰۰ تا دو میلیون میخوام نزدیک من');
  await expect(page.locator('.need-summary>summary')).toContainText('ظرفیت حداقل ۲۰۰۰۰');
  await expect.poll(()=>destinations.some(body=>body.minimum_powerbank_mah===20000)).toBe(true);
  await page.reload();await expect.poll(async()=> (await need(page)).minimum_powerbank_mah).toBe(20000);
  await page.locator('.mobile-header-menu>summary').click();await page.getByRole('button',{name:'شرایط خرید',exact:true}).click();
  await page.getByLabel('حداکثر قیمت (تومان)',{exact:true}).fill('3000000');await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).click();
  await expect.poll(()=>searches.some(u=>u.searchParams.get('minimum_powerbank_mah')==='20000'&&u.searchParams.get('max_price_toman')==='3000000')).toBe(true);
  expect((await need(page)).minimum_powerbank_mah).toBe(20000);await capture(page,'powerbank-preserved');await layout(page);
 });

 test(`compact closed-arrival warning leaves map space and opens deliberate review at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await base(page);await mockAssistant(page,request,[],'هدفون');
  await page.route('**/api/local/arrival-checks',r=>r.fulfill({json:{items:r.request().postDataJSON().selections.map(s=>({...s,departure_at:'2026-11-13T10:00:00+03:30',arrival_at:'2026-11-13T10:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_closed',margin_status:'declared_closed',margin_minutes:10,risk:'closed',inventory_status:'unconfirmed'})),limitations:[]}}));
  await page.route('**/api/local/road-routes',r=>r.fulfill({json:{items:[]}}));
  await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();
  await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();const sheet=page.locator('[data-mobile-store-sheet]');
  await sheet.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();
  const review=sheet.getByRole('button',{name:'بررسی هشدار',exact:true});await expect(review).toBeVisible();
  await expect(sheet.locator('[data-visit-safety]')).toContainText('فروشگاه در زمان رسیدن بسته است');
  await page.waitForTimeout(300);
  const metrics=await sheet.evaluate(el=>{const header=document.querySelector('[data-mobile-map-header]').getBoundingClientRect(),sheet=el.getBoundingClientRect(),primary=el.querySelector('.mobile-journey-actions>.primary-action').getBoundingClientRect(),footer=el.querySelector('.mobile-view-switch').getBoundingClientRect();return {free:sheet.top-header.bottom,height:innerHeight,sheet:sheet.toJSON(),primary:primary.toJSON(),footer:footer.toJSON()};});
  expect(metrics.free/height).toBeGreaterThanOrEqual(.4);
  expect(metrics.primary.height).toBeGreaterThanOrEqual(44);expect(metrics.primary.bottom).toBeLessThanOrEqual(metrics.footer.top+1);
  await mkdir(output,{recursive:true});await writeFile(join(output,`warning-asserted-${width}.json`),JSON.stringify(metrics,null,2));await capture(page,'warning-asserted');
  await review.click();const dialog=page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true});
  await expect(dialog.locator('[data-visit-safety]')).toContainText('فروشگاه طبق برنامه بسته است');
  await expect(dialog.getByRole('button',{name:'بزن بریم',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'بررسی جایگزین‌ها',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'با آگاهی از هشدار ادامه می‌دهم',exact:true}).click();
  await dialog.getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(sheet.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','en_route');
  await sheet.getByRole('button',{name:'برگشت به فهرست فروشگاه‌ها',exact:true}).click();
  await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(sheet.locator('.map-sheet-content')).toBeVisible();
 });
}
