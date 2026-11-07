import {test,expect} from '@playwright/test';
import {mockAssistant,send,layout} from './helpers.mjs';

const state=(changes={})=>({version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'10000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[],...changes});
function clarification(route,need,code,question){const input=route.request().postDataJSON();return route.fulfill({json:{request_id:input.request_id,status:'needs_input',query:need.topic_query,category_name:need.category_name,max_price_toman:need.max_price_toman,question,question_code:code,products:null,offer_sort:need.offer_sort,battery_requirement:need.battery_requirement,need_state:need,explanation:null}});}
async function position(page){await page.getByRole('region',{name:'گفت‌وگوی خرید'}).getByRole('button',{name:'انتخاب موقعیت',exact:true}).click();await page.getByLabel('عرض جغرافیایی').fill('35.7');await page.getByLabel('طول جغرافیایی').fill('51.4');await page.getByRole('button',{name:'اعمال مختصات',exact:true}).click();}

test('approved outlined branding is used by the app and browser icons',async({page,request})=>{
  await mockAssistant(page,request);await page.goto('/');
  await expect(page.locator('.chat-header .brand-mark')).toHaveAttribute('src','/icons/torob-companion.svg');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href','/icons/torob-companion.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','/icons/apple-touch-icon.png');
  const svg=await(await request.get('/icons/torob-companion.svg')).text();expect(svg).toContain('ترب');expect(svg).not.toMatch(/<text|@font-face|base64/);
  const ico=await(await request.get('/favicon.ico')).body();expect([...ico.slice(0,4)]).toEqual([0,0,1,0]);
  await send(page);for(const img of await page.locator('.inperson-mark').all())await expect(img).toHaveAttribute('src','/icons/torob-companion.svg');
});

test('shoe budget preset changes only price without another model call',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls,'کفش زنانه');const searches=[];page.on('request',r=>{if(/\/api\/products\?/.test(r.url()))searches.push(new URL(r.url()).searchParams);});
  await page.goto('/');await position(page);await send(page,'کفش زنانه می‌خواهم');
  await page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'}).getByRole('button',{name:'تا ۳ میلیون',exact:true}).click();
  await expect.poll(()=>searches.at(-1)?.get('max_price_toman')).toBe('3000000');
  expect(searches.at(-1).get('q')).toBe('کفش زنانه');expect(searches.at(-1).get('user_lat')).toBe('35.7');expect(calls).toHaveLength(1);
  await page.reload();await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('inperson-journey:v2:filters')).max)).toBe('3000000');await layout(page);
});

test('an empty budget result offers focused recovery and keeps the same purchase',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls,'کفش زنانه');await page.goto('/');await send(page,'کفش زنانه می‌خواهم');
  await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await page.getByRole('button',{name:'بودجهٔ دلخواه',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'سقف بودجهٔ همین خرید'});await dialog.getByRole('textbox').fill('0');await dialog.getByRole('button',{name:'تأیید و ادامهٔ همین خرید'}).click();
  await expect(page.getByText('محصولی پیدا نشد',{exact:true})).toBeVisible();const replies=page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'});await expect(replies.getByRole('button',{name:'مقایسهٔ گزینه‌ها'})).toHaveCount(0);
  await replies.getByRole('button',{name:'بودجهٔ دیگری انتخاب می‌کنم',exact:true}).click();await dialog.getByRole('button',{name:'تا ۳ میلیون',exact:true}).click();
  await expect(page.getByRole('button',{name:'دیدن فروشگاه‌ها',exact:true}).first()).toBeVisible();expect(calls).toHaveLength(1);await layout(page);
});

for(const size of [{width:320,height:568},{width:390,height:844},{width:1440,height:900}])test(`focused budget dialog preserves the draft and stays inside the frame at ${size.width}`,async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);await page.setViewportSize(size);await page.goto('/');await send(page);
  const draft='این پیام را هنوز نفرستاده‌ام';await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill(draft);
  const before=await page.locator('[data-active-tool]').getAttribute('data-screen');await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await page.getByRole('button',{name:'بودجهٔ دلخواه',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'سقف بودجهٔ همین خرید',exact:true});await expect(dialog.getByRole('textbox')).toHaveCount(1);await expect(dialog.getByRole('textbox')).toBeFocused();
  expect(await page.locator('.dialog-backdrop').evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur');await expect(page.locator('.agent-layout')).toHaveAttribute('inert','');
  const input=dialog.getByRole('textbox',{name:'سقف بودجه (تومان)'});await input.fill('-1');await dialog.getByRole('button',{name:'تأیید و ادامهٔ همین خرید',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
  await input.fill('۳۰۰۰۰۰۰');await dialog.getByRole('button',{name:'تأیید و ادامهٔ همین خرید',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.locator('[data-active-tool]')).toHaveAttribute('data-screen',before);await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue(draft);expect(calls).toHaveLength(1);await layout(page);
  await page.screenshot({path:`../../.local/live-qa/ready-replies-${size.width}.png`});
});

test('budget answer before location retains the updated amount and battery requirement',async({page,request})=>{
  const calls=[];await mockAssistant(page,request,calls);const need=state({offer_sort:'nearest',budget_needs_input:true,max_price_toman:null,battery_requirement:{status:'minimum',minimum_mah:5000}});
  await page.route('**/api/assistant/turn',r=>clarification(r,need,'budget','سقف بودجه‌ات چند تومان است؟'));
  let search;page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/products'&&u.searchParams.has('user_lat'))search=u.searchParams;});
  await page.goto('/');await send(page,'گوشی با باتری حداقل ۵۰۰۰ نزدیک من می‌خواهم');
  await page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'}).getByRole('button',{name:'تا ۲۰ میلیون',exact:true}).click();await expect(page.locator('.inline-location')).toBeVisible();await position(page);
  await expect.poll(()=>search?.get('max_price_toman')).toBe('20000000');expect(search.get('min_battery_capacity_mah')).toBe('5000');expect(search.get('q')).toBe('گوشی');await layout(page);
});

test('charger and battery questions expose complete contextual answers',async({page,request})=>{
  const inputs=[];await mockAssistant(page,request);let need=state({topic_query:null,category_name:null,max_price_toman:null});
  await page.route('**/api/assistant/turn',r=>{inputs.push(r.request().postDataJSON());return clarification(r,need,inputs.length===1?'product_kind':'battery_capacity',inputs.length===1?'شارژر را برای چه دستگاهی می‌خواهی؟':'حداقل ظرفیت باتری چند میلی‌آمپرساعت باشد؟');});
  await page.goto('/');await send(page,'شارژر می‌خواهم');await page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'}).getByRole('button',{name:'برای گوشی',exact:true}).click();
  await expect.poll(()=>inputs[1]?.messages.at(-1).content).toBe('شارژر برای گوشی می‌خواهم');
  await page.getByRole('button',{name:'گفت‌وگوی تازه',exact:true}).click();await page.getByRole('button',{name:'بله، گفت‌وگوی تازه',exact:true}).click();need=state({battery_requirement:{status:'awaiting_minimum',minimum_mah:null}});await send(page,'گوشی با باتری خوب می‌خواهم');
  await page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'}).getByRole('button',{name:'حداقل ۵۰۰۰ میلی‌آمپرساعت',exact:true}).click();
  await expect.poll(()=>inputs.at(-1)?.messages.at(-1).content).toBe('حداقل ۵۰۰۰ میلی‌آمپرساعت');expect(inputs.at(-1).context_need_state.max_price_toman).toBe('10000000');
});

test('unresolved requirements use a focused chooser instead of unrelated fields',async({page,request})=>{
  await mockAssistant(page,request);const inputs=[],need=state({pending_requirements:[{key:'رنگ',source_text:'مشکی',status:'unsupported'},{key:'سایز',source_text:'۳۸',status:'unsupported'}]});
  await page.route('**/api/assistant/turn',r=>{inputs.push(r.request().postDataJSON());return clarification(r,need,'unsupported_filter','کدام شرط را کنار بگذاریم؟');});await page.goto('/');await send(page,'کفش با رنگ و سایز مشخص می‌خواهم');
  await page.getByRole('group',{name:'پیشنهادهای ادامهٔ گفت‌وگو'}).getByRole('button',{name:'انتخاب شرط‌ها',exact:true}).click();const d=page.getByRole('dialog',{name:'شرط‌های همین خرید'});await expect(d.getByRole('textbox')).toHaveCount(0);
  await d.getByRole('checkbox',{name:'رنگ',exact:true}).check();await d.getByRole('button',{name:'ادامه بدون ۱ شرط انتخاب‌شده',exact:true}).click();await expect.poll(()=>inputs.at(-1)?.messages.at(-1).content).toBe('رنگ را حذف کن');expect(inputs.at(-1).context_need_state.pending_requirements).toHaveLength(2);
});

test('mobile map can open and dismiss replies without changing the map or draft',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});await mockAssistant(page,request);await page.goto('/');await send(page);await page.getByRole('textbox',{name:'پیام به دستیار خرید'}).fill('پیام محفوظ');await page.getByRole('button',{name:'رفتن به نقشه',exact:true}).click();
  await page.getByRole('button',{name:'پاسخ‌های آماده',exact:true}).click();await expect(page.getByRole('dialog',{name:'پاسخ‌های آماده',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('[data-map-panel]')).toBeVisible();
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید'})).toHaveValue('پیام محفوظ');await layout(page);
});
