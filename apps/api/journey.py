"""Local arrival checks against declared schedules. No external routing requests."""
from datetime import datetime, timedelta
from math import ceil
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from apps.api.catalogue import Catalogue, FollowupSelectionError
from apps.api.hours import TEHRAN, evaluate_hours
from apps.api.models import FollowupSelection
from apps.api.routing import cached_route
from apps.api.visit_time import CalendarDate, selected_instant


class ArrivalRequest(BaseModel):
    visit_date: CalendarDate | None = None
    model_config = ConfigDict(extra='forbid')
    selections: list[FollowupSelection] = Field(min_length=1, max_length=30)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    local_time: str | None = Field(default=None, pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    mode: Literal['walking', 'driving', 'cycling', 'manual'] = 'walking'
    use_road_route: bool = False
    manual_minutes: int | None = Field(default=None, strict=True, ge=1, le=360)
    manual_offer_id: str | None = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def paired(self):
        if (self.lat is None) != (self.lon is None):
            raise ValueError('paired location required')
        if self.manual_minutes is not None and (self.mode != 'manual' or self.manual_offer_id not in {s.offer_id for s in self.selections}):
            raise ValueError('manual duration belongs to one selected offer')
        return self


def journey_router(catalogue: Catalogue):
    router = APIRouter()

    @router.post('/arrival-checks')
    def arrival_checks(body: ArrivalRequest):
        departure = selected_instant(datetime.now(TEHRAN), body.local_time, body.visit_date)
        items = []
        for selected in body.selections:
            try:
                source = catalogue.followup_selection(selected.product_id, selected.offer_id, selected.shop_id, body.lat, body.lon, departure)
            except FollowupSelectionError as exc:
                raise HTTPException(404, 'پیشنهاد انتخاب‌شده در منبع پیدا نشد.') from exc
            distance = source['offer']['direct_distance_meters']
            low = high = None
            basis = 'unknown'
            if body.mode == 'manual' and body.manual_offer_id == selected.offer_id and body.manual_minutes is not None:
                low = high = body.manual_minutes
                basis = 'user_duration'
            elif body.use_road_route and (road := cached_route(body.lat, body.lon, source['offer']['shop']['lat'], source['offer']['shop']['lon'], body.mode)):
                low = high = max(1, ceil(road['duration_seconds'] / 60))
                basis = 'street_route'
            elif body.mode == 'walking' and distance is not None and not body.use_road_route:
                # A transparent range, not a street route or a guarantee of access.
                low, high = max(1, ceil(distance * 1.25 / 80)), max(1, ceil(distance * 1.7 / 65))
                basis = 'rough_walking_range'
            with catalogue.connect() as db:
                raw = db.execute('SELECT weekly_hours FROM shops WHERE shop_id=?', (selected.shop_id,)).fetchone()['weekly_hours']
            arrival = departure + timedelta(minutes=high) if high is not None else None
            safe = arrival + timedelta(minutes=10) if arrival else None
            now_status = evaluate_hours(raw, departure).status
            arrival_status = evaluate_hours(raw, arrival).status if arrival else 'unknown'
            safe_status = evaluate_hours(raw, safe).status if safe else 'unknown'
            risk = ('closed' if now_status == 'declared_closed' and arrival_status != 'declared_open' else
                    'closing_soon' if arrival_status == 'declared_closed' or safe_status == 'declared_closed' else
                    'unknown' if 'unknown' in (now_status, arrival_status, safe_status) else 'ready')
            items.append({**selected.model_dump(), 'departure_at': departure.isoformat(),
                          'arrival_at': arrival.isoformat() if arrival else None,
                          'minutes_min': low, 'minutes_max': high, 'basis': basis,
                          'departure_status': now_status, 'arrival_status': arrival_status,
                          'margin_status': safe_status, 'margin_minutes': 10, 'risk': risk,
                          'inventory_status': 'unconfirmed'})
        return {'items': items, 'limitations': ['برآورد پیاده از فاصلهٔ مستقیم است؛ مسیر خیابانی، ترافیک و دسترسی را مسیریاب بررسی می‌کند.',
                                              'بازبودن طبق برنامهٔ ثبت‌شده است؛ موجودی و ساعت واقعی تأیید نشده‌اند.']}

    return router
