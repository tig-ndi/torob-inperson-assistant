import test from 'node:test';
import assert from 'node:assert/strict';
import {guardTouchClick} from '../src/live/touchClickGuard.ts';
const click=(overrides={})=>Object.assign(new Event('click',{cancelable:true}),{detail:1,pointerType:'touch',clientX:100,clientY:100,...overrides});

test('the compatibility click cannot activate a newly opened dialog control',()=>{
 const doc=new EventTarget();let activated=0;guardTouchClick(doc,100,100);doc.addEventListener('click',()=>activated++);const e=click();doc.dispatchEvent(e);assert.equal(e.defaultPrevented,true);assert.equal(activated,0);doc.dispatchEvent(click());assert.equal(activated,1);
});
test('the next deliberate touch is not swallowed by the previous action guard',()=>{
 const doc=new EventTarget();guardTouchClick(doc,100,100);doc.dispatchEvent(new Event('pointerdown'));const e=click();doc.dispatchEvent(e);assert.equal(e.defaultPrevented,false);
});
test('keyboard, mouse and unrelated click positions remain usable',()=>{
 for(const properties of [{detail:0},{pointerType:'mouse'},{clientX:140}]){const doc=new EventTarget(),dispose=guardTouchClick(doc,100,100),e=click(properties);doc.dispatchEvent(e);assert.equal(e.defaultPrevented,false);dispose();}
});
