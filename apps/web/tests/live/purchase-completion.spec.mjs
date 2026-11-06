import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

async function fixture(page,request,{failure=false,prepare=true}={}){
 const calls=[],roads=[];await mockAssistant(page,request,calls,'هدفون');
 await page.route('**/api/local/arrival-checks',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{items:b.selections.map(s=>({...s,departure_at:'2026-11-04T12:00:00+03:30',arrival_at:'2026-11-04T12:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:'ready',inventory_status:'unconfirmed'})),limitations:[]}});});
 await page.route('**/api/local/road-routes',r=>{const b=r.request().postDataJSON();roads.push(b);return r.fulfill({json:{items:b.selections.map(s=>failure?{...s,status:'unavailable',reason:'سرویس مسیر قطع است'}:{...s,status:'ready',mode:b.mode,distance_meters:900,duration_seconds:600,endpoint_offset_meters:0,computed_at:'2026-11-04T12:00:00+03:30',geometry:{type:'LineString',coordinates:[[51.4,35.7],[51.401,35.7],[51.401,35.701]]},steps:[{name:'خیابان آزمایشی',type:'depart',modifier:'straight',distance_meters:900,duration_seconds:600}]})}});});
 await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();if(!prepare){await expect(page.locator('[data-offer]').first()).toBeVisible();return {calls,roads};}await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
 await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');await expect(chat(page).getByRole('button',{name:'بزن بریم',exact:true})).toBeEnabled();return {calls,roads};
}
const chat=page=>page.locator('.chat-pane .purchase-journey');
const map=page=>page.viewportSize().width>=1000?chat(page):page.locator('[data-mobile-journey]');
async function expandMapDrawer(page){
 if(page.viewportSize().width>=1000||!await page.locator('[data-map-panel]').isVisible())return;
 const sheet=page.locator('[data-mobile-store-sheet]');await expect(sheet).toBeVisible();
 if(await sheet.getAttribute('data-sheet-stop')==='collapsed')await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();
}
async function mapDetails(page){
 await expandMapDrawer(page);
 if(page.viewportSize().width>=1000)return chat(page);
 const more=page.getByRole('button',{name:'جزئیات این مرحله',exact:true});
 if(await more.count())await more.click();else await page.getByRole('button',{name:'ادامهٔ مراحل خرید',exact:true}).click();
 return page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true});
}
async function begin(page,panel=chat(page)){
 await expandMapDrawer(page);
 await panel.getByRole('button',{name:'بزن بریم',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await expect(d).toBeVisible();await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d.locator('.route-total')).toBeVisible();await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','en_route');await expandMapDrawer(page);
}
for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])test(`map leads from selected shop to a definite purchase ending at ${width}x${height}`,async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});const f=await fixture(page,request);
 await expect(chat(page)).toContainText('موجودی هنوز تأیید نشده');await expect(page.locator('.quick-replies')).toHaveCount(0);
 await chat(page).getByRole('button',{name:'نتیجهٔ تماس یا بررسی خودم',exact:true}).click();await chat(page).getByRole('button',{name:'بله، موجود بود',exact:true}).click();await expect(chat(page)).toContainText('طبق گزارش تو، کالا موجود است');
 if(width<1000)await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 const startPanel=width<1000?map(page):chat(page);await begin(page,startPanel);
 await expect(map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true})).toBeVisible();await expect(width<1000?map(page):page.locator('.map-topbar')).toContainText('۱۰ دقیقه');const detail=await mapDetails(page);await expect(detail).toContainText('موقعیت زنده دنبال نمی‌شود');if(width<1000)await detail.getByRole('button',{name:'بستن',exact:true}).click();
 await page.reload();await expect(map(page)).toHaveAttribute('data-purchase-stage','en_route');await expandMapDrawer(page);
 await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');
 await page.screenshot({path:`../../.local/purchase-arrived-${width}.png`});
 await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expect(map(page)).toContainText('این خرید تمام است');await expect(map(page).getByRole('button',{name:'بزن بریم',exact:true})).toHaveCount(0);
 await page.reload();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expandMapDrawer(page);await expect(map(page)).toContainText('خریدت انجام شد');await page.screenshot({path:`../../.local/purchase-done-${width}.png`});
 await map(page).getByRole('button',{name:/^(?:شروع یک )?خرید تازه$/}).click();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','home');await expect(chat(page)).toHaveCount(0);await layout(page);expect(errors).toEqual([]);expect(f.calls).toHaveLength(1);
});
test('chat commands share map progress and completion without more model calls',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await begin(page);await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await send(page,'رسیدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','arrived');await send(page,'خریدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','done');expect(f.calls).toHaveLength(1);await layout(page);
});
test('unavailable shop offers the same purchase alternatives on the map',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);await begin(page);await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/followups/alternatives'));const details=await mapDetails(page);await details.getByRole('button',{name:'موجود نبود',exact:true}).click();await response;await expect(map(page)).toHaveAttribute('data-purchase-stage','problem');const options=await mapDetails(page);await expect(options).toContainText('کالا موجود نبود');
 const alternatives=options.locator('.journey-alternatives button');await expect(alternatives.first()).toBeVisible();
 if(!await options.getByText('با این شرایط جایگزینی پیدا نشد؛', {exact:false}).count()){await alternatives.first().click();await expect(map(page)).toHaveAttribute('data-purchase-stage','ready');await expect(page.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','ready');}
 await layout(page);
});
test('postponing preserves destination and cancellation is a distinct ending',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);const id=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id);await chat(page).locator('.journey-more>summary').click();const saving=page.waitForResponse(r=>r.url().endsWith('/api/local/trips')&&r.request().method()==='POST');await chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true}).click();const saved=await(await saving).json();await expect(chat(page)).toContainText('در برنامه‌های قبلی ذخیره شد');await request.delete('/api/local/trips/'+saved.id);await expect(chat(page)).toContainText('فعلاً اقدامی لازم نیست');await page.reload();await chat(page).getByRole('button',{name:'ادامهٔ همین خرید',exact:true}).click();await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id)).toBe(id);await send(page,'منصرف شدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','done');await expect(chat(page)).toContainText('بدون ثبت خرید');await layout(page);
});
test('failed road service never claims street guidance or blocks reporting arrival',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request,{failure:true});await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d).toContainText('سرویس مسیر قطع است');await d.getByRole('button',{name:'بستن',exact:true}).click();const info=await mapDetails(page);await expect(info).toContainText('مسیر خیابانی هنوز آماده نیست');await info.getByRole('button',{name:'بستن',exact:true}).click();await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');const outcome=await mapDetails(page);await outcome.getByRole('button',{name:'نخریدم؛ مراجعه را تمام کنیم',exact:true}).click();await expect(map(page)).toContainText('بدون ثبت خرید');
});

test.describe('touch-only completion',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 test('the map supports starting, arrival and purchase with touch after scrolling',async({page,request})=>{
  await fixture(page,request);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).tap();await expandMapDrawer(page);await map(page).getByRole('button',{name:'بزن بریم',exact:true}).tap();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).tap();await expect(d.locator('.route-total')).toBeVisible();await d.getByRole('button',{name:'بستن',exact:true}).tap();await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).tap();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).tap();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await map(page).getByRole('button',{name:/^(?:شروع یک )?خرید تازه$/}).tap();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','home');
 });
});

test('a pre-departure unavailable report survives refresh with alternatives and blocks departure',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await send(page,'این فروشگاه موجود نبود، جایگزین پیدا کن');await expect(chat(page)).toHaveAttribute('data-purchase-stage','problem');await expect(chat(page).getByRole('button',{name:'بزن بریم',exact:true})).toHaveCount(0);await expect(chat(page).locator('.journey-alternatives button').first()).toBeVisible();await page.reload();await expect(chat(page)).toHaveAttribute('data-purchase-stage','problem');await expect(chat(page).locator('.journey-alternatives button').first()).toBeVisible();expect(f.calls).toHaveLength(1);expect(f.roads).toHaveLength(0);
});

test('starting a scheduled visit rechecks the actual current departure before leaving',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await chat(page).locator('.journey-more>summary').click();await chat(page).getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'});await d.getByRole('combobox',{name:'ساعت حرکت: ساعت',exact:true}).selectOption('23');await d.getByRole('combobox',{name:'ساعت حرکت: دقیقه',exact:true}).selectOption('30');await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(chat(page).getByRole('button',{name:'بزن بریم',exact:true})).toBeEnabled();
 await page.route('**/api/local/arrival-checks',r=>{const b=r.request().postDataJSON();if(b.local_time)return r.fallback();return r.fulfill({json:{items:b.selections.map(s=>({...s,departure_at:'2026-11-04T12:00:00+03:30',arrival_at:'2026-11-04T12:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_closed',arrival_status:'declared_closed',margin_status:'declared_closed',margin_minutes:10,risk:'closed',inventory_status:'unconfirmed'})),limitations:[]}});});
 await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');await expect(chat(page).locator('[data-visit-safety]')).toContainText('برای این زمان راه نیفت');await expect(chat(page).getByRole('button',{name:'بزن بریم',exact:true})).toBeDisabled();expect(f.roads).toHaveLength(0);
});

test('selecting a shop on the map continues through purchase without returning to chat',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request,{prepare:false});await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expandMapDrawer(page);await page.locator('.map-store-choice').first().click();await page.getByRole('button',{name:'بررسی و شروع خرید از این فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','ready');await begin(page,map(page));await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expect(page.locator('[data-map-panel]')).toBeVisible();expect(f.calls).toHaveLength(1);
});

for(const width of [1024,1440])test(`desktop shows one journey card and leaves the map destination unobscured at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});await fixture(page,request);await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await expect(page.locator('.purchase-journey')).toHaveCount(1);await expect(page.locator('[data-map-panel] .purchase-journey')).toHaveCount(0);await expect(page.locator('[data-mobile-journey],[data-mobile-store-sheet]')).toHaveCount(0);const pin=page.locator('.real-pin.chosen'),chatPane=page.locator('.chat-pane');
 await expect.poll(async()=>{const [p,c]=await Promise.all([pin.boundingBox(),chatPane.boundingBox()]);return !!p&&p.x>=0&&p.x+p.width<c.x&&p.y>90&&p.y+p.height<880;}).toBe(true);
 await page.screenshot({path:`../../.local/purchase-desktop-focus-${width}.png`});await layout(page);
});

test('postponement does not claim a saved ending when local storage fails',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);await page.route('**/api/local/trips',r=>r.request().method()==='POST'?r.fulfill({status:500,json:{detail:'ذخیرهٔ آزمایشی ناموفق بود'}}):r.continue());await chat(page).locator('.journey-more>summary').click();await chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ذخیرهٔ آزمایشی ناموفق بود');await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');await expect(chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true})).toBeEnabled();
});

for(const width of [320,390,1024,1440])test(`journey steps expose transport and a contextual back action without duplicate desktop panels at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:width===320?568:900});const f=await fixture(page,request);const panel=chat(page),steps=panel.getByRole('list',{name:'مراحل مراجعه'}),modes=panel.getByRole('group',{name:'وسیلهٔ رفتن'});
 await expect(steps.locator('li')).toHaveCount(4);for(const step of await steps.locator('li').all())await expect(step.locator('svg')).toHaveCount(1);
 await expect(modes.getByRole('button',{name:'پیاده',exact:true})).toHaveAttribute('aria-pressed','true');const selected=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id);
 await modes.getByRole('button',{name:'خودرو',exact:true}).click();await expect(modes.getByRole('button',{name:'خودرو',exact:true})).toHaveAttribute('aria-pressed','true');
 await panel.getByRole('button',{name:'تنظیم زمان حرکت و جزئیات مسیر',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'});await expect(d.getByRole('button',{name:'خودرو',exact:true})).toHaveAttribute('aria-pressed','true');await d.getByRole('button',{name:'دوچرخه',exact:true}).click();await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(modes.getByRole('button',{name:'دوچرخه',exact:true})).toHaveAttribute('aria-pressed','true');expect(f.roads).toHaveLength(0);
 if(width>=1000){await expect(page.locator('.purchase-journey')).toHaveCount(1);await expect(page.locator('[data-map-panel] .purchase-journey')).toHaveCount(0);}
 await expect.poll(async()=>{const nav=await panel.locator('.journey-step-nav').boundingBox(),scroll=await page.locator('[data-chat-scroll]').boundingBox();return nav.y>=scroll.y-1&&nav.y+nav.height<=scroll.y+scroll.height+1;}).toBe(true);await page.screenshot({path:`../../.local/journey-controls-${width}.png`});await panel.getByRole('button',{name:'بازگشت به انتخاب فروشگاه',exact:true}).click();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','stores');expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id)).toBe(selected);await layout(page);expect(f.calls).toHaveLength(1);
});
for(const width of [390,1440])test(`back follows each visit stage and lets the user correct a completion at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});const f=await fixture(page,request);await begin(page);const panel=map(page),selected=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id);
 await panel.getByRole('button',{name:'بازگشت به آماده‌شدن',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','ready');await panel.getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','en_route');
 await panel.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await panel.getByRole('button',{name:'بازگشت به مسیر',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','en_route');
 await panel.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await panel.getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','done');await panel.getByRole('button',{name:'بازگشت برای اصلاح نتیجه',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','arrived');await expect(panel.locator('[data-completed-visit]')).toHaveCount(0);
 await page.reload();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id)).toBe(selected);expect(f.calls).toHaveLength(1);await layout(page);
});
