"""Synthetic usage accounting; no model, network, or credentials are involved."""

from contextlib import closing, redirect_stdout
from decimal import Decimal
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from tools import report_usage


class UsageReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.database = self.root / 'usage.sqlite3'
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute('CREATE TABLE attempts (state TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd TEXT)')
            connection.commit()

    def add(self, *rows):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.executemany('INSERT INTO attempts VALUES (?,?,?,?)', rows)
            connection.commit()

    def test_all_states_are_counted_and_missing_cost_or_tokens_are_not_zero(self):
        self.add(('completed', 100, 20, '0.125'), ('failed', 10, None, None), ('cancelled', None, None, None), ('reserved', None, None, None))
        report = report_usage.read_report(self.database, Decimal('3'))
        self.assertEqual(report['attempts'], 4)
        self.assertEqual(report['states'], {'completed': 1, 'failed': 1, 'cancelled': 1, 'reserved': 1, 'unknown': 0})
        self.assertEqual(report['prompt_tokens'], {'reported_total': 110, 'known_attempts': 2, 'unknown_attempts': 2})
        self.assertEqual(report['reported_cost']['total'], '0.125')
        self.assertEqual(report['reported_cost']['unknown_attempts'], 3)
        self.assertIsNone(report['conditional_balance']['estimate'])
        self.assertIsNone(report['provider_balance'])

    def test_decimal_totals_and_conditional_estimate_preserve_precision_without_clamping(self):
        self.add(('completed', 1, 1, '0.125'), ('completed', 1, 1, '0.000000000000001'), ('failed', 1, 1, '0'))
        report = report_usage.read_report(self.database, Decimal('3'))
        self.assertEqual(report['reported_cost']['total'], '0.125000000000001')
        self.assertEqual(report['conditional_balance']['estimate'], '2.874999999999999')
        self.assertFalse(report['conditional_balance']['is_provider_balance'])
        self.assertFalse(report['reported_cost']['currency_verified'])
        self.assertIn('محاسباتی مشروط', report_usage.render(report))
        self.assertEqual(report_usage.read_report(self.database, Decimal('0'))['conditional_balance']['estimate'], '-0.125000000000001')
        for invalid in [Decimal('NaN'), Decimal('Infinity'), Decimal('-1'), 3.0]:
            with self.subTest(initial_credit=invalid), self.assertRaises(report_usage.UsageReportError):
                report_usage.read_report(self.database, invalid)

    def test_all_missing_costs_and_malformed_values_remain_unknown(self):
        self.add(('completed', None, None, None), ('bad-state', -2, 'bad-token', 'NaN'), ('failed', None, None, '-1'))
        report = report_usage.read_report(self.database)
        self.assertIsNone(report['reported_cost']['total'])
        self.assertEqual(report['reported_cost']['unknown_attempts'], 3)
        self.assertEqual(report['reported_cost']['invalid_attempts'], 2)
        self.assertIsNone(report['prompt_tokens']['reported_total'])
        self.assertEqual(report['states']['unknown'], 1)

    def test_missing_database_is_not_created_and_bad_schema_is_an_error(self):
        missing = self.root / 'missing.sqlite3'
        with self.assertRaises(report_usage.UsageReportError):
            report_usage.read_report(missing)
        self.assertFalse(missing.exists())
        invalid = self.root / 'invalid.sqlite3'
        invalid.write_bytes(b'not a database')
        with self.assertRaises(report_usage.UsageReportError):
            report_usage.read_report(invalid)

    def test_empty_ledger_is_distinct_from_all_unknown_and_reading_changes_no_bytes(self):
        before = self.database.read_bytes()
        report = report_usage.read_report(self.database)
        self.assertEqual(report['attempts'], 0)
        self.assertEqual(report['reported_cost']['total'], '0')
        self.assertEqual(report['reported_cost']['unknown_attempts'], 0)
        self.assertEqual(before, self.database.read_bytes())

    def test_cli_saves_only_local_report_and_does_not_change_source_or_settings(self):
        self.add(('completed', 100, 10, '0.125'))
        before = self.database.read_bytes()
        with patch.object(report_usage, 'ROOT', self.root), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(report_usage.main(['--database', str(self.database), '--save', '--json', '--initial-credit', '3']), 0)
        report = json.loads(output.getvalue())
        saved = json.loads((self.root / '.local/usage/report.json').read_text(encoding='utf-8'))
        self.assertEqual(report, saved)
        self.assertEqual(before, self.database.read_bytes())
        self.assertFalse((self.root / '.env.local').exists())
