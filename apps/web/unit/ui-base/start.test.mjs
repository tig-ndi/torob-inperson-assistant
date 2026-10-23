import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, resumeScreen, workspaceReducer } from '../../src/app/base/state/model.ts';
import { product, offer, turn } from './fixtures.mjs';

test('home resumes the most advanced saved purchase without changing its data', () => {
  let state = initialWorkspace();
  assert.equal(resumeScreen(state), null);
  state = workspaceReducer(state, { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: 0 });
  assert.equal(resumeScreen(state), 'results');
  state = workspaceReducer(state, { type: 'product', value: product() });
  assert.equal(resumeScreen(state), 'stores');
  state = workspaceReducer(state, { type: 'selectOffer', value: offer() });
  assert.equal(resumeScreen(state), 'contact');
  state = workspaceReducer(state, { type: 'plan', primary: offer() });
  const before = structuredClone(state);
  assert.equal(resumeScreen(state), 'trip');
  assert.deepEqual(state, before);
  state = workspaceReducer(state, { type: 'navigate', screen: 'results' });
  state = workspaceReducer(state, { type: 'navigate', screen: 'home' });
  assert.equal(resumeScreen(state), 'results');
  assert.deepEqual(state.visitPlan, before.visitPlan);
});

test('a clarification resumes the conversation; a new conversation is not a new purchase', () => {
  const response = { ...turn(), status: 'needs_input', products: null, question: 'چه کاربردی؟' };
  let state = workspaceReducer(initialWorkspace(), { type: 'assistant', result: response, userMessage: 'گوشی', expectedRevision: 0 });
  assert.equal(resumeScreen(state), 'decide');
  state = workspaceReducer(state, { type: 'newConversation' });
  assert.equal(resumeScreen(state), null);
  state = workspaceReducer(state, { type: 'product', value: product() });
  state = workspaceReducer(state, { type: 'newConversation' });
  assert.equal(resumeScreen(state), 'stores');
});

test('an unsent need draft survives navigation without invalidating an in-flight turn', () => {
  const initial = initialWorkspace();
  let state = workspaceReducer(initial, { type: 'needDraft', value: 'گوشی برای عکاسی' });
  assert.equal(state.revision, initial.revision);
  assert.equal(resumeScreen(state), 'decide');
  state = workspaceReducer(state, { type: 'navigate', screen: 'results' });
  state = workspaceReducer(state, { type: 'navigate', screen: 'home' });
  assert.equal(state.needDraft, 'گوشی برای عکاسی');
  state = workspaceReducer(state, { type: 'newConversation' });
  assert.equal(state.needDraft, '');
  assert.equal(resumeScreen(state), null);
});
