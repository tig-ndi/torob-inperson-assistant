import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

for(const width of [320,1440])test(`comparison starts compact and keeps every detail available at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:900});const products=await mockAssistant(page,request);
  products.items.slice(0,2).forEach((p,i)=>{p.brand_name='سازندهٔ مشترک';p.specs=Array.from({length:80},(_,n)=>({section:'جزئیات',key:`مشخصه ${n}`,value:`مدل ${i} مقدار ${n}`}));});
  await page.goto('/');await send(page);const checks=page.getByRole('checkbox',{name:'مقایسه',exact:true});await checks.nth(0).click();await checks.nth(1).click();await page.getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'}),advanced=dialog.locator('.comparison-all-fields');
  await expect(advanced).not.toHaveAttribute('open','');expect(await dialog.locator('.dialog-content').evaluate(el=>el.scrollHeight)).toBeLessThan(2500);
  await expect(dialog.locator('[data-comparison-field="brand"]').first()).toBeVisible();await dialog.getByRole('checkbox',{name:'فقط تفاوت‌ها را نشان بده'}).check();await expect(dialog.locator('[data-comparison-field="brand"]')).toHaveCount(0);
  await dialog.getByRole('checkbox',{name:'فقط تفاوت‌ها را نشان بده'}).uncheck();await advanced.locator('summary').first().click();await expect(dialog.getByRole('rowheader',{name:'جزئیات · مشخصه 79',exact:true})).toBeVisible();
  expect(await advanced.innerText()).not.toMatch(/evidence_count|capacity_mah|exact_source_value/);
  if(width<1000)await expect(dialog.locator('.comparison-mobile-label').first()).toContainText(products.items[0].persian_title);
  await page.screenshot({path:`../../.local/live-qa/judging-compact-comparison-${width}.png`});await page.keyboard.press('Escape');await layout(page);
});

test('unavailable seller response automatically prepares alternatives without changing the journey',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});const products=await mockAssistant(page,request),index=products.items.slice(0,3).findIndex(p=>p.offer_summary.offer_count>1),product=products.items[index];expect(product).toBeTruthy();
  const offers=await(await request.get(`/api/products/${product.product_id}/offers`)).json(),origin=offers.items[0],other=offers.items.find(o=>o.shop_id!==origin.shop_id);expect(other).toBeTruthy();
  const template=await(await request.post('/api/followups/alternatives',{data:{product_id:origin.product_id,offer_id:origin.offer_id,shop_id:origin.shop_id,outcome:'out_of_stock',outcome_source:'simulated'}})).json();
  template.alternatives.items=[other];template.alternatives.has_more=false;let alternatives=0;
  await page.route('**/api/followups/alternatives',r=>{alternatives++;return r.fulfill({json:template});});
  await page.goto('/');await send(page);await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).nth(index).click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();
  const draft='خرید بعدی را از همین‌جا ادامه می‌دهم';await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(draft);
  let batch;
  try{
    await page.getByRole('button',{name:'استعلام هم‌زمان از فروشگاه‌ها',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/local/checks')&&r.request().method()==='POST');await page.getByRole('button',{name:'شروع استعلام هم‌زمان',exact:true}).click();batch=await(await response).json();
    const card=page.locator(`[data-check-offer="${origin.offer_id}"]`);await card.getByRole('button',{name:'پاسخ در نقش فروشنده',exact:true}).click();await page.getByLabel('پاسخ آزمایشی فروشنده',{exact:true}).selectOption('out_of_stock');await page.getByRole('button',{name:'ثبت پاسخ آزمایشی فروشنده',exact:true}).click();await page.getByRole('button',{name:'بازگشت به استعلام‌ها',exact:true}).click();await page.keyboard.press('Escape');
    const section=page.getByRole('region',{name:'جایگزین‌های خودکار پاسخ فروشنده'});await expect(section).toContainText(other.shop.name);await expect(section.getByRole('button',{name:'بررسی این جایگزین'})).toBeVisible();expect(alternatives).toBe(1);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','contact');await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);await layout(page);
  }finally{if(batch)await request.delete('/api/local/checks/'+batch.id);}
});
