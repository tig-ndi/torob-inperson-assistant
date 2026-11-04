import {expect} from '@playwright/test';
export async function mockAssistant(page,request,calls=[],query='گوشی'){
  const products=await(await request.get('/api/products?q='+encodeURIComponent(query)+'&limit=6')).json();
  await page.route('**/api/assistant/status',r=>r.fulfill({json:{ready:true,reason:'ready',remaining_calls:20}}));
  await page.route('**/api/assistant/turn',async r=>{const input=r.request().postDataJSON();calls.push(input);const battery={status:'unspecified',minimum_mah:null};await r.fulfill({json:{request_id:input.request_id,status:'results',query,category_name:products.items[0]?.category_name??null,max_price_toman:null,question:null,question_code:null,products,offer_sort:'price',battery_requirement:battery,need_state:{version:1,topic_query:query,category_name:products.items[0]?.category_name??null,category_cleared:false,max_price_toman:null,budget_needs_input:false,offer_sort:'price',battery_requirement:battery,review_topics:[],pending_requirements:[]},explanation:null}});});return products;
}
export async function send(page,text='گوشی می‌خواهم'){await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(text);await page.getByRole('button',{name:'ارسال پیام',exact:true}).click();}
export async function layout(page){const bounds=await page.evaluate(()=>{const el=document.querySelector('[data-chat-scroll]'),composer=document.querySelector('.message-composer').getBoundingClientRect();return {doc:document.documentElement.scrollWidth,w:innerWidth,scroll:el.scrollWidth,client:el.clientWidth,composer:composer.toJSON(),h:innerHeight};});expect(bounds.doc).toBeLessThanOrEqual(bounds.w+1);expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);expect(bounds.composer.left).toBeGreaterThanOrEqual(0);expect(bounds.composer.right).toBeLessThanOrEqual(bounds.w+1);expect(bounds.composer.bottom).toBeLessThanOrEqual(bounds.h+1);}

export async function acknowledgeVisit(page){
 const button=page.getByRole('button',{name:'با آگاهی از هشدار ادامه می‌دهم',exact:true}).first();
 await page.waitForTimeout(250);
 if(await button.count()){await expect(button).toBeEnabled();if(await page.evaluate(()=>navigator.maxTouchPoints>0))await button.tap();else await button.click();}
}

export async function openJourneyTools(page){
 const details=page.locator('.chat-pane .journey-legacy-tools');
 await expect(details).toHaveCount(1);if(!await details.evaluate(e=>e.open))await details.locator(':scope>summary').click();
}
export async function openJourneyMore(page){
 const details=page.locator('.chat-pane .purchase-journey .journey-more');
 await expect(details).toHaveCount(1);if(!await details.evaluate(e=>e.open))await details.locator(':scope>summary').click();
}
