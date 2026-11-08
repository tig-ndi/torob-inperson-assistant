import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

test('an ordinal choice opens that visible product without another model call',async({page,request})=>{
 const calls=[],source=await mockAssistant(page,request,calls);await page.setViewportSize({width:390,height:844});await page.goto('/');await send(page);await send(page,'همین دومی رو میخوام');
 await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','stores');await expect(page.locator('[data-active-tool]')).toContainText(source.items[1].persian_title);expect(calls).toHaveLength(1);await layout(page);
});

test('a pending requirement cannot be bypassed by choosing an ordinal',async({page,request})=>{
 await mockAssistant(page,request);const inputs=[];await page.route('**/api/assistant/turn',r=>{const body=r.request().postDataJSON();inputs.push(body);return r.fulfill({json:{request_id:body.request_id,status:'needs_input',query:'کفش',category_name:null,max_price_toman:'3000000',question:'سایز هنوز فیلتر قابل اتکایی ندارد؛ بدون این شرط ادامه بدهیم؟',question_code:'unsupported_filter',products:null,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},need_state:{version:1,topic_query:'کفش',category_name:null,category_cleared:false,max_price_toman:'3000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[{key:'سایز',source_text:'سایز ۳۸',status:'unsupported'}]},explanation:null}});});await page.goto('/');await send(page,'کفش سایز ۳۸ می‌خواهم');await send(page,'همین اولی رو میخوام');await expect.poll(()=>inputs.length).toBe(2);expect(inputs[1].context_need_state.pending_requirements[0].key).toBe('سایز');await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','decide');
});

for(const size of [{width:320,height:568},{width:390,height:844},{width:1440,height:900}])test(`comparison leads with a compact price summary at ${size.width}`,async({page,request})=>{
 await mockAssistant(page,request);await page.setViewportSize(size);await page.goto('/');await send(page);await page.getByRole('checkbox',{name:'مقایسه',exact:true}).nth(0).check();await page.getByRole('checkbox',{name:'مقایسه',exact:true}).nth(1).check();await page.getByRole('button',{name:'مقایسهٔ انتخاب‌ها',exact:true}).click();const d=page.getByRole('dialog',{name:'مقایسهٔ کامل انتخاب‌ها'});await expect(d.getByRole('region',{name:'جمع‌بندی قیمت انتخاب‌ها'})).toContainText('قیمت');expect(await d.locator('.dialog-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 const first=d.locator('.comparison-table tbody tr').first();await expect(first).toBeVisible();const tableHeading=await d.locator('.comparison-table thead').first().boundingBox();if(size.width<=600)expect(tableHeading.height).toBeLessThan(145);
 await d.getByText('نام کامل و تصاویر گزینه‌ها',{exact:true}).click();await expect(d.locator('.comparison-image-grid article')).toHaveCount(2);await d.locator('.dialog-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`../../.local/live-qa/improved-comparison-${size.width}.png`});await page.keyboard.press('Escape');await layout(page);
});

test('desktop ready replies explain their purpose on hover',async({page,request})=>{
 await page.setViewportSize({width:1440,height:900});await mockAssistant(page,request);await page.goto('/');await send(page);await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('همین مرحلهٔ خرید');await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await expect(page.getByRole('dialog',{name:'پاسخ‌های آماده',exact:true})).toBeVisible();
});

test('seller rejection has one alternatives request and one result section',async({page,request})=>{
 await mockAssistant(page,request);let created=null,lookups=0;
 page.on('request',r=>{if(r.url().includes('/api/followups/alternatives'))lookups++;});
 try{
  await page.goto('/');await send(page);await page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first().click();await page.locator('[data-offer]').first().getByRole('button',{name:'بررسی با فروشگاه',exact:true}).click();await page.getByRole('button',{name:'نمایش آزمایشی؛ پاسخ و رزرو',exact:true}).click();const pending=page.waitForResponse(r=>r.url().endsWith('/api/local/checks')&&r.request().method()==='POST');await page.getByRole('button',{name:'شروع استعلام هم‌زمان',exact:true}).click();created=await(await pending).json();const d=page.getByRole('dialog',{name:'نمایش آزمایشی؛ پاسخ و رزرو'}),card=d.locator('[data-check-offer]').first();await card.getByRole('button',{name:'پاسخ در نقش فروشنده',exact:true}).click();await d.getByLabel('پاسخ آزمایشی فروشنده').selectOption('out_of_stock');await d.getByRole('button',{name:'ثبت پاسخ آزمایشی فروشنده',exact:true}).click();await d.getByText('پاسخ ثبت شد؛ پنل خریدار به‌روزرسانی می‌شود.').waitFor();await d.getByRole('button',{name:'بازگشت به استعلام‌ها',exact:true}).click();await expect.poll(()=>lookups).toBe(1);await card.getByRole('button',{name:'پیداکردن جایگزین این فروشگاه',exact:true}).click();await expect(page.locator('.auto-alternatives')).toHaveCount(1);await expect(page.locator('.followup-alternatives')).toHaveCount(0);await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen','contact');await page.waitForTimeout(300);expect(lookups).toBe(1);
 }finally{if(created?.id)await request.delete('/api/local/checks/'+created.id);}
});
