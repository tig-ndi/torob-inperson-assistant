"""Read the local usage ledger without network, credentials, or database writes."""

import argparse
from collections import Counter
from contextlib import closing
from decimal import Decimal, localcontext
import json
from pathlib import Path
import re
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[1]
STATES = ('reserved', 'completed', 'failed', 'cancelled')


class UsageReportError(ValueError):
    pass


def amount(value: str) -> Decimal:
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,19}(?:\.[0-9]{1,18})?', value):
        raise ValueError('expected a nonnegative plain decimal amount')
    return Decimal(value)


def read_report(database: Path, initial_credit: Decimal | None = None) -> dict:
    if initial_credit is not None and (not isinstance(initial_credit, Decimal) or not initial_credit.is_finite() or initial_credit < 0):
        raise UsageReportError('اعتبار اولیه باید مقدار اعشاری متناهی و نامنفی باشد.')
    if not database.is_file():
        raise UsageReportError('فایل محلی مصرف پیدا نشد؛ فایل جدیدی ساخته نشد.')
    try:
        with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as connection:
            connection.execute('PRAGMA query_only=ON')
            rows = connection.execute('SELECT state,prompt_tokens,completion_tokens,cost_usd FROM attempts').fetchall()
    except (sqlite3.Error, OSError) as exc:
        raise UsageReportError('فایل مصرف قابل خواندن نیست یا ساختار پشتیبانی‌شده را ندارد.') from exc

    states = Counter(row[0] if row[0] in STATES else 'unknown' for row in rows)
    costs = []
    invalid_costs = 0
    for row in rows:
        if row[3] is None:
            continue
        try:
            costs.append(amount(row[3]))
        except ValueError:
            invalid_costs += 1

    def token_summary(column: int) -> dict:
        valid = [row[column] for row in rows if type(row[column]) is int and row[column] >= 0]
        return {'reported_total': sum(valid) if valid or not rows else None,
                'known_attempts': len(valid), 'unknown_attempts': len(rows) - len(valid)}

    with localcontext() as context:
        context.prec = 60
        total = sum(costs, Decimal(0))
        unknown_costs = len(rows) - len(costs)
        estimate = initial_credit - total if initial_credit is not None and unknown_costs == 0 else None
    return {
        'scope': 'local_ledger_only', 'attempts': len(rows),
        'states': {state: states[state] for state in (*STATES, 'unknown')},
        'prompt_tokens': token_summary(1), 'completion_tokens': token_summary(2),
        'reported_cost': {'total': format(total, 'f') if costs or not rows else None,
                          'known_attempts': len(costs), 'unknown_attempts': unknown_costs,
                          'invalid_attempts': invalid_costs, 'currency_verified': False},
        'provider_balance': None,
        'conditional_balance': {
            'initial_credit_supplied': format(initial_credit, 'f') if initial_credit is not None else None,
            'estimate': format(estimate, 'f') if estimate is not None else None,
            'is_provider_balance': False,
            'assumptions': ['same_currency', 'no_usage_outside_this_ledger', 'all_charges_reported'],
        },
    }


def render(report: dict) -> str:
    def shown(value):
        return str(value) if value is not None else 'نامشخص'
    states = report['states']
    cost = report['reported_cost']
    lines = [
        f"تلاش‌های ثبت‌شده در این دستگاه: {report['attempts']}",
        f"پایان‌یافتهٔ فنی: {states['completed']} | خطا: {states['failed']} | لغوشده: {states['cancelled']} | رزروشده: {states['reserved']} | وضعیت نامعتبر: {states['unknown']}",
        'پایان فنی درخواست، تأیید کیفیت پاسخ نیست.',
    ]
    for key, label in [('prompt_tokens', 'ورودی'), ('completion_tokens', 'خروجی')]:
        item = report[key]
        lines.append(f"توکن {label} گزارش‌شده: {shown(item['reported_total'])} | تلاش با مصرف نامشخص: {item['unknown_attempts']}")
    lines += [f"جمع هزینه‌های گزارش‌شده: {shown(cost['total'])}",
              f"تلاش با هزینهٔ نامشخص: {cost['unknown_attempts']} (از جمله دادهٔ نامعتبر: {cost['invalid_attempts']})",
              'واحد هزینه و صورتحساب provider مستقلاً تأیید نشده‌اند؛ هزینهٔ نامشخص صفر نیست.',
              'موجودی قطعی حساب provider: نامشخص']
    balance = report['conditional_balance']
    if balance['initial_credit_supplied'] is not None:
        lines += [f"ماندهٔ محاسباتی مشروط: {shown(balance['estimate'])}",
                  'این برآورد موجودی حساب نیست؛ فقط با واحد یکسان، گزارش تمام هزینه‌ها و نبود مصرف خارج این فایل معتبر است.']
    return '\n'.join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / '.local/agent-usage.sqlite3')
    parser.add_argument('--initial-credit', type=amount, help='Optional conditional estimate only, in the same unverified cost unit.')
    parser.add_argument('--json', action='store_true', help='Print machine-readable totals without credentials or message content.')
    parser.add_argument('--save', action='store_true', help='Save only to ignored .local/usage/report.json; never changes the ledger.')
    args = parser.parse_args(argv)
    try:
        report = read_report(args.database, args.initial_credit)
        if args.save:
            target = ROOT / '.local/usage/report.json'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except (UsageReportError, OSError) as exc:
        message = str(exc) if isinstance(exc, UsageReportError) else 'ذخیرهٔ گزارش محلی ممکن نشد.'
        print(message, file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render(report))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
