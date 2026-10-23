import { useEffect, useRef, useState } from 'react';
import type { Offer, FollowupOutcome } from '../../base/domain/contracts.ts';
import { Button, Badge } from '../../base/ui/primitives.tsx';
import { formatMoney } from '../../base/domain/presentation.ts';
import { shopName } from './model.ts';

type CallScenario = 'out_of_stock' | 'available' | 'no_answer' | 'closed';

interface SmartCallSimulatorProps {
  offer: Offer;
  productTitle?: string | null;
  onOutcomeResolved: (outcome: FollowupOutcome, source: 'simulated') => void;
  onConfirmedAvailable: () => void;
}

export function SmartCallSimulator({
  offer,
  productTitle,
  onOutcomeResolved,
  onConfirmedAvailable,
}: SmartCallSimulatorProps) {
  const safeProductTitle = productTitle || 'کالای مورد نظر';
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'connected' | 'completed'>('idle');
  const [scenario, setScenario] = useState<CallScenario>('out_of_stock');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const dialogTimeoutRef = useRef<number | null>(null);

  const shopTitle = shopName(offer);
  const priceDisplay = formatMoney(offer.price_toman);

  const clearAllTimers = () => {
    stopRingtone();
    if (ringTimeoutRef.current !== null) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (dialogTimeoutRef.current !== null) {
      clearTimeout(dialogTimeoutRef.current);
      dialogTimeoutRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Web Audio Ringtone generator
  const startRingtone = () => {
    if (audioMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(425, ctx.currentTime);
      osc2.frequency.setValueAtTime(450, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);

      // Ring pulse: 1.2s tone, 2s silence
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0, now + 1.2);
      gain.gain.setValueAtTime(0.08, now + 2.5);
      gain.gain.setValueAtTime(0, now + 3.7);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(now + 4);
      osc2.stop(now + 4);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const stopRingtone = () => {
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // Ignore
      }
      audioCtxRef.current = null;
    }
  };

  const completeCall = () => {
    clearAllTimers();
    setCallState('completed');
    if (scenario === 'out_of_stock') {
      onOutcomeResolved('out_of_stock', 'simulated');
    } else if (scenario === 'closed') {
      onOutcomeResolved('closed', 'simulated');
    } else if (scenario === 'no_answer') {
      onOutcomeResolved('no_answer', 'simulated');
    }
  };

  const startCall = () => {
    clearAllTimers();
    setCallState('ringing');
    setTimerSeconds(0);
    startRingtone();

    // After 3.2 seconds of ringing, connect or handle no_answer
    ringTimeoutRef.current = window.setTimeout(() => {
      stopRingtone();
      if (scenario === 'no_answer') {
        completeCall();
      } else {
        setCallState('connected');
        // Start duration timer
        timerIntervalRef.current = window.setInterval(() => {
          setTimerSeconds(s => s + 1);
        }, 1000);

        // Auto-complete after 7.5 seconds of conversation
        dialogTimeoutRef.current = window.setTimeout(() => {
          completeCall();
        }, 7500);
      }
    }, 3200);
  };

  const cancelCall = () => {
    clearAllTimers();
    setCallState('idle');
    setTimerSeconds(0);
  };

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  const formatTimer = (total: number) => {
    const mins = Math.floor(total / 60).toString().padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <article className="uv-smart-call-card" aria-label="شبیه‌ساز تماس هوشمند با فروشنده">
      <div className="uv-smart-call-head">
        <div className="uv-smart-call-avatar" aria-hidden="true">
          <span className="uv-call-pulse-ring" />
          📞
        </div>
        <div className="uv-smart-call-info">
          <h4>تماس هوشمند با فروشگاه</h4>
          <p className="ub-meta">{shopTitle} · ۰۲۱-۸۸****** (شمارهٔ شبیه‌سازی‌شده)</p>
          <Badge tone="warning">شبیه‌سازی ایجنت ترب — آزمایشی</Badge>
        </div>
      </div>

      {callState === 'idle' && (
        <div className="uv-call-idle">
          <p className="uv-call-desc">
            دستیار هوشمند به‌صورت شبیه‌سازی‌شده با فروشگاه تماس گرفته و موجودی کالا و قیمت قطعی روز را استعلام می‌کند:
          </p>

          <div className="uv-scenario-selector">
            <label htmlFor="uv-scenario-choice">سناریوی شبیه‌سازی استعلام:</label>
            <select
              id="uv-scenario-choice"
              value={scenario}
              onChange={e => setScenario(e.target.value as CallScenario)}
            >
              <option value="out_of_stock">۱. اعلام عدم موجودی (آزمون استعلام و پیشنهاد جایگزین)</option>
              <option value="available">۲. تأیید موجودی و قیمت قطعی (مراجعه حضوری)</option>
              <option value="no_answer">۳. عدم پاسخگویی فروشگاه (بوق اشغال/بی‌پاسخ)</option>
              <option value="closed">۴. فروشگاه تعطیل یا خارج از ساعت کاری</option>
            </select>
          </div>

          <div className="uv-call-actions">
            <Button onClick={startCall}>
              📞 برقراری تماس هوشمند جهت استعلام
            </Button>
            <Button
              tone="ghost"
              onClick={() => setAudioMuted(m => !m)}
              aria-label={audioMuted ? 'روشن کردن صدای تماس' : 'بی‌صدا کردن تماس'}
            >
              {audioMuted ? '🔇 صدا خاموش' : '🔊 صدای زنگ فعال'}
            </Button>
          </div>
        </div>
      )}

      {callState === 'ringing' && (
        <div className="uv-call-ringing" role="status" aria-live="polite">
          <div className="uv-ringing-indicator">
            <span className="uv-ring-pulse" />
            <span className="uv-ring-pulse uv-ring-pulse--delay" />
          </div>
          <strong className="uv-ringing-text">در حال شماره‌گیری و زنگ زدن به {shopTitle}…</strong>
          <p className="ub-meta">استعلام صوتی توسط دستیار هوشمند ترب</p>
          <Button tone="secondary" onClick={cancelCall}>قطع تماس</Button>
        </div>
      )}

      {callState === 'connected' && (
        <div className="uv-call-connected" role="region" aria-label="مکالمه زنده تماس تلفنی">
          <div className="uv-call-timer">
            <span className="uv-live-dot" />
            <span>تماس برقرار شد · {formatTimer(timerSeconds)}</span>
          </div>

          <div className="uv-call-dialogue">
            <div className="uv-dialogue-msg uv-dialogue-msg--agent">
              <span className="uv-dialogue-sender">دستیار هوشمند ترب:</span>
              <p>«سلام، وقت بخیر. از دستیار خرید حضوری ترب تماس می‌گیرم. می‌خواستم موجودی و قیمت امروز «{safeProductTitle}» با قیمت حدودی {priceDisplay} رو استعلام بگیرم، موجود دارید؟»</p>
            </div>

            <div className="uv-dialogue-msg uv-dialogue-msg--seller">
              <span className="uv-dialogue-sender">متصدی فروشگاه ({shopTitle}):</span>
              {scenario === 'out_of_stock' && (
                <p>«سلام، شرمنده این مدل رو همین نیم‌ساعت پیش آخرین دانه‌ش فروش رفت و الان موجود نداریم.»</p>
              )}
              {scenario === 'available' && (
                <p>«سلام، بله این مدل با گارانتی اصلی در فروشگاه موجوده و پلمپ تحویل می‌دیم. تا ساعت کاری می‌تونید حضوری تشریف بیارید.»</p>
              )}
              {scenario === 'closed' && (
                <p>«فروشگاه در حال حاضر بسته است. ساعات کاری ثبت‌شده در روزهای کاری از ساعت ۱۰ صبح است.»</p>
              )}
            </div>
          </div>

          <div className="uv-call-footer">
            <Button onClick={completeCall}>اتمام مکالمه و دیدن نتیجه</Button>
            <Button tone="ghost" onClick={cancelCall}>قطع تماس</Button>
          </div>
        </div>
      )}

      {callState === 'completed' && (
        <div className="uv-call-completed" role="region" aria-label="نتیجه استعلام تماس">
          {scenario === 'out_of_stock' && (
            <div className="uv-result-box uv-result-box--warning">
              <h5>❌ کالا در این فروشگاه موجود نبود</h5>
              <p className="ub-meta">
                متصدی فروشگاه اعلام کرد کالا موجود نیست. دستیار هوشمند بلافاصله فروشگاه‌های جایگزین دارای این محصول را در کادر زیر برای شما بارگذاری کرد.
              </p>
            </div>
          )}

          {scenario === 'available' && (
            <div className="uv-result-box uv-result-box--success">
              <h5>✅ موجودی و شرایط خرید تأیید شد</h5>
              <p className="ub-meta">
                فروشگاه کالا را با قیمت اعلامی موجود دارد. می‌توانید مستقیماً به مرحلهٔ مراجعه رفته و برنامه سفر خود را ثبت کنید.
              </p>
              <Button onClick={onConfirmedAvailable}>
                ثبت قطعی و رفتن به برنامهٔ مراجعه
              </Button>
            </div>
          )}

          {scenario === 'no_answer' && (
            <div className="uv-result-box uv-result-box--warning">
              <h5>📞 فروشگاه پاسخگو نبود</h5>
              <p className="ub-meta">
                تماس برقرار نشد یا خط اشغال بود. می‌توانید فروشگاه‌های جایگزین نزدیک را در کادر زیر بررسی کنید.
              </p>
            </div>
          )}

          {scenario === 'closed' && (
            <div className="uv-result-box uv-result-box--warning">
              <h5>🔒 فروشگاه در حال حاضر بسته است</h5>
              <p className="ub-meta">
                فروشگاه خارج از ساعات کاری اعلام‌شده است. فروشگاه‌های باز دیگر در زیر پیشنهاد شدند.
              </p>
            </div>
          )}

          <div className="uv-completed-actions">
            <Button tone="secondary" onClick={() => setCallState('idle')}>
              تماس مجدد یا تغییر سناریو
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
