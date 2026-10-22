"""Explicit JSON boundary: money is a decimal string; source text is data."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator
from apps.api.hours import HoursReason, HoursStatus
from apps.api.credit import CreditReason, CreditStatus, OptionReason
from apps.api.battery import MAX_CAPACITY_MAH


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


class CapacityReference(Model):
    source_index: int = Field(ge=0)
    section: str | None
    key: str | None
    value: str | None
    parsed_mah: int | None = Field(ge=0, le=MAX_CAPACITY_MAH)


class BatteryCapacity(Model):
    status: Literal['known', 'unknown', 'conflicting', 'not_applicable']
    capacity_mah: int | None = Field(ge=0, le=MAX_CAPACITY_MAH)
    reason: Literal['not_phone', 'conflicting_values', 'unsupported_source_value', 'exact_source_value', 'missing_or_absent_capacity', 'no_capacity_field']
    evidence_count: int = Field(ge=0)
    evidence: list[CapacityReference] = Field(max_length=4)

    @model_validator(mode='after')
    def consistent(self):
        if (self.status == 'known') != (self.capacity_mah is not None):
            raise ValueError('only known source capacity may have a numeric value')
        return self


class BatteryRequirement(Model):
    status: Literal['unspecified', 'awaiting_minimum', 'no_minimum', 'minimum'] = 'unspecified'
    minimum_mah: int | None = Field(default=None, ge=0, le=MAX_CAPACITY_MAH)

    @model_validator(mode='after')
    def consistent(self):
        if (self.status == 'minimum') != (self.minimum_mah is not None):
            raise ValueError('minimum state requires exactly one minimum capacity')
        return self


class NearestOffer(Model):
    offer_id: str
    product_id: str
    shop_id: str
    price_toman: str | None
    last_price_changed_at: str | None
    direct_distance_meters: int = Field(ge=0)
    inventory_status: Literal['unconfirmed'] = 'unconfirmed'


class Product(Model):
    product_id: str
    persian_title: str | None
    brand_name: str | None
    model: str | None
    category_name: str | None
    image_urls: list[str]
    specs: list[Spec]
    offer_summary: OfferSummary
    battery_capacity: BatteryCapacity | None = None
    nearest_offer: NearestOffer | None = None


class ProductPage(Model):
    items: list[Product]
    has_more: bool
    limit: int
    offset: int
    category_name: str | None = None
    min_battery_capacity_mah: int | None = Field(default=None, ge=0, le=MAX_CAPACITY_MAH)
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


class SpecReference(Model):
    source_index: int = Field(ge=0)
    section: str | None
    key: str | None
    value: str | None
    state: Literal['recorded', 'negative', 'unknown']


class TopicExplanation(Model):
    topic: Literal['camera', 'battery']
    status: Literal['recorded', 'missing', 'source_warning', 'conflicting', 'not_assessed']
    summary: str
    evidence_count: int = Field(ge=0)
    evidence: list[SpecReference] = Field(max_length=4)


class BudgetEvidence(Model):
    offer_id: str
    product_id: str
    shop_id: str
    price_toman: str = Field(pattern=r'^[0-9]{1,19}$')
    last_price_changed_at: str | None
    inventory_status: Literal['unconfirmed']
    selection_basis: Literal['lowest_recorded_qualifying_price_then_offer_id']


class ProductExplanation(Model):
    product_id: str
    reasons: list[str]
    budget_offer: BudgetEvidence | None
    topics: list[TopicExplanation] = Field(max_length=2)
    suitability: Literal['not_verified']
    battery_capacity: BatteryCapacity | None = None


class SearchExplanation(Model):
    query: str
    category_name: str | None
    max_price_toman: str | None
    ranking_basis: Literal['lexical_match_then_product_id']
    topics: list[Literal['camera', 'battery']] = Field(max_length=2)
    summary: str
    limitations: list[str]
    products: list[ProductExplanation] = Field(max_length=12)
    provenance: Provenance
    min_battery_capacity_mah: int | None = Field(default=None, ge=0, le=MAX_CAPACITY_MAH)


class AssistantResult(Model):
    request_id: str
    status: Literal['needs_input', 'results', 'no_evidence']
    query: str | None
    category_name: str | None = None
    max_price_toman: str | None
    question: str | None
    products: ProductPage | None
    model: str
    explanation: SearchExplanation | None = None
    battery_requirement: BatteryRequirement = Field(default_factory=BatteryRequirement)
    offer_sort: Literal['price', 'nearest'] = 'price'


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
