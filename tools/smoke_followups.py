"""Read-only P3-A checks on the real snapshot. Prints aggregates, never contacts."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient

from apps.api.main import ROOT, create_app
from tools.prepare_data import sha256

FORBIDDEN_KEYS = {'contacts', 'phone', 'telephone', 'mobile', 'website_url', 'instagram',
                  'whatsapp', 'telegram'}
FORBIDDEN_TEXT = ('tel:', 'wa.me', 'whatsapp.com', 't.me/')


def keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key.lower()
            yield from keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from keys(child)


def assert_no_contact(body):
    assert not (set(keys(body)) & FORBIDDEN_KEYS)
    text = json.dumps(body, ensure_ascii=False).lower()
    for marker in FORBIDDEN_TEXT:
        assert marker not in text, marker


def price_quality(price):
    if price is None:
        return 'missing'
    return 'above_js_safe_integer' if price > 9007199254740991 else 'not_assessed'


def smoke(database: Path) -> dict:
    before = sha256(database)
    started = time.monotonic()
    checks = 0
    with TestClient(create_app(database)) as client, closing(sqlite3.connect(
            database.resolve().as_uri() + '?mode=ro', uri=True)) as connection:
        candidate = connection.execute(
            'WITH counts AS (SELECT product_id,shop_id,count(*) AS c FROM offers '
            'GROUP BY product_id,shop_id), multi AS (SELECT product_id,max(c) AS max_c '
            'FROM counts GROUP BY product_id HAVING count(*)>=2), '
            'totals AS (SELECT product_id,count(*) AS total FROM offers GROUP BY product_id) '
            'SELECT counts.product_id,counts.shop_id FROM counts '
            'JOIN multi USING(product_id) JOIN totals USING(product_id) '
            'WHERE counts.c=1 AND multi.max_c>=2 '
            'AND EXISTS (SELECT 1 FROM shops s WHERE s.shop_id=counts.shop_id) '
            'AND EXISTS (SELECT 1 FROM offers x JOIN shops sx ON sx.shop_id=x.shop_id '
            'WHERE x.product_id=counts.product_id AND x.shop_id<>counts.shop_id '
            'GROUP BY x.shop_id HAVING count(*)>=2) '
            'ORDER BY totals.total DESC,counts.product_id,counts.shop_id LIMIT 1').fetchone()
        assert candidate is not None, 'real snapshot has no product with a single-offer shop and a multi-offer shop'
        product_id, reported_shop = candidate
        product_offer_count = connection.execute(
            'SELECT count(*) FROM offers WHERE product_id=?', (product_id,)).fetchone()[0]
        offer_id = connection.execute(
            'SELECT offer_id FROM offers WHERE product_id=? AND shop_id=? LIMIT 1',
            (product_id, reported_shop)).fetchone()[0]
        alt_shop, alt_shop_count = connection.execute(
            'SELECT o.shop_id,count(*) FROM offers o JOIN shops s ON s.shop_id=o.shop_id '
            'WHERE o.product_id=? AND o.shop_id<>? '
            'GROUP BY o.shop_id HAVING count(*)>=2 ORDER BY count(*) DESC,o.shop_id LIMIT 1',
            (product_id, reported_shop)).fetchone()
        assert alt_shop_count >= 2

        selected = connection.execute(
            'SELECT product_id,shop_id,price_toman,last_price_changed_at,seller_title,description,warranty '
            'FROM offers WHERE offer_id=?', (offer_id,)).fetchone()
        product_title = connection.execute(
            'SELECT persian_title FROM products WHERE product_id=?', (product_id,)).fetchone()[0]

        prepared = client.post('/api/followups/prepare', json={
            'product_id': product_id, 'offer_id': offer_id, 'shop_id': reported_shop})
        assert prepared.status_code == 200, prepared.text
        prepared_body = prepared.json()
        assert prepared_body['status'] == 'prepared'
        assert (prepared_body['product']['product_id'], prepared_body['product']['persian_title']) == (
            product_id, product_title)
        selected_body = prepared_body['selected_offer']
        assert (selected_body['offer_id'], selected_body['product_id'], selected_body['shop_id']) == (
            offer_id, selected[0], selected[1])
        assert selected_body['price_toman'] == (str(selected[2]) if selected[2] is not None else None)
        assert selected_body['price_quality'] == price_quality(selected[2])
        assert selected_body['last_price_changed_at'] == selected[3]
        assert selected_body['seller_title'] == selected[4]
        assert selected_body['description'] == selected[5]
        assert selected_body['warranty'] == (json.loads(selected[6]) if selected[6] is not None else None)
        assert selected_body['inventory_status'] == 'unconfirmed'
        assert prepared_body['draft']['delivery_status'] == 'draft_not_sent'
        assert prepared_body['draft']['contact_channel_available'] is False
        assert prepared_body['draft']['external_contact_attempted'] is False
        if selected[2] is not None:
            assert str(selected[2]) in prepared_body['draft']['text']
        assert any('ارسال نشده' in item for item in prepared_body['limitations'])
        assert_no_contact(prepared_body)
        checks += 1

        expected_mismatch = connection.execute(
            'SELECT shop_id FROM offers WHERE product_id=? AND shop_id<>? LIMIT 1',
            (product_id, reported_shop)).fetchone()[0]
        mismatch = client.post('/api/followups/prepare', json={
            'product_id': product_id, 'offer_id': offer_id, 'shop_id': expected_mismatch})
        assert mismatch.status_code == 409 and mismatch.json()['code'] == 'offer_shop_mismatch'
        missing_offer = client.post('/api/followups/prepare', json={
            'product_id': product_id, 'offer_id': 'missing_offer', 'shop_id': reported_shop})
        assert missing_offer.status_code == 404 and missing_offer.json()['code'] == 'offer_not_found'
        missing_product = client.post('/api/followups/prepare', json={
            'product_id': 'missing_product', 'offer_id': offer_id, 'shop_id': reported_shop})
        assert missing_product.status_code == 404 and missing_product.json()['code'] == 'product_not_found'
        checks += 3

        base_payload = {
            'product_id': product_id, 'offer_id': offer_id, 'shop_id': reported_shop,
            'outcome': 'out_of_stock', 'outcome_source': 'simulated',
        }

        def collect(**changes):
            body = None
            items = []
            offset = 0
            pages = 0
            while True:
                response = client.post('/api/followups/alternatives', json={
                    **base_payload, 'limit': 10, 'offset': offset, **changes})
                assert response.status_code == 200, response.text
                body = response.json()
                items.extend(body['alternatives']['items'])
                pages += 1
                if not body['alternatives']['has_more']:
                    break
                offset += 10
                assert pages < 100, 'pagination did not terminate'
            return body, items, pages

        expected_all = connection.execute(
            'SELECT o.offer_id,o.product_id,o.shop_id,o.price_toman,o.last_price_changed_at '
            'FROM offers o JOIN shops s ON s.shop_id=o.shop_id '
            'WHERE o.product_id=? AND o.shop_id<>? '
            'ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id',
            (product_id, reported_shop)).fetchall()
        all_body, all_items, all_pages = collect()
        assert all_body['status'] == 'alternatives_available'
        assert all_body['excluded_offer_count'] == connection.execute(
            'SELECT count(*) FROM offers WHERE product_id=? AND shop_id=?',
            (product_id, reported_shop)).fetchone()[0]
        assert [item['offer_id'] for item in all_items] == [row[0] for row in expected_all]
        expected_by_id = {row[0]: row for row in expected_all}
        for item in all_items:
            row = expected_by_id[item['offer_id']]
            assert (item['product_id'], item['shop_id']) == (row[1], row[2])
            assert item['price_toman'] == (str(row[3]) if row[3] is not None else None)
            assert item['price_quality'] == price_quality(row[3])
            assert item['last_price_changed_at'] == row[4]
            assert item['inventory_status'] == 'unconfirmed'
            assert item['shop_id'] != reported_shop
        alt_ids = {row[0] for row in expected_all if row[2] == alt_shop}
        returned_ids = {item['offer_id'] for item in all_items}
        assert alt_ids <= returned_ids and len(alt_ids) == alt_shop_count
        assert all_body['outcome'] == {
            'kind': 'out_of_stock', 'source': 'simulated',
            'received_at': all_body['outcome']['received_at'],
            'verified_externally': False, 'seller_confirmation': False}
        assert all_body['outcome']['received_at'] == all_body['alternatives']['hours_evaluated_at']
        assert any('کنار گذاشته' in item for item in all_body['limitations'])
        assert any('تأییدنشده' in item for item in all_body['limitations'])
        assert_no_contact(all_body)
        checks += 1

        priced = sorted(row[3] for row in expected_all if row[3] is not None)
        assert priced, 'real candidate has no priced alternative'
        budget = priced[len(priced) // 2]
        expected_budget = connection.execute(
            'SELECT o.offer_id FROM offers o JOIN shops s ON s.shop_id=o.shop_id '
            'WHERE o.product_id=? AND o.shop_id<>? AND o.price_toman<=? '
            'ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id',
            (product_id, reported_shop, budget)).fetchall()
        budget_body, budget_items, budget_pages = collect(max_price_toman=str(budget))
        assert budget_body['status'] == 'alternatives_available'
        assert [item['offer_id'] for item in budget_items] == [row[0] for row in expected_budget]
        assert all(int(item['price_toman']) <= budget for item in budget_items)
        assert all(item['shop_id'] != reported_shop for item in budget_items)
        assert_no_contact(budget_body)
        checks += 1

        minimum = connection.execute(
            'SELECT min(o.price_toman) FROM offers o JOIN shops s ON s.shop_id=o.shop_id '
            'WHERE o.product_id=? AND o.shop_id<>?',
            (product_id, reported_shop)).fetchone()[0]
        no_alternative_probe = None
        if minimum is not None and minimum > 0:
            none_body, none_items, _ = collect(max_price_toman='0')
            assert none_body['status'] == 'no_alternatives'
            assert none_items == []
            assert 'محصول دیگری جایگزین نشد' in none_body['limitations'][-1]
            no_alternative_probe = 'zero_budget'
            checks += 1
        else:
            no_alternative_probe = 'skipped_source_has_zero_price'

    assert before == sha256(database), 'snapshot changed'
    return {
        'checks': checks,
        'product_offers': product_offer_count,
        'reported_shop_offers': all_body['excluded_offer_count'],
        'alternatives_returned': len(all_items),
        'multi_offer_shop_preserved': alt_shop_count,
        'alternative_pages': all_pages,
        'budget_qualified': len(expected_budget),
        'budget_returned': len(budget_items),
        'budget_pages': budget_pages,
        'no_alternative_probe': no_alternative_probe,
        'snapshot_unchanged': True,
        'elapsed_seconds': round(time.monotonic() - started, 3),
        'evidence': 'real snapshot + in-process ASGI; no model, browser, or contact',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / '.local/catalogue.sqlite3')
    arguments = parser.parse_args()
    print(json.dumps(smoke(arguments.database), ensure_ascii=True))
