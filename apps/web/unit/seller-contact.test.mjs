import test from 'node:test';
import assert from 'node:assert/strict';
import {contactNumber,sellerContactLinks,sellerQuestion} from '../src/live/sellerContactLinks.ts';
test('buyer-entered phone normalization accepts Persian digits and rejects injected or partial values',()=>{
 for(const value of ['۰۹۱۲۳۴۵۶۷۸۹','٠٩١٢٣٤٥٦٧٨٩','00989123456789','+98 (912) 345-6789'])assert.equal(contactNumber(value),'+989123456789');
 for(const value of ['', '123', 'javascript:alert(1)', '+98912?x=1','09123456789;123'])assert.equal(contactNumber(value),null);
});
test('contact intents encode editable text and never contain an auto-send action',()=>{
 const text='گوشی & قیمت؟\nموجودی';const links=sellerContactLinks('09123456789',text);
 assert.equal(links.call,'tel:+989123456789');assert.equal(new URL(links.whatsapp).searchParams.get('text'),text);
 assert.equal(new URL(links.sms).searchParams.get('body'),text);assert.equal(sellerContactLinks('',text),null);
 const draft=sellerQuestion('مدل الف','فروشگاه ب','۱۰۰');for(const word of ['مدل الف','فروشگاه ب','موجود','گارانتی','آدرس'])assert.ok(draft.includes(word));
});
