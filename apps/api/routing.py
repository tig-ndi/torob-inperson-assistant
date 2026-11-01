"""Bounded, opt-in road routing through FOSSGIS's public OSRM profiles."""
from collections import OrderedDict
from datetime import datetime, timezone
from math import isfinite
import threading
import time
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from apps.api.catalogue import Catalogue, FollowupSelectionError, haversine_distance_m
from apps.api.models import FollowupSelection

RoadMode = Literal['walking', 'driving', 'cycling']
PROFILES = {'walking': 'foot', 'driving': 'car', 'cycling': 'bike'}
_cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()
_lock = threading.Lock()
_last_call = 0.0
TTL = 600

class RouteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    selections: list[FollowupSelection] = Field(min_length=1, max_length=3)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    mode: RoadMode = 'walking'
    consent: Literal[True]

def cache_key(lat, lon, target_lat, target_lon, mode):
    return (round(lat, 5), round(lon, 5), target_lat, target_lon, mode)

def cached_route(lat, lon, target_lat, target_lon, mode):
    if None in (lat, lon, target_lat, target_lon) or mode not in PROFILES:
        return None
    row = _cache.get(cache_key(lat, lon, target_lat, target_lon, mode))
    return row[1] if row and time.monotonic() - row[0] < TTL else None

def number(value, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or not 0 <= value <= maximum:
        raise ValueError('invalid route number')
    return float(value)

def parse_route(data):
    if not isinstance(data, dict) or data.get('code') != 'Ok' or not data.get('routes'):
        raise ValueError('no route')
    route = data['routes'][0]
    geometry = route['geometry']
    coords = geometry.get('coordinates')
    if geometry.get('type') != 'LineString' or not isinstance(coords, list) or not 2 <= len(coords) <= 40000:
        raise ValueError('invalid geometry')
    for point in coords:
        if not isinstance(point, list) or len(point) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not isfinite(n) for n in point) or abs(point[0]) > 180 or abs(point[1]) > 90:
            raise ValueError('invalid coordinate')
    steps = []
    for leg in route.get('legs', []):
        for step in leg.get('steps', []):
            maneuver = step.get('maneuver', {})
            steps.append({'name': str(step.get('name', ''))[:200], 'type': str(maneuver.get('type', ''))[:40],
                          'modifier': str(maneuver.get('modifier', ''))[:40],
                          'distance_meters': round(number(step.get('distance'), 1000000)),
                          'duration_seconds': round(number(step.get('duration'), 1000000))})
    offsets = [round(number(w.get('distance', 0), 10000)) for w in data.get('waypoints', [])]
    return {'geometry': geometry, 'distance_meters': round(number(route.get('distance'), 2000000)),
            'duration_seconds': round(number(route.get('duration'), 1000000)), 'steps': steps[:200],
            'endpoint_offset_meters': max(offsets, default=0), 'computed_at': datetime.now(timezone.utc).isoformat(),
            'source': 'FOSSGIS / OSRM / OpenStreetMap', 'live_traffic': False}

def fetch_road(lat, lon, target_lat, target_lon, mode):
    global _last_call
    with _lock:
        previous = cached_route(lat, lon, target_lat, target_lon, mode)
        if previous:
            return previous
        # The public service permits at most one request per second.
        time.sleep(max(0, 1.1 - (time.monotonic() - _last_call)))
        _last_call = time.monotonic()
        coordinates = f'{round(lon,5)},{round(lat,5)};{target_lon},{target_lat}'
        url = f'https://routing.openstreetmap.de/routed-{PROFILES[mode]}/route/v1/driving/{coordinates}'
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            response = client.get(url, params={'overview':'full','geometries':'geojson','steps':'true','radiuses':'500;500'},
                                  headers={'User-Agent':'TorobLocalPrototype/1.0 (local development)'})
        if response.status_code != 200:
            raise ValueError('route unavailable')
        result = parse_route(response.json())
        key = cache_key(lat, lon, target_lat, target_lon, mode)
        _cache[key] = (time.monotonic(), result)
        while len(_cache) > 256:
            _cache.popitem(last=False)
        return result

def routing_router(catalogue: Catalogue):
    router = APIRouter()
    @router.post('/road-routes')
    def routes(body: RouteRequest):
        selections = []
        for selection in body.selections:
            try:
                source = catalogue.followup_selection(selection.product_id, selection.offer_id, selection.shop_id)
            except FollowupSelectionError as exc:
                raise HTTPException(404, 'پیشنهاد مسیر در منبع موجود نیست.') from exc
            selections.append((selection, source['offer']['shop']))
        items = []
        for selection, shop in selections:
            identity = selection.model_dump(exclude={'user_lat','user_lon'})
            if shop['lat'] is None or shop['lon'] is None:
                items.append({**identity,'mode':body.mode,'status':'unavailable','reason':'مختصات فروشگاه ثبت نشده است.'});continue
            if haversine_distance_m(body.lat,body.lon,shop['lat'],shop['lon']) > 250000:
                items.append({**identity,'mode':body.mode,'status':'unavailable','reason':'برای این فاصلهٔ طولانی از مسیریاب بیرونی استفاده کن.'});continue
            try:
                result = fetch_road(body.lat,body.lon,shop['lat'],shop['lon'],body.mode)
                items.append({**identity,'mode':body.mode,'status':'ready',**result})
            except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
                items.append({**identity,'mode':body.mode,'status':'unavailable','reason':'مسیر خیابانی دریافت نشد؛ می‌توانی دوباره تلاش کنی یا نشان و بلد را باز کنی.'})
        return {'items': items}
    return router
