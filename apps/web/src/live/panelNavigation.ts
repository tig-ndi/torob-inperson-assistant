export function openPanel<T extends string>(stack:T[],next:T|null):T[]{
 if(next===null)return [];
 const index=stack.indexOf(next);
 if(index>=0)return stack.slice(0,index+1);
 // Related task panels retain their parent; independent top-level tools replace it.
 return ['journey','followup','reply'].includes(stack[0]??'')||stack.at(-1)==='checks'?[...stack,next]:[next];
}
