"""Explicit JSON boundary: money is a decimal string; source text is data."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class Model(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Provenance(Model):
    snapshot_id: str
    dataset: str
    generated_at_utc: str
    currency: Literal["toman"]
    inventory_status: Literal["unconfirmed"]


class Spec(Model):
    key: str | None = None
    section: str | None = None
    value: str | None = None


class OfferSummary(Model):
    offer_count: int
    min_price_toman: str | None
    max_price_toman: str | None
    missing_price_count: int


class Product(Model):
    product_id: str
    persian_title: str | None
    brand_name: str | None
    model: str | None
    category_name: str | None
    image_urls: list[str]
    specs: list[Spec]
    offer_summary: OfferSummary


class ProductPage(Model):
    items: list[Product]
    has_more: bool
    limit: int
    offset: int
    provenance: Provenance


class ProductDetail(Model):
    product: Product
    provenance: Provenance


class Shop(Model):
    name: str | None
    address: str | None
    location_label: str | None
    lat: float | None = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(ge=-180, le=180, allow_inf_nan=False)


class Offer(Model):
    offer_id: str
    product_id: str
    shop_id: str
    price_toman: str | None
    price_quality: Literal["missing", "above_js_safe_integer", "not_assessed"]
    last_price_changed_at: str | None
    seller_title: str | None
    description: str | None
    warranty: JsonValue
    inventory_status: Literal["unconfirmed"]
    shop: Shop


class OfferPage(Model):
    items: list[Offer]
    has_more: bool
    limit: int
    offset: int
    provenance: Provenance
