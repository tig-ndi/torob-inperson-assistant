import {test,expect} from '@playwright/test';
import {mockAssistant,send} from './helpers.mjs';

test('offer comparison chosen from map previews survives loading the agent comparison',async({page,request})=>{
  await page.setViewportSize({width:1440,height:900});const calls=[];await mockAssistant(page,request,calls);await page.goto('/');await send(page);
  await expect(page.locator('[data-map-shop]').first()).toBeVisible();await page.getByRole('button',{name:'نمایش همهٔ فروشگاه‌ها',exact:true}).click();
  const pin=page.locator('[data-map-shop]').last();await expect.poll(async()=>{const r=await pin.boundingBox();return r.y>90&&r.y+r.height<790;}).toBe(true);await pin.focus();
  const details=page.getByRole('region',{name:'مشخصات فروشگاه روی نقشه'});await expect(details).toBeVisible();await details.getByRole('button',{name:'افزودن پیشنهاد به مقایسه',exact:true}).first().click();
  await expect(page.locator('.real-pin.chosen')).toHaveCount(1);await send(page,'مقایسه میخوام');await expect(page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'})).toBeVisible();await expect(page.getByRole('button',{name:'فروشگاه‌ها · ۱',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:/حذف پیشنهاد/})).toHaveCount(1);expect(calls).toHaveLength(1);
});
