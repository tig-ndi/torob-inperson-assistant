import { useVoiceSpeaker } from './useVoiceSpeaker.ts';
import './voice.css';

function SpeakerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PauseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export type VoiceSpeakerButtonProps = {
  text: string;
  className?: string;
  label?: string;
};

export function VoiceSpeakerButton({ text, className = '', label = 'شنیدن پاسخ' }: VoiceSpeakerButtonProps) {
  const { isPlaying, isLoading, error, speak, stop } = useVoiceSpeaker();

  const handleToggle = () => {
    if (isPlaying) {
      stop();
    } else {
      void speak(text);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <button
        type="button"
        disabled={isLoading || !text.trim()}
        onClick={handleToggle}
        className={`uv-voice-speaker-btn ${isPlaying ? 'uv-voice-speaker-btn--playing' : ''} ${className}`}
        aria-pressed={isPlaying}
        aria-label={isPlaying ? 'توقف پخش صدای دستیار' : `${label} با صدای طبیعی`}
      >
        {isLoading ? (
          <>
            <span aria-hidden="true">⏳</span>
            <span>در حال دریافت صوت…</span>
          </>
        ) : isPlaying ? (
          <>
            <div className="uv-voice-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <PauseIcon size={13} />
            <span>توقف</span>
          </>
        ) : (
          <>
            <SpeakerIcon size={15} />
            <span>{label}</span>
          </>
        )}
      </button>

      {error && (
        <span className="uv-voice-error" role="alert" style={{ fontSize: '0.75rem' }}>
          {error}
        </span>
      )}
    </div>
  );
}
