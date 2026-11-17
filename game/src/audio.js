// audio.js — every sound in Port Serena is synthesized live with WebAudio:
// engine hum tied to speed, a two-tone siren, gunshots, punches, pickups,
// mission stings and a warm ambient arpeggio. No audio files, ever.
import { S } from './config.js';

let ctx = null, master = null, noiseBuf = null;
let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;
let ambientOn = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ctx.createGain();
  master.gain.value = S.muted ? 0 : 0.5;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
  const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start();

  sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 760;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.65;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 190;
  lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency); lfo.start();
  sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start();

  if (!ambientOn) { ambientOn = true; scheduleAmbient(); }
}

function scheduleAmbient() {
  // A slow warm arpeggio that loops quietly while Mari is out in the city.
  const notes = [220.0, 277.18, 329.63, 440.0, 329.63, 277.18];
  let step = 0;
  setInterval(() => {
    if (!ctx || S.muted || S.screen === 'title') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = notes[step % notes.length];
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.5);
    step++;
  }, 620);
}

export function setMuted(m) {
  S.muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.03);
}

export function updateAudio(g) {
  if (!ctx) return;
  const info = g.player.info();
  const inCar = !!S.inCar;
  const frac = inCar ? Math.min(1, Math.abs(info.speed) / 30) : 0;
  engineOsc.frequency.setTargetAtTime(52 + frac * 165, ctx.currentTime, 0.06);
  engineGain.gain.setTargetAtTime(inCar && S.screen === 'playing' ? 0.028 + frac * 0.075 : 0, ctx.currentTime, 0.09);
  const pd = g.police.nearestDist();
  const siren = (S.wanted > 0 && pd < 58 && S.screen === 'playing') ? Math.max(0, 0.05 * (1 - pd / 58)) : 0;
  sirenGain.gain.setTargetAtTime(siren, ctx.currentTime, 0.12);
}

function blip(freqA, freqB, dur, type, vol) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freqA, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export function sfx(name) {
  if (!ctx || S.muted) return;
  const t = ctx.currentTime;
  if (name === 'gunshot') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + 0.18);
    blip(160, 50, 0.1, 'square', 0.12);
  } else if (name === 'punch') {
    blip(190, 55, 0.09, 'square', 0.2);
  } else if (name === 'empty') {
    blip(1200, 900, 0.04, 'square', 0.08);
  } else if (name === 'pickup') {
    blip(880, 880, 0.07, 'sine', 0.16);
    setTimeout(() => blip(1318, 1318, 0.1, 'sine', 0.16), 65);
  } else if (name === 'sting') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      setTimeout(() => blip(f, f, 0.34, 'triangle', 0.18), i * 95));
  } else if (name === 'busted') {
    blip(392, 392, 0.16, 'triangle', 0.2);
    setTimeout(() => blip(311, 311, 0.3, 'triangle', 0.2), 150);
  } else if (name === 'click') {
    blip(660, 660, 0.05, 'sine', 0.1);
  }
}
