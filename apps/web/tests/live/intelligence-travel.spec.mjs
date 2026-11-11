import {test,expect} from '@playwright/test';
import {visitFixture,chooseLocation} from './visit-fixtures.mjs';
import {send,layout} from './helpers.mjs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir} from 'node:fs/promises';
for(const [width,height] of [[320,568],[360,640],[390,844]]){
 test(`travel deadline excludes an open but unreachable destination at ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height});const f=await visitFixture(page,request);
  for(const endpoint of ['checks','trips','followups'])await page.route(`**/api/local/${endpoint}**`,r=>r.fulfill({json:{items:[]}}));
  await page.route('**/api/local/road-routes',r=>r.abort());
  await page.goto('/');await chooseLocation(page);
  await send(page,'ساعت ۲۳:۳۰ شارژر موبایل نزدیک من کجا باز است؟ فقط ده دقیقه برای رفتن وقت دارم؛ پیاده می‌روم.');
  const decision=page.getByRole('region',{name:'پیشنهاد برای مراجعه'});
  await expect(decision).toContainText('در سقف ۱۰ دقیقه');await expect(decision.locator('[data-visit-candidate]')).toHaveCount(0);
  expect(f.calls).toHaveLength(0);await layout(page);
  await page.reload();await expect(decision).toContainText('در سقف ۱۰ دقیقه');
  const dir=join(tmpdir(),'torob-intelligence-repairs-20261111');await mkdir(dir,{recursive:true});await page.screenshot({path:join(dir,`deadline-${width}.png`)});
 });
}
