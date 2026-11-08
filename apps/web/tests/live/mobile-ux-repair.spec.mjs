import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mockAssistant,send} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

const output=join(tmpdir(),'torob-ux-repair-20261107');
const sizes=[[360,640],[390,844],[320,568],[844,390]];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const stored=page=>page.evaluate(()=>Object.fromEntries(['thread','filters','position','selected','models','visit'].map(key=>[key,sessionStorage.getItem('inperson-journey:v2:'+key)])));
async function menu(page,label){await page.locator('.mobile-header-menu > summary').click();await page.getByRole('button',{name:label,exact:true}).click();await settle(page);}
async function picture(page,name){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`after-${name}-${page.viewportSize().width}.png`)});}
async function setup(page,request,prepareProducts){
  // No paid model, seller writes, saved plans or ledger changes in this suite.
  await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
  await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
  await page.route('**/api/local/catalogue-context',r=>r.fulfill({json:{budget:null,products:{}}}));
  await page.route('**/api/local/followups',r=>r.abort());
  const calls=[],products=await mockAssistant(page,request,calls,'هدفون');
  if(prepareProducts)await prepareProducts(products);
  await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');
  await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();await settle(page);
  return {calls,products};
}

for(const [width,height] of sizes){
 test(`Back closes layers, consumes X entries and preserves context at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);
  const state=await stored(page);
  const resultBack=await page.locator('.tool-heading button').first().boundingBox();expect(resultBack.width).toBeGreaterThanOrEqual(44);expect(resultBack.height).toBeGreaterThanOrEqual(44);
  await writeFile(join(output,`navigation-${width}.json`),JSON.stringify({historyLength:await page.evaluate(()=>history.length),resultBack},null,2));
  await menu(page,'شرایط خرید');await page.getByRole('button',{name:'بستن',exact:true}).click();await settle(page);
  await menu(page,'برنامه‌ها و نتایج قبلی');await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await settle(page);
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
  const summary=page.locator('.product-results details > summary').first();await summary.click();await expect(summary.locator('..')).toHaveAttribute('open','');await settle(page);
  await page.goBack();await expect(summary.locator('..')).not.toHaveAttribute('open','');
  expect(await stored(page)).toEqual(state);
  await page.goBack();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','home');
  await picture(page,'back-root');await settle(page);await page.goBack();expect(page.url()).toBe('about:blank');
 });
 test(`filter footer and drafts respect apply, dismissal and short viewport at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});await setup(page,request);const initial=await stored(page);
  for(const dismiss of ['x','outside','escape','back']){
   await menu(page,'شرایط خرید');const d=page.getByRole('dialog',{name:'شرایط خرید'});
   const button=await d.getByRole('button',{name:'اعمال فیلترها',exact:true}).boundingBox();expect(button.y).toBeGreaterThan(0);expect(button.y+button.height).toBeLessThanOrEqual(height+1);
   if(dismiss==='x')await writeFile(join(output,`filter-${width}.json`),JSON.stringify({width,height,apply:button},null,2));
   await d.getByLabel('ساعت مراجعه: ساعت',{exact:true}).selectOption('10');await d.getByLabel('حداکثر قیمت (تومان)',{exact:true}).fill('20000000');
   if(dismiss==='x')await d.getByRole('button',{name:'بستن',exact:true}).click();else if(dismiss==='outside')await page.mouse.click(3,3);else if(dismiss==='escape')await page.keyboard.press('Escape');else await page.goBack();
   await expect(d).toHaveCount(0);await settle(page);expect(await stored(page)).toEqual(initial);
  }
  await menu(page,'شرایط خرید');await page.getByLabel('ساعت مراجعه: ساعت',{exact:true}).selectOption('10');await page.getByLabel('ساعت مراجعه: دقیقه',{exact:true}).selectOption('00');await page.getByLabel('حداکثر قیمت (تومان)',{exact:true}).fill('20000000');
  await picture(page,'filter-footer');await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await stored(page)).visit)?.localTime).toBe('10:00');expect(JSON.parse((await stored(page)).filters).max).toBe('20000000');
  await menu(page,'شرایط خرید');await page.getByRole('button',{name:'بررسی برای همین الان',exact:true}).click();await page.getByRole('button',{name:'بستن',exact:true}).click();expect(JSON.parse((await stored(page)).visit).localTime).toBe('10:00');
  await menu(page,'شرایط خرید');await page.setViewportSize({width,height:Math.min(360,height)});
  const input=page.getByLabel('حداکثر قیمت (تومان)',{exact:true});await input.focus();await input.scrollIntoViewIfNeeded();
  const box=await input.boundingBox(),footer=await page.locator('.filter-sheet-actions').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(footer.y+1);
  const apply=await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).boundingBox();expect(apply.y+apply.height).toBeLessThanOrEqual(361);
 });
 test(`fresh conversation confirms and map controls have labelled touch areas at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const {calls}=await setup(page,request);const initial=await stored(page);
  await menu(page,'گفت‌وگوی تازه');await expect(page.getByRole('alertdialog',{name:'شروع گفت‌وگوی تازه؟'})).toBeVisible();await page.goBack();await expect(page.getByRole('alertdialog')).toHaveCount(0);expect(await stored(page)).toEqual(initial);await settle(page);
  await menu(page,'گفت‌وگوی تازه');await page.getByRole('button',{name:'انصراف، نگهش دار',exact:true}).click();expect(await stored(page)).toEqual(initial);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(page.locator('[data-mobile-store-sheet]')).toHaveAttribute('data-sheet-stop','collapsed');
  const back=page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true});await expect(back).toContainText('چت');
  const bounds=await page.locator('.map-message-form button').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),w:r.width,h:r.height,x:r.x,right:r.right};}));
  for(const box of bounds){expect(box.w,box.label).toBeGreaterThanOrEqual(44);expect(box.h,box.label).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);}
  const input=await page.getByRole('textbox',{name:'پیام به دستیار روی نقشه'}).boundingBox();expect(input.width).toBeGreaterThan(40);
  await expect.poll(async()=>(await stored(page)).selected).not.toBe('null');const mapState=await stored(page);
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(page.locator('[data-mobile-store-sheet]')).not.toHaveAttribute('data-sheet-stop','collapsed');await settle(page);
  await page.goBack();await expect(page.locator('[data-mobile-store-sheet]')).toHaveAttribute('data-sheet-stop','collapsed');await picture(page,'map-controls');await settle(page);
  await page.goBack();await expect(page.locator('[data-map-panel]')).toBeHidden();expect(await stored(page)).toEqual(mapState);
  await menu(page,'گفت‌وگوی تازه');await page.getByRole('button',{name:'بله، گفت‌وگوی تازه',exact:true}).click();await expect.poll(async()=>JSON.parse((await stored(page)).thread)).toEqual([]);
  await menu(page,'گفت‌وگوی تازه');await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(calls).toHaveLength(1);await writeFile(join(output,`measurements-${width}.json`),JSON.stringify({width,height,mapButtons:bounds,mapInput:input},null,2));
 });
}

for(const [width,height] of sizes.slice(0,3))test(`map point popup dismisses before the map and preserves location at ${width}`,async({page,request})=>{
 // Auto-expanded map attribution must not insert an invisible purchase step.
 await page.setViewportSize({width,height});await setup(page,request);
 await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect.poll(async()=>(await stored(page)).selected).not.toBe('null');
 const before=await stored(page);await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 const canvas=page.locator('.maplibregl-canvas');await canvas.click({position:{x:30,y:190}});
 await expect(page.getByRole('region',{name:'انتخاب موقعیت جست‌وجو',exact:true})).toBeVisible();await settle(page);
 await page.goBack();await expect(page.locator('.location-popup')).toHaveCount(0);await expect(page.locator('[data-map-panel]')).toBeVisible();expect(await stored(page)).toEqual(before);
 const mapEntry=await page.evaluate(()=>history.state);
 await canvas.click({position:{x:30,y:190}});await expect(page.locator('.location-popup')).toBeVisible();await settle(page);await page.getByRole('button',{name:'انصراف',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>history.state)).toEqual(mapEntry);await settle(page);
 await page.goBack();await expect(page.locator('[data-map-panel]')).toBeHidden();expect(await stored(page)).toEqual(before);
});

test.describe('dense touch markers',()=>{
test.use({hasTouch:true});
for(const [width,height] of sizes)test(`dense map markers have distinct 32px targets and retain every shop at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height});let items;
 const {calls}=await setup(page,request,async products=>{
  products.items=products.items.slice(0,1);const id=products.items[0].product_id;
  const source=await(await request.get(`/api/products/${id}/offers?user_lat=35.7&user_lon=51.4`)).json();
  items=structuredClone(source.items.filter((o,i,all)=>all.findIndex(x=>x.shop_id===o.shop_id)===i).slice(0,3));expect(items).toHaveLength(3);
  for(const o of items){o.shop.lat=35.7001;o.shop.lon=51.4001;}
  await page.route(`**/api/products/${id}/offers?*`,r=>r.fulfill({json:{...source,items,has_more:false}}));
  await page.route('**/api/local/visit-insights',async r=>{const response=await r.fetch(),data=await response.json();data.open_offers={...data.open_offers,items,has_more:false};await r.fulfill({json:data});});
 });
 await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await expect(page.locator('[data-offer]')).toHaveCount(3);
 await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 const cluster=page.locator('.real-pin.pin-cluster:visible');await expect(cluster).toHaveCount(1);await expect(cluster).toHaveAttribute('data-cluster-size','3');
 const targets=await page.locator('button.real-pin:visible').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button.real-pin')===e};}));
 for(const target of targets){expect(target.w).toBeGreaterThanOrEqual(32);expect(target.h).toBeGreaterThanOrEqual(32);expect(target.hit).toBe(true);}
 for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){const a=targets[i],b=targets[j];expect(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y).toBe(true);}
 const previousSelection=JSON.parse((await stored(page)).selected)?.offer_id,target=items.find(o=>o.offer_id!==previousSelection);
 await cluster.focus();await page.keyboard.press('Enter');const popup=page.getByRole('region',{name:'مشخصات فروشگاه روی نقشه',exact:true});await expect(popup).toBeVisible();
 for(const o of items){await expect(popup.getByRole('heading',{name:o.shop.name,exact:true})).toBeVisible();await expect(popup).toContainText(o.shop.address);}
 await picture(page,'dense-popup');
 await popup.locator(`[data-map-offer="${target.offer_id}"]`).getByRole('button',{name:'افزودن پیشنهاد به مقایسه',exact:true}).click();
 // Existing comparison behavior also selects that shop, so the new selected
 // marker becomes the group representative and closes the previous popup.
 await expect.poll(()=>page.evaluate(id=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:compare')??'[]').some(o=>o.offer_id===id),target.offer_id)).toBe(true);
 await expect(popup).toHaveCount(0);await cluster.tap();await expect(popup).toBeVisible();
 await expect(popup.locator(`[data-map-offer="${target.offer_id}"]`).getByRole('button',{name:'حذف پیشنهاد از مقایسه',exact:true})).toHaveAttribute('aria-pressed','true');
 await settle(page);await page.goBack();await expect(popup).toHaveCount(0);await expect(page.locator('[data-map-panel]')).toBeVisible();
 const nextChoice=items.find(o=>o.offer_id!==target.offer_id);
 await cluster.tap();await expect(popup).toBeVisible();await popup.locator(`[data-map-offer="${nextChoice.offer_id}"]`).getByRole('button',{name:'انتخاب این پیشنهاد',exact:true}).tap();
 await expect.poll(async()=>JSON.parse((await stored(page)).selected)?.offer_id).toBe(nextChoice.offer_id);
 expect(calls).toHaveLength(1);await picture(page,'dense-map');await writeFile(join(output,`dense-targets-${width}.json`),JSON.stringify(targets,null,2));
 if(width===360){await page.setViewportSize({width:1440,height:900});await expect(page.locator('button.real-pin:visible')).toHaveCount(3);await expect(page.locator('.real-pin.pin-cluster')).toHaveCount(0);await page.setViewportSize({width,height});await expect(cluster).toHaveCount(1);expect(JSON.parse((await stored(page)).selected).offer_id).toBe(nextChoice.offer_id);}
});
});

for(const [width,height] of sizes.slice(0,3))test(`complete mobile journey and nested Back stay usable at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height});const {calls,products}=await setup(page,request);
 await page.route('**/api/local/arrival-checks',r=>r.fulfill({json:{items:r.request().postDataJSON().selections.map(s=>({...s,departure_at:'2026-11-07T10:00:00+03:30',arrival_at:'2026-11-07T10:10:00+03:30',minutes_min:10,minutes_max:10,basis:'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:'ready',inventory_status:'unconfirmed'})),limitations:[]}}));
 for(let i=0;i<2;i++)await page.getByRole('checkbox',{name:'مقایسه',exact:true}).nth(i).click();
 await menu(page,'مقایسهٔ انتخاب‌ها');await page.locator('.comparison-options > summary').click();await page.getByRole('button',{name:'پاک‌کردن مقایسه',exact:true}).click();await settle(page);
 await page.goBack();await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();await settle(page);
 await page.goBack();await expect(page.locator('.comparison-options')).not.toHaveAttribute('open','');await settle(page);
 await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);expect(JSON.parse((await stored(page)).models)).toHaveLength(2);
 await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await expect(page.locator('[data-offer]').first()).toBeVisible();
 const id=products.items[0].product_id,source=await(await request.get(`/api/products/${id}/offers?user_lat=35.7&user_lon=51.4`)).json();
 for(let i=0;i<2;i++)await page.locator('[data-offer]').nth(i).getByRole('checkbox',{name:'مقایسه',exact:true}).click();
 await menu(page,'مقایسهٔ انتخاب‌ها');await page.getByRole('button',{name:/فروشگاه‌ها ·/}).click();await picture(page,'comparison-shops');await page.getByRole('button',{name:'بستن',exact:true}).click();await settle(page);
 // Credit filtering must be reachable, reversible and never guess eligibility.
 await page.getByRole('button',{name:'فیلتر',exact:true}).click();await page.getByRole('checkbox',{name:'فقط اعتبار حضوری',exact:true}).click();await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).click();
 await expect.poll(async()=>JSON.parse((await stored(page)).filters).credit).toBe(true);await picture(page,'credit');
 await page.getByRole('button',{name:'فیلتر',exact:true}).click();await page.getByRole('button',{name:'پاک‌کردن فیلترها',exact:true}).click();await page.getByRole('button',{name:'اعمال فیلترها',exact:true}).click();await expect(page.locator('[data-offer]').first()).toBeVisible();
 await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();const panel=page.locator('.chat-pane .purchase-journey');await expect(panel).toBeVisible();
 // Seller interactions are in-memory fixtures, never writes to the local DB.
 let batch=null;
 await page.route('**/api/local/checks**',r=>{const q=r.request();if(q.method()==='POST'){const body=q.postDataJSON();batch={id:'ux_batch',journey_id:body.journey_id,created_at:'2026-11-07T10:00:00+03:30',source:'simulated',items:body.selections.map(s=>{const o=source.items.find(x=>x.offer_id===s.offer_id)??source.items[0];return {...s,shop_name:o.shop.name,product_name:products.items[0].persian_title,source_price_toman:o.price_toman,source:'simulated',channel:'local_seller_panel',seller_token:'ux_'+s.offer_id,reply:null,reservation:null};})};return r.fulfill({json:batch});}return r.fulfill({json:{items:batch?[batch]:[]}});});
 await page.route('**/api/local/seller-demo/**',r=>r.fulfill({json:batch.items.find(i=>r.request().url().includes(i.seller_token))??batch.items[0]}));
 await panel.locator('.journey-more > summary').click();await panel.locator('.journey-secondary > summary').click();await panel.getByRole('button',{name:'نمایش آزمایشی؛ پاسخ و رزرو',exact:true}).click();await page.getByRole('button',{name:'شروع استعلام هم‌زمان',exact:true}).click();await page.getByRole('button',{name:'پاسخ در نقش فروشنده',exact:true}).first().click();await picture(page,'seller');await settle(page);
 await page.goBack();await expect(page.getByRole('heading',{name:'نتیجهٔ آخرین استعلام',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'بازگشت به استعلام‌ها',exact:true})).toHaveCount(0);await settle(page);
 await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);
 await panel.getByRole('button',{name:'بررسی موجودی و پاسخ فروشگاه',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('بررسی موجودی و پاسخ فروشگاه');
 await page.getByRole('button',{name:'نمایش آزمایشی؛ پاسخ و رزرو',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('نمایش آزمایشی؛ پاسخ و رزرو');await page.goBack();
 await page.getByRole('button',{name:'نمایش آزمایشی؛ بدون ارتباط واقعی',exact:true}).click();await page.getByLabel('سناریوی پیگیری آزمایشی').selectOption('no_answer');
 const selected=JSON.parse((await stored(page)).selected);
 const alternative=await(await request.post('/api/followups/alternatives',{data:{product_id:id,offer_id:selected.offer_id,shop_id:selected.shop_id,outcome:'no_answer',outcome_source:'simulated',user_lat:35.7,user_lon:51.4}})).json();
 alternative.alternatives.items=source.items.filter(o=>o.shop_id!==selected.shop_id).slice(0,2);alternative.alternatives.has_more=false;
 await page.route('**/api/followups/alternatives',r=>r.fulfill({json:alternative}));
 await page.getByRole('button',{name:'اجرای پیگیری آزمایشی',exact:true}).click();await page.getByRole('button',{name:'دیدن جایگزین‌ها و ادامهٔ خرید',exact:true}).click();await expect(page.locator('.journey-alternatives')).toContainText('جایگزین');await expect(page.locator('.journey-alternatives button').first()).toBeVisible();await picture(page,'no-answer');
 await page.locator('.journey-alternatives button').first().click();await expect(panel).toHaveAttribute('data-purchase-stage','ready');
 // Starting opens the map and optional route sheet; Back dismisses that sheet first.
 await panel.getByRole('button',{name:'بزن بریم',exact:true}).click();await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toBeVisible();await settle(page);
 await page.goBack();await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toHaveCount(0);await expect(page.locator('[data-map-panel]')).toBeVisible();
 await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','en_route');await settle(page);
 await page.goBack();await expect(panel).toHaveAttribute('data-purchase-stage','ready');
 await panel.getByRole('button',{name:'بزن بریم',exact:true}).click();await page.getByRole('button',{name:'بستن',exact:true}).click();await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();
 await panel.getByRole('button',{name:'رسیدم به فروشگاه',exact:true}).click();await panel.getByText('راهنمای پیدا کردن ورودی فروشگاه',{exact:true}).click();await picture(page,'indoor');await settle(page);await page.goBack();
 await expect(panel.getByText('راهنمای پیدا کردن ورودی فروشگاه',{exact:true}).locator('..')).not.toHaveAttribute('open','');await panel.getByRole('button',{name:'بسته بود',exact:true}).click();await expect(panel).toHaveAttribute('data-purchase-stage','problem');await expect(panel.locator('.journey-alternatives button').first()).toBeVisible();await picture(page,'closed');
 expect(calls).toHaveLength(1);expect(JSON.parse((await stored(page)).models)).toHaveLength(2);
});
