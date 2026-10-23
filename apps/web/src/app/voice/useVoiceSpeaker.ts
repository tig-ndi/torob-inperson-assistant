import { useCallback, useEffect, useRef, useState } from 'react';
import { synthesizeSpeech, VoiceError } from './voiceClient.ts';

export function useVoiceSpeaker() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortCtrl.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const speak = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;

    // If already playing this, toggle stop
    if (isPlaying) {
      stop();
      return;
    }

    stop();
    setIsLoading(true);
    setError(null);
    abortCtrl.current = new AbortController();

    try {
      const url = await synthesizeSpeech(clean, abortCtrl.current.signal);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        stop();
      };

      audio.onerror = () => {
        setError('پخش صدا با خطا مواجه شد.');
        stop();
      };

      await audio.play();
      setIsLoading(false);
      setIsPlaying(true);
    } catch (err: unknown) {
      if (abortCtrl.current?.signal.aborted) return;
      const message = err instanceof VoiceError ? err.message : 'خطا در تولید صدای دستیار.';
      setError(message);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [isPlaying, stop]);

  return {
    isPlaying,
    isLoading,
    error,
    speak,
    stop,
    clearError: () => setError(null),
  };
}
