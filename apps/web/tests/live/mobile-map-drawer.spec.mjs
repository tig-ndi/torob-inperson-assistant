import {test,expect} from '@playwright/test';
import {mockAssistant} from './helpers.mjs';

const map=page=>page.locator('[data-map-panel]');
const selected=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:selected')??'null'));
async function start(page,position=true){
 await page.goto('/');await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();
 if(position){await map(page).locator('[data-mobile-map-header]').getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByText('ورود دقیق مختصات',{exact:true}).click();await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();}
 await page.getByRole('textbox',{name:'پیام به دستیار روی نقشه',exact:true}).fill('گوشی می‌خواهم');await page.getByRole('button',{name:'ارسال پیام روی نقشه',exact:true}).click();
}
async function offersFixture(page,request,{unknown=false}={}){
 const products=await mockAssistant(page,request);const product=products.items.find(p=>p.offer_summary.offer_count>1);expect(product).toBeTruthy();
 const offers=await(await request.get(`/api/products/${product.product_id}/offers`)).json();expect(offers.items.length).toBeGreaterThan(1);
 products.items=[product];
 const far=structuredClone(offers.items[0]),near=structuredClone(offers.items[1]);
 far.shop.lat=unknown?null:35.74;far.shop.lon=unknown?null:51.46;near.shop.lat=unknown?null:35.7001;near.shop.lon=unknown?null:51.4001;
 await page.route('**/api/products/*/offers?*',route=>route.fulfill({json:{...offers,items:[far,near],has_more:false}}));
 // The draft endpoint must describe the same fixture shop as the offer map;
 // otherwise a real coordinate from the snapshot invalidates camera assertions.
 await page.route('**/api/followups/prepare',async route=>{
  const response=await route.fetch(),data=await response.json(),input=route.request().postDataJSON();
  const row=[far,near].find(o=>o.offer_id===input.offer_id);if(row)data.selected_offer=row;
  await route.fulfill({json:data});
 });
 return {far,near};
}

for(const width of [320,390])test(`thin map bar reports thinking, selects the nearest result, and keeps stages inside its drawer at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:'dark'});const {near,far}=await offersFixture(page,request);
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/assistant/turn',async route=>{await gate;await route.fallback();});
 await start(page);
 const input=page.getByRole('textbox',{name:'پیام به دستیار روی نقشه',exact:true});await expect(input).toHaveAttribute('placeholder','در حال فکر کردن…');
 await expect(map(page).locator('.map-message-form')).toContainText('در حال فکر کردن…');release();
 await expect.poll(async()=>(await selected(page))?.offer_id).toBe(near.offer_id);
 await expect(map(page).locator('.map-result-notice')).toContainText('نزدیک‌ترین پیشنهاد');
 await expect(map(page).locator('.map-result-notice')).toContainText('جزئیات بیشتر در گفت‌وگو');
 const row=map(page).locator('.map-message-form'),header=map(page).locator('[data-mobile-map-header]');
 await expect(header.locator('.map-header-tools,.map-header-hint,.map-location-shortcut')).toHaveCount(0);
 const inputBox=await input.boundingBox(),replyBox=await row.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).boundingBox(),chatBox=await row.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).boundingBox();
 expect(Math.abs(replyBox.y-chatBox.y)).toBeLessThan(2);expect(Math.abs(inputBox.y-replyBox.y)).toBeLessThan(8);
 // Manual selection must remain the user's choice after automatic focusing.
 await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await map(page).locator(`[data-map-choice="${far.offer_id}"]`).click();
 await input.fill('پیش‌نویس بعدی');await expect.poll(async()=>(await selected(page))?.offer_id).toBe(far.offer_id);
 await page.getByRole('button',{name:'بررسی و شروع خرید از این فروشگاه',exact:true}).click();
 const journey=map(page).locator('[data-mobile-store-sheet] [data-mobile-journey]');await expect(journey).toBeVisible();await expect(map(page).locator(':scope>[data-mobile-journey]')).toHaveCount(0);
 expect((await header.boundingBox()).height).toBeLessThanOrEqual(56);
 await expect(journey.getByRole('list',{name:'مراحل مراجعه'}).locator('li')).toHaveCount(4);
 expect(await journey.locator('[aria-current=step] span').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12);
 await page.getByRole('button',{name:'جمع کردن فهرست برای دیدن کامل نقشه',exact:true}).click();await expect(journey).toBeHidden();
 // The always-visible destination address adds its measured height to the 92px chrome.
 await expect(map(page).locator('[data-mobile-store-sheet]')).toHaveAttribute('data-sheet-stop','collapsed');
 await expect.poll(async()=>{const sheet=map(page).locator('[data-mobile-store-sheet]');return sheet.evaluate(el=>Math.round(el.getBoundingClientRect().height)-Math.ceil(el.querySelector('.map-sheet-address')?.getBoundingClientRect().height??0)-Math.round(parseFloat(getComputedStyle(el).paddingBottom)||0));}).toBe(92);
 await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(journey).toBeVisible();
 await journey.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toBeVisible();await page.getByRole('button',{name:'بستن',exact:true}).click();
 await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 const chosen=map(page).locator('.real-pin.chosen');
 await expect.poll(async()=>{const [pin,credit]=await Promise.all([chosen.boundingBox(),map(page).locator('.map-credit').boundingBox()]);return !!pin&&!!credit&&pin.y+pin.height<credit.y;}).toBe(true);
 expect(await chosen.evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.real-pin')===e;})).toBe(true);
 await page.screenshot({path:`../../.local/live-qa/mobile-drawer-compact-${width}.png`});
});

test('missing coordinates do not produce a false nearest-store selection',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await offersFixture(page,request,{unknown:true});await start(page);
 await expect(map(page).locator('[data-map-product]')).toHaveCount(1);await expect(map(page).locator('.map-result-notice')).toContainText('نتایج آماده‌اند');expect(await selected(page)).toBeNull();
});

test('a search without a starting position asks for location instead of inventing nearest',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const {near,far}=await offersFixture(page,request);await start(page,false);
 await expect(map(page).locator('.map-result-notice')).toContainText('موقعیت جست‌وجو را تعیین کن');expect(await selected(page)).toBeNull();
 await map(page).locator('[data-mobile-map-header]').getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByText('ورود دقیق مختصات',{exact:true}).click();await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();
 await expect.poll(async()=>(await selected(page))?.offer_id).toBe(near.offer_id);await expect(map(page).locator('.map-result-notice')).toContainText('نزدیک‌ترین');
 // Once set, the shortcut leaves the thin header; changing location remains in the drawer.
 await map(page).locator('.map-sheet-heading').getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByText('ورود دقیق مختصات',{exact:true}).click();await page.getByLabel('عرض جغرافیایی').fill('35.701');await page.getByLabel('طول جغرافیایی').fill('51.401');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();await expect.poll(async()=>(await selected(page))?.direct_distance_meters).toBeGreaterThan(100);expect((await selected(page)).offer_id).toBe(near.offer_id);
 await map(page).locator('.map-sheet-heading').getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByText('ورود دقیق مختصات',{exact:true}).click();await page.getByLabel('عرض جغرافیایی').fill('35.74');await page.getByLabel('طول جغرافیایی').fill('51.46');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();await expect.poll(async()=>(await selected(page))?.offer_id).toBe(far.offer_id);
});
