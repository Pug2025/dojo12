/* Dojo 12 — the grid. One square per question, showing its seal: nothing, fast
   once, or sealed. Only opened tables are drawn, so the screen is never a wall
   of things the child cannot do yet (PLAN §2), and a line says why a row is
   missing. */
"use strict";
D.grid = (function () {
  const u = () => D.u;
  let op = 'mul';

  function rows() {
    return D.facts.TABLE_ORDER.filter(k => k !== 'sq' && D.scheduler.isOpen(k))
      .map(Number).sort((a, b) => a - b);
  }
  function cols() { const out = []; for (let n = 2; n <= 12; n++) out.push(n); return out; }
  // Times: row times column. Divide: the row's number divides row times column,
  // so the column is the answer.
  function cellFor(a, b) {
    return op === 'mul' ? D.facts.mulId(a, b) : D.facts.divId(a * b, a);
  }
  // Never asked is blank, so the board reads left to right: blank, outline, half,
  // seal (§13.3). Drawn as a filled square, "not sealed" looked more done than
  // "fast once" (audit 2026-09-14).
  function cellClass(id) {
    const rec = D.mastery.peek(id);
    if (!rec || rec.seen === 0 || rec.provisional) return 'na';
    const st = D.mastery.sealState(id);
    return st === 'sealed' ? 's-sealed' : st === 'fast' ? 's-fast' : '';
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
      op === 'div' ? u().el('div', { class: 't13 dim' }, D.copy.grid.divideNote) : null,
      u().el('div', { class: 't13 dim' }, D.copy.grid.rowsNote),
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
      const row = u().el('tr', {}, [u().el('th', {}, (op === 'mul' ? '' : '÷ ') + a)]);
      for (const b of across) {
        const id = cellFor(a, b);
        const rec = D.mastery.peek(id);
        const cls = cellClass(id);
        const td = u().el('td', { class: cls });
        td.addEventListener('pointerdown', () => {
          t.querySelectorAll('td.pick').forEach(x => x.classList.remove('pick'));
          td.classList.add('pick');
          detail.textContent = cls === 'na' ? D.copy.grid.cellUnasked(id, false)
            : D.copy.grid.cell(id, false, D.mastery.sealState(id), rec && rec.best);
        });
        row.appendChild(td);
      }
      t.appendChild(row);
    }
    return t;
  }

  function legend() {
    const box = u().el('div', { class: 'legend' });
    const items = [['na', 'unasked'], ['', 'none'], ['s-fast', 'fast'], ['s-sealed', 'sealed']];
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

  return { render, rows, cols, cellClass };
})();
