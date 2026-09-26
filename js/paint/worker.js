/* Dojo 12 — paints the day's painting off the main thread (PLAN §15, 2026-09-26), so the end of a
   round never stalls while the brush works. It keeps the sheet between calls, so each round paints
   only its new part. It holds two sheets, the one it painted last and the one before, so painting
   another day (a book page painted again, the picture of another day) never throws away the sheet
   the next round paints on.

   Measured in Chrome 153 on 2026-09-26 over one child's next thirty days, with the CPU throttled 4x
   as a stand-in for an older iPhone (on the page thread, with the same code: Chrome cannot throttle
   a worker): a round's part took 16 to 47 ms at the median and 286 ms at most, the day's first round
   (the composition and the paper as well) 205 ms at the median, a whole painting 374 ms at the median
   and 807 ms at most (a chrysanthemum). The worker's own trip adds about a millisecond, and while it
   paints the page never missed a frame. From nothing on a cold start the heaviest days took just
   over a second, so the painter paints today's painting ahead once the page loads (painter.js).

   in:  { id, date, name, rounds, stage, ink }   stage 0..rounds; ink the paper's ink colour (hex)
   out: { id, ok, w, h, px, caption, family, seal, stages, seed }   px: RGBA, the ink with its density
        in alpha, ready for a canvas laid over the paper; seed: the painting's seed, which picks the
        part of the washi sheet its picture is cut from; or { id, ok: false, error } */
"use strict";
importScripts('brush.js', 'scenes.js');

const HOLD = 2;
const held = [];   // [{ key, scene, state }], the one painted last at the end
function sheetFor(m, rounds) {
  // the name as the composer reads it, so "Sam" and "sam " share a sheet as they share a painting
  const key = m.date + '|' + String(m.name || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + rounds;
  const i = held.findIndex(h => h.key === key);
  const h = i >= 0 ? held.splice(i, 1)[0]
    : { key: key, scene: D.paintScenes.forDay(m.date, m.name, { rounds: rounds }), state: {} };
  held.push(h);
  if (held.length > HOLD) held.shift();
  return h;
}

self.onmessage = e => {
  const m = e.data || {};
  try {
    const rounds = Math.max(1, m.rounds | 0);
    const h = sheetFor(m, rounds);
    const sc = h.scene;
    const stage = Math.max(0, Math.min(sc.stages.length, m.stage | 0));
    const upTo = stage ? sc.stages[stage - 1] : 0;
    // asked for an earlier stage than the sheet holds: start the sheet again
    if (h.state.done != null && h.state.done > upTo) h.state = {};
    const ink = D.paintScenes.paint(sc, upTo, h.state);
    const px = D.paintBrush.rgba(ink, sc.w, sc.h, { mask: true, ink: m.ink || '#1A1611' });
    self.postMessage({ id: m.id, ok: true, w: sc.w, h: sc.h, px: px, caption: sc.caption, family: sc.family,
                       seal: sc.seal, stages: sc.stages.length, seed: sc.seed }, [px.buffer]);
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
};
