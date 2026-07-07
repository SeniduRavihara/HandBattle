// Custom Web Audio API Sound Synthesizer for Hand Cricket and Rock, Paper, Scissors

let audioCtx: AudioContext | null = null;
let isMuted = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // @ts-ignore
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const toggleMute = () => {
  isMuted = !isMuted;
  return isMuted;
};

export const getMutedState = () => {
  return isMuted;
};

// Play a short synth note
const playNote = (
  freq: number,
  type: OscillatorType,
  duration: number,
  startTime: number,
  gainStart = 0.1,
  gainEnd = 0.001
) => {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gainNode.gain.setValueAtTime(gainStart, startTime);
  gainNode.gain.exponentialRampToValueAtTime(gainEnd, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
};

export const playSound = (soundType: 'tick' | 'show' | 'out' | 'run' | 'boundary' | 'win' | 'lose' | 'click') => {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;
  const now = ctx.currentTime;

  switch (soundType) {
    case 'click':
      // Tactile UI click
      playNote(400, 'sine', 0.05, now, 0.15, 0.01);
      break;

    case 'tick':
      // Countdown tick
      playNote(600, 'sine', 0.08, now, 0.1, 0.01);
      break;

    case 'show':
      // Countdown "SHOW" (dual-tone ding)
      playNote(523.25, 'triangle', 0.3, now, 0.2, 0.01); // C5
      playNote(659.25, 'sine', 0.35, now + 0.05, 0.15, 0.01); // E5
      break;

    case 'run':
      // Run scored (classic 8-bit coin sound)
      playNote(987.77, 'sine', 0.08, now, 0.15, 0.05); // B5
      playNote(1318.51, 'sine', 0.25, now + 0.08, 0.15, 0.01); // E6
      break;

    case 'boundary': {
      // Cricket boundary fanfare arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, index) => {
        playNote(freq, 'triangle', 0.15, now + index * 0.12, 0.15, 0.01);
      });
      break;
    }

    case 'out': {
      // Wicket falling / OUT crash sound
      // 1. Noise buffer for the crash
      const bufferSize = ctx.sampleRate * 0.4; // 0.4 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1000, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.4);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      noise.start(now);
      noise.stop(now + 0.4);

      // 2. Heavy sine sweep to represent the ball hitting the wickets
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
      
      oscGain.gain.setValueAtTime(0.25, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
      break;
    }

    case 'win': {
      // Triumphant chord scale
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6
      notes.forEach((freq, index) => {
        playNote(freq, 'sine', 0.4, now + index * 0.1, 0.1, 0.01);
      });
      break;
    }

    case 'lose': {
      // Melancholic descending slide
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(293.66, now); // D4
      osc.frequency.linearRampToValueAtTime(146.83, now + 0.6); // D3
      
      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.linearRampToValueAtTime(0.001, now + 0.6);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.6);
      break;
    }
  }
};
