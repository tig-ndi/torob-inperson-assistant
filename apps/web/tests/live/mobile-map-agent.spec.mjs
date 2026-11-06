import {test,expect} from '@playwright/test';
import {mockAssistant} from './helpers.mjs';

const panel=page=>page.locator('[data-map-panel]');
const input=page=>page.getByRole('textbox',{name:'پیام به دستیار روی نقشه',exact:true});
async function openMap(page){await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(input(page)).toBeVisible();}
async function position(page){
 await panel(page).getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();
 await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');
 await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();await expect(input(page)).toBeVisible();
}
async function sendMap(page,text){await input(page).fill(text);await page.getByRole('button',{name:'ارسال پیام روی نقشه',exact:true}).click();}

for(const width of [320,390])test(`map-only search, model, store and journey remain connected at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:844});const calls=[];await mockAssistant(page,request,calls);
 await page.goto('/');await openMap(page);await expect(panel(page).locator('.map-buttons')).toHaveCount(0);
 await position(page);await expect(panel(page).locator('.map-header-tools,.map-header-hint')).toHaveCount(0);
 await sendMap(page,'گوشی می‌خواهم');await expect(panel(page).locator('[data-map-product]').first()).toBeVisible();expect(calls).toHaveLength(1);
 await expect(input(page)).toHaveValue('');await expect(page.locator('.chat-pane')).toHaveAttribute('inert','');
 await panel(page).locator('[data-map-product]').first().click();await expect(input(page)).toBeVisible();
 await expect(panel(page).locator('[data-map-choice]').first()).toBeVisible();
 await expect(panel(page).getByRole('button',{name:'تغییر مدل محصول',exact:true})).toBeVisible();
 await panel(page).locator('[data-map-choice]').first().click();await page.getByRole('button',{name:'بررسی و شروع خرید از این فروشگاه',exact:true}).click();
 await expect(panel(page).locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','ready');
 await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 await expect.poll(async()=>{const pin=await panel(page).locator('.real-pin.chosen').boundingBox(),journey=await panel(page).locator('[data-mobile-journey]').boundingBox(),sheet=await panel(page).locator('[data-mobile-store-sheet]').boundingBox();return pin&&pin.y>=(await panel(page).locator('[data-mobile-map-header]').boundingBox()).y+50&&pin.y+pin.height<=sheet.y&&journey.y>=sheet.y;}).toBe(true);
 await page.screenshot({path:`../../.local/live-qa/mobile-map-ready-${width}.png`});
 await expect(panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'})).toHaveCount(0);
 await panel(page).getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();await expect(page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'})).toBeVisible();
 await page.getByRole('button',{name:'بستن',exact:true}).click();await expect(input(page)).toBeVisible();
 await panel(page).getByRole('button',{name:'بازگشت به انتخاب فروشگاه',exact:true}).click();await expect(panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'})).toBeVisible();
 await input(page).fill('این پیش‌نویس را نگه دار');await panel(page).getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true})).toHaveValue('این پیش‌نویس را نگه دار');
 await expect(page.locator('[data-message-role="user"]')).toContainText(['گوشی می‌خواهم']);await openMap(page);await expect(input(page)).toHaveValue('این پیش‌نویس را نگه دار');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.waitForTimeout(500);await page.screenshot({path:`../../.local/live-qa/mobile-map-agent-${width}.png`});
});

test.describe('map composer with touch and a short viewport',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:320,height:568}});
 test('touch and Enter submit once, keyboard-sized view keeps controls accessible',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);await page.goto('/');
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).tap();
  await expect(input(page)).not.toBeFocused();
  await panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'}).getByRole('button',{name:'گوشی',exact:true}).tap();
  await expect(panel(page).locator('[data-map-product]').first()).toBeVisible();expect(calls).toHaveLength(1);
  await input(page).fill('مدل مناسب می‌خواهم');await page.setViewportSize({width:320,height:340});
  await expect(panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'})).toBeHidden();
  await expect(page.getByRole('button',{name:'ارسال پیام روی نقشه',exact:true})).toBeInViewport();
  await input(page).press('Enter');await expect.poll(()=>calls.length).toBe(2);await page.setViewportSize({width:320,height:568});
  await expect(panel(page).locator('[data-map-product]').first()).toBeVisible();
  await panel(page).getByRole('button',{name:'پاسخ‌های آماده',exact:true}).tap();
  await expect(page.getByRole('dialog',{name:'پاسخ‌های آماده',exact:true})).toBeVisible();await page.getByRole('button',{name:'بستن',exact:true}).tap();
  await page.getByRole('button',{name:'جمع کردن فهرست برای دیدن کامل نقشه',exact:true}).tap();
  await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
  await expect.poll(()=>page.evaluate(()=>document.elementFromPoint(160,330)?.classList.contains('maplibregl-canvas'))).toBe(true);
  await page.screenshot({path:'../../.local/live-qa/mobile-map-agent-touch.png'});
 });
});

test('map questions and ready replies continue the same need without opening chat',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await mockAssistant(page,request);let calls=[];
 await page.route('**/api/assistant/turn',route=>{
  const body=route.request().postDataJSON();calls.push(body);
  const need={version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:null,budget_needs_input:calls.length>1,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]};
  return route.fulfill({json:{request_id:body.request_id,status:'needs_input',query:'گوشی',category_name:need.category_name,max_price_toman:null,question:calls.length===1?'گوشی هوشمند می‌خواهی یا دکمه‌ای؟':'سقف بودجه‌ات چقدر است؟',question_code:calls.length===1?'phone_kind':'budget',products:null,offer_sort:'price',battery_requirement:need.battery_requirement,need_state:need,explanation:null}});
 });
 await page.goto('/');await openMap(page);await position(page);await sendMap(page,'گوشی می‌خواهم');
 await expect(panel(page).locator('.map-agent-feedback')).toContainText('هوشمند');
 const chips=panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'});await chips.getByRole('button',{name:'هوشمند',exact:true}).click();
 await expect(panel(page).locator('.map-agent-feedback')).toContainText('بودجه');expect(calls).toHaveLength(2);expect(calls[1].context_need_state.topic_query).toBe('گوشی');
 await expect(chips.getByRole('button',{name:'تا ۲۰ میلیون',exact:true})).toBeVisible();
 await panel(page).getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await expect(page.getByRole('dialog',{name:'پاسخ‌های آماده',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'بودجهٔ دلخواه',exact:true}).click();await expect(page.getByRole('dialog',{name:'سقف بودجهٔ همین خرید',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'بستن',exact:true}).click();await expect(input(page)).toBeVisible();
});

test('choosing a point on the map stays on the map and retains the draft',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await mockAssistant(page,request);await page.goto('/');await openMap(page);
 await input(page).fill('گوشی موردنظرم');await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 await panel(page).getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByRole('button',{name:'انتخاب نقطه روی نقشه',exact:true}).click();
 await page.locator('.maplibregl-canvas').click({position:{x:180,y:320}});
 await expect(panel(page).getByRole('button',{name:'موقعیت جست‌وجو',exact:true})).toBeVisible();await expect(input(page)).toHaveValue('گوشی موردنظرم');
});

test('a nearby request resumes after choosing its missing location on the map',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await mockAssistant(page,request);await page.goto('/');await openMap(page);
 await sendMap(page,'شارژر موبایل نزدیک من');
 await expect(panel(page).locator('.map-agent-feedback')).toContainText('نقطهٔ جست‌وجو');
 await panel(page).getByRole('group',{name:'پیشنهادهای خرید روی نقشه'}).getByRole('button',{name:'روی نقشه انتخاب می‌کنم',exact:true}).click();
 await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 await page.locator('.maplibregl-canvas').click({position:{x:190,y:340}});
 await expect(panel(page).locator('[data-map-product]').first()).toBeVisible();await expect(input(page)).toBeVisible();
 await expect(panel(page).locator('[data-map-product]').first()).toContainText('شارژر');
});

test('desktop keeps its existing header, three controls and single composer',async({page,request})=>{
 await page.setViewportSize({width:1440,height:900});await mockAssistant(page,request);await page.goto('/');
 await expect(panel(page).locator('.map-control')).toHaveCount(3);await expect(panel(page).locator('[data-mobile-map-header]')).toHaveCount(0);
 await expect(input(page)).toHaveCount(0);await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'نمای کل ایران',exact:true}).click();await expect(panel(page)).toBeVisible();
});

test('map request failure and retry stay visible without losing the conversation',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const calls=[];await mockAssistant(page,request,calls);let failed=false;
 await page.route('**/api/assistant/turn',route=>{if(!failed){failed=true;return route.fulfill({status:503,json:{detail:'سرویس آزمایشی موقتاً در دسترس نیست'}});}return route.fallback();});
 await page.goto('/');await openMap(page);await sendMap(page,'گوشی می‌خواهم');
 await expect(panel(page).getByRole('alert')).toContainText('دسترس نیست');await panel(page).getByRole('button',{name:'تلاش دوباره',exact:true}).click();
 await expect(panel(page).locator('[data-map-product]').first()).toBeVisible();expect(calls).toHaveLength(1);await expect(input(page)).toBeVisible();
});
