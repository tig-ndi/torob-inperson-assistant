import {openJourneyTools} from './helpers.mjs';
import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

async function chooseMultiStore(page,request){
  const products=await mockAssistant(page,request);
  const index=products.items.slice(0,3).findIndex(p=>p.offer_summary.offer_count>1);
  expect(index).toBeGreaterThanOrEqual(0);
  const source=await(await request.get(`/api/products/${products.items[index].product_id}/offers`)).json();
  expect(new Set(source.items.map(o=>o.shop_id)).size).toBeGreaterThan(1);
  await page.goto('/');await send(page);await page.getByRole('button',{name:'دیدن فروشگاه‌ها'}).nth(index).click();
  await expect(page.locator('[data-offer]')).toHaveCount(source.items.length);
  return source.items;
}

for(const width of [320,390])test(`mobile map drawer preserves conversation and camera at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:844});const offers=await chooseMultiStore(page,request);
  const draft='قبل از رفتن موجودی این فروشگاه را بررسی کنیم';
  await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(draft);
  await page.locator('[data-chat-scroll]').evaluate(el=>el.scrollTop=130);
  await page.waitForTimeout(350);
  const scroll=await page.locator('[data-chat-scroll]').evaluate(el=>el.scrollTop),messages=await page.locator('[data-message-role]').count();
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
  const panel=page.locator('[data-map-panel]'),sheet=page.locator('[data-mobile-store-sheet]');
  await expect(panel).toBeVisible();await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');await page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','peek');
  await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});
  const canvas=await page.locator('.maplibregl-canvas').elementHandle();
  const handle=page.getByRole('button',{name:'تغییر ارتفاع فهرست فروشگاه‌ها',exact:true});
  const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-430,{steps:12});await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-sheet-stop','full');
  const offer=offers[1];await page.locator(`[data-map-choice="${offer.offer_id}"]`).click();
  await expect(page.locator(`[data-map-choice="${offer.offer_id}"]`)).toHaveAttribute('aria-pressed','true');
  const pin=page.locator('.real-pin.chosen');await expect(pin).toHaveCount(1);await expect(pin).toHaveAttribute('aria-label',new RegExp(offer.shop.name));
  await expect.poll(async()=>{const p=await pin.boundingBox(),s=await sheet.boundingBox();return p.y+p.height<=s.y&&p.x>=0&&p.x+p.width<=width;}).toBe(true);
  expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.waitForTimeout(350);const pinBefore=await pin.boundingBox();await page.screenshot({path:`../../.local/live-qa/map-sheet-expanded-${width}.png`});
  await panel.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await expect(panel).toBeHidden();
  await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','stores');expect(await page.locator('[data-message-role]').count()).toBe(messages);
  expect(await page.locator('[data-chat-scroll]').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);await layout(page);
  await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await expect(sheet).toHaveAttribute('data-sheet-stop','full');expect(await canvas.evaluate(el=>el===document.querySelector('.maplibregl-canvas'))).toBe(true);await expect(pin).toHaveAttribute('aria-label',new RegExp(offer.shop.name));await expect.poll(async()=>Math.abs((await pin.boundingBox()).y-pinBefore.y)).toBeLessThan(2);
  await handle.focus();await page.keyboard.press('ArrowUp');await expect(sheet).toHaveAttribute('data-sheet-stop','peek');await expect.poll(async()=>Math.round((await sheet.boundingBox()).height)).toBeGreaterThanOrEqual(280);await expect.poll(async()=>{const selectedRow=await page.locator('.map-store-choice.selected').boundingBox(),listBox=await sheet.locator('.map-sheet-content').boundingBox();return selectedRow.y>=listBox.y-1&&selectedRow.y+selectedRow.height<=listBox.y+listBox.height+1;}).toBe(true);await page.waitForTimeout(350);await page.screenshot({path:`../../.local/live-qa/map-sheet-peek-${width}.png`});
  await handle.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'بررسی و شروع خرید از این فروشگاه',exact:true}).click();await expect(panel.locator('[data-mobile-journey]')).toHaveAttribute('data-purchase-stage','ready');await panel.getByRole('button',{name:'رفتن به گفت‌وگو',exact:true}).click();await expect(panel).toBeHidden();await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','contact');await openJourneyTools(page);await expect(page.getByRole('button',{name:'کپی پیش‌نویس'})).toBeVisible();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);
});

test('desktop shop selection stays in floating chat and focuses the unobscured map',async({page,request})=>{
  await page.setViewportSize({width:1440,height:900});const offers=await chooseMultiStore(page,request);
  const canvas=await page.locator('.maplibregl-canvas').elementHandle();
  await page.locator(`[data-offer="${offers[1].offer_id}"]`).getByRole('button',{name:new RegExp(offers[1].shop.name)}).click();
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','stores');
  await expect.poll(async()=>{const pin=await page.locator('.real-pin.chosen').boundingBox(),chat=await page.locator('.chat-pane').boundingBox();return pin&&pin.x>=0&&pin.x+pin.width<chat.x;}).toBe(true);
  await expect(page.locator('[data-map-ready]')).toHaveAttribute('data-map-ready','true',{timeout:25000});await page.screenshot({path:'../../.local/live-qa/floating-desktop-selected.png'});
  await page.locator(`[data-offer="${offers[1].offer_id}"]`).getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();await openJourneyTools(page);await expect(page.getByRole('button',{name:'کپی پیش‌نویس'})).toBeVisible();expect(await canvas.evaluate(el=>el===document.querySelector('.maplibregl-canvas'))).toBe(true);await expect(page.locator('[data-map-panel]')).toBeVisible();await layout(page);
});
