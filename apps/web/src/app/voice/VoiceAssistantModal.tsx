import { useEffect, useState } from 'react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { useVoiceRecorder } from './useVoiceRecorder.ts';
import { useVoiceSpeaker } from './useVoiceSpeaker.ts';
import { CloseIcon, SearchIcon, RefreshIcon } from '../../presentation/icons-motion/icons.tsx';


export interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt: (text: string) => Promise<string | null>;
  currentAssistantResponse?: {
    title?: string;
    text: string;
    summary?: string;
    productCount?: number;
    hasResults?: boolean;
    onViewResults?: () => void;
  } | null;
}

export function VoiceAssistantModal({
  isOpen,
  onClose,
  onSubmitPrompt,
  currentAssistantResponse,
}: VoiceAssistantModalProps) {
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [modalState, setModalState] = useState<'idle' | 'listening' | 'transcribing' | 'speaking' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('روی میکروفون بزنید و نیاز خرید خود را بگویید');
  const [isMinimized, setIsMinimized] = useState(false);

  const speaker = useVoiceSpeaker();

  const recorder = useVoiceRecorder((transcript) => {
    setSpokenTranscript(transcript);
  });

  // Sync internal modalState with recorder & speaker
  useEffect(() => {
    if (recorder.state === 'recording') {
      setModalState('listening');
      setStatusMessage('در حال شنیدن صدای شما...');
    } else if (recorder.state === 'transcribing') {
      setModalState('transcribing');
      setStatusMessage('در حال رونویسی و تحلیل هوشمند نیاز با هوش مصنوعی...');
    } else if (speaker.isPlaying) {
      setModalState('speaking');
      setStatusMessage('دستیار صوتی ترب در حال پاسخ...');
    } else if (modalState !== 'error' && recorder.state === 'idle' && !speaker.isLoading) {
      setModalState('idle');
      setStatusMessage('روی میکروفون بزنید و نیاز خرید خود را بگویید');
    }
  }, [recorder.state, speaker.isPlaying, speaker.isLoading, modalState]);

  // Handle speaker errors
  useEffect(() => {
    if (speaker.error) {
      setStatusMessage(speaker.error);
    }
  }, [speaker.error]);

  // Handle recorder errors
  useEffect(() => {
    if (recorder.error) {
      setModalState('error');
      setStatusMessage(recorder.error);
    }
  }, [recorder.error]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        recorder.cancelRecording();
        speaker.stop();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, recorder, speaker]);

  if (!isOpen) return null;

  // Active audio analyser session for reactive visualization
  const activeSession = recorder.state === 'recording'
    ? recorder.analyserSession
    : speaker.isPlaying
      ? speaker.analyserSession
      : null;

  const handleStartListening = async () => {
    speaker.stop();
    setSpokenTranscript('');
    await recorder.startRecording();
  };

  const handleStopListening = async () => {
    const text = await recorder.stopRecording();
    if (text) {
      setSpokenTranscript(text);
      setModalState('transcribing');
      setStatusMessage('در حال بررسی کاتالوگ فروشگاه‌های تهران...');
      const responseText = await onSubmitPrompt(text);
      if (responseText) {
        setModalState('speaking');
        void speaker.speak(responseText);
      }
    }
  };

  const handleReplaySpeaker = () => {
    if (currentAssistantResponse?.text) {
      void speaker.speak(currentAssistantResponse.text);
    }
  };

  const quickPrompts = [
    'لپ‌تاپ ایسوس تا ۵۰ میلیون در ولیعصر',
    'گوشی شیائومی نوت ۱۳ پرو پلاس بازار چارسو',
    'هدفون سونی با نویز کنسلینگ فعال',
  ];

  // Minimized floating pill mode
  if (isMinimized) {
    return (
      <aside className="uv-voice-dock" aria-label="دستیار صوتی کوچک‌شده">
        <button
          type="button"
          className={`uv-voice-dock-btn uv-voice-dock-btn--${modalState}`}
          onClick={() => setIsMinimized(false)}
          title="بازگشت به دستیار صوتی"
        >
          <span className="uv-voice-dock-pulse" aria-hidden="true" />
          <span className="uv-voice-dock-icon">🎙️</span>
          <span className="uv-voice-dock-text">
            {modalState === 'listening' ? 'در حال شنیدن...' : modalState === 'speaking' ? 'در حال پاسخ...' : 'دستیار صوتی'}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <div className="uv-voice-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="uv-voice-modal-title">
      <div className="uv-voice-modal">
        {/* Header */}
        <header className="uv-voice-modal-header">
          <div className="uv-voice-header-info">
            <span className="uv-voice-badge-ai">هوش مصنوعی صوتی</span>
            <h2 id="uv-voice-modal-title" className="uv-voice-modal-title">
              دستیار صوتی خرید حضوری ترب
            </h2>
          </div>
          <div className="uv-voice-header-actions">
            <button
              type="button"
              className="uv-voice-icon-btn"
              onClick={() => setIsMinimized(true)}
              title="کوچک‌کردن و ادامهٔ جست‌وجو روی نقشه"
              aria-label="کوچک‌کردن پنجره"
            >
              ⤓
            </button>
            <button
              type="button"
              className="uv-voice-icon-btn"
              onClick={() => {
                recorder.cancelRecording();
                speaker.stop();
                onClose();
              }}
              title="بستن دستیار صوتی"
              aria-label="بستن"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Dynamic Visualizer Section with Reactive Frequency Spectrum */}
        <section className="uv-voice-visualizer-section">
          <AudioVisualizer
            session={activeSession}
            state={modalState}
            width={380}
            height={200}
            className="uv-voice-canvas-wrapper"
          />

          {/* Status Message Pill */}
          <div className={`uv-voice-status-pill uv-voice-status-pill--${modalState}`}>
            <span className="uv-voice-status-indicator" />
            <span>{statusMessage}</span>
            {recorder.state === 'recording' && (
              <span className="uv-voice-timer-badge">{recorder.duration} ثانیه</span>
            )}
          </div>
        </section>

        {/* Content & Response Display */}
        <div className="uv-voice-body">
          {spokenTranscript && (
            <div className="uv-voice-card uv-voice-card--user">
              <span className="uv-voice-card-label">گفتار شما:</span>
              <p className="uv-voice-card-text">{spokenTranscript}</p>
            </div>
          )}

          {currentAssistantResponse && (
            <div className="uv-voice-card uv-voice-card--assistant">
              <div className="uv-voice-card-header">
                <span className="uv-voice-card-label">پاسخ ایجنت ترب:</span>
                {currentAssistantResponse.text && (
                  <button
                    type="button"
                    className="uv-voice-pill-btn"
                    onClick={speaker.isPlaying ? speaker.stop : handleReplaySpeaker}
                  >
                    {speaker.isPlaying ? '⏹️ توقف صدا' : '🔊 بازخوانی صدا'}
                  </button>
                )}
              </div>
              {currentAssistantResponse.title && (
                <h3 className="uv-voice-response-title">{currentAssistantResponse.title}</h3>
              )}
              <p className="uv-voice-card-text">{currentAssistantResponse.text}</p>
              {currentAssistantResponse.summary && (
                <p className="uv-voice-response-summary">{currentAssistantResponse.summary}</p>
              )}

              {currentAssistantResponse.hasResults && currentAssistantResponse.onViewResults && (
                <div className="uv-voice-actions-row">
                  <button
                    type="button"
                    className="uv-voice-btn-primary"
                    onClick={() => {
                      currentAssistantResponse.onViewResults?.();
                      onClose();
                    }}
                  >
                    <SearchIcon />
                    مشاهدهٔ {currentAssistantResponse.productCount ? `${currentAssistantResponse.productCount} کالا` : 'محصولات'} در نقشه و کاتالوگ
                  </button>
                </div>
              )}
            </div>
          )}

          {modalState === 'idle' && !spokenTranscript && !currentAssistantResponse && (
            <div className="uv-voice-suggestions">
              <p className="uv-voice-suggestions-title">می‌توانید به عنوان نمونه بگویید:</p>
              <div className="uv-voice-tags">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="uv-voice-tag-btn"
                    onClick={() => {
                      setSpokenTranscript(prompt);
                      void (async () => {
                        setModalState('transcribing');
                        setStatusMessage('در حال جست‌وجوی کالا و فروشگاه‌ها...');
                        const responseText = await onSubmitPrompt(prompt);
                        if (responseText) {
                          setModalState('speaking');
                          void speaker.speak(responseText);
                        }
                      })();
                    }}
                  >
                    «{prompt}»
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Voice Action Controls */}
        <footer className="uv-voice-modal-footer">
          {recorder.state === 'recording' ? (
            <button
              type="button"
              className="uv-voice-action-btn uv-voice-action-btn--recording"
              onClick={handleStopListening}
              aria-label="پایان صحبت و ارسال"
            >
              <span className="uv-voice-stop-square" />
              <span>پایان صحبت و پردازش</span>
            </button>
          ) : (
            <button
              type="button"
              className="uv-voice-action-btn uv-voice-action-btn--ready"
              onClick={handleStartListening}
              disabled={modalState === 'transcribing'}
              aria-label="شروع صحبت با میکروفون"
            >
              <span className="uv-voice-mic-icon">🎙️</span>
              <span>{modalState === 'speaking' ? 'طرح سؤال صوتی جدید' : 'شروع گفت‌وگوی صوتی'}</span>
            </button>
          )}

          {(spokenTranscript || currentAssistantResponse) && (
            <button
              type="button"
              className="uv-voice-btn-subtle"
              onClick={() => {
                speaker.stop();
                recorder.cancelRecording();
                setSpokenTranscript('');
                setModalState('idle');
                setStatusMessage('روی میکروفون بزنید و نیاز خرید خود را بگویید');
              }}
              title="شروع مجدد گفت‌وگو"
            >
              <RefreshIcon />
              <span>پاک‌کردن</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
