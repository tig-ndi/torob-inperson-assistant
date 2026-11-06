import {test,expect} from '@playwright/test';
import {mockAssistant,send} from './helpers.mjs';

async function assertSeparated(page){
 const sheet=page.locator('[data-mobile-store-sheet]'),body=sheet.locator('.map-sheet-content'),nav=sheet.locator('.mobile-view-switch');
 await expect(body.locator('.map-store-choice.selected')).toBeVisible();await expect(body.locator('.purchase-journey')).toHaveCount(0);
 await expect.poll(async()=>{const [view,footer]=await Promise.all([body.boundingBox(),nav.boundingBox()]);return view.y+view.height<=footer.y+1;}).toBe(true);
 for(const button of await nav.locator('button').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual((await page.viewportSize()).height+1);}
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
}

for(const size of [{width:320,height:568},{width:390,height:844},{width:412,height:915,safe:true},{width:740,height:360},{width:390,height:844,dark:true}])test(`selected mobile store stays above actions and navigation at ${size.width}x${size.height}${size.dark?' dark':''}`,async({page,request})=>{
  await page.emulateMedia({colorScheme:size.dark?'dark':'light'});await page.setViewportSize({width:size.width,height:size.height});const products=await mockAssistant(page,request);
  const longName='گوشی سامسونگ مدل A07 دو سیم‌کارت با حافظه ۱۲۸ گیگابایت و رم ۶ گیگابایت، نسخهٔ مخصوص بازار ایران';
  products.items.forEach(p=>{p.persian_title=longName;});
  await page.route(/\/api\/products\/[^/?]+$/,async r=>{const response=await r.fetch(),data=await response.json();data.product.persian_title=longName;await r.fulfill({json:data});});
  await page.goto('/');
  if(size.safe)await page.addStyleTag({content:'.mobile-map-sheet{padding-bottom:34px!important}'});
  await send(page);await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
  const draft='قبل از حرکت با فروشگاه بررسی کنم';await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(draft);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await assertSeparated(page);
  await page.screenshot({path:`../../.local/live-qa/map-sheet-fixed-${size.width}x${size.height}${size.dark?'-dark':''}.png`});
  await expect(page.getByText('خط نقشه مستقیم است؛ مسیر خیابانی را در مسیریاب ببین.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await assertSeparated(page);
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await assertSeparated(page);
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await assertSeparated(page);
  const sheet=page.locator('[data-mobile-store-sheet]'),journey=page.locator('[data-mobile-journey]'),handle=page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true});
  const other=sheet.locator('.map-store-choice:not(.selected)').first();if(await other.count()){const id=await other.getAttribute('data-map-choice');await other.click();await expect(sheet.locator('.map-store-choice.selected')).toHaveAttribute('data-map-choice',id);}
  const selected=await page.locator('.map-store-choice.selected').getAttribute('data-map-choice');
  await page.getByRole('button',{name:'جمع کردن فهرست برای دیدن کامل نقشه',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');await expect(handle).toHaveAttribute('aria-expanded','false');
  await expect.poll(async()=>Math.round((await sheet.boundingBox()).height)).toBe(size.safe?78:44);await expect(sheet.locator('.map-sheet-content')).toBeHidden();await expect(journey.getByRole('list',{name:'مراحل مراجعه'}).locator('li')).toHaveCount(4);
  await expect.poll(async()=>{const [j,s]=await Promise.all([journey.boundingBox(),sheet.boundingBox()]);return j.y+j.height<s.y;}).toBe(true);
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');
  await handle.focus();await page.keyboard.press('ArrowUp');await expect(sheet).toHaveAttribute('data-sheet-stop','peek');await expect(page.locator('.map-store-choice.selected')).toHaveAttribute('data-map-choice',selected);await assertSeparated(page);
  await handle.focus();await page.keyboard.press('End');await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');await expect(handle).toBeFocused();
  await expect.poll(async()=>Math.round((await sheet.boundingBox()).height)).toBe(size.safe?78:44);const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-150,{steps:8});await page.mouse.up();await expect(sheet).not.toHaveAttribute('data-sheet-stop','collapsed');
  await expect.poll(async()=>Math.round((await sheet.boundingBox()).height)).toBeGreaterThan(size.safe?78:44);await page.waitForTimeout(280);const raised=await handle.boundingBox();await page.mouse.move(raised.x+raised.width/2,raised.y+raised.height/2);await page.mouse.down();await page.mouse.move(raised.x+raised.width/2,size.height-15,{steps:10});await page.mouse.up();await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');
  await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.screenshot({path:`../../.local/live-qa/map-sheet-collapsed-${size.width}x${size.height}${size.dark?'-dark':''}.png`});
});
