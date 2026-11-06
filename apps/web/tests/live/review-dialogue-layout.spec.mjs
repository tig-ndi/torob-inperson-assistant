import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

for(const width of [320,390,1440])test(`conversation owns the viewport and secondary controls remain reachable at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:'dark'});await mockAssistant(page,request);await page.goto('/');
 if(width<1000){
  expect(await page.locator('.message-composer').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(68);
  expect(await page.locator('.chat-header').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(60);
  expect(await page.locator('[data-chat-scroll]').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(580);
  await page.getByLabel('گزینه‌های بیشتر',{exact:true}).click();
  await expect(page.getByRole('button',{name:'برنامه‌ها و نتایج قبلی',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.mobile-header-menu')).not.toHaveAttribute('open','');
 }else await expect(page.getByRole('button',{name:'گفت‌وگوی تازه',exact:true})).toBeVisible();
 await send(page);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');await layout(page);
 await page.screenshot({path:`../../.local/live-qa/review-chat-${width}.png`});
});

for(const width of [320,390])test(`map starts fully open with a collapsed usable drawer at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await mockAssistant(page,request);await page.goto('/');await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 const sheet=page.locator('[data-mobile-store-sheet]');await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');
 await expect(sheet.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true})).toBeVisible();
 expect(await sheet.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(100);
 const handle=page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true});await handle.focus();await page.keyboard.press('ArrowUp');await expect(sheet).toHaveAttribute('data-sheet-stop','peek');await page.keyboard.press('ArrowDown');await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');
 await page.screenshot({path:`../../.local/live-qa/review-map-${width}.png`});
});

test('delegated phone kind resumes a short product query after location without losing walking mode',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const calls=[],queries=[];await mockAssistant(page,request,calls);
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/products'&&u.searchParams.has('q'))queries.push(u.searchParams.get('q'));});
 await page.goto('/');await send(page,'گوشی میخوام؛ نزدیک ترین جا رو خودت انتخاب کن تا پیاده برم');
 await page.getByRole('button',{name:'هوشمند',exact:true}).click();await expect(page.locator('.inline-location')).toBeVisible();
 await page.getByRole('region',{name:'گفت‌وگوی خرید'}).getByRole('button',{name:'انتخاب موقعیت',exact:true}).click();
 await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();
 await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
 await expect(page.getByRole('alert')).toHaveCount(0);expect(queries.every(q=>q.split(/\s+/).length<=12)).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:travelMode')??'"walking"'))).toBe('walking');
 expect(calls.length).toBeGreaterThan(0);
});

test('a target device reply keeps charger context instead of queueing a phone',async({page,request})=>{
 const calls=[];await mockAssistant(page,request,calls,'شارژر موبایل');await page.goto('/');await send(page,'شارژر برای گوشی تا یک میلیون میخواهم');
 await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');await send(page,'برای گوشی سامسونگ A54، تایپ سی');
 await expect.poll(()=>calls.length).toBe(2);expect(calls[1].context_need_state.topic_query).toBe('شارژر موبایل');await expect(page.locator('.purchase-queue')).toHaveCount(0);
});

test('walking shoe caution appears once while source facts stay on each card',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await mockAssistant(page,request,[],'کفش');await page.goto('/');await send(page,'کفش برای پیاده روی روزانه میخواهم');
 await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
 await expect(page.locator('[data-shared-buying-caution]')).toHaveCount(1);
 await expect(page.locator('.product-results details summary').first()).toBeVisible();
});
