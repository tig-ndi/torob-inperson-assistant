/** Only a number explicitly entered by the buyer becomes a contact link. */
export function contactNumber(input:string):string|null{
 let value=input.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s()-]/g,'');
 if(/^0\d{10}$/.test(value))value='+98'+value.slice(1);
 if(/^0098\d{10}$/.test(value))value='+'+value.slice(2);
 return /^\+[1-9]\d{7,14}$/.test(value)?value:null;
}
export function sellerContactLinks(input:string,text:string){
 const number=contactNumber(input);if(!number)return null;
 return {call:`tel:${number}`,sms:`sms:${number}?body=${encodeURIComponent(text)}`,whatsapp:`https://wa.me/${number.slice(1)}?text=${encodeURIComponent(text)}`};
}
export function sellerQuestion(product:string,shop:string,price:string){
 return `سلام، برای خرید حضوری «${product}» از «${shop}» پرس‌وجو می‌کنم. آیا همین مدل موجود است؟ قیمت ثبت‌شده ${price} تومان است؛ قیمت نهایی، گارانتی و شرایط پرداخت چیست؟ تا چه ساعتی باز هستید و امکان نگه‌داشتن کالا تا رسیدن من هست؟ لطفاً آدرس، طبقه و واحد را هم تأیید کنید.`;
}
