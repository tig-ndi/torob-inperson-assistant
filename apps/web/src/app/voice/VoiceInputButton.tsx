import { useEffect } from 'react';
import { useVoiceRecorder } from './useVoiceRecorder.ts';
import './voice.css';

const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const str = `${m}:${s < 10 ? '0' : ''}${s}`;
  return str.replace(/\d/g, d => faDigits[+d] ?? d);
}

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

export function VoiceInputButton({ onTranscript, disabled, className = '' }: VoiceInputButtonProps) {
  const { state, error, duration, isSupported, startRecording, stopRecording, cancelRecording, clearError } =
    useVoiceRecorder(onTranscript);

  useEffect(() => {
    if (error) {
      const tm = setTimeout(() => clearError(), 4000);
      return () => clearTimeout(tm);
    }
  }, [error, clearError]);

  if (!isSupported) {
    return null;
  }

  const handleClick = () => {
    if (state === 'recording') {
      void stopRecording();
    } else if (state === 'idle' || state === 'error') {
      void startRecording();
    }
  };

  return (
    <div className={`uv-voice-input-wrapper ${className}`}>
      <button
        type="button"
        disabled={disabled || state === 'transcribing'}
        onClick={handleClick}
        className={`uv-voice-btn ${
          state === 'recording'
            ? 'uv-voice-btn--recording'
            : state === 'transcribing'
              ? 'uv-voice-btn--transcribing'
              : ''
        }`}
        aria-pressed={state === 'recording'}
        aria-label={
          state === 'recording'
            ? `در حال ضبط صدا؛ مدت: ${formatDuration(duration)}. برای اتمام کلیک کنید.`
            : state === 'transcribing'
              ? 'در حال رونویسی صحبت شما با هوش مصنوعی…'
              : 'صحبت با دستیار صوتی ترب'
        }
      >
        {state === 'idle' && (
          <>
            <MicIcon size={17} />
            <span>گفتگوی صوتی</span>
          </>
        )}

        {state === 'recording' && (
          <>
            <div className="uv-voice-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <StopIcon size={14} />
            <span>اتمام ({formatDuration(duration)})</span>
          </>
        )}

        {state === 'transcribing' && (
          <>
            <span aria-hidden="true">⏳</span>
            <span>در حال تبدیل به متن…</span>
          </>
        )}
      </button>

      {state === 'recording' && (
        <button
          type="button"
          onClick={cancelRecording}
          className="uv-voice-btn"
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
          aria-label="لغو ضبط صدا"
        >
          لغو
        </button>
      )}

      {error && (
        <span className="uv-voice-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
