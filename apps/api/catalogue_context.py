"""Source-backed budget ranges, explicit model cautions and nearby shop counts."""
import re
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field,model_validator
from apps.api.catalogue import Catalogue,InvalidQuery
from apps.api.category import detect_category_intent

class ContextRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    query:str=Field(min_length=1,max_length=120)
    category_name:str|None=Field(default=None,max_length=200)
    product_ids:list[str]=Field(default_factory=list,max_length=12)
    lat:float|None=Field(default=None,ge=-90,le=90,allow_inf_nan=False)
    lon:float|None=Field(default=None,ge=-180,le=180,allow_inf_nan=False)
    radius_km:float=Field(default=10,gt=0,le=1000,allow_inf_nan=False)
    @model_validator(mode='after')
    def paired(self):
        if (self.lat is None)!=(self.lon is None):raise ValueError('paired coordinates required')
        return self

def authenticity(title,category):
    text=(title or '').replace('ي','ی').replace('ك','ک')
    strong=re.search(r'های[‌ -]?کپی|غیر[‌ ]?اصل|\breplica\b',text,re.I)
    pattern=re.search(r'(?<!\w)(طرح|کپی)(?!\w)',text) if re.search('گوشی|هدفون|ساعت|شارژر|هندزفری|موبایل|لپ',category or '') else None
    match=strong or pattern
    return {'label':'نسخه و اصالت را بررسی کن','evidence':match.group(0),'declared_non_original':bool(strong)} if match else None

def context_router(catalogue:Catalogue):
    router=APIRouter()
    @router.post('/catalogue-context')
    def context(body:ContextRequest):
        try:page=catalogue.search(body.query,300,0,None,category_name=body.category_name or detect_category_intent(body.query))
        except InvalidQuery as exc:raise HTTPException(422,'عبارت جست‌وجو برای بازهٔ بودجه معتبر نیست.') from exc
        prices=sorted(int(p['offer_summary']['min_price_toman']) for p in page['items'] if p['offer_summary']['min_price_toman'] is not None)
        budget=None
        if prices:
            budget={'min_toman':str(prices[0]),'max_toman':str(prices[-1]),'typical_min_toman':str(prices[(len(prices)-1)//10]),
                    'typical_max_toman':str(prices[(len(prices)-1)*9//10]),'model_count':len(prices),'truncated':page['has_more']}
        facts={}
        with catalogue.connect() as db:
            for identity in dict.fromkeys(body.product_ids):
                product=db.execute('SELECT persian_title,category_name FROM products WHERE product_id=?',(identity,)).fetchone()
                if not product:raise HTTPException(404,'محصول اطلاعات تکمیلی در منبع موجود نیست.')
                rows=db.execute('SELECT offer_id,price_toman FROM offers WHERE product_id=? AND price_toman IS NOT NULL ORDER BY price_toman',(identity,)).fetchall()
                values=[r['price_toman'] for r in rows]
                median=values[len(values)//2] if values else None
                outliers=[r['offer_id'] for r in rows if median and r['price_toman']*5<median*2]
                nearby=None
                if body.lat is not None:
                    nearby=db.execute('SELECT count(DISTINCT o.shop_id) FROM offers o JOIN shops s ON s.shop_id=o.shop_id WHERE o.product_id=? AND haversine_m(?,?,s.lat,s.lon)<=?',(identity,body.lat,body.lon,body.radius_km*1000)).fetchone()[0]
                facts[identity]={'authenticity':authenticity(product['persian_title'],product['category_name']),
                                 'unusual_offer_ids':outliers,'nearby_shop_count':nearby,'radius_km':body.radius_km}
        return {'budget':budget,'products':facts,'scope':'up_to_300_matching_models','inventory_status':'unconfirmed'}
    return router
