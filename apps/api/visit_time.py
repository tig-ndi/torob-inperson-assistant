"""One Tehran calendar interpretation for offers, visits and follow-ups."""
from datetime import date, datetime
from typing import Annotated
from pydantic import AfterValidator, StringConstraints
from apps.api.hours import TEHRAN


def calendar_date(value: str) -> str:
    date.fromisoformat(value)
    return value


CalendarDate = Annotated[str, StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$'), AfterValidator(calendar_date)]


def selected_instant(now: datetime, local_time: str | None, visit_date: str | None = None) -> datetime:
    instant = now.astimezone(TEHRAN)
    if visit_date:
        day = date.fromisoformat(visit_date)
        instant = instant.replace(year=day.year, month=day.month, day=day.day)
    if local_time:
        hour, minute = map(int, local_time.split(':'))
        instant = instant.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return instant
