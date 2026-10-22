"""Read-only capacity checks against source SQLite; no model or credentials."""

from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3
import time

from fastapi.testclient import TestClient

from apps.api.main import create_app
from tools.prepare_data import normalize_text, sha256


def source_integer_capacity(specs: list) -> tuple[bool, int | None]:
    """Independent narrow oracle: plain integer mAh values, no production parser.

    False means outside this oracle's coverage, not an assertion about the product.
    Covered empty/absent/conflicting fields deliberately have no usable capacity.
    """
    values = set()
    absent = False
    for spec in specs:
        key = normalize_text(spec.get('key') or '')
        if 'ظرفیت' not in key or ('باتری' not in key and 'باطری' not in key):
            continue
        value = normalize_text(spec.get('value') or '')
        if value in {'', '-', '—', 'نامشخص', 'null', 'none', 'undefined', 'title', 'n/a', 'ثبت نشده'}:
            continue
        if value in {'ندارد', 'بدون باتری', 'فاقد باتری'}:
            absent = True
            continue
        if 'محدوده' in key:
            return False, None
        match = re.fullmatch(r'([0-9]+)\s*(mah|میلی\s*آمپر\s*ساعت)', value)
        if match:
            values.add(int(match[1]))
        elif re.fullmatch(r'[0-9]+', value) and ('(میلی آمپر ساعت)' in key or '(mah)' in key):
            values.add(int(value))
        else:
            return False, None
    return True, next(iter(values)) if len(values) == 1 and not absent else None


def smoke(database: Path) -> dict:
    before = sha256(database)
    began = time.monotonic()
    with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        raw = source.execute("SELECT p.product_id,p.specs FROM products p JOIN product_search f ON p.product_id=f.product_id WHERE product_search MATCH 'گوشی' AND p.category_name='گوشی موبایل'").fetchall()
        expected = {pid: source_integer_capacity(json.loads(specs)) for pid, specs in raw}
        covered = {pid: value for pid, (known, value) in expected.items() if known}
        checks = []
        with TestClient(create_app(database)) as client:
            for minimum, budget in [(5000, None), (6000, None), (5000, 8000000)]:
                found = {}
                offset = 0
                while True:
                    params = {'q': 'گوشی', 'limit': 50, 'offset': offset, 'min_battery_capacity_mah': minimum}
                    if budget is not None:
                        params['max_price_toman'] = str(budget)
                    response = client.get('/api/products', params=params)
                    assert response.status_code == 200, 'catalogue failure'
                    page = response.json()
                    for product in page['items']:
                        pid = product['product_id']
                        assert pid not in found, 'repeated product across pages'
                        found[pid] = product
                        capacity = product['battery_capacity']
                        assert capacity['status'] == 'known' and capacity['capacity_mah'] >= minimum
                        if pid in covered:
                            assert capacity['capacity_mah'] == covered[pid], 'capacity differs from source oracle'
                    if not page['has_more']:
                        break
                    offset += 50
                    assert offset <= 1000, 'unbounded pagination'
                qualifying = {pid for pid, capacity in covered.items() if capacity is not None and capacity >= minimum and (
                    budget is None or source.execute('SELECT 1 FROM offers WHERE product_id=? AND price_toman<=?', (pid, budget)).fetchone())}
                assert set(found) & set(covered) == qualifying, 'pre-pagination source membership mismatch'
                checks.append({'minimum_mah': minimum, 'budget_applied': budget is not None, 'products': len(found), 'oracle_products': len(qualifying)})
    result = {'snapshot_unchanged': before == sha256(database), 'phone_matches': len(raw),
              'oracle_covered_products': len(covered), 'oracle_uncovered_products': len(raw) - len(covered),
              'checks': checks, 'seconds': round(time.monotonic() - began, 3)}
    assert result['snapshot_unchanged']
    return result


if __name__ == '__main__':
    print(json.dumps(smoke(Path(__file__).resolve().parents[1] / '.local/catalogue.sqlite3'), ensure_ascii=False, indent=2))
