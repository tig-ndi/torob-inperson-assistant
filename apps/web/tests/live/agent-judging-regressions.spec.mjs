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
async function reloadCompletedPurchase(page,expectedNeed){
 // A mocked request being received does not mean React has applied its reply.
 // Wait for the saved purchase and the completed turn before interrupting it.
 await expect.poll(()=>session(page,'need')).toMatchObject(expectedNeed);
 await expect(page.getByRole('button',{name:'ارسال پیام',exact:true})).toBeVisible();
 await page.reload();
 await expect.poll(()=>session(page,'need')).toMatchObject(expectedNeed);
 await expect(page.getByRole('button',{name:'ارسال پیام',exact:true})).toBeVisible();
}
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
  expect(calls).toHaveLength(1);await expect(page.locator('.chat-pane')).toContainText('بودجهٔ گفته‌شده برای هر کالا');
  await send(page,'برای هر کالا همان یک میلیون');await expect.poll(()=>calls.length).toBe(2);expect(await session(page,'purchaseQueue')).toEqual(['شارژر']);
  expect(calls[1].messages.at(-1).content).toContain('سامسونگ A54');expect(calls[1].messages.at(-1).content).toContain('تایپ سی');expect(calls[1].messages.at(-1).content).toContain('1000000 تومان');
 });
 test(`payment release retains budget and fallback asks about unsupported needs at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await isolated(page);const calls=[];const products=await mockAssistant(page,request,calls);
  await page.route('**/api/assistant/turn',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:{request_id:input.request_id,status:'results',query:'گوشی',category_name:'گوشی موبایل',max_price_toman:'15000000',question:null,question_code:null,products,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},need_state:{version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'15000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]},explanation:null}});});
  await page.goto('/');await send(page,'گوشی تا پانزده میلیون قسطی می‌خواهم');await expect.poll(()=>calls.length).toBe(1);
  await send(page,'فقط ترب‌پی');await expect.poll(async()=> (await session(page,'filters')).pay).toBe(true);
  await send(page,'قسطی لازم نیست؛ همه فروشگاه‌ها را با همان بودجه بررسی کن.');await expect.poll(async()=> (await session(page,'filters')).pay).toBe(false);
  expect(await session(page,'filters')).toMatchObject({credit:false,pay:false,max:'15000000'});
  await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:false,reason:'disabled',remaining_calls:0}}));await reloadCompletedPurchase(page,{max_price_toman:'15000000'});
  const count=calls.length;await send(page,'گوشی با دوربین خوب می‌خواهم');await expect(page.locator('.chat-pane')).toContainText('فقط نام کوتاه کالا');expect(calls).toHaveLength(count);await layout(page);
 });
}

for(const [width,height] of sizes){
 test(`purchase memory, source reasoning and status answers at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await isolated(page);const calls=[];
  const phone=await mockAssistant(page,request,calls);
  let releaseShoe;const shoeReply=new Promise(resolve=>{releaseShoe=resolve;});
  await page.route('**/api/assistant/turn',async r=>{
   const input=r.request().postDataJSON();calls.push(input);
   const shoe=/کفش/.test(input.messages.at(-1).content),pending=/گارانتی/.test(input.messages.at(-1).content);
   if(shoe&&calls.length===2)await shoeReply;
   const battery={status:shoe?'unspecified':'minimum',minimum_mah:shoe?null:5000};
   const need={version:1,topic_query:shoe?'کفش زنانه':'گوشی اندروید',category_name:shoe?null:'گوشی موبایل',category_cleared:false,max_price_toman:shoe?'3000000':'20000000',budget_needs_input:false,offer_sort:'price',battery_requirement:battery,source_filters:{colour:shoe?null:'سفید',size:shoe?'38':null,connector:null},review_topics:[],pending_requirements:pending?[{key:'گارانتی',source_text:'گارانتی معتبر می‌خواهم',status:'unsupported'}]:[]};
   return r.fulfill({json:{request_id:input.request_id,status:pending?'needs_input':'results',query:need.topic_query,category_name:need.category_name,max_price_toman:need.max_price_toman,question:pending?'گارانتی حفظ شده اما تأیید نشده است.':null,question_code:pending?'unsupported_filter':null,products:pending?null:phone,offer_sort:'price',battery_requirement:battery,need_state:need,explanation:null}});
  });
  await page.goto('/');await send(page,'گوشی اندروید سفید با باتری حداقل ۵۰۰۰ تا بیست میلیون می‌خواهم');await expect.poll(()=>calls.length).toBe(1);
  await send(page,'به جای گوشی کفش زنانه سایز ۳۸ تا سه میلیون می‌خواهم');await expect.poll(()=>calls.length).toBe(2);
  // Keep the second reply in flight: reload must wait for its saved result,
  // not merely for calls.length to change on a fast mocked endpoint.
  const reloading=reloadCompletedPurchase(page,{topic_query:'کفش زنانه',max_price_toman:'3000000',source_filters:{size:'38'}});
  try{
   await expect(page.getByRole('button',{name:'توقف بررسی',exact:true})).toBeVisible();
   expect((await session(page,'need')).topic_query).toBe('گوشی اندروید');
  }finally{releaseShoe();}
  await reloading;await send(page,'حالا برگردیم به همان گوشی؛ چه شرط‌هایی داشتم؟');
  await expect.poll(async()=> (await session(page,'need')).max_price_toman).toBe('20000000');
  expect((await session(page,'need')).source_filters.colour).toBe('سفید');expect((await session(page,'need')).battery_requirement.minimum_mah).toBe(5000);
  await expect(page.locator('.chat-pane')).toContainText('شرایط همان خرید را برگرداندم');expect(calls).toHaveLength(2);
  await send(page,'پس رزرو قطعی شد یا نه؟');await expect(page.locator('.chat-pane')).toContainText('رزرو قطعی یا تماس واقعی انجام نشده');expect(calls).toHaveLength(2);await layout(page);
  await send(page,'گارانتی معتبر می‌خواهم');await expect.poll(async()=> (await session(page,'need')).pending_requirements.length).toBe(1);
  await send(page,'به جای گوشی کفش زنانه می‌خواهم');await expect.poll(async()=> (await session(page,'need')).topic_query).toBe('کفش زنانه');
  await reloadCompletedPurchase(page,{topic_query:'کفش زنانه',max_price_toman:'3000000',pending_requirements:[]});await send(page,'برگردیم به همان گوشی');
  await expect.poll(async()=> (await session(page,'need')).pending_requirements.length).toBe(1);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','decide');await expect(page.locator('.chat-pane').getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true})).toHaveCount(0);expect(calls).toHaveLength(4);
  const dir=join(tmpdir(),'torob-intelligence-repairs-20261111');await mkdir(dir,{recursive:true});await page.screenshot({path:join(dir,`memory-${width}.png`)});
 });
}
