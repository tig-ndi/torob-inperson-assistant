"""Isolated historical fixture server for browser checks; no live providers."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path[:0] = [str(ROOT), str(ROOT / 'tests')]
from test_api import CatalogueApiTests
from apps.api.assistant import AssistantService, AgentSettings
from apps.api.agent_usage import UsageLedger
from apps.api.catalogue import Catalogue
from apps.api.main import create_app
import uvicorn

if __name__ == '__main__':
    fixture = CatalogueApiTests('test_normalized_search_and_literal_fts_tokens')
    fixture.setUp()
    try:
        # All storage is in the fixture's TemporaryDirectory, never .local or source CSVs.
        agent = AssistantService(Catalogue(fixture.database), AgentSettings(),
                                 UsageLedger(fixture.root / 'disabled-usage.sqlite3'))
        app = create_app(fixture.database, assistant=agent)
        uvicorn.run(app, host='127.0.0.1', port=18121, access_log=False)
    finally:
        fixture.doCleanups()
