"""Local seller demo, parallel checks and expiring demonstration reservations."""
from contextlib import contextmanager,closing
from datetime import datetime,timedelta
import json
import secrets
import sqlite3
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter,HTTPException,Query
from pydantic import BaseModel,ConfigDict,Field
from apps.api.catalogue import Catalogue,FollowupSelectionError
from apps.api.hours import TEHRAN
from apps.api.models import FollowupSelection

def now():return datetime.now(TEHRAN)
class BatchRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    journey_id:str=Field(min_length=1,max_length=100,pattern=r'^[A-Za-z0-9_:-]+$')
    selections:list[FollowupSelection]=Field(min_length=1,max_length=3)
class Reply(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid')
    outcome:Literal['available','price_changed','out_of_stock','closed','no_answer']
    price_toman:str|None=Field(default=None,pattern=r'^[0-9]{1,19}$')
    hold_minutes:int=Field(default=15,ge=0,le=120)
    closes_at:str|None=Field(default=None,pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    note:str=Field(default='',max_length=600)

def public_batch(batch):
    for row in batch['items']:
        reservation=row.get('reservation')
        if reservation and reservation['status']!='cancelled':
            reservation['status']='expired' if datetime.fromisoformat(reservation['expires_at'])<=now() else 'active'
    return batch

def checks_router(catalogue:Catalogue):
    router=APIRouter()
    path=catalogue.database.parent/'shopping.sqlite3'
    @contextmanager
    def connect():
        db=sqlite3.connect(path,timeout=5)
        try:
            db.execute('CREATE TABLE IF NOT EXISTS seller_checks (id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)')
            with db:yield db
        finally:db.close()
    def load(db,identity):
        row=db.execute('SELECT body FROM seller_checks WHERE id=?',(identity,)).fetchone()
        if not row:raise HTTPException(404,'استعلام پیدا نشد.')
        return public_batch(json.loads(row[0]))
    def persist(db,batch):
        db.execute('UPDATE seller_checks SET body=? WHERE id=?',(json.dumps(batch,ensure_ascii=False),batch['id']))
    @router.post('/checks')
    def create(body:BatchRequest):
        ids=[s.shop_id for s in body.selections]
        if len(set(ids))!=len(ids):raise HTTPException(422,'برای استعلام هم‌زمان، فروشگاه‌های متفاوت انتخاب کن.')
        items=[]
        for selection in body.selections:
            try:source=catalogue.followup_selection(selection.product_id,selection.offer_id,selection.shop_id)
            except FollowupSelectionError as exc:raise HTTPException(404,'فروشگاه یا پیشنهاد در منبع موجود نیست.') from exc
            items.append({**selection.model_dump(exclude={'user_lat','user_lon'}),'shop_name':source['offer']['shop']['name'],
                          'product_name':source['product']['persian_title'],'source_price_toman':source['offer']['price_toman'],
                          'source':'simulated','channel':'local_seller_panel','seller_token':str(uuid4()),'reply':None,'reservation':None})
        batch={'id':str(uuid4()),'journey_id':body.journey_id,'created_at':now().isoformat(),'source':'simulated','items':items}
        with connect() as db:db.execute('INSERT INTO seller_checks VALUES (?,?,?,?)',(batch['id'],body.journey_id,json.dumps(batch,ensure_ascii=False),batch['created_at']))
        return batch
    @router.get('/checks')
    def batches(journey_id:str=Query(min_length=1,max_length=100)):
        with connect() as db:rows=db.execute('SELECT body FROM seller_checks WHERE journey_id=? ORDER BY created_at DESC LIMIT 12',(journey_id,)).fetchall()
        return {'items':[public_batch(json.loads(row[0])) for row in rows]}
    @router.get('/checks/{identity}')
    def batch(identity:str):
        with connect() as db:return load(db,identity)
    @router.get('/seller-demo/{identity}/{token}')
    def seller(identity:str,token:str):
        with connect() as db:batch=load(db,identity)
        row=next((r for r in batch['items'] if secrets.compare_digest(r['seller_token'],token)),None)
        if not row:raise HTTPException(404,'لینک پاسخ فروشنده معتبر نیست.')
        return {**row,'batch_id':identity,'created_at':batch['created_at']}
    @router.post('/seller-demo/{identity}/{token}')
    def reply(identity:str,token:str,body:Reply):
        if body.price_toman is not None and int(body.price_toman)>2**63-1:raise HTTPException(422,'قیمت از محدودهٔ قابل ثبت بیشتر است.')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');batch=load(db,identity)
            row=next((r for r in batch['items'] if secrets.compare_digest(r['seller_token'],token)),None)
            if not row:raise HTTPException(404,'لینک پاسخ فروشنده معتبر نیست.')
            row['reply']={**body.model_dump(),'responded_at':now().isoformat(),'source':'simulated'}
            if row.get('reservation'):row['reservation']['status']='cancelled'
            persist(db,batch)
        return {**row,'batch_id':identity}
    @router.post('/checks/{identity}/{offer_id}/reserve')
    def reserve(identity:str,offer_id:str):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');batch=load(db,identity);row=next((r for r in batch['items'] if r['offer_id']==offer_id),None)
            if not row:raise HTTPException(404,'پیشنهاد در استعلام نیست.')
            reply=row['reply']
            if not reply or reply['outcome'] not in ('available','price_changed') or reply['hold_minutes']==0:raise HTTPException(409,'پاسخ قابل رزرو ثبت نشده است.')
            if row.get('reservation') and row['reservation']['status']=='active':return row['reservation']
            price=reply['price_toman'] if reply['price_toman'] is not None else row['source_price_toman']
            if price is None:raise HTTPException(409,'برای رزرو ابتدا قیمت آزمایشی فروشنده را ثبت کن.')
            deadline=datetime.fromisoformat(reply['responded_at'])+timedelta(minutes=reply['hold_minutes'])
            if reply['closes_at']:
                h,m=map(int,reply['closes_at'].split(':'));closing=datetime.fromisoformat(reply['responded_at']).replace(hour=h,minute=m,second=0,microsecond=0)
                if closing<=datetime.fromisoformat(reply['responded_at']):closing+=timedelta(days=1)
                deadline=min(deadline,closing)
            if deadline<=now():raise HTTPException(409,'مهلت پاسخ فروشنده تمام شده؛ پاسخ تازه لازم است.')
            row['reservation']={'id':str(uuid4()),'code':secrets.token_hex(3).upper(),'status':'active','created_at':now().isoformat(),
                                'expires_at':deadline.isoformat(),'price_toman':price,'source':'simulated'}
            persist(db,batch);return row['reservation']
    @router.post('/checks/{identity}/{offer_id}/cancel')
    def cancel(identity:str,offer_id:str):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');batch=load(db,identity);row=next((r for r in batch['items'] if r['offer_id']==offer_id),None)
            if not row or not row.get('reservation'):raise HTTPException(404,'رزرو پیدا نشد.')
            row['reservation']['status']='cancelled';persist(db,batch);return row['reservation']
    @router.delete('/checks/{identity}',status_code=204)
    def remove(identity:str):
        with connect() as db:db.execute('DELETE FROM seller_checks WHERE id=?',(identity,))
    return router


def reservation_snapshot(catalogue, identity, selection, require_active=True):
    path=catalogue.database.parent/'shopping.sqlite3'
    if not path.exists():raise HTTPException(404,'رزرو پیدا نشد.')
    with closing(sqlite3.connect(path)) as db:
        try:rows=db.execute('SELECT body FROM seller_checks ORDER BY created_at DESC LIMIT 200').fetchall()
        except sqlite3.OperationalError as exc:raise HTTPException(404,'رزرو پیدا نشد.') from exc
    for raw in rows:
        batch=public_batch(json.loads(raw[0]))
        for row in batch['items']:
            reservation=row.get('reservation')
            if reservation and reservation['id']==identity:
                if any(row[key]!=getattr(selection,key) for key in ('product_id','offer_id','shop_id')):raise HTTPException(422,'رزرو متعلق به این مقصد نیست.')
                if require_active and reservation['status']!='active':raise HTTPException(409,'رزرو دیگر فعال نیست.')
                return reservation
    raise HTTPException(404,'رزرو پیدا نشد.')
