export function openPanel<T extends string>(stack:T[],next:T|null):T[]{
 if(next===null)return [];
 const index=stack.indexOf(next);
 if(index>=0)return stack.slice(0,index+1);
 // Journey details own their child panels. Other top-level tools replace each other.
 return stack[0]==='journey'||stack[0]==='followup'?[...stack,next]:[next];
}
