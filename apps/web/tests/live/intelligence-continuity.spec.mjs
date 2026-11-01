import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

for(const method of ['coordinates','gps','map','neighbourhood'])test(`location resumes the same phone request automatically: ${method}`,async({page,request})=>{
  await page.setViewportSize({width:390,height:844});const calls=[];await mockAssistant(page,request,calls);
  if(method==='gps')await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=ok=>ok({coords:{latitude:35.7,longitude:51.4,accuracy:20}});});
  await page.goto('/');await send(page,'من گوشی میخوام نزدیک ترین جا بهم رو بگو');
  await expect(page.getByText('کجا را بررسی کنم؟',{exact:true})).toBeVisible();
  if(method==='gps')await page.locator('.inline-location').getByRole('button',{name:'موقعیت فعلی من',exact:true}).click();
  else if(method==='map'){
    await page.getByRole('button',{name:'انتخاب با یک کلیک روی نقشه',exact:true}).click();await page.locator('.maplibregl-canvas').click({position:{x:180,y:300}});
  }else{
    await page.getByRole('region',{name:'گفت‌وگوی خرید'}).getByRole('button',{name:'انتخاب موقعیت',exact:true}).click();
    if(method==='neighbourhood')await page.getByLabel('محلهٔ تهران (مرکز تقریبی)').selectOption('d6');
    else{await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();}
  }
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('log')).not.toContainText('چه نوع کالایی');expect(calls).toHaveLength(0);
  await page.reload();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
  if(method==='coordinates'){
    // Reproduce the persisted shape left by the previous version.
    await page.evaluate(()=>sessionStorage.setItem('inperson-journey:v2:messages',JSON.stringify([{role:'user',content:'من گوشی میخوام نزدیک ترین جا بهم رو بگو'}])));
    await page.reload();
  }
  await send(page,'بودجه را دو میلیون کن');await expect.poll(()=>calls.length).toBe(1);
  expect(calls[0].context_need_state.topic_query).toBe('گوشی');
  await layout(page);
});

test('a model clarification retains battery and budget after manual location',async({page,request})=>{
  const products=await mockAssistant(page,request);let turns=0;
  await page.route('**/api/assistant/turn',r=>{turns++;const input=r.request().postDataJSON();return r.fulfill({json:{request_id:input.request_id,status:'needs_input',query:'گوشی',category_name:'گوشی موبایل',max_price_toman:'10000000',question:'موقعیت جست‌وجو را مشخص کنید.',question_code:'location',products:null,offer_sort:'nearest',battery_requirement:{status:'minimum',minimum_mah:5000},need_state:{version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'10000000',budget_needs_input:false,offer_sort:'nearest',battery_requirement:{status:'minimum',minimum_mah:5000},review_topics:[],pending_requirements:[]},explanation:null}});});
  let search;
  await page.route('**/api/products?**',r=>{if(new URL(r.request().url()).searchParams.get('user_lat'))search=new URL(r.request().url()).searchParams;return r.fallback();});
  await page.goto('/');await send(page,'گوشی با باتری حداقل ۵۰۰۰ تا ده میلیون نزدیک من میخوام');await expect(page.locator('.inline-location')).toBeVisible();
  await page.getByRole('region',{name:'گفت‌وگوی خرید'}).getByRole('button',{name:'انتخاب موقعیت',exact:true}).click();await page.getByLabel('محلهٔ تهران (مرکز تقریبی)').selectOption('d6');
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');expect(turns).toBe(1);
  expect(search.get('q')).toBe('گوشی');expect(search.get('max_price_toman')).toBe('10000000');expect(search.get('min_battery_capacity_mah')).toBe('5000');
  expect(products.items.length).toBeGreaterThan(0);
});

for(const width of [320,390,1440])test(`compact comparison ignores typography but preserves real differences at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:844});const products=await mockAssistant(page,request);
  products.items.slice(0,2).forEach((p,i)=>{p.specs=[{section:'مشخصات',key:'ظرفیت باتری',value:i?'۸۰۰ میلی آمپر ساعت':'800 میلی‌آمپر ساعت'},{section:'مشخصات',key:'نوع درگاه',value:i?'USB-C':'micro USB'}];});
  await page.goto('/');await send(page);const replies=page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'});await expect(replies.getByRole('button')).toHaveCount(2);await replies.getByRole('button',{name:'مقایسهٔ گزینه‌ها',exact:true}).click();
  const d=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'});await expect(d.getByRole('rowheader',{name:'مشخصات · ظرفیت باتری',exact:true})).toBeVisible();
  await d.getByRole('checkbox',{name:'فقط تفاوت‌ها را نشان بده'}).check();await expect(d.getByRole('rowheader',{name:'مشخصات · ظرفیت باتری',exact:true})).toHaveCount(0);await expect(d.getByRole('rowheader',{name:'مشخصات · نوع درگاه',exact:true})).toBeVisible();
  await d.getByRole('checkbox',{name:'فقط تفاوت‌ها را نشان بده'}).uncheck();const metrics=await d.locator('.dialog-content').evaluate(e=>({height:e.scrollHeight,width:e.scrollWidth,client:e.clientWidth}));expect(metrics.height).toBeLessThan(1800);expect(metrics.width).toBeLessThanOrEqual(metrics.client+1);
  await page.screenshot({path:`../../.local/live-qa/intelligence-compare-${width}.png`});await page.keyboard.press('Escape');await layout(page);
});

test('sending before status is loaded waits and starting over cancels the pending turn',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);let statusRoute;
  await page.route('**/api/assistant/status',r=>{statusRoute=r;});await page.goto('/');
  await send(page,'کفش برای پیاده‌روی می‌خواهم');await expect(page.getByRole('button',{name:'توقف بررسی',exact:true})).toBeVisible();expect(calls).toHaveLength(0);
  await page.getByRole('button',{name:'گفت‌وگوی تازه',exact:true}).click();await statusRoute.fulfill({json:{ready:true,reason:'ready',remaining_calls:20}});
  await expect(page.getByRole('heading',{name:/چی لازم داری/})).toBeVisible();await page.waitForTimeout(250);expect(calls).toHaveLength(0);
  await send(page,'گوشی می‌خواهم');await expect.poll(()=>calls.length).toBe(1);
});

test('walking shoes offer a compact audience question instead of a cheapest-child recommendation',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls,'کفش');await page.goto('/');await send(page,'هر روز یک ساعت پیاده‌روی دارم؛ تا سه میلیون تومان کفش می‌خواهم');
  const replies=page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'});await expect(replies.getByRole('button')).toHaveCount(3);await replies.getByRole('button',{name:'کفش مردانه',exact:true}).click();
  await expect.poll(()=>calls.length).toBe(2);expect(calls[1].messages.at(-1).content).toBe('کفش مردانه می‌خواهم');expect(calls[1].context_need_state.topic_query).toBe('کفش');await layout(page);
});
