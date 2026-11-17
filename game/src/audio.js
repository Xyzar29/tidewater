// audio.js — every sound is synthesized live with WebAudio: engine hum tied
// to speed, a two-tone siren, gunshots, punches, pickup chimes, a mission
// sting and a warm ambient arpeggio loop. No audio files, nothing fetched.

export function createAudio(G) {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let noiseBuf = null;
  let musicTimer = 0, musicStep = 0;
  let muted = false;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // shared noise buffer for shots / impacts
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // engine: two detuned oscillators through a lowpass, gain driven per-frame
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    // siren: triangle wave with an LFO sweeping its pitch
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.45;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.frequency.value = 830;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  function blip(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  // warm synth arpeggio: Am7 — Fmaj7 — Cmaj7 — G6, one note every 0.24 s
  const CHORDS = [
    [110.0, 164.8, 261.6, 329.6],
    [87.3, 174.6, 261.6, 349.2],
    [130.8, 196.0, 261.6, 329.6],
    [98.0, 196.0, 246.9, 392.0],
  ];

  const api = {
    init,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    engineStart() { blip(70, 0.35, 'sawtooth', 0.12, 0, 160); },
    shot(distant) { noiseBurst(0.13, distant ? 0.12 : 0.3, distant ? 900 : 2400); blip(150, 0.08, 'square', 0.1, 0, 60); },
    emptyClick() { blip(1200, 0.03, 'square', 0.06); },
    reload() { blip(500, 0.04, 'square', 0.08); blip(700, 0.04, 'square', 0.08, 0.16); blip(450, 0.05, 'square', 0.09, 0.5); },
    draw() { blip(900, 0.04, 'square', 0.05, 0, 500); },
    punch() { blip(170, 0.09, 'sine', 0.22, 0, 55); noiseBurst(0.05, 0.08, 700); },
    thud() { blip(110, 0.16, 'sine', 0.25, 0, 40); noiseBurst(0.1, 0.12, 500); },
    pickup() { blip(880, 0.07, 'sine', 0.12); blip(1318, 0.1, 'sine', 0.12, 0.06); },
    sting() {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => blip(f, 0.22, 'triangle', 0.14, i * 0.09));
    },
    fail() { blip(220, 0.3, 'triangle', 0.14, 0, 110); },
    update(dt) {
      if (G.input.pressed.has('KeyM')) {
        const m = api.toggleMute();
        G.hud.toast(m ? 'Sound off' : 'Sound on');
      }
      if (!ctx) return;
      const p = G.player;
      const t = ctx.currentTime;
      // engine follows the car you're in
      if (p && p.car && G.state.screen === 'playing') {
        const ratio = Math.abs(p.car.speed) / p.car.spec.topSpeed;
        engineGain.gain.setTargetAtTime(0.045 + ratio * 0.075, t, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + ratio * 105, t, 0.08);
        engineOsc2.frequency.setTargetAtTime(26 + ratio * 55, t, 0.08);
        engineFilter.frequency.setTargetAtTime(320 + ratio * 900, t, 0.1);
      } else {
        engineGain.gain.setTargetAtTime(0, t, 0.1);
      }
      // siren swells as the nearest cruiser closes in
      const pol = G.police;
      if (pol && pol.stars > 0 && pol.nearestDist < 75 && G.state.screen === 'playing') {
        const v = 0.028 + 0.05 * (1 - pol.nearestDist / 75);
        sirenGain.gain.setTargetAtTime(v, t, 0.15);
      } else {
        sirenGain.gain.setTargetAtTime(0, t, 0.15);
      }
      // ambient loop
      if (G.state.screen === 'playing' || G.state.screen === 'title') {
        musicTimer -= dt;
        if (musicTimer <= 0) {
          musicTimer = 0.24;
          const chord = CHORDS[Math.floor(musicStep / 4) % 4];
          const note = chord[musicStep % 4] * 2;
          blip(note, 0.34, 'sine', 0.035);
          if (musicStep % 8 === 0) blip(chord[0], 1.6, 'triangle', 0.03);
          musicStep++;
        }
      }
    },
  };
  return api;
}
