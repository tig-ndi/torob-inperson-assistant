import {money} from './data.ts';
export type PurchaseImage={product:string;shop:string;address:string|null;price:string|null;result:string;time:string;mode:string;origin:string|null;destination:string|null;route:string|null};
export function purchaseImageLines(p:PurchaseImage):string[]{return [
 'همراه خرید حضوری',p.result,p.product,`فروشگاه: ${p.shop}`,`آدرس مقصد: ${p.address?.trim()||'آدرس ثبت نشده'}`,
 `قیمت ثبت‌شده در منبع: ${money(p.price)} تومان`,p.time,`روش رفتن: ${p.mode}`,
 ...(p.origin?[`مبدأ ثبت‌شده: ${p.origin}`]:[]),...(p.destination?[`مختصات مقصد: ${p.destination}`]:[]),...(p.route?[p.route]:[]),
 'قیمت و موجودی ثبت‌شده‌اند؛ موجودی واقعی پیش از مراجعه نیاز به بررسی دارد.',
 'نتیجهٔ خرید بر اساس اعلام کاربر است؛ پرداخت یا سفارش آنلاین انجام نشده.',
];}
export function wrapImageText(text:string,width:number,measure:(s:string)=>number):string[]{
 const lines:string[]=[];let line='';
 for(const word of text.split(/\s+/)){
  if(measure(word)>width){if(line){lines.push(line);line='';}let chunk='';for(const char of Array.from(word)){if(chunk&&measure(chunk+char)>width){lines.push(chunk);chunk='';}chunk+=char;}line=chunk;continue;}
  const next=line?line+' '+word:word;if(line&&measure(next)>width){lines.push(line);line=word;}else line=next;
 }
 if(line)lines.push(line);return lines;
}
/** Local canvas text only: no external images, uploads or cross-origin taint. */
export async function downloadPurchaseImage(p:PurchaseImage){
 await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('ساخت تصویر در این مرورگر در دسترس نیست.');
 const width=1080,padding=64,font='Vazirmatn, sans-serif';ctx.font=`32px ${font}`;
 const lines=purchaseImageLines(p).map((text,index)=>({index,lines:wrapImageText(text,width-padding*2,s=>ctx.measureText(s).width)}));
 canvas.width=width;canvas.height=padding*2+lines.reduce((height,item)=>height+item.lines.length*55+28,0);
 const style=getComputedStyle(document.querySelector('.agent-app')??document.documentElement);
 ctx.fillStyle=style.getPropertyValue('--bg').trim()||'#101014';ctx.fillRect(0,0,width,canvas.height);
 ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='top';let y=padding;
 for(const item of lines){ctx.font=`${item.index<2?'700 ':''}32px ${font}`;ctx.fillStyle=style.getPropertyValue(item.index<2?'--primary':'--text').trim()||(item.index<2?'#ff4c68':'#f4f4f6');for(const text of item.lines){ctx.fillText(text,width-padding,y);y+=55;}y+=28;}
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('ساخت تصویر انجام نشد؛ دوباره امتحان کن.')),'image/png'));
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='torob-purchase-'+new Date().toISOString().slice(0,10)+'.png';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
