// audio.js — every sound in TIDEWATER is synthesized with WebAudio: there
// are no audio files. A tiny synth engine hum follows the player's speed,
// a two-tone siren fades in with the nearest cruiser, and a warm arpeggio
// loops underneath everything as ambient music.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.noteIndex = 0;
  }

  // Browsers only allow audio after a gesture — call from the start button.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: a detuned saw pair through a lowpass, gain tied to speed.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this.engineFilter = engineFilter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Siren: a triangle wave whose pitch the update loop wobbles.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Per-frame: engine pitch/gain from speed, siren gain from police range.
  update(dt, speedRatio, nearestPoliceDist, time) {
    if (!this.ctx) return;
    const eg = Math.min(0.16, Math.abs(speedRatio) * 0.16);
    this.engineGain.gain.setTargetAtTime(eg, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speedRatio) * 130, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(280 + Math.abs(speedRatio) * 700, this.ctx.currentTime, 0.1);
    let sg = 0;
    if (nearestPoliceDist < 90) sg = 0.05 * (1 - nearestPoliceDist / 90);
    this.sirenGain.gain.setTargetAtTime(sg, this.ctx.currentTime, 0.15);
    if (sg > 0.003) {
      this.sirenOsc.frequency.value = 700 + Math.sin(time * 5.2) * 180;
    }
  }

  blip(freq, dur, type, gain, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noiseBurst(dur, gain, freq) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  gunshot() { this.noiseBurst(0.16, 0.5, 900); }
  punch() { this.blip(120, 0.12, 'sine', 0.5); this.noiseBurst(0.06, 0.2, 400); }
  pickup() { this.blip(880, 0.1, 'sine', 0.3); this.blip(1320, 0.16, 'sine', 0.3, 0.07); }
  sting() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.blip(f, 0.28, 'triangle', 0.3, i * 0.09));
  }
  fail() { this.blip(220, 0.3, 'sawtooth', 0.2); this.blip(160, 0.42, 'sawtooth', 0.2, 0.14); }
  click() { this.blip(660, 0.06, 'square', 0.12); }

  // A slow warm arpeggio (A minor pentatonic) as the ambient loop.
  startMusic() {
    const scale = [220, 261.63, 329.63, 392, 523.25, 392, 329.63, 261.63];
    const step = () => {
      if (this.ctx && !this.muted) {
        const f = scale[this.noteIndex % scale.length];
        this.blip(f, 0.6, 'sine', 0.055);
        this.blip(f / 2, 0.8, 'triangle', 0.04);
      }
      this.noteIndex++;
    };
    step();
    this.musicTimer = setInterval(step, 460);
  }
}
