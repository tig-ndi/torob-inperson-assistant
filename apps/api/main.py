"""Run locally: python -m uvicorn apps.api.main:app --no-access-log."""

import math
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import ResponseValidationError
from fastapi.responses import JSONResponse

from apps.api.catalogue import Catalogue, CatalogueUnavailable, InvalidQuery
from apps.api.models import OfferPage, ProductDetail, ProductPage


ROOT = Path(__file__).resolve().parents[2]
Limit = Annotated[int, Query(ge=1, le=50)]
Offset = Annotated[int, Query(ge=0, le=1000000)]
Budget = Annotated[str | None, Query(pattern=r"^[0-9]{1,19}$", max_length=19)]


def parse_budget(value: str | None) -> int | None:
    if value is None:
        return None
    price = int(value)
    if price > 2**63 - 1:
        raise HTTPException(422, "بودجه از محدودهٔ عددی پشتیبانی‌شده بیشتر است.")
    return price


def create_app(database: Path | None = None) -> FastAPI:
    catalogue = Catalogue(database if database is not None else Path(
        os.environ.get("TOROB_DATABASE", str(ROOT / ".local/catalogue.sqlite3"))))
    application = FastAPI(title="Torob local historical catalogue", version="0.1.0")

    @application.exception_handler(CatalogueUnavailable)
    @application.exception_handler(ResponseValidationError)
    async def unavailable(request: Request, exc: Exception):
        return JSONResponse(status_code=503, content={"detail": "کاتالوگ در دسترس نیست؛ مسیر و سلامت snapshot را بررسی کنید.",
                                                       "code": "catalogue_unavailable"})

    @application.get("/api/products", response_model=ProductPage)
    def search(q: Annotated[str, Query(min_length=1, max_length=120)], limit: Limit = 20,
               offset: Offset = 0, max_price_toman: Budget = None):
        try:
            return catalogue.search(q, limit, offset, parse_budget(max_price_toman))
        except InvalidQuery as exc:
            raise HTTPException(422, str(exc)) from exc

    @application.get("/api/products/{product_id}", response_model=ProductDetail)
    def detail(product_id: str):
        validate_id(product_id)
        result = catalogue.detail(product_id)
        if result is None:
            raise HTTPException(404, "محصول در این snapshot ثبت نشده است.")
        return result

    @application.get("/api/products/{product_id}/offers", response_model=OfferPage)
    def offers(
        product_id: str,
        limit: Limit = 20,
        offset: Offset = 0,
        max_price_toman: Budget = None,
        user_lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
        user_lon: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False),
        max_distance_km: float | None = Query(None, gt=0, le=1000, allow_inf_nan=False),
    ):
        validate_id(product_id)
        validate_coordinates(user_lat, user_lon, max_distance_km)
        result = catalogue.offers(
            product_id,
            limit,
            offset,
            parse_budget(max_price_toman),
            user_lat,
            user_lon,
            max_distance_km,
        )
        if result is None:
            raise HTTPException(404, "محصول در این snapshot ثبت نشده است.")
        return result

    return application


def validate_coordinates(
    user_lat: float | None,
    user_lon: float | None,
    max_distance_km: float | None,
) -> None:
    if (user_lat is None) != (user_lon is None):
        raise HTTPException(422, "مختصات عرض (lat) و طول (lon) جغرافیایی باید هر دو ارائه شوند.")

    if max_distance_km is not None and (user_lat is None or user_lon is None):
        raise HTTPException(422, "تعیین شعاع فاصله نیازمند ارائهٔ موقعیت معتبر (عرض و طول جغرافیایی) است.")

    if user_lat is not None:
        if not math.isfinite(user_lat) or not (-90.0 <= user_lat <= 90.0):
            raise HTTPException(422, "عرض جغرافیایی (lat) نامعتبر است؛ باید عدد متناهی بین -۹۰ و ۹۰ باشد.")

    if user_lon is not None:
        if not math.isfinite(user_lon) or not (-180.0 <= user_lon <= 180.0):
            raise HTTPException(422, "طول جغرافیایی (lon) نامعتبر است؛ باید عدد متناهی بین -۱۸۰ و ۱۸۰ باشد.")

    if max_distance_km is not None:
        if not math.isfinite(max_distance_km) or max_distance_km <= 0 or max_distance_km > 1000.0:
            raise HTTPException(422, "شعاع فاصله باید عدد متناهی مثبت و حداکثر ۱۰۰۰ کیلومتر باشد.")


def validate_id(value: str) -> None:
    if not 1 <= len(value) <= 200 or any(ord(character) < 32 for character in value):
        raise HTTPException(422, "شناسهٔ محصول معتبر نیست.")


app = create_app()
