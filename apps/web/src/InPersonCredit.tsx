import { CREDIT_REASON_TEXT, CREDIT_STATUS_TEXT, type InPersonCredit } from './api';

const numbers = new Intl.NumberFormat('fa-IR');
const amount = (value: string | null) => value === null ? 'ثبت نشده' : `${numbers.format(BigInt(value))} تومان`;

export function InPersonCreditDetails({ credit }: { credit: InPersonCredit }) {
  return <section className={`credit-conditions credit-${credit.status}`} aria-label="شرایط خرید اعتباری حضوری">
    <h4 className="credit-status">{CREDIT_STATUS_TEXT[credit.status]}</h4>
    <p className="caption">تطابق فقط با قیود ثبت‌شده است؛ تأیید اعتبار شخص، پرداخت یا پذیرش فروشنده نیست.</p>
    {credit.options.length === 0
      ? <p className="caption">{credit.reason === 'not_recorded'
        ? 'شرایط پرداخت در منبع ثبت نشده است؛ نبود اطلاعات به معنی نبود این خدمت نیست.'
        : 'اطلاعات روش‌های پرداخت منبع قابل تفسیر نیست.'}</p>
      : <details>
        <summary>جزئیات {numbers.format(credit.options.length)} روش ثبت‌شده</summary>
        <ul className="credit-options">
          {credit.options.map(option => <li key={option.option_index}>
            <strong>{option.provider_name || 'نام ارائه‌دهنده ثبت نشده'}</strong>
            <p>{option.channel === 'in_person' ? 'کانال اعلام‌شده: حضوری'
              : option.channel === 'unknown' || option.channel === null ? 'کانال پرداخت: نامشخص'
                : `کانال ثبت‌شده: ${option.channel}`}</p>
            <p>کف مبلغ: <bdi>{amount(option.min_price_toman)}</bdi> · سقف مبلغ: <bdi>{amount(option.max_price_toman)}</bdi></p>
            <p>{option.category_names === null ? 'اطلاعات دسته‌ها قابل تفسیر نیست'
              : option.category_names.length === 0 ? 'محدودیت دسته در منبع ثبت نشده است'
                : `دسته‌های اعلام‌شده: ${option.category_names.join('، ')}`}</p>
            <p className="credit-option-result">{CREDIT_REASON_TEXT[option.reason]}</p>
          </li>)}
        </ul>
      </details>}
  </section>;
}
