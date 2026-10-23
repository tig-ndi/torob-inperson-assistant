"""Voice assistant integration using AvalAI audio APIs.

Provides Speech-to-Text (transcription) and Text-to-Speech (synthesis using gemini-3.8-flash-tts).
"""

from __future__ import annotations

import os
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

DEFAULT_AVALAI_KEY = "aa-KHxgpMAaMlSiDUWXk6AeDjBN0m93LYS1oN7eAbCA1MjQkpvi"
AVALAI_BASE_URL = os.environ.get("AVALAI_BASE_URL", "https://api.avalai.ir/v1")
TTS_MODEL = "gemini-3.8-flash-tts"
STT_MODEL = "whisper-1"

voice_router = APIRouter(prefix="/api/voice", tags=["voice"])


class SynthesizeRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str = Field(min_length=1, max_length=2000)
    voice: Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"] = "alloy"


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str


def get_api_key() -> str:
    key = os.environ.get("AVALAI_API_KEY", DEFAULT_AVALAI_KEY).strip()
    if not key:
        raise HTTPException(503, "کلید سرویس صوتی AvalAI تنظیم نشده است.")
    return key


@voice_router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: Request) -> TranscriptionResponse:
    """Transcribes user speech (audio bytes) to Persian text using AvalAI STT."""
    audio_bytes = await request.body()
    if not audio_bytes or len(audio_bytes) < 32:
        raise HTTPException(400, "دادهٔ صوتی نامعتبر یا خالی است.")
    if len(audio_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "حجم فایل صوتی بیش از حد مجاز (حداکثر ۲۰ مگابایت) است.")

    content_type = request.headers.get("content-type", "audio/webm").split(";")[0].strip()
    ext = "webm"
    if "wav" in content_type:
        ext = "wav"
    elif "mp3" in content_type or "mpeg" in content_type:
        ext = "mp3"
    elif "ogg" in content_type:
        ext = "ogg"

    api_key = get_api_key()
    url = f"{AVALAI_BASE_URL}/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (f"recording.{ext}", audio_bytes, content_type)},
                data={"model": STT_MODEL, "language": "fa"},
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise HTTPException(504, "پاسخی از سرویس رونویسی صدا دریافت نشد؛ لطفاً دوباره تلاش کنید.") from exc

    if response.status_code != 200:
        detail = "خطا در پردازش صوت در سرویس رونویسی."
        try:
            err_json = response.json()
            if isinstance(err_json, dict) and "error" in err_json:
                detail = str(err_json["error"])
        except Exception:
            pass
        raise HTTPException(502, detail)

    data = response.json()
    text = (data.get("text") or "").strip()
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
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": TTS_MODEL,
                    "input": cleaned_text,
                    "voice": body.voice,
                },
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise HTTPException(504, "تولید صوت از متن با تایم‌اوت مواجه شد.") from exc

    if response.status_code != 200:
        detail = "خطا در تولید صوت در سرویس TTS."
        try:
            err_json = response.json()
            if isinstance(err_json, dict) and "error" in err_json:
                detail = str(err_json["error"])
        except Exception:
            pass
        raise HTTPException(502, detail)

    return Response(
        content=response.content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'inline; filename="assistant_voice.mp3"',
        },
    )
