"""Production serving/storage regressions. Synthetic data, no provider credit."""

import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.agent_usage import UsageLedger
from apps.api.assistant import AssistantService
from apps.api.catalogue import Catalogue
from apps.api.main import create_app
from tools.export_deploy_data import export_data


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.web = self.root / 'dist'
        self.web.mkdir()
        (self.web / 'index.html').write_text('<html>TOROB TEST</html>', encoding='utf-8')
        (self.web / 'assets').mkdir()
        (self.web / 'assets/test.js').write_text('console.log("fixture");', encoding='utf-8')
        self.database = self.root / 'catalogue.sqlite3'
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute('CREATE TABLE metadata (key TEXT, value TEXT)')
            connection.execute('INSERT INTO metadata VALUES (?,?)', ('profile', json.dumps(
                {'schema_version': 1, 'dataset': 'synthetic', 'generated_at_utc': '2026-10-23T00:00:00Z'})))
            for table in ('products', 'offers', 'shops', 'product_search'):
                connection.execute(f'CREATE TABLE {table} (id TEXT)')
                connection.execute(f'INSERT INTO {table} VALUES (?)', ('fixture',))
        self.usage = self.root / 'persistent/agent-usage.sqlite3'
        UsageLedger(self.usage).connect().close()
        self.environment = patch.dict('os.environ', {'TOROB_DATABASE': str(self.database),
            'TOROB_USAGE_DATABASE': str(self.usage), 'TOROB_ASSISTANT_ENABLED': '0'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.client = TestClient(create_app(web_dist=self.web))

    def test_same_origin_frontend_assets_api_and_404(self):
        self.assertIn('TOROB TEST', self.client.get('/').text)
        self.assertIn('javascript', self.client.get('/assets/test.js').headers['content-type'])
        self.assertEqual(self.client.get('/api/assistant/status').json()['reason'], 'disabled')
        self.assertEqual(self.client.get('/api/nonexistent').status_code, 404)
        self.assertEqual(self.client.get('/assets/missing.js').status_code, 404)
        self.assertEqual(self.client.get('/.env.local').status_code, 404)
        self.assertEqual(self.client.get('/openapi.json').status_code, 200)

    def test_readiness_preserves_calls_and_survives_recreation(self):
        ledger = UsageLedger(self.usage)
        ledger.reserve('reserved-fixture', 'synthetic', 3)
        ledger.finish('reserved-fixture', 'completed')
        for client in (self.client, TestClient(create_app(web_dist=self.web))):
            response = client.get('/api/health/ready')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(set(response.json()['checks'].values()), {'ready'})
            self.assertEqual(ledger.remaining(3), 2)
        self.assertEqual(AssistantService.from_root(Catalogue(self.database), self.root).ledger.path, self.usage)

    def test_missing_data_is_503_not_empty_success_or_created_database(self):
        missing = self.root / 'missing.sqlite3'
        client = TestClient(create_app(missing, web_dist=self.web))
        self.assertEqual(client.get('/').status_code, 200)
        self.assertEqual(client.get('/api/health/live').status_code, 200)
        self.assertEqual(client.get('/api/health/ready').status_code, 503)
        self.assertEqual(client.get('/api/products?q=test').status_code, 503)
        self.assertFalse(missing.exists())

    def test_missing_build_or_unwritable_ledger_fails_readiness(self):
        client = TestClient(create_app(web_dist=self.root / 'absent'))
        self.assertEqual(client.get('/').status_code, 404)
        self.assertEqual(client.get('/api/health/ready').json()['checks']['web'], 'unavailable')
        with patch.dict('os.environ', {'TOROB_USAGE_DATABASE': str(self.root)}):
            client = TestClient(create_app(web_dist=self.web))
            self.assertEqual(client.get('/api/health/ready').status_code, 503)
            self.assertEqual(client.get('/api/health/ready').json()['checks']['usage'], 'unavailable')
        missing = self.root / 'never-create-ledger.sqlite3'
        with patch.dict('os.environ', {'TOROB_USAGE_DATABASE': str(missing)}):
            client = TestClient(create_app(web_dist=self.web))
            self.assertEqual(client.get('/api/health/ready').status_code, 503)
            self.assertFalse(missing.exists())

    def test_data_export_preserves_ledger_and_refuses_overwrite(self):
        ledger = UsageLedger(self.usage)
        ledger.reserve('export-fixture', 'synthetic', 3)
        ledger.finish('export-fixture', 'failed')
        original = self.usage.read_bytes()
        output = self.root / 'private-transfer'
        manifest = export_data(self.database, self.usage, output)
        self.assertEqual(set(manifest['files']), {'catalogue.sqlite3', 'agent-usage.sqlite3'})
        self.assertEqual(UsageLedger(output / 'agent-usage.sqlite3').remaining(3), 2)
        self.assertEqual(self.usage.read_bytes(), original)
        with self.assertRaises(FileExistsError):
            export_data(self.database, self.usage, output)

    def test_start_command_validates_port_and_checks_before_binding(self):
        from tools.serve import main
        with patch.dict('os.environ', {'PORT': 'bad'}), self.assertRaises(SystemExit):
            main()
        with patch('apps.api.main.app', create_app(web_dist=self.web)), \
                patch.dict('os.environ', {'PORT': '18099'}), patch('tools.serve.uvicorn.run') as run:
            main()
            self.assertEqual(run.call_args.kwargs, {'host': '0.0.0.0', 'port': 18099,
                                                    'access_log': False, 'workers': 1})
        with patch('apps.api.main.app', create_app(self.root / 'absent-db', web_dist=self.web)), \
                patch('tools.serve.uvicorn.run') as run, self.assertRaises(SystemExit):
            main()
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
