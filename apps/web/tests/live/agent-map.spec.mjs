import {test,expect} from '@playwright/test';
import {mockAssistant,send} from './helpers.mjs';
test('real map worker renders and supports country view, dark mode and mobile close',async({page,request})=>{
  await mockAssistant(page,request);await page.goto('/');await expect(page.locator('[data-map-panel]')).toBeVisible();await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.screenshot({path:'../../.local/live-qa/chat-map-desktop.png'});await page.getByRole('button',{name:'نمای کل ایران',exact:true}).click();await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.getByRole('button',{name:'ظاهر تیره',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.screenshot({path:'../../.local/live-qa/chat-map-mobile-dark.png'});await page.locator('[data-map-panel]').getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toBeVisible();
});
test('voice can transcribe to an editable draft and read text with mocked audio service',async({page,context,request})=>{
  await context.grantPermissions(['microphone']);await mockAssistant(page,request);let modelCalls=0;page.on('request',r=>{if(r.url().includes('/api/assistant/turn'))modelCalls++;});await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:true}}));await page.route('**/api/voice/transcribe',r=>r.fulfill({json:{text:'گوشی می‌خواهم'}}));let speech=null;await page.route('**/api/voice/synthesize',r=>{speech=r.request().postDataJSON();return r.fulfill({contentType:'audio/wav',body:Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=','base64')});});await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});await page.goto('/');await page.getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();await page.getByRole('button',{name:'شروع ضبط',exact:true}).click();await expect(page.getByRole('button',{name:'توقف و تبدیل به متن',exact:true})).toBeVisible();await page.waitForTimeout(700);await page.getByRole('button',{name:'توقف و تبدیل به متن',exact:true}).click();await expect(page.getByLabel('متن گفتار برای بررسی')).toHaveValue('گوشی می‌خواهم');await page.getByRole('button',{name:'قرار دادن متن در پیام',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue('گوشی می‌خواهم');expect(modelCalls).toBe(0);await send(page);await expect(page.locator('[data-message-role="assistant"]')).not.toHaveCount(0);await page.getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();await page.getByRole('tab',{name:'شنیدن متن',exact:true}).click();await page.getByLabel('متن برای خواندن').fill('این پاسخ آزمایشی را بخوان');await page.getByRole('button',{name:'برام بخون',exact:true}).click();await expect.poll(()=>speech?.text).toBe('این پاسخ آزمایشی را بخوان');
});


test('voice credit failure stays visible without losing text or retrying automatically',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});await mockAssistant(page,request);
  await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:true}}));
  let calls=0;
  const detail='اعتبار حساب AvalAI متصل به کلید صوتی کافی نیست. موجودی همان حساب را در بخش صورتحساب AvalAI بررسی و شارژ کنید؛ افزایش تعداد درخواست در .env این مشکل را رفع نمی‌کند. پس از شارژ، خودتان دوباره پخش یا ضبط را بزنید؛ تکرار خودکار انجام نمی‌شود.';
  await page.route('**/api/voice/synthesize',r=>{calls++;return r.fulfill({status:502,json:{detail}});});
  await page.goto('/');await send(page);
  await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill('متن ارسال‌نشده من');
  await page.getByRole('button',{name:'خواندن این پاسخ',exact:true}).last().click();
  await expect(page.getByText(detail,{exact:true})).toBeVisible();expect(calls).toBe(1);
  await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue('متن ارسال‌نشده من');
  await page.getByRole('button',{name:'گفتن پیام با صدا',exact:true}).click();
  await page.getByRole('tab',{name:'شنیدن متن',exact:true}).click();
  await page.getByLabel('متن برای خواندن').fill('متن آزمایشی برای شنیدن');
  await page.getByRole('button',{name:'برام بخون',exact:true}).click();
  await expect(page.getByRole('dialog').getByText(detail,{exact:true})).toBeVisible();
  await expect(page.getByLabel('متن برای خواندن')).toHaveValue('متن آزمایشی برای شنیدن');
  await page.waitForTimeout(500);expect(calls).toBe(2);
});
