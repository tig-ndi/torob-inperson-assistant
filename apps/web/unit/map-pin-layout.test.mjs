import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMapPins} from '../src/live/mapPinLayout.ts';

const point=(id,x,y,selected=false)=>({id,x,y,width:100,height:36,selected});
test('distant markers keep their price labels and every shop remains represented',()=>{
 const layout=layoutMapPins([point('a',0,0),point('b',200,0)]);
 assert.deepEqual(layout,[{id:'a',members:['a'],compact:false},{id:'b',members:['b'],compact:false}]);
 assert.deepEqual(layoutMapPins([]),[]);
});
test('coincident shops share one hit target, with the selected shop as representative',()=>{
 const layout=layoutMapPins([point('a',100,100),point('b',100,100,true),point('c',101,101)]);
 assert.deepEqual(layout,[{id:'b',members:['b','a','c'],compact:true}]);
});
test('collision grouping is transitive and does not discard any shop',()=>{
 const input=[point('a',0,0),point('b',30,0),point('c',60,0),point('d',400,400)];
 const layout=layoutMapPins(input);
 assert.deepEqual(layout.map(g=>g.members),[['a','b','c'],['d']]);
 assert.equal(new Set(layout.flatMap(g=>g.members)).size,input.length);
});
test('a compact marker can stay separate when its 32px hit area clears the label',()=>{
 assert.deepEqual(layoutMapPins([point('a',0,0,true),point('b',80,0)]),[
  {id:'a',members:['a'],compact:false},{id:'b',members:['b'],compact:true},
 ]);
});
test('dense layouts have disjoint representative hit areas including selected borders',()=>{
 const input=Array.from({length:40},(_,i)=>point(String(i),(i%8)*35,Math.floor(i/8)*38,i===19));
 const groups=layoutMapPins(input);
 const boxes=groups.map(group=>{const p=input.find(p=>p.id===group.id),w=group.compact?32:p.width,h=group.compact?32:p.height;return {x:p.x-w/2,y:p.y-h,w,h};});
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
 assert.deepEqual(groups.flatMap(g=>g.members).sort(),input.map(p=>p.id).sort());
});
