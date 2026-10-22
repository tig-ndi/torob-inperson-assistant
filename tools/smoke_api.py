"""Read-only ASGI + real-dataset checks. Prints aggregates, never shop contacts."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient

from apps.api.main import ROOT, create_app
from tools.prepare_data import sha256


def smoke(database: Path) -> dict:
    before = sha256(database)
    started = time.monotonic()
    checks = 0
    search_counts = {}
    with TestClient(create_app(database)) as client, closing(sqlite3.connect(
            database.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
        for query in ("گوشی", "کفش", "سونی"):
            response = client.get("/api/products", params={"q": query, "limit": 3})
            assert response.status_code == 200, (query, response.status_code)
            body = response.json()
            assert body["items"] and body["provenance"]["inventory_status"] == "unconfirmed"
            search_counts[query] = {"returned": len(body["items"]), "has_more": body["has_more"]}
            checks += 1

        # Expected IDs/values come independently from source SQL, not API output.
        for condition in ("price_toman IS NULL", "price_toman > 9007199254740991"):
            row = connection.execute("SELECT offer_id,product_id,price_toman FROM offers WHERE " + condition + " LIMIT 1").fetchone()
            assert row is not None
            response = client.get(f"/api/products/{row[1]}/offers", params={"limit": 50})
            assert response.status_code == 200
            found = {offer["offer_id"]: offer for offer in response.json()["items"]}
            offset = 50
            while row[0] not in found and response.json()["has_more"] and offset <= 1000:
                response = client.get(f"/api/products/{row[1]}/offers", params={"limit": 50, "offset": offset})
                assert response.status_code == 200
                found.update({offer["offer_id"]: offer for offer in response.json()["items"]})
                offset += 50
            assert row[0] in found, "source offer not reachable within bounded pages"
            assert found[row[0]]["price_toman"] == (str(row[2]) if row[2] is not None else None)
            checks += 1

        product_id, shop_id, count = connection.execute(
            "SELECT product_id,shop_id,count(*) FROM offers GROUP BY product_id,shop_id HAVING count(*)>1 LIMIT 1").fetchone()
        expected = {row[0] for row in connection.execute(
            "SELECT offer_id FROM offers WHERE product_id=? AND shop_id=?", (product_id, shop_id))}
        seen = set()
        offset = 0
        while offset <= 1000:
            response = client.get(f"/api/products/{product_id}/offers", params={"limit": 50, "offset": offset})
            assert response.status_code == 200
            body = response.json()
            seen.update(offer["offer_id"] for offer in body["items"] if offer["shop_id"] == shop_id)
            if not body["has_more"]:
                break
            offset += 50
        assert seen == expected and len(seen) == count
        checks += 1
        # The source, not an assumption about market prices, defines the oracle.
        # Category names are independently specified here, not inferred by the
        # detector under test. Include an exact source-price boundary as well as
        # the historical low budget which can legitimately produce no results.
        phone_category = 'گوشی موبایل'
        minimum = connection.execute(
            'SELECT min(o.price_toman) FROM offers o JOIN products p ON p.product_id=o.product_id '
            'WHERE p.category_name=?', (phone_category,)).fetchone()[0]
        assert minimum is not None, 'source has no priced mobile phones'
        budget_pages = {}
        for budget in sorted({0, 1000000, 10000000, minimum}):
            expected = {r[0] for r in connection.execute(
                'SELECT p.product_id FROM products p WHERE p.category_name=? '
                'AND EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id AND o.price_toman<=?)',
                (phone_category, budget))}
            response = client.get('/api/products', params={
                'q': 'گوشی', 'max_price_toman': str(budget), 'limit': 3})
            assert response.status_code == 200
            page = response.json()
            actual = {p['product_id'] for p in page['items']}
            assert page['category_name'] == phone_category
            assert actual <= expected and len(page['items']) == len(actual) == min(3, len(expected))
            assert page['has_more'] == (len(expected) > 3)
            assert all(p['category_name'] == phone_category for p in page['items'])
            budget_pages[str(budget)] = {'source_eligible': len(expected), 'returned': len(actual)}
            checks += 1
    assert before == sha256(database), "snapshot changed"
    return {"checks": checks, "search_pages": search_counts, "phone_budget_pages": budget_pages, "snapshot_unchanged": True,
            "elapsed_seconds": round(time.monotonic() - started, 3), "evidence": "real dataset + in-process ASGI; no model or browser"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / ".local/catalogue.sqlite3")
    arguments = parser.parse_args()
    print(json.dumps(smoke(arguments.database), ensure_ascii=True))
