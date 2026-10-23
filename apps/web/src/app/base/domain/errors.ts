import type { RequestFailure } from './contracts.ts';
import { ContractError } from './validation.ts';

const messages: Record<number, string> = {
  404: 'این کالا یا آفر در کاتالوگ پیدا نشد؛ انتخاب را دوباره بررسی کنید.',
  409: 'کالا، آفر و فروشگاه با هم منطبق نیستند؛ دوباره انتخاب کنید.',
  422: 'ورودی یا شرایط جست‌وجو معتبر نیست؛ فیلترها را بررسی کنید.',
  429: 'تعداد درخواست‌ها موقتاً محدود شده است؛ کمی بعد دوباره اقدام کنید.',
  503: 'سرویس فعلاً در دسترس نیست؛ دوباره تلاش کنید.',
  504: 'پاسخ سرویس طول کشید؛ ارسال دوباره فقط با انتخاب شما انجام می‌شود.',
};
const codeMessages: Record<string, string> = {
  attempt_limit: 'سقف درخواست‌های تنظیم‌شدهٔ دستیار تمام شده است؛ جست‌وجوی مستقیم همچنان کار می‌کند.',
  disabled: 'دستیار در این اجرا غیرفعال است؛ جست‌وجوی مستقیم همچنان کار می‌کند.',
  missing_key: 'کلید سرویس دستیار تنظیم نشده است؛ جست‌وجوی مستقیم همچنان کار می‌کند.',
  invalid_config: 'تنظیمات سرویس دستیار معتبر نیست؛ جست‌وجوی مستقیم همچنان کار می‌کند.',
  provider_rate_limit: 'سرویس مدل موقتاً تعداد درخواست‌ها را محدود کرده است؛ کمی بعد با انتخاب خودتان دوباره اقدام کنید.',
  provider_auth: 'دسترسی سرویس مدل تأیید نشد؛ تنظیمات اتصال نیاز به بررسی دارد.',
  provider_model_mismatch: 'مدل پاسخ‌دهنده با تنظیمات دستیار هم‌خوان نیست؛ اتصال سرویس نیاز به بررسی دارد.',
  invalid_output: 'پاسخ دستیار قابل اعتبارسنجی نبود؛ نتیجهٔ تازه‌ای ثبت نشد.',
  incomplete_output: 'پاسخ دستیار کامل دریافت نشد؛ نتیجهٔ تازه‌ای ثبت نشد.',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code = 'request_failed') {
    const safeCode = /^[a-z_]{1,60}$/.test(code) ? code : 'request_failed';
    super((Object.hasOwn(codeMessages, safeCode) ? codeMessages[safeCode] : undefined) ?? messages[status] ?? (status === 0
      ? 'ارتباط برقرار نشد؛ اتصال را بررسی کنید.' : 'درخواست انجام نشد؛ دوباره تلاش کنید.'));
    this.name = 'ApiError'; this.status = status; this.code = safeCode;
  }
}

export function requestFailure(error: unknown): RequestFailure {
  if (error instanceof ApiError) {
    return { kind: error.status === 0 ? 'network' : 'http', status: error.status,
      code: error.status === 0 ? 'network_error' : error.code, message: error.message,
      retryable: (error.status === 0 || error.status === 429 || error.status >= 500) &&
        !['attempt_limit', 'disabled', 'missing_key', 'invalid_config', 'provider_auth', 'provider_model_mismatch'].includes(error.code) };
  }
  if (error instanceof ContractError) return { kind: 'contract', status: null, code: 'contract_error', message: error.message, retryable: false };
  return { kind: 'unexpected', status: null, code: 'unexpected_error', message: 'درخواست انجام نشد؛ خطای غیرمنتظره‌ای رخ داد.', retryable: false };
}

export function assistantBlockReason(failure: RequestFailure | null): 'disabled' | 'missing_key' | 'invalid_config' | 'attempt_limit' | null {
  if (failure?.kind !== 'http') return null;
  if (failure.status === 429 && failure.code === 'attempt_limit') return 'attempt_limit';
  if (failure.status === 503 && (failure.code === 'disabled' || failure.code === 'missing_key' || failure.code === 'invalid_config')) return failure.code;
  return null;
}
