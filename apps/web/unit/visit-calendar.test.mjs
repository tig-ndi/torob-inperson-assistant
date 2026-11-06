import test from 'node:test';
import assert from 'node:assert/strict';
import {visitDate} from '../src/live/conversation.ts';
import {accessoryDeviceReply} from '../src/live/requestPlanning.ts';
import {parseNeedState} from '../src/app/base/domain/parsers.ts';

test('relative calendar dates use Tehran, preserve midnight rollover and distinguish now',()=>{
 const friday=new Date('2026-11-06T18:00:00Z');
 assert.equal(visitDate('فردا ساعت ۱۰:۰۰ صبح',friday),'2026-11-07');
 assert.equal(visitDate('پس‌فردا ساعت ۱۰:۰۰ صبح',friday),'2026-11-08');
 assert.equal(visitDate('شنبه ساعت ۱۰:۰۰',friday),'2026-11-07');
 assert.equal(visitDate('امروز',new Date('2026-11-06T22:00:00Z')),'2026-11-07');
 assert.equal(visitDate('الان',friday),null);
 assert.equal(visitDate('بودجه را تغییر بده',friday),undefined);
});
test('a target-device answer refusing the device preserves the accessory identity',()=>{
 assert.equal(accessoryDeviceReply('برای گوشی سامسونگ A54 هست؛ خود گوشی نمیخوام','کابل'),true);
 assert.equal(accessoryDeviceReply('برای گوشی سامسونگ A54 هست؛ خود گوشی میخوام','کابل'),false);
});
test('need-state parsing round-trips bounded preferences and comparisons',()=>{
 const state={version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'20000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[],preferences:['coding','lightweight'],comparison_queries:['سامسونگ a54','سامسونگ a34'],minimum_capacity_kg:null};
 assert.deepEqual(parseNeedState(state),state);
 assert.throws(()=>parseNeedState({...state,preferences:['coding','coding']}));
 assert.throws(()=>parseNeedState({...state,minimum_capacity_kg:-1}));
});
