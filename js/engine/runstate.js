/* Dojo 12 engine — the run, as pure state (PLAN §6.5, §6.7, §7.3). Headless.
   Owns the card cursor, score, combo, the rescue walkthrough, the comeback
   queue, the promote re-serves, the hidden bonus card and redemption. run.js
   only binds this to the screen, so every reward path can be tested without a
   browser. Nothing here pays anything except through a correct typed answer. */
"use strict";
D.runstate = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  function comboMult(combo) {
    const idx = Math.min(Math.floor(combo / cfg.COMBO_STEP), cfg.COMBO_TIERS.length - 1);
    return cfg.COMBO_TIERS[idx];
  }

  function create(plan, opts) {
    const o = opts || {};
    const r = {
      cards: plan.cards.slice(),
      day: plan.day || D.u.gameDay(),
      i: 0,
      phase: 'card',
      score: 0, combo: 0, bestCombo: 0,
      served: 0, correct: 0, unaided: 0, unaidedCards: 0,
      xpGained: 0, coinsGained: 0,
      dotted: [], done: [], gotBack: [], missed: [], rts: [],
      outOfTimeShown: false, fastWrongs: 0,
      slipUsed: false, cardHelped: false, cardFastWrong: false, cardStepRetried: false,
      cardDiagnosis: null, rescue: null, pending: [], cardOvertime: false,
      spares: (plan.spares || []).slice(),
      redemption: false, redemptionQueue: [], finished: false,
      counted: false, table: o.table || null,
    };
    // A run that was interrupted comes back exactly where it was (PLAN §7.2).
    if (o.resume) for (const k of Object.keys(o.resume)) r[k] = o.resume[k];
    // A run saved mid-miss (closed at the buttons, in a rescue, or on the shown
    // answer) comes back on the shown answer for nothing. Coming back clean handed
    // the card out again with the answer already seen (exploit review 2026-09-10).
    if (o.resume && (r.phase === 'miss' || r.phase === 'rescue' || r.phase === 'reveal')) {
      r.phase = 'reveal'; r.cardHelped = true; r.rescue = null;
    }

    /* ---- presentation ---- */
    function card() { return r.cards[r.i] || null; }
    function fact() { const c = card(); return c ? D.facts.get(c.id) : null; }
    function ringMs(c) {
      if (!c || !c.ringKind) return null;
      return M().ringMs(c.id, c.ringKind);
    }
    function present() {
      const c = card();
      if (!c) return null;
      const f = D.facts.get(c.id);
      return {
        card: c, index: r.i, total: r.cards.length,
        question: D.facts.display(c.id, c.flip),
        digits: D.u.digitsOf(f.ans),
        ringMs: ringMs(c),
        last: !!c.last, comeback: c.kind === 'comeback', redemption: c.kind === 'redemption',
        phase: r.phase, combo: r.combo, score: r.score, overtime: !!r.cardOvertime,
      };
    }

    /* ---- slot substitution: comebacks and promote re-serves replace an
       upcoming maintenance or due slot, so a run is always twenty cards. ---- */
    function replaceable(j, loose) {
      const c = r.cards[j];
      if (!c || j <= r.i || j >= r.cards.length - 1) return false;
      if (c.last || c.bonus || c.inserted || c.kind === 'warmup' || c.kind === 'scout') return false;
      if (c.kind === 'maintenance' || c.kind === 'due') return true;
      return !!loose && c.kind === 'promote';
    }
    function insert(newCard, minOff, maxOff) {
      const from = r.i + minOff, to = Math.min(r.i + maxOff, r.cards.length - 2);
      for (const loose of [false, true]) {
        for (let j = from; j <= to; j++) if (replaceable(j, loose)) return place(j, newCard);
        for (let j = r.i + 1; j < r.cards.length - 1; j++) if (replaceable(j, loose)) return place(j, newCard);
      }
      return -1;
    }
    function place(j, newCard) {
      newCard.slot = j; newCard.inserted = true;
      r.cards[j] = newCard;
      return j;
    }

    /* ---- scoring ---- */
    function baseFor(c, rt) {
      let base = cfg.BASE_SCORE * D.facts.weight(c.id);
      const ring = ringMs(c);
      if (ring) base += cfg.RING_BONUS * D.u.clamp(1 - rt / ring, 0, 1);
      return base;
    }
    function payCorrect(c, rt, overtime) {
      const out = { points: 0, xp: 0, coins: 0, marks: [] };
      let base = baseFor(c, rt);
      if (c.last) base *= cfg.LAST_CARD_MULT;
      if (c.bonus) base *= cfg.BONUS_MULT;
      // After the ring ran out: base points, no combo multiplier, no comeback double.
      if (overtime) out.points = Math.round(base);
      else if (c.kind === 'comeback') out.points = Math.round(base * (c.comebackMult || cfg.COMEBACK_MULT));
      else if (c.kind === 'redemption') out.points = Math.round(baseFor(c, rt));
      else if (c.slipRepair) out.points = Math.round(baseFor(c, rt));
      else out.points = Math.round(base * comboMult(r.combo));
      r.score += out.points;
      if (c.bonus) { out.coins += cfg.BONUS_COINS; out.marks.push('bonus'); }
      return out;
    }
    function gainXp(n) { r.xpGained += n; }
    function gainCoins(n) { r.coinsGained += n; D.xp.addCoins(n); }

    /* ---- the answer ---- */
    function submit(value, rt) {
      if (r.phase !== 'card') return null;
      const c = card(), f = D.facts.get(c.id);
      const given = value === '' || value === null || value === undefined ? null : value;
      const correct = D.facts.check(c.id, value);
      // Answered well after the ring emptied on a card that stays up: the same as
      // timeout() having fired, for callers that never ran the clock.
      const ring = ringMs(c);
      if (ring && rt > ring + cfg.RING_GRACE_MS && overtimeKind(c)) r.cardOvertime = true;
      r.served++;
      r.rts.push(rt);
      return correct ? onCorrect(c, f, rt) : onWrong(c, f, rt, given, false);
    }
    function overtimeKind(c) { return cfg.RING_OVERTIME_KINDS.indexOf(c.ringKind) >= 0; }
    /* On a question still slow for this child an emptied ring leaves the card up:
       it still takes the answer, for base points and no combo step. On a fast or
       gold question it is a miss (Jamie, rework 2026-09-10). */
    function timeout() {
      if (r.phase !== 'card') return null;
      const c = card(), f = D.facts.get(c.id);
      if (overtimeKind(c)) {
        if (r.cardOvertime) return null;
        r.cardOvertime = true;
        return { kind: 'overtime', card: c };
      }
      const ring = ringMs(c) || 0;
      r.served++;
      return onWrong(c, f, ring + cfg.RING_GRACE_MS, null, true);
    }

    function onCorrect(c, f, rt) {
      const out = { kind: 'correct', card: c, rt: rt, points: 0, xp: 0, coins: 0, marks: [],
                    dot: false, bothDots: false, line: null, comeback: c.kind === 'comeback' };
      // Scouts are invisible: they score like any card and move the combo not at all.
      if (c.kind === 'scout') {
        D.scheduler.noteScout(c.id, true, rt <= M().threshold(c.id));
        out.points = Math.round(baseFor(c, rt) * comboMult(r.combo));
        r.score += out.points;
        r.correct++;
        return advance(out);
      }
      const helped = r.cardHelped || c.kind === 'redemption' || !!c.slipRepair;
      const before = M().peek(c.id);
      const beforeBest = before ? before.best : null;
      const rec = M().record(c.id, { correct: true, rt: rt, helped: helped, day: r.day,
                                     warmup: c.kind === 'warmup', comeback: c.kind === 'comeback' });
      r.correct++;
      if (!helped) { r.unaided++; }
      // A slip's re-serve holds the combo where it was, as decided in step 1, and so
      // does an answer given after the ring ran out.
      const overtime = !!r.cardOvertime;
      if (!c.slipRepair && !overtime) {
        r.combo++;
        if (r.combo > r.bestCombo) r.bestCombo = r.combo;
      }
      const pay = payCorrect(c, rt, overtime);
      out.points = pay.points; out.marks = pay.marks; out.coins += pay.coins;
      if (pay.coins) gainCoins(pay.coins);

      if (!helped) {
        out.xp = D.xp.answerXp(c.id);
        gainXp(out.xp);
        gainCoins(cfg.COINS_PER_CORRECT);
        out.coins += cfg.COINS_PER_CORRECT;
        if (!r.fastestFact || rt < r.fastestFact.ms) r.fastestFact = { id: c.id, ms: rt };
        // Beating this question's best time is marked, never paid. Paid, answering
        // slowly on purpose and shaving a little each time was worth doing.
        if (beforeBest !== null && before && before.ok >= cfg.GHOST_MIN_ATTEMPTS &&
            rt <= beforeBest - cfg.GHOST_BEAT_MS && M().isFastRt(c.id, rt)) {
          out.marks.push('pb');
        }
      }
      // A dot filled, and both dots filled: the in-run moments about learning.
      if (rec.dotFilled) { out.dot = true; r.dotted.push(c.id); }
      if (rec.bothDots) {
        out.bothDots = true;
        r.done.push(c.id);
        D.state.progress.doneThisWeek = (D.state.progress.doneThisWeek || 0) + 1;
      }
      if (c.kind === 'comeback') { out.line = D.copy.run.comebackWin; r.gotBack.push(c.id); }
      if (c.bonus) out.line = D.copy.run.bonus;
      trimRepeats(c, false);
      dropFromRedemption(c.id);
      return advance(out);
    }

    /* A booked repeat keeps its card only while it has a job: the fact is still
       slow for this child, or a fast answer today would still add a day. Otherwise
       the card goes to a fact this run is not serving. After a miss the comeback
       is the repeat, so the booked ones go. Taken whatever happened, they served
       4 × 4 three times in one round (rework 2026-09-10). */
    function trimRepeats(c, missed) {
      if (c.kind !== 'promote') return;
      if (!missed && (M().status(c.id) === 'known' || M().canCountToday(c.id, r.day))) return;
      for (let j = r.i + 1; j < r.cards.length; j++) {
        const o = r.cards[j];
        if (!o || o.id !== c.id || !o.repeat || o.last) continue;
        const sub = spareFor(j);
        if (!sub) continue;
        sub.slot = j; sub.bonus = o.bonus;
        r.cards[j] = sub;
      }
    }
    function spareFor(j) {
      const near = [r.cards[j - 1], r.cards[j + 1]].filter(Boolean);
      const k = r.spares.findIndex(id => {
        const ans = D.facts.get(id).ans;
        if (near.some(o => o.id === id || D.facts.get(o.id).ans === ans)) return false;
        return !r.cards.some((o, idx) => idx > r.i && o.id === id);
      });
      if (k < 0) return null;
      return D.scheduler.card(r.spares.splice(k, 1)[0], 'maintenance');
    }

    function onWrong(c, f, rt, given, timedOut) {
      const out = { kind: 'miss', card: c, rt: rt, timeout: !!timedOut, points: 0, xp: 0,
                    line: null, buttons: false, slip: false, mandatory: false };
      // Scouts stay silent both ways and never touch the combo.
      if (c.kind === 'scout') {
        D.scheduler.noteScout(c.id, false, false);
        out.silent = true;
        return advance(out);
      }
      // A slip on a retrieved fact is repaired by retrieval, not derivation.
      const st = M().status(c.id);
      if (!r.slipUsed && !c.slipRepair && (st === 'fast' || st === 'auto') && !timedOut) {
        r.slipUsed = true;
        out.slip = true;
        // A slip goes on the fact's record; only a second miss costs a day.
        // The re-serve carries no bonus: a bonus card answered wrong has lost it
        // (exploit review 2026-09-10).
        M().record(c.id, { correct: false, rt: rt, day: r.day, slip: true });
        const again = D.scheduler.card(c.id, c.kind);
        again.flip = c.flip; again.slipRepair = true; again.last = c.last; again.bonus = false;
        again.slot = r.i;
        r.cards.splice(r.i + 1, 0, again);
        // The re-serve takes a slot rather than lengthening the run, but never a
        // comeback's: if nothing else can go, the run is one card longer
        // (review 2026-09-10).
        let drop = -1;
        for (let j = r.i + 2; j < r.cards.length - 1; j++) if (replaceable(j, true)) { drop = j; break; }
        if (drop >= 0) r.cards.splice(drop, 1);
        for (let j = 0; j < r.cards.length; j++) r.cards[j].slot = j;
        return advance(out);
      }
      const fastWrong = !timedOut && rt < M().fastWrongMs(c.id);
      if (fastWrong) {
        r.fastWrongs++;
        r.cardFastWrong = true;
        (D.state.progress.fastWrongs7d = D.state.progress.fastWrongs7d || []).push(r.day);
      }
      M().record(c.id, { correct: false, rt: rt, day: r.day });
      trimRepeats(c, true);
      // A warm-up is the ramp, not the test: missing one costs the card, never
      // the combo, so card four is never reached at nothing (PLAN §2, §6.5).
      if (c.kind === 'warmup') { /* the combo holds */ }
      else if (fastWrong) { r.combo = 0; }
      else { dropCombo(); }
      r.cardMissed = true;
      const diag = D.diagnose.read(c.id, given === null ? null : Number(given), { timeout: timedOut });
      r.cardDiagnosis = diag;
      if (timedOut && !r.outOfTimeShown) { r.outOfTimeShown = true; out.line = D.copy.run.outOfTime; }
      if (fastWrong && r.fastWrongs === 2) out.mandatory = true;
      if (fastWrong && r.fastWrongs >= 2) out.line = out.line || D.copy.run.slowDown;
      out.buttons = true;
      out.mandatory = out.mandatory || false;
      // The one line that explains what Rescue is, above the buttons, once ever.
      if (!D.state.flags.firstRescueShown) {
        D.state.flags.firstRescueShown = true;
        out.intro = D.copy.rescue.first;
      }
      r.phase = 'miss';
      queueRedemption(c.id);
      return out;
    }
    function dropCombo() {
      const idx = Math.min(Math.floor(r.combo / cfg.COMBO_STEP), cfg.COMBO_TIERS.length - 1);
      r.combo = Math.max(0, idx - 1) * cfg.COMBO_STEP;
    }

    /* ---- rescue ---- */
    function chooseRescue() {
      if (r.phase !== 'miss') return null;
      const c = card();
      const script = D.scripts.forFact(c.id);
      if (!script || !script.steps.length) return chooseSkip(true);
      r.rescue = { famId: script.famId, steps: script.steps.slice(), at: 0, retried: false,
                   sub: null, subAt: 0, failedTwice: false };
      r.phase = 'rescue';
      r.cardHelped = true;
      return { kind: 'rescue', diagnosis: (r.cardDiagnosis && r.cardDiagnosis.line) || null,
               step: currentStep() };
    }
    function currentStep() {
      const rc = r.rescue;
      if (!rc) return null;
      if (rc.sub) return rc.sub[rc.subAt];
      return rc.steps[rc.at];
    }
    function stepSubmit(value) {
      if (r.phase !== 'rescue') return null;
      const rc = r.rescue, step = currentStep();
      const ok = Number(value) === step.answer;
      D.scripts.noteStep(rc.famId, ok);
      if (ok) {
        if (rc.sub) {
          rc.subAt++;
          if (rc.subAt < rc.sub.length) return { kind: 'step', step: currentStep() };
          rc.sub = null; rc.subAt = 0; rc.at++;
        } else {
          rc.at++;
        }
        if (rc.at < rc.steps.length) return { kind: 'step', step: currentStep() };
        return finishRescue();
      }
      // Wrong once: the same step in a simpler form. Wrong twice: its value, typed.
      rc.retried = true;
      r.cardStepRetried = true;
      D.scheduler.noteStepMiss(step.kind, r.day);
      if (!rc.sub && step.simpler && step.simpler.length) {
        rc.sub = step.simpler.slice(); rc.subAt = 0;
        return { kind: 'step', step: currentStep() };
      }
      rc.failedTwice = true;
      return { kind: 'stepValue', line: D.copy.rescue.stepValue(step.label, step.answer),
               step: { prompt: step.prompt, label: step.label, answer: step.answer, forced: true } };
    }
    function stepForced(value) {
      const rc = r.rescue, step = currentStep();
      if (Number(value) !== step.answer) return { kind: 'stepValue', step: step, again: true,
        line: D.copy.rescue.stepValue(step.label, step.answer) };
      rc.failedTwice = false;
      if (rc.sub) { rc.sub = null; rc.subAt = 0; }
      rc.at++;
      if (rc.at < rc.steps.length) return { kind: 'step', step: currentStep() };
      return finishRescue();
    }
    function finishRescue() {
      const c = card(), rc = r.rescue;
      const clean = !rc.retried;
      const zeroPaid = !clean || r.fastWrongs >= 3;
      const points = zeroPaid ? 0 : cfg.RESCUE_SCORE;
      r.score += points;
      M().record(c.id, { correct: true, rt: null, helped: true, day: r.day });
      r.phase = 'card';
      const out = { kind: 'rescued', points: points, line: D.copy.rescue.done, clean: clean };
      // A comeback three to six cards later, gold-bordered, worth double unless
      // the miss was rushed or a step needed a retry.
      if (r.fastWrongs < 3 || !r.cardFastWrong) queueComeback(c, clean);
      r.rescue = null;
      return advance(out);
    }
    function queueComeback(c, clean) {
      const back = D.scheduler.card(c.id, 'comeback');
      back.flip = c.flip;
      back.ringKind = 'comeback';
      const diagMult = r.cardDiagnosis ? r.cardDiagnosis.comebackMult : cfg.COMEBACK_MULT;
      back.comebackMult = (clean && !r.cardFastWrong) ? diagMult : 1;
      const at = insert(back, cfg.COMEBACK_MIN, cfg.COMEBACK_MAX);
      if (at >= 0) dropFromRedemption(c.id);
    }

    /* ---- skip and the shown answer ---- */
    function chooseSkip(fromEmptyScript) {
      if (r.phase !== 'miss' && r.phase !== 'rescue') return null;
      const c = card();
      r.cardHelped = true;
      // A skip resets the combo. Being shown the answer because the fact has no
      // walkthrough is not a skip: the miss already cost a tier.
      if (!fromEmptyScript) r.combo = 0;
      r.phase = 'reveal';
      r.rescue = null;
      const f = D.facts.get(c.id);
      return { kind: 'reveal', line: D.copy.rescue.showAnswer(c.id, c.flip),
               answer: f.ans, input: f.input || 'number', forced: !!fromEmptyScript };
    }
    function typedAnswer(value) {
      if (r.phase !== 'reveal') return null;
      const c = card(), f = D.facts.get(c.id);
      if (!D.facts.check(c.id, value)) return { kind: 'reveal', again: true, answer: f.ans,
                                               line: D.copy.rescue.showAnswer(c.id, c.flip) };
      const rec = M().rec(c.id);
      rec.helpedLast = true;
      r.phase = 'card';
      return advance({ kind: 'revealed', points: 0 });
    }

    /* ---- redemption (PLAN §6.5) ---- */
    function queueRedemption(id) {
      if (r.fastWrongs >= 3 && r.cardFastWrong) return;
      if (!r.redemptionQueue.includes(id)) r.redemptionQueue.push(id);
      if (!r.missed.includes(id)) r.missed.push(id);
    }
    function dropFromRedemption(id) {
      const j = r.redemptionQueue.indexOf(id);
      if (j >= 0) r.redemptionQueue.splice(j, 1);
    }

    /* ---- cursor ---- */
    function advance(out) {
      r.i++;
      r.slipUsed = false; r.cardHelped = false; r.cardFastWrong = false;
      r.cardStepRetried = false; r.cardMissed = false; r.cardDiagnosis = null; r.cardOvertime = false;
      r.phase = 'card';
      if (r.i >= r.cards.length) startRedemptionOrFinish(out);
      out.next = present();
      out.done = r.finished;
      // A run counts toward the day's runs once the child is four cards in.
      if (r.i === 4 && !r.counted) { r.counted = true; D.state.progress.runsToday++; }
      return out;
    }
    function startRedemptionOrFinish(out) {
      if (!r.redemption && r.redemptionQueue.length) {
        r.redemption = true;
        const list = r.redemptionQueue.slice(0, cfg.REDEMPTION_MAX);
        for (const id of list) {
          const c = D.scheduler.card(id, 'redemption');
          c.ringKind = 'redemption';
          c.slot = r.cards.length;
          r.cards.push(c);
        }
        r.redemptionQueue = [];
        out.redemptionStart = D.copy.run.redemption;
        return;
      }
      r.finished = true;
    }

    function revealInfo() {
      const c = card();
      if (!c) return null;
      const f = D.facts.get(c.id);
      return { kind: 'reveal', line: D.copy.rescue.showAnswer(c.id, c.flip), answer: f.ans,
               input: f.input || 'number' };
    }

    return {
      raw: r,
      present: present,
      revealInfo: revealInfo,
      submit: submit,
      timeout: timeout,
      chooseRescue: chooseRescue,
      chooseSkip: chooseSkip,
      stepSubmit: stepSubmit,
      stepForced: stepForced,
      typedAnswer: typedAnswer,
      currentStep: currentStep,
      comboMult: () => comboMult(r.combo),
      isDone: () => r.finished,
      summary: () => summarize(r),
      snapshot: () => JSON.parse(JSON.stringify(r)),
    };
  }

  /* ---- what the summary screen and the save need ---- */
  function summarize(r) {
    const medianRt = D.u.median(r.rts.filter(x => typeof x === 'number'));
    // The quiet lane never shows up in a summary (PLAN §6.8), and a fact won back
    // twice in one run is named once.
    const shown = ids => Array.from(new Set(ids)).filter(id => {
      const f = D.facts.get(id);
      return f && f.lane !== 'addsub';
    });
    return {
      score: r.score, correct: r.correct, unaided: r.unaided, cards: r.served,
      xp: r.xpGained, coins: r.coinsGained, dotted: shown(r.dotted), done: shown(r.done), gotBack: shown(r.gotBack),
      missed: r.missed.slice(), bestCombo: r.bestCombo, medianRt: medianRt,
      fastestFact: r.fastestFact, day: r.day, table: r.table, fastWrongs: r.fastWrongs,
      counted: r.correct >= D.cfg.RUN_MIN_CORRECT,
    };
  }

  /* Close a run out: history, day credit, personal bests, learning load.
     A run only credits a game-day when it was actually played out. */
  function finishRun(rs) {
    const sum = rs.summary();
    const s = D.state;
    s.runs.push({ day: sum.day, table: sum.table, score: sum.score, correct: sum.correct,
                  cards: sum.cards, medianRt: sum.medianRt });
    while (s.runs.length > cfg.RUNS_KEPT) s.runs.shift();
    const extra = { pbs: [], belt: [] };
    if (sum.counted) {
      D.xp.creditDay(sum.day);
      extra.pbs = D.xp.checkPbs(sum);
    }
    D.scheduler.adaptLearnSlots();
    D.scheduler.endPlacementRound();
    D.scheduler.ensureProgression();
    // Stripes and belts are settled when the round ends, where there is room to
    // show them (rework 2026-09-10). A short round's dots still count.
    extra.belt = D.belt.update();
    sum.coins += extra.belt.reduce((n, e) => n + e.coins, 0);
    s.inRun = null;
    D.save.commit();
    sum.extra = extra;
    return sum;
  }

  function resume(snap, opts) {
    // A run left on Sunday and finished on Monday belongs to Monday. Credited to
    // the old day it rolled the week backwards (review 2026-09-10).
    const now = Object.assign({}, snap, { day: D.u.gameDay() });
    return create({ cards: snap.cards, day: now.day }, Object.assign({}, opts, { resume: now }));
  }

  return { create: create, resume: resume, comboMult: comboMult, summarize: summarize,
           finishRun: finishRun };
})();
