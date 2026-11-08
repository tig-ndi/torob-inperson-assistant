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
  await page.setViewportSize({width,height});await setup(page,request);let d=await details(page);await d.locator('.journey-more>summary').click();
  for(const [action,title] of [['وسیله و زمان حرکت','وسیله، مسیر و زمان رسیدن'],['بررسی فروشگاه‌های دیگر','فروشگاه‌های دیگر همین محصول'],['ذخیرهٔ برنامه','ذخیره و دانلود برنامهٔ خرید'],['ادامه در فرصتی دیگر','ادامهٔ خرید در فرصتی دیگر']]){
   d=page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true});await d.getByRole('button',{name:action,exact:true}).click();const child=page.getByRole('dialog',{name:title,exact:true});await expect(child).toBeVisible();await expect(child.locator('[data-overlay-panel]:visible')).toHaveCount(1);await child.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toBeVisible();await expect(d.locator('.journey-more')).toHaveAttribute('open','');
  }
  const action=d.getByRole('button',{name:'وسیله و زمان حرکت',exact:true});await action.scrollIntoViewIfNeeded();const parentScroll=await d.locator('.dialog-content').evaluate(e=>e.scrollTop);await action.click();await page.goBack();await expect(d).toBeVisible();await expect.poll(()=>d.locator('.dialog-content').evaluate(e=>e.scrollTop)).toBeCloseTo(parentScroll,0);await screenshot(page,'parent-return');await d.getByRole('button',{name:'بستن',exact:true}).click();await expect(page.getByRole('dialog',{name:'ادامهٔ همین خرید',exact:true})).toHaveCount(0);
 });
 test(`successful street routing closes settings and shows the route at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await setup(page,request);await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();const travel=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await expect(travel).toBeVisible();await travel.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();
  await expect(travel).toHaveCount(0);await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(page.locator('[data-map-route-state]')).toHaveAttribute('data-map-route-state','drawn');expect(f.roads.length).toBeGreaterThan(0);expect(f.calls).toHaveLength(1);
  let d=await details(page);await d.locator('.journey-more>summary').click();await d.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();const count=f.roads.length;await travel.getByRole('button',{name:'به‌روزرسانی مسیر خیابانی',exact:true}).click();await expect(travel).toHaveCount(0);expect(f.roads.length).toBeGreaterThan(count);await expect(page.locator('[data-map-route-state]')).toHaveAttribute('data-map-route-state','drawn');
  d=await details(page);await d.locator('.journey-more>summary').click();await d.getByRole('button',{name:'راهنمای مسیر خیابانی',exact:true}).click();const directions=page.getByRole('dialog',{name:'راهنمای مسیر خیابانی',exact:true});await expect(directions).toContainText('خیابان آزمایشی');await directions.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).click();await expect(d).toBeVisible();await screenshot(page,'route-return');
 });
 test(`stage tabs and real offline PNG download work at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();await page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'}).getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toHaveCount(0);
  let journey=await mapJourney(page);await journey.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','arrived');await journey.getByRole('button',{name:'رفتن به مرحلهٔ انتخاب مقصد',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','ready');await expect(journey.getByRole('button',{name:'رفتن به مرحلهٔ رسیدن',exact:true})).toBeDisabled();
  await journey.getByRole('button',{name:'بزن بریم',exact:true}).click();await journey.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await journey.getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','done');
  const d=await details(page);await expect(d.getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await d.getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toMatch(/\.png$/);await mkdir(output,{recursive:true});const path=join(output,`purchase-${width}.png`);await file.saveAs(path);const bytes=await readFile(path);expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(bytes.length).toBeGreaterThan(1000);await screenshot(page,'download');
  await d.getByRole('button',{name:'رفتن به مرحلهٔ حرکت',exact:true}).click();await expect(journey).toHaveAttribute('data-purchase-stage','en_route');
 });
}
test('failed street routing keeps the settings and explicit error available',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,request,{failure:true});await chat(page).getByRole('button',{name:'بزن بریم',exact:true}).click();const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن',exact:true});await d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true}).click();await expect(d).toContainText('خطای کنترل‌شدهٔ مسیر');await expect(d).toBeVisible();
});
