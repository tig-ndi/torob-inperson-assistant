export type PinPoint={id:string;x:number;y:number;width:number;height:number;selected:boolean};
type Box={x:number;y:number;width:number;height:number};
const intersects=(a:Box,b:Box)=>a.x<b.x+b.width+4&&a.x+a.width+4>b.x&&a.y<b.y+b.height+4&&a.y+a.height+4>b.y;
/** Keep every shop reachable, grouping only hit areas that would collide. */
export function layoutMapPins(points:PinPoint[]){
  const placed:{point:PinPoint;box:Box;compact:boolean}[]=[];
  for(const point of [...points].sort((a,b)=>Number(b.selected)-Number(a.selected))){
    const full={x:point.x-point.width/2,y:point.y-point.height,width:point.width,height:point.height};
    const compact=!point.selected&&placed.some(p=>intersects(full,p.box));
    placed.push({point,compact,box:compact?{x:point.x-16,y:point.y-32,width:32,height:32}:full});
  }
  const parents=placed.map((_,i)=>i);
  const root=(i:number):number=>parents[i]===i?i:root(parents[i]!);
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)if(intersects(placed[i]!.box,placed[j]!.box))parents[root(j)]=root(i);
  const groups=new Map<number,typeof placed>();
  placed.forEach((pin,i)=>{const id=root(i),group=groups.get(id)??[];group.push(pin);groups.set(id,group);});
  return [...groups.values()].map(group=>({id:group[0]!.point.id,members:group.map(p=>p.point.id),compact:group.length>1||group[0]!.compact}));
}
