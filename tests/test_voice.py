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
        mock_resp.content = b"fake-mp3-audio-stream" * 3
        mock_resp.headers = {"content-type": "audio/mpeg"}
        mock_post.return_value = mock_resp

        response = self.client.post(
            "/api/voice/synthesize",
            json={"text": "سلام، این پاسخ دستیار است.", "voice": "alloy"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/mpeg")
        self.assertEqual(response.content, b"fake-mp3-audio-stream" * 3)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "gemini-3.8-flash-tts")
        self.assertEqual(payload["voice"], {"name": "Zephyr", "languageCode": "fa-IR"})
        self.assertEqual(payload["response_format"], "mp3")

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_synthesize_rejects_successful_json_or_empty_audio(self, mock_post):
        for mime, data in [("application/json", b'{"error":"not audio"}' * 4), ("audio/mpeg", b"")]:
            mock_post.return_value = MagicMock(status_code=200, headers={"content-type": mime}, content=data)
            response = self.client.post("/api/voice/synthesize", json={"text": "سلام"})
            self.assertEqual(response.status_code, 502)
            self.assertIn("فایل صوتی معتبر", response.json()["detail"])

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_provider_auth_and_credit_errors_are_actionable_and_redacted(self, mock_post):
        for status, phrase in [(401, "کلید AvalAI"), (403, "کلید AvalAI"), (402, "اعتبار"), (429, "سقف")]:
            mock_post.return_value = MagicMock(status_code=status, text="private-upstream-debug")
            response = self.client.post("/api/voice/synthesize", json={"text": "سلام"})
            self.assertEqual(response.status_code, 502)
            self.assertIn(phrase, response.json()["detail"])
            self.assertNotIn("private-upstream-debug", response.text)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_429_credit_codes_identify_billing_in_both_audio_flows_without_retry(self, mock_post):
        for code in ('quota_exceeded', 'insufficient_quota'):
            for endpoint in ('synthesize', 'transcribe'):
                mock_post.reset_mock()
                mock_post.return_value = httpx.Response(429, json={'error': {
                    'code': code, 'message': 'private test-only-no-provider-credit',
                }})
                response = (self.client.post('/api/voice/synthesize', json={'text': 'سلام'})
                            if endpoint == 'synthesize' else self.client.post(
                                '/api/voice/transcribe', content=b'x' * 100,
                                headers={'Content-Type': 'audio/webm'}))
                self.assertEqual(response.status_code, 502)
                self.assertIn('اعتبار حساب AvalAI', response.json()['detail'])
                self.assertIn('افزایش تعداد درخواست', response.json()['detail'])
                self.assertNotIn('private', response.text)
                self.assertNotIn('test-only-no-provider-credit', response.text)
                self.assertEqual(mock_post.call_count, 1)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_429_rate_limit_has_bounded_wait_and_no_credit_diagnosis_or_retry(self, mock_post):
        for retry_after in ('30', '99999999999999999', 'private-value'):
            mock_post.reset_mock()
            mock_post.return_value = httpx.Response(429, headers={'retry-after': retry_after},
                json={'error': {'code': 'rate_limit_exceeded'}})
            response = self.client.post('/api/voice/synthesize', json={'text': 'سلام'})
            self.assertEqual(response.status_code, 502)
            self.assertIn('موقتاً', response.json()['detail'])
            self.assertNotIn('شارژ', response.text)
            self.assertNotIn('private-value', response.text)
            self.assertEqual('30 ثانیه' in response.json()['detail'], retry_after == '30')
            self.assertEqual(mock_post.call_count, 1)

    @patch("apps.api.voice.httpx.AsyncClient.post")
    def test_unrecognized_429_is_not_reported_as_proven_credit_failure(self, mock_post):
        for body in (b'<html>private-debug</html>', b'[]', b'{"error":"private-debug"}',
                     b'{"error":{"code":"unknown","message":"private-debug"}}'):
            mock_post.return_value = httpx.Response(429, content=body)
            response = self.client.post('/api/voice/synthesize', json={'text': 'سلام'})
            self.assertEqual(response.status_code, 502)
            self.assertIn('سقف نرخ یا سهمیه', response.json()['detail'])
            self.assertNotIn('private-debug', response.text)
            self.assertNotIn('شارژ', response.text)

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


class VoiceConfigTests(unittest.TestCase):
    def test_direct_server_launch_reads_voice_file_without_exposing_key(self):
        from apps.api.voice import voice_status,get_api_key
        import json
        with patch.dict('os.environ',{},clear=True),patch('apps.api.voice.Path.is_file',return_value=True),patch('apps.api.voice.Path.read_text',return_value='TOROB_VOICE_ENABLED=1\nAVALAI_API_KEY="test-file-key"\n'):
            self.assertTrue(voice_status()['ready'])
            self.assertEqual(get_api_key(),'test-file-key')
            self.assertNotIn('test-file-key',json.dumps(voice_status()))
    def test_explicit_environment_disable_wins_over_voice_file(self):
        from apps.api.voice import voice_status
        with patch.dict('os.environ',{'TOROB_VOICE_ENABLED':'0'},clear=True),patch('apps.api.voice.Path.is_file',return_value=True),patch('apps.api.voice.Path.read_text',return_value='TOROB_VOICE_ENABLED=1\nAVALAI_API_KEY=test-file-key\n'):
            self.assertFalse(voice_status()['ready'])
