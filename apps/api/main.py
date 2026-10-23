"""Run locally: python -m uvicorn apps.api.main:app --no-access-log."""

import asyncio
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Callable, Literal

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import ResponseValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from apps.api.catalogue import Catalogue, CatalogueUnavailable, FollowupSelectionError, InvalidQuery
from apps.api.category import detect_category_intent
from apps.api.followup import alternatives_limitations, draft_text, prepare_limitations
from apps.api.models import (
    OfferPage, ProductDetail, ProductPage, AssistantResult, AssistantStatus,
    FollowupAlternativesRequest, FollowupAlternativesResponse, FollowupPrepareRequest,
    FollowupPrepareResponse,
)
from apps.api.assistant import AssistantService
from apps.api.agent_usage import AgentError
from apps.api.intent import AssistantRequest
from apps.api.battery import MAX_CAPACITY_MAH
from apps.api.voice import voice_router
from apps.api.deployment import readiness
from apps.api.guidance import Guidance, guidance


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
               assistant: AssistantService | None = None, web_dist: Path | None = None) -> FastAPI:
    catalogue = Catalogue(database if database is not None else Path(
        os.environ.get("TOROB_DATABASE", str(ROOT / ".local/catalogue.sqlite3"))))
    application = FastAPI(title="Torob local historical catalogue", version="0.1.0")
    agent = assistant if assistant is not None else AssistantService.from_root(catalogue, ROOT)
    web = (web_dist if web_dist is not None else Path(
        os.environ.get('TOROB_WEB_DIST', str(ROOT / 'apps/web/dist')))).resolve()
    application.state.readiness_check = lambda: readiness(catalogue, agent.ledger, web)

    @application.get('/api/assistant/guidance', response_model=Guidance)
    def assistant_guidance(q: Annotated[str | None, Query(min_length=1, max_length=120)] = None):
        try:
            return guidance(catalogue, q)
        except InvalidQuery as exc:
            raise HTTPException(422, str(exc)) from exc

    @application.get('/api/health/live')
    def liveness():
        return {'status': 'alive'}

    @application.get('/api/health/ready')
    def ready(response: Response):
        response.headers['Cache-Control'] = 'no-store'
        checks = application.state.readiness_check()
        if any(value != 'ready' for value in checks.values()):
            response.status_code = 503
        return {'status': 'ready' if response.status_code != 503 else 'unavailable', 'checks': checks}

    @application.exception_handler(AgentError)
    async def agent_error(request: Request, exc: AgentError):
        return JSONResponse(status_code=exc.status, content={'code': exc.code,
            'detail': 'دستیار نتوانست این درخواست را کامل کند؛ جست‌وجوی مستقیم همچنان در دسترس است.'})

    @application.exception_handler(FollowupSelectionError)
    async def followup_selection_error(request: Request, exc: FollowupSelectionError):
        if exc.code == 'offer_shop_mismatch':
            status = 409
            detail = 'آفر انتخاب‌شده به این فروشگاه تعلق ندارد.'
        elif exc.code == 'offer_not_found':
            status = 404
            detail = 'آفر انتخاب‌شده برای این محصول در snapshot ثبت نشده است.'
        else:
            status = 404
            detail = 'محصول انتخاب‌شده در snapshot ثبت نشده است.'
        return JSONResponse(status_code=status, content={'code': exc.code, 'detail': detail})

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
               offset: Offset = 0, max_price_toman: Budget = None,
               category_name: Annotated[str | None, Query(max_length=120)] = None,
               category_cleared: Annotated[bool, Query()] = False,
               min_battery_capacity_mah: Annotated[int | None, Query(ge=0, le=MAX_CAPACITY_MAH)] = None,
               sort_by: Literal['relevance', 'nearest'] = 'relevance',
               user_lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
               user_lon: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False)):
        validate_coordinates(user_lat, user_lon, None)
        if sort_by == 'nearest' and user_lat is None:
            raise HTTPException(422, 'مرتب‌سازی فاصله به مختصات معتبر نیاز دارد.')
        try:
            effective_category = None
            if not category_cleared:
                effective_category = category_name if category_name else detect_category_intent(q)
            if min_battery_capacity_mah is not None and (effective_category or detect_category_intent(q)) not in {None, 'گوشی موبایل'}:
                raise HTTPException(422, "فیلتر ظرفیت باتری فقط برای گوشی موبایل پشتیبانی می‌شود.")
            return catalogue.search(q, limit, offset, parse_budget(max_price_toman),
                                    category_name=effective_category, min_battery_capacity_mah=min_battery_capacity_mah,
                                    user_lat=user_lat, user_lon=user_lon, sort_by=sort_by)
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
        sort_by: Literal['price', 'nearest'] = 'price',
    ):
        # Hours depend on request time. A refresh must not reuse a cached page.
        response.headers["Cache-Control"] = "no-store"
        validate_id(product_id)
        validate_coordinates(user_lat, user_lon, max_distance_km)
        if sort_by == 'nearest' and user_lat is None:
            raise HTTPException(422, 'مرتب‌سازی فاصله به مختصات معتبر نیاز دارد.')
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
            sort_by=sort_by,
        )
        if result is None:
            raise HTTPException(404, "محصول در این snapshot ثبت نشده است.")
        return result

    @application.post('/api/followups/prepare', response_model=FollowupPrepareResponse)
    def followup_prepare(body: FollowupPrepareRequest, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        instant = clock() if clock is not None else datetime.now(timezone.utc)
        selection = catalogue.followup_selection(
            body.product_id, body.offer_id, body.shop_id,
            body.user_lat, body.user_lon, instant)
        return {
            'status': 'prepared',
            'product': selection['product'],
            'selected_offer': selection['offer'],
            'draft': {
                'delivery_status': 'draft_not_sent',
                'text': draft_text(selection['product'], selection['offer']),
                'contact_channel_available': False,
                'external_contact_attempted': False,
            },
            'limitations': prepare_limitations(),
            'provenance': selection['provenance'],
            'hours_evaluated_at': selection['hours_evaluated_at'],
        }

    @application.post('/api/followups/alternatives', response_model=FollowupAlternativesResponse)
    def followup_alternatives(body: FollowupAlternativesRequest, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        instant = clock() if clock is not None else datetime.now(timezone.utc)
        selection = catalogue.followup_selection(
            body.product_id, body.offer_id, body.shop_id,
            body.user_lat, body.user_lon, instant)
        budget = int(body.max_price_toman) if body.max_price_toman is not None else None

        def offer_page(limit: int, offset: int):
            return catalogue.offers(
                body.product_id, limit, offset, budget,
                body.user_lat, body.user_lon, body.max_distance_km,
                open_now_only=body.open_now_only,
                evaluated_at=instant,
                in_person_credit_only=body.in_person_credit_only,
                sort_by=body.sort_by,
                exclude_shop_id=body.shop_id,
            )

        page = offer_page(body.limit, body.offset)
        if page is None:
            raise CatalogueUnavailable('product disappeared during follow-up')
        has_alternatives = bool(page['items'])
        if not has_alternatives and body.offset > 0:
            first = offer_page(1, 0)
            has_alternatives = bool(first and first['items'])
        return {
            'status': 'alternatives_available' if has_alternatives else 'no_alternatives',
            'product_id': body.product_id,
            'reported_offer_id': body.offer_id,
            'reported_shop_id': body.shop_id,
            'excluded_offer_count': selection['shop_offer_count'],
            'outcome': {
                'kind': body.outcome,
                'source': body.outcome_source,
                'received_at': selection['hours_evaluated_at'],
                'verified_externally': False,
                'seller_confirmation': False,
            },
            'alternatives': page,
            'limitations': alternatives_limitations(
                body.outcome_source, selection['shop_offer_count'], has_alternatives),
        }

    application.include_router(voice_router)
    # API routes always win. Missing API endpoints must never return frontend HTML.
    @application.api_route('/api/{path:path}', methods=['GET', 'HEAD'], include_in_schema=False)
    def unknown_api(path: str):
        return JSONResponse(status_code=404, content={'detail': 'Not Found'})

    # Workspace navigation uses same-page history; no catch-all SPA rewrite needed.
    # Mount last so /api, /docs and /openapi.json retain their existing contracts.
    if (web / 'index.html').is_file():
        application.mount('/', StaticFiles(directory=web, html=True), name='web')
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
