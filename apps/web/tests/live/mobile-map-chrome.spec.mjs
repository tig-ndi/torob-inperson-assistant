import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mockAssistant,send} from './helpers.mjs';

const output=join(tmpdir(),'torob-map-chrome-20261109');
async function setup(page,request){
 await mockAssistant(page,request,[],'هدفون');
 await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.goto('/');
}
async function geometry(page){
 const boxes=await page.locator('.map-message-form input,.map-message-form button').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()).map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,name:e.getAttribute('aria-label'),x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};}));
 for(const b of boxes){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(page.viewportSize().width);expect(b.width,b.name).toBeGreaterThanOrEqual(b.tag==='INPUT'?40:44);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y+.5||b.bottom<=a.y+.5,`${a.name} overlaps ${b.name}`).toBe(true);}
}
for(const [width,height] of [[320,568],[360,640],[390,844],[844,390]])test(`mobile map input stays spacious with and without a position at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height});await setup(page,request);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 const input=page.getByRole('textbox',{name:'پیام به دستیار روی نقشه',exact:true});await expect(page.getByRole('button',{name:'ارسال پیام روی نقشه',exact:true})).toHaveCount(0);await geometry(page);
 const draft='گوشی با بودجه بیست میلیون می‌خواهم';await input.fill(draft);await expect(page.getByRole('button',{name:'ارسال پیام روی نقشه',exact:true})).toBeVisible();await geometry(page);
 await page.getByRole('button',{name:'موقعیت جست‌وجو',exact:true}).click();await page.getByLabel('محلهٔ تهران (مرکز تقریبی)').selectOption('d6');await expect(input).toHaveValue(draft);await expect(page.locator('.map-prompt-field .map-prompt-symbol')).toBeVisible();await geometry(page);
 await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await expect(page.locator('.chat-dialog')).toBeVisible();await page.locator('.chat-dialog').getByRole('button',{name:'بستن',exact:true}).click();await expect(input).toHaveValue(draft);
 await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`header-${width}.png`)});
 await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true})).toHaveValue(draft);
});

test('desktop retains full shop popup with address and all offer actions',async({page,request})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page,request);await send(page,'هدفون می‌خواهم');await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
 await page.locator('button.real-pin').first().focus();const popup=page.getByRole('region',{name:'مشخصات فروشگاه روی نقشه',exact:true});await expect(popup).toBeVisible();await expect(popup.getByRole('button',{name:'انتخاب این پیشنهاد',exact:true}).first()).toBeVisible();await expect(popup.getByRole('button',{name:'افزودن پیشنهاد به مقایسه',exact:true}).first()).toBeVisible();await expect(popup.getByRole('button',{name:'بررسی حضوری این پیشنهاد',exact:true}).first()).toBeVisible();await expect(popup.locator('h3+p')).not.toBeEmpty();await expect(page.locator('.map-shop-choices')).toHaveCount(0);await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'desktop-popup.png')});
});
