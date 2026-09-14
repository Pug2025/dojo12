/* Dojo 12 engine — round 1 (rework 2026-09-10). Headless.
   The first round plays like every other round: points, a streak, its cards
   along the top, and after a miss the right answer is shown and typed. No timer,
   because nothing is known yet about how fast this child is. Behind it the
   tryout (PLAN §6.6) picks the cards, so round 1 still finds where the child
   starts. When the tryout has what it needs before card twenty, the rest are easy
   wins; when card twenty comes first, the tables it never reached are tried by
   scout cards in the next rounds (D.scheduler placement). Answers go on the
   record like any other round's. run.js renders this through the same calls it
   uses for D.runstate. */
"use strict";
D.roundone = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  function dropTier(combo) {
    const idx = Math.min(Math.floor(combo / cfg.COMBO_STEP), cfg.COMBO_TIERS.length - 1);
    return Math.max(0, idx - 1) * cfg.COMBO_STEP;
  }

  function create(opts) {
    const o = opts || {};
    const tr = D.tryout.create({ noSafety: true });
    const N = cfg.ROUND_ONE_CARDS;
    // The placement runs behind PLACEMENT_ROUNDS rounds of five (§13.3); the second
    // picks up the tryout where the first left it.
    const half = D.state.placementHalf || null;
    const r = {
      roundOne: true, roundNo: half ? (half.roundsDone || 0) + 1 : 1,
      cards: [], i: 0, phase: 'card', day: D.u.gameDay(),
      score: 0, combo: (D.state.progress && D.state.progress.carryCombo) || 0, bestCombo: 0, served: 0, correct: 0,
      xpGained: 0, coinsGained: 0, fastNew: [], sealedIds: [], unsealed: [], gotBack: [], missed: [], rts: [],
      fastestFact: null, cardOvertime: false, finished: false, tryoutDone: false, cut: false,
      coinsAnswers: 0, coinsBonus: 0, pbFacts: [], carryComebacks: [], carryRetries: [],
      levelAtStart: D.xp.levelFor(D.state.progress.xp).level,
    };
    r.bestCombo = r.combo;
    if (half && !o.resume) { Object.assign(tr.state, half.tryout || {}); r.tryoutDone = !!half.tryoutDone; }
    for (let i = 0; i < N; i++) r.cards.push({ id: null, kind: 'roundone', slot: i, ringKind: null, last: i === N - 1 });
    let current = null;
    // Picked up where it was left: the cards so far, the placement questions
    // behind them, and the card on the screen. Without this, leaving round 1 or
    // closing the app started it again from card one and lost every answer
    // (code review 2026-09-12).
    if (o.resume) {
      for (const k of Object.keys(o.resume.round || {})) r[k] = o.resume.round[k];
      Object.assign(tr.state, o.resume.tryout || {});
      current = o.resume.current || null;
      r.day = D.u.gameDay();
    }

    // An easy win once the tryout is done: something already answered right this
    // round, or a small two or ten. Never the card just shown, never a third time.
    function easyWin() {
      const pool = tr.state.correct.slice();
      for (const key of ['2', '10']) {
        for (const id of D.facts.table(key).products) {
          const f = D.facts.get(id);
          if (Math.min(f.a, f.b) <= 5) pool.push(id);
        }
      }
      const prev = r.i > 0 ? r.cards[r.i - 1].id : null;
      const prevAns = prev ? D.facts.get(prev).ans : null;
      const seen = {};
      for (const c of r.cards) if (c.id) seen[c.id] = (seen[c.id] || 0) + 1;
      const fresh = D.u.shuffle(Array.from(new Set(pool)))
        .filter(id => id !== prev && (seen[id] || 0) < 2 && D.facts.get(id).ans !== prevAns);
      const id = fresh[0] || D.facts.mulId(2, 3);
      const f = D.facts.get(id);
      const flip = f.op === 'mul' && Math.random() < 0.5;
      return { id: id, kind: 'win', question: D.facts.display(id, flip), flip: flip, fromTryout: false };
    }
    function draw() {
      let c = null;
      if (!r.tryoutDone) {
        c = tr.next();
        if (c) c.fromTryout = true;
        else r.tryoutDone = true;
      }
      return c || easyWin();
    }

    function present() {
      if (r.finished) return null;
      if (!current) {
        current = draw();
        Object.assign(r.cards[r.i], { id: current.id, flip: !!current.flip, kind: current.fromTryout ? 'roundone' : 'win' });
      }
      const c = r.cards[r.i], f = D.facts.get(c.id);
      return {
        card: c, index: r.i, total: N, question: current.question,
        digits: D.u.digitsOf(f.ans), ringMs: null, last: !!c.last,
        comeback: false, redemption: false, phase: r.phase, combo: r.combo, score: r.score,
        overtime: false, intro: current.intro || null,
      };
    }

    function submit(value, rt) {
      if (r.phase !== 'card' || !current) return null;
      const c = r.cards[r.i];
      const correct = D.facts.check(c.id, value);
      r.served++;
      r.rts.push(rt);
      if (current.fromTryout) tr.answer(value, rt);
      const rec = M().record(c.id, { correct: correct, rt: rt, day: r.day });
      if (!correct) {
        // The combo drops a tier, and the answer is shown to be typed for nothing.
        r.combo = dropTier(r.combo);
        r.missed.push(c.id);
        r.phase = 'reveal';
        return { kind: 'miss', card: c, rt: rt, points: 0, xp: 0, coins: 0, reveal: true,
                 buttons: false, line: null };
      }
      r.correct++;
      r.combo++;
      if (r.combo > r.bestCombo) r.bestCombo = r.combo;
      const base = cfg.BASE_SCORE * D.facts.weight(c.id) * (c.last ? cfg.LAST_CARD_MULT : 1);
      const out = { kind: 'correct', card: c, rt: rt, marks: [], line: null,
                    points: Math.round(base * D.runstate.comboMult(r.combo)),
                    stamped: !!rec.stamped && !rec.sealed, sealed: !!rec.sealed, fast: !!rec.wasFast };
      r.score += out.points;
      out.xp = D.xp.answerXp(c.id);
      r.xpGained += out.xp;
      out.coins = D.xp.addCoins(cfg.COINS_PER_CORRECT);
      r.coinsGained += out.coins;
      if (rec.stamped && !rec.sealed) r.fastNew.push(c.id);
      if (rec.sealed) r.sealedIds.push(c.id);
      if (!r.fastestFact || rt < r.fastestFact.ms) r.fastestFact = { id: c.id, ms: rt };
      return advance(out);
    }
    function revealInfo() {
      const c = r.cards[r.i];
      if (!c || !c.id) return null;
      const f = D.facts.get(c.id);
      return { kind: 'reveal', line: D.copy.rescue.showAnswer(c.id, c.flip), answer: f.ans,
               input: f.input || 'number' };
    }
    function typedAnswer(value) {
      if (r.phase !== 'reveal') return null;
      const c = r.cards[r.i];
      if (!D.facts.check(c.id, value)) return Object.assign(revealInfo(), { again: true });
      M().rec(c.id).helpedLast = true;
      r.phase = 'card';
      return advance({ kind: 'revealed', points: 0 });
    }
    // The miss path is the shown answer; there is no Rescue in round 1.
    function chooseSkip() {
      if (r.phase === 'card' && current) return submit('', 99999);
      return r.phase === 'reveal' ? revealInfo() : null;
    }
    function advance(out) {
      r.i++;
      current = null;
      r.phase = 'card';
      if (r.i >= N) {
        r.finished = true;
        // Cut short: the tryout still had tables to try when the cards ran out.
        r.cut = !tr.isDone();
      }
      out.next = r.finished ? null : present();
      out.done = r.finished;
      return out;
    }

    function summary() {
      const shown = ids => Array.from(new Set(ids)).filter(id => {
        const f = D.facts.get(id);
        return f && f.lane !== 'addsub';
      });
      return {
        score: r.score, correct: r.correct, unaided: r.correct, cards: r.served,
        xp: r.xpGained, coins: r.coinsGained, fastNew: shown(r.fastNew), sealed: shown(r.sealedIds),
        unsealed: [], gotBack: [], missed: r.missed.slice(), bestCombo: r.bestCombo,
        medianRt: D.u.median(r.rts), fastestFact: r.fastestFact, day: r.day, table: null,
        fastWrongs: 0, counted: r.correct >= cfg.RUN_MIN_CORRECT, roundOne: true, roundNo: r.roundNo,
        pbFacts: [], coinsAnswers: r.coinsGained, coinsBonus: 0, combo: r.combo,
        carryComebacks: [], carryRetries: [],
      };
    }

    const self = {
      raw: r, tryout: tr, present: present, submit: submit, timeout: () => null,
      typedAnswer: typedAnswer, revealInfo: revealInfo, chooseSkip: chooseSkip,
      chooseRescue: () => null, currentStep: () => null,
      comboMult: () => D.runstate.comboMult(r.combo), isDone: () => r.finished,
      summary: summary,
      snapshot: () => r.finished ? null : JSON.parse(JSON.stringify({ roundOne: true, round: r, tryout: tr.state, current: current })),
    };
    self.finish = () => finishRound(self);
    return self;
  }

  /* Close a placement round. Before the last one, the tryout is kept for the next
     round and the round is scored like any other (§13.3). */
  function finishRound(ro) {
    const sum = ro.summary();
    const tr = ro.tryout, st = tr.state;
    const s = D.state;
    const roundsDone = ro.raw.roundNo;
    if (roundsDone < cfg.PLACEMENT_ROUNDS) {
      s.placementHalf = { tryout: JSON.parse(JSON.stringify(st)), roundsDone: roundsDone, tryoutDone: ro.raw.tryoutDone };
      s.runs.push({ day: sum.day, table: null, score: sum.score, correct: sum.correct,
                    cards: sum.cards, medianRt: sum.medianRt, roundOne: true });
      while (s.runs.length > cfg.RUNS_KEPT) s.runs.shift();
      s.progress.carryCombo = sum.combo;
      s.progress.fastToday = (s.progress.fastToday || 0) + sum.fastNew.length;
      s.progress.runsToday = (s.progress.runsToday || 0) + 1;
      s.inRun = null;
      D.save.commit();
      sum.extra = { pbs: [], belt: [] };
      sum.placementContinues = true;
      sum.coinsBelt = 0; sum.levelUp = 0;
      return sum;
    }
    s.placementHalf = null;
    const placed = tr.apply();
    // Tables with no easy question yet, when the stop rules had not already said
    // enough: those were cut off by the card count, not by the child.
    const stopped = st.wrongEasyRun >= cfg.TRYOUT_STOP_AFTER_WRONG || st.wrongHardRun >= cfg.TRYOUT_STOP_AFTER_HARD;
    const untried = D.facts.TABLE_ORDER.filter(k => !D.scheduler.isOpen(k) && !(st.results[k] && st.results[k].easy));
    D.state.placement = {
      tables: ro.raw.cut && !stopped ? untried : [],
      safety: D.tryout.drawSafety(), safetyMisses: 0,
      runsLeft: cfg.PLACEMENT_RUNS, results: {}, pending: {},
    };
    s.runs.push({ day: sum.day, table: null, score: sum.score, correct: sum.correct,
                  cards: sum.cards, medianRt: sum.medianRt, roundOne: true });
    while (s.runs.length > cfg.RUNS_KEPT) s.runs.shift();
    const extra = { pbs: [], belt: [] };
    const levelBefore = typeof ro.raw.levelAtStart === 'number' ? ro.raw.levelAtStart : D.xp.levelFor(s.progress.xp).level;
    if (sum.counted) D.xp.creditDay(sum.day);
    // Placement rounds set no personal best: they are longer or shorter than a real
    // round and were setting records a real round could never beat (audit 2026-09-14).
    D.scheduler.ensureProgression();
    extra.belt = D.belt.update();
    sum.coinsBelt = extra.belt.reduce((n, e) => n + e.coins, 0);
    sum.coins += sum.coinsBelt;
    sum.levelUp = D.xp.levelFor(s.progress.xp).level > levelBefore ? D.xp.levelFor(s.progress.xp).level : 0;
    s.progress.carryCombo = sum.combo;
    s.progress.fastToday = (s.progress.fastToday || 0) + sum.fastNew.length;
    s.progress.sealedToday = (s.progress.sealedToday || 0) + sum.sealed.length;
    s.progress.runsToday = (s.progress.runsToday || 0) + 1;
    s.inRun = null;
    D.save.commit();
    sum.extra = extra;
    sum.placed = placed;
    return sum;
  }

  return { create, finishRound };
})();
