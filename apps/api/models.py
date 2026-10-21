"""Explicit JSON boundary: money is a decimal string; source text is data."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue
from apps.api.hours import HoursReason, HoursStatus
from apps.api.credit import CreditReason, CreditStatus, OptionReason


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


class AssistantStatus(Model):
    ready: bool
    reason: Literal['ready', 'disabled', 'missing_key', 'invalid_config', 'attempt_limit']
    model: str
    remaining_calls: int
    attempt_limit: int


class AssistantResult(Model):
    request_id: str
    status: Literal['needs_input', 'results', 'no_evidence']
    query: str | None
    max_price_toman: str | None
    question: str | None
    products: ProductPage | None
    model: str


class Shop(Model):
    name: str | None
    address: str | None
    location_label: str | None
    lat: float | None = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(ge=-180, le=180, allow_inf_nan=False)


class Shift(Model):
    start_time: str
    end_time: str
    ends_next_day: bool


class OpeningHours(Model):
    status: HoursStatus
    reason: HoursReason
    local_day: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    today_shifts: list[Shift]
    previous_day_overnight_shifts: list[Shift]


class CreditOption(Model):
    option_index: int
    provider_name: str | None
    channel: str | None
    min_price_toman: str | None
    max_price_toman: str | None
    category_names: list[str] | None
    status: CreditStatus
    reason: OptionReason


class InPersonCredit(Model):
    status: CreditStatus
    reason: CreditReason
    options: list[CreditOption]


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
    direct_distance_meters: int | None = None
    opening_hours: OpeningHours
    in_person_credit: InPersonCredit
    shop: Shop


class OfferPage(Model):
    items: list[Offer]
    has_more: bool
    limit: int
    offset: int
    provenance: Provenance
    hours_evaluated_at: str
