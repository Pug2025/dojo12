/* Dojo 12 — the day's ink painting: what it is and the order its strokes go down (js/paint/scenes.js;
   it was made in art/paint/, where the sheet harness that judged it stays, outside the repo).
   Classic script, no DOM, no Math.random: everything comes from the date and the child's name, so
   the game ships no pictures. The game paints it in js/paint/worker.js and keeps each finished day
   as a picture on the phone (js/paint/painter.js), so a change here never repaints a page a child
   has already earned; only a save brought back on another phone paints its pages again from the
   date and the name.

   D.paintScenes.forDay('2026-09-25', name, opts?) -> {
     family, season, caption,     // 'heron', 'autumn', 'Heron in the reeds' (plain words, for the book)
     w, h,                        // 600 x 800, a hanging scroll
     ops,                         // [{ kind: 'stroke', pts, o } | { kind: 'dab', x, y, o } | { kind: 'wash', poly, o }]
     stages,                      // after round k (1-based) ops[0 .. stages[k-1]) are down; the last is ops.length
     seal,                        // { x, y, size }: where the red date seal goes, in painting px (stone side)
     seed, version, date, name }
     opts.rounds (default 8, For Dad sets 4 to 12) changes the number of stages and nothing else: the
     ops, the seal and so the finished painting are the same whatever the rounds. No stage is ever empty.
   D.paintScenes.paint(scene, upTo, state?) -> Float32Array ink 0..1 (w*h) of ops[0 .. upTo). Pass the
     same state object each round and it paints on from where it stopped, so the paper is made once.
   D.paintScenes.families -> [{ id, seasons, windows }]; familyFor, seasonFor, moonFor (dates as ISO).

   Which picture on which day. Each child has their own rotation through the families in season
   (windows in month*100+day), never one seen in the last few days, the longer away the likelier; bamboo
   and mountains, in season all year, come up less often. The seed is hash(date|name), so two
   children never share a painting. Seasons are Ontario's: autumn from 22 Sep, winter from 1 Dec, spring from
   20 Mar, summer from 21 Jun. The moon is the real one: it is in a painting only on the evenings within
   three days of a real full moon, drawn at that evening's phase (the Harvest Moon is 26 Sep 2026), and
   on the nights nearest the full moon the moon-viewing pictures (pampas, geese) come first.

   Rounds. Each recipe tags its ops with the round they belong to, in painting order: washes and
   distance, then the main structure, then secondary forms, then details, then the last accent; the
   subject turns recognisable about round 5 or 6 and round 8 finishes it. art/paint/sheet.mjs measures
   how much ink each round adds for a year of both children; none adds less than a visible stroke.
   Other round counts (stagesFor, below): fewer rounds merge the lightest neighbouring phases, more
   split the heaviest, so the least a round adds falls as the rounds rise. Over a year of two names
   (in inkMap's units: painting px times tone) it was 153 at 4 to 7 rounds, 73 at 8 and 9, 58 at 10
   and 11 and 50 at 12, where the thinnest rounds are a leaf's stem, about what the thinnest round of
   8 adds. tests-node.mjs holds every count from 4 to 12 to as many stages as rounds, each adding
   strokes and ink, the last the whole painting.

   Seeds that still made a poor picture go in SKIP and forDay moves that date to the next seed (same
   family). After tuning a year for both children it is empty.

   The maths uses only + - * / and sqrt (msin, mexp, ...): engines may round Math.sin and friends
   differently in the last bit, and the iPhone must paint the same picture as the book remembers.

   What the old painters taught, and where it went:
   - Sesshu (splashed ink): a mountain is a few washes with a crisp top that dissolves downward; mist is
     paper left bare; the far range palest and highest, the near shore darkest. -> mountains, ridges.
   - Hasegawa Tohaku, Pine Trees: the subject half lost in fog with a paler twin behind it; needles are
     the brush's own dry hairs, laid in flat pads. -> pine and its ghost.
   - The Four Gentlemen: bamboo in segments with the node struck across the gap, leaves single
     press-and-lift strokes in threes to fives pointing downwind; plum's old wood in flying white, young
     shoots straight as whips, blossoms drawn in outline in the circle method; the chrysanthemum (Wu
     Changshuo, Qi Baishi) seen at an angle, each petal two short strokes pressed at the tip, crowding
     and darkening toward the heart, its leaves boneless lobed presses with the veins struck in dark.
     -> bamboo, plum, cherry, chrysanthemum, iris.
   - Qi Baishi: a loose wet plant and a small exact creature, the darks very dark, most of the sheet
     empty. -> dragonfly, frog, the crow's beak and eye, the sparrow.
   - Mu Qi, Six Persimmons: one round form in every tone from black to a bare outline, the calyx struck
     dark and crisp. -> persimmons.
   - Everywhere: one clear subject, an asymmetric diagonal, near dark and far pale, the subject facing
     into the empty space, snow and moonlight as paper left bare, and the seal in the emptiest lower
     corner. */
"use strict";
if (typeof D === "undefined") (typeof window !== "undefined" ? window : globalThis).D = {};

D.paintScenes = (function () {
  const W = 600, H = 800;
  const ROUNDS = 8;
  const VERSION = 1;               // bump if a change would repaint days already in the book
  const SEAL = 64;                 // the seal stone's side, in painting px

  /* ---------------- numbers ---------------- */
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const rd = x => Math.round(x * 100) / 100;

  function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function Rng(seed) {
    const f = mulberry(seed);
    const R = {
      f,
      r: (a, b) => a + (b - a) * f(),
      i: (a, b) => a + Math.floor(f() * (b - a + 1)),
      pick: arr => arr[Math.floor(f() * arr.length)],
      chance: p => f() < p,
      sign: () => (f() < 0.5 ? -1 : 1),
      jit: (x, a) => x + (f() * 2 - 1) * a,
      g: () => { const u = Math.max(1e-9, f()), v = f(); return Math.sqrt(-2 * mln(u)) * mcos(TAU * v); },
      seed: () => (f() * 4294967296) >>> 0,
      weighted: pairs => {
        let tot = 0; for (const p of pairs) tot += p[1];
        let x = f() * tot;
        for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; }
        return pairs[pairs.length - 1][0];
      },
      shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    };
    return R;
  }

  /* ---------------- maths that give the same bits in every engine ----------------
     Math.sin, cos, atan2, exp, log, pow and hypot may round differently in the last bit from one
     JavaScript engine to the next (V8 in node and Chrome, JavaScriptCore on the iPhone), and a book
     page is painted again from its date each time it is opened. So the geometry uses only + - * /
     and sqrt, which every engine rounds the same way (the brush does the same). */
  const HALF_PI = 1.5707963267948966, PI_ = 3.141592653589793, TAU_ = 6.283185307179586;
  const POW2 = new Float64Array(2046);
  { let p = 1; for (let k = 0; k <= 1023; k++) { POW2[1022 + k] = p; p *= 2; } p = 1; for (let k = 1; k <= 1022; k++) { p *= 0.5; POW2[1022 - k] = p; } }
  function msin(x) {
    x -= Math.floor(x / TAU_ + 0.5) * TAU_;
    if (x > HALF_PI) x = PI_ - x; else if (x < -HALF_PI) x = -PI_ - x;
    const z = x * x;
    return x * (1 + z * (-0.16666666666666666 + z * (0.008333333333333333 + z * (-0.0001984126984126984 +
      z * (0.0000027557319223985893 + z * (-2.505210838544172e-8 + z * 1.6059043836821613e-10))))));
  }
  function mcos(x) { return msin(x + HALF_PI); }
  function mexp(x) {
    if (x < -708) return 0;
    if (x > 709) return Infinity;
    const k = Math.floor(x * 1.4426950408889634 + 0.5);
    const r = (x - k * 0.6931471803691238) - k * 1.9082149292705877e-10;
    const p = 1 + r * (1 + r * (0.5 + r * (0.16666666666666666 + r * (0.041666666666666664 + r * (0.008333333333333333 +
      r * (0.001388888888888889 + r * (0.0001984126984126984 + r * (0.0000248015873015873 + r * (0.0000027557319223985893 + r * 2.755731922398589e-7)))))))));
    return p * POW2[k + 1022];
  }
  function mln(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN;
    let e = 0;
    while (x >= 2) { x *= 0.5; e++; }
    while (x < 1) { x *= 2; e--; }
    if (x > 1.4142135623730951) { x *= 0.5; e++; }
    const z = (x - 1) / (x + 1), q = z * z;
    return 2 * z * (1 + q * (0.3333333333333333 + q * (0.2 + q * (0.14285714285714285 + q * (0.1111111111111111 +
      q * (0.09090909090909091 + q * (0.07692307692307693 + q * 0.06666666666666667))))))) + e * 0.6931471805599453;
  }
  // whole powers by multiplying; others through exp and ln. A negative base with a fractional power
  // only ever comes from rounding (sin of pi, say), so it counts as zero.
  function mpow(x, y) {
    if (y === Math.floor(y) && y >= 0 && y <= 16) { let r = 1; for (let k = 0; k < y; k++) r *= x; return r; }
    if (x <= 0) return x === 0 && y < 0 ? Infinity : 0;
    return mexp(y * mln(x));
  }
  function matan(z) {
    let a = z < 0 ? -z : z, off = 0;
    if (a > 1) return (z < 0 ? -1 : 1) * (HALF_PI - matan(1 / a));
    if (a > 0.2679491924311227) { a = (a * 1.7320508075688772 - 1) / (1.7320508075688772 + a); off = 0.5235987755982988; }
    const q = a * a;
    let s = 1 / 23;
    for (let k = 21; k >= 1; k -= 2) s = 1 / k - q * s;
    const r = off + a * s;
    return z < 0 ? -r : r;
  }
  function matan2(y, x) {
    if (x === 0 && y === 0) return 0;
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    let r = ay <= ax ? matan(ay / ax) : HALF_PI - matan(ax / ay);
    if (x < 0) r = PI_ - r;
    return y < 0 ? -r : r;
  }
  function mhypot(x, y) { return Math.sqrt(x * x + y * y); }

  /* ---------------- dates and seasons (Ontario) ---------------- */
  function dayNum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) throw new Error('paintScenes: date must be YYYY-MM-DD, got ' + iso);
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
  }
  function isoOf(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function mdOf(n) { const d = new Date(n * 864e5); return (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  // The kids' seasons in Ontario: autumn from the equinox in late September, winter from the
  // first of December (the snow comes then, not at the solstice), spring from the equinox.
  function seasonOf(md) {
    if (md >= 1201 || md < 320) return 'winter';
    if (md < 621) return 'spring';
    if (md < 922) return 'summer';
    return 'autumn';
  }
  const inWindow = (md, from, to) => (from <= to ? md >= from && md <= to : md >= from || md <= to);
  // The moon in the painting is the moon outside: it appears only on the evenings around a real full
  // moon (three days either side), at that evening's phase. Evening in Ontario is about 00:00 UTC
  // of the next day. A new moon fell on 2000-01-06 at 18:14 UTC; a lunation is 29.530588853 days.
  const SYNODIC = 29.530588853;
  function moonOn(n) {
    const age = (((n + 1 - (10962 + 18.23 / 24)) % SYNODIC) + SYNODIC) % SYNODIC;
    const d = age - SYNODIC / 2;
    return Math.abs(d) <= 3 ? { age, d, frac: (1 - mcos(TAU * age / SYNODIC)) / 2 } : null;
  }
  const normName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

  /* ---------------- geometry ---------------- */
  const V = (x, y) => ({ x, y });
  const dist = (a, b) => mhypot(b.x - a.x, b.y - a.y);
  const polar = (p, ang, r) => V(p.x + mcos(ang) * r, p.y + msin(ang) * r);
  const mix = (a, b, t) => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
  const angOf = (a, b) => matan2(b.y - a.y, b.x - a.x);

  // points every `step` px along a polyline, the last point kept
  function resample(pts, step) {
    if (pts.length < 2) return pts.slice();
    const out = [V(pts[0].x, pts[0].y)];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = dist(a, b);
      let d = step - carry;
      while (d <= L) { out.push(mix(a, b, d / L)); d += step; }
      carry = L - (d - step);
    }
    const last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > step * 0.3) out.push(V(last.x, last.y));
    else out[out.length - 1] = V(last.x, last.y);
    return out;
  }
  // Catmull-Rom through the control points, then even spacing
  function spline(ctrl, step) {
    if (ctrl.length < 3) return resample(ctrl, step || 3);
    const dense = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(dist(p1, p2) / 2));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        dense.push(V(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)));
      }
    }
    dense.push(ctrl[ctrl.length - 1]);
    return resample(dense, step || 3);
  }
  function bez(p0, p1, p2, p3, step) {
    const dense = [];
    const n = Math.max(8, Math.ceil((dist(p0, p1) + dist(p1, p2) + dist(p2, p3)) / 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      dense.push(V(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
                   u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y));
    }
    return resample(dense, step || 3);
  }
  function qbez(p0, c, p1, step) { return bez(p0, mix(p0, c, 2 / 3), mix(p1, c, 2 / 3), p1, step); }
  function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; }
  // the point and heading at fraction f of a path's length
  function along(p, f) {
    const L = pathLen(p) * clamp(f, 0, 1);
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const d = dist(p[i - 1], p[i]);
      if (acc + d >= L || i === p.length - 1) {
        const t = d > 0 ? clamp((L - acc) / d, 0, 1) : 0;
        return { p: mix(p[i - 1], p[i], t), a: angOf(p[i - 1], p[i]), i };
      }
      acc += d;
    }
    return { p: p[0], a: 0, i: 0 };
  }
  function slice(p, f0, f1) {
    const L = pathLen(p), a = L * f0, b = L * f1;
    const out = [];
    let acc = 0;
    for (let i = 0; i < p.length; i++) {
      if (i > 0) acc += dist(p[i - 1], p[i]);
      if (acc >= a && acc <= b) out.push(p[i]);
    }
    const s = along(p, f0).p, e = along(p, f1).p;
    if (!out.length || dist(out[0], s) > 0.5) out.unshift(s);
    if (dist(out[out.length - 1], e) > 0.5) out.push(e);
    return out;
  }
  // a wandering limb: start, heading, length, segments, turn per joint, droop per joint
  function walk(R, start, heading, length, nseg, turn, droop) {
    const pts = [start];
    let a = heading, p = start;
    for (let k = 0; k < nseg; k++) {
      a += R.r(-turn, turn) + (droop || 0);
      p = polar(p, a, length / nseg * R.r(0.8, 1.2));
      pts.push(p);
    }
    return pts;
  }
  // a walk whose path stays mostly on the sheet: the best of a few tries
  function walkIn(R, start, heading, length, nseg, turn, droop, want) {
    let best = null, bf = -1;
    for (let k = 0; k < 10; k++) {
      const path = spline(walk(R, start, heading, length, nseg, turn, droop), 3);
      const inside = path.filter(q => q.x > 25 && q.x < W - 25 && q.y > 25 && q.y < H - 25).length / path.length;
      if (inside > bf) { bf = inside; best = path; }
      if (inside >= (want || 0.8)) break;
    }
    return best;
  }
  // width along the path: fn(t) with t 0..1
  function wid(path, fn) {
    const n = path.length;
    return path.map((q, i) => ({ x: q.x, y: q.y, w: fn(n > 1 ? i / (n - 1) : 0) }));
  }
  const prof = {
    taper: (w0, w1, k) => t => lerp(w0, w1, mpow(t, k || 1)),
    // a leaf or a blade: enters at w0*wm, full at `peak`, lifts to a point
    leaf: (wm, peak, w0) => t => (t < peak
      ? wm * lerp(w0 == null ? 0.35 : w0, 1, smooth(t / peak))
      : wm * mpow(mcos((t - peak) / (1 - peak) * Math.PI / 2), 1.1)),
    // a press: lands at `land`*wm, full quickly, eases to `end`*wm
    press: (wm, land, end) => t => wm * (t < 0.12 ? lerp(land, 1, smooth(t / 0.12)) : lerp(1, end, smooth((t - 0.12) / 0.88))),
    even: w => () => w,
    // a bamboo segment: pressed at both ends, a touch thinner in the middle
    knuckle: w => t => w * (0.92 + 0.12 * mpow(Math.abs(2 * t - 1), 6)),
  };
  function circle(cx, cy, rx, ry, n, rot, wob, R) {
    const pts = [];
    ry = ry || rx; n = n || 48;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const f = wob && R ? 1 + wob * msin(a * 3 + (R._ph || 0)) : 1;
      let x = mcos(a) * rx * f, y = msin(a) * ry * f;
      if (rot) { const c = mcos(rot), s = msin(rot); const X = x * c - y * s; y = x * s + y * c; x = X; }
      pts.push(V(cx + x, cy + y));
    }
    return pts;
  }
  // a ring cut out of a shape: the outline, a slit in to the hole, round the hole the other way, out again
  function withHole(outer, hole) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < outer.length; i++) for (let j = 0; j < hole.length; j += 2) {
      const d = dist(outer[i], hole[j]); if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const out = outer.slice(0, bi + 1);
    for (let k = 0; k <= hole.length; k++) out.push(hole[(bj - k + hole.length * 2) % hole.length]);
    out.push(outer[bi]);
    for (let i = bi + 1; i < outer.length; i++) out.push(outer[i]);
    return out;
  }

  /* ---------------- the op list ---------------- */
  function makeCtx(R, season) {
    const ops = [];
    let ph = 1;
    const c = {
      R, season, ops,
      phase(p) { ph = p; },
      get ph() { return ph; },
      keep: [],
      stroke(pts, o) {
        if (!pts || pts.length < 2) return;
        if (o.behind && c.keep.length) {
          const out = q => !c.keep.some(k => (q.x - k.x) * (q.x - k.x) + (q.y - k.y) * (q.y - k.y) < mpow(k.r + q.w + 3, 2));
          let run = [];
          const runs = [];
          for (const q of pts) { if (out(q)) run.push(q); else { if (run.length) runs.push(run); run = []; } }
          if (run.length) runs.push(run);
          if (runs.length !== 1 || runs[0].length !== pts.length) {
            const oo = Object.assign({}, o, { behind: false });
            for (const r of runs) if (r.length >= 3 && pathLen(r) > 8) c.stroke(r, oo);
            return;
          }
        }
        ops.push({ kind: 'stroke',
          pts: pts.map(q => ({ x: rd(q.x), y: rd(q.y), w: rd(Math.max(0.45, q.w)) })),
          o: { tone: rd(clamp(o.tone, 0.03, 1)), load: rd(o.load != null ? o.load : 0.85), wet: rd(o.wet != null ? o.wet : 0.45),
               seed: R.seed(), head: rd(o.head != null ? o.head : 0.3), tail: o.tail || 'taper' },
          phase: ph, part: o.part || '' });
      },
      dab(x, y, o) {
        ops.push({ kind: 'dab', x: rd(x), y: rd(y),
          o: { size: rd(o.size), angle: rd(o.angle || 0), shape: o.shape || 'round', tone: rd(clamp(o.tone, 0.03, 1)),
               load: rd(o.load != null ? o.load : 0.9), wet: rd(o.wet != null ? o.wet : 0.5), seed: R.seed() },
          phase: ph, part: o.part || '' });
        if (o.hairs) ops[ops.length - 1].o.hairs = o.hairs;
        if (o.aspect) ops[ops.length - 1].o.aspect = o.aspect;
      },
      wash(poly, o) {
        if (!poly || poly.length < 3 && !Array.isArray(poly[0])) return;
        const ring = r => r.map(q => ({ x: rd(q.x), y: rd(q.y) }));
        ops.push({ kind: 'wash', poly: Array.isArray(poly[0]) ? poly.map(ring) : ring(poly),
          o: { tone: rd(clamp(o.tone, 0.02, 1)), soft: rd(o.soft != null ? o.soft : 3), bloom: rd(o.bloom != null ? o.bloom : 0.3),
               grain: rd(o.grain != null ? o.grain : 0.5), seed: R.seed() },
          phase: ph, part: o.part || '' });
        if (o.fade) ops[ops.length - 1].o.fade = { x0: rd(o.fade.x0), y0: rd(o.fade.y0), x1: rd(o.fade.x1), y1: rd(o.fade.y1), to: o.fade.to };
      },
    };
    return c;
  }
  const ringsOf = poly => (Array.isArray(poly[0]) ? poly : [poly]);
  function mirrorOps(ops) {
    for (const op of ops) {
      if (op.kind === 'stroke') for (const q of op.pts) q.x = rd(W - q.x);
      else if (op.kind === 'wash') {
        for (const r of ringsOf(op.poly)) { for (const q of r) q.x = rd(W - q.x); r.reverse(); }
        if (op.o.fade) { op.o.fade.x0 = rd(W - op.o.fade.x0); op.o.fade.x1 = rd(W - op.o.fade.x1); }
      }
      else { op.x = rd(W - op.x); op.o.angle = rd(Math.PI - op.o.angle); }
    }
  }

  /* ---------------- shared motifs ---------------- */
  // width along a stroke from a few knots spread evenly over its length, times k
  function knots(ws, k) {
    return t => { const x = t * (ws.length - 1), i = Math.min(ws.length - 2, Math.floor(x)); return (k || 1) * lerp(ws[i], ws[i + 1], smooth(x - i)); };
  }
  // a leaf, blade or petal as one press-and-lift stroke from base to tip
  function leafStroke(c, base, ang, len, wm, o) {
    const bend = o.bend || 0;                           // + curls clockwise (y down)
    const tip = polar(base, ang + bend, len);
    const mid = polar(polar(base, ang, len * 0.5), ang + Math.PI / 2, len * bend * 0.35);
    const path = qbez(base, mid, tip, Math.max(1.5, Math.min(3, len / 14)));
    c.stroke(wid(path, prof.leaf(wm, o.peak || 0.35, o.w0 == null ? 0.35 : o.w0)),
      { tone: o.tone, load: o.load, wet: o.wet, head: o.head != null ? o.head : 0.15, tail: o.tail || 'taper', part: o.part, behind: o.behind });
    return tip;
  }
  // a long blade or reed leaf: rises from base along ang and the tip falls under its weight
  function blade(c, base, ang, len, wm, o) {
    const droop = o.droop || 0;
    const p1 = polar(base, ang, len * 0.5);
    const p2 = polar(p1, ang + droop * 0.5, len * 0.3);
    const p3 = polar(p2, ang + droop, len * 0.25);
    const path = spline([base, p1, p2, p3], 3);
    c.stroke(wid(path, prof.leaf(wm, o.peak || 0.2, o.w0 == null ? 0.7 : o.w0)),
      { tone: o.tone, load: o.load, wet: o.wet, head: o.head != null ? o.head : 0.1, tail: o.tail || 'taper', part: o.part, behind: o.behind });
    return path;
  }
  // the moon: a pale disc of wash, sometimes a thin dry wisp of cloud across it
  function moon(c, cx, cy, r, wisp) {
    const R = c.R, m = c.moon;
    let shape = circle(cx, cy, r, r, 72);
    if (m && Math.abs(m.d) >= 0.9) {
      // gibbous: the lit limb a half circle, the terminator a half ellipse bulging into the dark side;
      // the waxing moon is lit on the right, the waning on the left
      const b = r * Math.abs(mcos(TAU * m.age / SYNODIC)), sl = m.d < 0 ? 1 : -1;
      shape = [];
      for (let i = 0; i <= 36; i++) { const f = -Math.PI / 2 + Math.PI * i / 36; shape.push(V(cx + sl * r * mcos(f), cy + r * msin(f))); }
      for (let i = 1; i < 36; i++) { const f = Math.PI / 2 - Math.PI * i / 36; shape.push(V(cx - sl * b * mcos(f), cy + r * msin(f))); }
    }
    c.wash(shape, { tone: R.r(0.085, 0.115), soft: R.r(2.5, 5), bloom: 0.3, grain: 0.1, part: 'moon' });
    if (wisp) {
      const y = cy + r * R.r(0.15, 0.5), x0 = cx - r * R.r(1.2, 1.6), x1 = cx + r * R.r(0.9, 1.4);
      const path = spline([V(x0, y + 6), V(lerp(x0, x1, 0.45), y - R.r(4, 10)), V(x1, y + R.r(-4, 4))], 3);
      c.stroke(wid(path, t => 0.8 + R.r(4, 6) * msin(Math.PI * Math.min(1, t * 1.2))), { tone: R.r(0.26, 0.34), load: 0.25, wet: 0.5, head: 0.2, tail: 'dry', part: 'cloud' });
    }
  }
  // a far range: a crisp, angular ridge that dissolves downward into bare paper (mist is paper left alone)
  function ridge(c, x0, x1, ybase, peakY, peaks, tone, soft, wide) {
    const R = c.R;
    const n = 64, top = [], P = [];
    for (let k = 0; k < peaks; k++) P.push({ x: (k + R.r(0.2, 0.8)) / peaks, h: R.r(0.55, 1), s: R.r(0.1, 0.2) * (wide || 1), k: R.r(1.15, 1.8), lean: R.r(-0.4, 0.4) });
    const ph = [R.r(0, 6), R.r(0, 6), R.r(0, 6)];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(x0, x1, t);
      let h = 0;
      for (const p of P) {
        let d = (t - p.x) / p.s;
        d = d < 0 ? d * (1 - p.lean) : d * (1 + p.lean);
        h = Math.max(h, p.h * mpow(Math.max(0, 1 - Math.abs(d)), p.k));
      }
      h += 0.05 * msin(t * 29 + ph[0]) + 0.03 * msin(t * 71 + ph[1]) + 0.015 * msin(t * 157 + ph[2]);
      if (x0 > 0) h *= smooth(t / 0.15);
      if (x1 < W) h *= smooth((1 - t) / 0.15);
      top.push(V(x, lerp(ybase, peakY, clamp(h, 0, 1.1))));
    }
    const poly = top.concat([V(x1, ybase + 40), V(x0, ybase + 40)]);
    c.wash(poly, { tone, soft: soft == null ? 2 : soft, bloom: 0.35, grain: 0.1, fade: { x0: 0, y0: peakY + (ybase - peakY) * 0.45, x1: 0, y1: ybase + 20, to: 0 }, part: 'ridge' });
    return top;
  }
  // dry strokes laid along a ridge's top, the way the brush models a mountain's back
  function ridgeTexture(c, top, tone, w, n) {
    const R = c.R;
    const hi = top.map((q, i) => ({ q, i })).sort((a, b) => a.q.y - b.q.y).slice(0, Math.max(3, Math.floor(top.length * 0.4)));
    for (let k = 0; k < n; k++) {
      const i0 = hi[R.i(0, hi.length - 1)].i, len = R.i(4, 8), dir = R.sign();
      const seg = [];
      for (let j = 0; j < len; j++) { const i = i0 + dir * j; if (i < 0 || i >= top.length) break; seg.push(V(top[i].x, top[i].y + 1.5 + j * R.r(0.3, 1.2))); }
      if (seg.length > 2) c.stroke(wid(resample(seg, 3), prof.leaf(w, 0.25, 0.8)), { tone: tone * R.r(0.85, 1.15), load: 0.32, wet: 0.35, head: 0.3, tail: 'dry', part: 'cun' });
    }
  }
  // a leaf painted boneless: one wash in the leaf's own outline, pointed at the tip
  function leafShape(base, ang, len, wmax, bend, asym) {
    const n = 16, L = [], Rt = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const h = wmax * mpow(msin(Math.PI * mpow(t, 0.68)), 0.85) + (t < 0.08 ? 0.6 : 0);
      const u = t * len, vc = bend * len * 0.28 * msin(Math.PI * t);
      L.push([u, vc + h * (1 + asym)]); Rt.push([u, vc - h * (1 - asym)]);
    }
    const ca = mcos(ang), sa = msin(ang);
    return L.concat(Rt.reverse()).map(([u, v]) => V(base.x + u * ca - v * sa, base.y + u * sa + v * ca));
  }
  function leafWash(c, base, ang, len, wmax, tone, o) {
    o = o || {};
    const bend = o.bend == null ? c.R.r(-0.25, 0.25) : o.bend;
    c.wash(leafShape(base, ang, len, wmax, bend, c.R.r(-0.12, 0.12)), { tone: Math.min(tone, 0.78), soft: 1, bloom: 0.25, grain: 0.05, part: o.part || 'leaf' });
    return { base, ang, len, bend, tone };
  }
  // the midrib, struck dark into the wet leaf, and a pair or two of side veins
  function leafVeins(c, l, sides) {
    const R = c.R;
    const P = t => polar(polar(l.base, l.ang, l.len * t), l.ang + Math.PI / 2, l.bend * l.len * 0.28 * msin(Math.PI * t));
    const mid = []; for (let i = 0; i <= 12; i++) mid.push(P(0.04 + 0.8 * i / 12));
    const vt = Math.min(1, l.tone + 0.45);
    c.stroke(wid(mid, prof.taper(1.3, 0.5)), { tone: vt, load: 0.9, wet: 0.6, head: 0.1, tail: 'taper', part: 'vein' });
    for (let k = 0; k < (sides || 0); k++) for (const sd of [1, -1]) {
      const t0 = 0.25 + k * 0.22, p0 = P(t0);
      c.stroke(wid(resample([p0, polar(p0, l.ang + sd * 0.75, l.len * 0.18)], 1.5), prof.taper(0.9, 0.4)), { tone: vt, load: 0.9, wet: 0.6, head: 0, tail: 'taper', part: 'vein' });
    }
  }
  // a broad leaf in two strokes, one for each half, a hairline of bare paper left for the midrib
  function leafTwo(c, base, ang, len, wmax, tone, o) {
    o = o || {};
    const R = c.R, bend = o.bend == null ? R.r(-0.2, 0.2) : o.bend;
    const ca = mcos(ang), sa = msin(ang);
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20, h = wmax * mpow(msin(Math.PI * mpow(u, 0.68)), 0.85);
        const v = bend * len * 0.28 * msin(Math.PI * u) + side * (h / 2 + 0.8);
        pts.push({ x: base.x + u * len * ca - v * sa, y: base.y + u * len * sa + v * ca, w: Math.max(0.5, h / 2) });
      }
      c.stroke(pts, { tone: side > 0 ? tone : tone * R.r(0.78, 0.9), load: o.load || 0.8, wet: 0.6, head: 0.1, tail: 'taper', part: o.part || 'leaf' });
    }
    return { base, ang, len, bend, tone };
  }
  // the weather: 'moon' only when the moon is up tonight, and then most likely
  function sky(c, pairs) {
    const ps = pairs.filter(p => p[0] !== 'moon' || c.moon);
    const pick = c.R.weighted(ps);                       // drawn every time, so a seed's other choices hold
    return c.moon && ps.some(p => p[0] === 'moon') && c.R.chance(0.8) ? 'moon' : pick;
  }
  const theMoon = c => (c.moon && Math.abs(c.moon.d) < 0.9 ? 'the full moon' : 'the moon');   // as moon() draws it
  function rain(c, n, ang, tone, box) {
    const R = c.R;
    box = box || { x0: -20, y0: -20, x1: W + 20, y1: H + 20 };
    for (let k = 0; k < n; k++) {
      const p = V(R.r(box.x0, box.x1), R.r(box.y0, box.y1));
      const q = polar(p, ang, R.r(40, 100));
      c.stroke(wid(resample([p, q], 3), prof.leaf(R.r(0.6, 0.85), 0.5, 0.4)), { tone: tone * R.r(0.7, 1.15), load: 0.6, wet: 0.2, head: 0, tail: 'taper', part: 'rain' });
    }
  }
  // a small far bird: a shallow m, two arched wings meeting at the body, near level
  function farBird(c, p, s, heading, tone) {
    const R = c.R;
    const h = clamp(heading, -0.25, 0.25) * 0.5 + R.r(-0.12, 0.12);
    const up = h - Math.PI / 2;
    const lw = polar(polar(p, h + Math.PI, s * 0.5), up, s * R.r(0.04, 0.14));
    const rw = polar(polar(p, h, s * 0.5), up, s * R.r(0.04, 0.14));
    const arch = s * R.r(0.2, 0.3);
    c.stroke(wid(qbez(lw, polar(mix(lw, p, 0.5), up, arch), p, 1.2), prof.taper(0.55, 1.3)), { tone, load: 0.85, wet: 0.3, head: 0, tail: 'blunt', part: 'bird' });
    c.stroke(wid(qbez(p, polar(mix(p, rw, 0.5), up, arch), rw, 1.2), prof.taper(1.3, 0.5)), { tone, load: 0.85, wet: 0.3, head: 0.2, tail: 'taper', part: 'bird' });
  }
  function dots(c, pts, size, tone, part) {
    for (const p of pts) c.dab(p.x, p.y, { size: size * c.R.r(0.75, 1.25), shape: 'dot', tone: tone * c.R.r(0.9, 1.05), load: 1, wet: 0.5, angle: c.R.r(0, TAU), part: part || 'dots' });
  }
  // a limb painted the way a painter re-inks: a few strokes, each pressed where the last stopped
  function limb(c, path, w0, w1, cuts, o) {
    const full = wid(path, prof.taper(w0, w1, 0.85));
    const n = full.length;
    const idx = [0].concat(cuts.map(f => Math.round(f * (n - 1)))).concat([n - 1]);
    for (let k = 0; k + 1 < idx.length; k++) {
      if (o.phases) c.phase(o.phases[Math.min(k, o.phases.length - 1)]);
      const seg = full.slice(Math.max(0, idx[k] - 1), idx[k + 1] + 1);
      const last = k + 2 === idx.length;
      c.stroke(seg, { tone: o.tone * c.R.r(0.96, 1.03), load: last ? (o.load || 0.5) : Math.max(0.68, o.load || 0.5), wet: o.wet == null ? 0.45 : o.wet, head: k === 0 ? (o.head0 || 0) : 0.45, tail: last ? 'dry' : 'blunt', part: o.part || 'limb' });
    }
  }

  /* ================= the families ================= */

  /* ---- maple: a branch with its leaves turning, a few falling ---- */
  // the maple leaf's outline: five pointed lobes joined at the palm, a tooth on each side of the
  // three big ones, the stem in the notch between the two short ones
  function mapleShape(R, ctr, axis, L, squash) {
    const lobes = [[-2.15, 0.5], [-1.1, 0.86], [0, 1], [1.1, 0.86], [2.15, 0.5]].map(([a, l]) => [a * R.r(0.94, 1.06), l * R.r(0.93, 1.06)]);
    const P = (a, r) => [mcos(a) * r, msin(a) * r];
    const pts = [P(Math.PI, L * 0.1)];
    for (let i = 0; i < lobes.length; i++) {
      const [a, l] = lobes[i];
      const prevA = i === 0 ? -Math.PI : lobes[i - 1][0], nextA = i === lobes.length - 1 ? Math.PI : lobes[i + 1][0];
      const S1 = i === 0 ? P(-2.75, L * 0.2) : P((prevA + a) / 2, L * R.r(0.36, 0.44));
      const S2 = i === lobes.length - 1 ? P(2.75, L * 0.2) : null;
      const T = P(a, l * L), ua = [mcos(a), msin(a)];
      const edge = (A, B, f, amp) => {
        const M = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
        const d = M[0] * ua[0] + M[1] * ua[1], off = [M[0] - d * ua[0], M[1] - d * ua[1]], ol = mhypot(off[0], off[1]) || 1;
        return [M[0] + off[0] / ol * amp, M[1] + off[1] / ol * amp];
      };
      const tooth = l > 0.8 ? 0.1 * l * L : 0;
      pts.push(S1);
      if (tooth) { pts.push(edge(S1, T, 0.42, 0)); pts.push(edge(S1, T, 0.52, tooth)); pts.push(edge(S1, T, 0.6, -0.01 * L)); }
      pts.push(T);
      const Snext = S2 || P((a + nextA) / 2, L * R.r(0.36, 0.44));
      if (tooth) { pts.push(edge(T, Snext, 0.4, -0.01 * L)); pts.push(edge(T, Snext, 0.48, tooth)); pts.push(edge(T, Snext, 0.58, 0)); }
      if (S2) pts.push(S2);
    }
    const ca = mcos(axis), sa = msin(axis);
    const tips = lobes.map(([a, l]) => { const vx = mcos(a), vy = msin(a) * squash; return { a: axis + matan2(vy, vx), len: l * L * mhypot(vx, vy) }; });
    return { poly: pts.map(([x, y]) => { y *= squash; return V(ctr.x + x * ca - y * sa, ctr.y + x * sa + y * ca); }), tips };
  }
  // A maple leaf painted boneless in two tones: the whole leaf in a pale wash, then a darker one
  // over its heart where the ink pools, drawn smaller within the same outline. No hard rim.
  function mapleLeaf(c, ctr, axis, L, tone, o) {
    o = o || {};
    const sh = mapleShape(c.R, ctr, axis, L, o.squash || 1);
    const t = Math.min(tone, 0.78);
    c.wash(sh.poly, { tone: t * 0.7, soft: 1.6, bloom: 0.1, grain: 0.04, part: 'leaf' });
    const k = c.R.r(0.5, 0.62), off = polar(ctr, axis + Math.PI, L * 0.06);
    c.wash(sh.poly.map(q => V(off.x + (q.x - ctr.x) * k, off.y + (q.y - ctr.y) * k)), { tone: t * 0.55, soft: 3, bloom: 0.05, grain: 0.04, part: 'leaf' });
    return [sh.tips[2], sh.tips[1], sh.tips[3], sh.tips[0], sh.tips[4]];
  }
  function mapleVeins(c, ctr, tips, tone) {
    tips.slice(0, 3).forEach(t => {
      const e = polar(ctr, t.a, t.len * 0.62);
      c.stroke(wid(qbez(polar(ctr, t.a, 3), polar(mix(ctr, e, 0.5), t.a + Math.PI / 2, t.len * 0.03), e, 2), prof.taper(0.8, 0.3)), { tone, load: 0.85, wet: 0.7, head: 0, tail: 'taper', part: 'vein' });
    });
  }
  function maple(c) {
    const R = c.R;
    const layout = R.weighted([['hang', 5], ['rise', 4]]);
    const weather = sky(c, [['clear', 4], ['far', 3], ['moon', 2], ['wind', 3]]);
    const windy = weather === 'wind';
    const path = layout === 'hang' ? walkIn(R, V(-14, R.r(80, 200)), R.r(0.15, 0.42), R.r(340, 420), 4, 0.3, 0.04, 0.9)
      : walkIn(R, V(-14, R.r(560, 660)), R.r(-0.72, -0.45), R.r(380, 450), 4, 0.3, 0.02, 0.9);
    const w0 = R.r(11, 14);
    const tip = path[path.length - 1];
    const tipA = angOf(path[Math.max(0, path.length - 5)], tip);
    // twigs
    const twigs = [];
    const nt = R.i(1, 2);
    const fr = R.shuffle([0.4, 0.55, 0.7]).slice(0, nt).sort();
    for (const f of fr) {
      const at = along(path, f);
      const side = layout === 'rise' ? R.pick([-1, 1]) : 1;
      let a = at.a + side * R.r(0.6, 1.05);
      if (layout !== 'rise' && msin(a) < 0.25) a = at.a + R.r(0.7, 1.0);
      const len = R.r(50, 95);
      const m = polar(at.p, a, len * 0.5);
      twigs.push({ path: spline([at.p, m, polar(m, a + R.r(-0.3, 0.3), len * 0.5)], 3) });
    }
    const clusters = twigs.map(t => ({ at: t.path[t.path.length - 1], dir: angOf(t.path[Math.max(0, t.path.length - 4)], t.path[t.path.length - 1]) }));
    clusters.push({ at: tip, dir: tipA });
    const toneBag = R.shuffle([0.92, 0.82, 0.66, 0.55, 0.45, 0.36, 0.74, 0.5]);
    let tb = 0;
    const leaves = [];
    for (const cl of clusters) {
      const n = R.chance(0.3) ? 3 : 2;
      const hangDir = layout === 'rise' ? cl.dir + R.r(-0.25, 0.25) : Math.PI / 2 + R.r(-0.3, 0.3);
      for (let k = 0; k < n; k++) {
        const L = R.r(48, 60) * (k === 0 ? 1.08 : 1);
        const a = hangDir + (k - (n - 1) / 2) * R.r(0.85, 1.1) + R.r(-0.12, 0.12);
        const ctr = polar(cl.at, a, L * R.r(0.62, 0.85));
        leaves.push({ ctr, axis: a + R.r(-0.15, 0.15), L, tone: toneBag[tb++ % toneBag.length], from: cl.at, squash: R.chance(0.3) ? R.r(0.65, 0.85) : 1 });
      }
    }
    const nfall = windy ? R.i(3, 5) : R.i(1, 3);
    const fall = [];
    const dirX = layout === 'rise' ? -1 : 1;
    const f0 = V(clamp(tip.x + dirX * R.r(10, 60), 70, W - 70), Math.max(tip.y + R.r(110, 160), 320));
    const f1 = V(dirX > 0 ? W * R.r(0.6, 0.8) : W * R.r(0.2, 0.4), H * R.r(0.76, 0.86));
    for (let k = 0; k < nfall; k++) {
      const t = nfall === 1 ? R.r(0.35, 0.8) : k / (nfall - 1);
      const p = mix(f0, f1, t);
      fall.push({ ctr: V(clamp(p.x + (windy ? R.r(-70, 70) : R.r(-30, 30)), 60, W - 60), p.y + R.r(-25, 25)), axis: R.r(0, TAU), L: R.r(34, 44), tone: R.r(0.42, 0.8), squash: R.r(0.6, 1) });
    }
    // 1: the air, or the branch at once
    const air = weather === 'far' || weather === 'moon';
    c.phase(1);
    if (weather === 'far') ridge(c, -30, W + 30, H * R.r(0.84, 0.9), H * R.r(0.64, 0.72), R.i(2, 3), R.r(0.11, 0.15));
    if (weather === 'moon') {
      const mx = layout === 'rise' ? W * R.r(0.24, 0.36) : W * R.r(0.64, 0.76);
      moon(c, mx, H * R.r(0.2, 0.3), R.r(64, 86), R.chance(0.3));
    }
    // 1-2: the branch, re-inked at its joint; 3: the twigs
    limb(c, path, w0, 2.4, [R.r(0.5, 0.6)], { tone: R.r(0.85, 0.93), load: 0.48, part: 'branch', phases: air ? [2, 2] : [1, 2] });
    c.phase(3);
    twigs.forEach(t => c.stroke(wid(t.path, prof.taper(4.2, 1.3)), { tone: R.r(0.8, 0.9), load: 0.6, wet: 0.35, head: 0.35, tail: 'dry', part: 'twig' }));
    if (twigs.length < 2) {
      const at = along(path, R.r(0.2, 0.3));
      const a = at.a + (layout === 'rise' ? -1 : 1) * R.r(0.7, 1.0);
      const e = polar(at.p, a, R.r(34, 48));
      c.stroke(wid(resample([at.p, e], 2), prof.taper(3.4, 1.1)), { tone: 0.88, load: 0.6, wet: 0.3, head: 0.3, tail: 'dry', part: 'twig' });
    }
    // 4: the pale leaves behind; 5: the dark ones in front; 6: the rest
    leaves.sort((a, b) => a.tone - b.tone);
    const nPale = Math.max(1, Math.floor(leaves.length * 0.3));
    const pale = leaves.slice(0, nPale), rest = leaves.slice(nPale).sort((a, b) => b.tone - a.tone);
    const veins = [];
    const paint = lf => {
      const se = polar(lf.ctr, lf.axis + Math.PI, lf.L * 0.12);
      c.stroke(wid(qbez(lf.from, polar(mix(lf.from, se, 0.5), angOf(lf.from, se) + Math.PI / 2, 5), se, 2), prof.taper(1.1, 0.8)), { tone: 0.72, load: 0.85, wet: 0.3, head: 0, tail: 'taper', part: 'stem' });
      const tips = mapleLeaf(c, lf.ctr, lf.axis, lf.L, lf.tone, { squash: lf.squash });
      if (lf.tone < 0.8) veins.push({ ctr: lf.ctr, tips, tone: Math.min(0.9, lf.tone * 0.7 + 0.25) });
    };
    pale.forEach((lf, k) => { c.phase(k === 0 ? 3 : 4); paint(lf); });
    if (pale.length < 2) { c.phase(4); if (rest.length) paint(rest.shift()); }
    rest.forEach((lf, k) => { c.phase(k < Math.ceil(rest.length / 2) ? 5 : 6); paint(lf); });
    // 7: veins struck into the leaves, and the leaves already falling; 8: the last, still in the air
    c.phase(7);
    for (const v of veins) mapleVeins(c, v.ctr, v.tips, v.tone);
    fall.sort((a, b) => a.ctr.y - b.ctr.y);
    const last = fall.pop();
    for (const lf of fall) mapleLeaf(c, lf.ctr, lf.axis, lf.L, lf.tone, { squash: lf.squash });
    c.phase(8);
    if (last) mapleLeaf(c, last.ctr, last.axis, last.L * 1.05, Math.max(0.55, last.tone), { squash: last.squash });
    const cap = weather === 'far' ? 'Maple above the valley' : weather === 'moon' ? 'Maple under ' + theMoon(c)
      : windy ? 'Maple leaves in the wind' : nfall >= 3 ? 'Maple leaves falling' : 'A maple branch';
    return { caption: cap, sealSide: layout === 'rise' ? 1 : -1 };
  }

  /* ---- reeds: stems, blades and autumn plumes (heron, geese, dragonfly) ---- */
  function makeReed(R, base, height, lean, o) {
    o = o || {};
    const top = V(base.x + lean * height, base.y - height);
    const bow = R.r(-0.05, 0.05) * height;
    const ctrl = [base, V(lerp(base.x, top.x, 0.55) + bow, lerp(base.y, top.y, 0.55)), top];
    const side = lean > 0.01 ? 1 : lean < -0.01 ? -1 : R.sign();
    if (o.plume) ctrl.push(V(top.x + side * height * R.r(0.05, 0.09), top.y + height * R.r(0.03, 0.06)));
    const stem = spline(ctrl, 3);
    const leaves = [];
    const nl = o.leaves == null ? R.i(1, 3) : o.leaves;
    for (let k = 0; k < nl; k++) {
      const at = along(stem, R.r(0.15, 0.6));
      const sd = R.sign();
      leaves.push({ base: at.p, ang: at.a + sd * R.r(0.3, 0.7), len: R.r(0.2, 0.36) * height * (o.leafScale || 1),
        wm: R.r(2.8, 4.2) * (o.leafW || 1), droop: sd * R.r(0.5, 1.3), dry: R.chance(0.5) });
    }
    return { stem, leaves, plume: !!o.plume, side };
  }
  function reedStem(c, r, tone, w, behind) {
    c.stroke(wid(r.stem, prof.taper(w, w * 0.55)), { tone, load: 0.7, wet: 0.35, head: 0, tail: 'taper', part: 'reed', behind });
  }
  function reedLeaves(c, r, tone, behind) {
    for (const lf of r.leaves) blade(c, lf.base, lf.ang, lf.len, lf.wm, { tone: tone * c.R.r(0.9, 1.06), droop: lf.droop, load: lf.dry ? 0.5 : 0.8, wet: 0.4, tail: lf.dry ? 'dry' : 'taper', part: 'reedleaf', behind });
  }
  function reedPlume(c, r, tone, scale, behind) {
    const R = c.R, n = R.i(8, 12);
    scale = scale || 1;
    for (let k = 0; k < n; k++) {
      const at = along(r.stem, R.r(0.84, 0.99));
      const a = Math.PI / 2 - r.side * R.r(0.15, 1.0);
      leafStroke(c, at.p, a, R.r(18, 44) * scale, R.r(1.5, 2.4) * scale, { tone: tone * R.r(0.8, 1.1), load: 0.4, wet: 0.3, peak: 0.25, w0: 0.6, bend: r.side * R.r(-0.1, 0.35), tail: 'dry', part: 'plume', behind });
    }
  }

  /* ---- heron in the reeds ---- */
  function heronPlan(fx, fy, s, pose) {
    const tilt = pose === 'hunt' ? -0.18 : 0;
    const P = (u, v) => V(fx - u * s, fy - v * s);          // faces left: forward is -x
    // the body leans forward when it hunts: turn the body's points about the hip
    const Pb = (u, v) => { const c0 = mcos(tilt), s0 = msin(tilt); return P(u * c0 - (v - 52) * s0, 52 + u * s0 + (v - 52) * c0); };
    let neck, head, beakTilt;
    if (pose === 'alert') { neck = [P(10, 62), P(15, 71), P(12, 82), P(14, 92)]; head = P(16.5, 96); beakTilt = 0.12; }
    else if (pose === 'hunt') { neck = [P(12, 58), P(18, 57), P(24, 53.5), P(28.5, 48.5)]; head = P(31, 45.5); beakTilt = 1.0; }
    else { neck = [P(10, 62), P(14, 67.5), P(11, 72.5), P(13, 76.5)]; head = P(15.5, 78.5); beakTilt = 0.16; }
    neck = neck.concat([head]);
    // the silhouette, as circles, for the reeds behind to stop short of
    const keep = [];
    const body = spline([Pb(12, 60), Pb(0, 58.5), Pb(-12, 53.5), Pb(-26, 45)], 6);
    body.forEach((q, i) => keep.push({ x: q.x, y: q.y, r: s * knots([5.5, 8.5, 6.5, 2])(i / (body.length - 1)) }));
    spline(neck, 5).forEach(q => keep.push({ x: q.x, y: q.y, r: s * 2.6 }));
    keep.push({ x: head.x, y: head.y, r: s * 3 });
    const bA = Math.PI - beakTilt;
    for (let k = 1; k <= 5; k++) { const q = polar(head, bA, s * 2.6 * k); keep.push({ x: q.x, y: q.y, r: s * 1.3 }); }
    for (const leg of [[P(-0.5, 50), P(-3.5, 21), P(0, 0)], [P(2.5, 50), P(0.5, 22), P(4.5, 1)]]) resample(leg, 6).forEach(q => keep.push({ x: q.x, y: q.y, r: s * 1.1 }));
    return { P, Pb, neck, head, beakTilt, keep };
  }
  // The heron in a painter's few strokes: two wet grey strokes laid side by side for the body (the
  // back, then the breast under it), one dark dry stroke pulled back off the body for the folded wing
  // and tail, the neck one S stroke thinning toward the head, the head a small dark press, the beak
  // two fine strokes meeting at the point, two long fine legs bent at the knee. Nothing filled.
  function heronBird(c, hp, s, pose, tone, ph) {
    const R = c.R, P = hp.P, Pb = hp.Pb, U = u => u * s;
    const run = (pts, ws, o) => { const path = spline(pts, 2.5); c.stroke(wid(path, knots(ws, s)), o); return path; };
    c.phase(ph.body);
    run([Pb(11, 61), Pb(1, 60.5), Pb(-11, 56), Pb(-24, 47.5)], [4.2, 6.2, 4.8, 1.6], { tone, load: 0.62, wet: 0.95, head: 0.5, tail: 'dry', part: 'heron' });
    run([Pb(10, 56.5), Pb(-1, 53.5), Pb(-13, 50.5), Pb(-22, 46.5)], [3.4, 5, 3.6, 1.2], { tone: tone * 0.72, load: 0.66, wet: 0.95, head: 0.4, tail: 'taper', part: 'heron' });
    run([Pb(3, 59), Pb(-6, 57.5), Pb(-15, 53.5), Pb(-27, 45.5), Pb(-34, 40.5)], [1.4, 3.1, 2.6, 1.1, 0.4], { tone: 0.92, load: 0.3, wet: 0.45, head: 0.8, tail: 'dry', part: 'wing' });
    // the neck in one S, thinning toward the head; the head a small dark press
    c.phase(ph.neck);
    const neck = spline(hp.neck.slice(0, -1).concat([mix(hp.neck[hp.neck.length - 2], hp.head, 0.7)]), 2.5);
    c.stroke(wid(neck, t => U(lerp(2.7, 1.45, mpow(t, 0.8)))), { tone: tone * 1.05, load: 0.72, wet: 0.8, head: 0.4, tail: 'taper', part: 'heron' });
    const head = hp.head;
    c.dab(head.x, head.y, { size: U(3.9), angle: Math.PI - hp.beakTilt * 0.5, shape: 'round', tone: Math.min(0.9, tone * 1.7), load: 0.95, wet: 0.45, part: 'head' });
    const bA = Math.PI - hp.beakTilt;
    const tip = polar(polar(head, bA, U(1.5)), bA, U(12.5));
    for (const sd of [1, -1]) {
      const b0 = polar(polar(head, bA, U(1.4)), bA + Math.PI / 2, sd * U(0.55));
      c.stroke(wid(resample([b0, mix(b0, tip, 0.5), tip], 1.2), prof.taper(U(0.55), U(0.08), 0.9)), { tone: 0.9, load: 0.95, wet: 0.3, head: 0.1, tail: 'taper', part: 'beak' });
    }
    // legs, the far one paler, each one long fine stroke bent at the knee
    c.phase(ph.legs);
    const legW = t => U(0.46 + 0.1 * mexp(-mpow((t - 0.5) / 0.06, 2)));
    c.stroke(wid(spline([P(-0.5, 50), P(-3, 25), P(-3.5, 21), P(0, 0)], 2), legW), { tone: 0.9, load: 0.9, wet: 0.3, head: 0.1, tail: 'taper', part: 'leg' });
    if (pose === 'oneleg') c.stroke(wid(spline([P(2.5, 50), P(-5, 37), P(-6, 36), P(2, 40.5)], 2), legW), { tone: 0.62, load: 0.9, wet: 0.3, head: 0.1, tail: 'taper', part: 'leg' });
    else c.stroke(wid(spline([P(2.5, 50), P(0.8, 26), P(0.5, 22), P(4.5, 1)], 2), legW), { tone: 0.62, load: 0.9, wet: 0.3, head: 0.1, tail: 'taper', part: 'leg' });
    // the finishing touches: the black crest, the eye, the shaggy plumes of the breast
    c.phase(ph.touch);
    const cr = polar(head, 0.5, U(1));
    c.stroke(wid(qbez(cr, polar(cr, 0.35, U(3.5)), polar(cr, 0.62, U(7.5)), 1.5), prof.taper(U(0.55), U(0.06))), { tone: 0.92, load: 0.8, wet: 0.3, head: 0.1, tail: 'taper', part: 'crest' });
    c.dab(head.x - U(1.1), head.y - U(0.4), { size: U(1.1), shape: 'dot', tone: 1, load: 1, wet: 0.2, part: 'eye' });
    const nb = hp.neck[pose === 'hunt' ? 0 : 1];
    for (let k = 0; k < R.i(3, 4); k++) {
      const p0 = V(nb.x + U(R.r(-1.5, 1.5)), nb.y + U(R.r(-1, 2)));
      leafStroke(c, p0, Math.PI / 2 + R.r(-0.35, 0.05), U(R.r(7, 10)), U(0.5), { tone: 0.6, load: 0.35, wet: 0.3, peak: 0.3, tail: 'dry', part: 'plumes' });
    }
  }
  function heron(c) {
    const R = c.R;
    const pose = R.weighted([['rest', 3], ['alert', 3], ['hunt', 2], ['oneleg', 2]]);
    const weather = sky(c, [['mist', 4], ['moon', 2], ['clear', 3], ['rain', 1]]);
    const s = pose === 'alert' ? R.r(3.9, 4.3) : R.r(4.3, 4.8);
    const fx = W * R.r(0.52, 0.6), fy = H * R.r(0.8, 0.85);
    const tone = R.r(0.34, 0.44);
    const hp = heronPlan(fx, fy, s, pose);
    c.keep = hp.keep;
    // reeds: near ones on the tail side (they may pass behind the bird), pale ones far on the open side
    const near = [], far = [], front = [];
    const nn = R.i(3, 5);
    for (let k = 0; k < nn; k++) {
      const x = Math.min(W - 12, lerp(fx + 40, W - 10, k / Math.max(1, nn - 1)) + R.r(-20, 20));
      near.push(makeReed(R, V(x, H + 12), R.r(0.55, 0.9) * H, R.r(-0.1, 0.04), { plume: R.chance(0.55), leaves: R.i(1, 2) }));
    }
    const nf = R.i(2, 4);
    for (let k = 0; k < nf; k++) far.push(makeReed(R, V(R.r(20, fx - 170), fy + R.r(-30, 10)), R.r(0.2, 0.42) * H, R.r(-0.08, 0.08), { plume: R.chance(0.5), leaves: R.i(0, 2), leafW: 0.8 }));
    front.push(makeReed(R, V(fx - R.r(70, 150), H + 12), R.r(0.2, 0.32) * H, R.r(-0.1, 0.12), { leaves: 1, plume: false }));
    // 1: the air and the far reeds; 2-3: the near reeds rise; 4: their plumes, and the water
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.2, 0.3), H * R.r(0.16, 0.24), R.r(58, 76), R.chance(0.35));
    else ridge(c, -30, fx - 60, fy - R.r(40, 80), fy - R.r(170, 240), R.i(1, 2), R.r(0.1, 0.14));
    for (const r of far) { reedStem(c, r, R.r(0.16, 0.24), 1.3); reedLeaves(c, r, 0.2); if (r.plume) reedPlume(c, r, 0.19, 0.7); }
    const half = Math.ceil(near.length / 2);
    near.forEach((r, k) => { c.phase(k < half ? 2 : 3); reedStem(c, r, R.r(0.55, 0.82), R.r(1.6, 2.1), true); reedLeaves(c, r, R.r(0.55, 0.85), true); });
    c.phase(4);
    near.forEach(r => { if (r.plume) reedPlume(c, r, R.r(0.45, 0.62), 1, true); });
    for (let k = 0; k < R.i(3, 4); k++) {
      const y = fy + R.r(-2, 12), x = fx + R.r(-80, 30), L = R.r(40, 100);
      c.stroke(wid(resample([V(x, y), V(x + L, y + R.r(-2, 2))], 2.5), prof.leaf(R.r(1.4, 2.2), 0.3, 0.8)), { tone: R.r(0.42, 0.6), load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' });
    }
    c.keep = [];
    // 5-8: the heron
    heronBird(c, hp, s, pose, tone, { body: 5, neck: 6, legs: 7, touch: 8 });
    // 8: a blade in front, and the rain if it rains
    c.phase(8);
    for (const r of front) { reedStem(c, r, 0.85, 1.8); reedLeaves(c, r, 0.9); }
    if (weather === 'rain') rain(c, R.i(24, 32), Math.PI / 2 + R.r(0.12, 0.3), 0.28);
    const cap = pose === 'hunt' ? 'Heron fishing' : weather === 'moon' ? 'Heron under ' + theMoon(c) : weather === 'rain' ? 'Heron in the rain'
      : pose === 'oneleg' ? 'Heron on one leg' : 'Heron in the reeds';
    return { caption: cap, sealSide: -1 };
  }

  /* ---- geese crossing the moon ---- */
  function gooseBird(c, p, s, h, pose, tone) {
    const at = (a, b) => polar(polar(p, h, a * s), h - Math.PI / 2, b * s);   // a along flight, b up
    const S = (pts, ws, o) => c.stroke(wid(spline(pts, 1.5), knots(ws, s)), o);
    const farLift = pose === 'up' ? 0.3 : pose === 'down' ? -0.2 : -0.22;
    const nearLift = pose === 'up' ? 0.46 : pose === 'down' ? -0.3 : 0.42;
    S([at(0.06, 0.01), at(-0.02, farLift * 0.55), at(-0.1, farLift)], [0.035, 0.04, 0.006], { tone: tone * 0.8, load: 0.5, wet: 0.35, head: 0.1, tail: 'dry', part: 'goose' });
    S([at(-0.2, 0), at(-0.04, 0.012), at(0.12, 0.004)], [0.03, 0.062, 0.038], { tone, load: 0.85, wet: 0.5, head: 0.3, tail: 'blunt', part: 'goose' });
    S([at(0.1, 0.006), at(0.21, 0.02), at(0.31, 0.022)], [0.022, 0.018, 0.017], { tone, load: 0.9, wet: 0.4, head: 0.1, tail: 'blunt', part: 'goose' });
    const hd = at(0.33, 0.022);
    c.dab(hd.x, hd.y, { size: s * 0.066, shape: 'round', tone, load: 1, wet: 0.4, part: 'goose' });
    S([at(0.35, 0.02), at(0.41, 0.012)], [0.012, 0.004], { tone, load: 1, wet: 0.2, head: 0, tail: 'taper', part: 'goose' });
    S([at(0.03, 0.015), at(-0.05, nearLift * 0.55), at(-0.2, nearLift)], [0.045, 0.05, 0.007], { tone, load: 0.48, wet: 0.35, head: 0.2, tail: 'dry', part: 'goose' });
  }
  function geese(c) {
    const R = c.R;
    const hasMoon = !!c.moon && R.chance(0.85);
    const ground = R.weighted([['reeds', 4], ['hills', 3], ['shore', 2]]);
    const form = R.weighted([['line', 4], ['vee', 3], ['pair', 2]]);
    const mx = W * R.r(0.6, 0.72), my = H * R.r(0.2, 0.3), mr = R.r(88, 115);
    const h = -R.r(0.18, 0.42);
    const lead = hasMoon ? V(mx + R.r(-0.45, 0.2) * mr, my + R.r(0.05, 0.55) * mr) : V(W * R.r(0.55, 0.68), H * R.r(0.3, 0.4));
    const flock = [];
    const nNear = form === 'pair' ? 2 : R.i(3, 5);
    let s = form === 'pair' ? R.r(115, 135) : R.r(100, 122);
    for (let k = 0; k < nNear; k++) {
      let p;
      if (k === 0) p = lead;
      else if (form === 'vee') { const arm = k % 2 ? 1 : -1, rank = Math.ceil(k / 2); p = polar(lead, h + Math.PI + arm * 0.42, rank * R.r(95, 120)); }
      else p = polar(flock[k - 1].p, h + Math.PI + R.r(-0.25, 0.25), R.r(90, 125));
      flock.push({ p, s, tone: clamp(0.92 - k * 0.07, 0.5, 1), pose: R.pick(['up', 'down', 'mid']) });
      s *= R.r(0.84, 0.93);
    }
    const tiny = [];
    if (form === 'pair' || R.chance(0.35)) {
      const n = R.i(5, 8), start = V(W * R.r(0.12, 0.3), H * R.r(0.12, 0.2));
      for (let k = 0; k < n; k++) { const arm = k % 2 ? 1 : -1, rank = Math.ceil(k / 2); tiny.push(polar(start, h + Math.PI + arm * 0.5, rank * R.r(20, 26))); }
    }
    const last = flock[flock.length - 1];
    const straggler = { p: polar(last.p, h + Math.PI + R.r(-0.5, 0.5), R.r(110, 150)), s: Math.max(70, last.s * R.r(0.85, 0.95)), tone: 0.8, pose: 'down' };
    straggler.p.y = Math.min(straggler.p.y, H * 0.64); straggler.p.x = Math.max(straggler.p.x, 50);
    // 1: the moon, or the last light low in the sky
    c.phase(1);
    if (hasMoon) moon(c, mx, my, mr, R.chance(0.35));
    // 1: the far country too; 2-4: the near ground
    const gy = H * R.r(0.82, 0.87);
    if (ground === 'hills' || !hasMoon) { ridge(c, -30, W * 0.72, gy + 10, gy - R.r(80, 130), 2, R.r(0.13, 0.17)); ridge(c, W * 0.3, W + 30, gy + 30, gy - R.r(30, 60), 1, R.r(0.08, 0.11)); }
    else ridge(c, -30, W + 30, gy + 20, gy - R.r(30, 55), R.i(2, 3), R.r(0.08, 0.11));
    const reeds = [];
    const nr = ground === 'reeds' ? R.i(6, 9) : R.i(5, 6);
    const rx0 = ground === 'hills' ? W * 0.55 : 0;
    for (let k = 0; k < nr; k++) reeds.push(makeReed(R, V(R.r(Math.max(12, rx0 - 10), W - 12), H + 12), R.r(90, ground === 'reeds' ? 260 : 170), R.r(-0.12, 0.12), { plume: R.chance(0.45), leaves: R.i(0, 2), leafScale: 1.2 }));
    c.phase(2);
    if (ground === 'shore') {
      const y = gy + R.r(12, 26), xa = R.r(-40, 60), xb = R.r(W * 0.55, W * 0.9);
      c.wash([V(xa, y), V(lerp(xa, xb, 0.3), y - R.r(9, 13)), V(lerp(xa, xb, 0.75), y - R.r(5, 9)), V(xb, y + 2), V(lerp(xa, xb, 0.6), y + 7), V(lerp(xa, xb, 0.2), y + 6)], { tone: 0.16, soft: 2, bloom: 0.4, grain: 0.1, part: 'sandbar' });
      for (let k = 0; k < 3; k++) { const x = R.r(xa, xb - 80), yy = y + R.r(8, 20); c.stroke(wid(resample([V(x, yy), V(x + R.r(60, 140), yy + R.r(-3, 3))], 3), prof.leaf(1.6, 0.3, 0.8)), { tone: 0.35, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'shore' }); }
    }
    reeds.forEach((r, k) => { if (k % 2 === 0) { reedStem(c, r, R.r(0.28, 0.38), 1.5); reedLeaves(c, r, 0.34); } });
    const skeinEarly = !hasMoon && tiny.length > 0;
    if (skeinEarly) for (const p of tiny) farBird(c, p, R.r(20, 26), h, R.r(0.45, 0.6));
    c.phase(3);
    reeds.forEach((r, k) => { if (k % 2 === 1) reedStem(c, r, R.r(0.5, 0.7), 1.8); });
    c.phase(4);
    reeds.forEach((r, k) => { if (k % 2 === 1) reedLeaves(c, r, 0.6); if (r.plume) reedPlume(c, r, k % 2 ? 0.52 : 0.28, 0.85); });
    if (reeds.filter((r, k) => k % 2 === 1 && (r.plume || r.leaves.length)).length < 2) {
      const extra = makeReed(R, V(R.r(W * 0.55, W - 20), H + 12), R.r(150, 240), R.r(-0.1, 0.1), { plume: true, leaves: 2, leafScale: 1.2 });
      reedStem(c, extra, 0.62, 1.8); reedLeaves(c, extra, 0.6); reedPlume(c, extra, 0.5, 0.85);
    }
    // 5: the lead goose; 6: the others; 7: the far skein; 8: the straggler catching up
    c.phase(5);
    gooseBird(c, flock[0].p, flock[0].s, h, flock[0].pose, flock[0].tone);
    const nf = flock.length - 1;
    for (let k = 1; k < flock.length; k++) { c.phase(nf < 2 || k <= Math.ceil(nf / 2) ? 6 : 7); gooseBird(c, flock[k].p, flock[k].s, h + R.r(-0.08, 0.08), flock[k].pose, flock[k].tone); }
    c.phase(7);
    if (tiny.length && !skeinEarly) for (const p of tiny) farBird(c, p, R.r(20, 26), h, R.r(0.45, 0.6));
    else if (nf < 2 || skeinEarly) { const g0 = V(W * R.r(0.15, 0.35), H * R.r(0.08, 0.16)); for (let k = 0; k < 4; k++) farBird(c, polar(g0, h + Math.PI + (k % 2 ? 0.5 : -0.5), Math.ceil(k / 2) * 30), R.r(24, 30), h, 0.55); }
    c.phase(8);
    gooseBird(c, straggler.p, straggler.s, h + R.r(-0.12, 0.05), straggler.pose, straggler.tone);
    const n = flock.length + 1;
    const words = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six'];
    const cap = hasMoon ? (tiny.length ? 'Geese across ' + theMoon(c) : words[n] + ' geese across ' + theMoon(c)) : ground === 'shore' ? 'Geese over the sandbar' : c.season === 'spring' ? 'Geese flying north' : 'Geese flying south';
    return { caption: cap, sealSide: 1 };
  }

  /* ---- full moon and pampas grass ---- */
  function pampas(c) {
    const R = c.R;
    const low = R.chance(0.4);
    const bx = R.r(70, 170), by = H + 12;
    const mx = low ? bx + R.r(90, 170) : W * R.r(0.56, 0.7), my = low ? H * R.r(0.44, 0.56) : H * R.r(0.2, 0.32), mr = low ? R.r(110, 140) : R.r(100, 135);
    // with the moon up this is moon viewing (tsukimi); without it, the grass in the wind at dusk
    const withMoon = !!c.moon;
    const hills = !withMoon || R.chance(0.65), cloud = R.chance(0.4);
    const finish = R.weighted([['blade', 3], ['dragonfly', 2], ['geese', 2]]);
    const lean = withMoon ? 0 : R.r(0.25, 0.45);                  // the wind leans the stems
    c.phase(1);
    if (withMoon) { moon(c, mx, my, mr, cloud); c.phase(2); }
    if (hills) ridge(c, W * 0.15, W + 30, H * R.r(0.84, 0.9), H * R.r(0.62, 0.72), 2, R.r(0.1, 0.14));
    if (!withMoon) { for (let k = 0; k < 3; k++) farBird(c, V(W * R.r(0.55, 0.85), H * R.r(0.12, 0.3)), R.r(20, 26), 0, 0.5); }
    const blades = [];
    const nb = R.i(8, 11);
    for (let k = 0; k < nb; k++) {
      const a = -Math.PI / 2 + R.r(-0.55, 0.65);
      blades.push({ base: V(bx + R.r(-25, 25), by), ang: a, len: R.r(170, 380), wm: R.r(2.6, 4), droop: (a > -Math.PI / 2 ? 1 : -1) * R.r(0.5, 1.4), back: k < nb * 0.4, dry: R.chance(0.4) });
    }
    const stems = [];
    const ns = R.i(3, 5);
    for (let k = 0; k < ns; k++) {
      const a = -Math.PI / 2 + R.r(0.08, 0.5) + lean;
      const len = R.r(420, 600);
      const b = V(bx + R.r(-15, 20), by);
      const p1 = polar(b, a, len * 0.55), p2 = polar(p1, a + R.r(0.05, 0.15), len * 0.3), p3 = polar(p2, a + R.r(0.5, 1.0), len * 0.18);
      stems.push({ path: spline([b, p1, p2, p3], 3), tone: R.r(0.55, 0.75) });
    }
    c.phase(withMoon ? 3 : 2);
    for (const b of blades) if (b.back) blade(c, b.base, b.ang, b.len, b.wm, { tone: R.r(0.2, 0.3), droop: b.droop, load: 0.7, wet: 0.4, tail: b.dry ? 'dry' : 'taper', part: 'blade' });
    blades.filter(b => !b.back).forEach((b, k, fr) => {
      c.phase(withMoon || k >= fr.length / 2 ? 4 : 3);
      blade(c, b.base, b.ang, b.len, b.wm, { tone: R.r(0.6, 0.9), droop: b.droop, load: b.dry ? 0.5 : 0.75, wet: 0.4, tail: b.dry ? 'dry' : 'taper', part: 'blade' });
    });
    c.phase(5);
    for (const st of stems) c.stroke(wid(st.path, prof.taper(1.8, 1.0)), { tone: st.tone, load: 0.7, wet: 0.35, head: 0, tail: 'taper', part: 'stem' });
    stems.forEach((st, k) => {
      c.phase(k < Math.ceil(stems.length / 2) ? 6 : 7);
      const n = R.i(10, 14);
      for (let j = 0; j < n; j++) {
        const f = R.r(0.72, 0.99);
        const at = along(st.path, f);
        const a = withMoon ? at.a + R.r(0.25, 1.1) * (j % 2 ? 1 : 0.6) : R.r(-0.2, 0.35);
        leafStroke(c, at.p, a, R.r(26, 62) * (0.6 + 0.5 * f) * (withMoon ? 1 : 1.15), R.r(1.7, 2.8), { tone: R.r(0.35, 0.55), load: 0.38, wet: 0.3, peak: 0.25, w0: 0.6, bend: R.r(0.1, 0.45), tail: 'dry', part: 'plume' });
      }
    });
    c.phase(8);
    if (finish === 'blade') {
      blade(c, V(bx + R.r(-10, 10), by), -Math.PI / 2 + R.r(0.35, 0.6), R.r(420, 520), R.r(3.6, 4.6), { tone: 0.92, droop: R.r(0.9, 1.5), load: 0.6, wet: 0.4, tail: 'dry', part: 'blade' });
    } else if (finish === 'dragonfly') {
      // it hovers in the open air beside the plumes, never lost among them
      let q = null;
      for (let t = 0; t < 30 && !q; t++) {
        const cand = V(R.r(W * 0.3, W * 0.8), R.r(H * 0.15, H * 0.45));
        const clear = stems.every(st => st.path.every(p => mhypot(p.x - cand.x, p.y - cand.y) > 90)) && (!withMoon || mhypot(cand.x - mx, cand.y - my) > mr + 50);
        if (clear) q = cand;
      }
      dragonflyBug(c, q || V(W * 0.7, H * 0.2), R.r(84, 98), Math.PI + R.r(-0.35, 0.35) + (R.chance(0.5) ? 0 : Math.PI), 0.9, false);
    } else {
      // three or four geese, drawn as geese, crossing the sky above the grass
      const g = withMoon ? V(clamp(mx + R.r(-0.6, 0.3) * mr, 140, W - 80), clamp(my + mr * R.r(-0.2, 0.4), 60, H * 0.45)) : V(W * R.r(0.55, 0.72), H * R.r(0.16, 0.3));
      const hdg = -R.r(0.15, 0.35), n = R.i(3, 4);
      for (let k = 0; k < n; k++) gooseBird(c, polar(g, hdg + Math.PI + (k % 2 ? 0.35 : -0.35), Math.ceil(k / 2) * R.r(62, 78)), R.r(52, 62) * (1 - 0.08 * k), hdg + R.r(-0.08, 0.08), R.pick(['up', 'down', 'mid']), 0.85 - 0.06 * k);
    }
    const m = theMoon(c);
    const cap = !withMoon ? (finish === 'dragonfly' ? 'Dragonfly on the pampas grass' : finish === 'geese' ? 'Pampas grass, geese passing' : 'Pampas grass in the wind')
      : finish === 'dragonfly' ? 'Dragonfly and ' + m : finish === 'geese' ? 'Geese passing ' + m : 'Pampas grass and ' + m;
    return { caption: cap, sealSide: 1 };
  }

  /* ---- a dragonfly: Qi Baishi's exact small creature ---- */
  function dragonflyBug(c, p, span, h, tone, perched) {
    const f = (a, b) => polar(polar(p, h, a * span), h + Math.PI / 2, b * span);   // a along the body, b across
    for (const [a0, side, len, back] of [[0.02, 1, 0.52, -0.05], [0.02, -1, 0.52, -0.05], [-0.05, 1, 0.46, -0.16], [-0.05, -1, 0.46, -0.16]]) {
      const root = f(a0, 0), wa = h + side * Math.PI / 2 + back * side;
      leafStroke(c, root, wa, span * len, span * 0.075, { tone: 0.15, load: 0.9, wet: 0.7, peak: 0.55, w0: 0.5, bend: -side * 0.1, part: 'wing' });
      const tp = polar(root, wa, span * len * 0.88);
      c.dab(tp.x, tp.y, { size: span * 0.035, shape: 'dot', tone: 0.9, load: 1, wet: 0.2, part: 'wing' });
    }
    c.stroke(wid(resample([f(0.1, 0), f(-0.08, 0)], 1.5), prof.taper(span * 0.05, span * 0.045)), { tone, load: 1, wet: 0.4, head: 0.2, tail: 'blunt', part: 'body' });
    c.stroke(wid(resample([f(-0.06, 0), f(-0.72, 0.02)], 1.5), prof.taper(span * 0.03, span * 0.018)), { tone, load: 0.95, wet: 0.35, head: 0.1, tail: 'blunt', part: 'body' });
    for (const sd of [1, -1]) { const e = f(0.14, sd * 0.035); c.dab(e.x, e.y, { size: span * 0.06, shape: 'dot', tone: 1, load: 1, wet: 0.3, part: 'eye' }); }
    if (perched) for (const sd of [1, -1]) c.stroke(wid(resample([f(0.02, sd * 0.03), f(0.08, sd * 0.1), f(0.14, sd * 0.12)], 1), prof.even(0.6)), { tone: 0.8, load: 1, wet: 0.2, head: 0, tail: 'taper', part: 'leg' });
  }

  /* ---- persimmons: Mu Qi's tones, on the branch or in a row ---- */
  function fruit(c, ctr, r, tone, outline) {
    const R = c.R;
    if (outline) {
      const pts = [];
      const a0 = -Math.PI / 2 - 0.4, sweep = TAU * R.r(0.9, 0.96);
      for (let k = 0; k <= 72; k++) {
        const a = a0 + sweep * k / 72, rr = r * (1 + 0.025 * msin(a * 3 + 1));
        pts.push(V(ctr.x + mcos(a) * rr * 1.07, ctr.y + msin(a) * rr * 0.95));
      }
      c.stroke(wid(resample(pts, 2.5), prof.press(R.r(2.4, 3.2), 0.7, 0.5)), { tone, load: 0.62, wet: 0.4, head: 0.5, tail: 'dry', part: 'fruit' });
    } else {
      const poly = [], ph = R.r(0, 6);
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * TAU, top = Math.max(0, -msin(a));
        const rr = r * (1 + 0.02 * msin(a * 3 + ph)) * (1 - 0.07 * mpow(top, 6));
        poly.push(V(ctr.x + mcos(a) * rr * 1.07, ctr.y + msin(a) * rr * 0.95));
      }
      if (tone >= 0.72) { const a = R.r(-0.4, 0.4) + (R.chance(0.5) ? 0 : Math.PI); c.dab(ctr.x, ctr.y, { size: r * 2.1, angle: a, shape: 'round', tone, load: 0.95, wet: 0.6, hairs: 7, part: 'fruit' }); }
      else c.wash(poly, { tone: Math.min(tone, 0.56), soft: 1.4, bloom: 0.22, grain: 0.03, part: 'fruit' });
    }
  }
  function calyx(c, ctr, r, tilt) {
    const R = c.R;
    const top = V(ctr.x, ctr.y - r * 0.9);
    for (const [a, l] of [[Math.PI + 0.25 + tilt, 0.5], [-0.25 + tilt, 0.5], [Math.PI / 2 + 0.15 + tilt, 0.34], [-Math.PI / 2 - 0.4 + tilt, 0.26]])
      leafStroke(c, top, a, r * l * R.r(0.9, 1.1), Math.max(2.4, r * 0.13), { tone: 0.95, load: 0.9, wet: 0.35, peak: 0.45, w0: 0.6, bend: R.r(-0.2, 0.2), part: 'calyx' });
    return top;
  }
  function perLeaf(c, base, ang, len, tone) { return leafTwo(c, base, ang, len, len * c.R.r(0.27, 0.32), tone); }
  // the stalk end of a leaf, struck dark where it joins
  function perVein(c, l) {
    const e = polar(l.base, l.ang, Math.min(12, l.len * 0.2));
    c.stroke(wid(resample([polar(l.base, l.ang + Math.PI, 4), e], 1.5), prof.taper(1.8, 1.0)), { tone: 0.9, load: 0.9, wet: 0.5, head: 0.1, tail: 'taper', part: 'stalk' });
  }
  function persimmons(c) {
    const R = c.R;
    // The row of fruit (Mu Qi's own layout) read as balls on a table at phone size: every fruit the
    // same size and the same star of a calyx, one ring among them. Every day hangs its fruit from the
    // limb now. The draw stays, so the days that always hung paint exactly as they did.
    R.weighted([['hang', 6], ['row', 4]]);
    const layout = 'hang';
    if (layout === 'row') {
      const n = R.i(4, 6);
      const r = R.r(40, 48);
      const y0 = H * R.r(0.48, 0.56);
      const fr = [];
      // a loose row, each touching its neighbour at most
      let x = W / 2 - (n - 1) * r * 1.05 + R.r(-15, 15);
      const back = n > 4 ? 4 : n - 1;
      for (let k = 0; k < back; k++) { const rk = r * R.r(0.92, 1.06); fr.push({ ctr: V(x, y0 + R.r(-8, 8)), r: rk }); x += rk * 2.2 + R.r(4, 14); }
      // the front ones sit in the hollows of the back row; each tries every hollow before giving up
      for (let k = back; k < n; k++) {
        const rk = r * R.r(0.95, 1.1);
        for (const i of R.shuffle([...Array(back - 1).keys()])) {
          const a = fr[i], b = fr[i + 1];
          const cx = (a.ctr.x + b.ctr.x) / 2 + R.r(-10, 10);
          const cy = Math.max(a.ctr.y, b.ctr.y) + Math.sqrt(Math.max(0, mpow(rk + Math.max(a.r, b.r) + 4, 2) - mpow((b.ctr.x - a.ctr.x) / 2, 2)));
          if (fr.some(f => mhypot(f.ctr.x - cx, f.ctr.y - cy) < f.r + rk + 3)) continue;
          fr.push({ ctr: V(cx, cy), r: rk });
          break;
        }
      }
      const span = Math.max(...fr.map(f => f.ctr.x)) - Math.min(...fr.map(f => f.ctr.x));
      const dx = W / 2 - (Math.min(...fr.map(f => f.ctr.x)) + span / 2) + R.r(-20, 20);
      fr.forEach(f => { f.ctr.x += dx; });
      const tones = R.shuffle([0.95, 0.6, 0.34, 0.76, 0.22, 0.48]);
      fr.forEach((f, k) => { f.tone = tones[k]; });
      fr.sort((a, b) => a.tone - b.tone);
      fr[0].outline = true; fr[0].tone = R.r(0.72, 0.85);
      // palest first: one fruit a round, the darkest with every calyx at 5
      fr.forEach((f, k) => { c.phase(k < fr.length - 1 ? Math.min(4, k + 1) : 5); fruit(c, f.ctr, f.r, f.tone, !!f.outline); });
      c.phase(5);
      const tops = fr.map(f => calyx(c, f.ctr, f.r, R.r(-0.15, 0.15)));
      c.phase(6);
      fr.forEach((f, k) => { const t = tops[k]; c.stroke(wid(resample([t, polar(t, -Math.PI / 2 + R.r(-0.4, 0.4), f.r * 0.24)], 1.5), prof.taper(f.r * 0.075, f.r * 0.055)), { tone: 1, load: 1, wet: 0.3, head: 0.3, tail: 'blunt', part: 'stem' }); });
      // a leaf still on one fruit's stem; 7: another; 8: their veins
      const withLeaf = R.shuffle(fr.filter(f => !f.outline)).slice(0, 2);
      const lv = [];
      withLeaf.forEach((f, k) => {
        c.phase(6 + Math.min(k, 1));
        const t = V(f.ctr.x, f.ctr.y - f.r * 0.95);
        const side = f.ctr.x < W / 2 ? -1 : 1;
        lv.push(perLeaf(c, t, -Math.PI / 2 + side * R.r(0.7, 1.2), R.r(58, 74), R.r(0.45, 0.7)));
      });
      lv.forEach(l => perVein(c, l));
      // 8: a leaf fallen in front of them
      c.phase(8);
      const lowF = fr.reduce((a, b) => (a.ctr.y > b.ctr.y ? a : b));
      const fl = V(clamp(lowF.ctr.x + R.r(-120, 120), 80, W - 140), lowF.ctr.y + lowF.r + R.r(40, 80));
      perVein(c, perLeaf(c, fl, R.r(-0.4, 0.4) + (R.chance(0.5) ? 0 : Math.PI), R.r(56, 66), R.r(0.4, 0.58)));
      return { caption: (['', '', '', 'Three', 'Four', 'Five', 'Six'][fr.length]) + ' persimmons', sealSide: -1 };
    }
    // on the branch: an old fruit-tree limb, angular, the fruit hanging close under it; in winter
    // the leaves are gone and the last fruit hang in the snow
    const winter = c.season === 'winter';
    const ctrl = walk(R, V(-14, R.r(90, 190)), R.r(0.22, 0.5), R.r(380, 450), 3, 0.42, 0.03);
    const path = spline(ctrl, 3);
    const nearBranch = (q, rad) => path.some(b => mhypot(b.x - q.x, b.y - q.y) < rad);
    const nf = R.i(2, 3);
    const hangs = [];
    for (const f of R.shuffle([0.34, 0.56, 0.8]).slice(0, nf).sort()) {
      const at = along(path, f);
      const r = R.r(42, 52);
      let ctr = V(at.p.x + R.r(-6, 6), at.p.y + R.r(4, 12) + r * 0.95);
      for (let k = 0; k < 30 && (nearBranch(ctr, r + 10) || hangs.some(o => mhypot(o.ctr.x - ctr.x, o.ctr.y - ctr.y) < o.r + r + 6)); k++) ctr = V(ctr.x, ctr.y + 6);
      hangs.push({ at: at.p, ctr, r });
    }
    const tones = R.shuffle([0.9, 0.55, 0.34]).slice(0, nf);
    // leaves along the limb, alternating sides, kept off the fruit
    const leaves = [];
    const nl = winter ? 0 : R.i(3, 5);
    for (let k = 0; k < 40 && leaves.length < nl; k++) {
      const at = along(path, R.r(0.12, 0.97));
      const side = leaves.length % 2 ? 1 : -1;
      for (let t = 0; t < 6; t++) {
        const ang = at.a + side * R.r(0.5, 1.3) + (side > 0 ? 0.2 : -0.1);
        const len = R.r(62, 84);
        const mid = polar(at.p, ang, len * 0.55), tip = polar(at.p, ang, len);
        const hit = hangs.some(o => mhypot(o.ctr.x - mid.x, o.ctr.y - mid.y) < o.r + 14 || mhypot(o.ctr.x - tip.x, o.ctr.y - tip.y) < o.r + 6)
          || leaves.some(l => mhypot(polar(l.base, l.ang, l.len * 0.6).x - mid.x, polar(l.base, l.ang, l.len * 0.6).y - mid.y) < 26);
        if (!hit && tip.y > 0 && tip.x > 0 && tip.x < W) { leaves.push({ base: at.p, ang, len, tone: R.r(0.35, 0.9) }); break; }
      }
    }
    // 1-2: the limb, re-inked at its joint, and a twig (in winter the snowy sky first)
    if (winter) {
      c.phase(1);
      const wAt = f => lerp(12, 2.8, mpow(f, 0.85));
      snowSky(c, [snowLump(path, 0.05, 0.3, wAt, R.r(6, 9)), snowLump(path, 0.42, 0.62, wAt, R.r(5, 8))], R.i(26, 40), R.r(0.12, 0.15),
        hangs.map(hg => ({ x: hg.ctr.x, y: hg.ctr.y - hg.r * 0.72, r: hg.r * 0.34 })));
    }
    limb(c, path, R.r(11, 13.5), 2.8, [0.45], { tone: R.r(0.86, 0.92), load: 0.55, part: 'branch', phases: winter ? [2, 2] : [1, 1] });
    c.phase(2);
    const tw = along(path, R.r(0.5, 0.7));
    const twA = tw.a - R.r(0.5, 0.9);
    const tm = polar(tw.p, twA, R.r(34, 46));
    c.stroke(wid(spline([tw.p, tm, polar(tm, twA + R.r(-0.4, 0.3), R.r(26, 40))], 3), prof.taper(3.6, 1.2)), { tone: 0.86, load: 0.55, wet: 0.3, head: 0.3, tail: 'dry', part: 'twig' });
    if (winter) {
      // 3: bare twigs; 4: stems and the paler fruit; 5: the dark fruit; 6: calyces; 7: spurs on
      // the limb; 8: a drop of melt under the lowest fruit and one fallen in the snow
      c.phase(3);
      for (let k = 0; k < 2; k++) { const at = along(path, R.r(0.2, 0.9)); const a = at.a - R.r(0.5, 1.1); const m = polar(at.p, a, R.r(30, 45)); c.stroke(wid(spline([at.p, m, polar(m, a + R.r(-0.4, 0.4), R.r(25, 40))], 3), prof.taper(3, 0.9)), { tone: 0.86, load: 0.5, wet: 0.3, head: 0.3, tail: 'dry', part: 'twig' }); }
      c.phase(4);
      for (const hg of hangs) { const e = V(hg.ctr.x, hg.ctr.y - hg.r * 0.85); c.stroke(wid(qbez(hg.at, polar(mix(hg.at, e, 0.5), angOf(hg.at, e) + Math.PI / 2, 3), e, 1.5), prof.taper(3.6, 2.8)), { tone: 0.92, load: 0.9, wet: 0.3, head: 0.3, tail: 'blunt', part: 'stem' }); }
      hangs.forEach((hg, k) => { if (tones[k] < 0.7 || k === 0) fruit(c, hg.ctr, hg.r, tones[k], false); });
      c.phase(5);
      hangs.forEach((hg, k) => { if (tones[k] >= 0.7 && k > 0) fruit(c, hg.ctr, hg.r, tones[k], false); });
      c.phase(6);
      hangs.forEach(hg => calyx(c, hg.ctr, hg.r, R.r(-0.12, 0.12)));
      c.phase(7);
      for (let k = 0; k < 3; k++) { const at = along(path, R.r(0.2, 0.9)); const a = at.a - Math.PI / 2 + R.r(-0.5, 0.5); const m = polar(at.p, a, R.r(22, 32)); c.stroke(wid(spline([at.p, m, polar(m, a + R.r(-0.5, 0.5), R.r(16, 26))], 2), prof.taper(2.6, 0.7)), { tone: 0.9, load: 0.55, wet: 0.3, head: 0.2, tail: 'dry', part: 'spur' }); }
      c.phase(8);
      // a sparrow comes for the last fruit, perched on the limb clear of them
      let best = null, bd = -1;
      for (let f = 0.15; f <= 0.9; f += 0.05) { const q = along(path, f).p; if (q.x < 60 || q.x > W - 60 || q.y < 60) continue; const d = Math.min(...hangs.map(hg => mhypot(hg.ctr.x - q.x, hg.ctr.y - q.y) - hg.r)); if (d > bd) { bd = d; best = q; } }
      const q = best || along(path, 0.2).p;
      const face = hangs.reduce((a, b) => (Math.abs(a.ctr.x - q.x) < Math.abs(b.ctr.x - q.x) ? a : b)).ctr.x < q.x ? -1 : 1;
      sparrow(c, V(q.x, q.y - 16), R.r(1.3, 1.5), face);
      return { caption: 'A sparrow and the last persimmons', sealSide: -1 };
    }
    // 3: the palest leaf, behind; the others in 6 and 7
    leaves.sort((a, b) => a.tone - b.tone);
    if (leaves.length) leaves[0].tone = Math.min(leaves[0].tone, 0.5);
    const back = leaves.slice(0, 1), front = leaves.slice(1);
    c.phase(3);
    const lv = back.map(l => perLeaf(c, l.base, l.ang, l.len, l.tone));
    // 4: stems and the paler fruit; 5: the dark fruit and every calyx
    c.phase(4);
    for (const hg of hangs) { const e = V(hg.ctr.x, hg.ctr.y - hg.r * 0.85); c.stroke(wid(qbez(hg.at, polar(mix(hg.at, e, 0.5), angOf(hg.at, e) + Math.PI / 2, 3), e, 1.5), prof.taper(3.6, 2.8)), { tone: 0.92, load: 0.9, wet: 0.3, head: 0.3, tail: 'blunt', part: 'stem' }); }
    hangs.forEach((hg, k) => { if (tones[k] < 0.7) fruit(c, hg.ctr, hg.r, tones[k], false); });
    c.phase(5);
    hangs.forEach((hg, k) => { if (tones[k] >= 0.7) fruit(c, hg.ctr, hg.r, tones[k], false); });
    hangs.forEach(hg => calyx(c, hg.ctr, hg.r, R.r(-0.12, 0.12)));
    // 6: the dark leaves in front; 7: veins in the pale ones; 8: one leaf falling
    front.forEach((l, k) => { c.phase(k < Math.ceil(front.length / 2) ? 6 : 7); lv.push(perLeaf(c, l.base, l.ang, l.len, l.tone)); });
    c.phase(7);
    lv.filter(l => l.tone < 0.75).forEach(l => perVein(c, l));
    const lowest = hangs.reduce((a, b) => (a.ctr.y > b.ctr.y ? a : b));
    const fp = V(clamp(lowest.ctr.x + R.r(40, 120), 80, W - 80), clamp(lowest.ctr.y + R.r(130, 210), 360, H - 150));
    c.phase(8);
    perVein(c, perLeaf(c, fp, R.r(0, TAU), R.r(54, 64), R.r(0.4, 0.58)));
    return { caption: (['', '', 'Two', 'Three'][nf]) + ' persimmons on a branch', sealSide: -1 };
  }

  /* ---- mountains in mist, a small boat ---- */
  function mountains(c) {
    const R = c.R, season = c.season;
    const air = season === 'winter' ? 'snow' : season === 'spring' ? sky(c, [['rain', 3], ['mist', 3], ['moon', 1]]) : season === 'summer' ? sky(c, [['moon', 2], ['clear', 3], ['mist', 2]]) : sky(c, [['mist', 5], ['moon', 1], ['geese', 2]]);
    // 1: the far range, palest and highest
    c.phase(1);
    const farBase = H * R.r(0.5, 0.56), farPeak = H * R.r(0.14, 0.24);
    const farTop = air === 'snow' ? ridge(c, -40, W + 40, farBase, farPeak, R.i(2, 3), R.r(0.12, 0.17))
      : ridge(c, W * R.r(-0.1, 0.05), W * R.r(0.95, 1.1), farBase, farPeak, R.i(2, 3), R.r(0.12, 0.17));
    if (air === 'snow') c.wash([V(-30, -30), V(W + 30, -30)].concat(farTop.slice().reverse().map(q => V(q.x, q.y - 3))), { tone: R.r(0.11, 0.14), soft: 2, bloom: 0.15, grain: 0.08, fade: { x0: 0, y0: farPeak, x1: 0, y1: farBase, to: 0 }, part: 'sky' });
    ridgeTexture(c, farTop, air === 'snow' ? 0.3 : 0.26, 2.4, R.i(3, 5));
    if (air === 'moon') moon(c, W * R.r(0.68, 0.8), H * R.r(0.1, 0.15), R.r(38, 50), false);
    // 2: the middle hill, on the near side
    c.phase(2);
    const midTop = ridge(c, -30, W * R.r(0.52, 0.64), H * R.r(0.72, 0.76), H * R.r(0.42, 0.5), R.i(1, 2), R.r(0.2, 0.28), 2, 2.2);
    ridgeTexture(c, midTop, 0.45, 2.8, R.i(2, 3));
    // 3: the near shore, a low bank at the lower left whose face dissolves downward
    c.phase(3);
    const ky = H * R.r(0.64, 0.7), kx = W * R.r(0.1, 0.2);
    const px = W * R.r(0.34, 0.44), py = H * R.r(0.78, 0.82);
    const rockS = spline([V(-30, ky + R.r(10, 30)), V(kx * 0.5, ky + R.r(0, 10)), V(kx, ky), V(lerp(kx, px, 0.5), lerp(ky, py, 0.45) - R.r(0, 12)), V(px, py)], 4);
    c.wash(rockS.concat([V(px - R.r(40, 80), H + 30), V(-30, H + 30)]), { tone: R.r(0.16, 0.22), soft: 1.5, bloom: 0.35, grain: 0.1, fade: { x0: 0, y0: ky + 10, x1: 0, y1: ky + R.r(110, 160), to: 0 }, part: 'rock' });
    // 4: texture: dry strokes on the ridges and the rock's edge, and the water line
    c.phase(4);
    const cun = (line, tone, w) => {
      const pts = line.filter((_, k) => k % 2 === 0);
      for (let k = 0; k + 3 < pts.length; k += R.i(3, 6)) {
        const seg = pts.slice(k, k + R.i(3, 5));
        if (seg.length > 1) c.stroke(wid(resample(seg, 3), prof.leaf(w, 0.3, 0.8)), { tone, load: 0.4, wet: 0.25, head: 0.2, tail: 'dry', part: 'cun' });
      }
    };
    cun(midTop.slice(Math.floor(midTop.length * 0.1), Math.floor(midTop.length * 0.75)), 0.5, 2.6);
    { const pts = rockS.filter((_, k) => k % 2 === 0); for (let k = 0; k + 4 < pts.length; k += R.i(6, 9)) c.stroke(wid(resample(pts.slice(k, k + R.i(7, 10)), 3), prof.leaf(3.4, 0.3, 0.8)), { tone: 0.88, load: 0.4, wet: 0.3, head: 0.3, tail: 'dry', part: 'cun' }); }
    for (let k = 0; k < R.i(3, 4); k++) { const p = along(rockS, R.r(0.15, 0.8)).p; c.stroke(wid(spline([V(p.x, p.y + 6), V(p.x + R.r(-10, 10), p.y + R.r(25, 40)), V(p.x + R.r(-20, 20), p.y + R.r(50, 80))], 3), prof.leaf(2.4, 0.3, 0.8)), { tone: 0.6, load: 0.35, wet: 0.25, head: 0.2, tail: 'dry', part: 'cun' }); }
    const wy = py + R.r(12, 30);
    for (let k = 0; k < 3; k++) { const x = px + R.r(30, 170), y = wy + k * R.r(14, 24); c.stroke(wid(resample([V(x, y), V(x + R.r(50, 130), y + R.r(-2, 2))], 3), prof.leaf(1.2, 0.3, 0.8)), { tone: 0.3, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' }); }
    // 5: trees on the near shore; 6: their foliage and the moss dots
    const trees = [];
    for (let k = 0; k < R.i(2, 3); k++) { const at = along(rockS, R.r(0.28, 0.55)); trees.push({ b: V(at.p.x, at.p.y + 4), h: R.r(55, 105), lean: R.r(-0.2, 0.2), pine: R.chance(0.5) }); }
    c.phase(5);
    for (const t of trees) { t.top = V(t.b.x + t.lean * t.h, t.b.y - t.h); c.stroke(wid(spline([t.b, V(lerp(t.b.x, t.top.x, 0.5) + R.r(-6, 6), lerp(t.b.y, t.top.y, 0.5)), t.top], 2), prof.taper(3, 1.0)), { tone: 0.9, load: 0.6, wet: 0.3, head: 0, tail: 'dry', part: 'tree' }); }
    c.phase(6);
    for (const t of trees) {
      if (t.pine) for (let j = 0; j < 4; j++) { const y = lerp(t.top.y, t.b.y - t.h * 0.3, j / 3), x = lerp(t.top.x, t.b.x, (y - t.top.y) / (t.b.y - t.top.y)), hw = 10 + j * 7; c.stroke(wid(resample([V(x - hw, y + 3), V(x + hw, y - 2)], 2), prof.leaf(3.4, 0.4, 0.6)), { tone: 0.88, load: 0.42, wet: 0.35, head: 0.2, tail: 'dry', part: 'needles' }); }
      else { const pts = []; for (let j = 0; j < 12; j++) pts.push(V(t.top.x + R.g() * 11, t.top.y + Math.abs(R.g()) * 20 - 4)); dots(c, pts, 6.5, 0.85, 'leaves'); }
    }
    const moss = [];
    for (let k = 0; k < R.i(4, 6); k++) { const src = R.chance(0.4) ? midTop : rockS; const at = along(src, R.r(0.15, 0.7)); moss.push(V(at.p.x + R.r(-4, 4), at.p.y + R.r(-1, 5))); }
    dots(c, moss, 4.4, 0.95, 'moss');
    // 7: the boat; 8: the boatman's pole, a ripple, and the last of the weather
    c.phase(7);
    const bx = W * R.r(0.58, 0.76), by = H * R.r(0.8, 0.87), bl = R.r(48, 64);
    c.stroke(wid(spline([V(bx - bl / 2, by - 3), V(bx, by + 3), V(bx + bl / 2, by - 6)], 2), t => 1 + 3.3 * msin(Math.PI * clamp(t * 1.05, 0, 1))), { tone: 0.92, load: 0.9, wet: 0.35, head: 0.2, tail: 'taper', part: 'boat' });
    c.stroke(wid(resample([V(bx - bl * 0.3, by + 9), V(bx + bl * 0.45, by + 8)], 2), prof.leaf(1.2, 0.4, 0.6)), { tone: 0.32, load: 0.5, wet: 0.3, head: 0, tail: 'dry', part: 'ripple' });
    c.phase(8);
    const fig = V(bx - bl * 0.12, by - 10);
    c.dab(fig.x, fig.y, { size: 10, shape: 'round', tone: 0.9, part: 'boatman' });
    c.dab(fig.x - 9, fig.y - 7, { size: 18, angle: 0, shape: 'leaf', tone: 0.95, part: 'hat' });
    c.stroke(wid(resample([V(fig.x + 3, fig.y - 12), V(fig.x + 34, by + 22)], 2), prof.even(0.85)), { tone: 0.85, load: 0.9, wet: 0.2, head: 0, tail: 'taper', part: 'pole' });
    if (air === 'rain') rain(c, R.i(28, 38), Math.PI / 2 + R.r(0.1, 0.25), 0.22);
    else if (air === 'geese' || R.chance(0.4)) { const g = V(W * R.r(0.55, 0.75), H * R.r(0.2, 0.3)); for (let k = 0; k < R.i(3, 5); k++) farBird(c, V(g.x - k * R.r(18, 26), g.y + k * R.r(8, 14) + R.r(-4, 4)), R.r(12, 17), -0.2, 0.55); }
    const cap = air === 'snow' ? 'Snow on the mountains' : air === 'rain' ? 'Rain over the mountains' : air === 'moon' ? 'Mountains under ' + theMoon(c) : 'Mountains in the mist';
    return { caption: cap, sealSide: 1 };
  }

  /* ---- bamboo ---- */
  function bamboo(c) {
    const R = c.R;
    const weather = c.season === 'winter' ? sky(c, [['snow', 7], ['wind', 2], ['moon', 1], ['calm', 1]]) : sky(c, [['wind', 5], ['rain', 2], ['moon', 1], ['calm', 2]]);
    const hang = weather === 'rain';
    const windA = hang ? Math.PI / 2 - R.r(0.15, 0.45) : weather === 'calm' || weather === 'moon' ? R.r(0.5, 0.95) : R.r(0.12, 0.42);
    const makeStalk = (x, lean, top, w) => {
      const base = V(x, H + 24), tp = V(x + lean * (H + 24 - top), top);
      const path = spline([base, V(lerp(base.x, tp.x, 0.5) + R.r(-8, 8), lerp(base.y, tp.y, 0.5)), tp], 3);
      const cuts = [0];
      let f = 0;
      for (;;) { f += R.r(0.12, 0.16) * (f < 0.2 ? 0.75 : 1); if (f > 0.96) break; cuts.push(f); }
      cuts.push(1);
      return { path, L: pathLen(path), cuts, w };
    };
    const segs = (st, from, to) => {
      for (let k = from; k < Math.min(to, st.cuts.length - 1); k++) {
        const g = 2.5 / st.L;
        c.stroke(wid(slice(st.path, st.cuts[k] + (k ? g : 0), st.cuts[k + 1] - g), prof.knuckle(st.w)), { tone: st.tone, load: 0.6, wet: 0.45, head: 0.5, tail: 'blunt', part: 'stalk' });
      }
    };
    const nodes = st => {
      for (let k = 1; k < st.cuts.length - 1; k++) {
        const at = along(st.path, st.cuts[k]), n = at.a + Math.PI / 2;
        const a = polar(at.p, n, st.w * 1.2), b = polar(at.p, n, -st.w * 1.2);
        c.stroke(wid(qbez(a, polar(at.p, at.a, -st.w * 0.35), b, 1.5), prof.taper(1.6, 1.0)), { tone: Math.min(1, st.tone + 0.15), load: 1, wet: 0.3, head: 0.3, tail: 'blunt', part: 'node' });
      }
    };
    const x0 = R.r(110, 220), lean = R.r(0.03, 0.14);
    const main = makeStalk(x0, lean, R.r(-30, 80), R.r(8.5, 11)); main.tone = R.r(0.8, 0.9);
    const second = R.chance(0.65) ? makeStalk(x0 + R.r(50, 110), lean * R.r(0.3, 0.8), R.r(40, 200), R.r(5.5, 7)) : null;
    if (second) second.tone = R.r(0.5, 0.65);
    const far = makeStalk(R.r(W * 0.55, W * 0.8), R.r(-0.05, 0.06), R.r(80, 260), R.r(5, 6.5)); far.tone = R.r(0.15, 0.22);
    const clusters = [], twigs = [];
    const nodeIdx = R.shuffle([...Array(Math.max(1, main.cuts.length - 2)).keys()].map(k => k + 1).filter(k => main.cuts[k] > 0.3)).slice(0, R.i(3, 4)).sort((a, b) => a - b);
    for (const k of nodeIdx) {
      const at = along(main.path, main.cuts[k]);
      const a = at.a + (R.chance(0.7) ? 1 : -1) * R.r(0.45, 0.85);
      const len = R.r(50, 110);
      const m = polar(at.p, a, len * 0.5);
      const tw = spline([at.p, m, polar(m, a + R.r(-0.2, 0.2), len * 0.5)], 3);
      twigs.push(tw);
      clusters.push({ at: tw[tw.length - 1], n: R.i(3, 5), near: true });
      if (R.chance(0.5)) clusters.push({ at: along(tw, R.r(0.4, 0.6)).p, n: R.i(2, 3), near: true });
    }
    const top = main.path[main.path.length - 1];
    if (top.y > 0) clusters.push({ at: top, n: R.i(3, 4), near: true });
    const farCl = [];
    for (let k = 0; k < R.i(1, 2); k++) farCl.push({ at: along(far.path, R.r(0.55, 0.85)).p, n: R.i(3, 5), near: false });
    const leafCluster = (cl, tone) => {
      for (let j = 0; j < cl.n; j++) {
        const a = windA + (j - (cl.n - 1) / 2) * R.r(0.22, 0.4) + R.r(-0.1, 0.1);
        const L = R.r(70, 125) * (j === Math.floor(cl.n / 2) ? 1.12 : 1) * (cl.near ? 1 : 0.8);
        leafStroke(c, cl.at, a, L, L * R.r(0.068, 0.082), { tone: tone * R.r(0.9, 1.06), load: 0.8, wet: 0.45, peak: 0.3, w0: 0.25, bend: (mcos(a) > 0 ? 1 : -1) * R.r(0.05, 0.25) * (hang ? 0.3 : 1), part: 'leaf' });
      }
    };
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.58, 0.74), H * R.r(0.18, 0.28), R.r(70, 95), R.chance(0.3));
    if (weather === 'snow') snowSky(c, [], R.i(34, 50), R.r(0.12, 0.15));
    segs(far, 0, 99);
    c.phase(2);
    const mid = Math.ceil(main.cuts.length / 2);
    segs(main, 0, mid);
    c.phase(3);
    segs(main, mid, 99);
    if (second) segs(second, 0, 99);
    c.phase(4);
    nodes(main); if (second) nodes(second);
    for (const tw of twigs) c.stroke(wid(tw, prof.taper(1.9, 0.8)), { tone: main.tone, load: 0.7, wet: 0.3, head: 0.3, tail: 'taper', part: 'twig' });
    const nearCl = clusters.filter(q => q.near);
    nearCl.forEach((cl, k) => { c.phase(k < Math.ceil(nearCl.length / 2) ? 5 : 6); leafCluster(cl, R.r(0.85, 1)); });
    c.phase(7);
    for (const cl of farCl) leafCluster(cl, R.r(0.18, 0.28));
    if (second) leafCluster({ at: along(second.path, R.r(0.6, 0.85)).p, n: R.i(2, 4), near: true }, R.r(0.5, 0.62));
    c.phase(8);
    if (weather === 'rain') rain(c, R.i(28, 38), Math.PI / 2 + R.r(0.1, 0.3), 0.26);
    else {
      const perches = twigs.map(tw => along(tw, R.r(0.2, 0.4)).p).filter(q => q.y > 90 && q.y < H - 120 && q.x > 50 && q.x < W - 50 && clusters.every(cl => mhypot(cl.at.x - q.x, cl.at.y - q.y) > 75));
      if (perches.length && R.chance(0.45)) { const q = perches[R.i(0, perches.length - 1)]; sparrow(c, V(q.x, q.y - 15), R.r(1.3, 1.5), R.chance(0.5) ? -1 : 1); }
      else {
        let best = null, bd = -1;
        for (let f = 0.2; f <= 0.7; f += 0.05) {
          const at = along(main.path, f);
          for (const sd of [1, -1]) {
            const e = polar(at.p, at.a + sd * 0.7, 70);
            if (e.y < 60 || e.x < 40 || e.x > W - 40) continue;
            const d = Math.min(...clusters.map(cl => mhypot(cl.at.x - e.x, cl.at.y - e.y)));
            if (d > bd) { bd = d; best = { p: at.p, e }; }
          }
        }
        if (best) { c.stroke(wid(qbez(best.p, polar(mix(best.p, best.e, 0.5), -Math.PI / 2, 8), best.e, 3), prof.taper(1.9, 0.8)), { tone: main.tone, load: 0.7, wet: 0.3, head: 0.3, tail: 'taper', part: 'twig' }); leafCluster({ at: best.e, n: R.i(4, 5), near: true }, 1); }
        else rain(c, R.i(24, 32), Math.PI / 2 + R.r(0.1, 0.3), 0.24);
      }
    }
    const cap = weather === 'rain' ? 'Bamboo in the rain' : weather === 'snow' ? 'Bamboo in the snow' : weather === 'moon' ? 'Bamboo under ' + theMoon(c) : weather === 'wind' ? 'Bamboo in the wind' : 'Bamboo';
    return { caption: cap, sealSide: 1 };
  }
  // a sparrow perched: a round body, a dark cap, a short tail
  function sparrow(c, p, k, face) {
    const f = (a, b) => V(p.x + face * a * k, p.y + b * k);
    c.stroke(wid(spline([f(-12, 2), f(-2, -2), f(8, 0)], 1.5), t => k * (7 + 5 * msin(Math.PI * t))), { tone: 0.45, load: 0.8, wet: 0.7, head: 0.4, tail: 'blunt', part: 'sparrow' });
    c.dab(f(9, -8).x, f(9, -8).y, { size: 14 * k, shape: 'round', tone: 0.55, load: 0.9, wet: 0.5, part: 'sparrow' });
    c.stroke(wid(spline([f(4, -12), f(10, -14), f(14, -10)], 1.2), prof.taper(3 * k, 1.5 * k)), { tone: 0.9, load: 0.9, wet: 0.3, head: 0.2, tail: 'taper', part: 'sparrow' });
    c.stroke(wid(spline([f(-4, -5), f(-10, -2), f(-17, 3)], 1.5), prof.taper(3.6 * k, 0.8 * k)), { tone: 0.85, load: 0.5, wet: 0.3, head: 0.2, tail: 'dry', part: 'sparrow' });
    c.stroke(wid(resample([f(-12, 2), f(-24, 9)], 1.5), prof.taper(2.6 * k, 1.2 * k)), { tone: 0.8, load: 0.5, wet: 0.3, head: 0.2, tail: 'dry', part: 'sparrow' });
    c.stroke(wid(resample([f(15, -8), f(19, -7)], 1), prof.taper(1.6 * k, 0.5 * k)), { tone: 1, load: 1, wet: 0.2, head: 0, tail: 'taper', part: 'sparrow' });
    c.dab(f(11.5, -9.5).x, f(11.5, -9.5).y, { size: 2.4 * k, shape: 'dot', tone: 1, part: 'sparrow' });
    for (const d of [-2, 3]) c.stroke(wid(resample([f(d, 6), f(d + 1, 13)], 1), prof.even(0.7 * k)), { tone: 0.8, load: 1, wet: 0.2, head: 0, tail: 'taper', part: 'sparrow' });
  }

  /* ---- snow: the sky washed grey round it, the snow itself bare paper ---- */
  // lumps lying along a branch's upper edge and flakes in the air are holes in one wash
  function snowLump(path, f0, f1, wAt, thick) {
    thick *= 1.6;                                        // snow has to read at the size a phone shows it
    const seg = slice(path, f0, f1), n = seg.length;
    if (n < 3) return null;
    const lo = [], hi = [];
    for (let i = 0; i < n; i++) {
      const a = angOf(seg[Math.max(0, i - 1)], seg[Math.min(n - 1, i + 1)]);
      let nx = msin(a), ny = -mcos(a);
      if (ny > 0) { nx = -nx; ny = -ny; }
      const t = i / (n - 1), w = wAt(f0 + (f1 - f0) * t), h = thick * mpow(msin(Math.PI * t), 0.55);
      lo.push(V(seg[i].x + nx * w * 0.3, seg[i].y + ny * w * 0.3));
      hi.push(V(seg[i].x + nx * (w + h), seg[i].y + ny * (w + h)));
    }
    const poly = lo.concat(hi.reverse());
    let cx = 0, cy = 0; for (const q of poly) { cx += q.x; cy += q.y; } cx /= poly.length; cy /= poly.length;
    let r = 0; for (const q of poly) r = Math.max(r, mhypot(q.x - cx, q.y - cy));
    return { poly, bound: { x: cx, y: cy, r } };
  }
  function snowSky(c, lumps, nFlakes, tone, spots) {
    const R = c.R;
    const rings = [[V(-30, -30), V(W + 30, -30), V(W + 30, H + 30), V(-30, H + 30)]];
    const holes = [];
    for (const sp of spots || []) if (!holes.some(h => mhypot(h.x - sp.x, h.y - sp.y) < h.r + sp.r + 1)) { rings.push(circle(sp.x, sp.y, sp.r, sp.r, 18)); holes.push(sp); }
    for (const l of lumps) if (l && !holes.some(h => mhypot(h.x - l.bound.x, h.y - l.bound.y) < h.r + l.bound.r)) { rings.push(l.poly); holes.push(l.bound); }
    let made = 0;
    for (let t = 0; t < nFlakes * 40 && made < nFlakes; t++) {
      const r = R.chance(0.2) ? R.r(6, 8.5) : R.r(3.2, 5.5), p = V(R.r(12, W - 12), R.r(12, H - 12));
      if (holes.some(h => mhypot(h.x - p.x, h.y - p.y) < h.r + r + 7)) continue;
      holes.push({ x: p.x, y: p.y, r });
      rings.push(circle(p.x, p.y, r, r * R.r(0.75, 1), 10, R.r(0, 3)));
      made++;
    }
    c.wash(rings, { tone, soft: 1.5, bloom: 0.12, grain: 0.06, fade: { x0: 0, y0: 0, x1: 0, y1: H, to: 0.5 }, part: 'snow' });
  }

  /* ---- plum: old wood in flying white, young shoots, the first flowers; sometimes snow ---- */
  function plumFlower(c, ctr, size, tone) {
    const R = c.R, rot = R.r(0, TAU);
    for (let k = 0; k < 5; k++) {
      const a = rot + k * TAU / 5 + R.r(-0.12, 0.12);
      const b = polar(ctr, a, size * 0.1);
      c.dab(b.x, b.y, { size: size * R.r(0.48, 0.56), angle: a, shape: 'petal', tone: tone * R.r(0.85, 1.12), load: 0.9, wet: 0.6, part: 'petal' });
    }
  }
  // a blossom in outline, the painters' circle method: five petals as small open rings, a faint
  // wash inside; cherry petals have the notch at the tip
  function blossom(c, ctr, size, o) {
    const R = c.R, rot = R.r(0, TAU), pr = size * 0.25;
    if (o.fill) c.wash(circle(ctr.x, ctr.y, size * 0.47, size * 0.47, 20), { tone: o.fill, soft: 2, bloom: 0.1, grain: 0.04, part: 'petalwash' });
    for (let k = 0; k < 5; k++) {
      const a = rot + k * TAU / 5 + R.r(-0.1, 0.1), pc = polar(ctr, a, size * 0.24);
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const b = a - Math.PI * 0.6 + Math.PI * 1.2 * i / 12;
        const rr = pr * (o.notch ? 1 - 0.22 * mexp(-mpow((b - a) / 0.16, 2)) : 1);
        pts.push(polar(pc, b, rr));
      }
      c.stroke(wid(pts, prof.leaf(o.w || 1.15, 0.5, 0.55)), { tone: o.tone * R.r(0.9, 1.08), load: 0.85, wet: 0.35, head: 0.1, tail: 'taper', part: 'petal' });
    }
  }
  function flowerHeart(c, ctr, size, n) {
    const R = c.R;
    for (let k = 0; k < (n || 5); k++) { const e = polar(ctr, R.r(0, TAU), size * R.r(0.08, 0.26)); c.dab(e.x, e.y, { size: R.r(2.2, 3), shape: 'dot', angle: R.r(0, TAU), tone: 0.95, part: 'stamen' }); }
  }
  function plum(c) {
    const R = c.R;
    const weather = c.season === 'winter' ? sky(c, [['snow', 8], ['moon', 2], ['clear', 2]]) : sky(c, [['moon', 2], ['clear', 3], ['snow', 1]]);
    // the old trunk crosses the sheet on the diagonal: a walk that ends hugging an edge is tried again
    let trunk = null;
    for (let k = 0; k < 8; k++) {
      trunk = walkIn(R, V(-20, R.r(640, 740)), R.r(-0.85, -0.6), R.r(460, 560), 4, 0.38, 0, 0.85);
      const tip = trunk[trunk.length - 1];
      if (tip.x > 150 && tip.x < W - 110 && tip.y > 90) break;
    }
    const tw0 = R.r(20, 26), twAt = f => lerp(tw0, 5, mpow(f, 0.85));
    const at1 = along(trunk, R.r(0.4, 0.6));
    const side = R.sign();
    const branch = walkIn(R, at1.p, at1.a + side * R.r(0.6, 1.0), R.r(180, 280), 3, 0.45, 0, 0.85);
    const bw0 = twAt(0.5) * 0.62, bwAt = f => lerp(bw0, 2.4, f);
    // young shoots: straight whips upward from the wood
    const shoots = [];
    for (let k = 0; k < R.i(4, 6); k++) {
      const src = R.chance(0.5) ? trunk : branch;
      const at = along(src, R.r(0.35, 0.98));
      const a = -Math.PI / 2 + R.r(-0.55, 0.55);
      shoots.push(resample([at.p, polar(at.p, a, R.r(70, 160))], 3));
    }
    // flowers along the shoots and crowding the joints
    const flowers = [];
    const put = (p, size) => { if (!flowers.some(f => mhypot(f.p.x - p.x, f.p.y - p.y) < (f.size + size) * 0.48) && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 50) flowers.push({ p, size, bud: R.chance(0.28) }); };
    for (const sh of shoots) for (let k = 0; k < R.i(2, 4); k++) { const at = along(sh, R.r(0.25, 1)); put(polar(at.p, at.a + R.sign() * Math.PI / 2, R.r(5, 10)), R.r(28, 36)); }
    for (const src of [trunk, branch]) for (let k = 0; k < R.i(3, 5); k++) { const at = along(src, R.r(0.3, 1)); put(polar(at.p, at.a - Math.PI / 2, R.r(10, 18)), R.r(30, 38)); }
    // 1: the air
    const air = weather !== 'clear';
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.62, 0.76), H * R.r(0.18, 0.28), R.r(70, 92), R.chance(0.3));
    if (weather === 'snow') {
      const lumps = [];
      for (const [p, wAt] of [[trunk, twAt], [branch, bwAt]]) for (const f of [R.r(0.1, 0.3), R.r(0.5, 0.7)]) lumps.push(snowLump(p, f, f + R.r(0.12, 0.2), wAt, R.r(5, 9)));
      snowSky(c, lumps, R.i(28, 44), R.r(0.12, 0.16), flowers.filter(f => !f.bud).map(f => ({ x: f.p.x, y: f.p.y, r: f.size * 0.5 })));
    }
    // 2-4: the old wood, the branch, the shoots
    limb(c, trunk, tw0, 5, [0.5], { tone: R.r(0.85, 0.93), load: 0.4, part: 'trunk', phases: air ? [2, 2] : [1, 2] });
    c.phase(3);
    limb(c, branch, bw0, 2.4, [], { tone: R.r(0.82, 0.9), load: 0.45, part: 'branch' });
    c.phase(4);
    for (const sh of shoots) c.stroke(wid(sh, prof.taper(2.4, 0.8)), { tone: 0.85, load: 0.8, wet: 0.3, head: 0.3, tail: 'taper', part: 'shoot' });
    // 5: the first flowers; 6: the rest, and the buds; 7: hearts and moss; 8: the last flower
    // never fewer than four open flowers: more along the upper trunk and branch if the shoots gave too few
    for (let k = 0; k < 30 && flowers.filter(f => !f.bud).length < 4; k++) {
      const src = R.chance(0.5) ? trunk : branch, at = along(src, R.r(0.45, 1));
      const before = flowers.length;
      put(polar(at.p, at.a - Math.PI / 2, R.r(10, 18)), R.r(30, 38));
      if (flowers.length > before) flowers[flowers.length - 1].bud = false;
    }
    const open = flowers.filter(f => !f.bud).sort((a, b) => b.p.y - a.p.y), buds = flowers.filter(f => f.bud);
    const last = open.pop();
    const fill = weather === 'snow' ? 0 : R.r(0.05, 0.09);
    open.forEach((f, k) => { c.phase(5 + Math.min(2, Math.floor(k * 3 / open.length))); blossom(c, f.p, f.size, { tone: R.r(0.62, 0.78), fill }); flowerHeart(c, f.p, f.size, 4); });
    c.phase(open.length >= 3 ? 6 : 7);
    for (const b of buds) c.dab(b.p.x, b.p.y, { size: R.r(7, 10), shape: 'dot', angle: R.r(0, TAU), tone: 0.88, part: 'bud' });
    c.phase(7);
    if (open.length < 3) for (const sh of shoots.slice(0, 2)) c.stroke(wid(resample([sh[sh.length - 1], polar(sh[sh.length - 1], -Math.PI / 2 + R.r(-0.4, 0.4), R.r(30, 50))], 3), prof.taper(1.6, 0.6)), { tone: 0.85, load: 0.8, wet: 0.3, head: 0.2, tail: 'taper', part: 'shoot' });
    const moss = []; for (let k = 0; k < R.i(5, 8); k++) { const at = along(trunk, R.r(0.05, 0.8)); moss.push(polar(at.p, at.a - Math.PI / 2, twAt(0.4) * R.r(0.6, 1))); }
    dots(c, moss, 5, 0.95, 'moss');
    c.phase(8);
    if (last) { blossom(c, last.p, last.size * 1.1, { tone: 0.8, fill }); flowerHeart(c, last.p, last.size, 5); }
    const cap = weather === 'snow' ? 'Plum blossom in the snow' : weather === 'moon' ? 'Plum blossom under ' + theMoon(c) : 'The first plum blossom';
    return { caption: cap, sealSide: 1 };
  }

  /* ---- pine on the cliff: Tohaku's pines, one near and dark, one lost in the mist ---- */
  function needleFan(c, p, up, size, tone, n) {
    const R = c.R;
    const spread = Math.PI * R.r(0.7, 0.95), skew = R.r(-0.25, 0.25);
    for (let k = 0; k < n; k++) {
      const a = up + skew + (k / (n - 1) - 0.5) * spread + R.r(-0.1, 0.1);
      const b = polar(p, a + Math.PI, R.r(0, 5));
      const len = size * R.r(0.7, 1.2) * (1 - 0.25 * Math.abs(k / (n - 1) - 0.5));
      c.stroke(wid(qbez(b, polar(polar(b, a, len * 0.5), a + Math.PI / 2, R.r(-3, 3)), polar(b, a, len), 1.5), prof.taper(1.6, 0.45)), { tone: tone * R.r(0.88, 1.05), load: R.r(0.45, 0.8), wet: 0.35, head: 0.2, tail: R.chance(0.4) ? 'dry' : 'taper', part: 'needle' });
    }
  }
  // a pine's foliage pad: a flat cloud of needles along the end of a branch, fans overlapping
  // over a pale wash for the mass
  function pinePad(c, pad, tone, washTone) {
    const R = c.R;
    const { p, w, h } = pad;
    if (washTone) {
      const blob = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; const f = 1 + 0.12 * msin(a * 3 + p.x) + 0.08 * msin(a * 5 + p.y); blob.push(V(p.x + mcos(a) * w * 0.52 * f, p.y - h * 0.3 + msin(a) * h * 0.5 * f)); }
      c.wash(blob, { tone: washTone, soft: 3, bloom: 0.3, grain: 0.06, part: 'mass' });
    }
    if (tone == null) return;
    const nf = Math.max(2, Math.round(w / 30));
    for (let k = 0; k < nf; k++) {
      const x = p.x + (nf === 1 ? 0 : (k / (nf - 1) - 0.5) * w * 0.78) + R.r(-5, 5);
      const y = p.y + R.r(-4, 4) + Math.abs(k / Math.max(1, nf - 1) - 0.5) * h * 0.25;
      needleFan(c, V(x, y), -Math.PI / 2 + (k / Math.max(1, nf - 1) - 0.5) * 0.6, h * R.r(0.85, 1.15), tone * R.r(0.92, 1.04), R.i(7, 9));
    }
  }
  function pinePlan(R, base, height, lean, scale) {
    const top = V(base.x + lean * height, base.y - height);
    const trunk = spline([base, V(lerp(base.x, top.x, 0.35) + R.r(-40, 40) * scale, lerp(base.y, top.y, 0.35)), V(lerp(base.x, top.x, 0.7) + R.r(-50, 50) * scale, lerp(base.y, top.y, 0.7)), top], 3);
    const branches = [], pads = [];
    const nb = R.i(2, 3);
    let sd = R.sign();
    for (let k = 0; k < nb; k++) {
      const at = along(trunk, 0.42 + 0.48 * k / nb + R.r(-0.04, 0.04));
      const a = (sd > 0 ? 0 : Math.PI) + sd * R.r(0.05, 0.3);
      const path = spline(walk(R, at.p, a, R.r(120, 200) * scale, 3, 0.35, 0.1 * sd), 3);
      branches.push(path);
      const end = path[path.length - 1];
      pads.push({ p: V(end.x - sd * 10 * scale, end.y), w: R.r(110, 160) * scale, h: R.r(30, 40) * scale });
      if (R.chance(0.5)) { const m = along(path, R.r(0.35, 0.55)).p; pads.push({ p: V(m.x, m.y), w: R.r(70, 100) * scale, h: R.r(24, 32) * scale }); }
      sd = -sd;
    }
    for (let k = 0; pads.length < 3 && k < branches.length; k++) { const m = along(branches[k], R.r(0.35, 0.55)).p; pads.push({ p: V(m.x, m.y), w: R.r(80, 110) * scale, h: R.r(26, 32) * scale }); }
    pads.push({ p: V(top.x, top.y + 6 * scale), w: R.r(90, 130) * scale, h: R.r(30, 38) * scale });
    return { trunk, branches, pads, top };
  }
  function pine(c) {
    const R = c.R;
    const weather = c.season === 'winter' ? sky(c, [['snow', 8], ['mist', 2], ['moon', 2]]) : sky(c, [['mist', 5], ['moon', 3]]);
    const cliff = R.chance(0.55);
    const base = cliff ? V(R.r(90, 160), H * R.r(0.78, 0.84)) : V(R.r(120, 220), H + 20);
    const near = pinePlan(R, base, R.r(0.58, 0.7) * H, R.r(0.2, 0.42), 1);
    const ghost = weather !== 'snow' || R.chance(0.5) ? pinePlan(R, V(R.r(W * 0.58, W * 0.82), H * R.r(0.74, 0.82)), R.r(0.36, 0.46) * H, R.r(-0.2, 0.1), 0.62) : null;
    const tw = f => lerp(R.r(16, 20), 5, f);
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.62, 0.78), H * R.r(0.14, 0.24), R.r(64, 86), R.chance(0.3));
    if (weather === 'snow') {
      const lumps = near.pads.map(pd => { const arc = []; for (let i = 0; i <= 10; i++) arc.push(V(pd.p.x + (i / 10 - 0.5) * pd.w * 0.8, pd.p.y - pd.h * (0.55 + 0.35 * msin(Math.PI * i / 10)))); return snowLump(arc, 0, 1, () => 2, R.r(6, 10)); });
      snowSky(c, lumps, R.i(26, 40), R.r(0.12, 0.16));
    }
    if (ghost) {
      c.stroke(wid(ghost.trunk, prof.taper(9, 3.5)), { tone: 0.13, load: 0.5, wet: 0.6, head: 0, tail: 'dry', part: 'ghost' });
      for (const b of ghost.branches) c.stroke(wid(b, prof.taper(3.5, 1.2)), { tone: 0.13, load: 0.6, wet: 0.5, head: 0.2, tail: 'dry', part: 'ghost' });
      for (const pd of ghost.pads) pinePad(c, pd, 0.15, 0.07);
    }
    // 2: the cliff; 3: the trunk; 4: branches and the pale mass of each pad
    c.phase(2);
    if (cliff) {
      const edge = spline([V(-30, base.y - R.r(10, 30)), V(base.x * 0.5, base.y - R.r(15, 30)), V(base.x + 30, base.y + 8), V(base.x + R.r(60, 100), H * R.r(0.9, 0.96)), V(base.x + R.r(70, 120), H + 30)], 4);
      c.wash(edge.concat([V(-30, H + 30)]), { tone: R.r(0.16, 0.22), soft: 1.5, bloom: 0.35, grain: 0.1, fade: { x0: 0, y0: base.y, x1: 0, y1: H, to: 0.2 }, part: 'cliff' });
      const top = edge.slice(0, Math.floor(edge.length * 0.6)).filter((_, k) => k % 2 === 0);
      for (let k = 0; k + 3 < top.length; k += R.i(4, 6)) c.stroke(wid(resample(top.slice(k, k + R.i(4, 6)), 3), prof.leaf(3.4, 0.3, 0.8)), { tone: 0.85, load: 0.38, wet: 0.25, head: 0.2, tail: 'dry', part: 'cun' });
    }
    limb(c, near.trunk, tw(0), 5, [0.45], { tone: R.r(0.82, 0.9), load: 0.42, part: 'trunk', phases: cliff ? [3, 3] : [2, 3] });
    c.phase(4);
    near.branches.forEach(b => c.stroke(wid(b, prof.taper(7, 2.2)), { tone: 0.85, load: 0.5, wet: 0.35, head: 0.4, tail: 'dry', part: 'branch' }));
    for (const pd of near.pads) pinePad(c, pd, null, R.r(0.15, 0.22));
    // 5-6: the needles, pad by pad; 7: bark and moss; 8: the crown
    const crown = near.pads.pop();
    near.pads.slice().sort((a, b) => b.w - a.w).forEach((pd, k) => { c.phase(5 + (k % 3)); pinePad(c, pd, R.r(0.85, 0.97), 0); });
    c.phase(7);
    for (let k = 0; k < R.i(5, 8); k++) {
      const at = along(near.trunk, R.r(0.05, 0.75)), p = polar(at.p, at.a + Math.PI / 2, R.r(-4, 4));
      c.stroke(wid(qbez(polar(p, at.a + Math.PI / 2, 6), polar(p, at.a, 3), polar(p, at.a - Math.PI / 2, 6), 1), prof.taper(1.4, 0.8)), { tone: 0.95, load: 0.7, wet: 0.3, head: 0.2, tail: 'dry', part: 'bark' });
    }
    if (cliff) { const moss = []; for (let k = 0; k < R.i(3, 5); k++) moss.push(V(R.r(10, base.x + 30), base.y + R.r(-30, 20))); dots(c, moss, 5, 0.95, 'moss'); }
    c.phase(8);
    pinePad(c, crown, 0.97, 0);
    const cap = weather === 'snow' ? 'Snow on the pine' : weather === 'moon' ? 'Pine under ' + theMoon(c) : cliff ? 'Pine on the cliff' : 'Pines in the mist';
    return { caption: cap, sealSide: 1 };
  }

  /* ---- a crow on a bare branch: the one black mass; sometimes snow ---- */
  function crowBird(c, p, k, ph) {
    const R = c.R;
    const P = (x, y) => V(p.x + x * k, p.y + y * k);          // faces left, feet at p
    const S = (pts, ws, o) => c.stroke(wid(spline(pts, 2), knots(ws, k)), o);
    c.phase(ph.body);
    S([P(-10, -62), P(12, -52), P(34, -34)], [13, 19, 11], { tone: 0.95, load: 0.85, wet: 0.75, head: 0.4, tail: 'blunt', part: 'crow' });
    S([P(-14, -50), P(4, -32), P(26, -25)], [12, 15, 7], { tone: 0.92, load: 0.85, wet: 0.8, head: 0.3, tail: 'taper', part: 'crow' });
    c.phase(ph.head);
    const hd = P(-19, -73);
    S([P(-12, -60), P(-17, -68)], [13, 13], { tone: 0.95, load: 0.9, wet: 0.7, head: 0.2, tail: 'blunt', part: 'crow' });
    c.wash([circle(hd.x, hd.y, 15 * k, 14 * k, 28), circle(hd.x - 5.5 * k, hd.y - 2.5 * k, 2.3 * k, 2.3 * k, 10)], { tone: 0.92, soft: 1, bloom: 0.2, grain: 0.04, part: 'crowhead' });
    S([P(-30, -76), P(-42, -73), P(-51, -69)], [4.6, 3, 0.5], { tone: 1, load: 1, wet: 0.3, head: 0.1, tail: 'taper', part: 'beak' });
    S([P(-30, -70), P(-40, -68.5), P(-47, -67.5)], [3, 1.8, 0.4], { tone: 1, load: 1, wet: 0.3, head: 0.1, tail: 'taper', part: 'beak' });
    S([P(28, -30), P(44, -16), P(58, -4)], [7, 5, 2.5], { tone: 0.95, load: 0.5, wet: 0.4, head: 0.2, tail: 'dry', part: 'tail' });
    S([P(26, -28), P(44, -20), P(63, -12)], [6, 4.5, 2], { tone: 0.9, load: 0.5, wet: 0.4, head: 0.2, tail: 'dry', part: 'tail' });
    c.phase(ph.wing);
    S([P(-4, -58), P(22, -44), P(48, -27)], [9, 10, 2.5], { tone: 1, load: 0.45, wet: 0.4, head: 0.2, tail: 'dry', part: 'wing' });
    for (const dx of [-3, 5]) {
      S([P(dx, -30), P(dx - 1, -16), P(dx - 3, -2)], [2.4, 2, 1.8], { tone: 0.9, load: 0.9, wet: 0.2, head: 0.1, tail: 'blunt', part: 'leg' });
      for (const [tx, ty] of [[-7, 3], [2, 4]]) S([P(dx - 3, -2), P(dx - 3 + tx, ty)], [1.4, 0.7], { tone: 0.9, load: 1, wet: 0.2, head: 0, tail: 'taper', part: 'toe' });
    }
  }
  function crow(c) {
    const R = c.R;
    const weather = c.season === 'winter' ? sky(c, [['snow', 8], ['moon', 2], ['clear', 2]]) : sky(c, [['moon', 3], ['clear', 3], ['snow', 1]]);
    const layout = R.weighted([['down', 5], ['up', 4]]);
    const start = layout === 'down' ? V(-14, R.r(200, 320)) : V(-14, R.r(560, 660));
    const path = spline(walk(R, start, layout === 'down' ? R.r(0.05, 0.3) : R.r(-0.55, -0.3), R.r(430, 520), 4, 0.45, 0), 3);
    const bwAt = f => lerp(R.r(13, 16), 2.4, mpow(f, 0.8));
    const pf = R.r(0.4, 0.55), perch = along(path, pf);
    const k = R.r(1.3, 1.55);
    const feet = V(perch.p.x, perch.p.y - bwAt(pf) * 0.6);
    // bare twigs, kept off the crow
    const twigs = [];
    for (let i = 0; i < R.i(4, 6); i++) {
      const f = R.chance(0.5) ? R.r(0.12, pf - 0.12) : R.r(pf + 0.12, 0.95);
      const at = along(path, f);
      const a = at.a + R.sign() * R.r(0.6, 1.2);
      const tw = spline(walk(R, at.p, a, R.r(50, 120), 2, 0.5, 0), 3);
      if (tw.some(q => mhypot(q.x - (feet.x + 8 * k), q.y - (feet.y - 45 * k)) < 70 * k)) continue;
      twigs.push(tw);
    }
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.62, 0.78), H * R.r(0.14, 0.24), R.r(70, 92), R.chance(0.35));
    if (weather === 'snow') {
      const lumps = [snowLump(path, 0.04, pf - 0.1, bwAt, R.r(6, 9)), snowLump(path, pf + 0.1, pf + 0.3, bwAt, R.r(5, 8))];
      snowSky(c, lumps, R.i(30, 46), R.r(0.13, 0.17));
    }
    const air = weather !== 'clear';
    limb(c, path, bwAt(0), 2.2, [0.5], { tone: R.r(0.84, 0.92), load: 0.42, part: 'branch', phases: air ? [2, 2] : [1, 2] });
    c.phase(3);
    twigs.forEach(tw => c.stroke(wid(tw, prof.taper(3.2, 0.8)), { tone: 0.86, load: 0.5, wet: 0.3, head: 0.3, tail: 'dry', part: 'twig' }));
    const tmp = makeCtx(R, c.season);
    crowBird(tmp, feet, k, { body: 5, head: 6, wing: 7 });
    // 4: the back; 5: the breast and neck; 6: head, beak and tail; 7: the wing and the feet
    tmp.ops.forEach((op, i) => { c.ops.push(Object.assign(op, { phase: op.phase === 5 ? (i === 0 ? 4 : 5) : op.phase })); });
    c.phase(8);
    const fin = R.weighted([['far', 3], ['leaves', 2]]);
    if (fin === 'far') {
      const q = V(W * R.r(0.6, 0.8), H * R.r(0.12, 0.22)), s = R.r(48, 60);
      c.stroke(wid(qbez(polar(q, Math.PI + 0.3, s * 0.5), polar(q, -1.9, s * 0.25), q, 1.2), prof.taper(1, 2.4)), { tone: 0.8, load: 0.8, wet: 0.3, head: 0, tail: 'blunt', part: 'farcrow' });
      c.stroke(wid(qbez(q, polar(q, -1.1, s * 0.3), polar(q, -0.2, s * 0.55), 1.2), prof.taper(2.4, 0.8)), { tone: 0.8, load: 0.6, wet: 0.3, head: 0.2, tail: 'dry', part: 'farcrow' });
      c.dab(q.x, q.y + 2, { size: 10, shape: 'round', tone: 0.8, part: 'farcrow' });
    } else {
      const ends = twigs.map(tw => tw[tw.length - 1]).filter(e => e.x > 30 && e.x < W - 30 && e.y > 30 && e.y < H - 60);
      if (!ends.length) ends.push(along(path, R.r(0.7, 0.9)).p);
      for (const e of ends.slice(0, 2)) leafTwo(c, e, Math.PI / 2 + R.r(-0.5, 0.5), R.r(36, 46), 11, R.r(0.4, 0.55));
    }
    const cap = weather === 'snow' ? 'Crow in the snow' : weather === 'moon' ? 'Crow under ' + theMoon(c) : 'Crow on a bare branch';
    return { caption: cap, sealSide: 1 };
  }

  /* ---- cherry blossom ---- */
  function cherry(c) {
    const R = c.R;
    const weather = sky(c, [['moon', 3], ['far', 3], ['clear', 3]]);
    const path = spline(walk(R, V(-14, R.r(90, 220)), R.r(0.15, 0.45), R.r(440, 540), 4, 0.3, 0.03), 3);
    const wAt = f => lerp(R.r(13, 16), 2.6, mpow(f, 0.85));
    const twigs = [];
    for (const f of [R.r(0.22, 0.34), R.r(0.42, 0.56), R.r(0.62, 0.74), R.r(0.8, 0.92)]) {
      const at = along(path, f);
      twigs.push(spline(walk(R, at.p, at.a + R.sign() * R.r(0.5, 0.9), R.r(50, 100), 2, 0.3, 0.05), 3));
    }
    const clusters = [];
    for (const src of twigs.concat([path])) {
      const e = src[src.length - 1];
      clusters.push(e);
      if (R.chance(0.6)) clusters.push(along(src, R.r(0.4, 0.7)).p);
    }
    const tone = R.r(0.16, 0.24);
    c.phase(1);
    if (weather === 'moon') moon(c, W * R.r(0.62, 0.76), H * R.r(0.36, 0.5), R.r(70, 92), R.chance(0.35));
    if (weather === 'far') ridge(c, -30, W + 30, H * R.r(0.86, 0.92), H * R.r(0.68, 0.76), R.i(2, 3), R.r(0.09, 0.13));
    const air = weather !== 'clear';
    limb(c, path, wAt(0), 2.4, [0.45], { tone: R.r(0.8, 0.88), load: 0.5, part: 'branch', phases: air ? [2, 2] : [1, 2] });
    c.phase(3);
    for (const tw of twigs) c.stroke(wid(tw, prof.taper(3.4, 1)), { tone: 0.84, load: 0.6, wet: 0.3, head: 0.3, tail: 'dry', part: 'twig' });
    // 4: the bark's bands, and the flower stalks hanging from each cluster point
    c.phase(4);
    for (let k = 0; k < R.i(5, 8); k++) {
      const f = R.r(0.05, 0.7), at = along(path, f), w = wAt(f), n = at.a + Math.PI / 2;
      c.stroke(wid(resample([polar(at.p, n, -w * 0.7), polar(at.p, n, w * 0.7)], 1.5), prof.even(1.3)), { tone: 0.95, load: 0.9, wet: 0.2, head: 0.1, tail: 'blunt', part: 'lenticel' });
    }
    const flowers = [];
    for (const p of clusters) {
      const n = R.i(3, 4);
      for (let j = 0; j < n; j++) {
        const a = Math.PI / 2 + (j - (n - 1) / 2) * R.r(0.45, 0.75) + R.r(-0.2, 0.2);
        const e = polar(p, a, R.r(18, 36));
        if (flowers.some(f => mhypot(f.x - e.x, f.y - e.y) < 30)) continue;
        c.stroke(wid(qbez(p, polar(mix(p, e, 0.5), a - 0.3, 4), e, 1.2), prof.even(0.75)), { tone: 0.75, load: 0.9, wet: 0.2, head: 0, tail: 'taper', part: 'pedicel' });
        flowers.push(e);
      }
    }
    // 5-6: flowers; 6: young leaves; 7: hearts; 8: petals falling
    flowers.forEach((p, k) => { c.phase(k < Math.ceil(flowers.length / 2) ? 5 : 6); blossom(c, p, R.r(36, 44), { tone: R.r(0.55, 0.7), fill: tone * 0.55, notch: true }); });
    c.phase(6);
    for (let k = 0; k < R.i(2, 3); k++) { const at = along(twigs[R.i(0, twigs.length - 1)], R.r(0.3, 0.8)); leafTwo(c, at.p, at.a + R.sign() * R.r(0.6, 1.1), R.r(30, 40), 9, R.r(0.45, 0.62)); }
    c.phase(7);
    for (const p of flowers) flowerHeart(c, p, 36, 5);
    c.phase(8);
    for (let k = 0; k < R.i(5, 8); k++) {
      const p = V(R.r(W * 0.25, W * 0.9), R.r(H * 0.5, H * 0.88));
      c.dab(p.x, p.y, { size: R.r(14, 19), angle: R.r(0, TAU), shape: 'petal', tone: tone * R.r(1.1, 1.5), load: 0.9, wet: 0.5, part: 'fallpetal' });
    }
    const cap = weather === 'moon' ? 'Cherry blossom under ' + theMoon(c) : weather === 'far' ? 'Cherry blossom above the valley' : 'Cherry blossom';
    return { caption: cap, sealSide: -1 };
  }

  /* ---- a frog in the rain, Qi Baishi's way: a few wet strokes, exact dark eyes ---- */
  // Qi Baishi's frog: the body one wet, loaded side-brush stroke, darkest on the back; the eyes two
  // dark presses sitting up on the head; the legs quick strokes. No outline, no drawn mouth, no ring
  // round the eye (those made it a cartoon).
  function frogBody(c, p, k, ph) {
    const R = c.R;
    const P = (x, y) => V(p.x + x * k, p.y + y * k);          // faces left, belly line at p
    const S = (pts, ws, o) => c.stroke(wid(spline(pts, 1.5), knots(ws, k)), o);
    const tone = R.r(0.74, 0.86);
    c.phase(ph.body);
    // sitting up: the back rises from the rump on the pad to the raised head, the snout blunt
    S([P(36, -6), P(24, -15), P(4, -20), P(-18, -23), P(-38, -17)], [8, 14, 16, 13, 7], { tone, load: 0.9, wet: 0.95, head: 0.6, tail: 'blunt', part: 'frog' });
    S([P(-30, -6), P(0, -2), P(26, -4)], [4, 7, 5], { tone: tone * 0.26, load: 0.9, wet: 0.85, head: 0.2, tail: 'taper', part: 'belly' });
    c.phase(ph.legs);
    // the folded hind leg: a dark haunch at the back, the shin and foot tucked forward under the body
    S([P(26, -16), P(38, -5), P(26, 5)], [10, 9, 5], { tone: Math.min(1, tone * 1.15), load: 0.75, wet: 0.7, head: 0.4, tail: 'blunt', part: 'thigh' });
    S([P(26, 5), P(8, 8), P(-10, 7)], [4.4, 3, 1.5], { tone: Math.min(1, tone * 1.1), load: 0.7, wet: 0.45, head: 0.2, tail: 'taper', part: 'shin' });
    // the front leg props the chest up
    S([P(-24, -9), P(-27, -1), P(-31, 7)], [4.2, 3.2, 1.6], { tone: Math.min(1, tone * 1.1), load: 0.7, wet: 0.45, head: 0.2, tail: 'taper', part: 'arm' });
    c.phase(ph.face);
    // the eyes stand up off the top of the head: the near one a bold press, the far one smaller behind
    const eye = P(-21, -36);
    c.dab(eye.x + 8 * k, eye.y + 1 * k, { size: 5.5 * k, shape: 'dot', tone: 0.95, load: 1, wet: 0.35, part: 'eye' });
    c.dab(eye.x, eye.y, { size: 8 * k, shape: 'dot', tone: 1, load: 1, wet: 0.35, part: 'eye' });
  }
  function frog(c) {
    const R = c.R;
    const seat = R.weighted([['rock', 3], ['pad', 2]]);
    const watch = R.chance(0.45);
    const k = R.r(1.6, 1.9);
    const fx = W * R.r(0.44, 0.56), fy = H * R.r(0.6, 0.68);
    c.phase(1);
    let top;
    if (seat === 'rock') {
      const rw = R.r(140, 190), ry = fy + 20 * k;
      const hi = R.sign(), rb = ry + R.r(90, 130);
      top = spline([V(fx - rw * 1.05, rb), V(fx - rw * 0.8, ry + R.r(26, 44) - hi * 12), V(fx - rw * 0.4, ry + 4 - hi * R.r(6, 16)), V(fx, ry - R.r(2, 6)), V(fx + rw * 0.45, ry + 6 + hi * R.r(4, 12)), V(fx + rw * 0.85, ry + R.r(30, 50) + hi * 10), V(fx + rw * 1.1, rb)], 4);
      c.wash(top.concat([V(fx + rw * 0.6, rb + 14), V(fx - rw * 0.5, rb + 12)]), { tone: R.r(0.16, 0.22), soft: 1.5, bloom: 0.4, grain: 0.1, fade: { x0: 0, y0: ry + 10, x1: 0, y1: rb + 10, to: 0 }, part: 'rock' });
      c.phase(2);
      const crest = slice(top, R.r(0.12, 0.22), R.r(0.78, 0.88));
      for (const [f0, f1] of [[0, R.r(0.3, 0.45)], [R.r(0.55, 0.65), 1]]) c.stroke(wid(slice(crest, f0, f1), prof.leaf(3.4, 0.3, 0.8)), { tone: 0.85, load: 0.4, wet: 0.25, head: 0.3, tail: 'dry', part: 'cun' });
      for (let i = 0; i < 3; i++) { const q = along(top, R.r(0.15, 0.85)).p; c.stroke(wid(spline([V(q.x, q.y + 8), V(q.x + R.r(-10, 10), q.y + R.r(30, 50))], 3), prof.leaf(2.2, 0.3, 0.8)), { tone: 0.55, load: 0.35, wet: 0.25, head: 0.2, tail: 'dry', part: 'cun' }); }
      const moss = []; for (let i = 0; i < R.i(2, 4); i++) { const q = along(top, R.r(0.2, 0.8)).p; moss.push(V(q.x + R.r(-10, 10), q.y + R.r(2, 14))); }
      dots(c, moss, 5, 0.95, 'moss');
    } else {
      const pr = R.r(95, 125), pcx = fx + R.r(-10, 10), pcy = fy + 26 * k;
      const pad = [];
      for (let i = 0; i < 40; i++) { const a = -Math.PI / 2 + 0.2 + (i / 39) * (TAU - 0.4); pad.push(V(pcx + mcos(a) * pr, pcy + msin(a) * pr * 0.34)); }
      pad.push(V(pcx, pcy));
      c.wash(pad, { tone: R.r(0.2, 0.28), soft: 1.2, bloom: 0.45, grain: 0.08, part: 'pad' });
      top = [V(pcx - pr, pcy), V(pcx + pr, pcy)];
      c.phase(2);
      // the pad's near edge in one wet side-brush stroke (radial veins made it a pizza)
      const edge = []; for (let i = 0; i <= 24; i++) { const a = 0.3 + (i / 24) * (Math.PI - 0.6); edge.push(V(pcx + mcos(a) * pr * 0.97, pcy + msin(a) * pr * 0.33)); }
      c.stroke(wid(resample(edge, 2), prof.leaf(4.5, 0.4, 0.5)), { tone: 0.45, load: 0.65, wet: 0.6, head: 0.3, tail: 'dry', part: 'padedge' });
      for (let i = 0; i < 3; i++) { const y = pcy + pr * 0.4 + i * R.r(12, 20), x = pcx + R.r(-pr, pr * 0.3); c.stroke(wid(resample([V(x, y), V(x + R.r(60, 140), y + R.r(-2, 2))], 3), prof.leaf(1.2, 0.3, 0.8)), { tone: 0.3, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' }); }
    }
    // 3: grass behind the seat
    c.phase(3);
    for (let i = 0; i < R.i(3, 4); i++) {
      const b = V(fx + R.r(60, 150) * R.sign(), (seat === 'rock' ? fy + 40 : fy + 30 * k) + R.r(0, 20));
      blade(c, b, -Math.PI / 2 + R.r(-0.5, 0.5), R.r(110, 220), R.r(2.6, 3.6), { tone: R.r(0.45, 0.75), droop: R.sign() * R.r(0.4, 1.1), load: 0.6, wet: 0.4, tail: 'dry', part: 'grass', behind: false });
    }
    // 4-6: the frog
    frogBody(c, V(fx, fy), k, { body: 4, legs: 5, face: 6 });
    if (watch) {
      // 7-8: a dragonfly hovers in front of the frog's face, wings first
      const q = V(clamp(fx - k * R.r(70, 110), 70, W - 70), fy - k * R.r(50, 90));
      const tmp = makeCtx(R, c.season);
      dragonflyBug(tmp, q, R.r(80, 96), Math.PI + R.r(-0.35, 0.35), 0.9, false);
      for (const op of tmp.ops) c.ops.push(Object.assign(op, { phase: op.part === 'wing' ? 7 : 8 }));
      return { caption: 'Frog and a dragonfly', sealSide: R.sign() };
    }
    // 7-8: the rain, and rings where it lands
    const ang = Math.PI / 2 + R.r(0.1, 0.3);
    c.phase(7);
    rain(c, R.i(16, 22), ang, 0.28);
    c.phase(8);
    rain(c, R.i(12, 18), ang, 0.28);
    for (let i = 0; i < R.i(2, 3); i++) {
      const q = V(R.r(60, W - 60), H * R.r(0.86, 0.95)), rr = R.r(12, 20);
      const arc = []; for (let j = 0; j <= 16; j++) { const a = Math.PI * (1.15 + 0.7 * j / 16); arc.push(V(q.x + mcos(a) * rr, q.y + msin(a) * rr * 0.35)); }
      c.stroke(wid(arc, prof.leaf(1.1, 0.5, 0.5)), { tone: 0.35, load: 0.7, wet: 0.3, head: 0, tail: 'taper', part: 'ring' });
    }
    return { caption: seat === 'pad' ? 'Frog on a lily pad, raining' : 'Frog in the rain', sealSide: R.sign() };
  }

  /* ---- willow and swallows ---- */
  function swallow(c, p, s, h, tone) {
    const R = c.R;
    const at = (a, b) => polar(polar(p, h, a * s), h - Math.PI / 2, b * s);
    const S = (pts, ws, o) => c.stroke(wid(spline(pts, 1.2), knots(ws, s)), o);
    const lift = R.r(0.1, 0.35);
    S([at(0.04, 0.02), at(-0.12, 0.2 + lift), at(-0.42, 0.34 + lift)], [0.05, 0.045, 0.006], { tone, load: 0.7, wet: 0.3, head: 0.2, tail: 'taper', part: 'swallow' });
    S([at(-0.22, 0), at(0, 0.01), at(0.16, 0)], [0.03, 0.06, 0.035], { tone, load: 0.95, wet: 0.4, head: 0.3, tail: 'blunt', part: 'swallow' });
    const hd = at(0.18, 0.005);
    c.dab(hd.x, hd.y, { size: s * 0.08, shape: 'round', tone, part: 'swallow' });
    S([at(0.02, -0.01), at(-0.14, -0.12 - lift * 0.5), at(-0.36, -0.2 - lift * 0.4)], [0.045, 0.04, 0.006], { tone: tone * 0.85, load: 0.7, wet: 0.3, head: 0.2, tail: 'taper', part: 'swallow' });
    for (const sd of [1, -1]) S([at(-0.2, 0), at(-0.34, sd * 0.05), at(-0.5, sd * 0.1)], [0.016, 0.01, 0.003], { tone, load: 0.9, wet: 0.2, head: 0, tail: 'taper', part: 'swallow' });
  }
  function willow(c) {
    const R = c.R;
    const bx = R.r(-20, 120), by = R.r(-10, 40);
    const drift = R.r(0.08, 0.3);
    const strands = [];
    const n = R.i(5, 8);
    for (let k = 0; k < n; k++) {
      const x0 = bx + R.r(0, 200) + k * R.r(8, 24), y0 = by + R.r(-10, 50);
      const len = R.r(240, 600);
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(V(x0 + drift * len * t * t + 12 * msin(t * 5 + k), y0 + len * t)); }
      strands.push({ path: resample(pts, 3), far: k % 3 === 2 });
    }
    const birds = [];
    for (let k = 0; k < 3; k++) birds.push({ p: V(W * R.r(0.5, 0.85), H * R.r(0.3, 0.78)), s: R.r(80, 110) * (k === 0 ? 1 : k === 1 ? 0.85 : 0.7), h: R.r(-0.5, 0.4) + (R.chance(0.5) ? Math.PI : 0) });
    for (let i = 1; i < birds.length; i++) for (let j = 0; j < i; j++) if (mhypot(birds[i].p.x - birds[j].p.x, birds[i].p.y - birds[j].p.y) < 110) birds[i].p.y = clamp(birds[j].p.y + 140, H * 0.25, H * 0.85);
    // 1: far strands, pale
    c.phase(1);
    for (const st of strands) if (st.far) c.stroke(wid(st.path, prof.taper(1.4, 0.7)), { tone: 0.16, load: 0.7, wet: 0.4, head: 0.1, tail: 'taper', part: 'strand' });
    // 2: the bough at the top and the near strands; 3: their leaves begin
    c.phase(2);
    const bough = spline([V(-20, by - 20), V(bx + 120, by + R.r(-10, 10)), V(bx + 260, by - R.r(0, 30))], 3);
    c.stroke(wid(bough, prof.taper(10, 3)), { tone: 0.82, load: 0.45, wet: 0.4, head: 0, tail: 'dry', part: 'bough' });
    for (const st of strands) if (!st.far) c.stroke(wid(st.path, prof.taper(1.6, 0.8)), { tone: R.r(0.5, 0.7), load: 0.75, wet: 0.4, head: 0.1, tail: 'taper', part: 'strand' });
    // Leaves hang off the strand in small clusters with gaps between, splayed out and down; set close
    // along the strand at even steps they read as a string of beads.
    const leafOn = (st, tone, from, to) => {
      const L = pathLen(st.path);
      for (let d = Math.max(from, 0.22) * L; d < to * L; d += R.chance(0.3) ? R.r(8, 14) : R.r(28, 70)) {
        const at = along(st.path, d / L);
        const n = R.chance(0.35) ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const sd = R.sign();
          leafStroke(c, polar(at.p, at.a + sd * Math.PI / 2, 1), at.a + sd * R.r(0.3, 0.65), R.r(24, 38), R.r(2.8, 3.8), { tone: tone * R.r(0.8, 1.15), load: R.r(0.6, 0.85), wet: 0.45, peak: 0.3, w0: 0.25, bend: -sd * R.r(0.05, 0.2), part: 'wleaf' });
        }
      }
    };
    c.phase(3);
    for (const st of strands) leafOn(st, st.far ? 0.16 : 0.5, 0.05, 0.4);
    c.phase(4);
    for (const st of strands) leafOn(st, st.far ? 0.16 : 0.5, 0.4, 0.75);
    // 5: the last leaves and the water far below; 6-8: the swallows arrive
    c.phase(5);
    for (const st of strands) leafOn(st, st.far ? 0.16 : 0.5, 0.75, 1);
    const wy = H * R.r(0.86, 0.92);
    for (let k = 0; k < 3; k++) { const x = R.r(W * 0.2, W * 0.7), y = wy + k * R.r(10, 18); c.stroke(wid(resample([V(x, y), V(x + R.r(80, 180), y + R.r(-2, 2))], 3), prof.leaf(1.3, 0.3, 0.8)), { tone: 0.3, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' }); }
    birds.forEach((b, k) => { c.phase(6 + k); swallow(c, b.p, b.s, b.h, 0.95); });
    return { caption: R.chance(0.5) ? 'Willow and three swallows' : 'Swallows under the willow', sealSide: 1 };
  }

  /* ---- iris by the water ---- */
  function irisFlower(c, p, s, tone) {
    const R = c.R;
    for (const a of [Math.PI / 2 + 0.95, Math.PI / 2 - 0.95, Math.PI / 2 + R.r(-0.15, 0.15)]) {
      c.dab(p.x, p.y, { size: s * R.r(0.9, 1.05), angle: a + R.r(-0.1, 0.1), shape: 'petal', tone: tone * R.r(0.9, 1.08), load: 0.85, wet: 0.65, part: 'fall' });
    }
    for (const a of [-Math.PI / 2 + 0.45, -Math.PI / 2 - 0.45]) {
      const b = polar(p, a, 2);
      c.dab(b.x, b.y, { size: s * R.r(0.62, 0.72), angle: a + R.r(-0.1, 0.1), shape: 'leaf', aspect: 2.2, tone: tone * 0.8, load: 0.85, wet: 0.6, part: 'standard' });
    }
  }
  function irisSignal(c, p, s) {
    for (const a of [Math.PI / 2 + 0.95, Math.PI / 2 - 0.95, Math.PI / 2]) c.stroke(wid(resample([polar(p, a, 3), polar(p, a, s * 0.55)], 1.5), prof.taper(1.6, 0.5)), { tone: 1, load: 0.9, wet: 0.5, head: 0.1, tail: 'taper', part: 'signal' });
  }
  function iris(c) {
    const R = c.R;
    const bx = R.r(80, 200), by = H + 12;
    const leaves = [];
    for (let k = 0; k < R.i(7, 10); k++) {
      const a = -Math.PI / 2 + R.r(-0.35, 0.45);
      leaves.push({ b: V(bx + R.r(-35, 35), by), a, len: R.r(240, 470), wm: R.r(4.5, 7), droop: R.chance(0.3) ? R.sign() * R.r(0.4, 1.0) : R.r(-0.12, 0.12), back: k < 3 });
    }
    const stems = [];
    const nfl = R.i(1, 3);
    for (let k = 0; k < nfl; k++) {
      const b = V(bx + R.r(-20, 20), by), top = V(bx + R.r(-40, 160), H * R.r(0.2, 0.42) + k * 60);
      stems.push({ path: spline([b, V(lerp(b.x, top.x, 0.5) + R.r(-10, 10), lerp(b.y, top.y, 0.5)), top], 3), top, s: R.r(56, 70) });
    }
    const tone = R.r(0.5, 0.68);
    c.phase(1);
    const wy = H * R.r(0.84, 0.9);
    for (let k = 0; k < 3; k++) { const x = R.r(W * 0.3, W * 0.8), y = wy + k * R.r(12, 20); c.stroke(wid(resample([V(x, y), V(x + R.r(80, 180), y + R.r(-2, 2))], 3), prof.leaf(1.4, 0.3, 0.8)), { tone: 0.3, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' }); }
    ridge(c, W * 0.35, W + 30, wy - 10, wy - R.r(60, 100), 2, R.r(0.07, 0.1));
    c.phase(2);
    for (const l of leaves) if (l.back) blade(c, l.b, l.a, l.len, l.wm * 0.9, { tone: R.r(0.18, 0.26), droop: l.droop, load: 0.7, wet: 0.4, peak: 0.4, w0: 0.6, part: 'leaf' });
    const front = leaves.filter(l => !l.back);
    front.forEach((l, k) => { c.phase(k < front.length / 2 ? 3 : 4); blade(c, l.b, l.a, l.len, l.wm, { tone: R.r(0.6, 0.95), droop: l.droop, load: R.chance(0.4) ? 0.5 : 0.8, wet: 0.4, peak: 0.4, w0: 0.6, tail: R.chance(0.4) ? 'dry' : 'taper', part: 'leaf' }); });
    c.phase(4);
    for (const st of stems) c.stroke(wid(st.path, prof.taper(2.6, 1.8)), { tone: 0.75, load: 0.8, wet: 0.3, head: 0, tail: 'blunt', part: 'stem' });
    stems.forEach((st, k) => { c.phase(k === 0 ? 5 : 6); irisFlower(c, st.top, st.s, tone); });
    c.phase(6);
    const bs = along(stems[0].path, 0.55), bud = polar(bs.p, -Math.PI / 2 + R.sign() * 0.5, 30);
    c.stroke(wid(resample([bs.p, bud], 2), prof.taper(1.8, 1.4)), { tone: 0.75, load: 0.9, wet: 0.3, head: 0, tail: 'blunt', part: 'stem' });
    c.dab(bud.x, bud.y, { size: 34, angle: angOf(bs.p, bud), shape: 'leaf', aspect: 3, tone: 0.8, load: 0.9, wet: 0.5, part: 'bud' });
    c.phase(7);
    for (const st of stems) irisSignal(c, st.top, st.s);
    const bl = front[R.i(0, front.length - 1)];
    blade(c, V(bl.b.x + R.r(-10, 10), by), -Math.PI / 2 + R.r(0.25, 0.6), R.r(300, 420), R.r(5, 6.5), { tone: 0.95, droop: R.r(0.8, 1.5), load: 0.55, wet: 0.4, peak: 0.4, w0: 0.6, tail: 'dry', part: 'leaf' });
    c.phase(8);
    const hiTop = stems.reduce((a, b) => (a.top.y < b.top.y ? a : b)).top;
    const fly = V(clamp(hiTop.x + R.sign() * R.r(120, 200), 70, W - 70), clamp(hiTop.y + R.r(-60, 60), 80, H * 0.5));
    dragonflyBug(c, fly, R.r(74, 88), R.r(-0.4, 0.4) + (fly.x > hiTop.x ? Math.PI : 0), 0.9, false);
    return { caption: nfl > 1 ? 'Irises by the water' : 'An iris by the water', sealSide: 1 };
  }

  /* ---- carp under the ripples, seen from above: two koi circling, one dark, one pale ---- */
  function carpFish(c, spine, s, tone, ph) {
    const R = c.R;
    c.phase(ph.body);
    c.stroke(wid(spine, t => s * (t < 0.1 ? lerp(0.62, 1, smooth(t / 0.1)) : t < 0.35 ? 1 : lerp(1, 0.16, mpow((t - 0.35) / 0.65, 1.1)))), { tone, load: 0.85, wet: 0.7, head: 0.9, tail: 'taper', part: 'carp' });
    c.phase(ph.fins);
    const at = f => along(spine, f);
    const h = at(0.22);
    for (const sd of [1, -1]) c.dab(polar(h.p, h.a + sd * Math.PI / 2, s * 0.75).x, polar(h.p, h.a + sd * Math.PI / 2, s * 0.75).y, { size: s * 1.25, angle: h.a + Math.PI + sd * 1.05, shape: 'petal', tone: tone * 0.8, load: 0.8, wet: 0.6, part: 'fin' });
    const t = at(0.97);
    for (const sd of [1, -1]) leafStroke(c, t.p, t.a + sd * 0.5, s * R.r(1.7, 2.1), s * 0.45, { tone: tone * 0.9, load: 0.5, wet: 0.5, peak: 0.4, w0: 0.6, bend: sd * 0.15, tail: 'dry', part: 'tail' });
  }
  function carp(c) {
    const R = c.R;
    // two koi on one circle, chasing: the dark one near the surface, the pale one deeper
    const cx = W * R.r(0.42, 0.58), cy = H * R.r(0.4, 0.55), rad = R.r(95, 130);
    const a0 = R.r(0, TAU), dir = R.sign();
    const arc = (from, len) => { const pts = []; for (let i = 0; i <= 12; i++) { const a = from + dir * len * i / 12; pts.push(V(cx + mcos(a) * rad * 1.1, cy + msin(a) * rad * 0.9)); } return spline(pts, 3); };
    const f1 = arc(a0, 1.9), f2 = arc(a0 + Math.PI, 1.75);
    const third = R.chance(0.35) ? arc(a0 + Math.PI / 2 + R.r(-0.3, 0.3), 1.2).map(q => V(q.x + R.r(-1, 1) * 0 + (q.x - cx) * 0.9 + 0, q.y + (q.y - cy) * 0.9)) : null;
    const s1 = R.r(25, 30), s2 = s1 * R.r(0.82, 0.92);
    // 1: a lily pad at the edge, and the deepest fish, pale as a shadow; 2: the pale koi; 3: rings
    c.phase(1);
    if (third) carpFish(c, third, s1 * 0.7, R.r(0.13, 0.18), { body: 1, fins: 1 });
    const pr = R.r(58, 84), pc = V(R.chance(0.5) ? R.r(0, 70) : R.r(W - 70, W), R.chance(0.5) ? R.r(H * 0.08, H * 0.25) : R.r(H * 0.72, H * 0.9));
    const pad = [], g = R.r(0, TAU);
    for (let i = 0; i < 40; i++) { const a = g + 0.14 + (i / 39) * (TAU - 0.28); pad.push(V(pc.x + mcos(a) * pr * (1 + 0.03 * msin(a * 5)), pc.y + msin(a) * pr)); }
    pad.push(V(pc.x + mcos(g) * pr * 0.1, pc.y + msin(g) * pr * 0.1));
    c.phase(1);
    c.wash(pad, { tone: R.r(0.16, 0.22), soft: 1.5, bloom: 0.4, grain: 0.06, part: 'pad' });
    const pale = R.r(0.26, 0.34);
    c.phase(2);
    c.stroke(wid(f2, t => s2 * (t < 0.1 ? lerp(0.62, 1, smooth(t / 0.1)) : t < 0.35 ? 1 : lerp(1, 0.16, mpow((t - 0.35) / 0.65, 1.1)))), { tone: pale, load: 0.85, wet: 0.7, head: 0.9, tail: 'taper', part: 'carp' });
    c.phase(3);
    const rings = [V(cx + R.r(-40, 40), cy + R.r(-40, 40)), V(R.r(80, W - 80), R.chance(0.5) ? R.r(60, 160) : R.r(H - 200, H - 90))];
    rings.forEach((q, k) => {
      for (let j = 0; j < 2; j++) {
        const rr = (k ? 16 : 26) + j * R.r(14, 20), aa = R.r(0, TAU), pts = [];
        for (let i = 0; i <= 16; i++) { const a = aa + (i / 16) * R.r(1.6, 2.4); pts.push(V(q.x + mcos(a) * rr, q.y + msin(a) * rr * 0.9)); }
        c.stroke(wid(pts, prof.leaf(1.3, 0.5, 0.5)), { tone: 0.3, load: 0.7, wet: 0.3, head: 0, tail: 'taper', part: 'ring' });
      }
    });
    for (let k = 0; k < 3; k++) { const q = V(pc.x + R.r(-0.5, 0.5) * pr, pc.y + R.r(-0.5, 0.5) * pr); c.stroke(wid(resample([q, polar(q, R.r(0, TAU), pr * R.r(0.3, 0.5))], 2), prof.taper(1.1, 0.5)), { tone: 0.42, load: 0.8, wet: 0.5, head: 0, tail: 'taper', part: 'padvein' }); }
    // 4: the dark koi; 5: its fins and tail; 6: the pale one's fins and tail; 7: eyes and the line of each back
    carpFish(c, f1, s1, R.r(0.82, 0.95), { body: 4, fins: 5 });
    const tmp = makeCtx(R, c.season);
    carpFish(tmp, f2, s2, pale, { body: 6, fins: 6 });
    c.phase(6);
    for (const op of tmp.ops.slice(1)) c.ops.push(Object.assign(op, { phase: 6 }));
    c.phase(7);
    for (const [sp, s] of [[f1, s1], [f2, s2]]) {
      const hd = along(sp, 0.08);
      for (const sd of [1, -1]) { const e = polar(hd.p, hd.a + sd * Math.PI / 2, s * 0.55); c.dab(e.x, e.y, { size: 5.5, shape: 'dot', tone: 1, part: 'eye' }); }
      c.stroke(wid(slice(sp, 0.2, 0.62), prof.leaf(2, 0.5, 0.6)), { tone: 1, load: 0.55, wet: 0.4, head: 0.1, tail: 'dry', part: 'dorsal' });
    }
    c.phase(8);
    const lp = V(clamp(cx + R.r(-1, 1) * rad * 1.9, 70, W - 70), clamp(cy + R.sign() * rad * R.r(1.4, 1.9), 80, H - 140));
    leafTwo(c, lp, R.r(0, TAU), R.r(38, 48), 12, R.r(0.45, 0.6));
    const ring = []; for (let i = 0; i <= 20; i++) { const a = R.r(0, 0.1) + (i / 20) * 2.2; ring.push(V(lp.x + mcos(a) * 36, lp.y + msin(a) * 32)); }
    c.stroke(wid(ring, prof.leaf(1.2, 0.5, 0.5)), { tone: 0.3, load: 0.7, wet: 0.3, head: 0, tail: 'taper', part: 'ring' });
    return { caption: third ? 'Three carp under the ripples' : 'Two carp circling', sealSide: R.sign() };
  }

  /* ---- a dragonfly over the reeds, cattails in the marsh ---- */
  function dragonflyFam(c) {
    const R = c.R;
    const bx = R.r(60, 180), by = H + 12;
    c.phase(1);
    const far = [];
    for (let k = 0; k < R.i(3, 5); k++) far.push(makeReed(R, V(R.r(W * 0.45, W * 0.95), H * R.r(0.84, 0.9)), R.r(80, 180), R.r(-0.08, 0.08), { leaves: R.i(0, 1), leafW: 0.8 }));
    for (const r of far) { reedStem(c, r, 0.2, 1.2); reedLeaves(c, r, 0.2); }
    const wy = H * R.r(0.88, 0.93);
    for (let k = 0; k < 3; k++) { const x = R.r(W * 0.3, W * 0.8), y = wy + k * R.r(8, 14); c.stroke(wid(resample([V(x, y), V(x + R.r(80, 160), y + R.r(-2, 2))], 3), prof.leaf(1.3, 0.3, 0.8)), { tone: 0.3, load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'water' }); }
    const nbl = R.i(5, 7);
    for (let k = 0; k < nbl; k++) {
      c.phase(k < nbl / 2 ? 2 : 3);
      blade(c, V(bx + R.r(-30, 30), by), -Math.PI / 2 + R.r(-0.45, 0.55), R.r(200, 420), R.r(3.2, 4.6), { tone: R.r(0.55, 0.9), droop: R.sign() * R.r(0.3, 1.2), load: R.chance(0.4) ? 0.5 : 0.75, wet: 0.4, tail: R.chance(0.4) ? 'dry' : 'taper', part: 'blade' });
    }
    // 4: cattail stems; 5: their heads
    const tails = [];
    for (let k = 0; k < R.i(2, 3); k++) {
      const b = V(bx + R.r(-10, 30), by), top = V(bx + R.r(-30, 110), H * R.r(0.22, 0.45) + k * R.r(40, 90));
      tails.push({ path: spline([b, V(lerp(b.x, top.x, 0.5) + R.r(-12, 12), lerp(b.y, top.y, 0.5)), top], 3), top });
    }
    c.phase(4);
    for (const t of tails) c.stroke(wid(t.path, prof.taper(2.4, 1.6)), { tone: 0.75, load: 0.8, wet: 0.3, head: 0, tail: 'blunt', part: 'stem' });
    c.phase(5);
    for (const t of tails) {
      const at = along(t.path, 0.86), e = t.top;
      c.stroke(wid(resample([at.p, polar(at.p, at.a, mhypot(e.x - at.p.x, e.y - at.p.y) * 0.62)], 2), prof.knuckle(R.r(6.5, 8))), { tone: 0.95, load: 0.9, wet: 0.6, head: 0.9, tail: 'blunt', part: 'cattail' });
      c.stroke(wid(resample([polar(at.p, at.a, mhypot(e.x - at.p.x, e.y - at.p.y) * 0.68), e], 1.5), prof.taper(1.5, 0.5)), { tone: 0.8, load: 0.9, wet: 0.2, head: 0, tail: 'taper', part: 'spike' });
    }
    // 6-7: the dragonfly lands on the tallest; 8: a second one far off
    const perch = tails.reduce((a, b) => (a.top.y < b.top.y ? a : b));
    const hover = R.chance(0.4);
    const p = hover ? V(W * R.r(0.55, 0.8), H * R.r(0.2, 0.4)) : V(perch.top.x, perch.top.y - 2);
    const h = hover ? R.r(-0.3, 0.3) + Math.PI : -Math.PI / 2 + R.r(-0.9, 0.9);
    const tmp = makeCtx(R, c.season);
    dragonflyBug(tmp, p, R.r(104, 124), h, 0.9, !hover);
    c.phase(6);
    for (const op of tmp.ops) { if (op.part === 'wing') c.ops.push(Object.assign(op, { phase: 6 })); }
    c.phase(7);
    for (const op of tmp.ops) { if (op.part !== 'wing') c.ops.push(Object.assign(op, { phase: 7 })); }
    c.phase(8);
    let q = V(W * R.r(0.5, 0.85), H * R.r(0.12, 0.3));
    if (mhypot(q.x - p.x, q.y - p.y) < 170) q = V(W - q.x, q.y + 60);
    dragonflyBug(c, q, R.r(62, 74), R.r(0, TAU), 0.8, false);
    return { caption: hover ? 'Dragonfly over the marsh' : 'Dragonfly on a cattail', sealSide: 1 };
  }

  /* ---- chrysanthemum: the autumn Gentleman, as Wu Changshuo and Qi Baishi paint it. The flowers in
     outline, each petal two short strokes pressed at its tip and drawn back toward the heart, crowding
     and darkening there; the leaves boneless, a few loaded presses of the brush for the lobes, with the
     veins struck in dark ---- */
  // Each row of petals, from the heart outward: count, where they start, their length and width (times
  // r), the angle they leave the heart at and how far they curl along their length (radians: + up and
  // in over the heart, - bowed back and down).
  const KIKU_ROWS = {
    open: [[8, 0.02, 0.22, 1.3, 1.4, 0.075], [11, 0.06, 0.36, 1.0, 1.1, 0.09], [14, 0.1, 0.52, 0.6, 0.7, 0.1], [17, 0.15, 0.68, 0.3, 0.3, 0.105], [20, 0.2, 0.82, 0.1, -0.5, 0.1]],
    cup: [[7, 0.02, 0.3, 1.3, 1.5, 0.09], [10, 0.06, 0.55, 1.0, 1.2, 0.11], [12, 0.1, 0.72, 0.75, 0.9, 0.12], [12, 0.14, 0.8, 0.45, 0.4, 0.11]],
    bud: [[3, 0.0, 1.0, 1.45, 0.9, 0.3], [5, 0.05, 1.05, 1.3, 0.8, 0.3]],
  };
  // A bloom's petals in 3D, nearest first. The flower's face turns toward us by o.tilt (0 edge on, PI/2
  // face on) and leans by o.lean; each petal is a strap, narrow at the heart and round at the tip,
  // twisting a little, projected onto the sheet with its outline and the box round it.
  function kikuPlan(R, p, r, o) {
    const st = msin(o.tilt), ct = mcos(o.tilt), cl = mcos(o.lean || 0), sl = msin(o.lean || 0);
    const spin = R.r(0, TAU);
    const P3 = (a, b, phi, w) => {
      const cx = mcos(phi), sy = msin(phi);
      const x = a * cx - w * sy, yf = a * sy + w * cx;
      const Y = yf * st - b * ct, Z = yf * ct + b * st;
      return { x: p.x + x * cl - Y * sl, y: p.y + x * sl + Y * cl, z: Z };
    };
    const petals = [];
    o.rows.forEach(([n, a0, len, e0, curl, wmax], ri) => {
      const outer = ri === o.rows.length - 1;
      for (let k = 0; k < n; k++) {
        if (outer && R.chance(o.gaps)) continue;
        const phi0 = spin + (k + 0.5 * ri + R.r(-0.3, 0.3)) * TAU / n;
        const L = len * r * R.r(0.82, 1.15), cu = curl + R.r(-0.3, 0.3), twist = R.r(-0.35, 0.35), wm = wmax * r * R.r(0.8, 1.15);
        const N = 18;
        let a = a0 * r * R.r(0.7, 1.3), b = 0;
        const th0 = e0 + R.r(-0.15, 0.15);
        const mid = [], left = [], right = [];
        for (let i = 0; i <= N; i++) {
          const s = i / N, phi = phi0 + twist * s * s;
          const w = wm * (0.3 + 0.7 * smooth(s / 0.55)) * (s > 0.72 ? Math.sqrt(Math.max(0, 1 - mpow((s - 0.72) / 0.28, 2))) : 1);
          mid.push(P3(a, b, phi, 0)); left.push(P3(a, b, phi, w)); right.push(P3(a, b, phi, -w));
          const t = th0 + cu * (s + 0.5 / N);
          a += L / N * mcos(t); b += L / N * msin(t);
        }
        const poly = left.concat(right.slice().reverse());
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        petals.push({ left, right, poly, box: [x0, y0, x1, y1], z: mid[Math.round(N * 0.6)].z + 0.15 * mid[N].z, row: ri, nrows: o.rows.length });
      }
    });
    return petals.sort((a, b) => b.z - a.z);
  }
  const kikuIn = (f, q) => q.x > f.box[0] && q.x < f.box[2] && q.y > f.box[1] && q.y < f.box[3] && inPoly(f.poly, q.x, q.y);
  // where a bloom hides what is behind it
  const kikuHides = (bl, q) => bl.petals.some(f => kikuIn(f, q));
  // Each petal two strokes, pressed where the brush lands at the tip and thinning as it is drawn back
  // toward the heart, lifting before it gets there. A petal stops where a nearer one hides it. The
  // heart's petals and the near ones are darker and heavier, the far ones paler and finer.
  function kikuOutline(c, petals, tone, lw, front) {
    const R = c.R;
    const done = (front || []).slice();
    let z0 = Infinity, z1 = -Infinity;
    for (const pt of petals) { z0 = Math.min(z0, pt.z); z1 = Math.max(z1, pt.z); }
    for (const pt of petals) {
      const N = pt.left.length - 1;
      const inner = 1 - pt.row / Math.max(1, pt.nrows - 1), near = z1 > z0 ? (pt.z - z0) / (z1 - z0) : 0.5;
      const tn = Math.min(1, tone * (0.7 + 0.35 * inner) * (0.86 + 0.22 * near) * R.r(0.86, 1.1));
      const lwp = lw * R.r(0.82, 1.2) * (0.85 + 0.3 * near);
      for (const [ei, edge] of [pt.left, pt.right].entries()) {
        const s0 = R.r(0.12, 0.4) + (pt.row === 0 ? 0.15 : 0);
        if (!ei && R.chance(0.06)) continue;                       // now and then one side is left out
        const path = [];
        for (let i = N; i >= 0 && i / N >= s0; i--) path.push({ x: edge[i].x, y: edge[i].y, s: i / N });
        if (path.length < 2) continue;
        const fine = [];
        for (let i = 0; i + 1 < path.length; i++) for (let j = 0; j < 3; j++) { const a = path[i], b = path[i + 1], t = j / 3; fine.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t) }); }
        fine.push(path[path.length - 1]);
        const s1 = fine[0].s;
        fine.forEach(q => { const u = (s1 - q.s) / Math.max(0.05, s1 - s0); q.w = lwp * (u < 0.12 ? lerp(0.85, 1.4, u / 0.12) : lerp(1.4, 0.3, mpow((u - 0.12) / 0.88, 0.75))); });
        let run = [];
        const flush = () => { if (run.length >= 3 && pathLen(run) >= 4) c.stroke(run, { tone: tn, load: R.r(0.55, 0.9), wet: 0.6, head: 0.35, tail: 'taper', part: 'petal' }); run = []; };
        for (const q of fine) { if (done.some(f => kikuIn(f, q))) flush(); else run.push(q); }
        flush();
      }
      done.push(pt);
    }
  }
  // a bud: a pale press for its body, its few closed petals in outline, three dark sepals at its foot
  function kikuBud(c, bl) {
    const R = c.R, up = bl.lean - Math.PI / 2;
    const q = polar(bl.p, up, bl.r * 0.45);
    c.dab(q.x, q.y, { size: bl.r * 1.1, shape: 'round', angle: up, tone: R.r(0.18, 0.26), load: 0.9, wet: 0.7, part: 'bud' });
    kikuOutline(c, bl.petals, bl.tone, bl.lw);
    const b = polar(bl.p, up + Math.PI, bl.r * 0.12);
    for (const a of [-0.9, 0.9, R.r(-0.3, 0.3)]) {
      const d = up + a;
      c.stroke(wid(spline([b, polar(b, d, bl.r * 0.25), polar(polar(b, d, bl.r * 0.4), d - (a < 0 ? -1 : 1) * 0.6, bl.r * 0.12)], 1.5), prof.leaf(bl.r * 0.068, 0.3, 0.5)), { tone: 0.92, load: 0.9, wet: 0.4, head: 0, tail: 'taper', part: 'sepal' });
    }
  }
  // A leaf: the tip lobe along the midrib and a pair or two of side lobes spread forward like fingers,
  // each one loaded press of the brush from the midrib out to a rounded end.
  function kikuLeafPlan(R, base, ang, L, five) {
    const bend = R.r(-0.18, 0.18);
    const P = t => polar(polar(base, ang, L * t), ang + Math.PI / 2, bend * L * msin(Math.PI * t));
    const A = t => angOf(P(Math.max(0, t - 0.02)), P(Math.min(1, t + 0.02)));
    const lobes = [{ t0: 0.22, a: 0, len: 0.78, w: R.r(0.19, 0.22), dark: 0 }];
    for (const sd of [1, -1]) {
      lobes.push({ t0: 0.3 + R.r(-0.04, 0.04), a: sd * R.r(0.5, 0.65), len: R.r(0.46, 0.54), w: R.r(0.16, 0.19), dark: sd });
      if (five) lobes.push({ t0: 0.08 + R.r(-0.03, 0.03), a: sd * R.r(0.95, 1.15), len: R.r(0.34, 0.4), w: R.r(0.12, 0.14), dark: sd });
    }
    // each lobe's centre line and width, and the outline of them all together (star-shaped about the palm)
    for (const lb of lobes) {
      const s = P(lb.t0), a = A(lb.t0) + lb.a, len = lb.len * L;
      if (lb.a === 0) { const pts = []; for (let i = 0; i <= 12; i++) pts.push(P(lb.t0 + (1 - lb.t0) * i / 12)); lb.path = resample(pts, 1.5); }
      else lb.path = qbez(s, polar(polar(s, a, len * 0.5), a + Math.PI / 2, -(lb.a < 0 ? -1 : 1) * len * 0.1), polar(s, a, len), 1.5);
      lb.wf = u => lb.w * L * (u < 0.6 ? 0.12 + 0.88 * msin(Math.PI / 2 * mpow(u / 0.6, 0.8)) : Math.sqrt(Math.max(0.03, 1 - mpow((u - 0.6) / 0.4, 2))));
    }
    const O = P(0.36), nb = 90, rho = new Float64Array(nb);
    for (const lb of lobes) {
      const n = lb.path.length;
      for (let i = 0; i < n; i++) {
        const q = lb.path[i], d = angOf(lb.path[Math.max(0, i - 1)], lb.path[Math.min(n - 1, i + 1)]), w = lb.wf(n > 1 ? i / (n - 1) : 0);
        for (const e of [polar(q, d - Math.PI / 2, w), polar(q, d + Math.PI / 2, w), q]) {
          const k = ((Math.floor((matan2(e.y - O.y, e.x - O.x) / TAU + 1) * nb) % nb) + nb) % nb;
          rho[k] = Math.max(rho[k], dist(O, e));
        }
      }
    }
    for (let pass = 0; pass < 4; pass++) for (let k = 0; k < nb; k++) if (!rho[k]) rho[k] = Math.max(rho[(k + nb - 1) % nb], rho[(k + 1) % nb]) * 0.9;
    const outline = [];
    for (let k = 0; k < nb; k++) outline.push(polar(O, (k + 0.5) / nb * TAU, 0.25 * rho[(k + nb - 1) % nb] + 0.5 * rho[k] + 0.25 * rho[(k + 1) % nb]));
    return { base, ang, L, P, A, lobes, outline };
  }
  // Painted boneless: the paper wetted in the leaf's shape with pale ink, then the lobes pressed into it,
  // the ones on the side the brush tip favours darker, so the leaf has two tones and the presses melt.
  function kikuLeaf(c, lf, tone) {
    const R = c.R, darkSide = R.sign();
    c.wash(lf.outline, { tone: tone * 0.35, soft: 1.5, bloom: 0.2, grain: 0.06, part: 'kleaf' });
    for (const lb of lf.lobes) {
      const t = Math.min(0.9, tone * 0.66 * (lb.dark === darkSide ? R.r(1.0, 1.1) : R.r(0.8, 0.92)));
      c.stroke(wid(lb.path, lb.wf), { tone: t, load: R.r(0.8, 0.95), wet: 0.95, head: 0, tail: 'blunt', part: 'kleaf' });
    }
  }
  // the midrib and a vein into each side lobe, struck dark
  function kikuVeins(c, lf, tone) {
    const R = c.R, L = lf.L;
    const mid = []; for (let i = 0; i <= 14; i++) mid.push(lf.P(0.02 + 0.8 * i / 14));
    c.stroke(wid(mid, prof.taper(Math.max(1, L * 0.014), 0.45)), { tone, load: 0.9, wet: 0.55, head: 0.2, tail: 'taper', part: 'kvein' });
    for (const lb of lf.lobes) {
      if (lb.a === 0) continue;
      const s = lf.P(lb.t0 + 0.02), a = lf.A(lb.t0) + lb.a * 0.92, sd = lb.a < 0 ? -1 : 1;
      const e = polar(s, a, lb.len * L * R.r(0.5, 0.65));
      c.stroke(wid(qbez(s, polar(mix(s, e, 0.5), a + Math.PI / 2, -sd * lb.len * L * 0.05), e, 1.5), prof.taper(Math.max(0.8, L * 0.01), 0.35)), { tone, load: 0.9, wet: 0.55, head: 0.1, tail: 'taper', part: 'kvein' });
    }
  }
  function chrysanthemum(c) {
    const R = c.R;
    const weather = sky(c, [['clear', 5], ['moon', 2]]);
    const bx = W * R.r(0.22, 0.36), by = H + 14;
    // one flower large and near, a smaller one or a half-open cup higher or lower beside it, sometimes a bud
    const main = { p: V(W * R.r(0.5, 0.62), H * R.r(0.3, 0.38)), r: R.r(104, 116), kind: 'open', tilt: R.r(0.7, 1.0), lean: R.r(-0.25, 0.15), tone: R.r(0.88, 0.96), lw: 1.9 };
    const second = R.chance(0.5)
      ? { p: V(W * R.r(0.16, 0.26), H * R.r(0.19, 0.26)), r: R.r(62, 72), kind: R.chance(0.5) ? 'open' : 'cup', tilt: R.r(0.45, 0.8), lean: R.r(-0.35, -0.05), tone: R.r(0.66, 0.76), lw: 1.45 }
      : { p: V(W * R.r(0.72, 0.8), H * R.r(0.5, 0.57)), r: R.r(58, 68), kind: R.chance(0.5) ? 'open' : 'cup', tilt: R.r(0.4, 0.75), lean: R.r(0.05, 0.35), tone: R.r(0.66, 0.76), lw: 1.45 };
    const blooms = [main, second];
    for (const bl of blooms) {
      bl.petals = kikuPlan(R, bl.p, bl.r, { tilt: bl.tilt, lean: bl.lean, rows: KIKU_ROWS[bl.kind], gaps: bl.kind === 'open' ? 0.18 : 0.1 });
      // the stem turns a little at each node on its way up to the back of the flower, and stops where
      // the petals hide it
      const b = V(bx + R.r(-18, 18), by), bow = R.r(-35, 35);
      const top = V(bl.p.x - msin(bl.lean) * bl.r * 0.3, bl.p.y + bl.r * 0.25);
      const ctrl = [b];
      for (let k = 1; k < 4; k++) { const t = k / 4; ctrl.push(V(lerp(b.x, top.x, t) + bow * msin(Math.PI * t) + R.r(-6, 6), lerp(b.y, top.y, t))); }
      ctrl.push(top);
      const full = spline(ctrl, 3);
      let cut = full.length;
      for (let i = 0; i < full.length; i++) if (kikuHides(bl, full[i])) { cut = i; break; }
      bl.stem = full.slice(0, Math.max(2, cut + 1));
    }
    let bud = null;
    if (R.chance(0.5)) {
      const at = along(main.stem, R.r(0.6, 0.72));
      const sd = second.p.x < main.p.x ? 1 : -1;
      const a = -Math.PI / 2 + sd * R.r(0.45, 0.8), p = polar(at.p, a, R.r(70, 95));
      bud = { p, r: R.r(32, 38), kind: 'bud', lean: a + Math.PI / 2, tone: 0.9, lw: 1.45 };
      bud.petals = kikuPlan(R, p, bud.r, { tilt: R.r(0.1, 0.25), lean: bud.lean, rows: KIKU_ROWS.bud, gaps: 0 });
      bud.stem = spline([at.p, polar(mix(at.p, p, 0.5), a + Math.PI / 2, sd * 6), polar(p, a + Math.PI, bud.r * 0.1)], 2);
      blooms.push(bud);
    }
    // leaves at the nodes, one or two to a node, overlapping, kept clear of the flowers
    const leaves = [];
    const toneBag = R.shuffle([0.84, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48, 0.42, 0.36, 0.7, 0.58, 0.8]);
    let tb = 0;
    [main, second].forEach((bl, bi) => {
      const nodes = bi === 0 ? R.i(3, 4) : R.i(2, 3);
      let side = R.sign();
      for (let k = 0; k < nodes; k++) {
        const f = lerp(0.2, 0.82, (k + R.r(0.25, 0.75)) / nodes);
        const at = along(bl.stem, f);
        const per = R.chance(0.45) ? 2 : 1;
        for (let j = 0; j < per; j++) {
          const L = R.r(112, 150) * (bi ? 0.85 : 1) * (1 - 0.3 * f) * (j ? 0.8 : 1);
          let placed = null;
          for (let t = 0; t < 10 && !placed; t++) {
            const a = at.a + side * R.r(0.5, 1.35) + (t ? R.r(-0.5, 0.5) : 0) + (j ? side * R.r(0.3, 0.6) : 0);
            const ok = [0.35, 0.65, 0.95].every(u => { const q = polar(at.p, a, L * u); return blooms.every(o => mhypot(q.x - o.p.x, q.y - o.p.y) > o.r * 1.02 + L * 0.16) && q.x > 12 && q.x < W - 12 && q.y > 12 && q.y < H - 30; });
            if (ok) placed = { base: at.p, ang: a, L, tone: toneBag[tb++ % toneBag.length] };
          }
          if (placed) leaves.push(placed);
          if (!j && per === 1) side = -side;
        }
        if (per === 2) side = -side;
      }
    });
    // 1: the moon if it is up, in the empty corner; the ground and a few grasses
    c.phase(1);
    if (weather === 'moon') moon(c, second.p.x < main.p.x && second.p.y < H * 0.3 ? W * R.r(0.74, 0.82) : W * R.r(0.2, 0.28), H * R.r(0.12, 0.18), R.r(52, 64), R.chance(0.3));
    const gy = H * R.r(0.93, 0.96);
    for (let k = 0; k < 2; k++) { const x = bx + R.r(-110, 140), y = gy + k * R.r(6, 12); c.stroke(wid(resample([V(x, y), V(x + R.r(70, 150), y + R.r(-2, 2))], 3), prof.leaf(R.r(1.4, 2), 0.3, 0.8)), { tone: R.r(0.3, 0.42), load: 0.4, wet: 0.3, head: 0, tail: 'dry', part: 'ground' }); }
    for (let k = 0; k < R.i(3, 5); k++) blade(c, V(bx + R.r(-60, 80), H + 10), -Math.PI / 2 + R.r(-0.8, 0.8), R.r(80, 160), R.r(2.2, 3), { tone: R.r(0.26, 0.4), droop: R.sign() * R.r(0.5, 1.2), load: 0.6, wet: 0.4, tail: 'dry', part: 'grass' });
    // 2: the stems, each in one stroke
    c.phase(2);
    blooms.forEach((bl, bi) => c.stroke(wid(bl.stem, prof.taper(bl.kind === 'bud' ? 2 : bi ? 2.8 : 3.4, bl.kind === 'bud' ? 1.4 : bi ? 1.7 : 2.1)), { tone: R.r(0.78, 0.88), load: R.r(0.55, 0.7), wet: 0.4, head: 0.3, tail: 'blunt', part: 'kstem' }));
    // 3: the paler leaves behind; 4: the dark ones over them
    leaves.sort((a, b) => a.tone - b.tone);
    const plans = leaves.map(l => kikuLeafPlan(R, l.base, l.ang, l.L, l.tone >= 0.45 && R.chance(0.65)));
    leaves.forEach((l, k) => { c.phase(l.tone < 0.65 ? 3 : 4); kikuLeaf(c, plans[k], l.tone); });
    // 5: the main flower's heart and inner petals; 6: its outer petals; 7: the others
    const inner = main.petals.filter(p => p.row <= 2);
    c.phase(5);
    kikuOutline(c, inner, main.tone, main.lw);
    c.phase(6);
    kikuOutline(c, main.petals.filter(p => p.row > 2), main.tone, main.lw, inner);
    c.phase(7);
    for (const bl of blooms.slice(1)) { if (bl.kind === 'bud') kikuBud(c, bl); else kikuOutline(c, bl.petals, bl.tone, bl.lw); }
    // 8: the veins struck into the leaves, the hearts dotted
    c.phase(8);
    leaves.forEach((l, k) => kikuVeins(c, plans[k], Math.min(1, l.tone * 0.45 + 0.55)));
    for (const bl of blooms) if (bl.kind !== 'bud') {
      const k = bl.r / 100, pts = [];
      for (let i = 0; i < 6; i++) { const a = R.r(0, TAU), d = R.r(0, 9) * k; pts.push(V(bl.p.x + mcos(a) * d, bl.p.y - 5 * k + msin(a) * d * 0.7)); }
      dots(c, pts, 3.2 * k + 1.2, 0.95, 'heart');
    }
    const cap = weather === 'moon' ? 'Chrysanthemums under ' + theMoon(c) : bud ? 'Chrysanthemums in bud' : 'Chrysanthemums';
    return { caption: cap, sealSide: 1 };
  }

  /* ================= registry ================= */
  // Each family's windows are month*100+day, inclusive, and may wrap the new year: when it is in
  // season in Ontario. The two that are in season all year come up half as often.
  const FAMILIES = [
    { id: 'maple', seasons: ['autumn'], windows: [[915, 1110]], fn: maple },
    { id: 'pampas', seasons: ['autumn'], windows: [[901, 1031]], moonViewing: true, fn: pampas },
    { id: 'geese', seasons: ['spring', 'autumn'], windows: [[310, 425], [910, 1130]], moonViewing: true, fn: geese },
    { id: 'heron', seasons: ['spring', 'summer', 'autumn'], windows: [[415, 1031]], fn: heron },
    { id: 'persimmon', seasons: ['autumn', 'winter'], windows: [[1001, 110]], fn: persimmons },
    { id: 'chrysanthemum', seasons: ['autumn'], windows: [[920, 1120]], fn: chrysanthemum },
    { id: 'mountains', seasons: ['winter', 'spring', 'summer', 'autumn'], windows: [[101, 1231]], weight: 0.25, fn: mountains },
    { id: 'bamboo', seasons: ['winter', 'spring', 'summer', 'autumn'], windows: [[101, 1231]], weight: 0.25, fn: bamboo },
    { id: 'plum', seasons: ['winter', 'spring'], windows: [[101, 331]], fn: plum },
    { id: 'pine', seasons: ['autumn', 'winter'], windows: [[1115, 331]], fn: pine },
    { id: 'crow', seasons: ['autumn', 'winter'], windows: [[1101, 315]], fn: crow },
    { id: 'cherry', seasons: ['spring'], windows: [[410, 531]], fn: cherry },
    { id: 'frog', seasons: ['spring', 'summer'], windows: [[401, 815]], fn: frog },
    { id: 'willow', seasons: ['spring'], windows: [[320, 615]], fn: willow },
    { id: 'iris', seasons: ['spring', 'summer'], windows: [[525, 720]], fn: iris },
    { id: 'carp', seasons: ['summer'], windows: [[601, 915]], fn: carp },
    { id: 'dragonfly', seasons: ['summer', 'autumn'], windows: [[601, 930]], fn: dragonflyFam },
  ];
  const BY_ID = {};
  for (const f of FAMILIES) BY_ID[f.id] = f;

  /* ---------------- which family on which day ----------------
     Every child has their own rotation. Each day picks among the families in season, never
     yesterday's, favouring the ones not seen for longest, so a family comes round about once
     in as many days as there are families in season. The rotation is simulated from a fixed
     start, so a date's family never changes with the day it is asked on. */
  const EPOCH = dayNum('2026-01-01');
  const sched = {};
  function activeOn(n) { const md = mdOf(n); return FAMILIES.filter(f => f.windows.some(w => inWindow(md, w[0], w[1]))); }
  function familyFor(n, nameKey) {
    let s = sched[nameKey];
    const start = n < EPOCH ? n - 40 : EPOCH;
    if (!s || s.start !== start) s = sched[nameKey] = { start, picks: [], last: {} };
    while (s.start + s.picks.length <= n) {
      const d = s.start + s.picks.length;
      const act = activeOn(d);
      const recent = s.picks.slice(-(act.length >= 7 ? 4 : act.length >= 5 ? 3 : act.length >= 3 ? 1 : 0));
      let cand = act.filter(f => recent.indexOf(f.id) < 0);
      if (!cand.length) cand = act.filter(f => f.id !== s.picks[s.picks.length - 1]);
      if (!cand.length) cand = act.length ? act : FAMILIES;
      const R = Rng(hash32('fam|' + nameKey + '|' + d));
      // the longer a family has been away, the likelier it comes back; chance does the rest
      // on the evenings of the full moon, the moon-viewing pictures come first
      const mo = moonOn(d), moonNight = mo && Math.abs(mo.d) < 1.6;
      const pairs = cand.map(f => [f.id, (f.weight || 1) * (moonNight && f.moonViewing ? 6 : 1) * mpow(s.last[f.id] == null ? 24 : Math.min(24, d - s.last[f.id]), 2)]);
      const pick = R.weighted(pairs);
      s.picks.push(pick);
      s.last[pick] = d;
    }
    return BY_ID[s.picks[n - s.start]];
  }

  /* ---------------- the ink map: a quarter-size estimate of where ink will be ----------------
     Used to place the seal, to split the rounds by how much each one adds, and by the sheet
     harness to flag crowded or empty pictures. It never paints. */
  const MS = 4, MW = W / MS, MH = H / MS;
  function inPoly(poly, x, y) {
    let inside = false;
    for (const ring of ringsOf(poly)) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function opCover(op, stamp) {
    if (op.kind === 'stroke') {
      const t = op.o.tone;
      for (const q of op.pts) {
        const r = q.w + 1;
        const x0 = Math.floor((q.x - r) / MS), x1 = Math.floor((q.x + r) / MS);
        const y0 = Math.floor((q.y - r) / MS), y1 = Math.floor((q.y + r) / MS);
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          const dx = (gx + 0.5) * MS - q.x, dy = (gy + 0.5) * MS - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = clamp((r + MS * 0.5 - d) / MS, 0, 1);
          if (a > 0) stamp(gx, gy, t * a);
        }
      }
    } else if (op.kind === 'dab') {
      const r = op.o.size * (op.o.shape === 'leaf' ? 0.3 : 0.5);
      const x0 = Math.floor((op.x - r) / MS), x1 = Math.floor((op.x + r) / MS);
      const y0 = Math.floor((op.y - r) / MS), y1 = Math.floor((op.y + r) / MS);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const dx = (gx + 0.5) * MS - op.x, dy = (gy + 0.5) * MS - op.y;
        const a = clamp((r + MS * 0.5 - Math.sqrt(dx * dx + dy * dy)) / MS, 0, 1);
        if (a > 0) stamp(gx, gy, op.o.tone * a);
      }
    } else {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const r of ringsOf(op.poly)) for (const q of r) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      const gx0 = Math.max(0, Math.floor(x0 / MS)), gx1 = Math.min(MW - 1, Math.floor(x1 / MS));
      const gy0 = Math.max(0, Math.floor(y0 / MS)), gy1 = Math.min(MH - 1, Math.floor(y1 / MS));
      const f = op.o.fade;
      const fdx = f ? f.x1 - f.x0 : 0, fdy = f ? f.y1 - f.y0 : 0, fl2 = fdx * fdx + fdy * fdy;
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const X = (gx + 0.5) * MS, Y = (gy + 0.5) * MS;
        if (!inPoly(op.poly, X, Y)) continue;
        let t = op.o.tone;
        if (fl2 > 0) t *= 1 + ((f.to || 0) - 1) * smooth(((X - f.x0) * fdx + (Y - f.y0) * fdy) / fl2);
        stamp(gx, gy, t);
      }
    }
  }
  // the ink map after ops[0 .. upTo), and each op's added ink (in painting px, tone-weighted)
  function inkMap(ops, upTo) {
    const m = new Float32Array(MW * MH);
    const added = [];
    const n = upTo == null ? ops.length : upTo;
    for (let i = 0; i < n; i++) {
      const op = ops[i];
      const one = new Map();
      opCover(op, (gx, gy, a) => {
        if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) return;
        const k = gy * MW + gx;
        const prev = one.get(k) || 0;
        if (a > prev) one.set(k, a);
      });
      let add = 0;
      one.forEach((a, k) => { const before = m[k]; m[k] = 1 - (1 - before) * (1 - a); add += m[k] - before; });
      added.push(add * MS * MS * (op.kind === 'wash' ? 0.4 : 1));
    }
    return { m, added };
  }

  /* ---------------- the seal: the emptiest lower corner ---------------- */
  function placeSeal(m, prefer) {
    const s = SEAL, pad = 12;
    let best = null;
    for (const side of [-1, 1]) {
      for (let cx = s / 2 + 22; cx <= 200; cx += 6) {
        for (let cy = H * 0.55; cy <= H - s / 2 - 22; cy += 6) {
          const x = side < 0 ? cx : W - cx;
          let mx = 0, sum = 0, cnt = 0;
          const gx0 = Math.floor((x - s / 2 - pad) / MS), gx1 = Math.floor((x + s / 2 + pad) / MS);
          const gy0 = Math.floor((cy - s / 2 - pad) / MS), gy1 = Math.floor((cy + s / 2 + pad) / MS);
          for (let gy = Math.max(0, gy0 - 8); gy <= Math.min(MH - 1, gy1 + 8); gy++) for (let gx = Math.max(0, gx0 - 8); gx <= Math.min(MW - 1, gx1 + 8); gx++) {
            const v = m[gy * MW + gx];
            if (gx >= gx0 && gx <= gx1 && gy >= gy0 && gy <= gy1) mx = Math.max(mx, v);
            sum += v; cnt++;
          }
          // a painter's seal sits about a seal and a half in from the corner
          const ideal = mhypot((cx - s * 1.25) / W, (cy - (H - s * 1.35)) / H);
          const score = mx * 4 + (sum / cnt) * 1.5 + ideal * 0.6 + (side === prefer ? 0 : 0.08);
          if (!best || score < best.score) best = { x, y: cy, score, over: mx };
        }
      }
    }
    return { x: Math.round(best.x), y: Math.round(best.y), size: s, over: rd(best.over) };
  }

  /* ---------------- rounds ----------------
     Each op carries the phase (1..8) its recipe gave it. Eight rounds take the phases as they
     are; fewer rounds merge the lightest neighbours; more rounds split the heaviest phase at an
     op boundary. A stage never adds nothing. */
  function stagesFor(ops, added, rounds) {
    const groups = [];
    for (let i = 0; i < ops.length; i++) {
      const g = groups[groups.length - 1];
      if (g && g.phase === ops[i].phase) { g.end = i + 1; g.ink += added[i]; }
      else groups.push({ phase: ops[i].phase, start: i, end: i + 1, ink: added[i] });
    }
    let parts = groups.map(g => ({ start: g.start, end: g.end, ink: g.ink }));
    rounds = Math.max(1, Math.min(rounds, ops.length));
    while (parts.length > rounds) {
      let bi = 0, bv = Infinity;
      for (let i = 0; i < parts.length - 1; i++) { const v = parts[i].ink + parts[i + 1].ink; if (v < bv) { bv = v; bi = i; } }
      parts.splice(bi, 2, { start: parts[bi].start, end: parts[bi + 1].end, ink: bv });
    }
    while (parts.length < rounds) {
      let bi = -1, bv = -1;
      for (let i = 0; i < parts.length; i++) if (parts[i].end - parts[i].start > 1 && parts[i].ink > bv) { bv = parts[i].ink; bi = i; }
      if (bi < 0) break;
      const p = parts[bi];
      let acc = 0, cut = p.start + 1;
      for (let i = p.start; i < p.end - 1; i++) { acc += added[i]; cut = i + 1; if (acc >= p.ink / 2) break; }
      parts.splice(bi, 1, { start: p.start, end: cut, ink: acc }, { start: cut, end: p.end, ink: p.ink - acc });
    }
    return parts.map(p => p.end);
  }

  /* ---------------- a painting ---------------- */
  function compose(famId, seed, season, opts) {
    opts = opts || {};
    const fam = BY_ID[famId];
    if (!fam) throw new Error('paintScenes: no family ' + famId);
    const R = Rng(seed);
    const c = makeCtx(R, season);
    c.moon = opts.moon !== undefined ? opts.moon : (Rng(seed ^ 0x5bd1e995).f() < 0.35 ? { age: SYNODIC / 2, d: 0, frac: 1 } : null);
    const mirror = R.chance(0.5);
    const res = fam.fn(c) || {};
    const ops = c.ops.map((op, i) => [op, i]).sort((a, b) => a[0].phase - b[0].phase || a[1] - b[1]).map(x => x[0]);
    if (mirror) mirrorOps(ops);
    const { m, added } = inkMap(ops);
    const prefer = (res.sealSide || -1) * (mirror ? -1 : 1);
    const seal = placeSeal(m, prefer);
    const rounds = opts.rounds || ROUNDS;
    return {
      family: famId, season, caption: res.caption || fam.id, w: W, h: H,
      ops, stages: stagesFor(ops, added, rounds), seal, seed, version: VERSION,
    };
  }

  // Seeds that still made a poor picture after tuning. forDay moves on to the next seed.
  const SKIP = new Set([]);

  function forDay(dateISO, name, opts) {
    opts = opts || {};
    const n = dayNum(dateISO);
    const iso = isoOf(n);
    const key = normName(name);
    const fam = opts.family ? BY_ID[opts.family] : familyFor(n, key);
    let seed = opts.seed != null ? opts.seed >>> 0 : hash32(iso + '|' + key + '|paint');
    for (let k = 0; k < 16 && SKIP.has(seed); k++) seed = hash32('next|' + seed);
    const scene = compose(fam.id, seed, seasonOf(mdOf(n)), Object.assign({}, opts, { moon: moonOn(n) }));
    scene.date = iso;
    scene.name = String(name || '');
    return scene;
  }

  // Run ops[0 .. upTo) into a brush canvas and return the ink. Pass a state object to paint on
  // from where the last call stopped (the game paints one round at a time).
  function paint(scene, upTo, state) {
    const B = D.paintBrush;
    const n = upTo == null ? scene.ops.length : clamp(upTo, 0, scene.ops.length);
    let cv, done = 0;
    if (state && state.cv && state.scene === scene && state.done <= n) { cv = state.cv; done = state.done; }
    else cv = B.canvas(scene.w, scene.h, scene.seed);
    for (let i = done; i < n; i++) {
      const op = scene.ops[i];
      if (op.kind === 'stroke') B.stroke(cv, op.pts, op.o);
      else if (op.kind === 'dab') B.dab(cv, op.x, op.y, op.o);
      else B.wash(cv, op.poly, op.o);
    }
    if (state) { state.cv = cv; state.done = n; state.scene = scene; }
    return B.render(cv);
  }

  return {
    W, H, ROUNDS, SEAL, VERSION,
    families: FAMILIES.map(f => ({ id: f.id, seasons: f.seasons.slice(), windows: f.windows.map(w => w.slice()) })),
    forDay, compose, paint,
    familyFor: (dateISO, name) => familyFor(dayNum(dateISO), normName(name)).id,
    seasonFor: dateISO => seasonOf(mdOf(dayNum(dateISO))),
    moonFor: dateISO => moonOn(dayNum(dateISO)),
    // for the sheet harness
    _dev: { inkMap, placeSeal, stagesFor, hash32, dayNum, isoOf, mdOf, SKIP, MS, MW, MH, activeOn, math: { msin, mcos, mexp, mln, mpow, matan2, mhypot } },
  };
})();
