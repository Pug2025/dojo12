/* Dojo 12 engine — the Belt Test (PLAN §7.1). Headless and pure.
   Twenty-four cards, no rescues, one attempt a day. The attempt is stamped the
   moment it starts, so walking away from a bad one is a fail; a failed test
   still commits everything it taught and pays for every card, and its misses
   become tomorrow's hot set. */
"use strict";
D.belttest = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  function offered(key) { return D.scheduler.testOpen(key); }

  /* One attempt per table per game-day. A table the tryout or its scouts seeded
     known gets one attempt per run until the first fail, because it has never
     actually been played. */
  function canAttempt(key) {
    const t = D.scheduler.tableState(key);
    if (t.belt === 'black') return false;
    if (!offered(key)) return false;
    const day = D.u.gameDay();
    if (t.testAttemptDay !== day) return true;
    const seeded = !t.testFailed && D.facts.table(key).items
      .some(id => (M().peek(id) || {}).provisional);
    return !!seeded && t.testAttemptRun !== D.state.progress.runsToday;
  }

  function build(key) {
    const t = D.facts.table(key);
    const products = t.products.slice();
    const divisions = t.divisions.slice();
    const weakest = t.items.slice().sort((a, b) => score(a) - score(b)).slice(0, cfg.TEST_WILDCARDS);
    const ids = products.concat(divisions, weakest);
    const cards = D.u.shuffle(ids).map((id, i) => {
      const f = D.facts.get(id);
      return { id: id, kind: 'test', flip: f.op === 'mul' && Math.random() < 0.5,
               ringKind: 'redemption', slot: i };
    });
    return D.scheduler.settle(cards);
  }
  function score(id) {
    const rank = { new: 0, learning: 1, known: 2, fast: 3, auto: 4 }[M().status(id)];
    const r = M().peek(id);
    return rank * 100000 - (r && r.ewma ? r.ewma : 0);
  }

  function create(key) {
    const t = D.scheduler.tableState(key);
    t.testAttemptDay = D.u.gameDay();
    t.testAttemptRun = D.state.progress.runsToday;
    D.save.commitNow();                       // stamped at the start, before a card is seen
    const r = { key: key, cards: build(key), i: 0, correct: 0, inTime: 0, slow: 0,
                score: 0, xp: 0, missed: [], rts: [], finished: false, passed: false };

    function present() {
      const c = r.cards[r.i];
      if (!c) return null;
      const f = D.facts.get(c.id);
      return { card: c, index: r.i, total: r.cards.length,
               question: D.facts.display(c.id, c.flip),
               digits: D.u.digitsOf(f.ans),
               ringMs: M().ringMs(c.id, c.ringKind) };
    }
    function submit(value, rt) {
      const c = r.cards[r.i];
      if (!c) return null;
      const f = D.facts.get(c.id);
      const correct = Number(value) === f.ans;
      const fast = correct && rt <= M().threshold(c.id);
      r.rts.push(rt);
      M().record(c.id, { correct: correct, rt: rt, helped: false, day: D.u.gameDay() });
      const out = { kind: correct ? 'correct' : 'miss', points: 0, xp: 0, card: c, gold: false };
      if (correct) {
        r.correct++;
        if (fast) r.inTime++; else r.slow++;
        const base = cfg.BASE_SCORE * D.facts.weight(c.id);
        out.points = Math.round(base);
        r.score += out.points;
        out.xp = D.xp.answerXp(c.id);
        r.xp += out.xp;
        const rec = M().peek(c.id);
        if (rec && rec.days.length >= cfg.AUTO_DAYS && !rec.goldPaid) {
          const g = D.xp.goldXp(c.id);
          if (g) { out.gold = true; out.xp += g; r.xp += g; }
        }
      } else {
        r.missed.push(c.id);
      }
      r.i++;
      if (r.i >= r.cards.length) finish();
      out.next = present();
      out.done = r.finished;
      return out;
    }
    function timeout() { return submit('', 99999); }

    function finish() {
      if (r.finished) return result();
      r.finished = true;
      r.passed = r.correct >= cfg.TEST_PASS_CORRECT && r.inTime >= cfg.TEST_PASS_FAST;
      const t2 = D.scheduler.tableState(r.key);
      if (r.passed) {
        t2.belt = 'black';
        t2.beltDay = D.u.gameDay();
        t2.provisionalUntil = addDays(D.u.gameDay(), cfg.PROVISIONAL_DAYS);
        r.xp += D.xp.blackBeltXp();
        r.grandmaster = D.facts.TABLE_ORDER.every(k => D.scheduler.tableState(k).belt === 'black');
        if (r.grandmaster && !D.state.flags.grandmaster) {
          D.state.flags.grandmaster = true;
          r.xp += D.xp.grandmasterXp();
        }
      } else {
        t2.testFailed = true;
        // The misses become the hot set, so tomorrow's attempt is better by construction.
        t2.hot = r.missed.slice(0, cfg.HOT_SET);
        if (t2.status === 'open') t2.status = 'focus';
        if (D.state.focus.primary !== r.key && D.state.focus.secondary !== r.key) {
          D.state.focus.secondary = r.key;
        }
      }
      D.scheduler.updateBelts();
      D.save.commitNow();
      return result();
    }
    // Abandoning is a fail: the attempt is already stamped, and this commits it.
    function abandon() {
      if (r.finished) return result();
      return finish();
    }
    function result() {
      return { key: r.key, passed: r.passed, correct: r.correct, total: r.cards.length,
               slow: r.slow, score: r.score, xp: r.xp, missed: r.missed.slice(),
               grandmaster: !!r.grandmaster, medianRt: D.u.median(r.rts) };
    }

    return { present, submit, timeout, abandon, result, raw: r, isDone: () => r.finished };
  }

  function addDays(dayKey, n) {
    const d = new Date(dayKey + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return D.u.todayKey(d);
  }

  // The line after a test: the number, then what happens next.
  function failLine(res) {
    if (res.correct >= cfg.TEST_PASS_CORRECT && res.slow) {
      return D.copy.belts.failSlow(res.correct, res.total, res.slow);
    }
    return D.copy.belts.failCount(res.correct, res.total);
  }

  return { offered, canAttempt, build, create, failLine, addDays };
})();
