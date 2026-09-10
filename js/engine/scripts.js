/* Dojo 12 engine — rescue walkthroughs (PLAN §6.7). Headless.
   A script is a short chain of typed steps. The child types every answer; the
   game never shows the result before the attempt. Each step carries a simpler
   form, used once if the step is wrong; a step wrong twice shows its value.
   Every prompt string comes from D.copy.step. */
"use strict";
D.scripts = (function () {
  const c = () => D.copy.step;
  const L = () => D.copy.label;

  /* ---- step constructors. `label` is the plain arithmetic used by the
     "step wrong twice" line; `prompt` is what the child reads. ---- */
  function mk(kind, prompt, label, answer, simpler) {
    return { kind: kind, prompt: prompt, label: label, answer: answer, simpler: simpler || null };
  }
  const sAdd = (x, y, simpler) => mk('add', c().add(x, y), L().add(x, y), x + y, simpler);
  const sSub = (x, y, simpler) => mk('sub', c().sub(x, y), L().sub(x, y), x - y, simpler);
  const sDouble = (n, simpler) => mk('double', c().double(n), L().add(n, n), n * 2, simpler);
  const sGroups = (count, of, simpler) => mk('groups', c().groups(count, of), L().mul(of, count), count * of, simpler);
  const sTen = m => mk('ten', c().zeroEnd(m), L().mul(m, 10), m * 10, [mk('typed', c().tensThenZero(m), L().mul(m, 10), m * 10)]);
  const sHalf = (n, simpler) => mk('half', c().half(n), L().half(n), n / 2, simpler);
  const sMul = (a, b, simpler) => mk('mul', c().mul(a, b), L().mul(a, b), a * b, simpler);

  /* ---- generic simpler forms ---- */
  // 40 + 16 -> "40 + 10?" then "50 + 6?"  ·  49 + 7 -> "49 + 1?" then "50 + 6?"
  function splitAdd(x, y) {
    const toTen = 10 - (x % 10);
    if (x % 10 !== 0 && toTen < y) return [sAdd(x, toTen), sAdd(x + toTen, y - toTen)];
    if (y > 10) return [sAdd(x, 10), sAdd(x + 10, y - 10)];
    return null;
  }
  // 70 − 7 -> "70 − 10?" then "60 + 3?"  ·  70 − 14 -> "70 − 10?" then "60 − 4?"
  function splitSub(x, y) {
    if (y === 10 || x % 10 !== 0) return null;
    return y < 10 ? [sSub(x, 10), sAdd(x - 10, 10 - y)] : [sSub(x, 10), sSub(x - 10, y - 10)];
  }
  // Half of 70 -> "Half of 60?" then "30 + 5?"
  function splitHalf(x) {
    const lower = Math.floor(x / 20) * 20;
    if (lower === x || lower < 20) return null;
    return [sHalf(lower), sAdd(lower / 2, (x - lower) / 2)];
  }

  /* ---- one script per family, applied to n x m ---- */
  const BUILD = {
    'mul.x2':  m => [sDouble(m, [sAdd(m, m)])],
    'mul.x10': m => [sTen(m)],
    'mul.x5':  m => [sTen(m), sHalf(10 * m, splitHalf(10 * m))],
    'mul.x4':  m => [sDouble(m, [sAdd(m, m)]), sDouble(2 * m, [sAdd(2 * m, 2 * m)])],
    'mul.x9':  m => [sGroups(10, m), sSub(10 * m, m, splitSub(10 * m, m))],
    'mul.x3':  m => [sDouble(m, [sAdd(m, m)]), sAdd(2 * m, m, [sAdd(2 * m, 10), sSub(2 * m + 10, 10 - m)])],
    'mul.x6':  m => [sGroups(5, m), sAdd(5 * m, m, splitAdd(5 * m, m))],
    'mul.x8':  m => [sDouble(m, [sAdd(m, m)]), sDouble(2 * m, [sAdd(2 * m, 2 * m)]), sDouble(4 * m, [sAdd(4 * m, 4 * m)])],
    'mul.x8b': m => [sGroups(10, m), sGroups(2, m), sSub(10 * m, 2 * m, splitSub(10 * m, 2 * m))],
    'mul.x11': m => (m <= 9
      ? [mk('typed', c().typeTwice(m), L().mul(m, 11), 11 * m)]
      : [sGroups(10, m), sAdd(10 * m, m, splitAdd(10 * m, m))]),
    'mul.x12': m => [sGroups(10, m), sGroups(2, m), sAdd(10 * m, 2 * m, splitAdd(10 * m, 2 * m))],
    'mul.x7':  m => [sGroups(5, m), sGroups(2, m), sAdd(5 * m, 2 * m, splitAdd(5 * m, 2 * m))],
  };
  // Which single factor each family strips off. mul.x8b is the alternative eights
  // script (ten groups minus two) and competes with mul.x8 on cost.
  const FAMILY_N = { 'mul.x2': 2, 'mul.x10': 10, 'mul.x5': 5, 'mul.x4': 4, 'mul.x9': 9,
                     'mul.x3': 3, 'mul.x6': 6, 'mul.x8': 8, 'mul.x8b': 8, 'mul.x11': 11,
                     'mul.x12': 12, 'mul.x7': 7 };
  const FAMILY_ORDER = ['mul.x2', 'mul.x10', 'mul.x5', 'mul.sq', 'mul.x4', 'mul.x9', 'mul.x3',
                        'mul.x6', 'mul.x8', 'mul.x8b', 'mul.x11', 'mul.x12', 'mul.x7'];

  /* The squares anchor: used whenever the fact sits one away from a square.
     The anchor is the square this child knows better, and the smaller one on a tie. */
  function squareScript(a, b) {
    if (Math.abs(a - b) !== 1) return null;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const rank = id => ({ auto: 4, fast: 3, known: 2, learning: 1, new: 0 })[D.mastery.status(id)];
    const rLo = rank(D.facts.mulId(lo, lo)), rHi = rank(D.facts.mulId(hi, hi));
    // An anchor the child does not have is not an anchor. If neither square is
    // known yet the fact gets an ordinary factor script instead.
    if (Math.max(rLo, rHi) < 2) return null;
    if (rLo >= rHi) return [sMul(lo, lo), sAdd(lo * lo, lo, splitAdd(lo * lo, lo))];
    return [sMul(hi, hi), sSub(hi * hi, hi, splitSub(hi * hi, hi))];
  }

  /* ---- cost (PLAN §6.7.5). Fewer steps first; a step that crosses a ten or
     doubles a 2-digit number costs more, because that is where a child slips. ---- */
  const STEP_COST = 10, CROSS_COST = 6, BIG_DOUBLE_COST = 8;
  function crossesTen(step) {
    if (step.kind !== 'add' && step.kind !== 'sub') return false;
    const from = Number(String(step.label).split(/[^0-9]+/)[0]);
    if (!isFinite(from)) return false;
    return Math.floor(from / 10) !== Math.floor(step.answer / 10);
  }
  function cost(steps) {
    let total = STEP_COST * steps.length;
    for (const s of steps) {
      if (crossesTen(s)) total += CROSS_COST;
      if (s.kind === 'double' && s.answer / 2 >= 10) total += BIG_DOUBLE_COST;
    }
    return total;
  }
  function stepSuccess(famId) {
    const st = (D.state.stepStats || {})[famId];
    return st && st.tries >= 4 ? st.ok / st.tries : 0.5;
  }
  function noteStep(famId, ok) {
    const s = D.state.stepStats || (D.state.stepStats = {});
    const r = s[famId] || (s[famId] = { ok: 0, tries: 0 });
    r.tries++;
    if (ok) r.ok++;
  }

  /* ---- choose and build ---- */
  function candidates(a, b) {
    const out = [];
    const pairs = a === b ? [[a, b]] : [[a, b], [b, a]];
    for (const p of pairs) {
      const n = p[0], m = p[1];
      for (const famId of Object.keys(BUILD)) {
        if (FAMILY_N[famId] !== n) continue;
        out.push({ famId: famId, steps: BUILD[famId](m) });
      }
    }
    const sq = squareScript(a, b);
    if (sq) out.push({ famId: 'mul.sq', steps: sq });
    return out.filter(x => x.steps && x.steps.length <= 3);
  }

  function forProduct(a, b) {
    const list = candidates(a, b);
    if (!list.length) return { famId: 'mul.x2', steps: [sDouble(a)] };
    list.sort((x, y) => {
      const dc = cost(x.steps) - cost(y.steps);
      if (dc) return dc;
      const ds = stepSuccess(y.famId) - stepSuccess(x.famId);
      if (Math.abs(ds) > 0.001) return ds;
      return FAMILY_ORDER.indexOf(x.famId) - FAMILY_ORDER.indexOf(y.famId);
    });
    return list[0];
  }

  /* Division: name the missing factor, and if that fails, work the product out
     and come back to the division (PLAN §6.7). */
  function forDivision(p, d) {
    const q = p / d;
    const inner = forProduct(d, q);
    const first = mk('whatTimes', c().whatTimes(d, p), L().mul(d, q), q,
                     inner.steps.concat([mk('divSo', c().divSo(p, d), L().div(p, d), q)]));
    return { famId: 'div.' + d, steps: [first] };
  }

  function forFact(id) {
    const f = D.facts.get(id);
    if (!f) return null;
    if (f.lane === 'beyond') return D.beyond.script(id);
    if (f.op === 'mul') return forProduct(f.a, f.b);
    if (f.op === 'div') return forDivision(f.a, f.b);
    return forAddSub(f);
  }

  /* Safety-net scripts, same shape. These are the steps the multiplication
     scripts stand on, so they are worked the same way (PLAN §6.8). */
  function forAddSub(f) {
    const fam = f.family || (f.op === 'add' ? 'add.rest' : 'sub.think');
    if (f.op === 'add') {
      if (f.a === f.b && f.a >= 10) {
        const tens = Math.floor(f.a / 10) * 10, ones = f.a % 10;
        if (ones === 0) return { famId: 'add.dbl2d', steps: [sDouble(f.a / 10), sTen(f.a / 5)] };
        return { famId: 'add.dbl2d', steps: [sDouble(tens), sDouble(ones), sAdd(2 * tens, 2 * ones)] };
      }
      return { famId: fam, steps: splitAdd(f.a, f.b) || [] };
    }
    const s = splitSub(f.a, f.b);
    if (s) return { famId: fam, steps: s };
    // Think addition: b and what make a?
    return { famId: fam, steps: [mk('addUp', c().andWhatMake(f.b, f.a), L().addUnknown(f.b), f.ans)] };
  }

  return { forFact, forProduct, forDivision, cost, candidates, noteStep, stepSuccess,
           crossesTen, FAMILY_ORDER };
})();
