import test from 'node:test';
import assert from 'node:assert/strict';
import {NavigationHistory,shouldConfirmNewConversation} from '../src/live/navigationHistory.ts';
import {createFilterDraft,filterDraftError,resetFilterDraft} from '../src/live/filterDraft.ts';
import {DEFAULT_FILTERS} from '../src/live/data.ts';

function fixture(){
 let entries=[null],cursor=0,queue=[],restores=[];
 const port={replaceState:s=>{entries[cursor]=s;},pushState:s=>{entries.splice(cursor+1);entries.push(s);cursor++;},go:d=>queue.push(cursor+d)};
 const h=new NavigationHistory(port,'test',(next,old)=>{restores.push(next.map(x=>x.key));let common=0;while(common<next.length&&next[common]?.key===old[common]?.key)common++;old.slice(common).reverse().forEach(x=>x.leave());next.at(-1)?.enter();});
 const flush=()=>{while(queue.length){cursor=queue.shift();h.pop(entries[cursor]);}};
 const back=()=>{cursor--;if(cursor<0)return false;const handled=h.pop(entries[cursor]);h.finishRestore();return handled;};
 return {h,flush,back,restores,get keys(){return entries;},get cursor(){return cursor;}};
}
const frame=(key,leave=()=>{})=>({key,enter:()=>{},leave});
test('initial restored stages get an in-app ancestry; only root allows exit',()=>{
 const f=fixture();f.h.sync(['home','results','stores'].map(k=>frame(k)));assert.equal(f.keys.length,3);
 assert.equal(f.back(),true);assert.deepEqual(f.restores.at(-1),['home','results']);assert.equal(f.back(),true);assert.equal(f.back(),false);
});
test('closing by X consumes its entry and does not require an extra Back',()=>{
 const f=fixture(),base=['home','results'].map(k=>frame(k));f.h.sync(base);f.h.sync([...base,frame('filters')]);f.h.sync(base);f.flush();
 assert.equal(f.cursor,1);assert.equal(f.back(),true);assert.deepEqual(f.restores.at(-1),['home']);
});
test('Back dismisses only the top of nested layers, in reverse order',()=>{
 let closed=[];const f=fixture(),base=[frame('home'),frame('map',()=>closed.push('map')),frame('sheet',()=>closed.push('sheet')),frame('filters',()=>closed.push('filters'))];
 f.h.sync(base);f.back();assert.deepEqual(closed,['filters']);f.back();assert.deepEqual(closed,['filters','sheet']);f.back();assert.deepEqual(closed,['filters','sheet','map']);
});
test('changing a dialog replaces dismissed ancestry without ghost entries',()=>{
 const f=fixture(),home=frame('home');f.h.sync([home,frame('menu')]);f.h.sync([home,frame('history')]);f.flush();
 assert.equal(f.cursor,1);f.back();assert.deepEqual(f.restores.at(-1),['home']);
});
test('rapid close and reopen settles at the latest desired layer',()=>{
 const f=fixture(),base=[frame('home')];f.h.sync(base);f.h.sync([...base,frame('filters')]);f.h.sync(base);f.h.sync([...base,frame('location')]);f.flush();
 assert.equal(f.cursor,1);f.back();assert.deepEqual(f.restores.at(-1),['home']);
});
test('foreign and malformed browser state is never claimed by this session',()=>{
 const f=fixture();f.h.sync([frame('home')]);for(const s of [null,{},5,{torobMobile:{session:'other',id:1}},{torobMobile:{session:'test',id:'1'}}])assert.equal(f.h.pop(s),false);
});
test('browser entries contain opaque navigation IDs, never purchase data',()=>{
 const f=fixture();f.h.sync([frame('home'),frame('filters')]);for(const entry of f.keys)assert.deepEqual(Object.keys(entry),['torobMobile']);
});
test('Escape can dismiss the top entry but never exits the root',()=>{
 const f=fixture();f.h.sync([frame('home')]);assert.equal(f.h.back(),false);f.h.sync([frame('home'),frame('filters')]);assert.equal(f.h.back(),true);f.flush();f.h.finishRestore();assert.deepEqual(f.restores.at(-1),['home']);assert.equal(f.h.back(),false);
});
test('new conversation needs confirmation only when there are messages',()=>{assert.equal(shouldConfirmNewConversation(0),false);assert.equal(shouldConfirmNewConversation(1),true);assert.equal(shouldConfirmNewConversation(100),true);});
test('filter changes are isolated drafts; reset and clock are applied together',()=>{
 const source={...DEFAULT_FILTERS,max:'2000000'},draft=createFilterDraft(source,'10:00');draft.filters.max='3000000';draft.clock='11:00';draft.clockChanged=true;
 assert.equal(source.max,'2000000');assert.equal(filterDraftError(draft,true),null);assert.equal(resetFilterDraft().clock,null);assert.equal(resetFilterDraft().clockChanged,true);
});
test('invalid drafts cannot commit budget, position or clock',()=>{
 for(const filters of [{...DEFAULT_FILTERS,min:'200',max:'100'},{...DEFAULT_FILTERS,max:'-1'},{...DEFAULT_FILTERS,withinRadius:true}])assert.ok(filterDraftError(createFilterDraft(filters,null),false));
 assert.ok(filterDraftError(createFilterDraft(DEFAULT_FILTERS,'25:00'),true));assert.equal(filterDraftError(createFilterDraft(DEFAULT_FILTERS,null),false),null);
});
