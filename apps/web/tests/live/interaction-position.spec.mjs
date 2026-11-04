import {test,expect} from '@playwright/test';
import {send,layout} from './helpers.mjs';
import {visitFixture,chooseLocation} from './visit-fixtures.mjs';

for(const width of [320,390,1440])test(`sorting keeps the current scroll position and results precede visit guidance at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:width===320?568:900});const f=await visitFixture(page,request);
 await page.addInitScript(()=>sessionStorage.setItem('inperson-journey:v2:thread',JSON.stringify(Array.from({length:8},(_,i)=>({id:'context-'+i,role:'assistant',text:'جزئیات همین خرید برای ادامهٔ گفت‌وگو محفوظ است. '.repeat(3),kind:'message'})))));
 await page.goto('/');await chooseLocation(page);await send(page,'شارژر موبایل نزدیک من برای ساعت ۲۳:۳۰');
 const tool=page.locator('[data-active-tool]');await expect(tool.locator('.product-results')).toBeVisible();
 expect(await tool.evaluate(e=>!!(e.querySelector('.product-results>section')?.compareDocumentPosition(e.querySelector('[data-visit-decision]'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await tool.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await expect(tool.locator('[data-offer]').first()).toBeVisible();await expect(tool.locator('.visit-insights')).toBeVisible();await expect(page.locator('.assistant-working')).toHaveCount(0);
 expect(await tool.evaluate(e=>!!(e.querySelector('[data-offer]')?.compareDocumentPosition(e.querySelector('.visit-insights'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.waitForTimeout(400);
 for(const label of ['ارزان‌ترین','نزدیک‌ترین']){
  const sort=tool.getByRole('tab',{name:label,exact:true});
  await sort.evaluate(e=>{const scroller=e.closest('[data-chat-scroll]');scroller.scrollTop+=e.getBoundingClientRect().top-scroller.getBoundingClientRect().top-120;});
  const before=await page.locator('[data-chat-scroll]').evaluate(e=>e.scrollTop),y=(await sort.boundingBox()).y,calls=f.insightCalls;
  expect(before).toBeGreaterThan(100);await sort.click();await expect.poll(()=>f.insightCalls).toBeGreaterThan(calls);await expect(page.locator('.assistant-working')).toHaveCount(0);await page.waitForTimeout(300);
  expect(Math.abs((await page.locator('[data-chat-scroll]').evaluate(e=>e.scrollTop))-before)).toBeLessThan(6);
  expect(Math.abs((await sort.boundingBox()).y-y)).toBeLessThan(6);
 }
 await layout(page);await page.screenshot({path:`../../.local/interaction-position-${width}.png`});expect(f.calls).toHaveLength(0);
});

for(const width of [320,390])test(`24-hour travel controls and prechecked routing wait for the route button at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await visitFixture(page,request);const roads=[];
 await page.route('**/api/local/road-routes',r=>{roads.push(r.request().postDataJSON());return r.fulfill({json:{items:[]}});});
 await page.goto('/');await chooseLocation(page);await send(page,'شارژر موبایل نزدیک من برای ساعت ۲۳:۳۰');await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();await page.getByRole('button',{name:'وسیله و زمان حرکت',exact:true}).click();
 const d=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'}),hour=d.getByRole('combobox',{name:'ساعت حرکت: ساعت',exact:true}),minute=d.getByRole('combobox',{name:'ساعت حرکت: دقیقه',exact:true}),consent=d.getByRole('checkbox',{name:/مختصات مبدأ و مقصد/}),route=d.getByRole('button',{name:'دریافت مسیر خیابانی',exact:true});
 await expect(hour.locator('option')).toHaveCount(24);await expect(minute.locator('option')).toHaveCount(60);await expect(hour).toHaveValue('23');await expect(minute).toHaveValue('30');
 await expect(consent).toBeChecked();await expect(route).toBeEnabled();expect(roads).toHaveLength(0);await page.screenshot({path:`../../.local/time24-default-${width}.png`});
 await consent.uncheck();await expect(route).toBeDisabled();await consent.check();expect(roads).toHaveLength(0);
 await route.click();await expect.poll(()=>roads.length).toBeGreaterThan(0);expect(roads.every(r=>r.consent===true)).toBe(true);await layout(page);
});
