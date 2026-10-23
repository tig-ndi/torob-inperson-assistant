"""Local readiness checks only; no provider calls or usage reservations."""

import os
import sqlite3
from pathlib import Path

from apps.api.agent_usage import UsageLedger
from apps.api.catalogue import Catalogue, CatalogueUnavailable


def usage_database(root: Path) -> Path:
    return Path(os.environ.get('TOROB_USAGE_DATABASE', str(root / '.local/agent-usage.sqlite3'))).resolve()


def readiness(catalogue: Catalogue, ledger: UsageLedger, web_dist: Path) -> dict[str, str]:
    checks = {'catalogue': 'unavailable', 'usage': 'unavailable',
              'web': 'ready' if (web_dist / 'index.html').is_file() else 'unavailable'}
    try:
        with catalogue.connect() as connection:
            catalogue.provenance(connection)
            for table in ('products', 'offers', 'shops', 'product_search'):
                if connection.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone() is None:
                    raise CatalogueUnavailable()
        checks['catalogue'] = 'ready'
    except (CatalogueUnavailable, ValueError, TypeError):
        pass
    if not ledger.path.is_file():
        # A missing mount must not silently initialize a fresh usage budget.
        return checks
    try:
        connection = ledger.connect()
        try:
            # Check persistent writes, not just file existence. Never reserve a call.
            connection.execute('BEGIN IMMEDIATE')
            connection.execute('UPDATE attempts SET state=state WHERE 0')
            connection.rollback()
        finally:
            connection.close()
        checks['usage'] = 'ready'
    except (OSError, sqlite3.Error, ValueError):
        pass
    return checks
