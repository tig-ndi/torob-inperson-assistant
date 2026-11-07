import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';
import {chooseLocation} from './visit-fixtures.mjs';

for(const width of [320,390])test(`destination address is visible with the map drawer collapsed at ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:844});await mockAssistant(page,request,[],'هدفون');
 await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');
 await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();
 await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
 const address=page.locator('.chat-pane .purchase-journey [data-destination-address]');await expect(address).toBeVisible();
 const text=await address.locator('p span').innerText();expect(text.length).toBeGreaterThan(10);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedDestination=value;}}}));
 const copy=address.getByRole('button',{name:'کپی آدرس مقصد',exact:true});
 if(await copy.count()){await copy.click();expect(await page.evaluate(()=>window.__copiedDestination)).toBe(text);await expect(address.getByRole('status')).toContainText('آدرس کپی شد');}
 await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
 const sheet=page.locator('[data-mobile-store-sheet]');await expect(sheet).toHaveAttribute('data-sheet-stop','collapsed');
 await expect(sheet.locator('[data-destination-address]')).toBeVisible();await expect(sheet.locator('[data-destination-address] p')).toContainText(text);
 const bounds=await sheet.locator('[data-destination-address]').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
 await page.reload();await expect(sheet.locator('[data-destination-address]')).toBeVisible();
 await page.screenshot({path:`../../.local/judging-fixes-address-${width}.png`});
});

test('mobile composer keeps a usable draft width with ready replies',async({page,request})=>{
 await page.setViewportSize({width:320,height:700});await mockAssistant(page,request,[],'هدفون');await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام');
 const input=page.getByRole('textbox',{name:'پیام به دستیار خرید'});await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();
 await input.fill('هدفون برای جلسه آنلاین و موسیقی میخواهم');await expect(page.getByRole('button',{name:'پاسخ‌های آماده',exact:true})).toBeVisible();
 expect((await input.boundingBox()).width).toBeGreaterThanOrEqual(140);await layout(page);
 await page.screenshot({path:'../../.local/judging-fixes-composer-320.png'});
});

test('tomorrow and its clock reach insights, offers and arrival requests together',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await mockAssistant(page,request,[],'هدفون');const requests=[];
 page.on('request',r=>{if(r.method()==='POST'&&/visit-insights|arrival-checks/.test(r.url()))requests.push(r.postDataJSON());});
 await page.goto('/');await chooseLocation(page);await send(page,'هدفون میخوام فردا ساعت ده صبح');
 await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();
 await expect.poll(()=>requests.some(r=>r.visit_date&&r.local_time==='10:00')).toBe(true);
 const expected=await page.evaluate(()=>{const f=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=t=>+f.find(x=>x.type===t).value,d=new Date(Date.UTC(p('year'),p('month')-1,p('day')+1));return d.toISOString().slice(0,10);});
 expect(requests.filter(r=>r.visit_date).every(r=>r.visit_date===expected)).toBe(true);
 await expect.poll(()=>requests.some(r=>Array.isArray(r.selections)&&r.visit_date===expected&&r.local_time==='10:00')).toBe(true);
 requests.length=0;
 await page.reload();
 await expect.poll(()=>requests.some(r=>r.visit_date===expected&&r.local_time==='10:00')).toBe(true);
 const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:visit')));
 expect(restored.visitDate).toBe(expected);expect(restored.localTime).toBe('10:00');
 expect(requests.every(r=>r.visit_date===expected&&r.local_time==='10:00')).toBe(true);
});
