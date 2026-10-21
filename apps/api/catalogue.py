"""Bounded retrieval from the historical snapshot. No network or seller contact."""

from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3

from tools.prepare_data import normalize_text


class CatalogueUnavailable(Exception):
    """A missing, incompatible or invalid snapshot is a service failure."""


class InvalidQuery(ValueError):
    pass


def search_expression(query: str) -> str:
    words = re.findall(r"[^\W_]+", normalize_text(query), flags=re.UNICODE)
    if not words or len(words) > 12:
        raise InvalidQuery("جست‌وجو باید بین ۱ تا ۱۲ واژه داشته باشد.")
    # Every token is literal. User-supplied FTS operators never become syntax.
    return " AND ".join('"' + word + '"' for word in words)


def decode_list(raw: str | None) -> list:
    value = json.loads(raw) if raw is not None else []
    if not isinstance(value, list):
        raise CatalogueUnavailable()
    return value


class Catalogue:
    def __init__(self, database: Path):
        self.database = database.resolve()

    @contextmanager
    def connect(self):
        connection = None
        try:
            # mode=ro also prevents accidentally creating an empty database.
            connection = sqlite3.connect(self.database.as_uri() + "?mode=ro", uri=True,
                                         timeout=2)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA query_only=ON")
            # Bound expensive/hostile queries independently of output pagination.
            ticks = 0

            def progress():
                nonlocal ticks
                ticks += 1
                return int(ticks > 2000)

            connection.set_progress_handler(progress, 10000)
            yield connection
        except (sqlite3.Error, OSError, ValueError, TypeError, KeyError) as exc:
            raise CatalogueUnavailable() from exc
        finally:
            if connection is not None:
                connection.close()

    @staticmethod
    def provenance(connection: sqlite3.Connection) -> dict:
        row = connection.execute("SELECT value FROM metadata WHERE key='profile'").fetchone()
        if row is None:
            raise CatalogueUnavailable()
        profile = json.loads(row[0])
        if not isinstance(profile, dict) or profile.get("schema_version") != 1:
            raise CatalogueUnavailable()
        if not isinstance(profile.get("dataset"), str) or not isinstance(profile.get("generated_at_utc"), str):
            raise CatalogueUnavailable()
        return {"snapshot_id": hashlib.sha256(row[0].encode()).hexdigest(),
                "dataset": profile["dataset"], "generated_at_utc": profile["generated_at_utc"],
                "currency": "toman", "inventory_status": "unconfirmed"}

    @staticmethod
    def product(connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
        summary = connection.execute(
            "SELECT count(*),min(price_toman),max(price_toman),sum(price_toman IS NULL) "
            "FROM offers WHERE product_id=?", (row["product_id"],)).fetchone()
        return {"product_id": row["product_id"], "persian_title": row["persian_title"],
                "brand_name": row["brand_name"], "model": row["model"],
                "category_name": row["category_name"],
                "image_urls": decode_list(row["image_urls"]), "specs": decode_list(row["specs"]),
                "offer_summary": {"offer_count": summary[0],
                                  "min_price_toman": str(summary[1]) if summary[1] is not None else None,
                                  "max_price_toman": str(summary[2]) if summary[2] is not None else None,
                                  "missing_price_count": summary[3] or 0}}

    def search(self, query: str, limit: int, offset: int, max_price: int | None) -> dict:
        expression = search_expression(query)
        with self.connect() as connection:
            provenance = self.provenance(connection)
            rows = connection.execute(
                "SELECT p.* FROM product_search JOIN products p "
                "ON p.product_id=product_search.product_id WHERE product_search MATCH ? "
                "AND (? IS NULL OR EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id "
                "AND o.price_toman<=?)) ORDER BY product_search.rank,p.product_id LIMIT ? OFFSET ?",
                (expression, max_price, max_price, limit + 1, offset)).fetchall()
            return {"items": [self.product(connection, row) for row in rows[:limit]],
                    "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "provenance": provenance}

    def detail(self, product_id: str) -> dict | None:
        with self.connect() as connection:
            provenance = self.provenance(connection)
            row = connection.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
            if row is None:
                return None
            return {"product": self.product(connection, row),
                    "provenance": provenance}

    def offers(self, product_id: str, limit: int, offset: int, max_price: int | None) -> dict | None:
        with self.connect() as connection:
            provenance = self.provenance(connection)
            if connection.execute("SELECT 1 FROM products WHERE product_id=?", (product_id,)).fetchone() is None:
                return None
            rows = connection.execute(
                "SELECT o.*,s.name AS shop_name,s.address,s.location_label,s.lat,s.lon "
                "FROM offers o JOIN shops s ON s.shop_id=o.shop_id WHERE o.product_id=? "
                "AND (? IS NULL OR o.price_toman<=?) "
                "ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id LIMIT ? OFFSET ?",
                (product_id, max_price, max_price, limit + 1, offset)).fetchall()
            items = []
            for row in rows[:limit]:
                price = row["price_toman"]
                # This is a precision-risk flag, not a claim of market-price validity.
                quality = "missing" if price is None else (
                    "above_js_safe_integer" if price > 9007199254740991 else "not_assessed")
                items.append({"offer_id": row["offer_id"], "product_id": row["product_id"],
                              "shop_id": row["shop_id"], "price_toman": str(price) if price is not None else None,
                              "price_quality": quality, "last_price_changed_at": row["last_price_changed_at"],
                              "seller_title": row["seller_title"], "description": row["description"],
                              "warranty": json.loads(row["warranty"]) if row["warranty"] is not None else None,
                              "inventory_status": "unconfirmed",
                              "shop": {"name": row["shop_name"], "address": row["address"],
                                       "location_label": row["location_label"], "lat": row["lat"], "lon": row["lon"]}})
            return {"items": items, "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "provenance": provenance}
