import {DEFAULT_FILTERS,type Filters} from './data.ts';
export type FilterDraft={filters:Filters;clock:string|null;clockChanged:boolean};
export const createFilterDraft=(filters:Filters,clock:string|null):FilterDraft=>({filters:{...filters},clock,clockChanged:false});
export const resetFilterDraft=():FilterDraft=>({filters:{...DEFAULT_FILTERS},clock:null,clockChanged:true});
export function filterDraftError(draft:FilterDraft,hasPosition:boolean):string|null{
  const f=draft.filters;
  if([f.min,f.max].some(v=>v&&(!/^\d{1,19}$/.test(v)||BigInt(v)>9223372036854775807n)))return 'بودجه را به تومان و به‌صورت عدد معتبر وارد کنید.';
  if(f.min&&f.max&&BigInt(f.min)>BigInt(f.max))return 'حداقل قیمت نباید بیشتر از حداکثر باشد.';
  if((f.withinRadius||f.sort==='nearest')&&!hasPosition)return 'ابتدا از بخش موقعیت، مکان جست‌وجو را انتخاب کنید.';
  if(draft.clock!==null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.clock))return 'ساعت مراجعه معتبر نیست.';
  return null;
}
