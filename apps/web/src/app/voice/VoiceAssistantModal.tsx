import { useRef, useState } from 'react';
import { Dialog } from '../base/ui/primitives.tsx';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { useVoiceRecorder } from './useVoiceRecorder.ts';
import { useVoiceSpeaker } from './useVoiceSpeaker.ts';

export interface VoiceAssistantModalProps {
  disabled?: boolean;
  onClose: () => void;
  onSubmitPrompt: (text: string) => Promise<string | null>;
  currentAssistantResponse?: {
    title?: string; text: string; summary?: string; productCount?: number;
    hasResults?: boolean; onViewResults?: () => void;
  } | null;
}

export function VoiceAssistantModal({ disabled, onClose, onSubmitPrompt, currentAssistantResponse }: VoiceAssistantModalProps) {
  const [transcript, setTranscript] = useState('');
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const speaker = useVoiceSpeaker();
  const recorder = useVoiceRecorder(setTranscript);
  const close = () => { recorder.cancelRecording(); speaker.stop(); onClose(); };
  const active = recorder.state === 'recording' ? recorder.analyserSession : speaker.isPlaying ? speaker.analyserSession : null;
  const busy = recorder.state === 'transcribing' || recorder.state === 'requesting' || sending;
  const visualState = recorder.state === 'recording' ? 'listening' : busy ? 'transcribing' : speaker.isPlaying ? 'speaking' : recorder.error ? 'error' : 'idle';
  const status = recorder.state === 'recording' ? `در حال ضبط · ${new Intl.NumberFormat('fa-IR').format(recorder.duration)} ثانیه`
    : recorder.state === 'requesting' ? 'منتظر اجازهٔ میکروفون…' : recorder.state === 'transcribing' ? 'در حال تبدیل صدا به متن…'
    : sending ? 'در حال بررسی نیاز…' : speaker.isLoading ? 'در حال آماده‌سازی صدا…' : speaker.isPlaying ? 'در حال پخش پاسخ…' : 'بگویید، متن را مرور کنید و سپس بفرستید';
  const submit = async () => {
    if (disabled || busy || !transcript.trim() || submitting.current) return;
    submitting.current = true;
    setSending(true);
    const submitted = transcript.trim();
    try {
      const response = await onSubmitPrompt(submitted);
      if (response) setTranscript(value => value.trim() === submitted ? '' : value);
    }
    finally { submitting.current = false; setSending(false); }
  };
  return <Dialog title="گفت‌وگوی صوتی" onClose={close} className="uv-voice-dialog">
    <div className="uv-voice-modal">
      <p className="ub-meta">صدای ضبط‌شده برای تبدیل به متن به سرویس صوتی فرستاده می‌شود. ارسال نیاز و پخش پاسخ، اقدام‌های جدا هستند.</p>
      <section className="uv-voice-visualizer-section" aria-label="وضعیت صدا">
        <AudioVisualizer session={active} state={visualState} width={380} height={125} className="uv-voice-canvas-wrapper" />
        <p className="uv-voice-status-pill" role="status">{status}</p>
      </section>
      <div className="uv-voice-body">
        {!recorder.isSupported && <p role="status">ضبط صدا در این مرورگر در دسترس نیست؛ می‌توانید نیازتان را بنویسید.</p>}
        {recorder.error && <p role="alert" className="uv-voice-error">{recorder.error}</p>}
        {speaker.error && <p role="alert" className="uv-voice-error">{speaker.error}</p>}
        <label htmlFor="uv-voice-transcript">متن نیاز برای بررسی</label>
        <textarea id="uv-voice-transcript" maxLength={1000} rows={3} value={transcript}
          onChange={event => setTranscript(event.target.value)} placeholder="متن گفتار اینجا می‌آید؛ پیش از ارسال قابل ویرایش است." />
        <div className="uv-voice-actions-row">
          <button type="button" className="uv-voice-btn-primary" disabled={disabled || busy || !transcript.trim() || recorder.state === 'recording'} onClick={() => void submit()}>بررسی این نیاز</button>
          {transcript && <button type="button" className="uv-voice-btn-subtle" disabled={busy} onClick={() => setTranscript('')}>پاک‌کردن متن</button>}
        </div>
        {disabled && <p className="ub-meta">ارسال نیاز فعلاً در دسترس نیست؛ وضعیت دستیار را در صفحهٔ اصلی بررسی کنید.</p>}
        {currentAssistantResponse && <section className="uv-voice-card uv-voice-card--assistant" aria-label="پاسخ دستیار">
          <h3 className="uv-voice-response-title">{currentAssistantResponse.title}</h3>
          <p className="uv-voice-card-text">{currentAssistantResponse.text}</p>
          <div className="uv-voice-actions-row">
            <button type="button" className="uv-voice-pill-btn" onClick={() => speaker.isPlaying || speaker.isLoading ? speaker.stop() : void speaker.speak(currentAssistantResponse.text)}>
              {speaker.isPlaying || speaker.isLoading ? 'توقف صدا' : 'پخش صوتی پاسخ'}</button>
            {currentAssistantResponse.hasResults && currentAssistantResponse.onViewResults && <button type="button" className="uv-voice-btn-primary"
              onClick={() => { close(); currentAssistantResponse.onViewResults?.(); }}>دیدن محصولات این پاسخ</button>}
          </div>
        </section>}
      </div>
      <footer className="uv-voice-modal-footer">
        {recorder.state === 'recording'
          ? <button type="button" className="uv-voice-action-btn uv-voice-action-btn--recording" onClick={() => void recorder.stopRecording()}><span className="uv-voice-stop-square" />پایان ضبط و تبدیل به متن</button>
          : <button type="button" className="uv-voice-action-btn uv-voice-action-btn--ready" disabled={busy || !recorder.isSupported}
            onClick={() => { speaker.stop(); void recorder.startRecording(); }}>شروع ضبط صدا</button>}
        {(busy || recorder.state === 'recording') && !sending && <button type="button" className="uv-voice-btn-subtle" onClick={recorder.cancelRecording}>لغو ضبط و تبدیل</button>}
      </footer>
    </div>
  </Dialog>;
}
