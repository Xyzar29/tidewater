// All sound is synthesized with WebAudio — no audio files. The context is
// created lazily on the first user gesture (the Start button), then:
//   engine  — sawtooth through a lowpass, pitch follows the car's speed
//   siren   — two-tone oscillator, audible while police are close
//   music   — a warm four-chord arpeggio loop scheduled note by note
// One-shot effects (shot, punch, pickup, sting) build tiny node graphs.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenFlip = null;
  let musicTimer = null, musicStep = 0;
  let muted = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    startMusic();
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // Warm synth loop: Am7 – Fmaj7 – Cmaj7 – G, one soft triangle note
  // every 240 ms, cycling chord tones. Quiet enough to sit under play.
  const CHORDS = [
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [130.8, 196.0, 261.6, 329.6],
    [196.0, 246.9, 293.7, 392.0],
  ];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      const chord = CHORDS[Math.floor(musicStep / 4) % 4];
      const note = chord[musicStep % 4];
      tone(note, 0.5, 'triangle', 0.045);
      if (musicStep % 4 === 0) tone(chord[0] / 2, 1.1, 'sine', 0.05);
      musicStep++;
    }, 240);
  }

  function engine(on, speedNorm) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineFilter = ctx.createBiquadFilter();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    if (!engineOsc) return;
    const t = ctx.currentTime;
    if (on) {
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 165, t, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + speedNorm * 900, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, t, 0.08);
    } else {
      engineGain.gain.setTargetAtTime(0.0, t, 0.1);
    }
  }

  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      let hi = false;
      sirenFlip = window.setInterval(() => {
        if (!sirenOsc) return;
        hi = !hi;
        sirenOsc.frequency.setValueAtTime(hi ? 960 : 660, ctx.currentTime);
      }, 380);
    }
    if (!sirenOsc) return;
    sirenGain.gain.setTargetAtTime(on ? 0.035 : 0.0, ctx.currentTime, 0.15);
    if (!on) {
      const osc = sirenOsc, flip = sirenFlip;
      sirenOsc = null; sirenFlip = null;
      window.clearInterval(flip);
      window.setTimeout(() => { try { osc.stop(); } catch (e) { /* already stopped */ } }, 600);
    }
  }

  return {
    unlock,
    engine,
    siren,
    shot() { noise(0.16, 0.5, 2600); tone(150, 0.1, 'square', 0.18, 0, 60); },
    punch() { tone(120, 0.12, 'sine', 0.4, 0, 45); noise(0.05, 0.15, 900); },
    pickup() { tone(880, 0.09, 'sine', 0.2); tone(1318, 0.14, 'sine', 0.2, 0.07); },
    success() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.09)); },
    fail() { tone(220, 0.3, 'sawtooth', 0.15, 0, 160); tone(160, 0.4, 'sawtooth', 0.15, 0.12, 110); },
    hurt() { tone(90, 0.15, 'sine', 0.35, 0, 50); },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.03);
    },
    isMuted() { return muted; },
  };
}
