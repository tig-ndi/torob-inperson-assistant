"""Source-backed visit decisions. Opening hours are declarations, never live stock."""
from datetime import datetime
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from apps.api.catalogue import Catalogue
from apps.api.hours import TEHRAN
from apps.api.visit_time import CalendarDate, selected_instant


class VisitRequest(BaseModel):
    visit_date: CalendarDate | None = None
    model_config = ConfigDict(extra='forbid')
    product_id: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    nearby_km: float = Field(default=2, gt=0, le=50)
    search_km: float = Field(default=15, gt=0, le=1000)
    local_time: str | None = Field(default=None, pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    min_price_toman: str | None = Field(default=None, pattern=r'^[0-9]{1,19}$')
    max_price_toman: str | None = Field(default=None, pattern=r'^[0-9]{1,19}$')
    credit: bool = False
    payment_provider: Literal['torobpay', 'kalabarg'] | None = None
    fast_delivery_only: bool = False

    @model_validator(mode='after')
    def validate_ranges(self):
        amounts = [int(x) for x in (self.min_price_toman, self.max_price_toman) if x is not None]
        if any(x > 2**63-1 for x in amounts):
            raise ValueError('budget out of range')
        if self.min_price_toman and self.max_price_toman and int(self.min_price_toman) > int(self.max_price_toman):
            raise ValueError('minimum exceeds maximum')
        if self.search_km < self.nearby_km:
            raise ValueError('search radius is smaller than nearby radius')
        return self


def visit_router(catalogue: Catalogue):
    router = APIRouter()

    @router.post('/visit-insights')
    def insights(body: VisitRequest):
        now = selected_instant(datetime.now(TEHRAN), body.local_time, body.visit_date)
        with catalogue.connect() as db:
            product = db.execute('SELECT category_name FROM products WHERE product_id=?', (body.product_id,)).fetchone()
            if product is None:
                raise HTTPException(404, 'محصول در مجموعه ثبت نشده است.')
        common = dict(product_id=body.product_id, user_lat=body.lat, user_lon=body.lon,
                      max_price=int(body.max_price_toman) if body.max_price_toman is not None else None,
                      min_price=int(body.min_price_toman) if body.min_price_toman is not None else None,
                      payment_provider=body.payment_provider, fast_delivery_only=body.fast_delivery_only,
                      in_person_credit_only=body.credit, evaluated_at=now, sort_by='nearest')
        nearby, offset, truncated = [], 0, False
        while True:
            page = catalogue.offers(**common, limit=50, offset=offset, max_distance_km=body.nearby_km)
            nearby.extend(page['items'])
            if not page['has_more']:
                break
            offset += 50
            if offset >= 500:
                truncated = True
                break
        status_by_shop = {o['shop_id']: o['opening_hours']['status'] for o in nearby}
        counts = {status: sum(value == status for value in status_by_shop.values())
                  for status in ('declared_open', 'declared_closed', 'unknown')}
        opened = catalogue.offers(**common, limit=3, offset=0, max_distance_km=body.search_km, open_now_only=True)
        markets = {}
        if product['category_name']:
            with catalogue.connect() as db:
                rows = db.execute(
                    'SELECT s.shop_id,s.name,s.address,s.lat,s.lon,haversine_m(?,?,s.lat,s.lon) AS distance '
                    'FROM shops s WHERE haversine_m(?,?,s.lat,s.lon)<=? '
                    'AND EXISTS (SELECT 1 FROM json_each(s.category_names) c WHERE c.value=?) '
                    'ORDER BY distance,s.shop_id LIMIT 500',
                    (body.lat,body.lon,body.lat,body.lon,body.nearby_km*1000,product['category_name'])).fetchall()
                for row in rows:
                    match = re.search(r'(پاساژ|مجتمع|بازار|مرکز خرید)\s+([^،,;\n]{2,45})', row['address'] or '')
                    if not match:
                        continue
                    name = re.split(r'\s*(?:طبقه|واحد|پلاک)\s*', match.group(0))[0].strip(' -،,')
                    if len(name) < 7:
                        continue
                    if name not in markets:
                        markets[name] = dict(name=name,address=row['address'],lat=row['lat'],lon=row['lon'],
                                             direct_distance_meters=round(row['distance']),category_shops=0,
                                             inventory_status='unknown',opening_status='unknown',
                                             evidence='recorded_shop_address',shop_id=row['shop_id'])
                    markets[name]['category_shops'] += 1
        return dict(evaluated_at=now.isoformat(),time_source='selected_time' if body.local_time or body.visit_date else 'server_clock',
                    nearby_km=body.nearby_km,search_km=body.search_km,
                    nearby=dict(shops=len(status_by_shop),**counts,truncated=truncated),
                    open_offers=opened,markets=list(markets.values())[:3],
                    limitations=['ساعت‌ها طبق برنامهٔ ثبت‌شده‌اند؛ قیمت و موجودی لحظه‌ای تأیید نشده‌اند.',
                                 'مراکز خرید فقط از آدرس‌های همین دیتاست استخراج شده‌اند؛ بازبودن و موجودی سایر مغازه‌ها نامشخص است.',
                                 'فاصله‌ها مستقیم‌اند و زمان یا طول مسیر خیابانی نیستند.'])
    return router
