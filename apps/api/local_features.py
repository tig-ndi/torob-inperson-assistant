"""Local shopping workflow. No network and no changes to the source catalogue."""
from datetime import datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
import sqlite3
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import Field
from apps.api.catalogue import Catalogue
from apps.api.models import FollowupSelection
from apps.api.hours import evaluate_hours
from apps.api.visit import visit_router
from apps.api.destinations import destinations_router
from apps.api.journey import journey_router
from apps.api.routing import routing_router
from apps.api.checks import checks_router,reservation_snapshot
from apps.api.catalogue_context import context_router


class Report(FollowupSelection):
    source: Literal['simulated', 'user_report']
    outcome: Literal['available', 'price_changed', 'out_of_stock', 'no_answer', 'closed']
    price_toman: str | None = Field(default=None, pattern=r'^[0-9]{1,19}$')
    note: str = Field(default='', max_length=1200)


class Trip(FollowupSelection):
    reservation_id: str | None = Field(default=None,max_length=100)
    alternatives: list[FollowupSelection] = Field(default_factory=list, max_length=2)
    checklist: list[str] = Field(default_factory=list, max_length=8)


def local_router(catalogue: Catalogue, root: Path) -> APIRouter:
    router = APIRouter(prefix='/api/local', tags=['local-workflow'])
    storage = catalogue.database.parent / 'shopping.sqlite3'

    def connect():
        storage.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(storage, timeout=5)
        db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)')
        return db

    def save(kind, data):
        identity, now = str(uuid4()), datetime.now(timezone.utc).isoformat()
        db = connect()
        try:
            with db:
                db.execute('INSERT INTO records VALUES (?,?,?,?)', (identity, kind, json.dumps(data, ensure_ascii=False), now))
        finally:
            db.close()
        return {'id': identity, 'created_at': now, **data}

    @lru_cache(maxsize=1)
    def summary_data():
        with catalogue.connect() as db:
            return {'counts': {table: db.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in ('products', 'offers', 'shops')},
                    'categories': [dict(row) for row in db.execute('SELECT category_name AS name,count(*) AS count FROM products WHERE category_name IS NOT NULL GROUP BY category_name ORDER BY count(*) DESC LIMIT 12')],
                    'provenance': catalogue.provenance(db), 'coverage': 'Tehran', 'contacts_synthetic': True,
                    'kalabarg_recorded': False}

    @router.get('/summary')
    def summary():
        return summary_data()

    @router.get('/probable-shops')
    def probable_shops(category: str = Query(min_length=1, max_length=120),
                       product_id: str = Query(min_length=1, max_length=200),
                       lat: float = Query(ge=-90, le=90, allow_inf_nan=False),
                       lon: float = Query(ge=-180, le=180, allow_inf_nan=False),
                       radius: float = Query(default=5, gt=0, le=1000)):
        with catalogue.connect() as db:
            rows = db.execute('SELECT s.shop_id,s.name,s.address,s.location_label,s.lat,s.lon,s.weekly_hours, '
                              'haversine_m(?,?,s.lat,s.lon) AS distance FROM shops s '
                              'WHERE EXISTS (SELECT 1 FROM json_each(s.category_names) c WHERE c.value=?) '
                              'AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.shop_id=s.shop_id AND o.product_id=?) '
                              'AND haversine_m(?,?,s.lat,s.lon)<=? ORDER BY distance,s.shop_id LIMIT 12',
                              (lat, lon, category, product_id, lat, lon, radius * 1000)).fetchall()
            return {'items': [{**{k: row[k] for k in ('shop_id','name','address','location_label','lat','lon')},
                               'direct_distance_meters': round(row['distance']), 'inventory_status': 'unknown',
                               'opening_hours': evaluate_hours(row['weekly_hours'], datetime.now(timezone.utc)).as_dict()}
                              for row in rows]}

    @router.post('/followups')
    def report(body: Report):
        catalogue.followup_selection(body.product_id, body.offer_id, body.shop_id)
        if body.price_toman is not None and int(body.price_toman) > 2**63 - 1:
            raise HTTPException(422, 'قیمت از محدوده پشتیبانی‌شده بیشتر است.')
        if body.outcome == 'price_changed' and body.price_toman is None:
            raise HTTPException(422, 'قیمت جدید را وارد کنید.')
        values = body.model_dump(exclude={'user_lat', 'user_lon'})
        return save('followup', {**values, 'seller_confirmation': False, 'external_contact_attempted': False})

    @router.get('/followups')
    def reports(offer_id: str = Query(min_length=1, max_length=200)):
        db = connect()
        try:
            rows = db.execute("SELECT id,body,created_at FROM records WHERE kind='followup' AND json_extract(body,'$.offer_id')=? ORDER BY created_at DESC LIMIT 30", (offer_id,)).fetchall()
            items=[]
            for row in rows:
                data=json.loads(row[1])
                if data.get('reservation'):
                    selected=FollowupSelection(**{key:data[key] for key in ('product_id','offer_id','shop_id')})
                    try:data['reservation']=reservation_snapshot(catalogue,data['reservation']['id'],selected,require_active=False)
                    except HTTPException:data['reservation']['status']='unknown'
                items.append({'id':row[0],**data,'created_at':row[2]})
            return {'items':items}
        finally:
            db.close()

    @router.post('/trips')
    def trip(body: Trip):
        selection = catalogue.followup_selection(body.product_id, body.offer_id, body.shop_id)
        for other in body.alternatives:
            if other.product_id != body.product_id:
                raise HTTPException(422, 'جایگزین باید مربوط به همان محصول باشد.')
            catalogue.followup_selection(other.product_id, other.offer_id, other.shop_id)
        if any(len(item) > 200 for item in body.checklist):
            raise HTTPException(422, 'متن چک‌لیست بیش از حد طولانی است.')
        data = body.model_dump(exclude={'user_lat','user_lon','alternatives','reservation_id'})
        if body.reservation_id:data['reservation']=reservation_snapshot(catalogue,body.reservation_id,body)
        data['alternatives'] = [o.model_dump(exclude={'user_lat','user_lon'}) for o in body.alternatives]
        return save('trip', {**data, 'shop_name': selection['offer']['shop']['name'],
                            'product_name': selection['product']['persian_title']})

    @router.get('/trips')
    def trips():
        db = connect()
        try:
            rows = db.execute("SELECT id,body,created_at FROM records WHERE kind='trip' ORDER BY created_at DESC LIMIT 50").fetchall()
            items=[]
            for row in rows:
                data=json.loads(row[1])
                if data.get('reservation'):
                    selected=FollowupSelection(**{key:data[key] for key in ('product_id','offer_id','shop_id')})
                    try:data['reservation']=reservation_snapshot(catalogue,data['reservation']['id'],selected,require_active=False)
                    except HTTPException:data['reservation']['status']='unknown'
                items.append({'id':row[0],**data,'created_at':row[2]})
            return {'items':items}
        finally:
            db.close()

    @router.delete('/trips/{trip_id}')
    def delete_trip(trip_id: str):
        db = connect()
        try:
            with db:
                cursor = db.execute("DELETE FROM records WHERE id=? AND kind='trip'", (trip_id,))
                if cursor.rowcount != 1:
                    raise HTTPException(404, 'برنامه پیدا نشد.')
        finally:
            db.close()
        return Response(status_code=204)

    router.include_router(visit_router(catalogue))
    router.include_router(destinations_router(catalogue))
    router.include_router(journey_router(catalogue))
    router.include_router(routing_router(catalogue))
    router.include_router(checks_router(catalogue))
    router.include_router(context_router(catalogue))
    return router
