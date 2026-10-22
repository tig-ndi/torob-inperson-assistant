import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationInput } from '../../src/app/base/state/conversation.ts';
import { initialWorkspace } from '../../src/app/base/state/model.ts';
import { assistantBody } from '../../src/app/base/domain/client.ts';
import { needState, requestId } from './fixtures.mjs';

test('form budget edit overrides only budget while carrying the full need state', () => {
  const state = { ...initialWorkspace(), needState: { ...needState(), max_price_toman: '10' },
    filters: { ...initialWorkspace().filters, maxPrice: '20' } };
  const body = assistantBody(conversationInput(state, 'همان گوشی'), requestId);
  assert.equal(body.max_price_toman, '20'); assert.equal(body.context_need_state.max_price_toman, '10');
  assert.deepEqual(body.context_need_state.review_topics, ['camera']);
});
test('an unchanged budget is omitted, clearing one is explicit null', () => {
  const state = { ...initialWorkspace(), needState: needState() };
  assert.equal(Object.hasOwn(assistantBody(conversationInput(state, 'گوشی'), requestId), 'max_price_toman'), false);
  state.needState.max_price_toman = '10';
  assert.equal(assistantBody(conversationInput(state, 'گوشی'), requestId).max_price_toman, null);
});
test('bounded history drops whole old pairs, never the fresh message or final need state', () => {
  const state = { ...initialWorkspace(), needState: needState(), history: [
    { role: 'user', content: 'a'.repeat(900) }, { role: 'assistant', content: 'b'.repeat(900) },
    { role: 'user', content: 'c'.repeat(900) }, { role: 'assistant', content: 'd'.repeat(900) }] };
  const input = conversationInput(state, 'e'.repeat(900));
  assert.equal(input.messages.length, 3); assert.equal(input.messages[0].content, 'c'.repeat(900));
  assert.equal(input.needState, state.needState);
});
