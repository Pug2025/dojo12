/* Dojo 12 — the image kit on screen (ART.md Assets, review 2026-09-24). The pictures are
   painted in art/kit/ by the icon's pipeline and ship in img/; this file only builds the
   pieces, so every screen draws the belt, the seal and the level stamp the same way.
   The look lives in css/kit.css. */
"use strict";
D.kit = (function () {
  // The belt kit's stripe slots (art/kit/out/belt/spec.json). The five belts share one
  // drawing, so one set of numbers serves all of them. Slot 1 is nearest the tail's tip,
  // so stripe 1 goes there and the rest follow toward the knot.
  const SLOTS = [
    { x: 0.76684, y: 0.73882 }, { x: 0.73233, y: 0.67882 },
    { x: 0.69783, y: 0.61882 }, { x: 0.66332, y: 0.55882 },
  ];
  const TAPE = { w: 0.02686, h: 0.225, angle: 30 };
  const BELTS = ['white', 'blue', 'purple', 'brown', 'black'];

  /* The tied belt with its stripes. opts.width sets the box (the height follows the
     picture), opts.fresh is the stripe just tied (1 to 4), which wraps on, and opts.alt
     names it where no words sit beside it (the words come from copy.js). */
  function belt(kind, stripes, opts) {
    const o = opts || {};
    const k = BELTS.indexOf(kind) >= 0 ? kind : 'white';
    const box = D.u.el('div', { class: 'belt' + (o.cls ? ' ' + o.cls : '') });
    if (o.width) box.style.width = o.width;
    box.appendChild(D.u.el('img', { src: 'img/belt-' + k + '.webp', width: '1024', height: '340',
                                     alt: o.alt || '', draggable: 'false' }));
    const n = D.u.clamp(stripes | 0, 0, SLOTS.length);
    for (let i = 0; i < n; i++) {
      const tape = D.u.el('i', { class: 'tape' + (o.fresh === i + 1 ? ' new' : '') });
      tape.style.setProperty('--x', (SLOTS[i].x * 100) + '%');
      tape.style.setProperty('--y', (SLOTS[i].y * 100) + '%');
      tape.style.setProperty('--w', (TAPE.w * 100) + '%');
      tape.style.setProperty('--h', (TAPE.h * 100) + '%');
      tape.style.setProperty('--a', TAPE.angle + 'deg');
      box.appendChild(tape);
    }
    return box;
  }

  /* A question's mark: 'sealed' (the ensō seal), 'halfway' (the pencil square) or
     anything else for nothing. small is for boxes of 20 to 30 px. */
  function seal(state, small) {
    const cls = state === 'sealed' ? 'hanko' : state === 'halfway' || state === 'fast' ? 'hanko-pencil' : null;
    if (!cls) return null;
    return D.u.el('i', { class: cls + (small ? '-sm' : '') + ' askew' });
  }

  /* A new level, stamped: the blank stone with the number written on it. */
  function level(n) {
    return D.u.el('span', { class: 'hanko-level' + (String(n).length > 1 ? ' two' : '') },
                  [D.u.el('b', {}, String(n))]);
  }

  return { belt, seal, level, BELTS };
})();
