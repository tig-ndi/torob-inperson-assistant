import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendation,choiceReason} from '../../src/live/journey.ts';
import {visitPreferences,visitIntent} from '../../src/live/conversation.ts';
const offer=(id,price,distance,status)=>({offer_id:id,price_toman:price,direct_distance_meters:distance,opening_hours:{status}});
test('a visit-ready store outranks a cheaper closed store and an unknown schedule',()=>{
 const open=offer('open','9007199254740993',4000,'declared_open'),closed=offer('closed','1',100,'declared_closed'),unknown=offer('unknown','0',50,'unknown');
 assert.deepEqual(recommendation([closed,unknown,open],{},0).map(x=>x.offer_id),['open','unknown','closed']);assert.match(choiceReason(open,{},[closed,open]),/ارزان‌تر/);
});
test('arrival closing risk changes the decision; exact large prices keep their order',()=>{
 const a=offer('a','9007199254740993',100,'declared_open'),b=offer('b','9007199254740992',1000,'declared_open');
 assert.equal(recommendation([a,b],{},0)[0].offer_id,'b');assert.equal(recommendation([a,b],{b:{risk:'closing_soon'}},0)[0].offer_id,'a');
});
test('explicit local visit conditions preserve exact budget and do not swallow product features',()=>{
 assert.deepEqual(visitPreferences('شارژر نزدیک من زیر ۱.۵ میلیون تومان فقط فروشگاه باز و قسطی'),{open:true,credit:true,max:'1500000'});
 assert.equal(visitIntent('شارژر نزدیک من زیر ۱.۵ میلیون تومان فقط فروشگاه باز',null),null);
 assert.equal(visitIntent('شارژر موبایل نزدیک من زیر ۱.۵ میلیون تومان فقط فروشگاه باز',null).topic,'شارژر موبایل');
 assert.equal(visitIntent('شارژر رنگ آبی نزدیک من زیر ۲ میلیون تومان',null),null);
 assert.equal(visitIntent('هدفون نزدیک من تا دو کیلومتر',null).nearbyKm,2);
});
