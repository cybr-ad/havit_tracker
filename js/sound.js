/**
 * HAVIT PRO — Sound FX Synthesizer (Web Audio API)
 * Procedural audio generation without external sound assets.
 */

class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTick() {
    if (!this.enabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playComplete() {
    if (!this.enabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Harmonious major triad chime
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.06);

      gain.gain.setValueAtTime(0.18, now + index * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.06);
      osc.stop(now + index * 0.06 + 0.35);
    });
  }

  playAlarmTone() {
    if (!this.enabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Urgent yet melodic double-pulse alarm chime
    const pulseTones = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1174.66, start: 0.14, dur: 0.18 },
      { freq: 880, start: 0.40, dur: 0.12 },
      { freq: 1174.66, start: 0.54, dur: 0.25 }
    ];

    pulseTones.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now + p.start);

      gain.gain.setValueAtTime(0.22, now + p.start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + p.start + p.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + p.start);
      osc.stop(now + p.start + p.dur);
    });
  }

  playUntick() {
    if (!this.enabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.07);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }
}

window.soundEngine = new SoundEngine();
