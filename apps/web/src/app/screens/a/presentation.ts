import type { AssistantTurn, BatteryRequirement, NeedState, OfferSort, ReviewTopic } from '../../base/domain/contracts.ts';
import { formatMoney } from '../../base/domain/presentation.ts';

const numbers = new Intl.NumberFormat('fa-IR');

export const reviewTopicLabels: Record<ReviewTopic, string> = { camera: 'دوربین', battery: 'باتری' };

export function offerSortLabel(sort: OfferSort): string {
  return sort === 'nearest' ? 'نزدیک‌ترین فروشنده' : 'کمترین قیمت ثبت‌شده';
}

export function activeBudgetLabel(value: string | null): string {
  return value === null ? 'بدون سقف بودجه' : formatMoney(value);
}

export function batteryLabel(battery: BatteryRequirement): string {
  switch (battery.status) {
    case 'unspecified': return 'شرط باتری تعیین نشده';
    case 'awaiting_minimum': return 'حداقل ظرفیت باتری هنوز مشخص نشده';
    case 'no_minimum': return 'بدون حداقل ظرفیت باتری';
    case 'minimum': return `حداقل ${numbers.format(battery.minimum_mah ?? 0)} میلی‌آمپرساعت`;
  }
}

export function needSummary(need: NeedState): { label: string; value: string }[] {
  const budget = need.max_price_toman !== null ? formatMoney(need.max_price_toman)
    : need.budget_needs_input ? 'هنوز مشخص نشده' : 'بدون سقف بودجه';
  return [
    { label: 'موضوع', value: need.topic_query ?? 'ثبت نشده' },
    { label: 'دسته', value: need.category_cleared ? 'دسته حذف شده' : need.category_name ?? 'ثبت نشده' },
    { label: 'سقف بودجه', value: budget },
    { label: 'ترتیب آفرها', value: offerSortLabel(need.offer_sort) },
    { label: 'باتری', value: batteryLabel(need.battery_requirement) },
    { label: 'موضوع‌های بررسی', value: need.review_topics.length
      ? need.review_topics.map(topic => reviewTopicLabels[topic]).join('، ') : 'ثبت نشده' },
  ];
}

/** The contract only authorizes the unsupported label for an explicit unsupported status. */
export function pendingRequirementBadge(status: string): string | null {
  return status === 'unsupported' ? 'پشتیبانی‌نشده' : null;
}

export type AssistantOutcome =
  | { kind: 'question'; title: string; question: string; summary: null; count: null; limitations: string[]; query: string | null }
  | { kind: 'results' | 'empty'; title: string; question: null; summary: string | null; count: number; limitations: string[]; query: string | null };

export function assistantOutcome(turn: AssistantTurn): AssistantOutcome {
  if (turn.status === 'needs_input') {
    return { kind: 'question', title: 'برای ادامه به پاسخ شما نیاز است',
      question: turn.question ?? 'دستیار برای ادامه به اطلاعات بیشتری نیاز دارد.',
      summary: null, count: null, limitations: [], query: turn.query };
  }
  const limitations = turn.explanation?.limitations ?? [];
  const summary = turn.explanation?.summary ?? null;
  if (turn.status === 'results') {
    return { kind: 'results', title: 'پاسخ کاتالوگ برای این درخواست', question: null, summary,
      count: turn.products?.items.length ?? 0, limitations, query: turn.query };
  }
  return { kind: 'empty', title: 'در کاتالوگ ثبت‌شده نتیجه‌ای برنگشت', question: null, summary,
    count: 0, limitations, query: turn.query };
}
