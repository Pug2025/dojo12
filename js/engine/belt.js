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
  // Dots filled across everything the belt counts: the times tables and Beyond,
  // never the quiet addition lane.
  function dotsFilled() {
    let n = 0;
    for (const id of Object.keys(D.state.facts)) {
      const f = D.facts.get(id);
      if (!f || f.lane === 'addsub') continue;
      n += D.mastery.dots(id);
    }
    return n;
  }
  function stepFor(dots) {
    let s = 0;
    while (s < cfg.BELT_STEPS.length && dots >= cfg.BELT_STEPS[s]) s++;
    return s;
  }
  function describe(step, black) {
    if (black) return { belt: 'black', stripes: 0 };
    return { belt: cfg.BELT_NAMES[Math.floor(step / 5)], stripes: step % 5 };
  }
  function lastStep() { return cfg.BELT_STEPS.length; }

  /* Where the child stands and what comes next, for Home and the round's end. */
  function info() {
    const st = state(), dots = dotsFilled(), d = describe(st.step, st.black);
    const next = st.black || st.step >= lastStep() ? null : cfg.BELT_STEPS[st.step];
    const nextKind = st.black ? null : st.step >= lastStep() ? 'test' : ((st.step + 1) % 5 === 0 ? 'belt' : 'stripe');
    const nextBelt = nextKind === 'belt' ? cfg.BELT_NAMES[(st.step + 1) / 5] : nextKind === 'test' ? 'black' : d.belt;
    return { step: st.step, belt: d.belt, stripes: d.stripes, black: st.black, dots: dots,
             prevAt: st.step > 0 ? cfg.BELT_STEPS[st.step - 1] : 0, nextAt: next,
             nextKind: nextKind, nextBelt: nextBelt, testOpen: testOpen() };
  }

  /* Raise the belt to what the dots now say. It never lowers. Every stripe and
     belt it passes pays coins, and the list says what happened. */
  function update() {
    const st = state();
    const target = stepFor(dotsFilled());
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
  // After a migration or a restore: the belt the dots already earned, unpaid.
  function sync() {
    const st = state();
    st.step = Math.max(st.step || 0, stepFor(dotsFilled()));
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

  return { state, coreIds, dotsFilled, stepFor, describe, info, update, sync, testOpen,
           stampTest, passBlack, lastStep };
})();
