import {test,expect} from '@playwright/test';
import {mockAssistant,layout} from './helpers.mjs';

for(const [width,height] of [[320,568],[390,844],[412,915],[844,390]])test(`mobile composer stays compact after typing, clearing and map return ${width}x${height}`,async({page,request})=>{
  await page.setViewportSize({width,height});const calls=[];await mockAssistant(page,request,calls);await page.goto('/');
  const input=page.getByRole('textbox',{name:'پیام به دستیار خرید'}),form=page.locator('.message-composer');
  const boxHeight=()=>form.evaluate(e=>e.getBoundingClientRect().height);
  await expect.poll(boxHeight).toBeLessThanOrEqual(100);
  await input.fill('یک پیام طولانی برای بررسی اندازهٔ کادر نوشتن\n'.repeat(15));
  expect(await input.evaluate(e=>e.clientHeight)).toBeLessThanOrEqual(96);
  expect(await input.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  expect(await boxHeight()).toBeLessThanOrEqual(155);
  await input.fill('');await expect.poll(boxHeight).toBeLessThanOrEqual(100);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();
  await expect.poll(boxHeight).toBeLessThanOrEqual(100);
  await input.fill('پیام کوتاه');await page.setViewportSize({width:width===320?390:320,height});
  await expect.poll(boxHeight).toBeLessThanOrEqual(100);await layout(page);expect(calls).toHaveLength(0);
  await page.screenshot({path:`../../.local/live-qa/compact-composer-${width}.png`});
});
