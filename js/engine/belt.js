/* Dojo 12 engine — the belt (rework 2026-09-10). Headless.
   One belt per child: white, blue, purple, brown, black, with four stripes on
   each before the next, as in Brazilian jiu-jitsu. It moves on dots. Every
   question has two, and a fast answer on a counted day fills one, so the belt
   shows what the child knows and nothing else moves it. A stripe once tied
   stays, even when a miss empties a dot: the bar can dip, the belt cannot.
   Brown's fourth stripe opens the black belt test. Coins pay for every stripe
   and belt as it is tied. */
"use strict";
D.belt = (function () {
  const cfg = D.cfg;
  let core = null;

  function state() {
    if (!D.state.belt) D.state.belt = { step: 0, black: false, blackDay: null, testDay: null };
    return D.state.belt;
  }
  // The 187 times and divide questions, each once.
  function coreIds() {
    if (!core) {
      const seen = new Set();
      for (const key of D.facts.TABLE_ORDER) for (const id of D.facts.table(key).items) seen.add(id);
      core = Array.from(seen);
    }
    return core.slice();
  }
  // Sealed questions across everything the belt counts: the times tables and
  // Beyond, never the quiet addition lane.
  function sealedCount() { return counts().sealed; }
  // Questions the child has sealed, ever, and questions fast once that have not yet
  // been sealed, across everything the belt counts. The belt counts a question once
  // it has been sealed and never uncounts it (§13.3): a lost seal shows on the card,
  // in the Grid and in the summary, but the belt's count is a record of reach, and
  // counted live it walked backwards on the plate (replays 2026-09-14).
  function counts() {
    let sealed = 0, outlined = 0;
    for (const id of Object.keys(D.state.facts)) {
      const f = D.facts.get(id), r = D.state.facts[id];
      if (!f || f.lane === 'addsub' || !r) continue;
      if (r.doneOnce || D.mastery.isSealed(id)) sealed++;
      else if (D.mastery.sealState(id) === 'fast') outlined++;
    }
    return { sealed: sealed, outlined: outlined };
  }
  function stepFor(sealed) {
    let s = 0;
    while (s < cfg.BELT_STEPS.length && sealed >= cfg.BELT_STEPS[s]) s++;
    return s;
  }
  function describe(step, black) {
    if (black) return { belt: 'black', stripes: 0 };
    return { belt: cfg.BELT_NAMES[Math.floor(step / 5)], stripes: step % 5 };
  }
  function lastStep() { return cfg.BELT_STEPS.length; }

  /* Where the child stands and what comes next, for Home and the round's end. */
  function info() {
    const st = state(), c = counts(), sealed = c.sealed, d = describe(st.step, st.black);
    const next = st.black || st.step >= lastStep() ? null : cfg.BELT_STEPS[st.step];
    const nextKind = st.black ? null : st.step >= lastStep() ? 'test' : ((st.step + 1) % 5 === 0 ? 'belt' : 'stripe');
    const nextBelt = nextKind === 'belt' ? cfg.BELT_NAMES[(st.step + 1) / 5] : nextKind === 'test' ? 'black' : d.belt;
    return { step: st.step, belt: d.belt, stripes: d.stripes, black: st.black, sealed: sealed, outlined: c.outlined,
             prevAt: st.step > 0 ? cfg.BELT_STEPS[st.step - 1] : 0, nextAt: next,
             nextKind: nextKind, nextBelt: nextBelt, testOpen: testOpen() };
  }

  /* The bar under the belt, and the words above it, say one thing: the seals still to
     come before the next stripe or belt (2026-09-24). One cell for each seal between
     the last stripe and the next: sealed ones solid, and a halfway question as half a
     cell, never more of them than there are seals still to come, so the bar is never
     full before the stripe is tied. The words said "Sealed 4 of 5" (counted from zero)
     over a bar counted from the last stripe and two-thirds full (fresh playtest). */
  function bar(given) {
    const i = given || info();
    if (i.black || i.nextKind === 'test' || i.nextAt === null || i.nextAt === undefined) {
      return { cells: ['sealed'], span: 1, done: 1, left: 0, half: 0, solid: 1, pale: 1 };
    }
    const span = Math.max(1, i.nextAt - i.prevAt);
    const done = D.u.clamp(i.sealed - i.prevAt, 0, span - 1);
    const left = span - done;
    const half = Math.min(i.outlined || 0, left);
    const cells = [];
    for (let k = 0; k < span; k++) cells.push(k < done ? 'sealed' : k < done + half ? 'half' : '');
    return { cells: cells, span: span, done: done, left: left, half: half,
             solid: done / span, pale: (done + half / 2) / span };
  }

  /* One table's seals for Home and the parent's view, out of its whole 22 (times and
     divide) from the start: counted over what was open, "0 of 11" became "3 of 22" the
     day divide joined (fresh playtest 2026-09-24). */
  function tableSeals(key) {
    const t = D.facts.table(key);
    const ids = t ? t.items : [];
    let sealed = 0, halfway = 0;
    for (const id of ids) {
      const st = D.mastery.sealState(id);
      if (st === 'sealed') sealed++; else if (st === 'fast') halfway++;
    }
    return { key: key, sealed: sealed, halfway: halfway, total: ids.length };
  }

  /* Raise the belt to what the sealed questions now say. It never lowers. Every stripe and
     belt it passes pays coins, and the list says what happened. */
  function update() {
    const st = state();
    const target = stepFor(sealedCount());
    const events = [];
    while (st.step < target) {
      st.step++;
      const d = describe(st.step, false);
      const kind = st.step % 5 === 0 ? 'belt' : 'stripe';
      const coins = kind === 'belt' ? cfg.COINS_BELT : cfg.COINS_STRIPE;
      D.xp.addCoins(coins);
      events.push({ kind: kind, belt: d.belt, stripes: d.stripes, step: st.step, coins: coins });
    }
    return events;
  }
  // After a migration or a restore: the belt the seals already earned, unpaid.
  function sync() {
    const st = state();
    st.step = Math.max(st.step || 0, stepFor(sealedCount()));
    delete st.needsSync;
    return st.step;
  }

  function testOpen(day) {
    const st = state();
    return !st.black && st.step >= lastStep() && st.testDay !== (day || D.u.gameDay());
  }
  function stampTest(day) { state().testDay = day || D.u.gameDay(); }
  function passBlack(day) {
    const st = state();
    if (st.black) return null;
    st.black = true;
    st.blackDay = day || D.u.gameDay();
    D.xp.addCoins(cfg.COINS_BELT);
    return { kind: 'belt', belt: 'black', stripes: 0, step: st.step, coins: cfg.COINS_BELT };
  }

  return { state, coreIds, sealedCount, counts, stepFor, describe, info, bar, tableSeals, update, sync, testOpen,
           stampTest, passBlack, lastStep };
})();
