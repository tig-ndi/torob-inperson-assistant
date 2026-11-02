import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

for(const width of [320,390,1000,1440])test(`direct theme controls fit and preserve the journey at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:'dark'});
  await mockAssistant(page,request);await page.goto('/');
  const app=page.locator('.agent-app'),draft=page.getByRole('textbox',{name:'پیام به دستیار خرید'});
  await draft.fill('پیش از رفتن موجودی را بررسی کنیم');
  await expect(page.getByRole('button',{name:'تنظیمات',exact:true})).toHaveCount(0);
  await expect(app).toHaveClass(/theme-dark/);
  if(width<1000)await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.getByRole('button',{name:'ظاهر روشن',exact:true}).click();await expect(app).toHaveClass(/theme-light/);
  if(width<1000)await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.getByRole('button',{name:'ظاهر تیره',exact:true}).click();await expect(app).toHaveClass(/theme-dark/);
  if(width<1000)await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.getByRole('button',{name:'ظاهر سیستم',exact:true}).click();await page.emulateMedia({colorScheme:'light'});await expect(app).toHaveClass(/theme-light/);
  if(width<1000)await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await expect(page.getByRole('button',{name:'ظاهر سیستم',exact:true})).toHaveAttribute('aria-pressed','true');if(width<1000)await page.keyboard.press('Escape');
  if(width<1000)await page.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();await page.getByRole('button',{name:'ظاهر تیره',exact:true}).click();await page.reload();await expect(app).toHaveClass(/theme-dark/);
  await expect(draft).toHaveValue('پیش از رفتن موجودی را بررسی کنیم');
  const header=await page.locator('.chat-header').boundingBox();
  for(const button of await page.locator('.chat-header button').all()){
    const box=await button.boundingBox();expect(box.x).toBeGreaterThanOrEqual(header.x);expect(box.x+box.width).toBeLessThanOrEqual(header.x+header.width+1);
    if(width<1000){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  }
  await page.mouse.move(0,899);await page.screenshot({path:`../../.local/live-qa/theme-controls-${width}.png`});await layout(page);
});

for(const width of [390,1440])test(`comparison headings leave the viewport when scrolling at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:900});const products=await mockAssistant(page,request);
  products.items.slice(0,2).forEach((p,i)=>{p.specs=Array.from({length:30},(_,n)=>({section:'مشخصات آزمون',key:`مشخصه ${n}`,value:`مقدار ${i}-${n}`}));});
  await page.goto('/');await send(page);const checks=page.getByRole('checkbox',{name:'مقایسه',exact:true});await checks.nth(0).click();await checks.nth(1).click();
  await page.getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'}),scroll=dialog.locator('.dialog-content');
  await expect(dialog.locator('.comparison-table').first()).toBeVisible();
  await dialog.locator('.comparison-all-fields summary').click();await scroll.evaluate(el=>{el.scrollTop=1200;});
  await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(1000);
  const top=(await scroll.boundingBox()).y;
  for(const selector of ['.comparison-tabs','.comparison-table thead']){
    const item=dialog.locator(selector).first();expect(await item.evaluate(el=>getComputedStyle(el).position)).toBe('static');
    const box=await item.boundingBox();expect(box.y+box.height).toBeLessThan(top);
  }
  await expect(dialog.getByRole('button',{name:'بستن',exact:true})).toBeVisible();
  expect(await scroll.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:`../../.local/live-qa/comparison-scroll-fixed-${width}.png`});
});

test('Tehran time is filled automatically while now remains live and custom time survives reopening',async({page,request})=>{
  await page.setViewportSize({width:390,height:900});
  await page.clock.install({time:new Date('2026-10-30T20:00:00Z')});
  await mockAssistant(page,request);await page.goto('/');await send(page);
  await page.locator('.need-summary summary').click();await page.locator('.need-actions').getByRole('button',{name:'پیاده',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'وسیله، مسیر و زمان رسیدن'}),time=dialog.getByLabel('ساعت حرکت',{exact:true});
  await expect(time).toHaveValue('23:30');
  await page.clock.fastForward(60000);await expect(time).toHaveValue('23:31');
  await time.fill('18:45');await page.clock.fastForward(60000);await expect(time).toHaveValue('18:45');
  await page.keyboard.press('Escape');await expect(page.locator('.need-summary')).toContainText('۱۸:۴۵');
  await page.getByRole('button',{name:'شرایط خرید',exact:true}).click();await expect(page.getByLabel('ساعت مراجعه',{exact:true})).toHaveValue('18:45');
  await page.getByRole('button',{name:'بررسی برای همین الان',exact:true}).click();await expect(page.getByLabel('ساعت مراجعه',{exact:true})).toHaveValue('23:32');
  await page.keyboard.press('Escape');await expect(page.locator('.need-summary')).toContainText('حرکت اکنون');
  await page.locator('.need-actions').getByRole('button',{name:'پیاده',exact:true}).click();await expect(time).toHaveValue('23:32');
  await time.fill('10:15');await page.getByRole('button',{name:'حرکت همین الان',exact:true}).click();await expect(time).toHaveValue('23:32');
  await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:'شرایط خرید',exact:true}).click();await expect(page.getByLabel('ساعت مراجعه',{exact:true})).toHaveValue('23:32');
});
