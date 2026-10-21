"""Read-only source oracle for recorded in-person credit, not financial approval."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient

from apps.api.main import ROOT, create_app
from tools.prepare_data import normalize_text, sha256


def smoke(database: Path) -> dict:
    before = sha256(database)
    # Independent SQL oracle for the current source structure. Domain edge cases
    # (malformed/missing fields, exact category normalization, large bounds) use
    # separate synthetic unit/API tests.
    predicate = """
      o.price_toman IS NOT NULL AND EXISTS (
        SELECT 1 FROM json_each(s.payment_options) term
        WHERE json_extract(term.value,'$.channel')='in_person'
          AND (json_extract(term.value,'$.min_price_toman') IS NULL
               OR o.price_toman >= json_extract(term.value,'$.min_price_toman'))
          AND (json_extract(term.value,'$.max_price_toman') IS NULL
               OR o.price_toman <= json_extract(term.value,'$.max_price_toman'))
          AND (json_array_length(term.value,'$.category_names')=0 OR EXISTS (
               SELECT 1 FROM json_each(term.value,'$.category_names') category
               WHERE source_normalize(category.value)=source_normalize(p.category_name)))
      )
    """
    join = " FROM offers o JOIN shops s ON s.shop_id=o.shop_id JOIN products p ON p.product_id=o.product_id "
    with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)) as connection:
        connection.create_function('source_normalize', 1, lambda text: normalize_text(text) if text is not None else None)
        profile = {row[0]: row[1] for row in connection.execute(
            "SELECT json_extract(term.value,'$.channel'),count(*) FROM shops s,json_each(s.payment_options) term GROUP BY 1")}
        # The snapshot has no populated in-person bounds/category restrictions.
        # Verify that fact explicitly instead of treating this smoke as evidence
        # for conditions that only exist in synthetic tests.
        nonempty = connection.execute("""
            SELECT count(*) FROM shops s,json_each(s.payment_options) term
            WHERE json_extract(term.value,'$.channel')='in_person' AND (
              json_extract(term.value,'$.min_price_toman') IS NOT NULL OR
              json_extract(term.value,'$.max_price_toman') IS NOT NULL OR
              json_array_length(term.value,'$.category_names')<>0)
        """).fetchone()[0]
        assert nonempty == 0, 'source changed; extend the real-data oracle evidence'
        product = connection.execute('SELECT o.product_id' + join + ' WHERE ' + predicate +
                                     ' GROUP BY o.product_id HAVING count(*)>=2 ORDER BY o.product_id LIMIT 1').fetchone()
        assert product is not None, 'no matching source offers'
        product_id = product[0]
        expected = [row[0] for row in connection.execute('SELECT o.offer_id' + join +
            ' WHERE o.product_id=? AND ' + predicate + ' ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id', (product_id,))]
        source_count = connection.execute('SELECT count(*) FROM offers WHERE product_id=?', (product_id,)).fetchone()[0]
        source_options = {row[0]: json.loads(row[1]) for row in connection.execute(
            'SELECT DISTINCT s.shop_id,s.payment_options' + join + ' WHERE o.product_id=?', (product_id,))}
        total_matching = connection.execute('SELECT count(*)' + join + ' WHERE ' + predicate).fetchone()[0]

    seen = []
    with TestClient(create_app(database)) as client:
        for offset in range(source_count):
            response = client.get(f'/api/products/{product_id}/offers', params={
                'in_person_credit_only': 'true', 'limit': 1, 'offset': offset})
            assert response.status_code == 200, response.status_code
            page = response.json()
            for offer in page['items']:
                credit = offer['in_person_credit']
                assert credit['status'] == 'matches_declared_terms'
                assert offer['price_toman'] is not None and offer['inventory_status'] == 'unconfirmed'
                assert len(credit['options']) == len(source_options[offer['shop_id']])
                assert any(term['channel'] == 'in_person' and term['status'] == 'matches_declared_terms' for term in credit['options'])
                assert all(term['status'] == 'unknown' for term in credit['options'] if term['channel'] == 'unknown')
                for term in credit['options']:
                    raw = source_options[offer['shop_id']][term['option_index']]
                    for key in ('min_price_toman', 'max_price_toman'):
                        assert term[key] == (str(raw[key]) if raw[key] is not None else None)
                seen.append(offer['offer_id'])
            if not page['has_more']:
                break
        else:
            raise AssertionError('pagination did not terminate')
    assert seen == expected, 'filtered IDs/order differ from source SQL oracle'
    assert before == sha256(database), 'snapshot changed'
    return {'evidence': 'real dataset + ASGI + independent SQL recorded-terms oracle',
            'source_program_channels': profile, 'source_in_person_programs_with_populated_constraints': nonempty,
            'source_matching_offer_count': total_matching, 'source_product_offer_count': source_count,
            'matching_offers_checked': len(seen), 'snapshot_unchanged': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / '.local/catalogue.sqlite3')
    print(json.dumps(smoke(parser.parse_args().database), ensure_ascii=True))
