import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const output=join(tmpdir(),'torob-header-layout-20261109');
async function controlled(page){
 await page.route('**/api/assistant/**',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.route('**/api/local/trips**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/local/checks**',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
 await page.goto('/');await page.locator('.chat-header').waitFor();
}
for(const width of [320,360,390,1000,1440,2545])for(const theme of ['light','dark'])test(`equal appearance cells and header actions at ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});await controlled(page);
 const header=page.locator('.chat-header'),menu=header.locator('.mobile-header-menu');
 const summary=await menu.locator('summary').boundingBox(),actions=await header.locator('.header-actions').boundingBox(),title=await header.locator('.header-title').boundingBox(),brand=await header.locator('.brand-mark').boundingBox();
 if(width>=1000){expect(actions.x).toBeGreaterThanOrEqual(summary.x+summary.width-1);expect(actions.x+actions.width).toBeLessThanOrEqual(title.x+1);expect(brand.x).toBeGreaterThanOrEqual(title.x+title.width-1);}
 await menu.locator('summary').click();await menu.getByRole('button',{name:'انتخاب ظاهر برنامه',exact:true}).click();
 const group=menu.getByRole('group',{name:'ظاهر برنامه',exact:true});await expect(group).toBeVisible();
 const boxes=await group.locator('button').evaluateAll(buttons=>buttons.map(button=>{const b=button.getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,labelLeft:label.left,labelRight:label.right,right:b.right};}));
 expect(boxes).toHaveLength(3);for(const box of boxes){expect(Math.abs(box.width-boxes[0].width)).toBeLessThan(1);expect(Math.abs(box.y-boxes[0].y)).toBeLessThan(1);expect(box.height).toBeGreaterThanOrEqual(64);expect(box.labelLeft).toBeGreaterThanOrEqual(box.x);expect(box.labelRight).toBeLessThanOrEqual(box.right);}
 const bounds=await group.boundingBox(),panel=await menu.locator('.mobile-header-options').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(panel.x);expect(bounds.x+bounds.width).toBeLessThanOrEqual(panel.x+panel.width+1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(panel.y+panel.height+1);
 await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`appearance-${width}-${theme}.png`)});
 await group.getByRole('button',{name:'ظاهر تیره',exact:true}).click();await expect(page.locator('.agent-app')).toHaveClass(/theme-dark/);await expect(group).toHaveCount(0);
});
for(const [width,height] of [[320,568],[360,640],[390,844],[844,390]])test(`focused map marker stays below phone header at ${width}`,async({page})=>{
 await page.setViewportSize({width,height});await controlled(page);await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();await page.locator('[data-map-ready]').waitFor();
 // Reproduce the worst overlap regardless of camera/tiles: focus a marker
 // positioned directly under the header, with a deliberately high local z-index.
 const overlap=await page.evaluate(()=>{
  const header=document.querySelector('[data-mobile-map-header]'),map=document.querySelector('[data-map-ready]'),h=header.getBoundingClientRect(),r=map.getBoundingClientRect();
  const marker=document.createElement('button');marker.className='real-pin chosen';marker.textContent='۱۱۷٬۹۰۰٬۰۰۰ تومان';marker.style.cssText=`position:absolute;left:${h.x-r.x+60}px;top:${h.y-r.y+8}px;width:180px;height:44px;z-index:999999`;map.append(marker);marker.focus({preventScroll:true});
  const box=marker.getBoundingClientRect(),point={x:Math.max(h.left,box.left)+8,y:Math.max(h.top,box.top)+8};return {point,headerAbove:header.contains(document.elementFromPoint(point.x,point.y))};
 });expect(overlap.headerAbove).toBe(true);
 await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`marker-layer-${width}.png`)});
 await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.locator('[data-map-panel]')).toBeHidden();
});
