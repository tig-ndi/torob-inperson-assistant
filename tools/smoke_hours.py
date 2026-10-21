"""Read-only real-dataset hours check at a fixed time, with an independent SQL oracle."""

import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient

from apps.api.hours import evaluate_hours
from apps.api.main import ROOT, create_app
from tools.prepare_data import sha256


def smoke(database: Path) -> dict:
    before = sha256(database)
    instant = datetime.fromisoformat("2026-10-21T12:00:00+03:30")  # Wednesday, Tehran.
    # Fixed source-only oracle for regular shifts in this snapshot. No domain helper
    # is used to derive expected offer IDs. Overnight behavior is tested separately.
    open_predicate = """
        json_extract(s.weekly_hours,'$.wed.status')='declared' AND EXISTS (
            SELECT 1 FROM json_each(s.weekly_hours,'$.wed.shifts') shift
            WHERE json_extract(shift.value,'$.start_time') <= '12:00:00'
              AND json_extract(shift.value,'$.end_time') > '12:00:00'
        )
    """
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
        product = connection.execute(
            "SELECT o.product_id FROM offers o JOIN shops s ON s.shop_id=o.shop_id WHERE " +
            open_predicate + " GROUP BY o.product_id HAVING count(*)>=2 LIMIT 1").fetchone()
        assert product is not None, "no source-backed open offers for the fixed case"
        product_id = product[0]
        expected = [row[0] for row in connection.execute(
            "SELECT o.offer_id FROM offers o JOIN shops s ON s.shop_id=o.shop_id "
            "WHERE o.product_id=? AND " + open_predicate +
            " ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id", (product_id,))]
        source_count = connection.execute("SELECT count(*) FROM offers WHERE product_id=?", (product_id,)).fetchone()[0]
        profile = Counter(evaluate_hours(raw, instant).status for (raw,) in connection.execute("SELECT weekly_hours FROM shops"))
        source_open_count = connection.execute("SELECT count(*) FROM shops s WHERE " + open_predicate).fetchone()[0]
        assert source_open_count == profile["declared_open"], "dataset-specific noon oracle differs from domain"

    seen = []
    with TestClient(create_app(database, clock=lambda: instant)) as client:
        offset = 0
        while True:
            response = client.get(f"/api/products/{product_id}/offers",
                                  params={"open_now_only": "true", "limit": 1, "offset": offset})
            assert response.status_code == 200, response.status_code
            page = response.json()
            assert page["hours_evaluated_at"] == instant.isoformat()
            assert all(offer["opening_hours"]["status"] == "declared_open" for offer in page["items"])
            assert all(offer["inventory_status"] == "unconfirmed" for offer in page["items"])
            seen.extend(offer["offer_id"] for offer in page["items"])
            if not page["has_more"]:
                break
            offset += 1
            assert offset < source_count, "pagination did not terminate"
        assert seen == expected, "filtered ID set or pagination order differs from independent source oracle"
    assert before == sha256(database), "snapshot changed"
    return {"evidence": "real dataset + fixed-clock ASGI, independent SQL noon oracle",
            "evaluated_at": instant.isoformat(), "matching_offers_checked": len(seen),
            "source_product_offer_count": source_count, "shop_status_counts": dict(profile),
            "snapshot_unchanged": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / ".local/catalogue.sqlite3")
    args = parser.parse_args()
    print(json.dumps(smoke(args.database), ensure_ascii=True))
