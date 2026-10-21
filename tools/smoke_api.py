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
        response = client.get("/api/products", params={"q": "گوشی", "max_price_toman": "1000000", "limit": 3})
        assert response.status_code == 200 and response.json()["items"]
        for product in response.json()["items"]:
            assert connection.execute(
                "SELECT 1 FROM offers WHERE product_id=? AND price_toman<=1000000",
                (product["product_id"],)).fetchone() is not None
        checks += 1
    assert before == sha256(database), "snapshot changed"
    return {"checks": checks, "search_pages": search_counts, "snapshot_unchanged": True,
            "elapsed_seconds": round(time.monotonic() - started, 3), "evidence": "real dataset + in-process ASGI; no model or browser"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / ".local/catalogue.sqlite3")
    arguments = parser.parse_args()
    print(json.dumps(smoke(arguments.database), ensure_ascii=True))
