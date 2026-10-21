"""Run locally: python -m uvicorn apps.api.main:app --no-access-log."""

import asyncio
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Callable

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import ResponseValidationError
from fastapi.responses import JSONResponse

from apps.api.catalogue import Catalogue, CatalogueUnavailable, InvalidQuery
from apps.api.models import OfferPage, ProductDetail, ProductPage, AssistantResult, AssistantStatus
from apps.api.assistant import AssistantService
from apps.api.agent_usage import AgentError
from apps.api.intent import AssistantRequest


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


def create_app(database: Path | None = None, *, clock: Callable[[], datetime] | None = None,
               assistant: AssistantService | None = None) -> FastAPI:
    catalogue = Catalogue(database if database is not None else Path(
        os.environ.get("TOROB_DATABASE", str(ROOT / ".local/catalogue.sqlite3"))))
    application = FastAPI(title="Torob local historical catalogue", version="0.1.0")
    agent = assistant if assistant is not None else AssistantService.from_root(catalogue, ROOT)

    @application.exception_handler(AgentError)
    async def agent_error(request: Request, exc: AgentError):
        return JSONResponse(status_code=exc.status, content={'code': exc.code,
            'detail': 'دستیار نتوانست این درخواست را کامل کند؛ جست‌وجوی مستقیم همچنان در دسترس است.'})

    @application.get('/api/assistant/status', response_model=AssistantStatus)
    def assistant_status(response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try:
            return agent.status()
        except (OSError, sqlite3.Error) as exc:
            raise AgentError('usage_unavailable') from exc

    @application.post('/api/assistant/turn', response_model=AssistantResult)
    async def assistant_turn(body: AssistantRequest, request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        # No server-side conversation store: bounded history is request-scoped.
        task = asyncio.create_task(agent.run(body))
        try:
            while not task.done():
                if await request.is_disconnected():
                    task.cancel()
                    raise AgentError('cancelled', 499)
                await asyncio.wait({task}, timeout=0.1)
            return await task
        except (OSError, sqlite3.Error) as exc:
            raise AgentError('usage_unavailable') from exc
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

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
        response: Response,
        limit: Limit = 20,
        offset: Offset = 0,
        max_price_toman: Budget = None,
        user_lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
        user_lon: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False),
        max_distance_km: float | None = Query(None, gt=0, le=1000, allow_inf_nan=False),
        open_now_only: bool = False,
        in_person_credit_only: bool = False,
    ):
        # Hours depend on request time. A refresh must not reuse a cached page.
        response.headers["Cache-Control"] = "no-store"
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
            open_now_only=open_now_only,
            evaluated_at=clock() if clock is not None else datetime.now(timezone.utc),
            in_person_credit_only=in_person_credit_only,
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
