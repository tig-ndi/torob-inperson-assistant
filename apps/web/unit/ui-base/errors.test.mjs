import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestFailure, assistantBlockReason } from '../../src/app/base/domain/errors.ts';
import { ApiError as ClientApiError, searchCatalogue } from '../../src/app/base/domain/client.ts';
import { ContractError } from '../../src/app/base/domain/validation.ts';

test('API status and code survive normalization and distinguish provider throttling from the configured cap', () => {
  assert.equal(ClientApiError, ApiError);
  const cap = requestFailure(new ApiError(429, 'attempt_limit'));
  assert.equal(cap.status, 429); assert.equal(cap.code, 'attempt_limit');
  assert.equal(cap.kind, 'http'); assert.equal(cap.retryable, false);
  assert.equal(assistantBlockReason(cap), 'attempt_limit');
  for (const code of ['provider_rate_limit', 'future_rate_limit', 'request_failed']) {
    const transient = requestFailure(new ApiError(429, code));
    assert.equal(transient.code, code); assert.equal(transient.retryable, true);
    assert.equal(assistantBlockReason(transient), null);
    assert.doesNotMatch(transient.message, /سقف درخواست/);
  }
});

test('disabled and configuration failures require the matching HTTP contract, not message guessing', () => {
  for (const reason of ['disabled', 'missing_key', 'invalid_config']) {
    assert.equal(assistantBlockReason(requestFailure(new ApiError(503, reason))), reason);
    assert.equal(assistantBlockReason(requestFailure(new ApiError(404, reason))), null);
    assert.equal(requestFailure(new ApiError(503, reason)).retryable, false);
  }
  assert.equal(assistantBlockReason(requestFailure(new Error('attempt_limit'))), null);
  assert.equal(requestFailure(new ApiError(502, 'provider_auth')).retryable, false);
});

test('network, contract and unexpected errors remain distinct without exposing unexpected exception text', () => {
  assert.deepEqual(requestFailure(new ApiError(0)), { kind: 'network', status: 0, code: 'network_error',
    message: 'ارتباط برقرار نشد؛ اتصال را بررسی کنید.', retryable: true });
  assert.equal(requestFailure(new ContractError()).code, 'contract_error');
  assert.equal(requestFailure(new ContractError()).retryable, false);
  const unexpected = requestFailure(new Error('PRIVATE_PAYLOAD_SENTINEL'));
  assert.equal(unexpected.kind, 'unexpected'); assert.equal(unexpected.status, null);
  assert.doesNotMatch(unexpected.message, /PRIVATE_PAYLOAD_SENTINEL/);
});

test('unknown safe error codes and prototype names cannot inject a server message', async () => {
  const original = globalThis.fetch;
  try {
    for (const code of ['future_service_failure', 'constructor', '__proto__', '<script>bad</script>']) {
      globalThis.fetch = async () => Response.json({ code, detail: 'PRIVATE_PAYLOAD_SENTINEL' }, { status: 503 });
      await assert.rejects(searchCatalogue({ query: 'گوشی', maxPrice: null }, new AbortController().signal), error => {
        const failure = requestFailure(error);
        assert.equal(typeof failure.message, 'string');
        assert.equal(failure.code, code.startsWith('<') ? 'request_failed' : code);
        assert.doesNotMatch(failure.message, /PRIVATE_PAYLOAD_SENTINEL|<script>/);
        return true;
      });
    }
  } finally { globalThis.fetch = original; }
});
