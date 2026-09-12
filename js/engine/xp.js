/* Dojo 12 engine — XP, levels and coins (PLAN §7.4, rework 2026-09-10). Headless
   and pure: every award goes through here, so there is one place to test that
   nothing is paid without a correct typed answer.
   XP is per correct unaided answer, table-weighted, and nothing else pays it. The
   first sixty of a day pay full, the rest pay half, and the game never says a word
   about it. Coins come one per correct unaided answer, fast or slow, plus the
   bonus card and the belt, so a slow child who is right earns about what a fast
   one does. Levels decide what the shop stocks; coins decide what the child can
   buy. */
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
  function addCoins(n) {
    D.state.progress.coins += n;
    return n;
  }
  function spendCoins(n) {
    const p = D.state.progress;
    if (p.coins < n) return false;
    p.coins -= n;
    return true;
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

  /* Days played, kept for the parent's view. A day counts only when a run was
     actually played out. Nothing pays for it. */
  function creditDay(day) {
    const p = D.state.progress;
    if (p.lastRunDay === day) return { dayCounted: false };
    p.lastRunDay = day;
    p.daysPlayed++;
    return { dayCounted: true };
  }

  /* Personal bests: the round score, the longest streak and the fastest fact.
     The first round sets them rather than beating them. Nothing pays for a best,
     so any margin counts. */
  function checkPbs(run) {
    const pbs = D.state.pbs, out = [];
    const first = !pbs.score && !pbs.combo;
    if (run.score > pbs.score) {
      if (!first) out.push({ kind: 'score', delta: run.score - pbs.score });
      pbs.score = run.score;
    }
    if (run.bestCombo > pbs.combo) {
      if (!first) out.push({ kind: 'combo', delta: run.bestCombo - pbs.combo });
      pbs.combo = run.bestCombo;
    }
    if (run.fastestFact && D.facts.get(run.fastestFact.id).digits >= 2) {
      const cur = pbs.fastestFact;
      if (!cur || run.fastestFact.ms < cur.ms) {
        if (cur) out.push({ kind: 'fact', id: run.fastestFact.id, ms: run.fastestFact.ms });
        pbs.fastestFact = { id: run.fastestFact.id, ms: run.fastestFact.ms };
      }
    }
    return out;
  }

  return { needed, levelFor, addXp, addCoins, spendCoins, answerXp, creditDay, checkPbs };
})();
