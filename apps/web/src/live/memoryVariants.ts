import {comparisonValue} from './comparisonValues.ts';
type Source={persian_title:string|null;category_name?:string|null;specs:{key:string|null;value:string|null}[]};
export type MemoryValue={value:string|null;status:'recorded'|'matched_variant'|'conflicting'|'unknown';note:string};
const unknown=():MemoryValue=>({value:null,status:'unknown',note:'ظرفیت دقیق این نسخه در منبع روشن نیست'});
const memoryText=(value:string)=>comparisonValue(value).replace(/مگا\s*بایت|\bmb\b/g,'mb');
const factor=(unit:string)=>unit==='mb'?1/1024:unit==='gb'?1:1024;
const quantity=(value:string)=>{const m=memoryText(value).match(/^(\d+)\s*(gb|mb|ترابایت|tb)(?:\s*رم)?$/);return m?Number(m[1])*factor(m[2]!):null;};
export function memoryVariants(p:Source):{storage:MemoryValue;ram:MemoryValue}|null{
  const relevant=p.specs.filter(s=>/حافظه|\bRAM\b|^رم$/i.test(s.key??''));
  if(!relevant.length)return null;
  const title=memoryText(p.persian_title??'');
  const titleCapacity=title.match(/حافظه\s*(\d+)\s*(gb|mb|ترابایت|tb)/);
  const chosen=titleCapacity?Number(titleCapacity[1])*factor(titleCapacity[2]!):null;
  const scalar=(kind:'storage'|'ram')=>[...new Set(relevant.filter(s=>kind==='storage'?/^(?:ظرفیت )?حافظه داخلی$/.test(s.key??''):/^(?:حافظه رم(?: RAM)?|رم|مقدار RAM)$/i.test(s.key??'')).flatMap(s=>{const n=quantity(s.value??'');return n===null?[]:[n];}))];
  const pairs:{storage:number;ram:number}[]=[];
  for(const row of relevant.filter(s=>/ترکیب.*حافظه.*رم/.test(s.key??''))){
    const input=comparisonValue(row.value??'');
    const pattern=/(\d+)\s*gb\s*\/\s*(\d+)\s*gb\s*رم/g;
    const matches=[...input.matchAll(pattern)];
    // Do not drop qualifiers such as "up to", unknown units, or partial data.
    if(input.replace(pattern,'').replace(/[\s,،;؛|]+/g,'')!=='')continue;
    pairs.push(...matches.map(m=>({storage:Number(m[1]),ram:Number(m[2])})));
  }
  function resolve(kind:'storage'|'ram'):MemoryValue{
    const direct=scalar(kind);
    const matched=chosen===null?[]:pairs.filter(pair=>pair.storage===chosen).map(pair=>pair[kind]);
    const values=[...new Set([...direct,...matched,...(kind==='storage'&&chosen!==null?[chosen]:[])])];
    if(values.length>1)return {value:null,status:'conflicting',note:'ظرفیت عنوان و مشخصات این نسخه یکسان نیست؛ پیش از خرید بررسی شود'};
    if(values.length===1){const value=values[0]!<1?`${values[0]!*1024} مگابایت`:`${values[0]} گیگابایت`;return {value,status:direct.length?'recorded':'matched_variant',note:direct.length?'طبق مشخصات همین کالا':kind==='storage'?'ظرفیت ذکرشده در عنوان کالا':'از ترکیب منبع که با ظرفیت عنوان همین نسخه منطبق است'};}
    return unknown();
  }
  return {storage:resolve('storage'),ram:resolve('ram')};
}
