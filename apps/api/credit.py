"""Match recorded in-person credit terms, never approve a person or a payment."""

from dataclasses import dataclass
import json
from typing import Literal

from tools.prepare_data import normalize_text


CreditStatus = Literal["matches_declared_terms", "does_not_match", "unknown"]
CreditReason = Literal["matching_option", "all_recorded_options_mismatch", "incomplete_conditions",
                       "not_recorded", "invalid_data"]
OptionReason = Literal["matched", "channel_unknown", "unsupported_channel", "price_unknown",
                       "product_category_unknown", "category_mismatch", "below_minimum",
                       "above_maximum", "invalid_conditions"]
KEYS = {"provider_name", "channel", "min_price_toman", "max_price_toman", "category_names"}


def valid_money(value: object) -> bool:
    return value is None or (type(value) is int and value >= 0)


@dataclass(frozen=True)
class CreditOption:
    option_index: int
    provider_name: str | None
    channel: str | None
    min_price_toman: int | None
    max_price_toman: int | None
    category_names: tuple[str, ...] | None
    status: CreditStatus
    reason: OptionReason

    def as_dict(self) -> dict:
        return {"option_index": self.option_index, "provider_name": self.provider_name,
                "channel": self.channel,
                "min_price_toman": str(self.min_price_toman) if self.min_price_toman is not None else None,
                "max_price_toman": str(self.max_price_toman) if self.max_price_toman is not None else None,
                "category_names": list(self.category_names) if self.category_names is not None else None,
                "status": self.status, "reason": self.reason}


@dataclass(frozen=True)
class Credit:
    status: CreditStatus
    reason: CreditReason
    options: tuple[CreditOption, ...]

    def as_dict(self) -> dict:
        return {"status": self.status, "reason": self.reason,
                "options": [option.as_dict() for option in self.options]}


def evaluate_option(raw: object, index: int, price: int | None, category: str | None) -> CreditOption:
    item = raw if isinstance(raw, dict) else {}
    provider, channel = item.get("provider_name"), item.get("channel")
    minimum, maximum = item.get("min_price_toman"), item.get("max_price_toman")
    categories = item.get("category_names")
    valid_categories = isinstance(categories, list) and all(isinstance(c, str) and c.strip() for c in categories)
    # Parse every declared constraint before evaluating channel, price or category.
    valid = (KEYS <= item.keys() and isinstance(provider, str) and bool(provider.strip())
             and isinstance(channel, str) and bool(channel.strip()) and valid_money(minimum)
             and valid_money(maximum) and valid_categories)
    if valid and minimum is not None and maximum is not None and minimum > maximum:
        valid = False
    status: CreditStatus = "unknown"
    reason: OptionReason = "invalid_conditions"
    if valid:
        if channel == "unknown":
            reason = "channel_unknown"
        elif channel != "in_person":
            reason = "unsupported_channel"
        elif price is None:
            reason = "price_unknown"
        elif categories and (category is None or not category.strip()):
            reason = "product_category_unknown"
        elif categories and normalize_text(category) not in {normalize_text(c) for c in categories}:
            status, reason = "does_not_match", "category_mismatch"
        elif minimum is not None and price < minimum:
            status, reason = "does_not_match", "below_minimum"
        elif maximum is not None and price > maximum:
            status, reason = "does_not_match", "above_maximum"
        else:
            # None bounds / [] categories mean no constraint recorded in this field,
            # not zero, unlimited real credit, or proof that every category is accepted.
            status, reason = "matches_declared_terms", "matched"
    return CreditOption(index, provider if isinstance(provider, str) else None,
                        channel if isinstance(channel, str) else None,
                        minimum if valid_money(minimum) else None,
                        maximum if valid_money(maximum) else None,
                        tuple(categories) if valid_categories else None, status, reason)


def evaluate_credit(raw: str | None, price: int | None, category: str | None) -> Credit:
    if not valid_money(price) or (category is not None and not isinstance(category, str)):
        raise ValueError("credit evaluation requires an integer price and text category, or null")
    try:
        parsed = json.loads(raw) if raw is not None else None
    except (ValueError, TypeError):
        return Credit("unknown", "invalid_data", ())
    if parsed is None or parsed == []:
        return Credit("unknown", "not_recorded", ())
    if not isinstance(parsed, list):
        return Credit("unknown", "invalid_data", ())
    options = tuple(evaluate_option(item, index, price, category) for index, item in enumerate(parsed))
    if any(option.status == "matches_declared_terms" for option in options):
        return Credit("matches_declared_terms", "matching_option", options)
    if any(option.status == "unknown" for option in options):
        return Credit("unknown", "incomplete_conditions", options)
    return Credit("does_not_match", "all_recorded_options_mismatch", options)
