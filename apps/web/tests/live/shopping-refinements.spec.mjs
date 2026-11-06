import {openMobileTools} from './helpers.mjs';
import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

async function manualPosition(page){
  await page.getByRole('region',{name:'گفت‌وگوی خرید'}).getByRole('button',{name:'انتخاب موقعیت',exact:true}).click();
  await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');
  await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();
}
test('removing only-open retains local product, location and exact budget',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);const offers=[];
  page.on('request',r=>{if(/\/offers\?/.test(r.url()))offers.push(new URL(r.url()).searchParams);});
  await page.goto('/');await manualPosition(page);await send(page,'شارژر موبایل نزدیک من زیر ۲ میلیون تومان؛ فقط باز');
  await expect.poll(()=>offers.length).toBeGreaterThan(0);await expect.poll(()=>offers.at(-1).get('open_now_only')).toBe('true');
  const before=offers.length;await send(page,'فیلتر فقط باز را بردار');
  await expect.poll(()=>offers.length).toBeGreaterThan(before);await expect.poll(()=>offers.at(-1).get('open_now_only')).toBe('false');
  expect(offers.at(-1).get('max_price_toman')).toBe('2000000');expect(offers.at(-1).get('user_lat')).toBe('35.7');
  const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:need')));expect(state.topic_query).toBe('شارژر موبایل');expect(state.max_price_toman).toBe('2000000');
  expect(calls).toHaveLength(0);await layout(page);
});
test('two purchases ask for order and keep the second across location and reload',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);await page.goto('/');
  await send(page,'گوشی و شارژر موبایل می‌خواهم؛ نزدیک من کجا بخرم؟');
  const queue=page.locator('.purchase-queue');await expect(queue.getByRole('button')).toHaveCount(2);expect(calls).toHaveLength(0);
  await queue.getByRole('button',{name:'گوشی',exact:true}).click();await expect(page.locator('.inline-location')).toBeVisible();await manualPosition(page);
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
  await page.reload();await queue.locator('summary').click();await expect(queue.getByRole('button',{name:'شارژر موبایل',exact:true})).toBeVisible();
  await queue.getByRole('button',{name:'شارژر موبایل',exact:true}).click();await expect.poll(async()=>await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:need'))?.topic_query)).toBe('شارژر موبایل');
  expect(calls).toHaveLength(0);await layout(page);
});
test('a named recommendation outside the first three is the first actionable card',async({page,request})=>{
  const products=await mockAssistant(page,request),chosen=products.items.at(-1);expect(products.items.length).toBeGreaterThan(3);
  await page.unroute('**/api/assistant/turn');
  await page.route('**/api/assistant/turn',r=>{const input=r.request().postDataJSON();return r.fulfill({json:{request_id:input.request_id,status:'results',query:'گوشی',category_name:products.category_name,max_price_toman:null,question:null,question_code:null,products,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},need_state:{version:1,topic_query:'گوشی',category_name:products.category_name,category_cleared:false,max_price_toman:null,budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]},explanation:{recommended_product_id:chosen.product_id,query:'گوشی',category_name:products.category_name,max_price_toman:null,ranking_basis:'lexical_match_then_product_id',topics:[],summary:`برای شروع «${chosen.persian_title}» را بررسی کن.`,limitations:['موجودی تأیید نشده'],products:[],provenance:products.provenance}}});});
  await page.goto('/');await send(page);const card=page.locator('[data-active-tool] section').filter({has:page.locator('[data-recommended-product]')});
  await expect(page.locator('[data-active-tool] h3').first()).toHaveText(chosen.persian_title);await expect(card.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('[data-active-tool] h3').first()).toHaveText(chosen.persian_title);
  await page.locator('[data-active-tool] section').filter({has:page.getByRole('heading',{name:chosen.persian_title,exact:true})}).getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).click();await expect(page.locator('[data-offer]').first()).toHaveAttribute('data-offer',/./);await layout(page);
});
for(const size of [{width:320,height:568},{width:390,height:844}])test(`mobile chrome leaves room for reading and theme stays reachable at ${size.width}`,async({page,request})=>{
  await page.setViewportSize(size);await mockAssistant(page,request);await page.goto('/');await send(page);
  const reading=await page.locator('[data-chat-scroll]').evaluate(e=>e.clientHeight);expect(reading).toBeGreaterThan(size.height*.49);
  await openMobileTools(page);await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.getByRole('button',{name:'ظاهر روشن',exact:true}).click();await expect(page.locator('.agent-app')).toHaveClass(/theme-light/);
  await openMobileTools(page);await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true})).toBeFocused();await layout(page);
  const checks=page.getByRole('checkbox',{name:'مقایسه',exact:true});await checks.nth(0).click();await checks.nth(1).click();await openMobileTools(page);await page.getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();
  const d=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'});const row=await d.locator('tbody tr').first().boundingBox(),dialog=await d.boundingBox();expect(row.y).toBeLessThan(dialog.y+dialog.height*.76+1); // Allow fractional-pixel layout rounding.
  expect(await d.locator('.dialog-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:`../../.local/live-qa/refined-mobile-${size.width}.png`});
});
