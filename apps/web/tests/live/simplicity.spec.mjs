import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

const output=join(tmpdir(),'torob-c-repair-20261108','after');
const sizes=[[360,640],[390,844],[320,568],[844,390]];
const dialog=page=>page.locator('.chat-dialog');
const journey=page=>page.locator('.chat-pane .purchase-journey');
const pause=page=>page.waitForTimeout(400);
async function capture(page,name,extra={}){
 await pause(page);await mkdir(output,{recursive:true});
 const measurements=await page.evaluate(()=>{
  const rect=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
  const header=rect('[data-mobile-map-header]'),sheet=rect('[data-mobile-store-sheet]'),body=rect('[data-chat-scroll]');
  const visible=e=>{const r=e.getBoundingClientRect();return e.checkVisibility()&&!e.closest('[hidden],[inert]')&&r.bottom>0&&r.top<innerHeight;};
  const scope=document.querySelector('.chat-dialog')??document.querySelector('[data-map-panel]:not([hidden])')??document.querySelector('[data-active-tool]');
  return {width:innerWidth,height:innerHeight,header,sheet,body,mapClear:header&&sheet?sheet.top-header.bottom:null,controls:[...scope.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(visible).length,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 await page.screenshot({path:join(output,`${name}-${page.viewportSize().width}.png`)});
 await writeFile(join(output,`${name}-${page.viewportSize().width}.json`),JSON.stringify({...measurements,...extra},null,2));return measurements;
}
async function fixture(page,request){
 const calls=[],writes=[];const products=await mockAssistant(page,request,calls,'هدفون');products.items.sort((a,b)=>b.offer_summary.offer_count-a.offer_summary.offer_count);
 const product=products.items[0];const source=await(await request.get(`/api/products/${product.product_id}/offers?user_lat=35.7&user_lon=51.4&limit=20`)).json();
 const rows=source.items.slice(0,5).map((o,i)=>({...o,shop:{...o.shop,address:i===0?'خیابان جمهوری، پاساژ نمونه، طبقه ۳، واحد ۱۲، ورودی آسانسور':o.shop.address},opening_hours:{...o.opening_hours,status:'declared_open',reason:'within_declared_shift'}}));expect(rows.length).toBeGreaterThan(1);
 const prepared=await(await request.post('/api/followups/prepare',{data:{product_id:product.product_id,offer_id:rows[0].offer_id,shop_id:rows[0].shop_id}})).json();
 const alternatives=await(await request.post('/api/followups/alternatives',{data:{product_id:product.product_id,offer_id:rows[0].offer_id,shop_id:rows[0].shop_id,outcome:'no_answer',outcome_source:'simulated',user_lat:35.7,user_lon:51.4}})).json();
 // Every paid model call and persisted mutation is controlled; no real seller traffic.
 await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 await page.route(/\/api\/products\/[^/]+\/offers(?:\?|$)/,r=>r.fulfill({json:{...source,items:rows,has_more:false}}));
 await page.route('**/api/followups/prepare',r=>r.fulfill({json:{...prepared,selected_offer:rows.find(o=>o.offer_id===r.request().postDataJSON().offer_id)??rows[0]}}));
 await page.route('**/api/followups/alternatives',r=>r.fulfill({json:{...alternatives,alternatives:{...alternatives.alternatives,items:rows.filter(o=>o.shop_id!==r.request().postDataJSON().shop_id),has_more:false}}}));
 await page.route('**/api/local/arrival-checks',r=>r.fulfill({json:{items:r.request().postDataJSON().selections.map(s=>({...s,departure_at:'2026-11-08T10:00:00+03:30',arrival_at:'2026-11-08T10:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:'ready',inventory_status:'unconfirmed'})),limitations:[]}}));
 await page.route('**/api/local/road-routes',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{items:b.selections.map(s=>({...s,status:'ready',mode:b.mode,distance_meters:900,duration_seconds:600,endpoint_offset_meters:0,computed_at:'2026-11-08T10:00:00+03:30',geometry:{type:'LineString',coordinates:[[51.4,35.7],[51.401,35.701]]},steps:[{name:'خیابان نمونه',type:'depart',modifier:'straight',distance_meters:900,duration_seconds:600}]}))}});});
 await page.route('**/api/local/followups**',r=>{if(r.request().method()==='GET')return r.fulfill({json:{items:[]}});const b=r.request().postDataJSON();writes.push(b);return r.fulfill({json:{id:'controlled_report',...b,created_at:'2026-11-08T10:00:00+03:30'}});});
 return {calls,writes,rows};
}
async function start(page,request){const data=await fixture(page,request);await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');await expect(page.locator('.product-results')).toBeVisible();await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();await expect(journey(page)).toHaveAttribute('data-purchase-stage','ready');return data;}
async function openMore(page){await journey(page).locator('.journey-more>summary').click();}

test.describe('mobile simplicity',()=>{test.use({hasTouch:true,isMobile:true});
for(const [width,height] of sizes){
 test(`entry, visible results, filters and voice at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await fixture(page,request);await page.goto('/');
  await page.locator('.comparison-launcher').tap({force:true});await expect(page.getByText('اول محصول یا فروشگاه را به مقایسه اضافه کن.',{exact:true})).toBeVisible();
  await expect(page.locator('.welcome-position .primary-action')).toHaveCount(0);await capture(page,'home');
  await page.locator('.header-location').click();await expect(page.getByLabel('عرض جغرافیایی')).toBeHidden();await expect(page.getByText('ورود دقیق مختصات',{exact:true})).toBeVisible();await capture(page,'location');await dialog(page).getByRole('button',{name:'بستن',exact:true}).click();
  await page.locator('.mobile-header-menu>summary').click();await page.locator('.mobile-header-options').getByRole('button',{name:'شرایط خرید',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'کالابرگ',exact:true})).toBeDisabled();for(const name of ['فقط اعتبار حضوری','ترب‌پی حضوری'])await expect(page.getByRole('checkbox',{name,exact:true})).toBeEnabled();await capture(page,'filters');await dialog(page).getByRole('button',{name:'بستن',exact:true}).click();
  await page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true}).fill('نیازم را نگه دار');await page.locator('.composer-area').getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();await expect(page.getByText('الان صدا در دسترس نیست؛ با تایپ ادامه بده.',{exact:true})).toBeVisible();await expect(page.locator('.voice-visual')).toHaveCount(0);await expect(page.getByText(/AVALAI_API_KEY/)).toBeHidden();await capture(page,'voice');await page.getByRole('button',{name:'ادامه با تایپ',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true})).toHaveValue('نیازم را نگه دار');
  await send(page,'هدفون میخوام');await pause(page);const area=await page.locator('[data-chat-scroll]').boundingBox(),first=await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().boundingBox();
  if(height>=568){expect(first.y).toBeGreaterThanOrEqual(area.y);expect(first.y+first.height).toBeLessThanOrEqual(area.y+area.height+1);}await capture(page,'products',{firstAction:first});
  await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await pause(page);const card=await page.locator('[data-offer]').first().boundingBox();const content=await page.locator('[data-chat-scroll]').boundingBox();expect(card.y).toBeLessThan(content.y+content.height);await capture(page,'stores',{firstCard:card});
  const contactStyle=await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).evaluate(e=>({background:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius}));await page.locator('[data-offer]').first().getByRole('checkbox',{name:'مقایسه',exact:true}).click();await page.locator('.comparison-launcher').click();const compared=dialog(page).getByRole('button',{name:'بررسی با فروشگاه',exact:true}).first();await expect(compared).toBeVisible();expect(await compared.evaluate(e=>({background:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius}))).toEqual(contactStyle);await capture(page,'comparison');await page.goBack();
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();const navigator=page.locator('[data-map-selected-actions]').getByRole('button',{name:'بازکردن مسیریاب',exact:true});await expect(navigator).toHaveText('بازکردن مسیریاب');await navigator.click();await expect(dialog(page)).toHaveAccessibleName('انتخاب مسیریاب');await page.goBack();await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.getByRole('log',{name:'پیام‌های گفت‌وگو'})).toBeVisible();await expect(page.getByRole('log').locator('[data-message-role]')).toHaveCount(2);await layout(page);
 });
 test(`flat follow-up, demo and user evidence at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await start(page,request);await openMore(page);await capture(page,'ready-more');
  await journey(page).getByRole('button',{name:'بررسی موجودی و پاسخ فروشگاه',exact:true}).click();await expect(dialog(page)).toHaveAccessibleName('بررسی موجودی و پاسخ فروشگاه');await capture(page,'followup');
  await dialog(page).getByRole('button',{name:'تماس و پیام به فروشگاه',exact:true}).click();await expect(dialog(page).getByRole('button',{name:'کپی متن',exact:true})).toBeVisible();await expect(dialog(page)).toContainText('شماره‌های کاتالوگ آزمایشی‌اند');await page.goBack();await expect(dialog(page)).toHaveAccessibleName('بررسی موجودی و پاسخ فروشگاه');
  await dialog(page).getByRole('button',{name:'نتیجهٔ بررسی من',exact:true}).click();await dialog(page).getByLabel('نتیجه',{exact:true}).selectOption('available');await dialog(page).getByLabel('یادداشت',{exact:true}).fill('تماس خودم؛ موجود گزارش شد');await dialog(page).getByRole('button',{name:'ذخیرهٔ نتیجه',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);expect(f.writes[0].source).toBe('user_report');await page.goBack();
  await dialog(page).getByRole('button',{name:'نمایش آزمایشی؛ بدون ارتباط واقعی',exact:true}).click();await expect(page.getByLabel('سناریوی پیگیری آزمایشی')).toBeVisible();expect(await page.locator('[data-followup-assistant]').locator('xpath=ancestor::details').count()).toBe(0);await capture(page,'demo');
  await page.getByLabel('سناریوی پیگیری آزمایشی').selectOption('no_answer');await page.getByRole('button',{name:'اجرای پیگیری آزمایشی',exact:true}).click();await expect(journey(page)).toHaveAttribute('data-purchase-stage','problem');await dialog(page).getByRole('button',{name:'دیدن جایگزین‌ها و ادامهٔ خرید',exact:true}).click();await expect(page.locator('.journey-alternatives button').first()).toBeVisible();await capture(page,'no-answer');await page.locator('.journey-alternatives button').first().click();await expect(journey(page)).toHaveAttribute('data-purchase-stage','ready');expect(f.calls).toHaveLength(1);await layout(page);
 });
 test(`map space, street journey and result at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await start(page,request);await journey(page).getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await journey(page).getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(dialog(page)).toHaveCount(0);await expect(page.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','en_route');
  await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await expect(page.locator('[data-map-route-state]')).toHaveAttribute('data-map-route-state','drawn');const active=page.locator('[data-mobile-journey]');const sheet=page.locator('[data-mobile-store-sheet]');
  for(const [state,action] of [['moving','رسیدم به فروشگاه'],['arrived','خریدم؛ خرید انجام شد'],['done',null]]){
   await expect(page.locator('.map-sheet-address')).toBeVisible();await expect(page.locator('.map-sheet-address')).toContainText('طبقه ۳، واحد ۱۲');await expect(sheet.locator('.map-store-choice:visible')).toHaveCount(0);
   const m=await capture(page,`${state}-map`);if(height>=568)expect(m.mapClear/height).toBeGreaterThanOrEqual(.4);
   if(state==='moving'){await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','full');await expect(sheet.locator('.map-store-choice:visible')).toHaveCount(0);await expect(sheet.getByRole('button',{name:'دیدن فروشگاه‌های دیگر',exact:true})).toBeVisible();await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');}if(state!=='done'){await active.getByRole('button',{name:'بازکردن مسیریاب',exact:true}).click();await expect(dialog(page)).toHaveAccessibleName('انتخاب مسیریاب');await page.goBack();}
   if(state==='arrived'){await active.getByRole('button',{name:'جزئیات این مرحله',exact:true}).click();await dialog(page).getByText('راهنمای پیدا کردن ورودی فروشگاه',{exact:true}).click();await expect(dialog(page)).toContainText('واحد ۱۲');await capture(page,'indoor');await dialog(page).getByRole('button',{name:'بستن',exact:true}).click();}
   if(state==='done'){await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await capture(page,'done-chat');await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();}if(action)await active.getByRole('button',{name:action,exact:true}).click();
  }
  await active.getByRole('button',{name:'جزئیات این مرحله',exact:true}).click();await expect(dialog(page).getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true})).toBeVisible();await dialog(page).getByRole('button',{name:'رفتن به مرحلهٔ حرکت',exact:true}).click();await expect(active).toHaveAttribute('data-purchase-stage','en_route');await page.goBack();await expect(dialog(page)).toHaveCount(0);await capture(page,'return-moving');
 });
}
});

test('ready voice keeps its recording and listening controls',async({page,request})=>{await page.setViewportSize({width:390,height:844});await fixture(page,request);await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:true,reason:'ready'}}));await page.goto('/');await page.getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();await expect(page.locator('.voice-visual')).toBeVisible();await expect(page.getByRole('button',{name:'شروع ضبط',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'شنیدن متن',exact:true})).toBeVisible();await capture(page,'voice-ready');});
