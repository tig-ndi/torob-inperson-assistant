import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

test('an attributed charger for a phone is one purchase and only-charger clears an old queue',async({page,request})=>{
 const calls=[];await mockAssistant(page,request,calls,'شارژر');
 await page.addInitScript(()=>sessionStorage.setItem('inperson-journey:v2:purchaseQueue',JSON.stringify(['گوشی','شارژر'])));
 await page.goto('/');await send(page,'فقط شارژر تایپ سی برای گوشی میخوام، زیر یک میلیون');
 await expect.poll(()=>calls.length).toBe(1);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','results');
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:purchaseQueue')))).toEqual([]);await layout(page);
});

for(const width of [320,1440])test(`charger comparison presents normalized source evidence without horizontal scrolling at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:width===320?568:900});const products=await mockAssistant(page,request,[],'شارژر');
 const a=products.items[0],b=products.items[1];
 a.category_name=b.category_name='شارژر گوشی';a.persian_title='شارژر ۱۵ وات';b.persian_title='شارژر ۲۵ وات';
 a.specs=[{section:'مشخصات کلی',key:'نوع درگاه خروجی',value:'Type-C'},{section:'مشخصات کلی',key:'نام و مدل',value:'شارژر ۱۵ وات'}];
 b.specs=[{section:'مشخصات کلی',key:'تعداد درگاه خروجی',value:'یک عدد TYPE-C'},{section:'مشخصات کلی',key:'حداکثر توان خروجی',value:'25 وات'}];
 await page.goto('/');await send(page,'شارژر گوشی میخوام');await page.getByRole('checkbox',{name:'مقایسه',exact:true}).nth(0).check();await page.getByRole('checkbox',{name:'مقایسه',exact:true}).nth(1).check();await page.getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'}),power=dialog.locator('[data-comparison-field="charger:power"]');
 await expect(power).toContainText('۱۵ وات');await expect(power).toContainText('۲۵ وات');await expect(power).toContainText('عنوان/نام‌ومدل');await expect(power).not.toContainText('در منبع ثبت نشده');
 const connector=dialog.locator('[data-comparison-field="charger:connector"]');await expect(connector.locator('td')).toHaveCount(2);for(const cell of await connector.locator('td').all())await expect(cell).toContainText('USB Type-C');
 expect(await dialog.locator('.dialog-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.screenshot({path:`../../.local/review-repairs-20261104/comparison-${width}.png`});
});
