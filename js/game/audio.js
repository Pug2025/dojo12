/* Dojo 12 — sound, synthesised, no files (PLAN §7.6, §9.3).
   Most kids' phones are on silent, so every sound has a visual twin elsewhere
   and sound is treated as best effort. The context is created on the first real
   touch and resumed whenever the page comes back. */
"use strict";
D.audio = (function () {
  let ctx = null, unlocked = false;

  function enabled() { return D.state && D.state.flags && D.state.flags.sound && !D.state.flags.muted; }
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    return ctx;
  }
  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!unlocked) {
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.connect(c.destination);
      const o = c.createOscillator();
      o.connect(g); o.start(); o.stop(c.currentTime + 0.01);
      unlocked = true;
    }
  }
  function install() {
    for (const evt of ['pointerdown', 'touchend', 'click']) {
      window.addEventListener(evt, unlock, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state === 'suspended') ctx.resume();
    });
  }

  function tone(freq, dur, type, vol, delay) {
    if (!enabled()) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? 0.16 : vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sweep(from, to, dur, type, vol) {
    if (!enabled()) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sawtooth';
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol === undefined ? 0.12 : vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* A pentatonic tick that climbs with the combo, so a run has a rising line.
     The shop sells four other voices for it; none of them changes anything but
     the sound. */
  const VOICES = {
    plain: { wave: 'triangle', vol: 0.15, len: 0.11, mult: 1 },
    bell:  { wave: 'sine',     vol: 0.16, len: 0.30, mult: 2 },
    wood:  { wave: 'square',   vol: 0.09, len: 0.07, mult: 0.5 },
    glass: { wave: 'sine',     vol: 0.13, len: 0.18, mult: 3 },
    deep:  { wave: 'sawtooth', vol: 0.10, len: 0.14, mult: 0.25 },
  };
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
  function voice() {
    const worn = D.state && D.state.cosmetics ? D.state.cosmetics.equipped.sound : null;
    return VOICES[worn] || VOICES.plain;
  }
  function preview(value) {
    const v = VOICES[value] || VOICES.plain;
    tone(SCALE[2] * v.mult, v.len, v.wave, v.vol);
    tone(SCALE[4] * v.mult, v.len, v.wave, v.vol, 0.14);
  }
  function correct(combo) {
    const v = voice();
    const i = Math.min(SCALE.length - 1, Math.max(0, (combo || 1) - 1));
    tone(SCALE[i] * v.mult, v.len, v.wave, v.vol);
  }
  function miss() { sweep(180, 70, 0.19, 'square', 0.11); }

  /* Paper sounds are noise, not notes: a burst of filtered noise shaped like the
     thing that made it. The seal was three beeps (review 2026-09-24). */
  let noiseBuf = null;
  function noise(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    const n = Math.round(c.sampleRate * 0.3);
    noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // One layer: noise through a filter, a fast attack and an exponential fall.
  function burst(c, t0, type, from, to, q, vol, dur) {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise(c);
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  // The seal coming down on paper: a damped thud with a dry slap on top. The thud
  // starts with some knock between 400 and 900 Hz, because a phone's speaker plays
  // almost nothing below 300 and a pure low thud was nearly silent on one.
  // `delay` (seconds) lets the sound land with the stamp rather than when it is lifted.
  function thump(delay) {
    if (!enabled()) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const d = 0.005 + (delay || 0), t0 = c.currentTime + d;
    burst(c, t0, 'lowpass', 950, 150, 1.0, 1.1, 0.2);
    burst(c, t0, 'bandpass', 1400, 800, 1.0, 0.24, 0.06);
    tone(70, 0.11, 'sine', 0.2, d);
  }
  // A question fast once: a light pencil-and-paper tap, much quieter than the seal.
  function stamp() {
    if (!enabled()) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime + 0.005;
    burst(c, t0, 'bandpass', 2600, 1800, 1.2, 0.12, 0.045);
    burst(c, t0, 'lowpass', 500, 200, 0.7, 0.18, 0.06);
  }
  function gold() { thump(); }
  function bonus() { tone(659.25, 0.09, 'triangle', 0.14); tone(987.77, 0.09, 'triangle', 0.14, 0.08); tone(1318.51, 0.2, 'triangle', 0.13, 0.16); }
  function lastCard() { tone(392, 0.09, 'triangle', 0.12); tone(523.25, 0.16, 'triangle', 0.13, 0.08); }
  function key() { tone(1200, 0.03, 'sine', 0.05); }
  function belt() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.12));
  }

  return { install, unlock, tone, correct, preview, miss, gold, stamp, thump, bonus, lastCard, key, belt, enabled };
})();
