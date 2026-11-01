// Compare equivalent spellings without converting unlike units or erasing
// uncertainty, negation, ranges or source qualifiers.
export function comparisonValue(text:string):string{
  return text.normalize('NFKC').toLowerCase().replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ')
    .replace(/میلی\s*آمپر\s*ساعت|\bmah\b/g,' mah ')
    .replace(/گیگا\s*بایت|\bgb\b/g,' gb ')
    .replace(/\s+/g,' ').trim();
}
