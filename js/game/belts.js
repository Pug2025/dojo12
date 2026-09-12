/* Dojo 12 — the belt. One ladder, white to black, four stripes on each colour,
   moved by the dots the child has filled. Brown's fourth stripe opens the black
   belt test. Nothing here compares this child with anyone. */
"use strict";
D.belts = (function () {
  const u = () => D.u;

  function render(root, onBack, onTest) {
    u().clear(root);
    const info = D.belt.info();
    const ladder = u().el('div', { class: 'col' });
    for (const belt of D.cfg.BELT_NAMES.concat(['black'])) ladder.appendChild(rung(belt, info));

    const box = u().el('div', { class: 'plate' }, [
      u().el('div', { class: 't15' }, D.copy.belt.filled(info.dots)),
      u().el('div', { class: 't13 dim' }, D.copy.belt.how),
    ]);
    if (info.black) {
      // Nothing left to test: the ladder itself says where the child is.
    } else if (info.testOpen) {
      const start = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.belt.start);
      start.addEventListener('click', () => onTest());
      box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testRules));
      box.appendChild(start);
    } else if (info.step >= D.belt.lastStep()) {
      box.appendChild(u().el('div', { class: 't15' }, D.copy.belt.testTaken));
    } else {
      box.appendChild(u().el('div', { class: 't13 dim' }, D.copy.belt.testLocked));
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

  function rung(belt, info) {
    const here = info.black ? belt === 'black' : belt === info.belt;
    const order = D.cfg.BELT_NAMES.concat(['black']);
    const passed = order.indexOf(belt) < order.indexOf(info.black ? 'black' : info.belt);
    const bar = u().el('div', { class: 'bar' });
    const n = here ? info.stripes : passed ? 4 : 0;
    for (let i = 0; i < n; i++) bar.appendChild(u().el('i'));
    return u().el('div', { class: 'rung' + (here ? ' now' : passed ? ' done' : '') }, [
      u().el('div', { class: 'name' }, D.copy.belt.names[belt]),
      u().el('div', { class: 'band beltband b-' + belt }, [u().el('div', { class: 'cloth' }), bar]),
    ]);
  }

  return { render };
})();
