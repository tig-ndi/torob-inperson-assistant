import { HOURS_REASON_TEXT } from './api';
import type { OpeningHours, OpeningShift } from './api';

const DAYS: Record<string, string> = {
  mon: 'دوشنبه', tue: 'سه‌شنبه', wed: 'چهارشنبه', thu: 'پنجشنبه',
  fri: 'جمعه', sat: 'شنبه', sun: 'یکشنبه',
};
const LABELS = {
  declared_open: 'طبق ساعات ثبت‌شده اکنون باز',
  declared_closed: 'طبق ساعات ثبت‌شده اکنون بسته',
  unknown: 'وضعیت ساعت کاری نامشخص',
};

function ClockRange({ shift }: { shift: OpeningShift }) {
  const fa = (value: string) => value.replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);
  const visibleTime = (value: string) => fa(value.endsWith(':00') ? value.slice(0, 5) : value);
  return <><bdi>{visibleTime(shift.start_time)}</bdi> تا <bdi>{visibleTime(shift.end_time)}</bdi>
    {shift.ends_next_day && ' (پایان روز بعد)'}</>;
}

export function OpeningHoursDetails({ hours }: { hours: OpeningHours }) {
  return <section className={`opening-hours hours-${hours.status}`} aria-label="ساعات اعلامی فروشگاه">
    <p className="hours-status"><strong>{LABELS[hours.status]}</strong></p>
    <p className="caption">{HOURS_REASON_TEXT[hours.reason]}</p>
    {hours.today_shifts.length > 0 && <div className="hours-ranges">
      <span>بازه‌های شروع‌شوندهٔ امروز ({DAYS[hours.local_day]}):</span>
      <ul>{hours.today_shifts.map((shift, index) => <li key={index}><ClockRange shift={shift} /></li>)}</ul>
    </div>}
    {hours.previous_day_overnight_shifts.length > 0 && <div className="hours-ranges">
      <span>شیفت شروع‌شده از روز قبل:</span>
      <ul>{hours.previous_day_overnight_shifts.map((shift, index) => <li key={index}><ClockRange shift={shift} /></li>)}</ul>
    </div>}
    <p className="caption">ساعات اعلامی منبع؛ بازبودن واقعی و موجودی تأیید نشده‌اند.</p>
  </section>;
}
