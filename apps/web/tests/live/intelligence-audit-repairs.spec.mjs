import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {send,layout} from './helpers.mjs';

const sizes=[[320,568],[360,640],[390,844]];
const session=(page,key)=>page.evaluate(key=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:'+key)),key);
async function capture(page,name){await page.getByRole('button',{name:'توقف بررسی',exact:true}).waitFor({state:'hidden',timeout:20000});const dir=join(tmpdir(),'torob-audit-repairs-20261112');await mkdir(dir,{recursive:true});await layout(page);await page.screenshot({path:join(dir,`${name}-${page.viewportSize().width}.png`)});}
async function setup(page,request){
 const calls=[],searches=[];const pages={};
 for(const topic of ['گوشی','کفش','کابل','هدفون'])pages[topic]=await(await request.get('/api/products?q='+encodeURIComponent(topic)+'&limit=6')).json();
 for(const ep of ['checks','trips','followups'])await page.route(`**/api/local/${ep}**`,r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 await page.route('**/api/voice/**',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:true,reason:'ready',remaining_calls:100}}));
 await page.route(/\/api\/products\?/,r=>{searches.push(new URL(r.request().url()));return r.continue();});
 const response=input=>{
  const text=input.messages.at(-1).content;
  const topic=/کفش/.test(text)?'کفش':/کابل/.test(text)?'کابل':/هدفون/.test(text)?'هدفون':'گوشی';
  const battery={status:topic==='گوشی'?'minimum':'unspecified',minimum_mah:topic==='گوشی'?5000:null};
  const max=topic==='کفش'?'3000000':topic==='کابل'?'500000':topic==='هدفون'?'2000000':'20000000';
  const pending=/گارانتی/.test(text);
  const need={version:1,topic_query:topic==='گوشی'?'گوشی اندروید':topic,category_name:topic==='گوشی'?'گوشی موبایل':null,category_cleared:false,max_price_toman:max,budget_needs_input:false,offer_sort:'price',battery_requirement:battery,source_filters:{colour:topic==='گوشی'?'سفید':null,size:null,connector:topic==='کابل'?'usb-c':null},review_topics:[],pending_requirements:pending?[{key:'گارانتی',source_text:'گارانتی معتبر می‌خواهم',status:'unsupported'}]:[]};
  const explanation=!pending&&/زنگ بزن/.test(text)?{recommended_product_id:null,query:need.topic_query,category_name:need.category_name,max_price_toman:max,ranking_basis:'lexical_match_then_product_id',topics:[],summary:'تماس واقعی انجام نمی‌شود؛ کالای درخواستی را بررسی کردم.',limitations:[],products:[],provenance:pages[topic].provenance}:null;
  return {request_id:input.request_id,status:pending?'needs_input':'results',query:need.topic_query,category_name:need.category_name,max_price_toman:max,question:pending?'گارانتی هنوز تأیید نشده است.':null,question_code:pending?'unsupported_filter':null,products:pending?null:pages[topic],offer_sort:'price',battery_requirement:battery,need_state:need,explanation};
 };
 let fail=false;
 await page.route('**/api/assistant/turn',r=>{const input=r.request().postDataJSON();calls.push(input);return fail?r.fulfill({status:503,json:{code:'provider_failed'}}):r.fulfill({json:response(input)});});
 await page.goto('/');return {calls,searches,setFail:value=>{fail=value;}};
}

for(const [width,height] of sizes){
 test(`restoring a purchase applies a new budget before fetching results at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await send(page,'گوشی اندروید سفید با باتری حداقل ۵۰۰۰ تا بیست میلیون می‌خواهم');await expect.poll(()=>f.calls.length).toBe(1);
  await expect.poll(async()=> (await session(page,'need'))?.max_price_toman).toBe('20000000');
  await send(page,'به جای گوشی کفش تا سه میلیون می‌خواهم');await expect.poll(()=>f.calls.length).toBe(2);await expect.poll(async()=> (await session(page,'need'))?.topic_query).toBe('کفش');
  await page.reload();await send(page,'برگردیم به همان گوشی ولی بودجه را پنج میلیون کن');
  await expect.poll(async()=> (await session(page,'need'))?.max_price_toman).toBe('5000000');
  await expect.poll(()=>f.searches.some(u=>u.searchParams.get('max_price_toman')==='5000000')).toBe(true);
  const url=f.searches.findLast(u=>u.searchParams.get('max_price_toman')==='5000000');
  expect(url.searchParams.get('q')).toBe('گوشی اندروید');expect(url.searchParams.get('min_battery_capacity_mah')).toBe('5000');expect(url.searchParams.get('colour')).toBe('سفید');
  expect((await session(page,'need')).battery_requirement.minimum_mah).toBe(5000);expect(f.calls).toHaveLength(2);
  await send(page,'برگردیم به همان گوشی ولی بودجه را سه میلیون کن');await expect.poll(async()=> (await session(page,'need'))?.max_price_toman).toBe('3000000');expect(f.calls).toHaveLength(2);
  await capture(page,'restored-budget');
 });

 test(`restored unresolved requirements are preserved when the budget changes at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await send(page,'گوشی تا بیست میلیون با گارانتی معتبر می‌خواهم');await expect.poll(async()=> (await session(page,'need'))?.pending_requirements.length).toBe(1);
  await send(page,'به جای گوشی کفش می‌خواهم');await expect.poll(async()=> (await session(page,'need'))?.topic_query).toBe('کفش');
  await send(page,'برگردیم به همان گوشی ولی بودجه را پنج میلیون کن');await expect.poll(async()=> (await session(page,'need'))?.max_price_toman).toBe('5000000');
  expect((await session(page,'need')).pending_requirements).toHaveLength(1);expect(f.calls).toHaveLength(2);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','decide');
  await expect(page.locator('.chat-pane').getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true})).toHaveCount(0);
 });

 test(`a new purchase plus seller contact searches the new item at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await send(page,'گوشی تا بیست میلیون می‌خواهم');await expect.poll(()=>f.calls.length).toBe(1);
  await send(page,'کابل تایپ سی تا پانصد هزار تومان می‌خواهم و به فروشنده زنگ بزن');
  await expect.poll(()=>f.calls.length).toBe(2);await expect.poll(async()=> (await session(page,'need'))?.topic_query).toBe('کابل');
  expect(f.calls[1].messages.at(-1).content).toContain('کابل تایپ سی');expect((await session(page,'need')).max_price_toman).toBe('500000');
  await expect(page.locator('.chat-pane')).toContainText('تماس واقعی انجام نمی‌شود');await capture(page,'mixed-contact');
 });

 test(`queued products retain separate requirements through reload at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await send(page,'گوشی اندرویدی با باتری حداقل ۵۰۰۰ و هدفون بی‌سیم می‌خواهم؛ برای هر کالا ده میلیون تومان');await expect.poll(async()=> (await session(page,'purchaseQueue'))?.length).toBe(2);expect(f.calls).toHaveLength(0);
  await page.reload();await send(page,'اول گوشی تا ده میلیون تومان');await expect.poll(()=>f.calls.length).toBe(1);
  const phone=f.calls[0].messages.at(-1).content;expect(phone).toMatch(/اندرویدی.*باتری حداقل ۵۰۰۰/);expect(phone).not.toContain('هدفون');expect(phone).toContain('10000000');
  await expect.poll(async()=> (await session(page,'purchaseQueue'))?.length).toBe(1);
  await page.reload();await send(page,'هدفون تا دو میلیون تومان');await expect.poll(()=>f.calls.length).toBe(2);
  const headphones=f.calls[1].messages.at(-1).content;expect(headphones).toContain('بی سیم');expect(headphones).not.toMatch(/اندروید|۵۰۰۰|باتری/);expect(headphones).toContain('2000000');
  await expect.poll(async()=> (await session(page,'purchaseQueue'))?.length).toBe(0);await capture(page,'queue-constraints');
 });

 test(`Persian travel deadlines survive reload and ambiguity does not erase them at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await send(page,'گوشی تا بیست میلیون می‌خواهم');await expect.poll(()=>f.calls.length).toBe(1);
  for(const [text,value] of [['فقط بیست و پنج دقیقه برای رسیدن وقت دارم؛ پیاده می‌روم','25'],['بیست و پنج دقیقه بیشتر وقت ندارم؛ پیاده می‌روم','25'],['نیم ساعت بیشتر وقت ندارم؛ پیاده می‌روم','30']]){
   await send(page,text);await expect.poll(()=>session(page,'duration:travelLimit')).toBe(value);
  }
  await page.reload();expect(await session(page,'duration:travelLimit')).toBe('30');
  await send(page,'فقط ده یا بیست دقیقه برای رسیدن وقت دارم');await expect(page.locator('.chat-pane')).toContainText('سقف زمان رفتن روشن نیست');expect(await session(page,'duration:travelLimit')).toBe('30');expect(f.calls).toHaveLength(1);await capture(page,'deadline');
 });

 test(`provider outage has one retry and a safe independent simple search at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);f.setFail(true);
  await send(page,'گوشی تا پنج میلیون می‌خواهم');await expect(page.getByRole('button',{name:'تلاش دوباره',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'ادامهٔ بررسی پیام قبلی',exact:true})).toHaveCount(0);expect(f.calls).toHaveLength(1);
  await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await expect.poll(()=>f.calls.length).toBe(2);await expect(page.getByRole('button',{name:'ادامه با جست‌وجوی ساده',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();
  const map=page.locator('[data-map-panel]');await expect(map.getByRole('button',{name:'تلاش دوباره',exact:true})).toHaveCount(1);
  await map.getByRole('button',{name:'ادامه با جست‌وجوی ساده',exact:true}).click();await expect(map.locator('.map-product-options button').first()).toBeVisible();
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.locator('.product-results')).toBeVisible();expect(f.calls).toHaveLength(2);expect(f.searches.at(-1).searchParams.get('max_price_toman')).toBe('5000000');
  await send(page,'گوشی اندروید سفید با باتری حداقل ۵۰۰۰ تا ده میلیون می‌خواهم');await expect.poll(()=>f.calls.length).toBe(3);
  await page.getByRole('button',{name:'ادامه با جست‌وجوی ساده',exact:true}).click();await expect(page.locator('.chat-pane')).toContainText('سایر ویژگی‌های پیام قبلی خودکار اعمال نمی‌شوند');
  await page.reload();await send(page,'همان گوشی سفید تا پنج میلیون می‌خواهم');await expect(page.locator('.chat-pane')).toContainText('شرایط پیام را حذف نکردم');expect(f.calls).toHaveLength(3);
  await send(page,'گوشی تا پنج میلیون می‌خواهم');await expect(page.locator('.product-results')).toBeVisible();expect(f.calls).toHaveLength(3);expect(await session(page,'query:assistantFailure')).toBe('');await capture(page,'simple-recovery');
  f.setFail(false);await send(page,'هدفون بی سیم می‌خواهم');await expect.poll(()=>f.calls.length).toBe(4);await expect.poll(async()=> (await session(page,'need'))?.topic_query).toBe('هدفون');
 });
}
