import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

test('messages, waiting feedback and clarification history remain visible in the same chat',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});const calls=[];await mockAssistant(page,request,calls);
  let release;const gate=new Promise(resolve=>{release=resolve;});let first=true;
  await page.route('**/api/assistant/turn',async route=>{
    if(!first){await route.fallback();return;}first=false;
    const input=route.request().postDataJSON(),battery={status:'unspecified',minimum_mah:null};
    await gate;await route.fulfill({json:{request_id:input.request_id,status:'needs_input',query:null,category_name:null,max_price_toman:null,question:'برای چه نوع کالایی کمکت کنم؟',question_code:'product_kind',products:null,offer_sort:'price',battery_requirement:battery,need_state:{version:1,topic_query:null,category_name:null,category_cleared:false,max_price_toman:null,budget_needs_input:false,offer_sort:'price',battery_requirement:battery,review_topics:[],pending_requirements:[]},explanation:null}});
  });
  await page.goto('/');await send(page,'برای انتخاب کمکم کن');
  await expect(page.locator('[data-message-role="user"]')).toContainText('برای انتخاب کمکم کن');
  await expect(page.getByText('در حال بررسی درخواستت…',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'توقف بررسی',exact:true})).toBeVisible();release();
  await expect(page.getByText('برای چه نوع کالایی کمکت کنم؟',{exact:true})).toBeVisible();await send(page,'گوشی می‌خواهم');
  await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها'}).first()).toBeVisible();
  expect(calls).toHaveLength(1);expect(calls[0].messages.map(m=>m.role)).toEqual(['user','assistant','user']);
  await expect(page.locator('[data-message-role="user"]')).toHaveCount(2);
  await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(2);await layout(page);
  await page.screenshot({path:'../../.local/live-qa/conversation-mobile.png'});
});
