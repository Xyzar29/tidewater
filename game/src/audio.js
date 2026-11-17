// audio.js — a whole soundscape from oscillators.
//
// No audio files exist in this game; every sound is synthesized with
// WebAudio at the moment it is needed: an engine hum that follows the
// player's speed, a two-tone siren while cruisers are active, gunshots,
// punches, pickup chimes, the mission-success sting, and a slow warm
// arpeggio that loops under everything like a radio left on in the sun.
// The context is created lazily and resumed on the first user gesture, and
// every entry point is guarded — a silent environment (or a browser that
// refuses) must never break the game.

export function initAudio(G) {
  const A = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineOsc2: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null,
    nextNote: 0, noteIdx: 0,
  };
  G.audio = A;

  A.ensure = () => {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.5;
      A.master.connect(A.ctx.destination);
      // Engine: two detuned oscillators through a lowpass, gain by speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc2 = A.ctx.createOscillator();
      A.engineOsc2.type = 'square';
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 320;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(A.engineFilter);
      A.engineOsc2.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start(); A.engineOsc2.start();
      // Siren: one triangle, its pitch wobbled by updateAudio.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      return true;
    } catch (e) {
      return false;
    }
  };

  A.setMuted = (m) => {
    A.muted = m;
    if (A.master && A.ctx) A.master.gain.setTargetAtTime(m ? 0 : 0.5, A.ctx.currentTime, 0.05);
  };

  // Short one-shot helpers -------------------------------------------------
  function blip(freqA, freqB, dur, type, gain, when = 0) {
    if (!A.ensure()) return;
    const t0 = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, gain, freq) {
    if (!A.ensure()) return;
    const t0 = A.ctx.currentTime;
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    const g = A.ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0);
  }

  A.shot = (far) => { noise(0.14, far ? 0.16 : 0.3, far ? 900 : 1400); blip(220, 60, 0.1, 'square', far ? 0.05 : 0.12); };
  A.punch = () => { blip(160, 50, 0.12, 'sine', 0.3); noise(0.05, 0.1, 500); };
  A.click = () => blip(900, 700, 0.05, 'square', 0.08);
  A.door = () => { blip(140, 70, 0.12, 'sine', 0.22); };
  A.pickup = () => { blip(660, 660, 0.09, 'sine', 0.16); blip(990, 990, 0.14, 'sine', 0.16, 0.08); };
  A.sting = () => { [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.22, 'triangle', 0.16, i * 0.09)); };
  A.sirenOn = false;
  A.siren = (on) => { A.sirenOn = on; };

  // Called every frame from main: engine + siren follow the world, and the
  // ambient arpeggio schedules itself a note at a time.
  A.update = (speedNorm, inCar) => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const eg = inCar ? 0.028 + speedNorm * 0.05 : 0;
    A.engineGain.gain.setTargetAtTime(eg, t, 0.09);
    const f = 48 + speedNorm * 165;
    A.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    A.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.05);
    A.engineFilter.frequency.setTargetAtTime(240 + speedNorm * 700, t, 0.1);

    A.sirenGain.gain.setTargetAtTime(A.sirenOn && !A.muted ? 0.035 : 0, t, 0.15);
    if (A.sirenOn) A.sirenOsc.frequency.setTargetAtTime(760 + Math.sin(t * 4.4) * 160, t, 0.03);

    // Ambient loop: Cmaj7 — Am7 — Fmaj7 — G, one soft note every 0.46 s.
    if (!A.muted && G.state === 'playing' && t >= A.nextNote) {
      const chords = [
        [261.6, 329.6, 493.9], [220, 261.6, 329.6],
        [174.6, 220, 349.2], [196, 246.9, 392],
      ];
      const chord = chords[Math.floor(A.noteIdx / 3) % 4];
      const freq = chord[A.noteIdx % 3] * (A.noteIdx % 6 >= 3 ? 2 : 1);
      blip(freq, freq, 0.5, 'sine', 0.045);
      A.noteIdx++;
      A.nextNote = t + 0.46;
    }
  };

  return A;
}
