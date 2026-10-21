"""Deterministic hours cases, with synthetic schedules and fixed aware clocks."""

from datetime import datetime
import json
import unittest

from apps.api.hours import evaluate_hours


def shift(start="09:00:00", end="18:00:00"):
    return {"start_time": start, "end_time": end}


def declared(*shifts):
    return {"status": "declared", "shifts": list(shifts)}


CLOSED = {"status": "closed", "shifts": [shift("00:00:00", "00:00:00")]}


def check(today, clock="2026-10-21T10:00:00+03:30", previous=CLOSED):
    raw = json.dumps({"wed": today, "tue": previous})
    return evaluate_hours(raw, datetime.fromisoformat(clock))


class DeclaredHoursTests(unittest.TestCase):
    def test_multiple_shifts_opening_inclusive_closing_exclusive_and_lunch(self):
        hours = declared(shift("09:00", "12:00"), shift("16:00", "19:00"))
        for clock, expected in (("08:59:59", "declared_closed"), ("09:00:00", "declared_open"),
                                ("12:00:00", "declared_closed"), ("15:59:59", "declared_closed"),
                                ("16:00:00", "declared_open"), ("19:00:00", "declared_closed")):
            with self.subTest(clock=clock):
                result = check(hours, f"2026-10-21T{clock}+03:30")
                self.assertEqual(result.status, expected)
                self.assertEqual(len(result.today_shifts), 2)

    def test_tehran_calendar_day_and_sunday_to_monday_overnight(self):
        raw = json.dumps({"sun": declared(shift("22:00", "02:00")), "mon": CLOSED})
        result = evaluate_hours(raw, datetime.fromisoformat("2026-10-18T21:30:00+00:00"))
        self.assertEqual(result.local_day, "mon")  # 01:00 Monday in Tehran.
        self.assertEqual(result.status, "declared_open")
        self.assertEqual(len(result.previous_day_overnight_shifts), 1)

    def test_overnight_ends_on_the_next_day_even_if_today_has_no_new_shifts(self):
        previous = declared(shift("22:00", "02:00"))
        self.assertEqual(check(CLOSED, "2026-10-21T01:59:59+03:30", previous).status, "declared_open")
        self.assertEqual(check(CLOSED, "2026-10-21T02:00:00+03:30", previous).status, "declared_closed")
        self.assertEqual(check(previous, "2026-10-21T23:00:00+03:30").status, "declared_open")

    def test_empty_week_missing_day_and_unsupported_remain_unknown(self):
        at = datetime.fromisoformat("2026-10-21T10:00:00+03:30")
        for raw in (None, "{}", '{"fri":{"status":"closed","shifts":[]}}'):
            with self.subTest(raw=raw):
                self.assertEqual(evaluate_hours(raw, at).status, "unknown")
        self.assertEqual(check({"status": "unsupported", "shifts": [shift()]}).status, "unknown")
        self.assertEqual(check({"status": "not_a_known_status"}).status, "unknown")

    def test_unknown_previous_day_cannot_silently_prove_closure(self):
        result = check(declared(shift()), "2026-10-21T01:00:00+03:30", previous=None)
        self.assertEqual((result.status, result.reason), ("unknown", "previous_day_unknown"))
        self.assertEqual(check(declared(shift()), previous=None).status, "declared_open")
        self.assertEqual(check(None, "2026-10-21T01:00:00+03:30",
                               declared(shift("22:00", "02:00"))).status, "declared_open")

    def test_zero_slots_are_empty_intervals_not_24_hour_opening(self):
        zero = shift("00:00:00", "00:00:00")
        result = check(declared(shift(), zero))
        self.assertEqual(result.status, "declared_open")
        self.assertEqual(len(result.today_shifts), 1)
        self.assertEqual(check(declared(zero)).reason, "no_valid_shifts")
        self.assertEqual(check(declared(shift("08:00", "08:00"))).status, "unknown")

    def test_invalid_nested_data_is_explicit_unknown_not_closed(self):
        for today in ([], {"status": "declared", "shifts": {}},
                      declared({"start_time": 9, "end_time": "18:00"}),
                      declared(shift("24:00", "25:00")), declared(shift("09:60", "18:00")),
                      {"status": "closed", "shifts": [shift()]},
                      declared(shift(), {"start_time": "bad", "end_time": "18:00"})):
            with self.subTest(today=today):
                self.assertEqual(check(today).status, "unknown")
        for raw in ("bad json", "null", "[]"):
            result = evaluate_hours(raw, datetime.fromisoformat("2026-10-21T10:00:00+03:30"))
            self.assertEqual((result.status, result.reason), ("unknown", "invalid_schedule"))

    def test_unzoned_clock_is_rejected_instead_of_using_machine_timezone(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            evaluate_hours("{}", datetime(2026, 10, 21, 10))
