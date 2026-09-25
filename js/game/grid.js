/* Dojo 12 — the grid. One square per question, showing its seal: nothing, fast
   once, or sealed. Only opened tables are drawn, so the screen is never a wall
   of things the child cannot do yet (PLAN §2), and a line says why a row is
   missing.

   Drawn as a wall chart that fills the width (review 2026-09-24): bare paper for a
   question not asked yet, a thin wash of ink once it has been asked, the seal kit's
   pencil square for halfway and its small ensō seal for sealed, the same marks the
   card and the end of a round use. The squares (2 × 2 to 12 × 12, and 49 ÷ 7 in
   Divide) are tinted along the diagonal so a child can find them. A tapped square is
   framed in ink, its row and column numbers are picked out, and its line sits under
   the chart beside the same mark. The look is in css/screens.css. */
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
  // Never asked is blank, so the board reads left to right: blank, outline, halfway,
  // seal (§13.3). Drawn as a filled square, "not sealed" looked more done than
  // "fast once" (audit 2026-09-14). The state itself is D.mastery.gridState, so a test
  // can hold it: a question nobody asked is never "not sealed" (2026-09-24). What Dad
  // sees draws its grid from these classes too.
  const CLASS = { unasked: 'na', none: '', halfway: 's-fast', sealed: 's-sealed' };
  function cellClass(id) { return CLASS[D.mastery.gridState(id)]; }
  // The chart's own classes: the wash and the seal kit's marks (css/kit.css).
  const CHART = { unasked: 'c-na', none: 'c-asked', halfway: 'c-asked cell-halfway', sealed: 'c-asked cell-sealed' };
  function chartClass(state) { return CHART[state] || CHART.unasked; }

  function render(root, onBack) {
    u().clear(root);
    const keys = rows();
    const mark = u().el('i', { class: 'chart-key c-na' });
    const words = u().el('span', {}, '');
    const detail = u().el('div', { class: 'chart-line', 'aria-live': 'polite' }, [mark, words]);
    const seg = u().el('div', { class: 'seg' }, [
      segBtn(D.copy.grid.times, op === 'mul', () => { op = 'mul'; render(root, onBack); }),
      segBtn(D.copy.grid.divide, op === 'div', () => { op = 'div'; render(root, onBack); }),
    ]);
    const body = keys.length ? chart(keys, detail, mark, words)
      : u().el('div', { class: 't15' }, D.copy.grid.empty);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);

    root.appendChild(u().el('div', { class: 'screen scr-grid' }, [
      u().el('div', { class: 'titlebar' }, D.copy.grid.title),
      seg, body, keys.length ? detail : null, legend(),
      op === 'div' ? u().el('div', { class: 't13 dim' }, D.copy.grid.divideNote) : null,
      u().el('div', { class: 't13 dim' }, D.copy.grid.rowsNote),
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  function chart(keys, detail, mark, words) {
    const t = u().el('table', { class: 'chart', 'data-op': op });
    // The first column holds the row numbers; the eleven after it share the rest of
    // the width, and every square is as tall as it is wide (css/screens.css).
    t.appendChild(u().el('colgroup', {}, [u().el('col', { class: 'chart-headcol' })]));
    const across = cols();
    const head = u().el('tr', {}, [u().el('th', { class: 'chart-corner', scope: 'col' }, op === 'mul' ? '×' : '÷')]);
    const colHeads = {};
    for (const b of across) {
      colHeads[b] = u().el('th', { scope: 'col' }, String(b));
      head.appendChild(colHeads[b]);
    }
    t.appendChild(u().el('thead', {}, [head]));
    const tbody = u().el('tbody');
    for (const a of keys) {
      const rowHead = u().el('th', { scope: 'row' }, (op === 'mul' ? '' : '÷ ') + a);
      const row = u().el('tr', {}, [rowHead]);
      for (const b of across) {
        const id = cellFor(a, b);
        const rec = D.mastery.peek(id);
        const state = D.mastery.gridState(id);
        const td = u().el('td', { class: chartClass(state) + (a === b ? ' c-sq' : '') });
        // The cell is named as the grid reads it, row times column: 7 × 8 in row 7.
        const flip = op === 'mul' && a > b;
        td.addEventListener('pointerdown', () => {
          t.querySelectorAll('.pick').forEach(x => x.classList.remove('pick'));
          td.classList.add('pick');
          rowHead.classList.add('pick');
          colHeads[b].classList.add('pick');
          mark.className = 'chart-key ' + chartClass(state);
          words.textContent = state === 'unasked' ? D.copy.grid.cellUnasked(id, flip)
            : D.copy.grid.cell(id, flip, D.mastery.sealState(id), rec && rec.best);
          detail.classList.add('on');
        });
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    t.appendChild(tbody);
    return t;
  }

  /* The key, drawn with the chart's own squares, in the order a question goes. The
     squares' tint comes last, named the way Home names them. */
  function legend() {
    const box = u().el('div', { class: 'chart-legend' });
    const items = [['c-na', 'unasked'], ['c-asked', 'none'], ['c-asked cell-halfway', 'fast'], ['c-asked cell-sealed', 'sealed']];
    for (const [cls, key] of items) {
      box.appendChild(u().el('span', {}, [u().el('i', { class: 'chart-key ' + cls }), D.copy.grid.legend[key]]));
    }
    box.appendChild(u().el('span', {}, [u().el('i', { class: 'chart-key c-na c-sq' }), D.copy.tableNameCap('sq')]));
    return box;
  }
  function segBtn(text, on, fn) {
    const b = u().el('button', { class: 'btn' + (on ? ' on' : ''), type: 'button' }, text);
    b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    return b;
  }

  return { render, rows, cols, cellClass };
})();
