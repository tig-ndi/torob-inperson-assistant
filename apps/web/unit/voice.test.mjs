import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAudio, synthesizeSpeech, VoiceError } from '../src/app/voice/voiceClient.ts';

test('transcribeAudio posts binary blob and returns trimmed text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/voice/transcribe');
    assert.equal(init.method, 'POST');
    return {
      ok: true,
      status: 200,
      json: async () => ({ text: '   کفش ورزشی   ' }),
    };
  };

  try {
    const fakeBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const text = await transcribeAudio(fakeBlob);
    assert.equal(text, 'کفش ورزشی');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transcribeAudio throws VoiceError on failure status with detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ detail: 'فایل نامعتبر است' }),
  });

  try {
    const fakeBlob = new Blob([], { type: 'audio/webm' });
    await assert.rejects(
      async () => await transcribeAudio(fakeBlob),
      (err) => {
        assert(err instanceof VoiceError);
        assert.equal(err.message, 'فایل نامعتبر است');
        assert.equal(err.status, 400);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('synthesizeSpeech rejects empty text before calling network', async () => {
  await assert.rejects(
    async () => await synthesizeSpeech('   '),
    (err) => {
      assert(err instanceof VoiceError);
      assert.match(err.message, /خالی/);
      return true;
    }
  );
});

test('synthesizeSpeech posts text and creates an object URL', async () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;

  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/voice/synthesize');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.text, 'سلام ترب');
    assert.equal(body.voice, 'alloy');
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([10, 20])], { type: 'audio/mpeg' }),
    };
  };

  URL.createObjectURL = (blob) => 'blob:http://localhost/fake-audio-123';

  try {
    const url = await synthesizeSpeech('سلام ترب');
    assert.equal(url, 'blob:http://localhost/fake-audio-123');
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
  }
});
