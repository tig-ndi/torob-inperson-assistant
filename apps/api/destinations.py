"""Search source offers across matching models before selecting visit destinations."""
from datetime import datetime,timedelta
from math import ceil
from functools import lru_cache
from typing import Literal,Annotated
from fastapi import APIRouter,HTTPException
from pydantic import Field
from apps.api.visit import VisitRequest
from apps.api.category import detect_category_intent
from apps.api.catalogue import Catalogue,InvalidQuery,retrieval_expression,decode_list,haversine_distance_m
from apps.api.hours import TEHRAN,evaluate_hours
from apps.api.credit import evaluate_credit
from apps.api.battery import assess_capacity
from apps.api.routing import cached_route
from apps.api.shopping_intent import matches_product_kind
from apps.api.visit_time import selected_instant
from tools.prepare_data import normalize_text


from apps.api.source_filters import SourceFilters, matches_source_filters


class DestinationRequest(VisitRequest):
    excluded_kinds:list[Literal['portable_fridge']]=Field(default_factory=list,max_length=1)
    require_anc:bool=False
    minimum_capacity_kg:int|None=Field(default=None,strict=True,gt=0,le=1000)
    source_filters: SourceFilters = Field(default_factory=SourceFilters)
    reference_product_id:str|None=Field(default=None,min_length=1,max_length=120)
    exclude_shop_ids:list[Annotated[str,Field(min_length=1,max_length=120)]]=Field(default_factory=list,max_length=20)
    product_id:str=''
    query:str=Field(min_length=1,max_length=120)
    category_name:str|None=Field(default=None,max_length=200)
    category_cleared:bool=False
    mode:Literal['walking','driving','cycling','manual']='walking'
    minimum_battery_mah:int|None=Field(default=None,ge=0,le=1000000)


def destinations_router(catalogue:Catalogue):
    router=APIRouter()
    @router.post('/destinations')
    def destinations(body:DestinationRequest):
        try:expression=retrieval_expression(body.query)
        except InvalidQuery as exc:raise HTTPException(422,'عبارت خرید معتبر نیست.') from exc
        when=selected_instant(datetime.now(TEHRAN),body.local_time,body.visit_date)
        category=None if body.category_cleared else body.category_name or detect_category_intent(body.query)
        @lru_cache(maxsize=1024)
        def hours(raw):return evaluate_hours(raw,when).status
        @lru_cache(maxsize=2048)
        def credit(raw,price,cat):return evaluate_credit(raw,price,cat)
        def arrival_rank(raw,lat,lon):
            if lat is None or lon is None:return 1
            road=cached_route(body.lat,body.lon,lat,lon,body.mode) if body.mode!='manual' else None
            minutes=max(1,ceil(road['duration_seconds']/60)) if road else max(1,ceil(haversine_distance_m(body.lat,body.lon,lat,lon)*1.7/65)) if body.mode=='walking' else None
            if minutes is None:return 1
            arrival=when+timedelta(minutes=minutes)
            statuses=[evaluate_hours(raw,t).status for t in (arrival,arrival+timedelta(minutes=10))]
            return 0 if all(v=='declared_open' for v in statuses) else 2 if 'declared_closed' in statuses else 1
        def payment(raw,price,cat):
            value=credit(raw,price,cat)
            if body.credit and value.status!='matches_declared_terms':return 0
            if body.payment_provider:
                names={'torobpay':{'ترب پی','تربپی'},'kalabarg':{'کالابرگ','کالا برگ'}}[body.payment_provider]
                return int(any(o.status=='matches_declared_terms' and normalize_text(o.provider_name or '') in names for o in value.options))
            return 1
        with catalogue.connect() as db:
            db.create_function('source_filter',1,lambda raw: matches_source_filters(raw,body.source_filters.model_dump()),deterministic=True)
            from apps.api.purchase_preferences import recorded_requirements_match, excluded_kind_matches
            db.create_function('purchase_requirements',3,lambda cat,raw,title:recorded_requirements_match(cat,raw,body.require_anc,body.minimum_capacity_kg) and excluded_kind_matches(cat,title,body.excluded_kinds),deterministic=True)
            db.create_function('product_kind',6,matches_product_kind,deterministic=True)
            db.create_function('visit_status',1,hours,deterministic=True)
            db.create_function('arrival_rank',3,arrival_rank,deterministic=True)
            db.create_function('payment_matches',3,payment,deterministic=True)
            db.create_function('capacity_mah',2,lambda cat,raw:assess_capacity(cat,decode_list(raw)).capacity_mah,deterministic=True)
            base=(' FROM product_search JOIN products p ON p.product_id=product_search.product_id '
                  'JOIN offers o ON o.product_id=p.product_id JOIN shops s ON s.shop_id=o.shop_id '
                  'WHERE source_filter(p.specs)=1 AND purchase_requirements(p.category_name,p.specs,p.persian_title)=1 AND product_search MATCH ? AND product_kind(?,p.category_name,p.persian_title,p.specs,p.brand_name,p.model)=1 '
                  'AND (? IS NULL OR p.category_name=?) AND haversine_m(?,?,s.lat,s.lon)<=? '
                  'AND (? IS NULL OR o.price_toman>=?) AND (? IS NULL OR o.price_toman<=?) ')
            low=int(body.min_price_toman) if body.min_price_toman is not None else None
            high=int(body.max_price_toman) if body.max_price_toman is not None else None
            params=[expression,body.query,category,category,body.lat,body.lon,body.search_km*1000,low,low,high,high]
            if body.exclude_shop_ids:
                base+='AND s.shop_id NOT IN ('+','.join('?' for _ in body.exclude_shop_ids)+') '
                params.extend(body.exclude_shop_ids)
            if body.credit or body.payment_provider:base+='AND payment_matches(s.payment_options,o.price_toman,p.category_name)=1 '
            if body.fast_delivery_only:base+='AND s.supports_fast_delivery=1 '
            if body.reference_product_id is not None:
                base+='AND p.product_id=? '
                params.append(body.reference_product_id)
            if body.minimum_battery_mah is not None:
                base+='AND p.category_name=? AND capacity_mah(p.category_name,p.specs)>=? ';params.extend(['گوشی موبایل',body.minimum_battery_mah])
            counts=db.execute('SELECT count(DISTINCT p.product_id),count(DISTINCT s.shop_id)'+base,params).fetchone()
            select=('SELECT p.product_id,o.offer_id,o.shop_id,o.price_toman,haversine_m(?,?,s.lat,s.lon) AS dist_m,arrival_rank(s.weekly_hours,s.lat,s.lon) AS arrival_rank,'
                    'row_number() OVER(PARTITION BY s.shop_id ORDER BY o.price_toman IS NULL,o.price_toman,o.offer_id) AS shop_row')
            rows=db.execute('SELECT * FROM ('+select+base+"AND visit_status(s.weekly_hours)='declared_open') "
                            'WHERE shop_row=1 ORDER BY arrival_rank,dist_m,price_toman IS NULL,price_toman,offer_id LIMIT 3',
                            [body.lat,body.lon,*params]).fetchall()
            identities=list(dict.fromkeys(r['product_id'] for r in rows))
            if not identities:
                row=db.execute('SELECT p.product_id'+base+'ORDER BY haversine_m(?,?,s.lat,s.lon),p.product_id LIMIT 1',
                               [*params,body.lat,body.lon]).fetchone()
                if row:identities=[row['product_id']]
        return {'product_ids':identities,'selections':[{k:r[k] for k in ('product_id','offer_id','shop_id')} for r in rows],'matched_models':counts[0],'matched_shops':counts[1],
                'coverage':'all_matching_offers_in_radius','inventory_status':'unconfirmed'}
    return router
