import {fileURLToPath} from 'node:url';
import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

async function fixture(page,request,{query='هدفون',safe=true,routeFailure=false,splitRoutes=false}={}){
 const calls=[],products=await mockAssistant(page,request,calls,query),product=products.items.find(p=>p.offer_summary.offer_count>0);
 const source=await(await request.get(`/api/products/${product.product_id}/offers?user_lat=35.7&user_lon=51.4`)).json(),original=source.items[0];
 const template=await(await request.post('/api/followups/prepare',{data:{product_id:product.product_id,offer_id:original.offer_id,shop_id:original.shop_id}})).json();
 const rows=['a','b','c'].map((id,i)=>({...structuredClone(original),product_id:product.product_id,offer_id:'delegated_'+id,shop_id:'delegated_shop_'+id,price_toman:String((i+1)*100000),shop:{...original.shop,name:'مقصد آزمایشی '+id,lat:35.7+i*.002,lon:51.4+i*.002},direct_distance_meters:[100,500,50][i],opening_hours:{...original.opening_hours,status:'declared_open',reason:'within_declared_shift'}}));
 const roads=[],destinations=[],loaded=new Set(),clock='2026-11-04T12:00:00+03:30';
 await page.route('**/api/local/destinations',r=>{const b=r.request().postDataJSON();destinations.push(b);const offered=rows.filter(o=>!b.exclude_shop_ids?.includes(o.shop_id)&&(!b.reference_product_id||b.reference_product_id===o.product_id));return r.fulfill({json:{product_ids:[product.product_id],selections:offered.map(o=>({product_id:o.product_id,shop_id:o.shop_id,offer_id:o.offer_id})),matched_models:3,matched_shops:offered.length}});});
 await page.route('**/api/local/visit-insights',r=>r.fulfill({json:{evaluated_at:clock,time_source:'server_clock',nearby_km:2,search_km:15,nearby:{shops:3,declared_open:3,declared_closed:0,unknown:0,truncated:false},open_offers:{...source,items:rows},markets:[],limitations:[]}}));
 await page.route('**/api/followups/prepare',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{...template,selected_offer:rows.find(o=>o.offer_id===b.offer_id)??original,hours_evaluated_at:clock}});});
 await page.route('**/api/local/road-routes',r=>{const b=r.request().postDataJSON();roads.push(b);return r.fulfill({json:{items:b.selections.map(s=>{if(routeFailure)return {...s,status:'unavailable',reason:'آزمایش قطع سرویس مسیر'};loaded.add(s.offer_id);const index=rows.findIndex(o=>o.offer_id===s.offer_id);return {...s,status:'ready',mode:b.mode,distance_meters:(splitRoutes?[800,1500,200]:[2000,1000,200])[index]??1000,duration_seconds:[1500,600,100][index]??600,endpoint_offset_meters:0,computed_at:clock,geometry:{type:'LineString',coordinates:[[51.4,35.7],[51.401,35.701],[51.402,35.702]]},steps:[]};})}});});
 await page.route('**/api/local/arrival-checks',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{items:b.selections.map(s=>{const road=b.use_road_route&&loaded.has(s.offer_id),index=rows.findIndex(o=>o.offer_id===s.offer_id),mins=[25,10,2][index]??10;return {...s,departure_at:clock,arrival_at:clock,minutes_min:mins,minutes_max:mins,basis:road?'street_route':'rough_walking_range',departure_status:'declared_open',arrival_status:'declared_open',margin_status:'declared_open',margin_minutes:10,risk:safe&&index!==2?'ready':'closing_soon',inventory_status:'unconfirmed'};}),limitations:[]}});});
 return {rows,roads,calls,destinations,products};
}
async function start(page){await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام خودت نزدیک ترین مقصد را انتخاب کن و برنامه رفتن را بچین، پیاده میرم');}
async function consent(page){await page.getByRole('button',{name:'اجازهٔ مسیر و ادامهٔ انتخاب خودکار',exact:true}).click();}
const card=page=>page.getByRole('region',{name:'انتخاب و برنامهٔ خودکار',exact:true});

test('mobile visit results lead with one destination and expand alternatives without duplicating warnings',async({page,request})=>{
 await page.setViewportSize({width:320,height:568});await fixture(page,request);await page.goto('/');await chooseLocation(page);await send(page,'هدفون نزدیک من میخوام');
 const panel=page.locator('[data-visit-decision]');await expect(panel.locator('[data-visit-candidate]')).toHaveCount(3);await expect(panel.locator('[data-visit-candidate]:visible')).toHaveCount(1);await expect(panel.locator('.arrival-warning')).toHaveCount(0);
 await panel.locator('.decision-details>summary').click();await expect(panel.locator('[data-visit-candidate]:visible')).toHaveCount(3);await expect(panel.getByRole('button',{name:'روی نقشه',exact:true})).toHaveCount(3);await layout(page);
});

for(const width of [320,1440])test(`explanation and compatibility questions preserve the prepared visit at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:width===320?568:900});const f=await fixture(page,request);await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');
 const snapshot=()=>page.evaluate(()=>Object.fromEntries(['selected','need','delegation','mode','screen','mapLibrary'].map(k=>[k,sessionStorage.getItem('inperson-journey:v2:'+k)])));
 await expect(card(page).getByRole('button',{name:'بزن بریم',exact:true})).toBeVisible();
 const before=await snapshot(),calls=f.calls.length;
 await send(page,'چرا همین فروشگاه رو انتخاب کردی؟');await expect(page.locator('.chat-message.assistant').last()).toContainText('مقصد آزمایشی b');await expect(page.locator('.chat-message.assistant').last()).toContainText('۱۰ دقیقه');expect(await snapshot()).toEqual(before);expect(f.calls).toHaveLength(calls);
 await send(page,'این مدل به A54 من میخوره؟');await expect(page.locator('.chat-message.assistant').last()).toContainText('بدون شاهد تأیید نمی‌کنم');expect(await snapshot()).toEqual(before);expect(f.calls).toHaveLength(calls);await layout(page);
});

test('fastest delegation chooses travel time when the shortest safe road takes longer',async({page,request})=>{
 await fixture(page,request,{splitRoutes:true});await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام خودت سریع ترین مقصد را انتخاب کن و برنامه رفتن را بچین، پیاده میرم');await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('مقصد آزمایشی b');await page.reload();await expect(card(page)).toHaveAttribute('data-delegated-status','planned');expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:delegation')).goal)).toBe('fastest');
});

test('mobile delegation selects the fastest safe road and creates a plan without clicking products',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await start(page);await expect(card(page)).toBeVisible();expect(f.roads).toHaveLength(0);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('مقصد آزمایشی b');await expect(page.locator('.chat-message.assistant').filter({hasText:'برای ساعت'})).toHaveCount(0);await expect(card(page)).toContainText('موجودی هنوز تأیید نشده');expect(f.roads[0].selections).toHaveLength(3);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(page.locator('[data-map-panel]')).toBeVisible();await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).first().click();await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await layout(page);
});

test('delegation asks phone kind once and continues through location without forgetting it',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request,{query:'گوشی دکمه ای'});await page.goto('/');await send(page,'گوشی میخوام نزدیک ترین جا را خودت انتخاب کن مسیر را تعیین کن پیاده برم');await expect(page.getByRole('button',{name:'دکمه‌ای',exact:true})).toBeVisible();expect(f.calls).toHaveLength(0);await page.getByRole('button',{name:'دکمه‌ای',exact:true}).click();await expect.poll(()=>f.calls.length).toBe(1);expect(f.calls[0].messages.at(-1).content).toContain('دکمه ای');await expect(page.locator('.chat-message.user').last()).toHaveText('گوشی دکمه ای می‌خواهم');await expect(page.getByRole('button',{name:'انتخاب با یک کلیک روی نقشه',exact:true})).toBeVisible();await chooseLocation(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');expect(f.calls).toHaveLength(1);await layout(page);
});

test('asking the assistant to select from existing results does not repeat the product question',async({page,request})=>{
 const f=await fixture(page,request);await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();const before=f.calls.length;await send(page,'خودت نزدیک ترین رو انتخاب کن شروع کنم به رفتن');await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');expect(f.calls).toHaveLength(before);
});

test('another destination excludes the previous shop and preserves mobile conversation and route',async({page,request})=>{
 await page.setViewportSize({width:320,height:568});const f=await fixture(page,request);await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await card(page).locator('.journey-more>summary').click();await card(page).getByRole('button',{name:'گزینهٔ دیگر',exact:true}).click();await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('مقصد آزمایشی a');expect(f.destinations.at(-1).exclude_shop_ids).toContain('delegated_shop_b');await layout(page);await page.screenshot({path:fileURLToPath(new URL('../../../../.local/live-qa/delegated-visit-320.png',import.meta.url))});
});

test('unsafe arrival never becomes a ready departure plan',async({page,request})=>{
 await fixture(page,request,{safe:false});await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','blocked');await expect(card(page)).toContainText('فرصت خرید مطمئن پیدا نشد');await expect(card(page).getByRole('button',{name:'مسیر همین انتخاب',exact:true})).toHaveCount(0);
});

test('route failure is explicit and does not retry indefinitely',async({page,request})=>{
 const f=await fixture(page,request,{routeFailure:true});await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','blocked');await expect(card(page)).toContainText('قطع سرویس مسیر');const n=f.roads.length;await page.waitForTimeout(700);expect(f.roads).toHaveLength(n);
});

test('cancel before consent leaves ordinary browsing intact and sends no routing request',async({page,request})=>{
 const f=await fixture(page,request);await start(page);await expect(card(page)).toBeVisible();await send(page,'خودم انتخاب میکنم، خودت انتخاب نکن');await expect(card(page)).toHaveCount(0);expect(f.roads).toHaveLength(0);await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();
});

test('a budget reply before phone kind is retained when the choice continues',async({page,request})=>{
 const f=await fixture(page,request,{query:'گوشی هوشمند'});await page.goto('/');await send(page,'گوشی میخوام خودت نزدیک ترین جا را انتخاب کن');await expect(page.getByRole('button',{name:'هوشمند',exact:true})).toBeVisible();await send(page,'تا بیست میلیون تومان');expect(f.calls).toHaveLength(0);await page.getByRole('button',{name:'هوشمند',exact:true}).click();await expect.poll(()=>f.calls.length).toBe(1);expect(f.calls[0].messages.at(-1).content).toContain('بیست میلیون');expect(f.calls[0].messages.at(-1).content).toContain('گوشی هوشمند');await expect(card(page)).toHaveAttribute('data-delegated-status','pending');
});

test('changing travel mode replans the same purchase and spoken completion ends it',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await fixture(page,request);await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await send(page,'با ماشین میرم');await expect.poll(()=>f.roads.at(-1)?.mode).toBe('driving');await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('خودرو');await send(page,'بزن بریم');await expect(page.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','en_route');await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await send(page,'این خرید تمام شد');await expect(card(page)).toHaveCount(0);await expect(page.locator('.chat-pane [data-completed-visit]')).toBeVisible();await layout(page);
});

test('a rejected seller is excluded when the assistant chooses the next destination',async({page,request})=>{
 const f=await fixture(page,request);await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await send(page,'این فروشگاه بسته بود');await expect.poll(()=>f.destinations.at(-1)?.exclude_shop_ids).toContain('delegated_shop_b');await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('مقصد آزمایشی a');
});

test('a planned purchase survives refresh and stays in the same mobile conversation',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page,request);await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await page.reload();await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(card(page)).toContainText('مقصد آزمایشی b');await layout(page);
});


test('no matching product produces an actionable stop instead of waiting forever',async({page,request})=>{
 const f=await fixture(page,request);await page.route('**/api/products?**',r=>r.fulfill({json:{...f.products,items:[],has_more:false}}));await start(page);await expect(card(page)).toHaveAttribute('data-delegated-status','blocked');await expect(card(page)).toContainText('کالای منطبق پیدا نشد');expect(f.roads).toHaveLength(0);
});

test('saving a plan through conversation records it once and keeps the selected destination',async({page,request})=>{
 const f=await fixture(page,request),saved=[];await page.route('**/api/local/trips',r=>{if(r.request().method()!=='POST')return r.continue();const b=r.request().postDataJSON();saved.push(b);return r.fulfill({json:{...b,id:'delegated_saved_trip',created_at:'2026-11-04T12:00:00+03:30',reservation:null,product_name:'هدفون آزمایشی',shop_name:'مقصد آزمایشی b'}});});await start(page);await consent(page);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');await expect(page.locator('[data-visit-safety]')).toHaveCount(0);await send(page,'برنامه را ذخیره کن');await expect.poll(()=>saved.length).toBe(1);expect(saved[0].offer_id).toBe('delegated_b');await send(page,'برنامه را ذخیره کن');expect(saved).toHaveLength(1);await expect(card(page)).toHaveAttribute('data-delegated-status','planned');
});

test('a phone-kind reply can include an additional budget without losing that condition',async({page,request})=>{
 const f=await fixture(page,request,{query:'گوشی هوشمند'});await page.goto('/');await send(page,'گوشی میخوام خودت نزدیک ترین را انتخاب کن');await expect(page.getByRole('button',{name:'هوشمند',exact:true})).toBeVisible();await send(page,'هوشمند تا بیست میلیون تومان');await expect.poll(()=>f.calls.length).toBe(1);expect(f.calls[0].messages.at(-1).content).toContain('بیست میلیون');expect(f.calls[0].messages.at(-1).content).toContain('هوشمند');
});
