/* Dojo 12 engine — the per-fact mastery model (PLAN §6.2). Headless.
   Everything day-gated reads D.u.gameDay(), which only moves forward through
   D.save.touchDay(), so winding the phone clock cannot manufacture spacing. */
"use strict";
D.mastery = (function () {
  const cfg = D.cfg;

  function blank() {
    return { seen: 0, ok: 0, miss: 0, streak: 0, ewma: null, days: [], lastDay: null,
             lastMiss: false, lastMissDay: null, missDays: [], helpedLast: false,
             best: null, provisional: false, goldPaid: false, window: [] };
  }
  function rec(id) {
    const s = D.state;
    if (!s.facts[id]) s.facts[id] = blank();
    return s.facts[id];
  }
  function peek(id) { return D.state.facts[id] || null; }

  /* ---- thresholds ---- */
  function threshold(id) {
    const f = D.facts.get(id);
    return f ? rawThreshold(f) : cfg.RT_BASE;
  }

  // The child's own median ewma across auto facts of the same lane and answer
  // length. A fact is only "fast" if it is close to how fast this child is when
  // a fact is genuinely automatic, so a uniformly slow child cannot bank speed
  // on the absolute bar alone. Recomputed lazily; record() dirties it.
  let relCache = null;
  function dirty() { relCache = null; }
  function relativeMedians() {
    if (relCache) return relCache;
    const buckets = {};
    for (const id of Object.keys(D.state.facts)) {
      const r = D.state.facts[id], f = D.facts.get(id);
      if (!f || !r || r.ewma === null || r.days.length < cfg.AUTO_DAYS) continue;
      // The ratio of the child's speed to what the fact's answer length allows.
      // Working in ratios means one pool per lane instead of one per digit count,
      // which matters because there are only seven three-digit products in the
      // whole grid and a per-digit pool could never fill (PLAN §6.2 note).
      (buckets[f.lane] = buckets[f.lane] || []).push(r.ewma / rawThreshold(f));
    }
    const out = {};
    for (const k of Object.keys(buckets)) {
      if (buckets[k].length >= cfg.RT_RELATIVE_MIN_FACTS) out[k] = medianOf(buckets[k]);
    }
    relCache = out;
    return out;
  }
  function medianOf(nums) {
    const a = nums.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function rawThreshold(f) {
    const base = f.lane === 'beyond' ? cfg.BEYOND_RT_BASE : cfg.RT_BASE;
    const per = f.lane === 'beyond' ? cfg.BEYOND_RT_PER_DIGIT : cfg.RT_PER_DIGIT;
    return base + per * (f.digits - 1) + (f.op === 'div' ? cfg.RT_DIV_BONUS : 0);
  }
  function relativeCap(id) {
    const f = D.facts.get(id);
    if (!f) return Infinity;
    const m = relativeMedians()[f.lane];
    return m ? m * cfg.RT_RELATIVE * rawThreshold(f) : Infinity;
  }
  function isFastRt(id, ms) {
    return ms !== null && ms !== undefined && ms <= threshold(id) && ms <= relativeCap(id);
  }

  function accuracyOk(r) {
    if (r.window.length >= cfg.ACC_WINDOW) {
      const sum = r.window.reduce((a, b) => a + b, 0);
      return sum / r.window.length >= cfg.ACC_WINDOW_PCT;
    }
    if (r.seen === 0) return true;
    return r.ok / r.seen >= cfg.ACC_LIFETIME_PCT;
  }

  /* Status. Rules are evaluated top to bottom and the first match wins, so a
     miss always reads `learning` no matter how many days the fact holds, until
     it is correct twice in a row again (PLAN §6.2). */
  function status(id) {
    const r = peek(id);
    if (!r || (r.seen === 0 && !r.provisional)) return 'new';
    if (r.lastMiss || r.streak < 2 || !accuracyOk(r)) return 'learning';
    if (r.days.length >= cfg.AUTO_DAYS) return 'auto';
    if (isFastRt(id, r.ewma)) return 'fast';
    return 'known';
  }
  function isFast(id) { const st = status(id); return st === 'fast' || st === 'auto'; }
  function isKnownPlus(id) { const st = status(id); return st === 'known' || st === 'fast' || st === 'auto'; }

  /* Spaced review. Facts with no earned day are due every day. */
  function isDue(id, day) {
    const r = peek(id);
    if (!r || r.seen === 0) return true;
    if (!r.days.length) return true;
    if (!r.lastDay) return true;
    const idx = D.u.clamp(r.days.length - 1, 0, cfg.REVIEW_INTERVALS.length - 1);
    return D.u.daysBetween(r.lastDay, day || D.u.gameDay()) >= cfg.REVIEW_INTERVALS[idx];
  }

  /* ---- ring window (PLAN §6.5) ---- */
  function rtBucket(id) {
    const f = D.facts.get(id);
    const lane = f && f.lane === 'beyond' ? 'beyond' : 'muldiv';
    const key = 'd' + Math.min(f ? f.digits : 1, 4);
    const b = D.state.rt[lane] || (D.state.rt[lane] = {});
    return b[key] || (b[key] = []);
  }
  function baseWindow(id) {
    const th = threshold(id);
    const samples = rtBucket(id);
    const med = samples.length >= 5 ? D.u.median(samples) : null;
    if (med === null) return th * cfg.RING_MAX_MULT;
    return D.u.clamp(cfg.RING_MEDIAN_MULT * med, th * cfg.RING_MIN_MULT, th * cfg.RING_MAX_MULT);
  }
  // kind: 'known' | 'fast' | 'auto' | 'comeback' | 'redemption'. new/learning get no ring.
  function ringMs(id, kind) {
    const mult = cfg.RING_BY_STATUS[kind];
    if (!mult) return null;
    return Math.round(baseWindow(id) * mult);
  }
  function fastWrongMs(id) {
    return Math.max(cfg.FAST_WRONG_FLOOR, Math.round(cfg.FAST_WRONG_W * baseWindow(id)));
  }

  /* ---- recording ----
     opts: correct, rt, helped, warmup, comeback, test, day.
     Returns what the reward layer needs; it never pays anything itself. */
  function record(id, opts) {
    const o = opts || {};
    const r = rec(id);
    const day = o.day || D.u.gameDay();
    const out = { earnedDay: false, turnedGold: false, wasFast: false, lostDay: false };
    r.seen++;
    r.window.push(o.correct ? 1 : 0);
    while (r.window.length > cfg.ACC_WINDOW) r.window.shift();

    if (o.correct) {
      r.ok++;
      r.streak++;
      r.lastMiss = false;
      if (!o.helped && typeof o.rt === 'number') {
        r.ewma = r.ewma === null ? o.rt : Math.round((1 - cfg.EWMA_ALPHA) * r.ewma + cfg.EWMA_ALPHA * o.rt);
        if (r.best === null || o.rt < r.best) r.best = o.rt;
        out.wasFast = isFastRt(id, o.rt);
        // Feed the child's own speed baseline, from settled facts only.
        if (r.days.length >= cfg.AUTO_DAYS || isFastRt(id, r.ewma)) {
          const b = rtBucket(id);
          b.push(o.rt);
          while (b.length > cfg.RT_SAMPLES) b.shift();
        }
      }
      const dueToday = r.days.length === 0 || isDue(id, day);
      const missedToday = r.lastMissDay === day;
      if (!o.helped && !o.warmup && !o.comeback && out.wasFast && r.streak >= 2 &&
          accuracyOk(r) && dueToday && !missedToday && !r.days.includes(day)) {
        r.days.push(day);
        while (r.days.length > cfg.MAX_DAYS_KEPT) r.days.shift();
        out.earnedDay = true;
        if (r.days.length >= cfg.AUTO_DAYS && !r.goldPaid) out.turnedGold = true;
      }
      // Settled but slow: an auto fact answered well above its threshold gives a day back.
      if (r.days.length >= cfg.AUTO_DAYS && !o.helped && r.ewma !== null &&
          r.ewma > cfg.SLOW_AUTO * threshold(id)) {
        r.days.shift();
        out.lostDay = true;
      }
      if (r.provisional) r.provisional = false;
    } else {
      r.miss++;
      r.streak = 0;
      r.lastMiss = true;
      r.lastMissDay = day;
      if (r.days.length) { r.days.shift(); out.lostDay = true; }
      if (r.missDays[r.missDays.length - 1] !== day) {
        r.missDays.push(day);
        while (r.missDays.length > 2) r.missDays.shift();
      }
      r.provisional = false;
    }
    r.helpedLast = !!o.helped;
    r.lastDay = day;
    dirty();
    return out;
  }

  /* Seeded by the tryout or by two fast scouts: the fact reads `known` and can
     never carry a day it did not earn in a real run. */
  function seedKnown(id) {
    const r = rec(id);
    if (r.seen > 0 || r.days.length) return r;
    r.seen = 2; r.ok = 2; r.streak = 2; r.ewma = null; r.provisional = true;
    dirty();
    return r;
  }
  /* Tryout cards and scouts. Recorded in scouts{} only; facts{} days are untouched. */
  function recordProbe(id, opts) {
    const o = opts || {};
    const s = D.state.scouts;
    const p = s[id] || (s[id] = { fastOk: 0, tries: 0, declined: false });
    p.tries++;
    if (o.correct && o.fast) p.fastOk++;
    return p;
  }

  /* ---- table roll-ups ---- */
  function statsFor(ids) {
    const out = { total: ids.length, new: 0, learning: 0, known: 0, fast: 0, auto: 0, seen: 0 };
    for (const id of ids) {
      out[status(id)]++;
      const r = peek(id);
      if (r && r.seen > 0) out.seen++;
    }
    out.fastPlus = out.fast + out.auto;
    out.fastPct = ids.length ? out.fastPlus / ids.length : 0;
    return out;
  }
  function tableStats(key) {
    const t = D.facts.table(key);
    if (!t) return statsFor([]);
    const st = statsFor(activeItems(key));
    st.products = statsFor(t.products);
    return st;
  }
  /* A table's belt counts its divisions only once they have opened, so the
     "14 of 22 fast" line and the belt thresholds do not punish a child for
     content the game has not served yet. */
  function divisionOpen(key) {
    const t = D.facts.table(key);
    if (!t) return false;
    return statsFor(t.products).fastPct >= cfg.DIVISION_OPEN_PCT;
  }
  function activeItems(key) {
    const t = D.facts.table(key);
    if (!t) return [];
    return divisionOpen(key) ? t.items.slice() : t.products.slice();
  }

  return { blank, rec, peek, threshold, relativeCap, isFastRt, accuracyOk, status, isFast,
           isKnownPlus, isDue, ringMs, baseWindow, fastWrongMs, record, seedKnown, recordProbe,
           statsFor, tableStats, divisionOpen, activeItems, dirty };
})();
