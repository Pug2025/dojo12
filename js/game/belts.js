/* Dojo 12 — the belt ladder (PLAN §7.1). One tile per opened table, its colour,
   how much of it is fast, and a Test button once it is ready. No overall rank:
   nothing here adds up to a single number about how good the player is. */
"use strict";
D.belts = (function () {
  const u = () => D.u;

  function render(root, onBack, onTest) {
    u().clear(root);
    const list = u().el('div', { class: 'col', style: { gap: '10px' } });
    // Beyond topics have belts too, once the lane is open (review 2026-09-10).
    const open = D.scheduler.beltKeys();
    for (const key of open) list.appendChild(tile(key, onTest));
    if (!open.length) list.appendChild(u().el('div', { class: 'small' }, D.copy.grid.empty));

    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'big' }, D.copy.belts.title),
      u().el('div', { class: 'gridwrap grow' }, [list]),
      back,
    ]));
  }

  function tile(key, onTest) {
    const t = D.scheduler.tableState(key);
    const st = D.mastery.tableStats(key);
    const box = u().el('div', { class: 'plate' });
    box.appendChild(u().el('div', { class: 'row between' }, [
      u().el('div', { class: 'value' }, D.copy.tableLabel(key)),
      u().el('i', { class: 'belt b-' + t.belt }),
    ]));
    box.appendChild(u().el('div', { class: 'small' }, D.copy.belts.count(st.fastPlus, st.total)));
    box.appendChild(u().el('div', { class: 'beltbar' }, [
      u().el('i', { style: { width: Math.round(100 * st.fastPct) + '%' } }),
    ]));
    const canTest = D.belttest.canAttempt(key);
    const line = canTest ? null : ladderLine(key, t, st);
    if (line) box.appendChild(u().el('div', { class: 'small', style: { marginTop: '8px' } }, line));
    if (canTest) {
      const b = u().el('button', { class: 'btn primary wide', type: 'button',
                                   style: { marginTop: '11px', fontSize: '18px', padding: '15px' } },
                       D.copy.belts.start);
      b.addEventListener('click', () => onTest(key));
      box.appendChild(u().el('div', { class: 'small', style: { marginTop: '10px' } }, D.copy.belts.offer(key)));
      box.appendChild(b);
    }
    return box;
  }

  function ladderLine(key, t, st) {
    if (t.belt === 'black') return null;
    if (D.scheduler.testOpen(key)) return D.copy.belts.testOpen(key);
    if (t.belt === 'orange') return D.copy.belts.orange(key);
    if (t.belt === 'yellow') return D.copy.belts.yellow(key);
    return null;
  }

  return { render };
})();
