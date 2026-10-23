import { useEffect, useRef } from 'react';
import type { VoiceAnalyserSession } from './audioAnalyser.ts';

export interface AudioVisualizerProps {
  session: VoiceAnalyserSession | null;
  state: 'idle' | 'listening' | 'transcribing' | 'speaking' | 'error';
  width?: number;
  height?: number;
  className?: string;
}

export function AudioVisualizer({
  session,
  state,
  width = 360,
  height = 220,
  className = '',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrame = useRef<number | null>(null);

  // Smooth interpolated volume & frequency for silky 60fps animations
  const smoothVolume = useRef(0);
  const phase = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      phase.current += 0.04;
      const currentPhase = phase.current;

      // Read real audio data if session is active
      let rawVol = 0;
      let freqs: Uint8Array | null = null;
      let bands = { bass: 0, mid: 0, treble: 0 };

      if (session && (state === 'listening' || state === 'speaking')) {
        rawVol = session.getVolume();
        freqs = session.getFrequencies();
        bands = session.getFrequencyBands();
      }

      // Smooth volume interpolation (lerp)
      const targetVol = state === 'transcribing' ? 0.35 : state === 'listening' || state === 'speaking' ? rawVol : 0.08;
      smoothVolume.current += (targetVol - smoothVolume.current) * 0.18;
      const vol = smoothVolume.current;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // 1. Ambient Background Glow
      const glowGrad = ctx.createRadialGradient(
        cx, cy, 10,
        cx, cy, Math.max(50, 75 + vol * 80)
      );
      if (state === 'listening') {
        glowGrad.addColorStop(0, `rgba(224, 40, 71, ${0.28 + vol * 0.45})`);
        glowGrad.addColorStop(0.5, `rgba(244, 63, 94, ${0.12 + vol * 0.25})`);
        glowGrad.addColorStop(1, 'rgba(224, 40, 71, 0)');
      } else if (state === 'speaking') {
        glowGrad.addColorStop(0, `rgba(99, 102, 241, ${0.32 + vol * 0.45})`);
        glowGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.15 + vol * 0.25})`);
        glowGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
      } else if (state === 'transcribing') {
        glowGrad.addColorStop(0, 'rgba(168, 85, 247, 0.35)');
        glowGrad.addColorStop(0.6, 'rgba(236, 72, 153, 0.15)');
        glowGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(148, 163, 184, 0.12)');
        glowGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
      }
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Central Pulsating Orb / Core
      const baseRadius = 38;
      const orbRadius = baseRadius + vol * 30 + Math.sin(currentPhase * 2) * 3;

      const orbGrad = ctx.createRadialGradient(
        cx - orbRadius * 0.25, cy - orbRadius * 0.25, 2,
        cx, cy, orbRadius
      );
      if (state === 'listening') {
        orbGrad.addColorStop(0, '#ff758f');
        orbGrad.addColorStop(0.5, '#e02847');
        orbGrad.addColorStop(1, '#9f1239');
      } else if (state === 'speaking') {
        orbGrad.addColorStop(0, '#67e8f9');
        orbGrad.addColorStop(0.5, '#6366f1');
        orbGrad.addColorStop(1, '#3730a3');
      } else if (state === 'transcribing') {
        orbGrad.addColorStop(0, '#f472b6');
        orbGrad.addColorStop(0.5, '#a855f7');
        orbGrad.addColorStop(1, '#6b21a8');
      } else {
        orbGrad.addColorStop(0, '#cbd5e1');
        orbGrad.addColorStop(1, '#64748b');
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.shadowBlur = 18 + vol * 28;
      ctx.shadowColor = state === 'listening' ? '#e02847' : state === 'speaking' ? '#6366f1' : '#a855f7';
      ctx.fill();
      ctx.restore();

      // 3. Rotating Orbital Ring in Transcribing Mode
      if (state === 'transcribing') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(currentPhase * 1.5);
        ctx.beginPath();
        ctx.arc(0, 0, orbRadius + 14, 0, Math.PI * 1.4);
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, orbRadius + 22, Math.PI, Math.PI * 2.3);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.75)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }

      // 4. Real-time Frequency Spectrum Bars / Waveform
      const barCount = 36;
      const barWidth = 3;
      const barGap = 4;
      const totalSpan = barCount * (barWidth + barGap);
      const startX = cx - totalSpan / 2;
      const bottomY = height - 26;

      ctx.save();
      for (let i = 0; i < barCount; i++) {
        const x = startX + i * (barWidth + barGap);

        // Map bar index to frequency array (mirrored around center for visual balance)
        const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
        const freqIdx = Math.floor((1 - distFromCenter) * ((freqs?.length || 32) * 0.75));

        let magnitude = 0;
        if (freqs && freqs.length > freqIdx) {
          const val = freqs[freqIdx] ?? 0;
          magnitude = (val / 255) * (0.8 + vol * 0.8);
        } else {

          // Subtle idle oscillation
          magnitude = 0.08 + Math.sin(currentPhase * 3 + i * 0.3) * 0.06;
        }

        const barHeight = Math.max(4, magnitude * 64);
        const y = bottomY - barHeight;

        // Gradient for bars
        const barGrad = ctx.createLinearGradient(x, y, x, bottomY);
        if (state === 'listening') {
          barGrad.addColorStop(0, '#f43f5e');
          barGrad.addColorStop(1, 'rgba(224, 40, 71, 0.25)');
        } else if (state === 'speaking') {
          barGrad.addColorStop(0, '#06b6d4');
          barGrad.addColorStop(1, 'rgba(99, 102, 241, 0.25)');
        } else {
          barGrad.addColorStop(0, 'rgba(148, 163, 184, 0.6)');
          barGrad.addColorStop(1, 'rgba(148, 163, 184, 0.1)');
        }

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        // Rounded bar top
        ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }
      ctx.restore();

      // 5. Flowing Multi-Layer Harmonic Sine Waves
      const waveCount = state === 'listening' || state === 'speaking' ? 3 : 1;
      for (let w = 0; w < waveCount; w++) {
        ctx.save();
        ctx.beginPath();
        const wavePhase = currentPhase * (w === 0 ? 1.8 : w === 1 ? -1.4 : 2.2);
        const waveAmp = (12 + vol * 38) * (1 - w * 0.25);
        const waveColor = state === 'listening'
          ? (w === 0 ? 'rgba(244, 63, 94, 0.65)' : w === 1 ? 'rgba(251, 113, 133, 0.45)' : 'rgba(224, 40, 71, 0.3)')
          : state === 'speaking'
            ? (w === 0 ? 'rgba(6, 182, 212, 0.7)' : w === 1 ? 'rgba(99, 102, 241, 0.5)' : 'rgba(168, 85, 247, 0.3)')
            : 'rgba(148, 163, 184, 0.25)';

        ctx.strokeStyle = waveColor;
        ctx.lineWidth = w === 0 ? 2.5 : 1.5;

        for (let x = 0; x <= width; x += 4) {
          // Gaussian envelope to keep wave peaks near the center orb
          const normX = (x - cx) / (width * 0.45);
          const envelope = Math.exp(-normX * normX * 1.8);

          // Sine modulation affected by bass & treble
          const freqMod = 0.02 + bands.treble * 0.015;
          const y = cy + Math.sin(x * freqMod + wavePhase + w * 0.8) * waveAmp * envelope;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      animFrame.current = requestAnimationFrame(render);
    };

    animFrame.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrame.current !== null) {
        cancelAnimationFrame(animFrame.current);
      }
    };
  }, [session, state, width, height]);

  return (
    <div className={`uv-visualizer-canvas-container ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
        aria-hidden="true"
      />
    </div>
  );
}
