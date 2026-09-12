/* Dojo 12 engine — the black belt test (rework 2026-09-10). Headless and pure.
   It opens when the brown belt has its fourth stripe. Twenty-four cards from
   across the grid, the child's sixteen weakest questions and eight more, no
   rescues, one attempt a day. Pass with twenty-two right and twenty of them
   fast. The attempt is stamped the moment it starts, so walking away from a bad
   one is a fail; a failed test still commits everything it taught and pays for
   every card. */
"use strict";
D.belttest = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  function offered() { return D.belt.info().step >= D.belt.lastStep() && !D.belt.state().black; }
  function canAttempt() { return D.belt.testOpen(); }

  function weakness(id) {
    const rank = { new: 0, learning: 1, known: 2, fast: 3, auto: 4 }[M().status(id)];
    const r = M().peek(id);
    return M().dots(id) * 1000000 + rank * 100000 - (r && r.ewma ? Math.min(r.ewma, 99999) : 0);
  }
  function build() {
    const ranked = D.belt.coreIds().sort((a, b) => weakness(a) - weakness(b));
    const weak = ranked.slice(0, cfg.TEST_WEAK);
    const rest = D.u.shuffle(ranked.slice(cfg.TEST_WEAK)).slice(0, cfg.TEST_CARDS - weak.length);
    const cards = D.u.shuffle(weak.concat(rest)).map((id, i) => {
      const f = D.facts.get(id);
      return { id: id, kind: 'test', flip: f.op === 'mul' && Math.random() < 0.5,
               ringKind: 'redemption', slot: i };
    });
    const settled = D.scheduler.settle(cards);
    return Array.isArray(settled) ? settled : cards;
  }

  function create() {
    const day = D.u.gameDay();
    D.belt.stampTest(day);
    D.save.commitNow();                       // stamped at the start, before a card is seen
    const r = { key: 'black', cards: build(), i: 0, correct: 0, inTime: 0, slow: 0,
                score: 0, xp: 0, coins: 0, missed: [], rts: [], finished: false, passed: false };

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
      const correct = D.facts.check(c.id, value);
      const fast = correct && rt <= M().threshold(c.id);
      r.rts.push(rt);
      const rec = M().record(c.id, { correct: correct, rt: rt, helped: false, day: D.u.gameDay() });
      const out = { kind: correct ? 'correct' : 'miss', points: 0, xp: 0, coins: 0, card: c,
                    dot: !!rec.dotFilled, bothDots: !!rec.bothDots };
      if (correct) {
        r.correct++;
        if (fast) r.inTime++; else r.slow++;
        out.points = Math.round(cfg.BASE_SCORE * D.facts.weight(c.id));
        r.score += out.points;
        out.xp = D.xp.answerXp(c.id);
        r.xp += out.xp;
        out.coins = D.xp.addCoins(cfg.COINS_PER_CORRECT);
        r.coins += out.coins;
        if (rec.bothDots) D.state.progress.doneThisWeek = (D.state.progress.doneThisWeek || 0) + 1;
      } else {
        r.missed.push(c.id);
      }
      r.i++;
      // Every card is saved as it lands, so closing the app mid-test keeps the
      // misses and the test's own record (exploit review 2026-09-10).
      if (r.i < r.cards.length) {
        D.state.flags.testProgress = { key: r.key, day: D.u.gameDay(), correct: r.correct,
                                      served: r.i, total: r.cards.length, rts: r.rts.slice() };
        D.save.commitNow();
      }
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
      r.belt = [];
      if (r.passed) {
        const ev = D.belt.passBlack(D.u.gameDay());
        if (ev) { r.belt.push(ev); r.coins += ev.coins; }
      }
      D.state.tests.push({ day: D.u.gameDay(), key: r.key, passed: r.passed,
                           correct: r.correct, total: r.cards.length,
                           medianRt: D.u.median(r.rts) });
      while (D.state.tests.length > 100) D.state.tests.shift();
      D.state.flags.testProgress = null;
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
               slow: r.slow, score: r.score, xp: r.xp, coins: r.coins, missed: r.missed.slice(),
               belt: (r.belt || []).slice(), medianRt: D.u.median(r.rts) };
    }

    return { present, submit, timeout, abandon, result, raw: r, isDone: () => r.finished };
  }

  // The line after a failed test: the number, then what happens next.
  function failLine(res) {
    if (res.correct >= cfg.TEST_PASS_CORRECT && res.slow) {
      return D.copy.belt.failSlow(res.correct, res.total, res.slow);
    }
    return D.copy.belt.failCount(res.correct, res.total);
  }

  return { offered, canAttempt, build, create, failLine };
})();
