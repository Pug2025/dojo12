/* Dojo 12 — the grid (PLAN §7.1). Only opened tables are drawn, so the screen
   is never a wall of everything the child cannot do yet. */
"use strict";
D.grid = (function () {
  const u = () => D.u;
  let mode = 'week', op = 'mul';

  // Rows are the tables that have opened. Columns are every factor, because an
  // open table's facts reach across the whole row (PLAN §7.1).
  function rows() {
    return D.facts.TABLE_ORDER.filter(k => k !== 'sq' && D.scheduler.isOpen(k))
      .map(Number).sort((a, b) => a - b);
  }
  function cols() { const out = []; for (let n = 2; n <= 12; n++) out.push(n); return out; }
  function changedThisWeek(id) {
    const r = D.mastery.peek(id);
    if (!r || !r.lastDay) return false;
    return D.u.weekKey(r.lastDay) === D.u.weekKey(D.u.gameDay());
  }

  function cellFor(a, b) {
    return op === 'mul' ? D.facts.mulId(a, b) : D.facts.divId(a * b, a);
  }

  function render(root, onBack) {
    u().clear(root);
    const keys = rows();
    const head = u().el('div', { class: 'row between' }, [
      u().el('div', { class: 'big' }, D.copy.grid.title),
      backBtn(onBack),
    ]);
    const seg = u().el('div', { class: 'seg' }, [
      segBtn(D.copy.grid.changed, mode === 'week', () => { mode = 'week'; render(root, onBack); }),
      segBtn(D.copy.grid.full, mode === 'all', () => { mode = 'all'; render(root, onBack); }),
    ]);
    const seg2 = u().el('div', { class: 'seg' }, [
      segBtn(D.copy.grid.products, op === 'mul', () => { op = 'mul'; render(root, onBack); }),
      segBtn(D.copy.grid.divisions, op === 'div', () => { op = 'div'; render(root, onBack); }),
    ]);
    const detail = u().el('div', { class: 'small', style: { minHeight: '22px' } }, '');

    const body = keys.length
      ? u().el('div', { class: 'gridwrap' }, [table(keys, detail)])
      : u().el('div', { class: 'small' }, D.copy.grid.empty);

    root.appendChild(u().el('div', { class: 'screen' }, [
      head, seg, seg2, body, detail, legend(), u().el('div', { class: 'grow' }),
    ]));
  }

  function table(keys, detail) {
    const t = u().el('table', { class: 'grid' });
    const across = cols();
    const hrow = u().el('tr', {}, [u().el('th', {}, op === 'mul' ? '×' : '÷')]);
    for (const b of across) hrow.appendChild(u().el('th', {}, String(b)));
    t.appendChild(hrow);
    for (const a of keys) {
      const row = u().el('tr', {}, [u().el('th', {}, String(a))]);
      for (const b of across) {
        const id = cellFor(a, b);
        const st = D.mastery.status(id);
        const rec = D.mastery.peek(id);
        const show = mode === 'all' || changedThisWeek(id);
        const cls = ['s-' + st];
        if (st === 'auto' && rec && rec.missDays && rec.missDays.length === 1) cls.push('dotted');
        const td = u().el('td', { class: show ? cls.join(' ') : '' });
        td.addEventListener('pointerdown', () => {
          detail.textContent = rec && rec.best
            ? D.copy.grid.cellHistory(id, false, rec.best)
            : D.copy.grid.cellNoTime(id, false);
        });
        row.appendChild(td);
      }
      t.appendChild(row);
    }
    return t;
  }

  function legend() {
    const box = u().el('div', { class: 'legend tiny' });
    const items = [['s-learning', 'learning'], ['s-known', 'known'], ['s-fast', 'fast'], ['s-auto', 'auto']];
    for (const [cls, name] of items) {
      const sw = u().el('i', { class: cls });
      box.appendChild(u().el('span', {}, [sw, D.copy.grid.states[name]]));
    }
    return box;
  }
  function segBtn(text, on, fn) {
    const b = u().el('button', { class: 'btn' + (on ? ' on' : ''), type: 'button' }, text);
    b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    return b;
  }
  function backBtn(onBack) {
    const b = u().el('button', { class: 'btn ghost', type: 'button' }, D.copy.settings.back);
    b.addEventListener('pointerdown', e => { e.preventDefault(); onBack(); });
    return b;
  }

  return { render, rows, cols };
})();
