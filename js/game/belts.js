/* Dojo 12 — the belt. One ladder, white to black, four stripes on each colour,
   moved by the questions the child has sealed. Brown's fourth stripe opens the
   black belt test. Nothing here compares this child with anyone. */
"use strict";
D.belts = (function () {
  const u = () => D.u;

  function render(root, onBack, onTest) {
    u().clear(root);
    const info = D.belt.info();
    const ladder = u().el('div', { class: 'col' });
    for (const belt of D.cfg.BELT_NAMES.concat(['black'])) ladder.appendChild(rung(belt, info));

    const box = u().el('div', { class: 'plate' }, [
      u().el('div', { class: 't15' }, D.copy.belt.filled(info.sealed)),
      u().el('div', { class: 't13 dim' }, D.copy.belt.how),
    ]);
    if (!info.black) {
      const steps = D.cfg.BELT_STEPS;
      if (info.testOpen) {
        const start = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.belt.start);
        start.addEventListener('click', () => onTest());
        box.appendChild(u().el('div', { class: 't15', style: { fontWeight: '700' } }, D.copy.belt.testTitle));
        box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testRules));
        box.appendChild(start);
      } else if (info.step >= D.belt.lastStep()) {
        box.appendChild(u().el('div', { class: 't15', style: { fontWeight: '700' } }, D.copy.belt.testTitle));
        box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testTaken));
      } else {
        // One sentence: where the test opens and what that is on the belt (2026-09-24).
        box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testLocked(steps[steps.length - 1])));
      }
    }

    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.belt.title),
      ladder, box,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* The sealed questions each belt takes, from BELT_STEPS: blue is step 5, purple 10,
     brown 15, and the test opens at the last step. White is where everyone starts. */
  function sealsFor(belt) {
    const steps = D.cfg.BELT_STEPS, at = D.cfg.BELT_NAMES.indexOf(belt);
    if (belt === 'black') return steps[steps.length - 1];
    return at > 0 ? steps[at * 5 - 1] : 0;
  }

  function rung(belt, info) {
    const order = D.cfg.BELT_NAMES.concat(['black']);
    const here = info.black ? belt === 'black' : belt === info.belt;
    const passed = order.indexOf(belt) < order.indexOf(info.black ? 'black' : info.belt);
    const bar = u().el('div', { class: 'bar' });
    const n = here ? info.stripes : passed ? 4 : 0;
    for (let i = 0; i < n; i++) bar.appendChild(u().el('i'));
    const need = sealsFor(belt);
    const at = need ? (belt === 'black' ? D.copy.belt.rungBlack(need) : D.copy.belt.rungAt(need)) : '';
    return u().el('div', { class: 'rung' + (here ? ' now' : passed ? ' done' : '') }, [
      u().el('div', { class: 'name' }, D.copy.belt.names[belt]),
      u().el('div', { class: 'rungcol' }, [
        u().el('div', { class: 'band beltband b-' + belt }, [u().el('div', { class: 'cloth' }), bar]),
        at ? u().el('div', { class: 'at' }, at) : null,
      ]),
    ]);
  }

  return { render, sealsFor };
})();
