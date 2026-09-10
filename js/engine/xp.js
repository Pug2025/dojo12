/* Dojo 12 engine — XP, levels and sparks (PLAN §7.4). Headless and pure:
   every award goes through here, so there is one place to test that nothing is
   paid without a correct typed answer.
   XP is per correct unaided answer, table-weighted. The first sixty of a day pay
   full, the rest pay half, and the game never says a word about it. */
"use strict";
D.xp = (function () {
  const cfg = D.cfg;

  function needed(level) { return cfg.LEVEL_BASE + cfg.LEVEL_STEP * level; }
  function levelFor(totalXp) {
    let level = 1, spent = 0;
    while (totalXp >= spent + needed(level)) { spent += needed(level); level++; }
    return { level: level, into: totalXp - spent, need: needed(level) };
  }

  function addXp(n) {
    const p = D.state.progress;
    p.xp += n;
    p.level = levelFor(p.xp).level;
    return n;
  }
  function addSparks(n) {
    D.state.progress.sparks += n;
    return n;
  }

  /* One correct, unaided answer. Rescued, shown-answer and redemption answers
     never reach here. */
  function answerXp(id) {
    const p = D.state.progress;
    const full = D.facts.weight(id) * cfg.XP_PER_CORRECT;
    const half = p.fullXpToday >= cfg.XP_FULL_PER_DAY;
    p.fullXpToday++;
    return addXp(Math.round(half ? full / 2 : full));
  }

  /* A fact turns gold the first time it reaches auto, and only the first time. */
  function goldXp(id) {
    const r = D.mastery.rec(id);
    if (r.goldPaid) return 0;
    r.goldPaid = true;
    D.state.progress.goldsThisWeek = (D.state.progress.goldsThisWeek || 0) + 1;
    addSparks(cfg.SPARKS_GOLD);
    return addXp(cfg.XP_GOLD);
  }
  function blackBeltXp() { addSparks(cfg.SPARKS_BLACK_BELT); return addXp(cfg.XP_BLACK_BELT); }
  function grandmasterXp() { return addXp(cfg.XP_GRANDMASTER); }

  /* Week dots and the days-played count (PLAN §7.4). A day counts only when a
     run was actually played out. */
  function creditDay(day) {
    const p = D.state.progress;
    const out = { weekBonus: 0, daysBonus: 0, dayCounted: false };
    if (p.lastRunDay === day) return out;
    p.lastRunDay = day;
    p.daysPlayed++;
    out.dayCounted = true;
    D.save.rollWeek(day);
    const idx = D.u.weekIndex(day);
    if (D.u.weekKey(day) === p.weekKey && !p.weekDots.includes(idx)) p.weekDots.push(idx);
    if (!p.weekBonusPaid && p.weekDots.length >= cfg.WEEK_DOTS_FOR_BONUS) {
      p.weekBonusPaid = true;
      out.weekBonus = addSparks(cfg.SPARKS_WEEK);
    }
    for (const mark of cfg.DAYS_BONUS_AT) {
      if (p.daysPlayed === mark && !(p.daysBonusPaid || []).includes(mark)) {
        (p.daysBonusPaid = p.daysBonusPaid || []).push(mark);
        out.daysBonus = addSparks(cfg.SPARKS_DAYS);
        out.daysBonusAt = mark;
      }
    }
    return out;
  }

  /* Personal bests. Minimum deltas keep the ratchet honest (PLAN §7.4). */
  function checkPbs(run) {
    const pbs = D.state.pbs, out = [];
    const first = pbs.score === 0;
    // The first run sets the bar rather than beating it, so it is not a best.
    if (pbs.score === 0) { pbs.score = run.score; }
    else if (run.score > 0 && run.score >= Math.max(pbs.score * (1 + cfg.PB_SCORE_PCT), pbs.score + 1)) {
      out.push({ kind: 'score', delta: run.score - pbs.score });
      pbs.score = run.score;
      addSparks(cfg.SPARKS_PB);
    } else if (run.score > pbs.score) {
      pbs.score = run.score;                    // the number moves, the spark does not
    }
    // The first run sets every bar without paying for it (PLAN §7.4).
    if (!first && run.bestCombo >= pbs.combo + cfg.PB_COMBO) {
      pbs.combo = run.bestCombo;
      out.push({ kind: 'combo' });
      addSparks(cfg.SPARKS_PB);
    } else if (run.bestCombo > pbs.combo) pbs.combo = run.bestCombo;

    if (run.fastestFact && D.facts.get(run.fastestFact.id).digits >= 2) {
      const cur = pbs.fastestFact;
      const next = { id: run.fastestFact.id, ms: run.fastestFact.ms };
      if (!cur) {
        pbs.fastestFact = next;
      } else if (next.ms <= cur.ms - cfg.PB_FACT_MS) {
        pbs.fastestFact = next;
        out.push({ kind: 'fact' });
        addSparks(cfg.SPARKS_PB);
      } else if (next.ms < cur.ms) {
        pbs.fastestFact = next;
      }
    }
    if (run.table) {
      const t = pbs.byTable[run.table] || (pbs.byTable[run.table] = { score: 0, medianRt: null, runs: 0 });
      t.runs++;
      if (run.score > t.score) {
        const earns = t.runs > cfg.PB_TABLE_RUNS && run.score >= t.score * (1 + cfg.PB_SCORE_PCT);
        t.score = run.score;
        if (earns) { out.push({ kind: 'table' }); addSparks(cfg.SPARKS_PB); }
      }
      t.medianRt = run.medianRt;
    }
    return out;
  }

  return { needed, levelFor, addXp, addSparks, answerXp, goldXp, blackBeltXp, grandmasterXp,
           creditDay, checkPbs };
})();
