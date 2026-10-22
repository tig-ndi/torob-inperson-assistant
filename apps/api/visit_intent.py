"""Bounded visit preferences; never infer a user's coordinates from model text."""

import re

from tools.prepare_data import normalize_text


def wants_nearest(text: str) -> bool:
    text = normalize_text(text)
    return bool(re.search(
        r'نزدیک\s*ترین|نزدیکترین|نزدیک\s*تر(?:ین)?\s+(?:فروشگاه|مغازه)|'
        r'نزدیک.{0,35}(?:محل|مکان|موقعیت|خودم|من)|'
        r'(?:محل|مکان|موقعیت).{0,35}نزدیک', text))


def uncertain_nearest(text: str) -> bool:
    text = normalize_text(text)
    return bool(re.search(r'نزدیک\s*ترین.{0,25}(?:نباش|نمی\s*خوا|نمیخوا)', text))


def is_constraint_followup(text: str) -> bool:
    """Recognize bounded refinements, not a general topic/negation classifier."""
    text = normalize_text(text)
    return bool(re.match(
        r'^(?:(?:لطفا|لطفاً|فقط|هم|و|من|به|از|در)\s+)*'
        r'(?:رنگ|سایز|اندازه|جنس|حافظه|رم|وزن|توان|گارانتی|قسطی|'
        r'نزدیک|نزدیکترین|مکان|محل|موقعیت)(?:\s|$)|'
        r'^(?:فروشگاه|فروشنده|مغازه)\s+(?:نزدیک|اطراف)(?:\s|$)', text))


def has_unsupported_modifier(text: str) -> bool:
    # These source fields need their own semantics/coverage evaluation. Detecting
    # a request for them does not implement a filter or prove a matching variant.
    return bool(re.search(r'(?<!\w)(?:رنگ|سایز|اندازه|جنس|حافظه|رم|وزن|توان|گارانتی|قسطی)(?!\w)', normalize_text(text)))
