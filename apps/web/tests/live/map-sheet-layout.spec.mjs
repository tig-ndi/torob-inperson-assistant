import {test,expect} from '@playwright/test';
import {mockAssistant,send} from './helpers.mjs';

async function assertSeparated(page){
 const sheet=page.locator('[data-mobile-store-sheet]'),body=sheet.locator('.map-sheet-content'),nav=sheet.locator('.mobile-view-switch');
 await expect(body.locator('.purchase-journey')).toBeVisible();
 await expect.poll(async()=>{const [view,footer]=await Promise.all([body.boundingBox(),nav.boundingBox()]);return view.y+view.height<=footer.y+1;}).toBe(true);
 for(const button of await nav.locator('button').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual((await page.viewportSize()).height+1);}
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
}

for(const size of [{width:320,height:568},{width:390,height:844},{width:412,height:915,safe:true},{width:740,height:360}])test(`selected mobile store stays above actions and navigation at ${size.width}x${size.height}`,async({page,request})=>{
  await page.setViewportSize({width:size.width,height:size.height});const products=await mockAssistant(page,request);
  const longName='گوشی سامسونگ مدل A07 دو سیم‌کارت با حافظه ۱۲۸ گیگابایت و رم ۶ گیگابایت، نسخهٔ مخصوص بازار ایران';
  products.items.forEach(p=>{p.persian_title=longName;});
  await page.route(/\/api\/products\/[^/?]+$/,async r=>{const response=await r.fetch(),data=await response.json();data.product.persian_title=longName;await r.fulfill({json:data});});
  await page.goto('/');
  if(size.safe)await page.addStyleTag({content:'.mobile-map-sheet{padding-bottom:34px!important}'});
  await send(page);await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
  const draft='قبل از حرکت با فروشگاه بررسی کنم';await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(draft);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await assertSeparated(page);
  await page.screenshot({path:`../../.local/live-qa/map-sheet-fixed-${size.width}x${size.height}.png`});
  await expect(page.getByText('خط نقشه مستقیم است؛ مسیر خیابانی را در مسیریاب ببین.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await assertSeparated(page);
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await assertSeparated(page);
  await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await assertSeparated(page);
});
