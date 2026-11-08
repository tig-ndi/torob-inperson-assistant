type Point={lat:number;lon:number};
const valid=(p:Point|null)=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
/** Google Maps URLs: documented origin/destination/mode and navigation action. */
export function googleNavigation(origin:Point|null,destination:Point|null,address:string|null,mode:string):string|null{
 const target=valid(destination)?`${destination!.lat},${destination!.lon}`:address?.trim();if(!target)return null;
 const params=new URLSearchParams({api:'1',destination:target,dir_action:'navigate'});
 if(valid(origin))params.set('origin',`${origin!.lat},${origin!.lon}`);
 if(['walking','driving','cycling'].includes(mode))params.set('travelmode',mode==='cycling'?'bicycling':mode);
 return 'https://www.google.com/maps/dir/?'+params;
}
