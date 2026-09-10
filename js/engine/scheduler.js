/* Dojo 12 engine — progression and run composition (PLAN §6.4, §6.5). Headless.
   Two tables are in focus at once; each drills a hot set of at most four facts,
   so the unknown load stays small and a run stays winnable. */
"use strict";
D.scheduler = (function () {
  const cfg = D.cfg;
  const M = () => D.mastery;

  /* ---------------- table state ---------------- */
  function tableState(key) {
    const s = D.state;
    if (!s.tables[key]) {
      s.tables[key] = { status: 'new', belt: 'white', beltDay: null, provisionalUntil: null,
                        testAttemptDay: null, testFailed: false, hot: [] };
    }
    return s.tables[key];
  }
  function isOpen(key) { return tableState(key).status !== 'new'; }
  function openTables() { return D.facts.TABLE_ORDER.filter(isOpen); }
  function focusKeys() {
    const f = D.state.focus;
    return [f.primary, f.secondary].filter(Boolean);
  }

  function prereqMet(key) {
    const def = D.facts.TABLE_DEFS.find(t => t.key === key);
    if (!def) return false;
    for (const k of def.needs) if (!isOpen(k)) return false;
    for (const k of def.fastNeeds) {
      if (!isOpen(k)) return false;
      if (M().tableStats(k).fastPct < cfg.TABLE_PREREQ_PCT) return false;
    }
    return true;
  }
  // The next table to open: strategy order, prerequisites first. If nothing
  // qualifies, the earliest unopened table opens anyway so progress never stalls.
  function nextUnopened() {
    const news = D.facts.TABLE_ORDER.filter(k => !isOpen(k));
    if (!news.length) return null;
    return news.find(prereqMet) || news[0];
  }

  function openTable(key, seedAll) {
    const t = tableState(key);
    if (t.status !== 'new') return t;
    t.status = 'focus';
    if (seedAll) for (const id of D.facts.table(key).products) M().seedKnown(id);
    // Two fast probes on a fact seed it known the moment its table opens.
    for (const id of D.facts.table(key).items) {
      const p = D.state.scouts[id];
      if (p && p.fastOk >= cfg.SCOUT_SEED_FAST) M().seedKnown(id);
    }
    refreshHot(key);
    return t;
  }

  /* Focus slots. A table graduates to `open` at 80 % fast+auto; the secondary
     steps up and a new table opens behind it (PLAN §6.4). */
  function ensureProgression() {
    const s = D.state;
    if (!s.focus) s.focus = { primary: null, secondary: null };
    for (const key of D.facts.TABLE_ORDER) tableState(key);

    // Graduate a finished primary.
    if (s.focus.primary && M().tableStats(s.focus.primary).fastPct >= cfg.FOCUS_PROMOTE_PCT) {
      tableState(s.focus.primary).status = 'open';
      s.focus.primary = s.focus.secondary;
      s.focus.secondary = null;
    }
    // A table that has slipped a long way back comes into focus again.
    if (!s.focus.secondary) {
      const slipped = openTables().find(k => k !== s.focus.primary &&
        tableState(k).status === 'open' && M().tableStats(k).fastPct < cfg.TABLE_REOPEN_PCT);
      if (slipped) { tableState(slipped).status = 'focus'; s.focus.secondary = slipped; }
    }
    // Fill empty focus slots from the unopened tables.
    while (!s.focus.primary || !s.focus.secondary) {
      const already = openTables().find(k => tableState(k).status === 'focus' &&
        k !== s.focus.primary && k !== s.focus.secondary);
      if (already) {
        if (!s.focus.primary) s.focus.primary = already; else s.focus.secondary = already;
        continue;
      }
      const next = nextUnopened();
      if (!next) break;
      openTable(next);
      if (!s.focus.primary) s.focus.primary = next; else s.focus.secondary = next;
    }
    for (const key of focusKeys()) refreshHot(key);
    updateBelts();
    updateSafety();
    maybeOpenBeyondScouting();
  }

  /* Hot set: at most four facts of a focus table at a time. A fact leaves when
     it reaches `known`; the next one folds in (PLAN §6.4). */
  function refreshHot(key) {
    const t = tableState(key);
    const items = M().activeItems(key);
    t.hot = (t.hot || []).filter(id => items.includes(id) && !M().isKnownPlus(id));
    if (t.hot.length >= cfg.HOT_SET) { t.hot = t.hot.slice(0, cfg.HOT_SET); return t.hot; }
    for (const id of items) {
      if (t.hot.length >= cfg.HOT_SET) break;
      if (M().isKnownPlus(id)) continue;
      if (t.hot.includes(id)) continue;
      t.hot.push(id);
    }
    return t.hot;
  }

  /* ---- the quiet lane (PLAN §6.8) ----
     It turns on when the tryout probes say the multiplication strategies are
     standing on sand, or when a rescue step in that arithmetic is missed twice
     in a week. It turns off family by family at ninety per cent fast. It is
     never labelled, never on the Grid, never in a summary. */
  function activateSafety() {
    const lane = D.state.lanes.addsub;
    lane.active = true;
    for (const famId of D.facts.familyIds()) {
      if (!lane.families[famId]) lane.families[famId] = { active: true };
    }
  }
  function activateSafetyFamily(famId) {
    const lane = D.state.lanes.addsub;
    lane.active = true;
    lane.families[famId] = { active: true };
  }
  function updateSafety() {
    const lane = D.state.lanes.addsub;
    if (!lane.active) return;
    let anyActive = false;
    for (const famId of Object.keys(lane.families)) {
      const st = lane.families[famId];
      if (!st || !st.active) continue;
      const fam = D.facts.family(famId);
      if (!fam) { st.active = false; continue; }
      const seen = fam.facts.filter(id => (M().peek(id) || {}).seen > 0);
      // Small families cannot reach a flat minimum, so the bar is the whole
      // family when the family is smaller than the minimum.
      const need = Math.min(cfg.SAFETY_DEACTIVATE_MIN, fam.facts.length);
      if (seen.length >= need) {
        const fast = seen.filter(id => M().isFast(id)).length;
        if (fast / seen.length >= cfg.SAFETY_DEACTIVATE_PCT) { st.active = false; continue; }
      }
      anyActive = true;
    }
    if (!anyActive) lane.active = false;
  }
  /* A rescue step in plain addition or subtraction, missed twice in a week, is
     the other way in (PLAN §6.8). */
  function noteStepMiss(kind, day) {
    if (['add', 'sub', 'double', 'half', 'addUp'].indexOf(kind) < 0) return false;
    const p = D.state.progress;
    p.stepMisses = (p.stepMisses || []).filter(d => D.u.daysBetween(d, day) < cfg.FAST_WRONG_WINDOW_DAYS);
    p.stepMisses.push(day);
    if (p.stepMisses.length >= 2 && !D.state.lanes.addsub.active) {
      activateSafety();
      return true;
    }
    return false;
  }

  function beltKeys() {
    const out = openTables();
    if (D.beyond && D.state.lanes.beyond.open) {
      for (const tid of D.beyond.openTopics()) out.push(D.beyond.topicKey(tid));
    }
    return out;
  }
  function updateBelts() {
    for (const key of beltKeys()) {
      const t = tableState(key), pct = M().tableStats(key).fastPct;
      if (t.belt === 'black') {
        if (t.provisionalUntil && D.u.gameDay() >= t.provisionalUntil) t.provisionalUntil = null;
        else if (t.provisionalUntil && pct < cfg.PROVISIONAL_FLOOR) { t.belt = 'orange'; t.provisionalUntil = null; }
        continue;
      }
      t.belt = pct >= cfg.BELT_ORANGE_PCT ? 'orange' : pct >= cfg.BELT_YELLOW_PCT ? 'yellow' : 'white';
    }
  }
  function testOpen(key) {
    const t = tableState(key);
    if (t.belt === 'black') return false;
    return M().tableStats(key).fastPct >= cfg.BELT_TEST_PCT;
  }
  function blackBelts() { return openTables().filter(k => tableState(k).belt === 'black').length; }
  function maybeOpenBeyondScouting() {
    const b = D.state.lanes.beyond;
    if (!b.scouting && D.facts.TABLE_ORDER.every(isOpen)) b.scouting = true;
    if (!b.open && blackBelts() >= cfg.BEYOND_OPEN_BELTS) {
      b.open = true;
      if (D.beyond) D.beyond.openTopic(D.beyond.nextTopic() || 'sq');
    }
    if (D.beyond) D.beyond.ensure();
  }

  /* ---------------- pools ---------------- */
  function learningPool() {
    const out = [];
    for (const key of focusKeys()) for (const id of refreshHot(key)) out.push(id);
    // A table whose scouts keep coming back wrong gets served properly instead.
    for (const key of D.facts.TABLE_ORDER) {
      if (isOpen(key)) continue;
      const declined = D.facts.table(key).items.find(id => (D.state.scouts[id] || {}).declined);
      if (declined) out.push(declined);
    }
    return out;
  }
  function promotePool() {
    const out = [];
    for (const key of openTables()) {
      for (const id of M().activeItems(key)) if (M().status(id) === 'known') out.push(id);
    }
    return dedupe(out);
  }
  /* Correct but slow is the state most children end up in, so the promote pool
     is where the run spends its effort: the focus tables first, and inside them
     the facts furthest from their own threshold. */
  function promoteWeight(id) {
    const r = M().peek(id);
    const th = M().threshold(id);
    const ratio = r && r.ewma ? D.u.clamp(r.ewma / th, 1, 3) : 1.5;
    const f = D.facts.get(id);
    const tables = f.tables || [];
    const w = tables.includes(D.state.focus.primary) ? 6
            : tables.includes(D.state.focus.secondary) ? 2 : 1;
    return ratio * w;
  }
  function duePool(day) {
    const out = [];
    for (const key of openTables()) {
      for (const id of M().activeItems(key)) {
        const r = M().peek(id);
        if (!r || !r.days.length) continue;
        if (M().status(id) === 'learning') continue;
        if (M().isDue(id, day)) out.push(id);
      }
    }
    return dedupe(out);
  }
  function maintenancePool() {
    const out = [];
    for (const key of openTables()) for (const id of M().activeItems(key)) if (M().isFast(id)) out.push(id);
    return dedupe(out);
  }
  function scoutPool() {
    const key = nextUnopened();
    if (key) return D.facts.table(key).products.slice();
    if (D.state.lanes.beyond.scouting && D.beyond) return D.beyond.scoutPool();
    return [];
  }
  function safetyPool() {
    const lane = D.state.lanes.addsub;
    if (!lane.active) return [];
    const out = [];
    for (const famId of D.facts.familyIds()) {
      const st = lane.families[famId];
      if (!st || !st.active) continue;
      for (const id of D.facts.family(famId).facts) if (!M().isFast(id)) out.push(id);
    }
    return out;
  }
  function warmupPool() {
    const fast = [];
    for (const key of openTables()) {
      for (const id of M().activeItems(key)) {
        if (!M().isFast(id)) continue;
        const r = M().peek(id);
        fast.push({ id: id, days: r.days.length, ewma: r.ewma === null ? 99999 : r.ewma });
      }
    }
    if (fast.length < 3) {
      // A true novice has nothing settled yet: the easiest twos and tens, scored
      // as warm-ups like any other.
      const easy = [];
      for (const key of ['2', '10']) for (const id of D.facts.table(key).products) easy.push(id);
      return dedupe(easy).slice(0, 12);
    }
    fast.sort((a, b) => (b.days - a.days) || (a.ewma - b.ewma));
    const quartile = Math.max(4, Math.ceil(fast.length / 4));
    let pool = fast.slice(0, quartile).map(x => x.id);
    if (fast.length >= 12) {
      const hard = pool.filter(id => {
        const f = D.facts.get(id);
        if (f.op !== 'mul') return true;
        const easyTable = f.tables.some(t => t === '2' || t === '10');
        return !(easyTable && Math.min(f.a, f.b) <= 4);
      });
      if (hard.length >= 3) pool = hard;
    }
    const yesterday = D.state.progress.lastWarmups || [];
    const fresh = pool.filter(id => !yesterday.includes(id));
    return fresh.length >= 3 ? fresh : pool;
  }
  function dedupe(a) { return Array.from(new Set(a)); }

  /* ---------------- the run plan (PLAN §6.5) ---------------- */
  function ringKindFor(id) {
    const st = M().status(id);
    return (st === 'known' || st === 'fast' || st === 'auto') ? st : null;
  }
  function card(id, kind) {
    const f = D.facts.get(id);
    // No ring on a fact still being learned, warm-up or not: a child never sees
    // a timer on something he has not got yet (PLAN §2, §6.5). Beyond never
    // shows one at all: these take thinking, and a clock on thinking is the
    // wrong instrument (PLAN §6.9).
    return { id: id, kind: kind, flip: f.op === 'mul' && Math.random() < 0.5,
             ringKind: f.lane === 'beyond' ? null : ringKindFor(id),
             bonus: false, last: false, replaced: false };
  }

  function plan(opts) {
    const o = opts || {};
    const day = o.day || D.u.gameDay();
    ensureProgression();
    const p = D.state.progress;
    const N = cfg.RUN_CARDS;
    const mixCount = N - cfg.WARMUPS;

    // Warm-ups: slots 1 to 3, always scored, always stepping the combo.
    const warm = D.u.take(warmupPool(), cfg.WARMUPS, () => 1).map(id => card(id, 'warmup'));
    while (warm.length < cfg.WARMUPS) {
      const pool = maintenancePool().concat(promotePool()).concat(learningPool());
      const id = pool.length ? D.u.choice(pool) : D.facts.table('2').products[0];
      warm.push(card(id, 'warmup'));
    }
    p.lastWarmups = warm.map(c => c.id);

    let L = D.u.clamp(p.learnSlots || cfg.LEARN_START, cfg.LEARN_MIN, cfg.LEARN_MAX);
    const beyondSlots = D.state.lanes.beyond.open ? Math.round(mixCount * cfg.BEYOND_SHARE) : 0;
    const safety = safetyPool();
    const safetySlots = safety.length ? Math.min(cfg.SAFETY_MAX, Math.min(L, safety.length)) : 0;
    L = Math.max(0, L - safetySlots);

    const used = [];
    const body = new Array(mixCount - 1).fill(null);      // one slot is held for the last card
    const pick = (pool, n, weightFn) => D.u.take(pool.filter(id => !used.includes(id)), n, weightFn || (() => 1));
    const claim = ids => { for (const id of ids) used.push(id); return ids; };

    const learnIds = claim(pick(learningPool(), L));
    const safeIds = safetySlots ? claim(pick(safety, safetySlots)) : [];
    const scoutIds = claim(pick(scoutPool(), cfg.SCOUTS));
    const beyondIds = (beyondSlots && D.beyond) ? claim(D.beyond.pick(beyondSlots, used)) : [];

    // Whatever is left goes to short-lag repetition on correct-but-slow facts:
    // three serves each, which is the only path from known to fast (PLAN §6.5).
    const fixed = learnIds.length + safeIds.length + scoutIds.length + beyondIds.length;
    const spare = Math.max(0, body.length - fixed);
    const perPick = 1 + cfg.PROMOTE_LAGS.length;
    const wantPicks = Math.max(0, Math.floor(spare / perPick));
    const promoteIds = claim(pick(promotePool(), wantPicks, promoteWeight));

    // Place each promote fact and its two repeats at fixed lag, avoiding a slot
    // whose neighbour is already the same fact or the same answer.
    for (const id of promoteIds) {
      const all = [], clean = [];
      for (let j = 0; j < body.length; j++) {
        if (body[j]) continue;
        if (!cfg.PROMOTE_LAGS.every(lag => j + lag < body.length && !body[j + lag])) continue;
        all.push(j);
        const spots = [j].concat(cfg.PROMOTE_LAGS.map(lag => j + lag));
        if (spots.every(k => fits(body, k, id))) clean.push(j);
      }
      const spotList = clean.length ? clean : all;
      if (!spotList.length) { placeAnywhere(body, card(id, 'promote')); continue; }
      const j = D.u.choice(spotList);
      body[j] = card(id, 'promote');
      body[j].pinned = true;
      for (const lag of cfg.PROMOTE_LAGS) {
        const again = card(id, 'promote');
        again.flip = body[j].flip;
        again.repeat = true;
        again.pinned = true;
        body[j + lag] = again;
      }
    }
    for (const id of learnIds) placeAnywhere(body, card(id, 'learning'));
    for (const id of safeIds) placeAnywhere(body, card(id, 'safety'));
    for (const id of scoutIds) placeAnywhere(body, card(id, 'scout'));
    for (const id of beyondIds) placeAnywhere(body, card(id, 'beyond'));
    const dueIds = claim(pick(duePool(day), cfg.DUE_MAX));
    for (const id of dueIds) placeAnywhere(body, card(id, 'due'));
    // Whatever is still empty is filled from the widest pool available, always
    // taking the fact this run has served least. On a brand new save there are
    // only a handful of facts in play, so this is what keeps a run from showing
    // the same one twice in a row.
    const counts = {};
    for (const c of body) if (c) counts[c.id] = (counts[c.id] || 0) + 1;
    const unused = id => !used.includes(id);
    let guard = 0;
    while (body.some(x => !x) && guard++ < 100) {
      const pools = [maintenancePool().filter(unused), promotePool().filter(unused),
                     duePool(day).filter(unused), learningPool(), maintenancePool(),
                     promotePool(), warmupPool()];
      const source = pools.find(p => p.length);
      if (!source) break;
      const ranked = D.u.shuffle(source).sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
      const id = ranked[0];
      counts[id] = (counts[id] || 0) + 1;
      if (unused(id)) used.push(id);
      if (!placeAnywhere(body, card(id, 'maintenance'))) break;
    }

    // The last card is drawn from due or promote only, so there is nothing to set up.
    const lastPool = duePool(day).concat(promotePool()).filter(id => !used.includes(id));
    const lastId = lastPool.length ? D.u.choice(lastPool)
                 : (maintenancePool().filter(id => !used.includes(id))[0] || warm[0].id);
    const lastCard = card(lastId, duePool(day).includes(lastId) ? 'due' : 'promote');
    lastCard.last = true;

    settle(body);
    // One hidden bonus card, never the last card, never a scout.
    const bonusIdx = body.map((c, i) => i).filter(i => body[i].kind !== 'scout');
    if (bonusIdx.length) body[D.u.choice(bonusIdx)].bonus = true;

    const cards = warm.concat(body, [lastCard]);
    for (let i = 0; i < cards.length; i++) cards[i].slot = i;
    return { cards: cards, day: day, learnSlots: L + safetySlots };
  }

  // Drop a card into a free slot, preferring one whose neighbours do not clash.
  function placeAnywhere(body, c) {
    const free = [], clean = [];
    for (let j = 0; j < body.length; j++) {
      if (body[j]) continue;
      free.push(j);
      if (fits(body, j, c.id)) clean.push(j);
    }
    const list = clean.length ? clean : free;
    if (!list.length) return false;
    body[D.u.choice(list)] = c;
    return true;
  }
  // Would this fact sit next to itself, or next to another fact with the same answer?
  function fits(body, j, id) {
    const ans = D.facts.get(id).ans;
    for (const k of [j - 1, j + 1]) {
      const o = body[k];
      if (!o) continue;
      if (o.id === id || D.facts.get(o.id).ans === ans) return false;
    }
    return true;
  }
  /* Adjacency repair. Promote repeats hold their lag, so only the other cards
     move: no fact twice in a row, and no two neighbours with the same answer. */
  function settle(body) {
    const free = [], items = [];
    for (let j = 0; j < body.length; j++) {
      if (body[j] && body[j].pinned) continue;
      free.push(j);
      if (body[j]) items.push(body[j]);
    }
    // Lay the loose cards out most-repeated first, never next to their own
    // answer. On a brand new save the whole run is eight facts, so this is the
    // pass that stops the same question appearing twice in a row.
    const byAnswer = {};
    for (const c of items) {
      const key = String(D.facts.get(c.id).ans);
      (byAnswer[key] = byAnswer[key] || []).push(c);
    }
    for (const j of free) body[j] = null;
    for (const j of free) {
      const keys = Object.keys(byAnswer).filter(k => byAnswer[k].length);
      if (!keys.length) break;
      keys.sort((a, b) => byAnswer[b].length - byAnswer[a].length);
      const before = body[j - 1], after = body[j + 1];
      const bad = new Set();
      for (const o of [before, after]) if (o) bad.add(String(D.facts.get(o.id).ans));
      const key = keys.find(k => !bad.has(k)) || keys[0];
      body[j] = byAnswer[key].shift();
    }
    for (const j of free) if (!body[j]) body[j] = items.pop() || body[0];
    return body;
  }

  function clashes(body, i) {
    const c = body[i];
    if (!c) return false;
    for (const j of [i - 1, i + 1]) {
      const o = body[j];
      if (!o) continue;
      if (o.id === c.id) return true;
      if (D.facts.get(o.id).ans === D.facts.get(c.id).ans) return true;
    }
    return false;
  }

  /* No fact twice in a row, and no two neighbours with the same answer. */
  function spread(list) {
    const out = list.slice();
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1], cur = out[i];
      if (prev.id !== cur.id && D.facts.get(prev.id).ans !== D.facts.get(cur.id).ans) continue;
      const j = out.findIndex((c, k) => k > i &&
        c.id !== prev.id && D.facts.get(c.id).ans !== D.facts.get(prev.id).ans &&
        (k + 1 >= out.length || (out[k + 1].id !== cur.id)));
      if (j > i) { const t = out[i]; out[i] = out[j]; out[j] = t; }
    }
    return out;
  }

  /* ---------------- after a run ---------------- */
  // Learning load follows the child's own accuracy over the last three runs.
  function adaptLearnSlots() {
    const p = D.state.progress;
    const runs = D.state.runs.slice(-cfg.LEARN_LOOKBACK);
    if (runs.length < cfg.LEARN_LOOKBACK) return p.learnSlots;
    let cards = 0, ok = 0;
    for (const r of runs) { cards += r.cards || 0; ok += r.correct || 0; }
    if (!cards) return p.learnSlots;
    const acc = ok / cards;
    if (acc < cfg.LEARN_DOWN_PCT) p.learnSlots = Math.max(cfg.LEARN_MIN, (p.learnSlots || cfg.LEARN_START) - 1);
    else if (acc > cfg.LEARN_UP_PCT) p.learnSlots = Math.min(cfg.LEARN_MAX, (p.learnSlots || cfg.LEARN_START) + 1);
    return p.learnSlots;
  }

  /* Scout bookkeeping (PLAN §6.4). Silent both ways. */
  function noteScout(id, correct, fast) {
    const p = M().recordProbe(id, { correct: correct, fast: fast });
    const f = D.facts.get(id);
    const key = f.tables ? f.tables[0] : null;
    if (!key) return p;
    // A Beyond scout only records; the lane itself opens on black belts.
    if (f.lane === 'beyond') return p;
    if (!correct) {
      p.missRun = (p.missRun || 0) + 1;
      const misses = D.facts.table(key).items
        .reduce((n, x) => n + (((D.state.scouts[x] || {}).missRun) || 0), 0);
      if (misses >= cfg.SCOUT_DECLINE) p.declined = true;
    } else {
      p.missRun = 0;
    }
    // A table whose probes keep coming back fast opens with its facts seeded.
    const probes = D.facts.table(key).products
      .map(x => D.state.scouts[x]).filter(Boolean);
    const tries = probes.reduce((n, x) => n + x.tries, 0);
    const fasts = probes.reduce((n, x) => n + x.fastOk, 0);
    if (tries >= cfg.SCOUT_TABLE_PROBES && fasts / tries >= cfg.SCOUT_TABLE_PCT && !isOpen(key)) {
      openTable(key, true);
    }
    return p;
  }

  return { tableState, isOpen, openTables, focusKeys, prereqMet, nextUnopened, openTable,
           ensureProgression, refreshHot, updateBelts, testOpen, blackBelts, learningPool,
           promotePool, promoteWeight, duePool, maintenancePool, scoutPool, safetyPool, warmupPool,
           plan, spread, settle, adaptLearnSlots, noteScout, ringKindFor, card,
           activateSafety, activateSafetyFamily, updateSafety, noteStepMiss, beltKeys };
})();
