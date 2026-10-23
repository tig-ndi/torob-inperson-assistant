"""Voice assistant integration using AvalAI audio APIs.

Provides Speech-to-Text (transcription) and Text-to-Speech (synthesis using gemini-3.8-flash-tts).
"""

from __future__ import annotations

import os
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

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
    if os.environ.get("TOROB_VOICE_ENABLED") != "1":
        raise HTTPException(503, "سرویس صوتی در این اجرا غیرفعال است.")
    key = os.environ.get("AVALAI_API_KEY", "").strip()
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
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (f"recording.{ext}", bytes(audio_bytes), content_type)},
                data={"model": STT_MODEL, "language": "fa"},
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise HTTPException(504, "پاسخی از سرویس رونویسی صدا دریافت نشد؛ لطفاً دوباره تلاش کنید.") from exc

    if response.status_code != 200:
        raise HTTPException(502, "سرویس صوتی پاسخ معتبر نداد؛ دوباره تلاش کنید.")

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
        raise HTTPException(502, "سرویس صوتی پاسخ معتبر نداد؛ دوباره تلاش کنید.")

    return Response(
        content=response.content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'inline; filename="assistant_voice.mp3"',
        },
    )
