"""Tests for voice assistant API endpoints (mocked transport, 0 provider cost)."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from apps.api.main import create_app


class VoiceApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict("os.environ", {"TOROB_VOICE_ENABLED": "1", "AVALAI_API_KEY": "test-only-no-provider-credit"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = create_app()
        self.client = TestClient(self.app)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_disabled_or_missing_key_never_calls_provider(self, mock_post):
        for values in [{"TOROB_VOICE_ENABLED": "0"}, {"AVALAI_API_KEY": ""}]:
            with patch.dict("os.environ", values):
                response = self.client.post("/api/voice/synthesize", json={"text": "سلام"})
                self.assertEqual(response.status_code, 503)
        mock_post.assert_not_called()

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_invalid_transcription_shape_is_a_gateway_error(self, mock_post):
        for payload in [[], {"text": 123}, {"text": "x" * 1001}]:
            mock_post.return_value = MagicMock(status_code=200)
            mock_post.return_value.json.return_value = payload
            response = self.client.post("/api/voice/transcribe", content=b"x" * 100, headers={"Content-Type": "audio/webm"})
            self.assertEqual(response.status_code, 502)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_unsupported_content_type_never_calls_provider(self, mock_post):
        response = self.client.post("/api/voice/transcribe", content=b"x" * 100, headers={"Content-Type": "text/html"})
        self.assertEqual(response.status_code, 415)
        mock_post.assert_not_called()

    def test_transcribe_rejects_empty_audio(self):
        response = self.client.post(
            "/api/voice/transcribe",
            content=b"",
            headers={"Content-Type": "audio/webm"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("نامعتبر یا خالی", response.json()["detail"])

    def test_transcribe_rejects_oversized_audio(self):
        # 21 MB dummy data
        oversized = b"0" * (21 * 1024 * 1024)
        response = self.client.post(
            "/api/voice/transcribe",
            content=oversized,
            headers={"Content-Type": "audio/webm"},
        )
        self.assertEqual(response.status_code, 413)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_transcribe_success_flow(self, mock_post):
        mock_resp = unittest.mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"text": "کفش ورزشی برای دویدن"}
        mock_post.return_value = mock_resp

        audio_sample = b"RIFF....WAVEfmt ...." * 10
        response = self.client.post(
            "/api/voice/transcribe",
            content=audio_sample,
            headers={"Content-Type": "audio/wav"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "کفش ورزشی برای دویدن"})

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_transcribe_provider_error(self, mock_post):
        mock_resp = unittest.mock.MagicMock()
        mock_resp.status_code = 500
        mock_resp.json.return_value = {"error": "Server error at provider"}
        mock_post.return_value = mock_resp

        audio_sample = b"mock audio payload header and chunks"
        response = self.client.post(
            "/api/voice/transcribe",
            content=audio_sample,
            headers={"Content-Type": "audio/webm"},
        )
        self.assertEqual(response.status_code, 502)

    def test_synthesize_rejects_empty_text(self):
        response = self.client.post(
            "/api/voice/synthesize",
            json={"text": "   ", "voice": "alloy"},
        )
        self.assertEqual(response.status_code, 400)

    def test_synthesize_rejects_extra_fields_and_invalid_voice(self):
        response = self.client.post(
            "/api/voice/synthesize",
            json={"text": "سلام", "voice": "invalid_voice"},
        )
        self.assertEqual(response.status_code, 422)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_synthesize_success_flow(self, mock_post):
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.content = b"fake-mp3-audio-stream"
        mock_post.return_value = mock_resp

        response = self.client.post(
            "/api/voice/synthesize",
            json={"text": "سلام، این پاسخ دستیار است.", "voice": "alloy"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/mpeg")
        self.assertEqual(response.content, b"fake-mp3-audio-stream")

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_synthesize_timeout(self, mock_post):
        mock_post.side_effect = httpx.TimeoutException("Connection timed out")

        response = self.client.post(
            "/api/voice/synthesize",
            json={"text": "متن تستی", "voice": "alloy"},
        )
        self.assertEqual(response.status_code, 504)


if __name__ == "__main__":
    unittest.main()
