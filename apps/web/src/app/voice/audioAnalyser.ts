/**
 * Web Audio API analyser utility for real-time voice frequency visualization.
 * Supports both microphone streams (STT) and assistant audio elements (Gemini TTS).
 */

export interface VoiceAnalyserSession {
  readonly analyser: AnalyserNode;
  readonly audioContext: AudioContext;
  readonly getFrequencies: () => Uint8Array;
  readonly getVolume: () => number;
  readonly getFrequencyBands: () => { bass: number; mid: number; treble: number };
  readonly close: () => void;
}

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function createStreamAnalyser(stream: MediaStream): VoiceAnalyserSession | null {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) return null;

  let partialContext: AudioContext | null = null;
  try {
    const audioContext = new AudioCtx();
    partialContext = audioContext;
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128; // 64 frequency bins
    analyser.smoothingTimeConstant = 0.75;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;

    // Connect source only to analyser, NOT to audioContext.destination (avoids mic echo feedback)
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const getFrequencies = () => {
      analyser.getByteFrequencyData(dataArray);
      return dataArray;
    };

    const getVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] ?? 0;
      }
      const avg = sum / (dataArray.length || 1);
      return Math.min(1, Math.max(0, avg / 128));
    };

    const getFrequencyBands = () => {
      analyser.getByteFrequencyData(dataArray);
      const total = dataArray.length;
      const bEnd = Math.floor(total * 0.2);
      const mEnd = Math.floor(total * 0.6);

      let bSum = 0;
      for (let i = 0; i < bEnd; i++) bSum += dataArray[i] ?? 0;

      let mSum = 0;
      for (let i = bEnd; i < mEnd; i++) mSum += dataArray[i] ?? 0;

      let tSum = 0;
      for (let i = mEnd; i < total; i++) tSum += dataArray[i] ?? 0;

      return {
        bass: (bSum / Math.max(1, bEnd)) / 255,
        mid: (mSum / Math.max(1, mEnd - bEnd)) / 255,
        treble: (tSum / Math.max(1, total - mEnd)) / 255,
      };
    };


    const close = () => {
      try {
        source.disconnect();
        analyser.disconnect();
        if (audioContext.state !== 'closed') {
          void audioContext.close();
        }
      } catch {
        // ignore already closed
      }
    };

    return {
      analyser,
      audioContext,
      getFrequencies,
      getVolume,
      getFrequencyBands,
      close,
    };
  } catch (err) {
    if (partialContext && partialContext.state !== 'closed') void partialContext.close();
    console.warn('Failed to initialize AudioContext analyser:', err);
    return null;
  }
}

export function createAudioElementAnalyser(audioElement: HTMLAudioElement): VoiceAnalyserSession | null {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) return null;

  let partialContext: AudioContext | null = null;
  try {
    const audioContext = new AudioCtx();
    partialContext = audioContext;
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    const source = audioContext.createMediaElementSource(audioElement);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const getFrequencies = () => {
      analyser.getByteFrequencyData(dataArray);
      return dataArray;
    };

    const getVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] ?? 0;
      return Math.min(1, Math.max(0, (sum / (dataArray.length || 1)) / 128));
    };

    const getFrequencyBands = () => {
      analyser.getByteFrequencyData(dataArray);
      const total = dataArray.length;
      const bEnd = Math.floor(total * 0.2);
      const mEnd = Math.floor(total * 0.6);

      let bSum = 0;
      for (let i = 0; i < bEnd; i++) bSum += dataArray[i] ?? 0;
      let mSum = 0;
      for (let i = bEnd; i < mEnd; i++) mSum += dataArray[i] ?? 0;
      let tSum = 0;
      for (let i = mEnd; i < total; i++) tSum += dataArray[i] ?? 0;

      return {
        bass: (bSum / Math.max(1, bEnd)) / 255,
        mid: (mSum / Math.max(1, mEnd - bEnd)) / 255,
        treble: (tSum / Math.max(1, total - mEnd)) / 255,
      };
    };


    const close = () => {
      try {
        source.disconnect();
        analyser.disconnect();
        if (audioContext.state !== 'closed') {
          void audioContext.close();
        }
      } catch {
        // ignore
      }
    };

    return {
      analyser,
      audioContext,
      getFrequencies,
      getVolume,
      getFrequencyBands,
      close,
    };
  } catch (err) {
    if (partialContext && partialContext.state !== 'closed') void partialContext.close();
    console.warn('Failed to bind MediaElement analyser:', err);
    return null;
  }
}
