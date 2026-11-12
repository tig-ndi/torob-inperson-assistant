import {test,expect} from '@playwright/test';
import {layout,mockAssistant,send} from './helpers.mjs';

const sizes=[[320,568],[360,640],[390,844],[844,390],[1440,900]];
const suggestions=[
  ['شارژر لازم دارم','شارژر موبایل می‌خواهم، نزدیک من کجا باز است؟'],
  ['هدفون نزدیک من','نزدیک‌ترین فروشگاه برای خرید هدفون را پیدا کن'],
  ['گوشی می‌خواهم','گوشی لازم دارم، نزدیک من کجا می‌توانم حضوری بخرم؟'],
  ['بررسی پیش از رفتن','هدفون لازم دارم، فروشگاه نزدیک و باز پیدا کن'],
];

async function fixture(page,request){
  const calls=[];await mockAssistant(page,request,calls);
  for(const resource of ['trips','checks','followups'])await page.route(`**/api/local/${resource}**`,r=>r.fulfill({json:{items:[]}}));
  await page.route('**/api/voice/status',r=>r.fulfill({json:{ready:false,reason:'disabled'}}));
  return calls;
}

for(const [width,height] of sizes)for(const colorScheme of ['light','dark']){
  test(`welcome explains the app and exposes four starts ${width}x${height} ${colorScheme}`,async({page,request},testInfo)=>{
    await page.setViewportSize({width,height});await page.emulateMedia({colorScheme});const calls=await fixture(page,request);await page.goto('/');
    const welcome=page.getByRole('region',{name:'شروع خرید حضوری',exact:true});
    await expect(welcome.getByRole('heading',{name:'همراه خرید حضوری ترب',exact:true})).toBeVisible();
    await expect(welcome.locator('.welcome-mark')).toBeVisible();
    await expect.poll(()=>welcome.locator('.welcome-mark').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
    await expect(welcome.getByText('کالا و فروشگاه را پیدا کن؛ قیمت‌ها و مسیر رفتن را قبل از خرید ببین.',{exact:true})).toBeVisible();
    const cards=welcome.getByRole('group',{name:'پیشنهادهای شروع خرید'}).getByRole('button');await expect(cards).toHaveCount(4);
    await page.evaluate(()=>document.fonts.ready);
    for(let i=0;i<4;i++){
      if(height<500)await cards.nth(i).scrollIntoViewIfNeeded();
      await expect(cards.nth(i)).toBeInViewport({ratio:1});
      const box=await cards.nth(i).boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(calls).toHaveLength(0);await layout(page);
    if(height<500)await welcome.scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('welcome.png')});
    if(width>=1000){await expect(page.locator('[data-map-panel]')).toBeVisible();const pane=await page.locator('.chat-pane').boundingBox(),intro=await welcome.locator('.welcome-intro').boundingBox();expect(intro.x).toBeGreaterThanOrEqual(pane.x);expect(intro.x+intro.width).toBeLessThanOrEqual(pane.x+pane.width);}
  });
}

for(const [title,prompt] of suggestions)test(`welcome start preserves its request: ${title}`,async({page,request})=>{
  await page.setViewportSize({width:360,height:640});const calls=await fixture(page,request);await page.goto('/');
  const queries=[];page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/api/products')queries.push(url.searchParams.get('q'));});
  await page.locator('.suggestion-card').filter({has:page.getByText(title,{exact:true})}).click();
  await expect(page.locator('[data-message-role="user"]')).toHaveText(prompt);
  await page.getByRole('button',{name:'انتخاب با یک کلیک روی نقشه',exact:true}).click();
  await page.locator('.maplibregl-canvas').click({position:{x:180,y:300}});
  await expect(page.locator('.user-dot')).toHaveCount(1);
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();
  await expect(page.locator('.product-results')).toBeVisible();await expect(page.locator('.welcome')).toHaveCount(0);
  expect(queries.some(q=>q?.includes(prompt.includes('شارژر')?'شارژر':prompt.includes('گوشی')?'گوشی':'هدفون'))).toBe(true);expect(calls).toHaveLength(0);
  await page.getByRole('button',{name:'گفت‌وگوی تازه',exact:true}).click();await page.getByRole('button',{name:'بله، گفت‌وگوی تازه',exact:true}).click();
  await expect(page.locator('.welcome .suggestion-card')).toHaveCount(4);await expect(page.locator('.welcome-mark')).toBeVisible();
});

for(const [width,height] of sizes.slice(0,3))test(`welcome map selection keeps the draft and typed start ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const calls=await fixture(page,request);await page.goto('/');
  const draft='گوشی تا ده میلیون می‌خواهم';await page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true}).fill(draft);
  await page.locator('.welcome-position').getByRole('button',{name:'انتخاب روی نقشه',exact:true}).click();
  await expect(page.locator('[data-map-panel]')).toBeVisible();
  await page.locator('.maplibregl-canvas').click({position:{x:width/2,y:height/2}});
  await expect(page.locator('.user-dot')).toHaveCount(1);
  await page.getByRole('button',{name:'بازگشت به گفت‌وگو',exact:true}).click();
  await expect(page.locator('[data-map-panel]')).toBeHidden();
  await expect(page.getByRole('textbox',{name:'پیام به دستیار خرید',exact:true})).toHaveValue(draft);
  await expect(page.locator('.welcome-position').getByRole('button',{name:'تغییر نقطه روی نقشه',exact:true})).toBeVisible();
  expect(calls).toHaveLength(0);await send(page,draft);await expect.poll(()=>calls.length).toBe(1);expect(calls[0].messages.at(-1).content).toBe(draft);
  await expect(page.locator('.product-results')).toBeVisible();await layout(page);
});
