import test from 'node:test';
import assert from 'node:assert/strict';
import {currentMapOffers} from '../src/live/mapResults.ts';
import {memoryVariants} from '../src/live/memoryVariants.ts';
import {productReferenceIndex} from '../src/live/requestPlanning.ts';
import {parseNeedState} from '../src/app/base/domain/parsers.ts';

const offer=(id,price,product='current')=>({offer_id:id,product_id:product,price_toman:price,shop:{lat:35.7,lon:51.4},opening_hours:{status:'declared_open'}});
const filters={max:'20000000',min:'',radius:10,withinRadius:false,open:false,credit:false,pay:false,kala:false,fast:false,sort:'price'};
test('the visible map excludes historical products and offers outside the current budget',()=>{
 const rows=[offer('historical','10000000','old'),offer('expensive','193000000'),offer('current','5000000'),offer('unknown',null)];
 assert.deepEqual(currentMapOffers(rows,[{product_id:'current'}],filters,{lat:35.7,lon:51.4}).map(o=>o.offer_id),['current']);
 assert.equal(rows.length,4); // history is preserved independently
});
test('a recorded memory title and common source abbreviations resolve the same version',()=>{
 const p={persian_title:'گوشی سویس S25 Ultra Mini | حافظه 16 رم 2 گیگابایت',specs:[{key:'حافظه داخلی',value:'16 گیگ'},{key:'مقدار RAM',value:'2 گیگابات'}]};
 assert.equal(memoryVariants(p).storage.value,'16 گیگابایت');assert.equal(memoryVariants(p).ram.value,'2 گیگابایت');
 const conflict={...p,specs:[{key:'حافظه داخلی',value:'32 گیگابایت'}]};assert.equal(memoryVariants(conflict).storage.status,'conflicting');
});
test('recorded variant filters cross the client boundary and old sessions remain readable',()=>{
 const value={version:1,topic_query:'کفش',category_name:null,category_cleared:false,max_price_toman:'3000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]};
 assert.equal(parseNeedState(value).source_filters,undefined);
 assert.deepEqual(parseNeedState({...value,source_filters:{colour:'سفید',size:'38',connector:null}}).source_filters,{colour:'سفید',size:'38',connector:null});
 assert.throws(()=>parseNeedState({...value,source_filters:{colour:null,size:'هر سایزی',connector:null}}));
});

test('variant references use the selected visible product while a new purchase does not',()=>{
 assert.equal(productReferenceIndex('همون اولی سفیدش رو میخوام',3),0);assert.equal(productReferenceIndex('دومی سایز ۳۸ میخوام',3),1);assert.equal(productReferenceIndex('سومی سفیدش رو میخوام',2),null);assert.equal(productReferenceIndex('اولی رو نمیخوام',3),null);
});
