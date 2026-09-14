/* Dojo 12 engine — the per-fact mastery model (PLAN §6.2). Headless.
   Everything day-gated reads D.u.gameDay(), which only moves forward through
   D.save.touchDay(), so winding the phone clock cannot manufacture spacing. */
"use strict";
D.mastery = (function () {
  const cfg = D.cfg;

  function blank() {
    return { seen: 0, ok: 0, miss: 0, streak: 0, ewma: null, days: [], lastDay: null,
             lastMiss: false, lastMissDay: null, missDays: [], helpedLast: false,
             best: null, provisional: false, doneOnce: false, window: [] };
  }
  function rec(id) {
    const s = D.state;
    if (!s.facts[id]) s.facts[id] = blank();
    return s.facts[id];
  }
  function peek(id) { return D.state.facts[id] || null; }

  /* ---- thresholds ----
     The fast line is the child's own (§13.3): RT_OWN_SHARE of their median unaided
     time for answers of that length, never slower than RT_OWN_MAX and never faster
     than the fixed line. It starts where the child is and moves in as they speed
     up, so a careful four-second child can seal a question and the check-ins
     re-test it against the tighter line later. Beyond keeps the fixed line: it
     has no ring and the answers take thinking. */
  function threshold(id) {
    const f = D.facts.get(id);
    if (!f) return cfg.RT_BASE;
    const raw = rawThreshold(f);
    if (f.lane === 'beyond') return raw;
    const med = ownMedian(f);
    if (med === null) return raw;
    return Math.max(raw, Math.min(cfg.RT_OWN_MAX, Math.round(cfg.RT_OWN_SHARE * med)));
  }
  // The child's typical time on this fact's table: the median of that table's
  // facts' own averages (a fact in two tables takes the slower of the two), so
  // quick twos and tens do not set the bar on the sevens, and an even child is
  // fast on about half of a table on any day (replay 2026-09-14: pooled by answer
  // length and cut to 85 %, 8 × 8 at 3.2 s went from red to grey as her twos sped
  // up, and a child with no spread never sealed anything). Falls back to the
  // child's recent answers of that length while a table has fewer than
  // RT_OWN_MIN_SAMPLES facts with an average.
  let ownCache = null;
  function ownMedian(f) {
    if (!ownCache) {
      ownCache = {};
      const pools = {};
      for (const id of Object.keys(D.state.facts)) {
        const r = D.state.facts[id], g = D.facts.get(id);
        if (!g || !r || r.ewma === null || r.seen < 2 || g.lane !== 'muldiv') continue;
        for (const t of (g.tables || [])) (pools[t] = pools[t] || []).push(r.ewma);
      }
      for (const k of Object.keys(pools)) if (pools[k].length >= cfg.RT_OWN_MIN_SAMPLES) ownCache[k] = D.u.median(pools[k]);
    }
    const lines = (f.tables || []).map(t => ownCache[t]).filter(x => x !== undefined);
    if (lines.length) return Math.max.apply(null, lines);
    const samples = ownBucket(f);
    return samples.length >= cfg.RT_OWN_MIN_SAMPLES ? D.u.median(samples) : null;
  }
  // The fixed line, for the black belt test and the parent's view.
  function fixedThreshold(id) {
    const f = D.facts.get(id);
    return f ? rawThreshold(f) : cfg.RT_BASE;
  }
  // Every unaided right answer of this length, last RT_SAMPLES, for the child's own line.
  function ownBucket(f) {
    const lane = f.lane === 'beyond' ? 'beyond' : 'muldiv';
    const key = 'd' + Math.min(f.digits, 4);
    const all = D.state.rtAll || (D.state.rtAll = {});
    const b = all[lane] || (all[lane] = {});
    return b[key] || (b[key] = []);
  }

  // The child's own median ewma across auto facts of the same lane and answer
  // length. A fact is only "fast" if it is close to how fast this child is when
  // a fact is genuinely automatic, so a uniformly slow child cannot bank speed
  // on the absolute bar alone. Recomputed lazily; record() dirties it.
  let relCache = null;
  function dirty() { relCache = null; ownCache = null; }
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
  // Fast is one line, the one the gold tick is drawn on (§13.3). The relative cap
  // judged a second, invisible line and the same time came up red one card and grey
  // the next (audit 2026-09-14).
  function isFastRt(id, ms) {
    return ms !== null && ms !== undefined && ms <= threshold(id);
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

  /* Spaced review. A fact with no counted day is due every day. The wait counts
     from the newest day that counted toward gold, not from the last time the
     fact was answered: counted from any answer, a fact that came up on the day
     in between lost a day, and one that came up every day never went gold
     (rework 2026-09-10). Day keys are YYYY-MM-DD, so the newest sorts last. */
  function isDue(id, day) {
    const r = peek(id);
    if (!r || r.seen === 0) return true;
    if (!r.days.length) return true;
    const last = r.days.reduce((a, b) => (b > a ? b : a));
    const idx = D.u.clamp(r.days.length - 1, 0, cfg.REVIEW_INTERVALS.length - 1);
    return D.u.daysBetween(last, day || D.u.gameDay()) >= cfg.REVIEW_INTERVALS[idx];
  }

  /* A question's seal (2026-09-14): nothing, an outline after one counted fast
     day, stamped after AUTO_DAYS of them. marks() is the count behind it. */
  function marks(id) {
    const r = peek(id);
    return r ? Math.min(r.days.length, cfg.AUTO_DAYS) : 0;
  }
  function sealState(id) {
    const n = marks(id);
    return n >= cfg.AUTO_DAYS ? 'sealed' : n > 0 ? 'fast' : 'none';
  }
  function isSealed(id) { return marks(id) >= cfg.AUTO_DAYS; }
  /* A miss, or settling into slow answers, takes a mark off. Whatever the fact held,
     it keeps at most one, so the child sees the dot go and the check-ins start
     again from the first wait. Days beyond two were invisible, and shifting one
     off a well-reviewed fact changed nothing a child could see. */
  function emptyMark(r, out) {
    if (!r.days.length) return false;
    const wasSealed = r.days.length >= cfg.AUTO_DAYS;
    const keep = Math.min(r.days.length - 1, cfg.AUTO_DAYS - 1);
    r.days = keep > 0 ? r.days.slice(-keep) : [];
    if (out) { out.lostMark = true; out.lostSeal = wasSealed; }
    return true;
  }

  /* Would a fast, unaided right answer on this fact add a day right now? The
     test record() applies, asked before the answer instead of after it, so a
     booked repeat can tell whether it still has a job (rework 2026-09-10). */
  function canCountToday(id, day) {
    const d = day || D.u.gameDay();
    const r = peek(id) || blank();
    if (r.days.includes(d) || r.lastMissDay === d) return false;
    if (r.streak + 1 < 2) return false;
    if (r.days.length && !isDue(id, d)) return false;
    return accuracyOk({ window: r.window.concat([1]).slice(-cfg.ACC_WINDOW), seen: r.seen + 1, ok: r.ok + 1 });
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
    const out = { stamped: false, sealed: false, firstSealed: false, wasFast: false, lostMark: false, lostSeal: false };
    r.seen++;
    // A slip stays out of the accuracy window. It is a typing error repaired by
    // retrieval, and warm-ups serve settled facts so often that counting every
    // fumble dragged real gold facts back to learning.
    if (!o.slip) {
      r.window.push(o.correct ? 1 : 0);
      while (r.window.length > cfg.ACC_WINDOW) r.window.shift();
    }

    if (o.correct) {
      r.ok++;
      r.streak++;
      r.lastMiss = false;
      if (!o.helped && typeof o.rt === 'number') {
        // An answer given after the ring ran out is not a clean measurement: it
        // neither moves the average nor, below, judges the seal (replay 2026-09-14:
        // "Out of time. You can still answer." and then "2 × 10 lost its seal.").
        if (!o.late) r.ewma = r.ewma === null ? o.rt : Math.round((1 - cfg.EWMA_ALPHA) * r.ewma + cfg.EWMA_ALPHA * o.rt);
        if (r.best === null || o.rt < r.best) r.best = o.rt;
        // The fast line is judged before this answer moves it.
        out.wasFast = isFastRt(id, o.rt);
        {
          const f = D.facts.get(id);
          if (f && !o.warmup) {
            const own = ownBucket(f);
            own.push(o.rt);
            while (own.length > cfg.RT_SAMPLES) own.shift();
          }
        }
        // Feed the child's own speed baseline, from settled facts only.
        if (r.days.length >= cfg.AUTO_DAYS || isFastRt(id, r.ewma)) {
          const b = rtBucket(id);
          b.push(o.rt);
          while (b.length > cfg.RT_SAMPLES) b.shift();
        }
      }
      const dueToday = r.days.length === 0 || isDue(id, day);
      const missedToday = r.lastMissDay === day;
      if (!o.helped && !o.comeback && out.wasFast && r.streak >= 2 &&
          accuracyOk(r) && dueToday && !missedToday && !r.days.includes(day)) {
        r.days.push(day);
        while (r.days.length > cfg.MAX_DAYS_KEPT) r.days.shift();
        out.stamped = true;
        if (r.days.length === cfg.AUTO_DAYS) {
          out.sealed = true;
          if (!r.doneOnce) { out.firstSealed = true; r.doneOnce = true; }
        }
      }
      // Sealed but slow: a sealed question whose average has drifted well above its
      // threshold loses the seal. Never on the answer that just added a day: judged
      // on that answer, a slow child watched the seal go on and come straight off
      // 58 per cent of the time (code review 2026-09-12).
      if (!out.stamped && !o.late && r.days.length >= cfg.AUTO_DAYS && !o.helped && r.ewma !== null &&
          r.ewma > cfg.SLOW_AUTO * threshold(id)) {
        emptyMark(r, out);
      }
      if (r.provisional) r.provisional = false;
    } else if (o.slip) {
      // A slip on a retrieved fact is on the record: it counts as a miss and no
      // day can be earned on this fact today. It takes no day, because a slip is
      // repaired by retrieval; a wrong re-serve is the full miss (PLAN §6.7.1).
      r.miss++;
      r.lastMissDay = day;
    } else {
      r.miss++;
      r.streak = 0;
      r.lastMiss = true;
      r.lastMissDay = day;
      if (r.days.length) emptyMark(r, out);
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
  // Division opens at half the products fast, or at DIVISION_OPEN_KNOWN_PCT of them
  // correct twice in a row (§13.3): on speed alone an average child saw 31
  // divisions in three weeks (replay 2026-09-14).
  function divisionOpen(key) {
    const t = D.facts.table(key);
    if (!t) return false;
    const st = statsFor(t.products);
    return st.fastPct >= cfg.DIVISION_OPEN_PCT ||
      (st.known + st.fastPlus) / Math.max(1, st.total) >= cfg.DIVISION_OPEN_KNOWN_PCT;
  }
  function activeItems(key) {
    const t = D.facts.table(key);
    if (!t) return [];
    return divisionOpen(key) ? t.items.slice() : t.products.slice();
  }

  return { blank, rec, peek, threshold, fixedThreshold, relativeCap, isFastRt, accuracyOk, status, isFast,
           isKnownPlus, isDue, canCountToday, marks, sealState, isSealed, emptyMark, ringMs, baseWindow, fastWrongMs, record, seedKnown, recordProbe,
           statsFor, tableStats, divisionOpen, activeItems, dirty };
})();
