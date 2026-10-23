/** Client for backend voice transcription (STT) and Gemini TTS synthesis. */

export class VoiceError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'VoiceError';
    this.status = status;
  }
}

export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'audio/webm',
    },
    body: blob,
    signal,
  });

  if (!response.ok) {
    let detail = 'خطا در تبدیل گفتار به متن.';
    try {
      const err = await response.json();
      if (typeof err.detail === 'string') detail = err.detail;
    } catch {
      // ignore json parse error
    }
    throw new VoiceError(detail, response.status);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string' || data.text.length > 1000) {
    throw new VoiceError('پاسخ رونویسی معتبر نیست.');
  }
  return data.text.trim();
}

export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<string> {
  const clean = text.trim();
  if (!clean) throw new VoiceError('متن برای تبدیل به گفتار خالی است.');

  const response = await fetch('/api/voice/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: clean, voice: 'alloy' }),
    signal,
  });

  if (!response.ok) {
    let detail = 'خطا در تولید صدای دستیار.';
    try {
      const err = await response.json();
      if (typeof err.detail === 'string') detail = err.detail;
    } catch {
      // ignore json parse error
    }
    throw new VoiceError(detail, response.status);
  }

  const audioBlob = await response.blob();
  return URL.createObjectURL(audioBlob);
}
