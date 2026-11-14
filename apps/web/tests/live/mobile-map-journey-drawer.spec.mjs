import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test.use({isMobile:true,hasTouch:true});
const sizes=[[320,568],[360,640],[390,844],[844,390]];
const output=join(tmpdir(),'torob-map-drawer-20261114');

// Restore an already-running visit. No chat messages or model requests are needed.
async function restoreVisit(page,request){
 const products=await(await request.get('/api/products?q='+encodeURIComponent('هدفون')+'&limit=1')).json();
 const product=products.items[0];expect(product).toBeTruthy();
 const offers=await(await request.get(`/api/products/${product.product_id}/offers?user_lat=35.7&user_lon=51.4`)).json();
 const selected={...offers.items[0],shop:{...offers.items[0].shop,name:'فروشگاه نمونه',address:'خیابان جمهوری، ساختمان نمونه، طبقهٔ دوم، واحد ۲۳۲'}};
 const prepared=await(await request.post('/api/followups/prepare',{data:{product_id:product.product_id,offer_id:selected.offer_id,shop_id:selected.shop_id}})).json();
 let agentCalls=0;
 await page.route('**/api/assistant/turn',r=>{agentCalls++;return r.abort();});
 await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:false,reason:'disabled',remaining_calls:0}}));
 await page.route('**/api/voice/**',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 for(const ep of ['checks','trips','followups'])await page.route(`**/api/local/${ep}**`,r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
 await page.route('**/api/followups/prepare',r=>r.fulfill({json:{...prepared,selected_offer:selected}}));
 await page.route('**/api/local/arrival-checks',r=>r.fulfill({json:{items:r.request().postDataJSON().selections.map(s=>({...s,departure_at:'2026-11-14T10:00:00+03:30',arrival_at:'2026-11-14T10:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:'ready',inventory_status:'unconfirmed'})),limitations:[]}}));
 await page.route('**/api/local/road-routes',r=>r.fulfill({json:{items:[]}}));
 await page.addInitScript(({product,selected,offers})=>{
  const values={screen:'trip',product,selected,offers:offers.items,mapLibrary:offers.items,knownProducts:{[product.product_id]:product},query:'هدفون',mapMode:'open',theme:'dark',position:{lat:35.7,lon:51.4,label:'موقعیت آزمایشی',source:'manual',accuracyMeters:null},purchaseProgress:{offerId:selected.offer_id,stage:'en_route',startedAt:'2026-11-14T06:30:00Z',finishedAt:null,result:null,problem:null,evidence:null}};
  for(const [key,value] of Object.entries(values))sessionStorage.setItem('inperson-journey:v2:'+key,JSON.stringify(value));
 },{product,selected,offers});
 await page.goto('/');await expect(page.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','en_route');
 return ()=>agentCalls;
}

async function swipe(page,handle,direction){
 const box=await handle.boundingBox(),viewport=page.viewportSize();
 const x=box.x+box.width/2,start=box.y+box.height/2;
 const end=direction==='up'?Math.max(74,start-viewport.height*.65):Math.min(viewport.height-8,start+viewport.height*.65);
 const session=await page.context().newCDPSession(page);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
 for(let i=1;i<=10;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/10}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}

for(const [width,height] of sizes){
 test(`map drawer has a clear grip and the full purchase flow at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const agentCalls=await restoreVisit(page,request);
  const sheet=page.locator('[data-mobile-store-sheet]'),handle=sheet.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true});
  await expect(handle).toBeVisible();const grip=await handle.boundingBox();
  expect(grip.width).toBeGreaterThanOrEqual(width*.9);expect(grip.height).toBeGreaterThanOrEqual(44);
  await handle.tap();await expect(sheet).toHaveAttribute('data-sheet-stop','full');
  const flow=sheet.locator('.purchase-journey');await expect(flow).toHaveAttribute('data-purchase-stage','en_route');
  await expect(sheet.locator('.map-sheet-address')).toContainText('واحد ۲۳۲');
  await expect(flow.getByRole('navigation',{name:'قدم‌های خرید',exact:true})).toBeVisible();
  await swipe(page,handle,'down');await expect(sheet).not.toHaveAttribute('data-sheet-stop','full');
  await page.waitForTimeout(300);await swipe(page,handle,'up');await expect(sheet).toHaveAttribute('data-sheet-stop','full');
  await sheet.getByRole('button',{name:'دیدن فروشگاه‌های دیگر',exact:true}).tap();
  const shops=page.getByRole('dialog',{name:'فروشگاه‌های دیگر همین محصول',exact:true});await expect(shops).toBeVisible();
  await shops.getByRole('button',{name:'بازگشت به صفحهٔ قبلی',exact:true}).tap();await expect(shops).toHaveCount(0);
  await expect(sheet).toHaveAttribute('data-sheet-stop','full');
  await flow.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).tap();await expect(flow).toHaveAttribute('data-purchase-stage','arrived');
  await expect(flow.getByRole('button',{name:'بسته بود',exact:true})).toBeVisible();
  await flow.getByText('راهنمای پیدا کردن ورودی فروشگاه',{exact:true}).tap();await expect(flow.locator('.indoor-guide')).toContainText('۲۳۲');
  await flow.getByRole('button',{name:'خریدم؛ خرید انجام شد',exact:true}).tap();await expect(flow).toHaveAttribute('data-purchase-stage','done');
  await expect(flow.getByRole('button',{name:'دانلود تصویر خلاصهٔ خرید',exact:true})).toBeVisible();
  await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`purchase-flow-${width}.png`)});
  await flow.getByRole('button',{name:'بازگشت برای اصلاح نتیجه',exact:true}).tap();await expect(flow).toHaveAttribute('data-purchase-stage','arrived');
  await flow.getByRole('button',{name:'رفتن به مرحلهٔ انتخاب مقصد',exact:true}).tap();await expect(flow).toHaveAttribute('data-purchase-stage','ready');
  await flow.getByRole('button',{name:'خودرو',exact:true}).tap();await expect(flow.getByRole('button',{name:'خودرو',exact:true})).toHaveAttribute('aria-pressed','true');
  await flow.getByRole('button',{name:'بزن بریم',exact:true}).tap();await expect(flow).toHaveAttribute('data-purchase-stage','en_route');
  await sheet.getByRole('button',{name:'برگشت به فهرست فروشگاه‌ها',exact:true}).tap();await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(sheet.locator('.map-sheet-content')).toBeVisible();
  expect(agentCalls()).toBe(0);
 });

 test(`map information icon stays centered and its sources remain accessible at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const agentCalls=await restoreVisit(page,request);
  const summary=page.locator('.map-credit>summary');await expect(summary).toBeVisible();
  const centers=await summary.evaluate(el=>{const parent=el.getBoundingClientRect(),icon=el.querySelector('svg').getBoundingClientRect();return {width:parent.width,height:parent.height,dx:Math.abs(parent.x+parent.width/2-icon.x-icon.width/2),dy:Math.abs(parent.y+parent.height/2-icon.y-icon.height/2)};});
  expect(centers.width).toBeGreaterThanOrEqual(44);expect(centers.height).toBeGreaterThanOrEqual(44);expect(centers.dx).toBeLessThan(1);expect(centers.dy).toBeLessThan(1);
  const frame=await page.locator('.map-credit').boundingBox();const button=await summary.boundingBox();expect(Math.abs(frame.x+frame.width/2-button.x-button.width/2)).toBeLessThan(1);
  await summary.tap();await expect(page.locator('.map-credit').getByRole('link',{name:'OpenStreetMap',exact:true})).toBeVisible();
  await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`map-sources-${width}.png`)});expect(agentCalls()).toBe(0);
 });
}
