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
    if (run.roundOne) return out;          // placement rounds set nothing (§13.3)
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
      noteWeekFastest(run);
    }
    return out;
  }
  /* The week's own fastest answer, for the recap (2026-09-24). The recap named the
     all-time best, which could be months old, or set that morning and shown as last
     week's. save.rollWeek hands it over as last week's when the week turns. */
  function noteWeekFastest(run) {
    const p = D.state.progress, f = run.fastestFact;
    const week = D.u.weekKey(run.day || D.u.gameDay());
    const cur = p.weekFastest;
    if (cur && cur.week === week && cur.ms <= f.ms) return;
    p.weekFastest = { week: week, id: f.id, ms: f.ms, flip: !!(run.flips && run.flips[f.id]) };
  }

  /* After every round, the questions it made halfway, each the way its card showed it,
     so the end of a round can name the day's list ("Halfway today: 2 × 3, 4 × 6"). */
  function noteRound(sum) {
    const p = D.state.progress;
    const list = Array.isArray(p.halfwayToday) ? p.halfwayToday : (p.halfwayToday = []);
    const flips = (sum && sum.flips) || {};
    for (const id of (sum && sum.fastNew) || []) {
      if (list.some(x => x.id === id)) continue;
      list.push({ id: id, flip: !!flips[id] });
    }
  }
  /* The day's halfway questions that are still halfway, in the order they got there.
     Only a question whose one counted day is today: a check-in on a sealed question
     also adds a day, and counted in, "Fast today" never matched the red times. */
  function halfwayToday(day) {
    const d = day || D.u.gameDay();
    const shown = id => { const f = D.facts.get(id); return !!f && f.lane !== 'addsub'; };
    const out = [], seen = new Set();
    for (const x of (D.state.progress.halfwayToday || [])) {
      if (seen.has(x.id) || !shown(x.id) || !D.mastery.isHalfwayOn(x.id, d)) continue;
      seen.add(x.id);
      out.push({ id: x.id, flip: !!x.flip });
    }
    // Anything that got there some other way (a belt test), in its plain orientation.
    for (const id of Object.keys(D.state.facts)) {
      if (seen.has(id) || !shown(id) || !D.mastery.isHalfwayOn(id, d)) continue;
      seen.add(id);
      out.push({ id: id, flip: false });
    }
    return out;
  }

  return { needed, levelFor, addXp, addCoins, spendCoins, answerXp, creditDay, checkPbs,
           noteWeekFastest, noteRound, halfwayToday };
})();
