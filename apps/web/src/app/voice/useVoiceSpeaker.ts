import { useCallback, useEffect, useRef, useState } from 'react';
import { synthesizeSpeech, VoiceError } from './voiceClient.ts';
import { createAudioElementAnalyser, type VoiceAnalyserSession } from './audioAnalyser.ts';

export function useVoiceSpeaker() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyserSession, setAnalyserSession] = useState<VoiceAnalyserSession | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const analyserRef = useRef<VoiceAnalyserSession | null>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortCtrl.current?.abort();
    if (analyserRef.current) {
      analyserRef.current.close();
      analyserRef.current = null;
      setAnalyserSession(null);
    }
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

    if (isPlaying) {
      stop();
      return;
    }

    stop();
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();
    abortCtrl.current = controller;

    try {
      const url = await synthesizeSpeech(clean, controller.signal);
      if (controller.signal.aborted) { URL.revokeObjectURL(url); return; }
      audioUrlRef.current = url;

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      audioRef.current = audio;

      // Connect Web Audio API Analyser for speech playback frequency dancing
      const analyser = createAudioElementAnalyser(audio);
      if (analyser) {
        analyserRef.current = analyser;
        setAnalyserSession(analyser);
      }

      audio.onended = () => {
        stop();
      };

      audio.onerror = () => {
        setError('خطا در پخش صدای دستیار.');
        stop();
      };

      await audio.play();
      if (controller.signal.aborted) return;
      setIsLoading(false);
      setIsPlaying(true);
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      const message = err instanceof VoiceError ? err.message : 'خطا در سنتز یا پخش صدای دستیار.';
      setError(message);
      stop();
    }
  }, [isPlaying, stop]);

  return {
    isPlaying,
    isLoading,
    error,
    analyserSession,
    speak,
    stop,
    clearError: () => setError(null),
  };
}
