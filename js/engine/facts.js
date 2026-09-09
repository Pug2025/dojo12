/* Dojo 12 engine — the fact universe. Headless: no DOM.
   Nothing is hand-authored per child; every fact is generated (PLAN §6.1, §6.8). */
"use strict";
D.facts = (function () {
  const FACTS = {};        // id -> fact
  const TABLES = {};       // key -> table
  const FAMILIES = {};     // famId -> { id, lane, facts: [id] }

  /* ---------------- ids ---------------- */
  function mulId(a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); return 'mul:' + lo + 'x' + hi; }
  function divId(p, d) { return 'div:' + p + '/' + d; }
  function addId(a, b) { const hi = Math.max(a, b), lo = Math.min(a, b); return 'add:' + hi + '+' + lo; }
  function subId(a, b) { return 'sub:' + a + '-' + b; }

  function put(fact) {
    if (FACTS[fact.id]) return FACTS[fact.id];
    fact.digits = D.u.digitsOf(fact.ans);
    FACTS[fact.id] = fact;
    return fact;
  }

  /* ---------------- tables (PLAN §6.3 order) ----------------
     Tables open in strategy order, each leaning on a trick from an earlier one.
     `needs` is a prerequisite table that must be open; `fastNeeds` additionally
     wants that table at TABLE_PREREQ_PCT fast+auto. */
  const TABLE_DEFS = [
    { key: '2',  order: 1,  family: 'mul.x2',  needs: [],           fastNeeds: [] },
    { key: '10', order: 2,  family: 'mul.x10', needs: [],           fastNeeds: [] },
    { key: '5',  order: 3,  family: 'mul.x5',  needs: ['10'],       fastNeeds: [] },
    { key: 'sq', order: 4,  family: 'mul.sq',  needs: ['5'],        fastNeeds: [] },
    { key: '4',  order: 5,  family: 'mul.x4',  needs: [],           fastNeeds: ['2'] },
    { key: '9',  order: 6,  family: 'mul.x9',  needs: [],           fastNeeds: ['10'] },
    { key: '3',  order: 7,  family: 'mul.x3',  needs: [],           fastNeeds: ['2'] },
    { key: '6',  order: 8,  family: 'mul.x6',  needs: [],           fastNeeds: ['5'] },
    { key: '8',  order: 9,  family: 'mul.x8',  needs: [],           fastNeeds: ['4'] },
    { key: '11', order: 10, family: 'mul.x11', needs: ['10'],       fastNeeds: [] },
    { key: '12', order: 11, family: 'mul.x12', needs: [],           fastNeeds: ['10', '2'] },
    { key: '7',  order: 12, family: 'mul.x7',  needs: [],           fastNeeds: ['5'] },
  ];
  const TABLE_ORDER = TABLE_DEFS.map(t => t.key);

  /* ---------------- build the core lane ---------------- */
  function build() {
    for (const def of TABLE_DEFS) {
      TABLES[def.key] = Object.assign({}, def, { products: [], divisions: [], items: [] });
    }
    // 66 products: unordered pairs {a,b}, 2..12. x0 and x1 are excluded everywhere.
    for (let a = 2; a <= 12; a++) {
      for (let b = a; b <= 12; b++) {
        const f = put({ id: mulId(a, b), op: 'mul', a: a, b: b, ans: a * b, lane: 'muldiv' });
        f.tables = a === b ? [String(a), 'sq'] : [String(a), String(b)];
      }
    }
    // Divisions: one record per orientation. A square product has only one, so the
    // count is 11 per table x 11 tables = 121, not 132 (PLAN §6.1 arithmetic note).
    for (let a = 2; a <= 12; a++) {
      for (let b = a; b <= 12; b++) {
        for (const d of (a === b ? [a] : [a, b])) {
          const f = put({ id: divId(a * b, d), op: 'div', a: a * b, b: d, ans: (a * b) / d, lane: 'muldiv' });
          f.tables = [String(d)];
          if (a === b) f.tables.push('sq');   // n^2 / n is the squares table's division item
        }
      }
    }
    for (const f of Object.values(FACTS)) {
      if (f.lane !== 'muldiv') continue;
      for (const key of f.tables) {
        const t = TABLES[key];
        if (!t) continue;
        (f.op === 'mul' ? t.products : t.divisions).push(f.id);
        t.items.push(f.id);
      }
    }
    for (const t of Object.values(TABLES)) {
      t.products.sort(byFactSize); t.divisions.sort(byFactSize); t.items.sort(byFactSize);
    }
    buildAddSub();
  }
  function byFactSize(x, y) { return FACTS[x].ans - FACTS[y].ans; }

  /* ---------------- safety-net lane (PLAN §6.8) ----------------
     The first nine generators are Beastro's, reworked; the last four exist because
     the multiplication rescue scripts stand on them (double a 2-digit number, cross
     a ten, add a 2-digit to a multiple of five, take a 1- or 2-digit from a decade).
     A fact belongs to the first family in this list that generates it. */
  const ADDSUB_DEFS = [
    { id: 'add.count',   raw() { const o = []; for (let a = 3; a <= 10; a++) for (let b = 1; b <= 3; b++) if (a >= b && a + b !== 10) o.push([a, b]); return o; } },
    { id: 'add.doubles', raw() { const o = []; for (let n = 2; n <= 10; n++) o.push([n, n]); return o; } },
    { id: 'add.near',    raw() { const o = []; for (let n = 2; n <= 9; n++) o.push([n + 1, n]); return o; } },
    { id: 'add.make10',  raw() { return [[9, 1], [8, 2], [7, 3], [6, 4], [5, 5]]; } },
    { id: 'add.bridge',  raw() { const o = []; for (const big of [9, 8]) for (let s = 3; s <= 7; s++) o.push([big, s]); return o; } },
    { id: 'add.rest',    raw() { const o = []; for (let a = 2; a <= 10; a++) for (let b = 2; b <= a; b++) if (a + b > 10) o.push([a, b]); return o; } },
    { id: 'add.dbl2d',   raw() { const o = []; for (let n = 11; n <= 49; n++) o.push([n, n]); return o; } },
    { id: 'add.cross',   raw() { const o = []; for (let a = 11; a <= 59; a++) for (let b = 2; b <= 9; b++) if (a % 10 && (a % 10) + b > 10) o.push([a, b]); return o; } },
    { id: 'add.2d2d',    raw() { const o = []; for (let a = 20; a <= 90; a += 5) for (let b = 11; b <= 24; b++) o.push([a, b]); return o; } },
    { id: 'sub.think',   op: 'sub', raw() { const o = []; for (let a = 5; a <= 10; a++) for (let b = 2; b <= a - 2; b++) o.push([a, b]); return o; } },
    { id: 'sub.comp',    op: 'sub', raw() { const o = []; for (let n = 1; n <= 9; n++) o.push([10, n]); for (let n = 12; n <= 18; n++) o.push([20, n]); return o; } },
    { id: 'sub.teens',   op: 'sub', raw() { const o = []; for (let a = 11; a <= 18; a++) for (let b = 2; b <= 9; b++) { const r = a - b; if (r >= 2 && r <= 9) o.push([a, b]); } return o; } },
    { id: 'sub.decade',  op: 'sub', raw() { const o = []; for (let d = 20; d <= 90; d += 10) { for (let n = 1; n <= 9; n++) o.push([d, n]); for (let n = 10; n <= 20; n++) o.push([d, n]); } return o; } },
  ];

  function buildAddSub() {
    for (const def of ADDSUB_DEFS) {
      const op = def.op || 'add';
      const fam = { id: def.id, lane: 'addsub', facts: [] };
      for (const pair of def.raw()) {
        const a = pair[0], b = pair[1];
        const id = op === 'add' ? addId(a, b) : subId(a, b);
        if (FACTS[id]) continue;                       // an earlier family owns it
        const hi = Math.max(a, b), lo = Math.min(a, b);
        put({ id: id, op: op, a: op === 'add' ? hi : a, b: op === 'add' ? lo : b,
              ans: op === 'add' ? a + b : a - b, lane: 'addsub', family: def.id });
        fam.facts.push(id);
      }
      FAMILIES[def.id] = fam;
    }
  }

  /* ---------------- lookups ---------------- */
  function get(id) { return FACTS[id]; }
  function all() { return FACTS; }
  function table(key) { return TABLES[key]; }
  function tableKeys() { return TABLE_ORDER.slice(); }
  function family(id) { return FAMILIES[id]; }
  function familyIds() { return ADDSUB_DEFS.map(d => d.id); }
  function addSubFacts() { return Object.values(FACTS).filter(f => f.lane === 'addsub').map(f => f.id); }

  /* Table display names. These are labels, not player copy: the strings the player
     reads come from D.copy.tableName(). */
  function tableFacts(key, opts) {
    const t = TABLES[key];
    if (!t) return [];
    const o = opts || {};
    if (o.products) return t.products.slice();
    if (o.divisions) return t.divisions.slice();
    return t.items.slice();
  }

  /* Value weight of a fact (PLAN §7.3). A product sits in two tables; it is worth
     what its *easier* table is worth, because the easier strategy is the one a
     child will actually use. 2 x 7 is a double, so it pays like a double.
     Division adds a fixed bonus on top of its divisor's table. */
  function weight(id) {
    const f = FACTS[id];
    if (!f) return 1;
    if (f.lane === 'addsub') return D.cfg.WEIGHT_ADDSUB;
    if (f.lane === 'beyond') return D.cfg.WEIGHT_BEYOND;
    const w = D.cfg.WEIGHTS;
    if (f.op === 'div') return (w[String(f.b)] || 1) + D.cfg.WEIGHT_DIV_BONUS;
    let best = Infinity;
    for (const key of f.tables) best = Math.min(best, w[key] === undefined ? 1 : w[key]);
    return best === Infinity ? 1 : best;
  }

  /* The question as the player sees it. Products are shown in either orientation. */
  function display(id, flip) {
    const f = FACTS[id];
    if (!f) return '';
    if (f.op === 'mul') return flip ? (f.b + ' × ' + f.a) : (f.a + ' × ' + f.b);
    if (f.op === 'div') return f.a + ' ÷ ' + f.b;
    if (f.op === 'add') return f.a + ' + ' + f.b;
    return f.a + ' − ' + f.b;
  }
  // The canonical written form used in summaries and rescue lines: 7 x 8 = 56.
  function equation(id, flip) { return display(id, flip) + ' = ' + FACTS[id].ans; }

  build();

  return { get, all, table, tableKeys, tableFacts, family, familyIds, addSubFacts,
           weight, display, equation, mulId, divId, addId, subId, TABLE_DEFS, TABLE_ORDER };
})();
