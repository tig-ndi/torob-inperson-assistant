"""Validate the supplied CSV export and build a local, indexed SQLite snapshot.

Python standard library only. Never modifies source CSVs or contacts a seller.
The output database is a historical catalogue, not a live inventory service.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import unicodedata


SCHEMAS = {
    "shops": {
        "address": "TEXT", "category_names": "TEXT", "contacts": "TEXT",
        "instagram": "TEXT", "lat": "REAL", "location_label": "TEXT",
        "lon": "REAL", "name": "TEXT", "payment_options": "TEXT",
        "shop_id": "TEXT", "supports_fast_delivery": "INTEGER",
        "website_url": "TEXT", "weekly_hours": "TEXT",
    },
    "products": {
        "brand_name": "TEXT", "category_name": "TEXT", "image_urls": "TEXT",
        "model": "TEXT", "persian_title": "TEXT", "product_id": "TEXT",
        "specs": "TEXT",
    },
    "offers": {
        "description": "TEXT", "last_price_changed_at": "TEXT",
        "offer_id": "TEXT", "price_toman": "INTEGER", "product_id": "TEXT",
        "seller_title": "TEXT", "shop_id": "TEXT", "warranty": "TEXT",
    },
}
JSON_TYPES = {
    "category_names": list, "contacts": list, "payment_options": list,
    "weekly_hours": dict, "image_urls": list, "specs": list,
    "warranty": (dict, list, str),
}
PRIMARY_KEYS = {"shops": "shop_id", "products": "product_id", "offers": "offer_id"}
TRANSLATION = str.maketrans("يك٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "یک01234567890123456789")


def normalize_text(text: str) -> str:
    """Normalize search text, preserving stored source titles and identifiers."""
    text = unicodedata.normalize("NFKC", text).translate(TRANSLATION)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.replace("\u200c", " ").replace("ـ", "").casefold().split())


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def decode_cell(column: str, value: str) -> object:
    if value == "null":
        return None
    if column in JSON_TYPES:
        decoded = json.loads(value)
        if decoded is None:
            return None
        if not isinstance(decoded, JSON_TYPES[column]):
            raise ValueError(f"unexpected JSON type in {column}")
        return value  # Preserve source JSON; never flatten a claim into a boolean.
    if column in ("lat", "lon"):
        number = float(value)
        bound = 90 if column == "lat" else 180
        if not math.isfinite(number) or not -bound <= number <= bound:
            raise ValueError(f"invalid {column}")
        return number
    if column == "price_toman":
        if not re.fullmatch(r"[0-9]+", value):
            raise ValueError("price_toman must be a nonnegative integer")
        number = int(value)
        if number > 2**63 - 1:
            raise ValueError("price_toman exceeds SQLite integer range")
        return number
    if column == "supports_fast_delivery":
        if value not in ("true", "false"):
            raise ValueError("invalid supports_fast_delivery boolean")
        return int(value == "true")
    if column == "last_price_changed_at":
        date = datetime.fromisoformat(value)
        if date.tzinfo is None:
            raise ValueError("price timestamp must include timezone")
    return value  # Empty text is not automatically the same as literal null.


def import_table(connection: sqlite3.Connection, source: Path, table: str) -> dict:
    schema = SCHEMAS[table]
    nulls: Counter = Counter()
    blanks: Counter = Counter()
    empty_json: Counter = Counter()
    json_keys: dict[str, Counter] = {key: Counter() for key in schema if key in JSON_TYPES}
    count = 0
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames != list(schema):
            raise ValueError(f"{table}: header differs from the v16 contract")
        columns = ",".join(f'"{column}"' for column in schema)
        statement = f'INSERT INTO "{table}" ({columns}) VALUES ({",".join("?" for _ in schema)})'
        for count, raw in enumerate(reader, start=1):
            try:
                if None in raw or any(value is None for value in raw.values()):
                    raise ValueError("malformed CSV column count")
                row = {column: decode_cell(column, value) for column, value in raw.items()}
                required = [PRIMARY_KEYS[table]]
                if table == "offers":
                    required += ["product_id", "shop_id"]
                if any(not row[column] for column in required):
                    raise ValueError("missing required identifier")
                connection.execute(statement, tuple(row.values()))
                if table == "products":
                    text = " ".join(str(row[key] or "") for key in
                                    ("persian_title", "brand_name", "model", "category_name"))
                    connection.execute("INSERT INTO product_search VALUES (?, ?)",
                                       (row["product_id"], normalize_text(text)))
                for column, value in row.items():
                    if value is None:
                        nulls[column] += 1
                    elif value == "":
                        blanks[column] += 1
                    elif column in JSON_TYPES:
                        parsed = json.loads(str(value))
                        if parsed in ([], {}):
                            empty_json[column] += 1
                        objects = parsed if isinstance(parsed, list) else [parsed]
                        for item in objects:
                            if isinstance(item, dict):
                                json_keys[column].update(item.keys())
            except (ValueError, TypeError, OverflowError, sqlite3.Error) as exc:
                # Do not echo rows, contacts or seller-controlled descriptions.
                raise ValueError(f"{table}: record {count}, CSV line {reader.line_num}: {exc}") from exc
    return {"rows": count, "nulls": dict(nulls), "empty_strings": dict(blanks),
            "empty_json": dict(empty_json),
            "json_object_keys": {key: dict(value) for key, value in json_keys.items()}}


def prepare(source_dir: Path, database: Path, report_path: Path) -> dict:
    source_dir, database, report_path = (path.resolve() for path in (source_dir, database, report_path))
    for output in (database, report_path):
        if output.is_relative_to(source_dir):
            raise ValueError("outputs must be outside the source dataset directory")
    if database == report_path:
        raise ValueError("database and report must be different files")
    if database.exists() or report_path.exists():
        raise FileExistsError("output already exists; choose new paths to preserve the previous snapshot")
    csv.field_size_limit(16 * 1024 * 1024)
    inputs = {table: source_dir / f"{table}.csv" for table in SCHEMAS}
    fingerprints = {table: {"sha256": sha256(path), "bytes": path.stat().st_size}
                    for table, path in inputs.items()}
    database.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    handle, staging_name = tempfile.mkstemp(prefix="catalogue-", suffix=".sqlite3", dir=database.parent)
    os.close(handle)
    staging = Path(staging_name)
    connection = sqlite3.connect(staging)
    report = {"schema_version": 1, "dataset": "starcoach-v16-cap300-csv",
              "generated_at_utc": datetime.now(timezone.utc).isoformat(),
              "sqlite_version": sqlite3.sqlite_version, "sources": fingerprints,
              "tables": {}, "semantics": {"currency": "toman", "inventory_confirmed": False,
              "contacts": "synthetic per user-supplied organizer text; never dial",
              "coverage": "selective Tehran sample; max 300 distinct products per shop"}}
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        for table, schema in SCHEMAS.items():
            definitions = [f'"{column}" {kind}' +
                           (" PRIMARY KEY NOT NULL" if column == PRIMARY_KEYS[table] else "")
                           for column, kind in schema.items()]
            if table == "offers":
                definitions += ["FOREIGN KEY (product_id) REFERENCES products(product_id)",
                                "FOREIGN KEY (shop_id) REFERENCES shops(shop_id)"]
            connection.execute(f'CREATE TABLE "{table}" ({",".join(definitions)})')
        connection.execute("CREATE VIRTUAL TABLE product_search USING fts5(product_id UNINDEXED, text)")
        with connection:
            for table, path in inputs.items():
                report["tables"][table] = import_table(connection, path, table)
            connection.execute("CREATE INDEX offers_product_price ON offers(product_id, price_toman)")
            connection.execute("CREATE INDEX offers_shop ON offers(shop_id)")
            connection.execute("CREATE INDEX shops_coordinates ON shops(lat, lon)")
            connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            query = connection.execute
            report["relations"] = {
                "foreign_key_errors": len(query("PRAGMA foreign_key_check").fetchall()),
                "shops_without_offers": query("SELECT count(*) FROM shops s WHERE NOT EXISTS (SELECT 1 FROM offers o WHERE o.shop_id=s.shop_id)").fetchone()[0],
                "products_without_offers": query("SELECT count(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM offers o WHERE o.product_id=p.product_id)").fetchone()[0],
                "max_distinct_products_per_shop": query("SELECT coalesce(max(n),0) FROM (SELECT count(DISTINCT product_id) n FROM offers GROUP BY shop_id)").fetchone()[0],
                "repeated_shop_product_pairs": query("SELECT count(*) FROM (SELECT 1 FROM offers GROUP BY shop_id,product_id HAVING count(*)>1)").fetchone()[0],
            }
            report["prices"] = dict(zip(("min_toman", "max_toman", "zero_count"),
                query("SELECT min(price_toman),max(price_toman),coalesce(sum(price_toman=0),0) FROM offers").fetchone()))
            report["prices"]["above_javascript_safe_integer"] = query("SELECT count(*) FROM offers WHERE price_toman > 9007199254740991").fetchone()[0]
            report["price_timestamp_range"] = [
                query(f"SELECT last_price_changed_at FROM offers WHERE last_price_changed_at IS NOT NULL ORDER BY julianday(last_price_changed_at) {direction} LIMIT 1").fetchone()
                for direction in ("ASC", "DESC")
            ]
            report["price_timestamp_range"] = [row[0] if row else None for row in report["price_timestamp_range"]]
            report["coordinates_missing_or_partial"] = query("SELECT count(*) FROM shops WHERE lat IS NULL OR lon IS NULL").fetchone()[0]
            report["integrity_check"] = query("PRAGMA integrity_check").fetchone()[0]
            report["fts_rows"] = query("SELECT count(*) FROM product_search").fetchone()[0]
            if report["relations"]["max_distinct_products_per_shop"] > 300:
                raise ValueError("source exceeds the declared 300-product cap; review dataset version")
            if report["integrity_check"] != "ok":
                raise ValueError("SQLite integrity check failed")
            for table, path in inputs.items():
                if sha256(path) != fingerprints[table]["sha256"]:
                    raise ValueError("source changed during preparation")
            connection.execute("INSERT INTO metadata VALUES ('profile',?)", (json.dumps(report, ensure_ascii=False),))
        connection.close()
        # Publish only a completely validated database. Never touch source files.
        os.replace(staging, database)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return report
    finally:
        connection.close()
        if staging.exists():
            staging.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="directory containing the three source CSVs")
    parser.add_argument("--database", type=Path, default=Path(".local/catalogue.sqlite3"))
    parser.add_argument("--report", type=Path, default=Path(".local/data-profile.json"))
    args = parser.parse_args()
    try:
        report = prepare(args.source, args.database, args.report)
    except (OSError, ValueError, sqlite3.Error, csv.Error) as exc:
        parser.exit(1, f"Dataset preparation failed: {exc}\n")
    print(json.dumps({"rows": {table: stats["rows"] for table, stats in report["tables"].items()},
                      "integrity_check": report["integrity_check"],
                      "database": str(args.database), "report": str(args.report)}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
