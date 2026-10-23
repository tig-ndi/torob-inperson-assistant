"""Export consistent SQLite backups separately from the code package; never upload."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]


def export_data(catalogue: Path, usage: Path, destination: Path) -> dict:
    # A new directory prevents overwriting an existing export or either source.
    if not catalogue.is_file() or not usage.is_file():
        raise ValueError('Both existing catalogue and usage databases are required; no ledger reset is allowed.')
    destination.mkdir(parents=True, exist_ok=False)
    manifest = {'files': {}}
    for source, name, tables in (
        (catalogue, 'catalogue.sqlite3', ('metadata', 'products', 'offers', 'shops', 'product_search')),
        (usage, 'agent-usage.sqlite3', ('attempts',)),
    ):
        target = destination / name
        # SQLite backup includes committed WAL data; plain file copying may not.
        original = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
        backup = sqlite3.connect(target)
        try:
            original.backup(backup)
            if backup.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('Export failed SQLite integrity validation.')
            for table in tables:
                backup.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone()
        finally:
            backup.close()
            original.close()
        digest = hashlib.sha256()
        with target.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        manifest['files'][name] = {'sha256': digest.hexdigest(), 'bytes': target.stat().st_size}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue', type=Path, default=Path(os.environ.get(
        'TOROB_DATABASE', str(ROOT / '.local/catalogue.sqlite3'))))
    parser.add_argument('--usage', type=Path, default=Path(os.environ.get(
        'TOROB_USAGE_DATABASE', str(ROOT / '.local/agent-usage.sqlite3'))))
    parser.add_argument('--output', type=Path, required=True, help='A NEW private directory outside the code upload.')
    args = parser.parse_args()
    try:
        export_data(args.catalogue, args.usage, args.output)
    except (OSError, ValueError, sqlite3.Error) as exc:
        raise SystemExit('Export failed; do not upload any partial export. Check source files and use a new output directory.') from exc
    print('Export validated. Transfer the two databases and verify manifest.json privately; nothing was uploaded.')


if __name__ == '__main__':
    main()
