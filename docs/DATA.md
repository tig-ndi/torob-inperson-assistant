# Catalogue data format

The app reads a locally prepared SQLite catalogue. Supply your own compatible CSV export; raw records and generated databases are not bundled in the repository. Only use data you are permitted to process.

## Input files

Place these three UTF-8 CSV files in one directory. Headers must match the importer schema exactly, including column order as listed below. JSON arrays and objects are encoded inside CSV cells. The literal `null` means missing data.

- **`shops.csv`:** `address`, `category_names`, `contacts`, `instagram`, `lat`, `location_label`, `lon`, `name`, `payment_options`, `shop_id`, `supports_fast_delivery`, `website_url`, `weekly_hours`.
- **`products.csv`:** `brand_name`, `category_name`, `image_urls`, `model`, `persian_title`, `product_id`, `specs`.
- **`offers.csv`:** `description`, `last_price_changed_at`, `offer_id`, `price_toman`, `product_id`, `seller_title`, `shop_id`, `warranty`.

`offers.product_id` and `offers.shop_id` reference their corresponding tables. Keep IDs unique within each table and preserve distinct offers from the same shop. Prices are integer **toman** values; timestamps include a timezone. The importer currently validates a maximum of 300 distinct products per shop.

## Structured fields

- `category_names` and `image_urls` are JSON arrays. `specs` contains objects with `section`, `key` and `value`.
- `weekly_hours` is keyed by `mon` through `sun`. Each day has `status` and `shifts`; each shift has `start_time` and `end_time`.
- `payment_options` contains `provider_name`, `channel`, `min_price_toman`, `max_price_toman` and `category_names`.
- `contacts`, when supplied, contains `channel` and `display_number`. The current app treats contact flows as simulations and does not dial these values.
- `warranty`, when supplied, contains `description`, `period_months` and `provider`.

The executable validation contract is [`tools/prepare_data.py`](../tools/prepare_data.py); minimal synthetic examples are in [`tests/test_prepare_data.py`](../tests/test_prepare_data.py).

## Import

Run from the repository root after installing dependencies:

```cmd
.venv\Scripts\python.exe -X utf8 -m tools.prepare_data --source "C:\path\to\catalogue-csv"
```

Outputs are `.local/catalogue.sqlite3` and `.local/data-profile.json`. Preparation checks schema, types, JSON, identifiers, foreign keys, checksums and SQLite integrity, then builds the Persian FTS5 search index. Source files are not modified.

Existing outputs are never overwritten. To validate an updated export separately:

```cmd
.venv\Scripts\python.exe -X utf8 -m tools.prepare_data --source "C:\path\to\catalogue-csv" --database .local/catalogue-v2.sqlite3 --report .local/data-profile-v2.json
```

`run-local.ps1` uses the default `.local/catalogue.sqlite3` path. Keep an existing working snapshot until you have checked its replacement. For a custom snapshot, launch uvicorn directly with `TOROB_DATABASE` set to its absolute path.

## Interpretation

Offers are historical evidence, not verified live inventory. Unknown opening hours are not treated as closed. Shop categories alone do not prove product availability. Payment-provider names alone do not establish eligibility for in-person credit. Routes and arrival estimates do not include live traffic.

Return to [English README](../README.md) · [راهنمای فارسی](../README.fa.md).
