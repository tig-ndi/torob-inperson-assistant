"""Bounded retrieval from the historical snapshot. No network or seller contact."""

from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3

from tools.prepare_data import normalize_text
from apps.api.hours import evaluate_hours, tehran_time
from apps.api.credit import evaluate_credit


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two coordinates in meters using the Haversine formula."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return 6371000.0 * c


def safe_haversine_m(lat1, lon1, lat2, lon2):
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    try:
        lat1 = float(lat1)
        lon1 = float(lon1)
        lat2 = float(lat2)
        lon2 = float(lon2)
        if not (math.isfinite(lat1) and math.isfinite(lon1) and math.isfinite(lat2) and math.isfinite(lon2)):
            return None
        return haversine_distance_m(lat1, lon1, lat2, lon2)
    except (TypeError, ValueError):
        return None


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
            connection.create_function("haversine_m", 4, safe_haversine_m, deterministic=True)
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

    def search(self, query: str, limit: int, offset: int, max_price: int | None,
               category_name: str | None = None) -> dict:
        expression = search_expression(query)
        with self.connect() as connection:
            provenance = self.provenance(connection)
            rows = connection.execute(
                "SELECT p.* FROM product_search JOIN products p "
                "ON p.product_id=product_search.product_id WHERE product_search MATCH ? "
                "AND (? IS NULL OR p.category_name = ?) "
                "AND (? IS NULL OR EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id "
                "AND o.price_toman<=?)) ORDER BY product_search.rank,p.product_id LIMIT ? OFFSET ?",
                (expression, category_name, category_name, max_price, max_price, limit + 1, offset)).fetchall()
            return {"items": [self.product(connection, row) for row in rows[:limit]],
                    "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "category_name": category_name,
                    "provenance": provenance}

    def detail(self, product_id: str) -> dict | None:
        with self.connect() as connection:
            provenance = self.provenance(connection)
            row = connection.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
            if row is None:
                return None
            return {"product": self.product(connection, row),
                    "provenance": provenance}

    def offers(self, product_id: str, limit: int, offset: int, max_price: int | None,
               user_lat: float | None = None, user_lon: float | None = None,
               max_distance_km: float | None = None, open_now_only: bool = False,
               evaluated_at: datetime | None = None, in_person_credit_only: bool = False) -> dict | None:
        checked_at = tehran_time(evaluated_at if evaluated_at is not None else datetime.now(timezone.utc))

        @lru_cache(maxsize=1024)
        def hours(raw: str | None):
            return evaluate_hours(raw, checked_at)

        @lru_cache(maxsize=1024)
        def credit(raw: str | None, price: int | None, category: str | None):
            return evaluate_credit(raw, price, category)

        with self.connect() as connection:
            connection.create_function("declared_open_now", 1,
                                       lambda raw: int(hours(raw).status == "declared_open"), deterministic=True)
            connection.create_function("matches_in_person_credit", 3,
                                       lambda raw, price, category: int(credit(raw, price, category).status == "matches_declared_terms"),
                                       deterministic=True)
            provenance = self.provenance(connection)
            if connection.execute("SELECT 1 FROM products WHERE product_id=?", (product_id,)).fetchone() is None:
                return None

            has_location = user_lat is not None and user_lon is not None
            max_dist_m = max_distance_km * 1000.0 if max_distance_km is not None else None

            query = ("SELECT o.*,s.name AS shop_name,s.address,s.location_label,s.lat,s.lon,s.weekly_hours,"
                     "s.payment_options,p.category_name AS product_category_name")
            params: list = []
            if has_location:
                query += ",haversine_m(?, ?, s.lat, s.lon) AS dist_m"
                params.extend([user_lat, user_lon])
            else:
                query += ",NULL AS dist_m"

            query += (
                " FROM offers o JOIN shops s ON s.shop_id=o.shop_id "
                "JOIN products p ON p.product_id=o.product_id WHERE o.product_id=? "
                "AND (? IS NULL OR o.price_toman<=?) "
            )
            params.extend([product_id, max_price, max_price])

            if open_now_only:
                query += "AND declared_open_now(s.weekly_hours)=1 "

            if in_person_credit_only:
                query += "AND matches_in_person_credit(s.payment_options,o.price_toman,p.category_name)=1 "

            if max_dist_m is not None:
                # Radius condition is applied BEFORE LIMIT / OFFSET.
                # Uses unrounded float distance comparison; null coordinates produce NULL which fails the predicate.
                query += "AND haversine_m(?, ?, s.lat, s.lon) IS NOT NULL AND haversine_m(?, ?, s.lat, s.lon) <= ? "
                params.extend([user_lat, user_lon, user_lat, user_lon, max_dist_m])

            query += "ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id LIMIT ? OFFSET ?"
            params.extend([limit + 1, offset])

            rows = connection.execute(query, params).fetchall()
            items = []
            for row in rows[:limit]:
                price = row["price_toman"]
                # This is a precision-risk flag, not a claim of market-price validity.
                quality = "missing" if price is None else (
                    "above_js_safe_integer" if price > 9007199254740991 else "not_assessed")
                dist_m = row["dist_m"]
                direct_distance_meters = round(dist_m) if dist_m is not None else None
                items.append({
                    "offer_id": row["offer_id"], "product_id": row["product_id"],
                    "shop_id": row["shop_id"], "price_toman": str(price) if price is not None else None,
                    "price_quality": quality, "last_price_changed_at": row["last_price_changed_at"],
                    "seller_title": row["seller_title"], "description": row["description"],
                    "warranty": json.loads(row["warranty"]) if row["warranty"] is not None else None,
                    "inventory_status": "unconfirmed",
                    "opening_hours": hours(row["weekly_hours"]).as_dict(),
                    "in_person_credit": credit(row["payment_options"], price, row["product_category_name"]).as_dict(),
                    "direct_distance_meters": direct_distance_meters,
                    "shop": {"name": row["shop_name"], "address": row["address"],
                             "location_label": row["location_label"], "lat": row["lat"], "lon": row["lon"]}})
            return {"items": items, "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "provenance": provenance, "hours_evaluated_at": checked_at.isoformat()}
