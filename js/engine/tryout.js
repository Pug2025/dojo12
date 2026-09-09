/* Dojo 12 engine — the tryout (PLAN §6.6). Headless.
   Two minutes at most, and it is a confidence ramp before it is a placement
   test: four guaranteed wins to open, every table probed easy before hard, a
   guaranteed win inserted after any miss, and it always ends on one. Nothing
   here writes an automaticity day; probes go to scouts{} through recordProbe. */
"use strict";
D.tryout = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  const EASY_FACTORS = [3, 4];
  const HARD_FACTORS = [6, 7, 8, 9];
  // The four safety-net probes of §6.6, interleaved and never adjacent.
  const SAFETY = ['add:8+7', 'sub:15-8', 'add:9+6', 'sub:13-6'];
  const SAFETY_AT = [5, 9, 13, 17];

  function openers() {
    // Small twos, tens and fives, other factor at most six. No ones anywhere.
    const picks = [D.facts.mulId(2, 3), D.facts.mulId(10, 4), D.facts.mulId(5, 4), D.facts.mulId(2, 6)];
    return picks;
  }
  function easyFor(key, avoid) {
    const t = D.facts.table(key);
    for (const n of D.u.shuffle(EASY_FACTORS.slice())) {
      const id = key === 'sq' ? D.facts.mulId(n, n) : D.facts.mulId(Number(key), n);
      if (D.facts.get(id) && id !== avoid) return id;
    }
    return t.products[0];
  }
  function hardFor(key) {
    for (const n of D.u.shuffle(HARD_FACTORS.slice())) {
      const id = key === 'sq' ? D.facts.mulId(n, n) : D.facts.mulId(Number(key), n);
      if (D.facts.get(id)) return id;
    }
    return D.facts.table(key).products[D.facts.table(key).products.length - 1];
  }
  function divFor(key) {
    const t = D.facts.table(key);
    return t.divisions[Math.floor(t.divisions.length / 2)];
  }

  /* The guaranteed win after a miss. Normally a fact the child has already got
     right; if the very first card went wrong there is nothing to draw on yet, so
     the smallest fact in the game stands in. */
  const FALLBACK = () => [D.facts.mulId(2, 2), D.facts.mulId(2, 3), D.facts.mulId(2, 10)];
  function fillerId(st) {
    if (st.correct.length) return D.u.choice(st.correct);
    return D.u.choice(FALLBACK());
  }

  function create() {
    const order = D.facts.TABLE_ORDER.slice();
    const st = {
      served: 0,            // probes that count toward the cap
      total: 0,             // every card shown, fillers included
      queue: [],            // upcoming cards
      results: {},          // tableKey -> { easy, hard, div, correct: [] }
      correct: [],          // facts answered correctly, the filler pool
      lastMiss: false,
      wrongEasyRun: 0,
      safetyMisses: 0,
      safetyDone: 0,
      tableIdx: 0,
      wrongHardRun: 0,
      phase: 'openers',
      openerIdx: 0,
      reprobed: {},
      reprobes: 0,
      current: null,
      finished: false,
      firstCard: true,
    };
    const openerIds = openers();
    function res(key) {
      return st.results[key] || (st.results[key] = { easy: null, hard: null, div: null, correct: [] });
    }

    /* The next card. Fillers and safety probes are woven in; everything else
       walks the table order easy, then hard, then division. */
    function next() {
      if (st.finished) return null;
      if (st.queue.length) return show(st.queue.shift());

      // A miss is never followed by another miss.
      if (st.lastMiss) {
        st.lastMiss = false;
        return show({ id: fillerId(st), kind: 'filler' });
      }
      // Safety-net probes at fixed, non-adjacent points.
      if (st.safetyDone < SAFETY.length && st.total >= SAFETY_AT[st.safetyDone] && !st.lastMiss) {
        const id = SAFETY[st.safetyDone++];
        if (D.facts.get(id)) return show({ id: id, kind: 'safety' });
      }
      if (st.phase === 'openers') {
        if (st.openerIdx < openerIds.length) {
          const id = openerIds[st.openerIdx++];
          return show({ id: id, kind: 'opener', table: tableOfOpener(id) });
        }
        st.phase = 'easyhard';
      }
      if (st.total >= cfg.TRYOUT_MAX_CARDS || st.served >= cfg.TRYOUT_MAX) return finish();
      // Two tables in a row with a wrong easy probe, or three hard probes wrong
      // in a row, and the tryout has learned what it needed to.
      if (st.wrongEasyRun >= cfg.TRYOUT_STOP_AFTER_WRONG ||
          st.wrongHardRun >= cfg.TRYOUT_STOP_AFTER_HARD) return reprobeOrFinish();

      // Breadth first: every table gets its easy and hard probe before any table
      // gets a division probe, so a strong player covers the whole grid inside
      // the card budget.
      if (st.phase === 'easyhard') {
        while (st.tableIdx < order.length) {
          const key = order[st.tableIdx];
          const r = res(key);
          if (r.easy === null) return show({ id: easyFor(key), kind: 'easy', table: key });
          if (r.easy !== 'wrong' && r.hard === null) {
            return show({ id: hardFor(key), kind: 'hard', table: key });
          }
          st.tableIdx++;
        }
        st.phase = 'div';
        st.tableIdx = 0;
      }
      if (st.phase === 'div') {
        while (st.tableIdx < order.length) {
          const key = order[st.tableIdx++];
          const r = res(key);
          if (r.easy === 'fast' && r.hard === 'fast' && r.div === null) {
            return show({ id: divFor(key), kind: 'div', table: key });
          }
        }
      }
      return reprobeOrFinish();
    }

    // A wrong easy probe next to a table that came back known is suspicious:
    // one more easy probe on a different fact before it is written off (R12).
    function reprobeOrFinish() {
      if (st.reprobes >= cfg.TRYOUT_REPROBES) return finish();
      for (let i = 0; i < order.length; i++) {
        const key = order[i];
        const r = st.results[key];
        if (!r || r.easy !== 'wrong' || st.reprobed[key]) continue;
        const before = i > 0 ? st.results[order[i - 1]] : null;
        if (before && before.easy === 'fast') {
          st.reprobed[key] = true;
          st.reprobes++;
          return show({ id: easyFor(key, null), kind: 'easy', table: key, reprobe: true });
        }
      }
      return finish();
    }

    function show(card) {
      st.current = card;
      st.total++;
      if (card.kind !== 'filler') st.served++;
      const f = D.facts.get(card.id);
      const first = st.firstCard;
      st.firstCard = false;
      return {
        id: card.id, kind: card.kind, table: card.table || null,
        question: D.facts.display(card.id, f.op === 'mul' && Math.random() < 0.5),
        flip: false,
        digits: D.u.digitsOf(f.ans),
        intro: first ? D.copy.tryout.firstCard : null,
        index: st.total,
      };
    }
    function tableOfOpener(id) {
      const f = D.facts.get(id);
      for (const key of ['2', '10', '5']) if (f.tables.indexOf(key) >= 0) return key;
      return f.tables[0];
    }

    /* One answer. Returns what the screen should do: nothing on a miss beyond a
       red flash, and a line only for a hard probe answered fast. */
    function answer(value, rt) {
      const card = st.current;
      if (!card) return null;
      const f = D.facts.get(card.id);
      const correct = Number(value) === f.ans;
      const fast = correct && rt <= M().threshold(card.id);
      const out = { correct: correct, fast: fast, line: null, flash: false, card: card };

      if (card.kind === 'safety') {
        M().recordProbe(card.id, { correct: correct, fast: fast });
        if (!correct) st.safetyMisses++;
        out.flash = false;                       // no flash at all on these
        st.lastMiss = !correct;                  // but a win still follows a miss
        return out;
      }
      M().recordProbe(card.id, { correct: correct, fast: fast });
      if (correct && st.correct.indexOf(card.id) < 0) st.correct.push(card.id);

      if (card.kind !== 'filler' && card.table) {
        const r = res(card.table);
        const grade = !correct ? 'wrong' : fast ? 'fast' : 'slow';
        if (card.kind === 'opener' || card.kind === 'easy') {
          r.easy = card.reprobe && r.easy === 'wrong' && grade !== 'wrong' ? grade : (r.easy === null || card.reprobe ? grade : r.easy);
          if (grade === 'wrong') st.wrongEasyRun++; else st.wrongEasyRun = 0;
        } else if (card.kind === 'hard') {
          r.hard = grade;
          if (grade === 'wrong') st.wrongHardRun++; else st.wrongHardRun = 0;
        } else if (card.kind === 'div') {
          r.div = grade;
        }
        if (correct) r.correct.push(card.id);
        if (card.kind === 'hard' && fast) out.line = D.copy.tryout.hardWin;
      }
      out.flash = !correct;
      st.lastMiss = !correct;
      return out;
    }

    function finish() {
      // Always end on a win.
      if (st.lastMiss) {
        st.lastMiss = false;
        return show({ id: fillerId(st), kind: 'filler' });
      }
      st.finished = true;
      return null;
    }

    return {
      next: next,
      answer: answer,
      isDone: () => st.finished,
      state: st,
      apply: () => apply(st),
      summary: () => summarize(st),
    };
  }

  /* Write the placement into the save (PLAN §6.6 outcome table). */
  function apply(st) {
    const order = D.facts.TABLE_ORDER;
    const needWork = [];
    for (const key of order) {
      const r = st.results[key];
      const t = D.scheduler.tableState(key);
      if (!r || r.easy === null) continue;
      if (r.easy === 'wrong') continue;                       // stays new
      if (r.easy === 'fast' && r.hard === 'fast') {
        t.status = 'open';
        for (const id of D.facts.table(key).products) M().seedKnown(id);
        if (r.div === 'fast') for (const id of D.facts.table(key).divisions) M().seedKnown(id);
        continue;
      }
      // Correct but slow, or hard wrong: seed what was answered, and work on it.
      t.status = 'open';
      for (const id of r.correct) M().seedKnown(id);
      needWork.push(key);
    }
    D.state.focus.primary = needWork[0] || null;
    D.state.focus.secondary = needWork[1] || null;
    for (const key of needWork.slice(0, 2)) D.scheduler.tableState(key).status = 'focus';

    if (st.safetyMisses >= cfg.SAFETY_TRIGGER_PROBES) activateSafety();
    D.state.flags.tryoutDone = true;
    D.scheduler.ensureProgression();
    D.save.commit();
    return summarize(st);
  }

  // The lane itself is owned by the scheduler; the tryout only decides to open it.
  function activateSafety() { D.scheduler.activateSafety(); }

  function summarize(st) {
    const open = D.facts.TABLE_ORDER.filter(k => D.scheduler.isOpen(k));
    const next = D.scheduler.nextUnopened();
    return { open: open, next: next, cards: st.total, probes: st.served,
             safetyMisses: st.safetyMisses, results: st.results };
  }

  return { create, apply, activateSafety, openers, fillerId, SAFETY };
})();
