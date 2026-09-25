/* Dojo 12 — the belt. One ladder, white to black, four stripes on each colour,
   moved by the questions the child has sealed. Brown's fourth stripe opens the
   black belt test. Nothing here compares this child with anyone.

   The screen reads top to bottom as a ladder (review 2026-09-24): the five belts
   drawn tied (the belt kit, D.kit.belt), each with the seals it takes beside it.
   A belt already passed wears its four stripes; the belt the child is on has its
   name in a solid red block, ART.md's "this one, now", with its own stripes and
   the line to the next one; the belts to come are drawn quieter but in their own
   colours. The black belt test is the last step, in a box under the black belt.
   The look is in css/screens.css. */
"use strict";
D.belts = (function () {
  const u = () => D.u;
  const LADDER = () => D.cfg.BELT_NAMES.concat(['black']);

  function render(root, onBack, onTest) {
    u().clear(root);
    const info = D.belt.info();
    const ladder = u().el('div', { class: 'ladder' });
    for (const belt of LADDER()) ladder.appendChild(rung(belt, info));

    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen scr-belt' }, [
      u().el('div', { class: 'titlebar' }, D.copy.belt.title),
      u().el('div', { class: 'belt-intro' }, [
        u().el('div', { class: 't17 belt-count' }, D.copy.belt.filled(info.sealed)),
        u().el('div', { class: 't13 dim' }, D.copy.belt.how),
      ]),
      ladder,
      testBox(info, onTest),
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* The last step: what the test is and when it opens, or the button once it has. */
  function testBox(info, onTest) {
    if (info.black) return null;
    const steps = D.cfg.BELT_STEPS;
    const box = u().el('div', { class: 'plate belt-test' });
    if (info.testOpen) {
      const start = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.belt.start);
      start.addEventListener('click', () => onTest());
      box.classList.add('open');
      box.appendChild(u().el('div', { class: 'belt-test-title' }, D.copy.belt.testTitle));
      box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testRules));
      box.appendChild(start);
    } else if (info.step >= D.belt.lastStep()) {
      box.appendChild(u().el('div', { class: 'belt-test-title' }, D.copy.belt.testTitle));
      box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testTaken));
    } else {
      // One sentence: where the test opens and what that is on the belt (2026-09-24).
      box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testLocked(steps[steps.length - 1])));
    }
    return box;
  }

  /* The sealed questions each belt takes, from BELT_STEPS: blue is step 5, purple 10,
     brown 15, and the test opens at the last step. White is where everyone starts. */
  function sealsFor(belt) {
    const steps = D.cfg.BELT_STEPS, at = D.cfg.BELT_NAMES.indexOf(belt);
    if (belt === 'black') return steps[steps.length - 1];
    return at > 0 ? steps[at * 5 - 1] : 0;
  }

  function rung(belt, info) {
    const order = LADDER();
    const current = info.black ? 'black' : info.belt;
    const here = belt === current;
    const passed = order.indexOf(belt) < order.indexOf(current);
    const stripes = here ? info.stripes : passed ? 4 : 0;
    const need = sealsFor(belt);
    const at = need ? (belt === 'black' ? D.copy.belt.rungBlack(need) : D.copy.belt.rungAt(need)) : '';
    // The belt the child is on says what comes next, in the words Home's plate uses.
    const next = here && !info.black
      ? D.copy.belt.toNext(Object.assign({}, info, { left: D.belt.bar(info).left })) : '';
    const words = u().el('div', { class: 'rung-words' }, [
      u().el('div', { class: 'rung-name' }, [u().el('span', {}, D.copy.belt.names[belt])]),
      at ? u().el('div', { class: 'rung-at' }, at) : null,
      next ? u().el('div', { class: 'rung-next' }, next) : null,
    ]);
    return u().el('div', { class: 'rung2' + (here ? ' now' : passed ? ' done' : ' later') }, [
      D.kit.belt(belt, stripes, { cls: 'rung-belt', alt: D.copy.belt.now(belt, stripes) }),
      words,
    ]);
  }

  return { render, sealsFor };
})();
