"""Interpret declared weekly hours; never infer live opening or inventory."""

from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta
import json
import re
from typing import Literal
from zoneinfo import ZoneInfo


TEHRAN = ZoneInfo("Asia/Tehran")
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
HoursStatus = Literal["declared_open", "declared_closed", "unknown"]
HoursReason = Literal[
    "within_declared_shift", "outside_declared_shifts", "declared_closed_day",
    "missing_schedule", "unsupported_schedule", "invalid_schedule",
    "no_valid_shifts", "previous_day_unknown",
]


@dataclass(frozen=True)
class Shift:
    start_time: str
    end_time: str
    ends_next_day: bool


@dataclass(frozen=True)
class Day:
    known: bool
    reason: HoursReason
    shifts: tuple[Shift, ...] = ()


@dataclass(frozen=True)
class Hours:
    status: HoursStatus
    reason: HoursReason
    local_day: str
    today_shifts: tuple[Shift, ...]
    previous_day_overnight_shifts: tuple[Shift, ...]

    def as_dict(self) -> dict:
        return {"status": self.status, "reason": self.reason, "local_day": self.local_day,
                "today_shifts": [asdict(shift) for shift in self.today_shifts],
                "previous_day_overnight_shifts": [asdict(shift) for shift in self.previous_day_overnight_shifts]}


def tehran_time(at: datetime) -> datetime:
    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError("hours evaluation requires a timezone-aware datetime")
    return at.astimezone(TEHRAN)


def parse_time(value: object) -> time:
    if not isinstance(value, str) or re.fullmatch(r"[0-9]{2}:[0-9]{2}(:[0-9]{2})?", value) is None:
        raise ValueError("invalid shift time")
    return time.fromisoformat(value)


def parse_day(value: object) -> Day:
    if value is None or value == {}:
        return Day(False, "missing_schedule")
    if not isinstance(value, dict):
        return Day(False, "invalid_schedule")
    status = value.get("status")
    if status == "unsupported" or status not in ("declared", "closed"):
        return Day(False, "unsupported_schedule")
    raw_shifts = value.get("shifts", [])
    if not isinstance(raw_shifts, list):
        return Day(False, "invalid_schedule")
    shifts = []
    for raw in raw_shifts:
        if not isinstance(raw, dict):
            return Day(False, "invalid_schedule")
        try:
            start, end = parse_time(raw.get("start_time")), parse_time(raw.get("end_time"))
        except ValueError:
            return Day(False, "invalid_schedule")
        # Zero-duration 00:00 slots coexist with real shifts in the source.
        # They are empty intervals, never evidence of 24-hour opening.
        if start == end == time(0):
            continue
        if start == end or status == "closed":
            return Day(False, "invalid_schedule")
        shifts.append(Shift(start.isoformat(), end.isoformat(), end < start))
    if status == "closed":
        return Day(True, "declared_closed_day")
    if not shifts:
        return Day(False, "no_valid_shifts")
    return Day(True, "outside_declared_shifts", tuple(shifts))


def within(shift: Shift, start_date: date, at: datetime) -> bool:
    start = datetime.combine(start_date, time.fromisoformat(shift.start_time), TEHRAN)
    end_date = start_date + timedelta(days=int(shift.ends_next_day))
    end = datetime.combine(end_date, time.fromisoformat(shift.end_time), TEHRAN)
    # Opening is inclusive, closing exclusive. Never round before comparison.
    return start <= at < end


def evaluate_hours(raw: str | None, at: datetime) -> Hours:
    local = tehran_time(at)
    day_key = DAYS[local.weekday()]
    previous_key = DAYS[(local.weekday() - 1) % 7]
    if raw is None:
        weekly = {}
    else:
        try:
            weekly = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return Hours("unknown", "invalid_schedule", day_key, (), ())
    if not isinstance(weekly, dict):
        return Hours("unknown", "invalid_schedule", day_key, (), ())
    today, previous = parse_day(weekly.get(day_key)), parse_day(weekly.get(previous_key))
    carryover = tuple(shift for shift in previous.shifts if shift.ends_next_day)
    previous_date = local.date() - timedelta(days=1)
    active = any(within(shift, local.date(), local) for shift in today.shifts)
    active = active or any(within(shift, previous_date, local) for shift in carryover)
    if active:
        status, reason = "declared_open", "within_declared_shift"
    elif not today.known:
        status, reason = "unknown", today.reason
    elif not previous.known:
        # An unknown prior day may contain an overnight shift; don't invent closure.
        status, reason = "unknown", "previous_day_unknown"
    else:
        status, reason = "declared_closed", today.reason
    return Hours(status, reason, day_key, today.shifts, carryover)
