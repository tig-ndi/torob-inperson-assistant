import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio, VoiceError } from './voiceClient.ts';

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

export function useVoiceRecorder(onTranscript?: (text: string) => void) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    !!window.navigator?.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorder.current = null;
    chunks.current = [];
    setDuration(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      abortCtrl.current?.abort();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
      setState('error');
      return;
    }

    try {
      cleanup();
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunks.current.push(event.data);
        }
      };

      recorder.start(250);
      setState('recording');
      setDuration(0);

      timer.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      cleanup();
      const message = err instanceof Error && err.name === 'NotAllowedError'
        ? 'دسترسی به میکروفون داده نشد؛ لطفاً اجازهٔ میکروفون را فعال کنید.'
        : 'امکان اتصال به میکروفون وجود ندارد.';
      setError(message);
      setState('error');
    }
  }, [cleanup, isSupported]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setState('idle');
      return null;
    }

    setState('transcribing');
    abortCtrl.current = new AbortController();

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunks.current, { type: mimeType });
        cleanup();

        if (audioBlob.size < 100) {
          setError('صدایی دریافت نشد؛ لطفاً دوباره صحبت کنید.');
          setState('error');
          resolve(null);
          return;
        }

        try {
          const text = await transcribeAudio(audioBlob, abortCtrl.current?.signal);
          if (text) {
            onTranscript?.(text);
            setState('idle');
            resolve(text);
          } else {
            setError('متنی از صحبت شما تشخیص داده نشد.');
            setState('error');
            resolve(null);
          }
        } catch (err: unknown) {
          const message = err instanceof VoiceError ? err.message : 'خطا در تبدیل گفتار به متن.';
          setError(message);
          setState('error');
          resolve(null);
        }
      };

      recorder.stop();
    });
  }, [cleanup, onTranscript]);

  const cancelRecording = useCallback(() => {
    abortCtrl.current?.abort();
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    cleanup();
    setState('idle');
    setError(null);
  }, [cleanup]);

  return {
    state,
    error,
    duration,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: () => setError(null),
  };
}
