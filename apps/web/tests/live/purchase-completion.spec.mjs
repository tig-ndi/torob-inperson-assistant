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
const map=page=>page.locator('[data-map-panel] .purchase-journey');
async function begin(page,panel=chat(page)){
 await panel.getByRole('button',{name:'بزن بریم',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await expect(d).toBeVisible();await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d.locator('.route-total')).toBeVisible();await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','en_route');
}
for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])test(`map leads from selected shop to a definite purchase ending at ${width}x${height}`,async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});const f=await fixture(page,request);
 await expect(chat(page)).toContainText('موجودی هنوز تأیید نشده');await expect(page.locator('.quick-replies')).toHaveCount(0);
 await chat(page).getByRole('button',{name:'نتیجهٔ تماس یا بررسی خودم',exact:true}).click();await chat(page).getByRole('button',{name:'بله، موجود بود',exact:true}).click();await expect(chat(page)).toContainText('طبق گزارش تو، کالا موجود است');
 if(width<1000)await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 const startPanel=width<1000?map(page):chat(page);await begin(page,startPanel);
 await expect(map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true})).toBeVisible();await expect(map(page)).toContainText('حدود ۱۰ دقیقه');await expect(map(page)).toContainText('موقعیت زنده دنبال نمی‌شود');
 await page.reload();await expect(map(page)).toHaveAttribute('data-purchase-stage','en_route');
 await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');
 await page.screenshot({path:`../../.local/purchase-arrived-${width}.png`});
 await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expect(map(page)).toContainText('کار این خرید تمام است');await expect(map(page).getByRole('button',{name:'بزن بریم',exact:true})).toHaveCount(0);
 await page.reload();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expect(map(page)).toContainText('خریدت انجام شد');await page.screenshot({path:`../../.local/purchase-done-${width}.png`});
 await map(page).getByRole('button',{name:'شروع یک خرید تازه',exact:true}).click();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','home');await expect(chat(page)).toHaveCount(0);await layout(page);expect(errors).toEqual([]);expect(f.calls).toHaveLength(1);
});
test('chat commands share map progress and completion without more model calls',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await begin(page);await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await send(page,'رسیدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','arrived');await send(page,'خریدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','done');expect(f.calls).toHaveLength(1);await layout(page);
});
test('unavailable shop offers the same purchase alternatives on the map',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);await begin(page);await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/followups/alternatives'));await map(page).getByRole('button',{name:'موجود نبود',exact:true}).click();await response;await expect(map(page)).toHaveAttribute('data-purchase-stage','problem');await expect(map(page)).toContainText('کالا موجود نبود');
 const alternatives=map(page).locator('.journey-alternatives button');await expect(alternatives.first()).toBeVisible();
 if(!await map(page).getByText('با این شرایط جایگزینی پیدا نشد؛', {exact:false}).count()){await alternatives.first().click();await expect(map(page)).toHaveAttribute('data-purchase-stage','ready');await expect(map(page)).toContainText('موجودی هنوز تأیید نشده');}
 await layout(page);
});
test('postponing preserves destination and cancellation is a distinct ending',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);const id=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id);await chat(page).locator('.journey-more>summary').click();const saving=page.waitForResponse(r=>r.url().endsWith('/api/local/trips')&&r.request().method()==='POST');await chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true}).click();const saved=await(await saving).json();await expect(chat(page)).toContainText('در برنامه‌های قبلی ذخیره شد');await request.delete('/api/local/trips/'+saved.id);await expect(chat(page)).toContainText('فعلاً اقدامی لازم نیست');await page.reload();await chat(page).getByRole('button',{name:'ادامهٔ همین خرید',exact:true}).click();await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')).offer_id)).toBe(id);await send(page,'منصرف شدم');await expect(chat(page)).toHaveAttribute('data-purchase-stage','done');await expect(chat(page)).toContainText('بدون ثبت خرید');await layout(page);
});
test('failed road service never claims street guidance or blocks reporting arrival',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request,{failure:true});await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d).toContainText('سرویس مسیر قطع است');await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(map(page)).toContainText('مسیر خیابانی هنوز آماده نیست');await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');await map(page).getByRole('button',{name:'نخریدم؛ مراجعه را تمام کنیم',exact:true}).click();await expect(map(page)).toContainText('بدون ثبت خرید');
});

test.describe('touch-only completion',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 test('the map supports starting, arrival and purchase with touch after scrolling',async({page,request})=>{
  await fixture(page,request);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).tap();await map(page).getByRole('button',{name:'بزن بریم',exact:true}).tap();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).tap();await expect(d.locator('.route-total')).toBeVisible();await d.getByRole('button',{name:'بستن',exact:true}).tap();await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).tap();await expect(map(page)).toHaveAttribute('data-purchase-stage','arrived');await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).tap();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await map(page).getByRole('button',{name:'شروع یک خرید تازه',exact:true}).tap();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','home');
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
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request,{prepare:false});await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await page.locator('.map-store-choice').first().click();await page.getByRole('button',{name:'بررسی و شروع خرید از این فروشگاه',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','ready');await begin(page,map(page));await map(page).getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await map(page).getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(map(page)).toHaveAttribute('data-purchase-stage','done');await expect(page.locator('[data-map-panel]')).toBeVisible();expect(f.calls).toHaveLength(1);
});

for(const width of [1024,1440])test(`desktop journey card leaves the selected map destination unobscured at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});await fixture(page,request);await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});const pin=page.locator('.real-pin.chosen'),panel=page.locator('.map-journey-panel'),chatPane=page.locator('.chat-pane');
 await expect.poll(async()=>{const [p,j,c]=await Promise.all([pin.boundingBox(),panel.boundingBox(),chatPane.boundingBox()]);return !!p&&p.x>j.x+j.width+8&&p.x+p.width<c.x&&p.y>90&&p.y+p.height<880;}).toBe(true);
 await page.screenshot({path:`../../.local/purchase-desktop-focus-${width}.png`});await layout(page);
});

test('postponement does not claim a saved ending when local storage fails',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);await page.route('**/api/local/trips',r=>r.request().method()==='POST'?r.fulfill({status:500,json:{detail:'ذخیرهٔ آزمایشی ناموفق بود'}}):r.continue());await chat(page).locator('.journey-more>summary').click();await chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ذخیرهٔ آزمایشی ناموفق بود');await expect(chat(page)).toHaveAttribute('data-purchase-stage','ready');await expect(chat(page).getByRole('button',{name:'ادامه در فرصتی دیگر',exact:true})).toBeEnabled();
});
