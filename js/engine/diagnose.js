/* Dojo 12 engine — reading a wrong answer (PLAN §6.7.4). Headless.
   First match wins. A diagnosis never confirms anything about the answer: it
   names what the child did, then the script runs. Rows that mean the child was
   one step away pay the comeback at 1x, so a near miss is not worth farming. */
"use strict";
D.diagnose = (function () {
  function digitsSorted(n) { return String(n).split('').sort().join(''); }

  // Returns { line, comebackMult }. line may be null: most misses get no words.
  function read(id, given, opts) {
    const o = opts || {};
    const f = D.facts.get(id);
    const out = { line: null, comebackMult: D.cfg.COMEBACK_MULT, kind: 'other' };
    if (!f) return out;
    if (o.timeout) { out.kind = 'timeout'; return out; }
    if (given === null || given === undefined || given === '') { out.kind = 'blank'; return out; }
    const g = Number(given);
    if (!isFinite(g)) return out;

    if (f.op === 'mul') {
      const a = f.a, b = f.b;
      if (g === a + b) {
        out.kind = 'added';
        out.line = D.copy.rescue.addedInstead(a, b);
        return out;
      }
      if (g === a * (b + 1) || g === a * (b - 1) || g === (a + 1) * b || g === (a - 1) * b) {
        out.kind = 'offByGroup'; out.comebackMult = 1; return out;
      }
      if (g === (a + 1) * (b + 1) || g === (a - 1) * (b - 1) ||
          g === (a + 1) * (b - 1) || g === (a - 1) * (b + 1)) {
        out.kind = 'neighbour'; out.comebackMult = 1; return out;
      }
      if (g !== f.ans && digitsSorted(g) === digitsSorted(f.ans)) {
        out.kind = 'swapped'; out.comebackMult = 1; return out;
      }
      return out;
    }

    if (f.op === 'div') {
      if (g === f.a - f.b) {
        out.kind = 'subtracted';
        out.line = D.copy.rescue.divSubtracted(f.a, f.b);
        return out;
      }
      if (g === f.b) { out.kind = 'echoed'; return out; }
      if (g === f.ans + 1 || g === f.ans - 1) { out.kind = 'offByGroup'; out.comebackMult = 1; return out; }
      if (g !== f.ans && digitsSorted(g) === digitsSorted(f.ans)) {
        out.kind = 'swapped'; out.comebackMult = 1; return out;
      }
      return out;
    }
    return out;
  }

  return { read };
})();
