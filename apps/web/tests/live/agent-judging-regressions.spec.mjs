import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir} from 'node:fs/promises';
import {mockAssistant,send,layout} from './helpers.mjs';

const sizes=[[320,568],[360,640],[390,844]];
async function isolated(page){
 await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 // CI must fail rather than make an accidental paid call.
 await page.route('**/api/assistant/turn',r=>r.abort('blockedbyclient'));
}
const session=(page,name)=>page.evaluate(name=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:'+name)),name);
for(const [width,height] of sizes){
 test(`simple fallback, readable warranty and purchase navigation at ${width}`,async({page})=>{
  await page.setViewportSize({width,height});await isolated(page);
  await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:false,reason:'invalid_config',remaining_calls:0}}));
  const searches=[];await page.route(/\/api\/products\?/,async r=>{searches.push(new URL(r.request().url()));await r.continue();});
  await page.route(/\/api\/products\/[^/]+\/offers\?/,async r=>{const response=await r.fetch(),data=await response.json();for(const offer of data.items)offer.warranty={description:null,period_months:null,provider:'تست و تحویل در حضور مشتری'};await r.fulfill({json:data});});
  await page.goto('/');await send(page,'گوشی تا ده میلیون می‌خواهم.');
  await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();
  expect(searches.at(-1).searchParams.get('q')).toBe('گوشی');expect(searches.at(-1).searchParams.get('max_price_toman')).toBe('10000000');
  await expect(page.locator('.chat-pane')).not.toContainText(/\.env|API_KEY|TOROB_|بک‌اند|BoxAPI/);
  await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();
  const offer=page.locator('[data-offer]').first();await expect(offer).toBeVisible();await offer.locator('summary').click();
  await expect(offer).toContainText('تست و تحویل در حضور مشتری');await expect(offer).toContainText('مدت گارانتی ثبت نشده');await expect(offer).not.toContainText('period_months');
  await offer.getByRole('checkbox',{name:'مقایسه',exact:true}).click();await page.locator('.chat-header').getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);
  await offer.getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();await expect(page.locator('.chat-pane .purchase-journey')).toHaveAttribute('data-purchase-stage','ready');
  await page.goBack();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','stores');await layout(page);
  const output=join(tmpdir(),'torob-judging-repairs-after');await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`fallback-warranty-${width}.png`)});
 });
 test(`phone attributes reach assistant and chosen queued purchase preserves deferred item at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await isolated(page);const calls=[];await mockAssistant(page,request,calls);
  await page.goto('/');await send(page,'گوشی اندرویدی تا بیست میلیون برای عکس گرفتن از بچه‌ام می‌خواهم؛ باتری هم خوب باشد.');
  await expect.poll(()=>calls.length).toBe(1);expect(await session(page,'purchaseQueue')).toEqual([]);
  await send(page,'شارژر و کابل تایپ سی برای گوشی سامسونگ A54 تا یک میلیون می‌خواهم.');
  await expect.poll(()=>session(page,'purchaseQueue')).toEqual(expect.arrayContaining(['شارژر','کابل']));expect(await session(page,'purchaseQueue')).toHaveLength(2);
  await send(page,'اول فقط کابل را بررسی کن؛ شارژر برای بعد.');
  await expect.poll(()=>calls.length).toBe(2);expect(await session(page,'purchaseQueue')).toEqual(['شارژر']);
 });
 test(`payment release retains budget and fallback asks about unsupported needs at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await isolated(page);const calls=[];const products=await mockAssistant(page,request,calls);
  await page.route('**/api/assistant/turn',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:{request_id:input.request_id,status:'results',query:'گوشی',category_name:'گوشی موبایل',max_price_toman:'15000000',question:null,question_code:null,products,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},need_state:{version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'15000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]},explanation:null}});});
  await page.goto('/');await send(page,'گوشی تا پانزده میلیون قسطی می‌خواهم');await expect.poll(()=>calls.length).toBe(1);
  await send(page,'فقط ترب‌پی');await expect.poll(async()=> (await session(page,'filters')).pay).toBe(true);
  await send(page,'قسطی لازم نیست؛ همه فروشگاه‌ها را با همان بودجه بررسی کن.');await expect.poll(async()=> (await session(page,'filters')).pay).toBe(false);
  expect(await session(page,'filters')).toMatchObject({credit:false,pay:false,max:'15000000'});
  await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:false,reason:'disabled',remaining_calls:0}}));await page.reload();
  const count=calls.length;await send(page,'گوشی با دوربین خوب می‌خواهم');await expect(page.locator('.chat-pane')).toContainText('فقط نام کوتاه کالا');expect(calls).toHaveLength(count);await layout(page);
 });
}
