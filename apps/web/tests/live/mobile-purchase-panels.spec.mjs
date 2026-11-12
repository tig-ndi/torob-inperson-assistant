import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

const output=join(tmpdir(),'torob-mobile-panels-20261108');
const sizes=[[320,568],[360,640],[390,844],[844,390]];
const chat=page=>page.locator('.chat-pane .purchase-journey');
async function setup(page,request,{failure=false}={}){
 const calls=[],roads=[];const products=await mockAssistant(page,request,calls,'هدفون');products.items=products.items.slice(0,1);
 await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/followups',r=>r.abort());
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 await page.route('**/api/local/arrival-checks',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{items:b.selections.map(s=>({...s,departure_at:'2026-11-08T10:00:00+03:30',arrival_at:'2026-11-08T10:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:'ready',inventory_status:'unconfirmed'})),limitations:[]}});});
 await page.route('**/api/local/road-routes',r=>{const b=r.request().postDataJSON();roads.push(b);return r.fulfill({json:{items:b.selections.map(s=>failure?{...s,status:'unavailable',reason:'خطای کنترل‌شدهٔ مسیر'}:{...s,status:'ready',mode:b.mode,distance_meters:900,duration_seconds:600,endpoint_offset_meters:0,computed_at:'2026-11-08T10:00:00+03:30',geometry:{type:'LineString',coordinates:[[51.4,35.7],[51.401,35.7],[51.401,35.701]]},steps:[{name:'خیابان آزمایشی',type:'depart',modifier:'straight',distance_meters:900,duration_seconds:600}]})}});});
 await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();
 await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
 await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');await expect(chat(page).getByRole('button',{name:'بزن بریم',exact:true})).toBeEnabled();
 return {calls,roads};
}
async function mapJourney(page){
 if(!await page.locator('[data-map-panel]').isVisible())await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 if(await page.locator('[data-mobile-store-sheet]').getAttribute('data-sheet-stop')==='collapsed')await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();
 return page.locator('[data-mobile-journey]');
}
async function details(page){const journey=await mapJourney(page);await journey.getByRole('button',{name:'جزئیات این مرحله',exact:true}).click();return page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true});}
async function screenshot(page,name){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`${name}-${page.viewportSize().width}.png`)});}

for(const [width,height] of sizes){
 test(`visible mobile actions, named themes and navigator parameters at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);
  for(const name of ['گفت‌وگوی تازه','مقایسهٔ انتخاب‌ها']){const button=page.locator('.chat-header .header-actions').getByRole('button',{name,exact:true});await expect(button).toBeVisible();const b=await button.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);}
  await page.locator('.mobile-header-menu>summary').click();const theme=page.locator('.mobile-header-options .theme-picker');await expect(theme).toContainText('مطابق سیستم');await theme.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();
  for(const name of ['روشن','تاریک','مطابق سیستم'])await expect(theme.locator('.theme-switch').getByText(name,{exact:true})).toBeVisible();await theme.getByRole('button',{name:'ظاهر تیره',exact:true}).click();await expect(theme).toContainText('حالت تاریک');await screenshot(page,'themes');await page.keyboard.press('Escape');
  await chat(page).getByRole('button',{name:'بازکردن مسیریاب',exact:true}).click();const d=page.getByRole('dialog',{name:'انتخاب مسیریاب',exact:true});await expect(d).toBeVisible();await expect(d.locator('.travel-sheet')).toHaveCount(0);
  const url=new URL(await d.getByRole('link',{name:'بازکردن در Google Maps',exact:true}).getAttribute('href'));expect(url.searchParams.get('origin')).toBe('35.7,51.4');expect(url.searchParams.get('destination')).toMatch(/^[-\d.]+,[-\d.]+$/);expect(url.searchParams.get('travelmode')).toBe('walking');expect(url.searchParams.get('dir_action')).toBe('navigate');
  await screenshot(page,'navigator');await page.goBack();await expect(d).toHaveCount(0);await layout(page);
 });
 test(`independent child panels return to expanded purchase details at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);let d=await details(page);await d.locator('.journey-more>summary').click();await d.locator('.journey-secondary>summary').click();
  for(const [action,title] of [['وسیله و زمان حرکت','وسیله، مسیر و زمان رسیدن'],['بررسی فروشگاه‌های دیگر','فروشگاه‌های دیگر همین محصول'],['ذخیرهٔ برنامه','ذخیره و دانلود برنامهٔ خرید'],['ادامه در فرصتی دیگر','ادامهٔ خرید در فرصتی دیگر']]){
   d=page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true});await d.getByRole('button',{name:action,exact:true}).click();const child=page.getByRole('dialog',{name:title,exact:true});await expect(child).toBeVisible();await expect(child.locator('[data-overlay-panel]:visible')).toHaveCount(1);await child.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toBeVisible();await expect(d.locator('.journey-more')).toHaveAttribute('open','');
  }
  const action=d.getByRole('button',{name:'وسیله و زمان حرکت',exact:true});await action.scrollIntoViewIfNeeded();const parentScroll=await d.locator('.dialog-content').evaluate(e=>e.scrollTop);await action.click();await page.goBack();await expect(d).toBeVisible();await expect.poll(()=>d.locator('.dialog-content').evaluate(e=>e.scrollTop)).toBeCloseTo(parentScroll,0);await screenshot(page,'parent-return');await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true})).toHaveCount(0);
 });
 test(`successful street routing closes settings and shows the route at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(page.locator('.chat-dialog')).toHaveCount(0);let settings=await details(page);await settings.locator('.journey-more>summary').click();await settings.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();const travel=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await expect(travel).toBeVisible();await travel.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();
  await expect(travel).toHaveCount(0);await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(page.locator('[data-map-route-state]')).toHaveAttribute('data-map-route-state','drawn');expect(f.roads.length).toBeGreaterThan(0);expect(f.calls).toHaveLength(1);
  let d=await details(page);await d.locator('.journey-more>summary').click();await d.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();const count=f.roads.length;await travel.getByRole('button',{name:'به‌روزرسانی مسیر خیابانی',exact:true}).click();await expect(travel).toHaveCount(0);expect(f.roads.length).toBeGreaterThan(count);await expect(page.locator('[data-map-route-state]')).toHaveAttribute('data-map-route-state','drawn');
  d=await details(page);await d.locator('.journey-more>summary').click();await d.getByRole('button',{name:'راهنمای مسیر خیابانی',exact:true}).click();const directions=page.getByRole('dialog',{name:'راهنمای مسیر خیابانی',exact:true});await expect(directions).toContainText('خیابان آزمایشی');await directions.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toBeVisible();await screenshot(page,'route-return');
 });
 test(`stage tabs and real offline PNG download work at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(page.locator('.chat-dialog')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toHaveCount(0);
  let journey=await mapJourney(page);await journey.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','arrived');const stepsDialog=await details(page);await stepsDialog.getByRole('button',{name:'رفتن به مرحلهٔ انتخاب مقصد',exact:true}).click();await expect(stepsDialog).toHaveCount(0);await expect(journey).toHaveAttribute('data-purchase-stage','ready');
  const readyDetails=await details(page);await expect(readyDetails.getByRole('button',{name:'رفتن به مرحلهٔ رسیدن',exact:true})).toBeDisabled();await readyDetails.getByRole('button',{name:'بستن',exact:true}).click();
  await journey.getByRole('button',{name:'بزن بریم',exact:true}).click();await journey.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await journey.getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','done');
  const d=await details(page);await expect(d.getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await d.getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toMatch(/\.png$/);await mkdir(output,{recursive:true});const path=join(output,`purchase-${width}.png`);await file.saveAs(path);const bytes=await readFile(path);expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(bytes.length).toBeGreaterThan(1000);await screenshot(page,'download');
  await d.getByRole('button',{name:'رفتن به مرحلهٔ حرکت',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','en_route');
 });
}
test('failed street routing keeps the settings and explicit error available',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,request,{failure:true});await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();const parent=await details(page);await parent.locator('.journey-more>summary').click();await parent.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d).toContainText('خطای کنترل‌شدهٔ مسیر');await expect(d).toBeVisible();
});

for(const [width,height] of sizes){
 test(`mobile inline departure, recent chat, ready-reply Back and compact credit at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);
  await expect(page.getByRole('log',{name:'پیام‌های گفت‌وگو'}).locator('[data-message-role]')).toHaveCount(2);
  await expect(page.locator('.older-messages')).not.toHaveAttribute('open','');await page.locator('.older-messages>summary').click();await expect(page.locator('.older-messages [data-message-role]').first()).toBeVisible();await page.locator('.older-messages>summary').click();
  const d=await details(page);const nav=d.locator('.journey-step-nav'),before=await nav.boundingBox();await d.locator('.dialog-content').evaluate(e=>e.scrollTop=180);const after=await nav.boundingBox();expect(before.y-after.y).toBeGreaterThan(100);expect(await nav.evaluate(e=>getComputedStyle(e).position)).toBe('static');await d.getByRole('button',{name:'بستن',exact:true}).click();
  await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await page.getByRole('button',{name:'اصلاح کالای موردنظر',exact:true}).click();await expect(page.locator('.chat-dialog')).toHaveAccessibleName('اصلاح کالای موردنظر');await page.locator('.chat-dialog').getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(page.locator('.chat-dialog')).toHaveAccessibleName('پاسخ‌های آماده');
  await page.getByRole('button',{name:'اصلاح کالای موردنظر',exact:true}).click();await page.goBack();await expect(page.locator('.chat-dialog')).toHaveAccessibleName('پاسخ‌های آماده');await page.locator('.chat-dialog').getByRole('button',{name:'بستن',exact:true}).click();
  const j=await mapJourney(page);await expect(j.getByRole('button',{name:'تغییر وسیله و زمان حرکت',exact:true})).toContainText('حرکت همین الان');
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(page.locator('[data-mobile-store-sheet]')).toHaveAttribute('data-sheet-stop','full');
  await expect(j.getByRole('button',{name:'تنظیم زمان حرکت و جزئیات مسیر',exact:true})).toContainText('حرکت همین الان');expect(f.roads).toHaveLength(0);
  await j.getByRole('button',{name:'دوچرخه',exact:true}).click();await expect(j.getByRole('button',{name:'دوچرخه',exact:true})).toHaveCount(1);await expect(j.getByRole('button',{name:'دوچرخه',exact:true})).toHaveAttribute('aria-pressed','true');await expect(j.locator('input[type=checkbox]')).toHaveCount(0);await expect(j.locator('.mobile-journey-actions').getByRole('button',{name:'وسیله و زمان حرکت',exact:true})).toHaveCount(0);await j.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect.poll(()=>f.roads.length).toBeGreaterThan(0);expect(f.roads.at(-1).mode).toBe('cycling');await j.getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(page.locator('.chat-dialog')).toHaveCount(0);await expect(j).toHaveAttribute('data-purchase-stage','en_route');
  const credit=page.locator('.map-credit');await expect(credit).not.toHaveAttribute('open','');expect((await credit.boundingBox()).width).toBeLessThanOrEqual(48);await credit.locator('summary').click();await expect(credit.getByRole('link',{name:'OpenStreetMap',exact:true})).toBeVisible();await page.goBack();await expect(credit).not.toHaveAttribute('open','');await screenshot(page,'inline-departure');await layout(page);expect(f.calls).toHaveLength(1);
 });
 test(`mobile contact channels, bounded alternatives and unavailable voice at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);
  await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'invalid_toggle'}}));
  await chat(page).getByRole('button',{name:'بررسی موجودی و پاسخ فروشگاه',exact:true}).click();let d=page.locator('.chat-dialog');await d.getByRole('button',{name:'تماس و پیام به فروشگاه',exact:true}).click();
  await expect(d.locator('a[href^="tel:"]')).toHaveCount(0);await d.getByLabel('شمارهٔ معتبر فروشگاه',{exact:true}).fill('۰۹۱۲۳۴۵۶۷۸۹');await expect(d.locator('a[href^="tel:"]')).toHaveCount(0);await d.getByRole('checkbox').check();await expect(d.getByRole('link',{name:'تماس',exact:true})).toHaveAttribute('href','tel:+989123456789');
  await d.getByLabel('متن پیشنهادی برای فروشنده',{exact:true}).fill('قیمت و موجودی همین مدل؟');expect(new URL(await d.getByRole('link',{name:'واتساپ',exact:true}).getAttribute('href')).searchParams.get('text')).toBe('قیمت و موجودی همین مدل؟');await expect(d.getByRole('link',{name:'پیامک',exact:true})).toHaveAttribute('href',/^sms:/);await screenshot(page,'contact-channels');
  await d.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toHaveAccessibleName('بررسی موجودی و پاسخ فروشگاه');await d.getByRole('button',{name:'بررسی جایگزین‌ها',exact:true}).click();
  const reasons=d.getByRole('group',{name:'دلیل جست‌وجوی جایگزین',exact:true});await expect(reasons.getByRole('button')).toHaveCount(3);await reasons.getByRole('button',{name:'بسته',exact:true}).click();await expect(reasons.getByRole('button',{name:'بسته',exact:true})).toHaveAttribute('aria-pressed','true');for(const b of await reasons.getByRole('button').all()){const box=await b.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.height).toBeGreaterThanOrEqual(44);}await screenshot(page,'bounded-reasons');await d.getByRole('button',{name:'بستن',exact:true}).click();
  await page.getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();await expect(d).toContainText('الان صدا در دسترس نیست');await expect(d).not.toContainText(/\.env|TOROB_|AVALAI_|راهنمای فنی/);await expect(d.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true})).toBeVisible();await screenshot(page,'voice-unavailable');await d.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toHaveCount(0);await layout(page);
 });
}

test('parallel simulated checks keep separate contact drafts and seller Back returns one level',async({page,request})=>{
 await page.setViewportSize({width:360,height:640});await setup(page,request);let batch=null;const submitted=[];
 await page.route('**/api/local/checks**',async r=>{
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();submitted.push(body);batch={id:'batch-test',journey_id:body.journey_id,created_at:'2026-11-10T10:00:00+03:30',source:'simulated',items:body.selections.map((s,i)=>({...s,shop_name:`فروشگاه آزمایشی ${i+1}`,product_name:'هدفون آزمایشی',source_price_toman:'1000000',source:'simulated',channel:'local_seller_panel',seller_token:`seller-${i}`,reply:null,reservation:null}))};return r.fulfill({json:batch});
  }return r.fulfill({json:{items:batch?[batch]:[]}});
 });
 await page.route('**/api/local/seller-demo/**',r=>r.fulfill({json:batch.items[0]}));
 await chat(page).getByRole('button',{name:'بررسی موجودی و پاسخ فروشگاه',exact:true}).click();const d=page.locator('.chat-dialog');await d.locator('.followup-panel > details > summary').click();await d.getByRole('button',{name:'نمایش آزمایشی؛ پاسخ و رزرو',exact:true}).click();await d.getByRole('button',{name:'شروع استعلام هم‌زمان',exact:true}).click();await expect(d.getByRole('button',{name:'پاسخ در نقش فروشنده',exact:true}).first()).toBeVisible();expect(submitted).toHaveLength(1);expect(submitted[0].selections.length).toBeGreaterThan(1);expect(submitted[0].selections.length).toBeLessThanOrEqual(3);
 await d.getByRole('button',{name:'پاسخ در نقش فروشنده',exact:true}).first().click();await expect(d.locator('.seller-demo')).toBeVisible();await expect(d.getByRole('button',{name:'بازگشت به استعلام‌ها',exact:true})).toHaveCount(0);await d.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d.locator('.seller-demo')).toHaveCount(0);await expect(d.locator('.checks-sheet')).toBeVisible();
 await d.locator('.checks-communication>summary').click();const shops=d.locator('.checks-communication>details');expect(await shops.count()).toBe(submitted[0].selections.length);await shops.nth(0).locator('summary').click();await shops.nth(0).getByLabel('شمارهٔ معتبر فروشگاه',{exact:true}).fill('09123456789');await shops.nth(1).locator('summary').click();await expect(shops.nth(1).getByLabel('شمارهٔ معتبر فروشگاه',{exact:true})).toHaveValue('');await shops.nth(1).getByLabel('شمارهٔ معتبر فروشگاه',{exact:true}).fill('09129876543');await expect(shops.nth(0).getByLabel('شمارهٔ معتبر فروشگاه',{exact:true})).toHaveValue('09123456789');await screenshot(page,'parallel-checks');
 await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(d).toHaveCount(0);await chat(page).getByRole('button',{name:'بررسی موجودی و پاسخ فروشگاه',exact:true}).click();await expect(d).toHaveAccessibleName('بررسی موجودی و پاسخ فروشگاه');await page.goBack();await expect(d).toHaveCount(0);
});

for(const [width,height] of sizes)test(`purchase map shows explicit store navigation instead of a clipped duplicate list at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height});const {calls}=await setup(page,request);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();const sheet=page.locator('[data-mobile-store-sheet]');await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');await expect(sheet.locator('.map-journey-shops')).toHaveCount(0);await expect(sheet.locator('.mobile-view-switch')).toBeInViewport();const j=await mapJourney(page);
 await expect(sheet.locator('.map-sheet-content')).toBeHidden();await expect(sheet.locator('.map-store-choice:visible')).toHaveCount(0);
 const back=sheet.getByRole('button',{name:'برگشت به فهرست فروشگاه‌ها',exact:true}),others=sheet.getByRole('button',{name:'دیدن فروشگاه‌های دیگر',exact:true});
 for(const button of [back,others]){await button.scrollIntoViewIfNeeded();const b=await button.boundingBox(),footer=await sheet.locator('.mobile-view-switch').boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.y+b.height).toBeLessThanOrEqual(footer.y+1);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);await expect(button.locator('svg')).toHaveCount(1);}
 await screenshot(page,'shop-actions-visible');await others.click();const shops=page.getByRole('dialog',{name:'فروشگاه‌های دیگر همین محصول',exact:true});await expect(shops.locator('[data-offer]').first()).toBeVisible();await shops.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(shops).toHaveCount(0);await expect(j).toHaveAttribute('data-purchase-stage','ready');
 const start=j.getByRole('button',{name:'بزن بریم',exact:true});await start.scrollIntoViewIfNeeded();await expect(back).toBeInViewport();await expect(others).toBeInViewport();const b=await start.boundingBox(),footer=await sheet.locator('.mobile-view-switch').boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(footer.y+1);await screenshot(page,'shop-navigation-fix');
 await back.click();await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(sheet).toHaveAttribute('data-sheet-stop','full');await expect(sheet).not.toHaveAttribute('data-journey-list','true');await expect(sheet.locator('.map-sheet-content')).toBeVisible();await expect(sheet.locator('.map-store-choice').first()).toBeVisible();expect(calls).toHaveLength(1);await layout(page);
});

for(const [width,height] of sizes)test(`drawer expansion stops at real purchase content without empty space at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height});await setup(page,request);const j=await mapJourney(page),sheet=page.locator('[data-mobile-store-sheet]'),handle=sheet.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true});
 for(let i=0;i<3&&await sheet.getAttribute('data-sheet-stop')!=='full';i++)await handle.click();await expect(sheet).toHaveAttribute('data-sheet-stop','full');
 const gap=()=>sheet.evaluate(el=>el.querySelector('.mobile-view-switch').getBoundingClientRect().top-el.querySelector('.mobile-map-journey').getBoundingClientRect().bottom);
 for(const [stage,action] of [['ready','بزن بریم'],['en_route','رسیدم به فروشگاه'],['arrived','خریدم؛ خرید انجام شد'],['done',null]]){
  await expect(j).toHaveAttribute('data-purchase-stage',stage);await expect.poll(gap).toBeLessThanOrEqual(4);
  const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,Math.max(8,box.y-150),{steps:5});await page.mouse.up();await expect(sheet).not.toHaveAttribute('data-sheet-stop','collapsed');await expect.poll(gap).toBeLessThanOrEqual(4);
  await screenshot(page,`content-fit-${stage}`);if(action)await j.getByRole('button',{name:action,exact:true}).click();
 }
 await layout(page);
});
