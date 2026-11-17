// TIDEWATER — WebAudio synth: engine, siren, shots, chimes, ambient loop.

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.master = null;
    this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; this.sirenGain = null;
    this.musicTimer = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // engine hum
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain); this.engineGain.connect(this.master); this.engineOsc.start();
      // siren
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
      this._music();
    } catch (e) { /* audio optional */ }
  }
  _music() {
    // warm chord pad loop
    const notes = [261.6, 329.6, 392.0, 329.6];
    let i = 0;
    const play = () => {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = notes[i % notes.length] / 2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0, t + 2.4);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 2.6); i++;
    };
    play(); this.musicTimer = setInterval(play, 2400);
  }
  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const target = driving && !this.muted ? 0.05 + Math.abs(speedRatio) * 0.06 : 0;
    this.engineGain.gain.value += (target - this.engineGain.gain.value) * 0.2;
    this.engineOsc.frequency.value = 50 + Math.abs(speedRatio) * 110;
  }
  setSiren(active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.value = active && !this.muted ? 0.035 : 0;
    if (active) this.sirenOsc.frequency.value = 650 + Math.sin(t * 6) * 220;
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  gunshot() { this.blip(160, 0.14, 'sawtooth', 0.25); this.blip(60, 0.1, 'square', 0.2); }
  punch() { this.blip(110, 0.1, 'sine', 0.25); }
  pickup() { this.blip(880, 0.12, 'sine', 0.15); setTimeout(() => this.blip(1320, 0.16, 'sine', 0.15), 70); }
  success() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.18), i * 110)); }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
}
