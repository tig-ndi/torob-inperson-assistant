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
from apps.api.battery import assess_capacity


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


class FollowupSelectionError(Exception):
    """The selected product/offer/shop triple is absent or inconsistent."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


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

    def category_names(self) -> tuple[str, ...]:
        with self.connect() as connection:
            return tuple(row[0] for row in connection.execute(
                "SELECT DISTINCT category_name FROM products WHERE category_name IS NOT NULL ORDER BY category_name"))

    def identity_words(self) -> frozenset[str]:
        """Normalized brand/model words from the snapshot.

        Used only to recognize a literal product identity span; it is never a
        whitelist that removes words from a user's query.
        """
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT brand_name AS value FROM products WHERE brand_name IS NOT NULL "
                "UNION SELECT model FROM products WHERE model IS NOT NULL")
            return frozenset(
                word for row in rows
                for word in re.findall(r"[^\W_]+", normalize_text(row[0]), flags=re.UNICODE))

    @staticmethod
    def product(connection: sqlite3.Connection, row: sqlite3.Row, capacity=None) -> dict:
        summary = connection.execute(
            "SELECT count(*),min(price_toman),max(price_toman),sum(price_toman IS NULL) "
            "FROM offers WHERE product_id=?", (row["product_id"],)).fetchone()
        specs = decode_list(row['specs'])
        capacity = capacity if capacity is not None else assess_capacity(row['category_name'], specs)
        return {"product_id": row["product_id"], "persian_title": row["persian_title"],
                "brand_name": row["brand_name"], "model": row["model"],
                "category_name": row["category_name"],
                "image_urls": decode_list(row["image_urls"]), "specs": specs, 'battery_capacity': capacity.as_dict(),
                'nearest_offer': None,
                "offer_summary": {"offer_count": summary[0],
                                  "min_price_toman": str(summary[1]) if summary[1] is not None else None,
                                  "max_price_toman": str(summary[2]) if summary[2] is not None else None,
                                  "missing_price_count": summary[3] or 0}}

    def search(self, query: str, limit: int, offset: int, max_price: int | None,
               category_name: str | None = None, min_battery_capacity_mah: int | None = None,
               *, user_lat: float | None = None, user_lon: float | None = None,
               sort_by: str = 'relevance') -> dict:
        if sort_by not in {'relevance', 'nearest'} or (sort_by == 'nearest' and (user_lat is None or user_lon is None)):
            raise InvalidQuery('nearest ordering requires coordinates')
        expression = search_expression(query)
        with self.connect() as connection:
            provenance = self.provenance(connection)
            @lru_cache(maxsize=1024)
            def capacity(category, raw):
                return assess_capacity(category, decode_list(raw))
            connection.create_function('battery_capacity_mah', 2, lambda category, raw: capacity(category, raw).capacity_mah, deterministic=True)
            battery_clause = 'AND p.category_name=? AND battery_capacity_mah(p.category_name,p.specs)>=? ' if min_battery_capacity_mah is not None else ''
            nearest_select = ''
            params = []
            if sort_by == 'nearest':
                nearest_select = (', (SELECT min(haversine_m(?,?,s.lat,s.lon)) FROM offers o '
                                  'JOIN shops s ON s.shop_id=o.shop_id WHERE o.product_id=p.product_id '
                                  'AND (? IS NULL OR o.price_toman<=?)) AS nearest_distance')
                params.extend([user_lat, user_lon, max_price, max_price])
            params.extend([expression, category_name, category_name, max_price, max_price])
            if min_battery_capacity_mah is not None:
                params.extend(['گوشی موبایل', min_battery_capacity_mah])
            params.extend([limit + 1, offset])
            nearest_clause = 'AND nearest_distance IS NOT NULL ' if sort_by == 'nearest' else ''
            ordering = 'nearest_distance,p.product_id' if sort_by == 'nearest' else 'product_search.rank,p.product_id'
            rows = connection.execute(
                "SELECT p.* " + nearest_select + " FROM product_search JOIN products p "
                "ON p.product_id=product_search.product_id WHERE product_search MATCH ? "
                "AND (? IS NULL OR p.category_name = ?) "
                "AND (? IS NULL OR EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id "
                "AND o.price_toman<=?)) " + battery_clause + nearest_clause + "ORDER BY " + ordering + " LIMIT ? OFFSET ?",
                params).fetchall()
            items = [self.product(connection, row, capacity(row['category_name'], row['specs'])) for row in rows[:limit]]
            if sort_by == 'nearest':
                for item in items:
                    offers = self.offers(item['product_id'], 1, 0, max_price, user_lat, user_lon, sort_by='nearest')
                    if offers is None or not offers['items']:
                        raise CatalogueUnavailable()
                    witness = offers['items'][0]
                    item['nearest_offer'] = {key: witness[key] for key in (
                        'offer_id', 'product_id', 'shop_id', 'price_toman',
                        'last_price_changed_at', 'direct_distance_meters', 'inventory_status')}
            return {"items": items,
                    "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "category_name": category_name,
                    'min_battery_capacity_mah': min_battery_capacity_mah,
                    "provenance": provenance}

    def matches_identity(self, query: str, category_name: str) -> bool:
        """Recognize a literal brand/model refinement of the active category.

        Existence is independent of price: an unaffordable refinement must remain
        empty in its category, not silently widen to cheaper accessories.
        """
        search_expression(query)
        terms = set(re.findall(r'[^\W_]+', normalize_text(query)))
        with self.connect() as connection:
            rows = connection.execute(
                'SELECT DISTINCT brand_name,model FROM products WHERE category_name=? '
                'AND (brand_name IS NOT NULL OR model IS NOT NULL)', (category_name,))
            return any(terms <= set(re.findall(r'[^\W_]+', normalize_text(
                ' '.join(part for part in row if part)))) for row in rows)

    def detail(self, product_id: str) -> dict | None:
        with self.connect() as connection:
            provenance = self.provenance(connection)
            row = connection.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
            if row is None:
                return None
            return {"product": self.product(connection, row),
                    "provenance": provenance}

    @staticmethod
    def offer_item(row: sqlite3.Row, hours, credit) -> dict:
        price = row["price_toman"]
        # This is a precision-risk flag, not a claim of market-price validity.
        quality = "missing" if price is None else (
            "above_js_safe_integer" if price > 9007199254740991 else "not_assessed")
        dist_m = row["dist_m"]
        direct_distance_meters = round(dist_m) if dist_m is not None else None
        return {
            "offer_id": row["offer_id"], "product_id": row["product_id"],
            "shop_id": row["shop_id"], "price_toman": str(price) if price is not None else None,
            "price_quality": quality, "last_price_changed_at": row["last_price_changed_at"],
            "seller_title": row["seller_title"], "description": row["description"],
            "warranty": json.loads(row["warranty"]) if row["warranty"] is not None else None,
            "inventory_status": "unconfirmed",
            "opening_hours": hours.as_dict(),
            "in_person_credit": credit.as_dict(),
            "direct_distance_meters": direct_distance_meters,
            "shop": {"name": row["shop_name"], "address": row["address"],
                     "location_label": row["location_label"], "lat": row["lat"], "lon": row["lon"]}}

    def followup_selection(self, product_id: str, offer_id: str, shop_id: str,
                           user_lat: float | None = None, user_lon: float | None = None,
                           evaluated_at: datetime | None = None) -> dict:
        """Validate one source offer triple and return its historical evidence."""
        if (user_lat is None) != (user_lon is None):
            raise InvalidQuery('coordinates must be supplied together')
        checked_at = tehran_time(evaluated_at if evaluated_at is not None else datetime.now(timezone.utc))
        with self.connect() as connection:
            connection.create_function("haversine_m", 4, safe_haversine_m, deterministic=True)
            provenance = self.provenance(connection)
            product = connection.execute(
                "SELECT product_id,persian_title,brand_name,model,category_name "
                "FROM products WHERE product_id=?", (product_id,)).fetchone()
            if product is None:
                raise FollowupSelectionError('product_not_found')
            query = ("SELECT o.*,s.shop_id AS resolved_shop_id,s.name AS shop_name,s.address,"
                     "s.location_label,s.lat,s.lon,s.weekly_hours,s.payment_options,"
                     "p.category_name AS product_category_name")
            params: list = []
            if user_lat is not None:
                query += ",haversine_m(?, ?, s.lat, s.lon) AS dist_m"
                params.extend([user_lat, user_lon])
            else:
                query += ",NULL AS dist_m"
            query += (" FROM offers o LEFT JOIN shops s ON s.shop_id=o.shop_id "
                      "JOIN products p ON p.product_id=o.product_id "
                      "WHERE o.offer_id=? AND o.product_id=?")
            params.extend([offer_id, product_id])
            row = connection.execute(query, params).fetchone()
            if row is None:
                raise FollowupSelectionError('offer_not_found')
            if row["shop_id"] != shop_id:
                raise FollowupSelectionError('offer_shop_mismatch')
            if row["resolved_shop_id"] is None:
                raise CatalogueUnavailable('offer references a missing shop')
            shop_offer_count = connection.execute(
                "SELECT count(*) FROM offers WHERE product_id=? AND shop_id=?",
                (product_id, shop_id)).fetchone()[0]
            offer = self.offer_item(
                row, evaluate_hours(row["weekly_hours"], checked_at),
                evaluate_credit(row["payment_options"], row["price_toman"],
                                row["product_category_name"]))
            return {"product": {key: product[key] for key in (
                        'product_id', 'persian_title', 'brand_name', 'model', 'category_name')},
                    "offer": offer, "shop_offer_count": shop_offer_count,
                    "provenance": provenance, "hours_evaluated_at": checked_at.isoformat()}

    def offers(self, product_id: str, limit: int, offset: int, max_price: int | None,
               user_lat: float | None = None, user_lon: float | None = None,
               max_distance_km: float | None = None, open_now_only: bool = False,
               evaluated_at: datetime | None = None, in_person_credit_only: bool = False,
               *, sort_by: str = 'price', exclude_shop_id: str | None = None) -> dict | None:
        if sort_by not in {'price', 'nearest'} or (sort_by == 'nearest' and (user_lat is None or user_lon is None)):
            raise InvalidQuery('nearest ordering requires coordinates')
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
                "AND (? IS NULL OR o.shop_id<>?) "
            )
            params.extend([product_id, max_price, max_price, exclude_shop_id, exclude_shop_id])

            if open_now_only:
                query += "AND declared_open_now(s.weekly_hours)=1 "

            if in_person_credit_only:
                query += "AND matches_in_person_credit(s.payment_options,o.price_toman,p.category_name)=1 "

            if max_dist_m is not None:
                # Radius condition is applied BEFORE LIMIT / OFFSET.
                # Uses unrounded float distance comparison; null coordinates produce NULL which fails the predicate.
                query += "AND haversine_m(?, ?, s.lat, s.lon) IS NOT NULL AND haversine_m(?, ?, s.lat, s.lon) <= ? "
                params.extend([user_lat, user_lon, user_lat, user_lon, max_dist_m])

            if sort_by == 'nearest':
                # Unknown positions cannot win; sort full precision before pagination.
                query += 'AND dist_m IS NOT NULL ORDER BY dist_m,o.price_toman IS NULL,o.price_toman,o.offer_id LIMIT ? OFFSET ?'
            else:
                query += "ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id LIMIT ? OFFSET ?"
            params.extend([limit + 1, offset])

            rows = connection.execute(query, params).fetchall()
            items = [self.offer_item(
                row, hours(row["weekly_hours"]),
                credit(row["payment_options"], row["price_toman"], row["product_category_name"]))
                for row in rows[:limit]]
            return {"items": items, "has_more": len(rows) > limit, "limit": limit, "offset": offset,
                    "provenance": provenance, "hours_evaluated_at": checked_at.isoformat()}
