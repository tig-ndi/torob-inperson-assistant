import test from 'node:test';
import assert from 'node:assert/strict';
import {visitDate,visitClock} from '../src/live/conversation.ts';
import {parseVisitSession} from '../src/live/visitSession.ts';
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
 assert.deepEqual(parseNeedState({...state,excluded_kinds:['portable_fridge']}).excluded_kinds,['portable_fridge']);
 assert.throws(()=>parseNeedState({...state,excluded_kinds:['unknown']}));
});

test('natural visit clocks keep token boundaries and bind the period to the clock',()=>{
 for(const [input,expected] of [
  ['فردا ساعت ده صبح میرم فروشگاه','10:00'],['ساعت ۱۰ صبح','10:00'],['ساعت نه و نیم شب','21:30'],
  ['ساعت نهونیمشب','21:30'],['ساعت دو و ربع عصر','14:15'],['ساعت ۱۲ صبح','00:00'],
  ['ساعت دوازده ظهر','12:00'],['فردا ساعت ده بعد از ظهر','22:00'],['ساعت ۱۰:۰۰ صبح','10:00'],
  ['ساعت ۲۳:۱۵','23:15'],['ساعت۱۰:۰۰ صبح','10:00'],['فردا،۱۰:۰۰ صبح','10:00'],['شب بسته است؛ فردا ساعت ده صبح میرم','10:00'],
  ['ده میلیون تومان',null],['نه گوشی نمیخواهم',null],['ساعت هوشمند',null],['ساعت ۲۵:۰۰',null],['ساعت ۱۰:۷۰',null],
 ])assert.equal(visitClock(input),expected,input);
});

test('session and recent-result visit parser retain day with clock, accept legacy and reject invalid calendar',()=>{
 const base={topic:'هدفون',nearbyKm:2,localTime:'10:00',reuseProduct:false};
 for(const visitDate of ['2026-11-08','2028-02-29',null])assert.deepEqual(parseVisitSession({...base,visitDate}),{...base,visitDate});
 assert.deepEqual(parseVisitSession(base),base);
 for(const visitDate of ['2026-02-31','2026-02-29','2026-13-01','2026-1-01',42])assert.throws(()=>parseVisitSession({...base,visitDate}));
});
