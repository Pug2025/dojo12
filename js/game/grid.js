/* Dojo 12 — the grid. One square per question, showing its dots: none, one, or
   both. Only opened tables are drawn, so the screen is never a wall of things
   the child cannot do yet (PLAN §2), and a line says why a row is missing. */
"use strict";
D.grid = (function () {
  const u = () => D.u;
  let op = 'mul';

  function rows() {
    return D.facts.TABLE_ORDER.filter(k => k !== 'sq' && D.scheduler.isOpen(k))
      .map(Number).sort((a, b) => a - b);
  }
  function cols() { const out = []; for (let n = 2; n <= 12; n++) out.push(n); return out; }
  function cellFor(a, b) {
    return op === 'mul' ? D.facts.mulId(a, b) : D.facts.divId(a * b, a);
  }

  function render(root, onBack) {
    u().clear(root);
    const keys = rows();
    const detail = u().el('div', { class: 't13 dim', style: { minHeight: '20px' } }, '');
    const seg = u().el('div', { class: 'seg' }, [
      segBtn(D.copy.grid.times, op === 'mul', () => { op = 'mul'; render(root, onBack); }),
      segBtn(D.copy.grid.divide, op === 'div', () => { op = 'div'; render(root, onBack); }),
    ]);
    const body = keys.length
      ? u().el('div', { class: 'wrapx' }, [table(keys, detail)])
      : u().el('div', { class: 't15' }, D.copy.grid.empty);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);

    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.grid.title),
      seg, body, detail, legend(),
      u().el('div', { class: 't13 dim' }, D.copy.grid.rowsNote(D.scheduler.nextUnopened())),
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  function table(keys, detail) {
    const t = u().el('table', { class: 'grid' });
    const across = cols();
    const head = u().el('tr', {}, [u().el('th', {}, op === 'mul' ? '×' : '÷')]);
    for (const b of across) head.appendChild(u().el('th', {}, String(b)));
    t.appendChild(head);
    for (const a of keys) {
      const row = u().el('tr', {}, [u().el('th', {}, String(a))]);
      for (const b of across) {
        const id = cellFor(a, b);
        const rec = D.mastery.peek(id);
        const dots = D.mastery.dots(id);
        const unasked = !!(rec && rec.provisional);
        const cls = unasked ? 'na' : dots === 2 ? 'd2' : dots === 1 ? 'd1' : '';
        const td = u().el('td', { class: cls });
        td.addEventListener('pointerdown', () => {
          detail.textContent = unasked ? D.copy.grid.cellUnasked(id, false)
            : D.copy.grid.cell(id, false, dots, rec && rec.best);
        });
        row.appendChild(td);
      }
      t.appendChild(row);
    }
    return t;
  }

  function legend() {
    const box = u().el('div', { class: 'legend' });
    const items = [['', 'none'], ['d1', 'one'], ['d2', 'both'], ['na', 'unasked']];
    for (const [cls, key] of items) {
      box.appendChild(u().el('span', {}, [u().el('i', { class: cls }), D.copy.grid.legend[key]]));
    }
    return box;
  }
  function segBtn(text, on, fn) {
    const b = u().el('button', { class: 'btn' + (on ? ' on' : ''), type: 'button' }, text);
    b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    return b;
  }

  return { render, rows, cols };
})();
