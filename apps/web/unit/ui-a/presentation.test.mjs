import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantBody } from '../../src/app/base/domain/client.ts';
import { conversationInput } from '../../src/app/base/state/conversation.ts';
import { initialWorkspace } from '../../src/app/base/state/model.ts';
import { activeBudgetLabel, assistantOutcome, batteryLabel, needSummary, pendingRequirementBadge } from '../../src/app/screens/a/presentation.ts';

const fa = new Intl.NumberFormat('fa-IR');
const requestId = '00000000-0000-4000-8000-000000000001';
function needState(overrides = {}) {
  return { version: 1, topic_query: 'گوشی', category_name: 'گوشی موبایل', category_cleared: false,
    max_price_toman: null, budget_needs_input: false, offer_sort: 'price',
    battery_requirement: { status: 'unspecified', minimum_mah: null }, review_topics: ['camera'],
    pending_requirements: [], ...overrides };
}

test('active budget keeps null, zero, and large exact money distinct', () => {
  assert.equal(activeBudgetLabel(null), 'بدون سقف بودجه');
  assert.equal(activeBudgetLabel('0'), '۰ تومان');
  assert.notEqual(activeBudgetLabel('0'), activeBudgetLabel(null));
  assert.equal(activeBudgetLabel('9007199254740993'), `${fa.format(9007199254740993n)} تومان`);
});

test('need summary preserves budget uncertainty, battery states, and topic labels', () => {
  const unknownBudget = Object.fromEntries(needSummary(needState({ budget_needs_input: true })).map(row => [row.label, row.value]));
  assert.equal(unknownBudget['سقف بودجه'], 'هنوز مشخص نشده');
  const openBudget = Object.fromEntries(needSummary(needState()).map(row => [row.label, row.value]));
  assert.equal(openBudget['سقف بودجه'], 'بدون سقف بودجه');
  assert.equal(openBudget['موضوع‌های بررسی'], 'دوربین');
  const cleared = Object.fromEntries(needSummary(needState({ category_name: null, category_cleared: true,
    max_price_toman: '0', offer_sort: 'nearest', review_topics: ['camera', 'battery'],
    battery_requirement: { status: 'minimum', minimum_mah: 5000 } })).map(row => [row.label, row.value]));
  assert.equal(cleared['دسته'], 'دسته حذف شده');
  assert.equal(cleared['سقف بودجه'], '۰ تومان');
  assert.equal(cleared['ترتیب آفرها'], 'نزدیک‌ترین فروشنده');
  assert.equal(cleared['باتری'], `حداقل ${fa.format(5000)} میلی‌آمپرساعت`);
  assert.equal(cleared['موضوع‌های بررسی'], 'دوربین، باتری');
  assert.equal(batteryLabel({ status: 'awaiting_minimum', minimum_mah: null }), 'حداقل ظرفیت باتری هنوز مشخص نشده');
  assert.equal(batteryLabel({ status: 'no_minimum', minimum_mah: null }), 'بدون حداقل ظرفیت باتری');
});

test('the unsupported badge is claimed only for the contract-declared status', () => {
  assert.equal(pendingRequirementBadge('unsupported'), 'پشتیبانی‌نشده');
  assert.equal(pendingRequirementBadge('applied'), null);
  assert.equal(pendingRequirementBadge(''), null);
});

test('assistant outcome keeps the display question, never its technical code', () => {
  const question = assistantOutcome({ request_id: requestId, status: 'needs_input', query: null, category_name: null,
    max_price_toman: null, question: 'سقف بودجه‌تان چقدر است؟', question_code: 'internal_budget_check', products: null,
    need_state: needState(), offer_sort: 'price', battery_requirement: { status: 'unspecified', minimum_mah: null }, explanation: null });
  assert.equal(question.kind, 'question');
  assert.equal(question.question, 'سقف بودجه‌تان چقدر است؟');
  assert.equal(question.question?.includes('internal_budget_check'), false);
  assert.equal(question.title, 'برای ادامه به پاسخ شما نیاز است');

  const results = assistantOutcome({ request_id: requestId, status: 'results', query: 'گوشی', category_name: 'گوشی موبایل',
    max_price_toman: '10000000', question: null, question_code: null, products: { items: [{}, {}] },
    need_state: needState(), offer_sort: 'price', battery_requirement: { status: 'unspecified', minimum_mah: null },
    explanation: { summary: 'خلاصهٔ ثبت‌شده', limitations: ['موجودی تأیید نشده'] } });
  assert.equal(results.kind, 'results');
  assert.equal(results.count, 2);
  assert.equal(results.summary, 'خلاصهٔ ثبت‌شده');
  assert.deepEqual(results.limitations, ['موجودی تأیید نشده']);

  const empty = assistantOutcome({ request_id: requestId, status: 'no_evidence', query: 'گوشی', category_name: null,
    max_price_toman: null, question: null, question_code: null, products: { items: [] },
    need_state: needState(), offer_sort: 'price', battery_requirement: { status: 'unspecified', minimum_mah: null }, explanation: null });
  assert.equal(empty.kind, 'empty');
  assert.equal(empty.count, 0);
  assert.equal(empty.title, 'در کاتالوگ ثبت‌شده نتیجه‌ای برنگشت');
});

test('a form budget edit overrides exactly and keeps complete conversation state', () => {
  const state = { ...initialWorkspace(), needState: needState({ max_price_toman: '10000000' }),
    filters: { ...initialWorkspace().filters, maxPrice: '9007199254740993' },
    history: [{ role: 'user', content: 'گوشی' }, { role: 'assistant', content: 'سقف بودجه‌تان چقدر است؟' }] };
  const body = assistantBody(conversationInput(state, 'بله'), requestId);
  assert.equal(body.max_price_toman, '9007199254740993');
  assert.equal(body.context_need_state.max_price_toman, '10000000');
  assert.equal(body.messages.length, 3);
  assert.equal(body.messages[0].content, 'گوشی');
  assert.equal(body.messages[2].content, 'بله');
  assert.equal(state.history.length, 2);
  state.filters.maxPrice = '10000000';
  assert.equal(Object.hasOwn(assistantBody(conversationInput(state, 'همان بودجه'), requestId), 'max_price_toman'), false);
  state.filters.maxPrice = null;
  assert.equal(assistantBody(conversationInput(state, 'بدون سقف'), requestId).max_price_toman, null);
});
