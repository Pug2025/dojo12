/* Dojo 12 — the save. D.state is the single source of truth (PLAN §8).
   One save per profile, keyed dojo12.save.v2.<slug>. On an iPhone the game runs
   only from the Home Screen icon, so this storage has one home (PLAN §9.3). */
"use strict";
D.save = (function () {
  const cfg = D.cfg;
  const INDEX_KEY = 'dojo12.profiles';
  let key = null;

  function slugify(name) {
    const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return s || 'player';
  }

  function fresh(profile) {
    const today = D.u.todayKey();
    return {
      version: cfg.VERSION,
      profile: { name: (profile && profile.name) || '', slug: (profile && profile.slug) || '',
                 theme: (profile && profile.theme) || 'dojo', created: today },
      facts: {},
      tables: {},
      focus: { primary: null, secondary: null },
      lanes: { addsub: { active: false, families: {} },
               beyond: { scouting: false, open: false, focus: null } },
      scouts: {},
      rt: { muldiv: { d1: [], d2: [], d3: [] }, beyond: { d1: [], d2: [], d3: [], d4: [] } },
      runs: [],
      snapshots: {},
      pbs: { score: 0, byTable: {}, combo: 0, fastestFact: null },
      progress: { xp: 0, level: 1, sparks: 0, daysPlayed: 0, weekKey: D.u.weekKey(today),
                  weekDots: [], weekBonusPaid: false, lastRunDay: null, runsToday: 0,
                  fullXpToday: 0, learnSlots: cfg.LEARN_START, fastWrongs7d: [],
                  daysBonusPaid: [] },
      cosmetics: { owned: [], equipped: {} },
      inRun: null,
      restores: [],
      stepStats: {},   // famId -> {ok, tries}: the tie-break when two rescue scripts cost the same
      flags: { tryoutDone: false, firstRescueShown: false, lastRecapWeek: null,
               clockFrozenUntil: null, sound: true, autoSubmit: false, muted: false },
      lastSeenEpoch: D.u.now(),
      rolloverEpoch: D.u.now(),
      gameDay: today,
    };
  }

  /* ---- profile index ---- */
  function profiles() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function rememberProfile(p) {
    const list = profiles().filter(x => x.slug !== p.slug);
    list.push({ slug: p.slug, name: p.name });
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function forgetProfile(slug) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(profiles().filter(x => x.slug !== slug))); } catch (e) {}
  }

  const MIGRATIONS = { /* 2: current */ };
  function migrate(s) {
    let v = s.version || cfg.VERSION;
    while (MIGRATIONS[v + 1]) { s = MIGRATIONS[v + 1](s); v = s.version; }
    const t = fresh(s.profile);
    for (const k of Object.keys(t)) if (s[k] === undefined) s[k] = t[k];
    for (const k of Object.keys(t.progress)) if (s.progress[k] === undefined) s.progress[k] = t.progress[k];
    for (const k of Object.keys(t.flags)) if (s.flags[k] === undefined) s.flags[k] = t.flags[k];
    return s;
  }

  function keyFor(slug) { return cfg.SAVE_PREFIX + slug; }

  function loadProfile(slug) {
    key = keyFor(slug);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { D.state = fresh({ slug: slug }); return false; }
      D.state = migrate(JSON.parse(raw));
      D.mastery.dirty();
      return true;
    } catch (e) {
      D.state = fresh({ slug: slug });
      return false;
    }
  }
  function startProfile(name, theme) {
    const slug = slugify(name);
    key = keyFor(slug);
    D.state = fresh({ name: name, slug: slug, theme: theme });
    rememberProfile(D.state.profile);
    commitNow();
    return D.state;
  }

  let timer = null;
  function commit() {
    clearTimeout(timer);
    timer = setTimeout(commitNow, 120);
  }
  function commitNow() {
    if (!key) return;
    clearTimeout(timer);
    try { localStorage.setItem(key, JSON.stringify(D.state)); }
    catch (e) { /* a full quota is not worth a crash mid-run */ }
  }
  function reset() {
    if (key) localStorage.removeItem(key);
    if (D.state && D.state.profile) forgetProfile(D.state.profile.slug);
    key = null;
  }

  /* ---- the game-day (PLAN §5) ----
     A day credits when the calendar date changed, local time is past 04:00, and
     at least six hours of real time passed since the last credit. Six hours lets
     an evening run and a morning run count as two days; it does not let a clock
     wound forward mint them. A clock wound *backward* freezes new days entirely
     until real time catches up with the furthest point we have seen. */
  function touchDay() {
    const s = D.state;
    const nowMs = D.u.now();
    const nowDate = new Date(nowMs);
    const today = D.u.todayKey(nowDate);

    if (s.lastSeenEpoch > 0 && nowMs < s.lastSeenEpoch - 60000) {
      const seen = new Date(s.lastSeenEpoch);
      seen.setDate(seen.getDate() + 1);
      s.flags.clockFrozenUntil = D.u.todayKey(seen);
      commit();
      return false;
    }
    s.lastSeenEpoch = Math.max(s.lastSeenEpoch || 0, nowMs);
    if (s.flags.clockFrozenUntil && today >= s.flags.clockFrozenUntil) s.flags.clockFrozenUntil = null;
    if (s.gameDay === today) return false;
    if (s.flags.clockFrozenUntil) { commit(); return false; }
    if (nowDate.getHours() < cfg.ROLLOVER_HOUR) return false;
    if (s.rolloverEpoch > 0 && nowMs - s.rolloverEpoch < cfg.ROLLOVER_MIN_MS) { commit(); return false; }

    s.gameDay = today;
    s.rolloverEpoch = nowMs;
    s.progress.runsToday = 0;
    s.progress.fullXpToday = 0;
    rollWeek(today);
    trimFastWrongs(today);
    commit();
    return true;
  }

  // Seven dots, one per game-day played this week, wiped every Monday.
  function rollWeek(day) {
    const s = D.state, wk = D.u.weekKey(day);
    if (s.progress.weekKey !== wk) {
      s.progress.weekKey = wk;
      s.progress.weekDots = [];
      s.progress.weekBonusPaid = false;
    }
  }
  function trimFastWrongs(day) {
    const p = D.state.progress;
    p.fastWrongs7d = (p.fastWrongs7d || []).filter(d => D.u.daysBetween(d, day) < cfg.FAST_WRONG_WINDOW_DAYS);
  }

  return { fresh, migrate, slugify, profiles, rememberProfile, forgetProfile, loadProfile,
           startProfile, commit, commitNow, reset, touchDay, rollWeek, trimFastWrongs, keyFor,
           get key() { return key; }, set key(v) { key = v; } };
})();
