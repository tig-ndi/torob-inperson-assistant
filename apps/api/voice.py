"""Voice assistant integration using AvalAI audio APIs.

Provides Speech-to-Text (transcription) and Text-to-Speech (synthesis using gemini-3.8-flash-tts).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

AVALAI_BASE_URL = os.environ.get("AVALAI_BASE_URL", "https://api.avalai.ir/v1")
TTS_MODEL = "gemini-3.8-flash-tts"
STT_MODEL = "whisper-1"
# Preserve the existing client voice choices using Gemini prebuilt voice names.
GEMINI_VOICES = {
    "alloy": "Zephyr", "echo": "Puck", "fable": "Charon",
    "onyx": "Fenrir", "nova": "Kore", "shimmer": "Aoede",
}


def voice_settings():
    # Keep direct uvicorn launches consistent with run-local.ps1. An explicit
    # environment value (including an empty one) always wins over the file.
    values={}
    root=Path(__file__).resolve().parents[2]
    for name in ('.env.local','.env'):
        path=root/name
        if not path.is_file():continue
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key,sep,value=line.partition('=')
            if sep and key.strip() in {'TOROB_VOICE_ENABLED','AVALAI_API_KEY'}:
                values[key.strip()]=value.strip().strip('\"\'')
    return (os.environ.get('TOROB_VOICE_ENABLED',values.get('TOROB_VOICE_ENABLED','0')).strip(),
            os.environ.get('AVALAI_API_KEY',values.get('AVALAI_API_KEY','')).strip())


def check_provider_status(response: httpx.Response) -> None:
    status = response.status_code
    if status == 200:
        return
    if status in (401, 403):
        raise HTTPException(502, "کلید AvalAI معتبر نیست یا به مدل صوتی دسترسی ندارد؛ تنظیمات حساب را بررسی کنید.")
    if status == 402:
        raise HTTPException(502, "اعتبار حساب AvalAI برای درخواست صوتی کافی نیست؛ موجودی و دسترسی مدل صوتی را در حساب بررسی کنید.")
    if status == 429:
        # AvalAI uses HTTP 429 for both billing and temporary rate limits.
        # Only interpret documented codes; never expose upstream messages,
        # which can contain credentials or private provider diagnostics.
        try:
            payload = response.json()
        except ValueError:
            payload = None
        error = payload.get('error') if isinstance(payload, dict) else None
        code = (error.get('code') or error.get('type')) if isinstance(error, dict) else None
        if code in ('quota_exceeded', 'insufficient_quota'):
            raise HTTPException(502, "اعتبار حساب AvalAI متصل به کلید صوتی کافی نیست. موجودی همان حساب را در بخش صورتحساب AvalAI بررسی و شارژ کنید؛ افزایش تعداد درخواست در .env این مشکل را رفع نمی‌کند. پس از شارژ، خودتان دوباره پخش یا ضبط را بزنید؛ تکرار خودکار انجام نمی‌شود.")
        if code == 'rate_limit_exceeded':
            retry_after = response.headers.get('retry-after', '')
            wait = f" حدود {int(retry_after)} ثانیه صبر کنید؛" if isinstance(retry_after, str) and retry_after.isascii() and retry_after.isdigit() and len(retry_after) <= 4 and 0 < int(retry_after) <= 3600 else ''
            raise HTTPException(502, f"سقف نرخ درخواست صوتی AvalAI موقتاً پر شده است؛{wait} سپس خودتان دوباره تلاش کنید. این پاسخ به‌معنای تمام‌شدن اعتبار نیست. تکرار خودکار انجام نمی‌شود.")
        raise HTTPException(502, "سرویس AvalAI درخواست صوتی را به‌دلیل سقف نرخ یا سهمیه نپذیرفت؛ سهمیهٔ حساب و مدل را بررسی کنید و سپس دوباره بزنید. تکرار خودکار انجام نمی‌شود.")
    if status in (400,404,422):
        raise HTTPException(502,"مدل یا قالب صوت در AvalAI پذیرفته نشد؛ دسترسی مدل صوتی حساب را بررسی کنید. سقف درخواست دستیار متنی روی صوت اثری ندارد.")
    raise HTTPException(502, "سرویس صوتی پاسخ معتبر نداد؛ دوباره تلاش کنید.")

voice_router = APIRouter(prefix="/api/voice", tags=["voice"])


@voice_router.get('/status')
def voice_status():
    enabled,key=voice_settings()
    key_present=bool(key)
    return {'ready': enabled == '1' and key_present, 'reason': 'invalid_toggle' if enabled not in ('0', '1') else 'disabled' if enabled != '1' else 'missing_key' if not key_present else 'configured','quota_managed_by':'AvalAI'}


class SynthesizeRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str = Field(min_length=1, max_length=2000)
    voice: Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"] = "alloy"


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str


def get_api_key() -> str:
    enabled,key=voice_settings()
    if enabled != "1":
        raise HTTPException(503, "سرویس صوتی در این اجرا غیرفعال است.")
    if not key:
        raise HTTPException(503, "کلید سرویس صوتی AvalAI تنظیم نشده است.")
    return key


@voice_router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: Request) -> TranscriptionResponse:
    """Transcribes user speech (audio bytes) to Persian text using AvalAI STT."""
    audio_bytes = bytearray()
    async for chunk in request.stream():
        if len(audio_bytes) + len(chunk) > 20 * 1024 * 1024:
            raise HTTPException(413, "حجم فایل صوتی بیش از ۲۰ مگابایت است.")
        audio_bytes.extend(chunk)
    if not audio_bytes or len(audio_bytes) < 32:
        raise HTTPException(400, "دادهٔ صوتی نامعتبر یا خالی است.")

    content_type = request.headers.get("content-type", "audio/webm").split(";")[0].strip()
    extensions = {"audio/webm": "webm", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/mp4": "mp4"}
    if content_type not in extensions:
        raise HTTPException(415, "نوع فایل صوتی پشتیبانی نمی‌شود.")
    ext = extensions[content_type]

    api_key = get_api_key()
    url = f"{AVALAI_BASE_URL}/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=35.0,trust_env=False,follow_redirects=False) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (f"recording.{ext}", bytes(audio_bytes), content_type)},
                data={"model": STT_MODEL, "language": "fa"},
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise HTTPException(504, "پاسخی از سرویس رونویسی صدا دریافت نشد؛ لطفاً دوباره تلاش کنید.") from exc

    check_provider_status(response)

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(502, "پاسخ رونویسی معتبر نیست.") from exc
    if not isinstance(data, dict) or not isinstance(data.get("text"), str) or len(data["text"]) > 1000:
        raise HTTPException(502, "پاسخ رونویسی معتبر نیست.")
    text = data["text"].strip()
    return TranscriptionResponse(text=text)


@voice_router.post("/synthesize")
async def synthesize_speech(body: SynthesizeRequest) -> Response:
    """Synthesizes Persian text into speech using AvalAI gemini-3.8-flash-tts."""
    cleaned_text = body.text.strip()
    if not cleaned_text:
        raise HTTPException(400, "متن ورودی برای تبدیل به گفتار خالی است.")

    api_key = get_api_key()
    url = f"{AVALAI_BASE_URL}/audio/speech"

    try:
        async with httpx.AsyncClient(timeout=35.0,trust_env=False,follow_redirects=False) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": TTS_MODEL,
                    "input": cleaned_text,
                    "voice": {"name": GEMINI_VOICES[body.voice], "languageCode": "fa-IR"},
                    "response_format": "mp3",
                },
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise HTTPException(504, "تولید صوت از متن با تایم‌اوت مواجه شد.") from exc

    check_provider_status(response)

    media_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if media_type not in {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4"} or len(response.content) < 32:
        raise HTTPException(502, "فایل صوتی معتبر از سرویس دریافت نشد.")
    extension = {"audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a"}.get(media_type, "mp3")
    return Response(
        content=response.content,
        media_type=media_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="assistant_voice.{extension}"',
        },
    )
