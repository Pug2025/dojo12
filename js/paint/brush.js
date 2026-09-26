/* Dojo 12 — the icon's brush, in JavaScript: D.paintBrush (art/paint/brush.js).

   The app icon's ensō was painted by art/blender/inkpaper.py and the image kit by
   art/kit/brush/brushkit.py, the same model with the path passed in: hundreds of hairs travel
   the stroke, the ink runs dry across the whole brush at once, groups of hairs lift off and
   leave white streaks to the end, and wet ink wicks a soft grey fringe along the paper's
   fibres. This file is that model, sized for a phone. The hairs are counted by the stroke's
   width, the paper is a small seeded tile made the way inkpaper.py makes the icon's washi,
   the FFT blurs are box passes, and each stroke is finished inside its own box and laid over
   the ink already on the sheet. It adds a dab (one press: leaf, petal, round, dot) and a wash
   (a diluted area with a drying edge).

   Classic script: no import, no DOM, no Math.random, and no Math.sin, exp or log either. Every
   number comes from + - * / and sqrt, which every JS engine rounds the same way, so the same
   calls give the same bytes in node, Chrome and Safari. README-brush.md has the API, every
   option, and what was simplified from brushkit.py and why. */
"use strict";
if (typeof D === "undefined") (typeof window !== "undefined" ? window : globalThis).D = {};

D.paintBrush = (function () {
  /* ======================= numbers: the same bits everywhere ======================= */
  const PI = 3.141592653589793, TAU = 6.283185307179586, HALF_PI = 1.5707963267948966;
  const LN2 = 0.6931471805599453, LN2_HI = 0.6931471803691238, LN2_LO = 1.9082149292705877e-10;
  const LOG2E = 1.4426950408889634;
  const POW2 = new Float64Array(2046);                 // 2^(i - 1022), by exact doubling
  {
    let p = 1;
    for (let k = 0; k <= 1023; k++) { POW2[1022 + k] = p; p *= 2; }
    p = 1;
    for (let k = 1; k <= 1022; k++) { p *= 0.5; POW2[1022 - k] = p; }
  }
  function exp(x) {
    if (x < -708) return 0;
    if (x > 709) return Infinity;
    const k = Math.floor(x * LOG2E + 0.5);
    const r = (x - k * LN2_HI) - k * LN2_LO;                // |r| <= 0.347
    const p = 1 + r * (1 + r * (0.5 + r * (0.16666666666666666 + r * (0.041666666666666664 +
      r * (0.008333333333333333 + r * (0.001388888888888889 + r * (0.0001984126984126984 +
      r * (0.0000248015873015873 + r * (0.0000027557319223985893 + r * 2.755731922398589e-7)))))))));
    return p * POW2[k + 1022];
  }
  function sin(x) {
    x -= Math.floor(x / TAU + 0.5) * TAU;
    if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
    const z = x * x;
    return x * (1 + z * (-0.16666666666666666 + z * (0.008333333333333333 + z * (-0.0001984126984126984 +
      z * (0.0000027557319223985893 + z * (-2.505210838544172e-8 + z * 1.6059043836821613e-10))))));
  }
  function cos(x) { return sin(x + HALF_PI); }
  function ln(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN;
    if (x === Infinity) return x;
    let e = 0;
    while (x >= 4294967296) { x *= 2.3283064365386963e-10; e += 32; }
    while (x < 2.3283064365386963e-10) { x *= 4294967296; e -= 32; }
    while (x >= 2) { x *= 0.5; e++; }
    while (x < 1) { x *= 2; e--; }
    if (x > 1.4142135623730951) { x *= 0.5; e++; }
    const z = (x - 1) / (x + 1), q = z * z;
    return 2 * z * (1 + q * (0.3333333333333333 + q * (0.2 + q * (0.14285714285714285 + q * (0.1111111111111111 +
      q * (0.09090909090909091 + q * (0.07692307692307693 + q * 0.06666666666666667))))))) + e * LN2;
  }
  function pow(x, y) { return x <= 0 ? (x === 0 && y > 0 ? 0 : NaN) : exp(y * ln(x)); }
  function tanh(x) { if (x > 19) return 1; if (x < -19) return -1; const e = exp(2 * x); return (e - 1) / (e + 1); }
  function sstep(e0, e1, x) { const t = (x - e0) / (e1 - e0); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function num(v, d) { return typeof v === "number" && v === v && v !== Infinity && v !== -Infinity ? v : d; }
  function now() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }

  /* ======================= seeds ======================= */
  function hash32(v) {
    const s = String(v);
    let h = 0x811c9dc5 | 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function core32(seed) {                                // sfc32
    let a = seed | 0, b = 0x9E3779B9 | 0, c = 0x243F6A88 | 0, d = (seed ^ 0x5BD1E995) | 0;
    function u32() {
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
      return t >>> 0;
    }
    for (let i = 0; i < 16; i++) u32();
    return u32;
  }
  // 4096 normal deviates (Box-Muller with the functions above), standardised: n() picks one
  const NORM = new Float64Array(4096);
  {
    const u = core32(0x2545F491);
    for (let i = 0; i < 4096; i += 2) {
      const m = Math.sqrt(-2 * ln((u() + 0.5) / 4294967296)), a = TAU * (u() / 4294967296);
      NORM[i] = m * cos(a); NORM[i + 1] = m * sin(a);
    }
    let s = 0, s2 = 0;
    for (let i = 0; i < 4096; i++) s += NORM[i];
    s /= 4096;
    for (let i = 0; i < 4096; i++) { NORM[i] -= s; s2 += NORM[i] * NORM[i]; }
    s2 = 1 / Math.sqrt(s2 / 4096);
    for (let i = 0; i < 4096; i++) NORM[i] *= s2;
  }
  function Rng(seed) {
    const u32 = core32(seed);
    return {
      u: function () { return u32() / 4294967296; },
      n: function () { return NORM[u32() >>> 20]; },
    };
  }

  /* ======================= scratch and blurs ======================= */
  const SCR = {};
  function f32(name, n) { let a = SCR[name]; if (!a || a.length < n) a = SCR[name] = new Float32Array(Math.max(n, 4096)); return a; }
  function f64(name, n) { let a = SCR[name]; if (!a || a.length < n) a = SCR[name] = new Float64Array(Math.max(n, 4096)); return a; }

  // Three box passes that add up to a Gaussian of this sigma (Kutskir's widths).
  function boxRadii(sigma) {
    const wI = Math.sqrt(4 * sigma * sigma + 1);
    let wl = Math.floor(wI); if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    return [0 < m ? (wl - 1) / 2 : (wu - 1) / 2, 1 < m ? (wl - 1) / 2 : (wu - 1) / 2, 2 < m ? (wl - 1) / 2 : (wu - 1) / 2];
  }
  function copyN(src, dst, n) { for (let i = 0; i < n; i++) dst[i] = src[i]; }
  function rowPass(src, dst, W, H, r, wrap) {
    if (wrap && r > (W - 1) >> 1) r = (W - 1) >> 1;
    if (r <= 0) { copyN(src, dst, W * H); return; }
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let s = 0;
      if (wrap) {
        for (let k = -r; k <= r; k++) s += src[o + (k < 0 ? k + W : k)];
        for (let x = 0; x < W; x++) {
          dst[o + x] = s * inv;
          let xa = x + r + 1; if (xa >= W) xa -= W;
          let xs = x - r; if (xs < 0) xs += W;
          s += src[o + xa] - src[o + xs];
        }
      } else {
        const lim = r < W ? r : W - 1;
        for (let k = 0; k <= lim; k++) s += src[o + k];
        for (let x = 0; x < W; x++) {
          dst[o + x] = s * inv;
          const xa = x + r + 1, xs = x - r;
          if (xa < W) s += src[o + xa];
          if (xs >= 0) s -= src[o + xs];
        }
      }
    }
  }
  function colPass(src, dst, W, H, r, wrap) {
    if (wrap && r > (H - 1) >> 1) r = (H - 1) >> 1;
    if (r <= 0) { copyN(src, dst, W * H); return; }
    const inv = 1 / (2 * r + 1), acc = f64("colAcc", W);
    for (let x = 0; x < W; x++) acc[x] = 0;
    if (wrap) {
      for (let k = -r; k <= r; k++) { const o = (k < 0 ? k + H : k) * W; for (let x = 0; x < W; x++) acc[x] += src[o + x]; }
      for (let y = 0; y < H; y++) {
        const o = y * W;
        let ya = y + r + 1; if (ya >= H) ya -= H;
        let ys = y - r; if (ys < 0) ys += H;
        const oa = ya * W, os = ys * W;
        for (let x = 0; x < W; x++) { dst[o + x] = acc[x] * inv; acc[x] += src[oa + x] - src[os + x]; }
      }
    } else {
      const lim = r < H ? r : H - 1;
      for (let k = 0; k <= lim; k++) { const o = k * W; for (let x = 0; x < W; x++) acc[x] += src[o + x]; }
      for (let y = 0; y < H; y++) {
        const o = y * W, ya = y + r + 1, ys = y - r;
        if (ya < H && ys >= 0) {                       // one sweep where the window is inside
          const oa = ya * W, os = ys * W;
          for (let x = 0; x < W; x++) { const v = acc[x]; dst[o + x] = v * inv; acc[x] = v + src[oa + x] - src[os + x]; }
          continue;
        }
        for (let x = 0; x < W; x++) dst[o + x] = acc[x] * inv;
        if (ya < H) { const oa = ya * W; for (let x = 0; x < W; x++) acc[x] += src[oa + x]; }
        if (ys >= 0) { const os = ys * W; for (let x = 0; x < W; x++) acc[x] -= src[os + x]; }
      }
    }
  }
  // Gaussian blur in place (Float32Array): three taps below sigma 0.7, else three box passes each way.
  function gblur(a, W, H, sigma, wrap) {
    if (!(sigma > 0.2)) return;
    const tmp = f32("blurTmp", W * H);
    if (sigma < 0.7) {
      const g = exp(-0.5 / (sigma * sigma)), w0 = 1 / (1 + 2 * g), w1 = g * w0;
      for (let y = 0; y < H; y++) {
        const o = y * W;
        for (let x = 0; x < W; x++) {
          const l = x > 0 ? a[o + x - 1] : (wrap ? a[o + W - 1] : 0);
          const r = x < W - 1 ? a[o + x + 1] : (wrap ? a[o] : 0);
          tmp[o + x] = w0 * a[o + x] + w1 * (l + r);
        }
      }
      for (let y = 0; y < H; y++) {
        const o = y * W, ou = y > 0 ? o - W : (wrap ? (H - 1) * W : -1), od = y < H - 1 ? o + W : (wrap ? 0 : -1);
        for (let x = 0; x < W; x++) a[o + x] = w0 * tmp[o + x] + w1 * ((ou >= 0 ? tmp[ou + x] : 0) + (od >= 0 ? tmp[od + x] : 0));
      }
      return;
    }
    const r = boxRadii(sigma);
    rowPass(a, tmp, W, H, r[0], wrap); rowPass(tmp, a, W, H, r[1], wrap); rowPass(a, tmp, W, H, r[2], wrap);
    colPass(tmp, a, W, H, r[0], wrap); colPass(a, tmp, W, H, r[1], wrap); colPass(tmp, a, W, H, r[2], wrap);
  }

  /* ======================= the paper (inkpaper.make_paper, at canvas scale) ======================= */
  // Zero-mean, unit-std noise with features between lo and hi px: white noise blurred octave by
  // octave, each band weighted so the spectrum falls as f^-beta (inkpaper.band_noise, no FFT).
  function bandNoise(W, H, lo, hi, beta, r, wrap) {
    const N = W * H, out = new Float32Array(N), cur = new Float32Array(N), nxt = new Float32Array(N);
    for (let i = 0; i < N; i++) cur[i] = r.u() - 0.5;
    let s = 0.225 * lo;                                  // exp(-(f lo)^2) is a Gaussian of 0.225 lo
    if (s > 0.3) gblur(cur, W, H, s, wrap); else s = 0.3;
    const top = 0.225 * hi;
    do {
      const s2 = s * 2;
      nxt.set(cur);
      gblur(nxt, W, H, Math.sqrt(s2 * s2 - s * s), wrap);
      const c = pow(s, beta / 2);
      for (let i = 0; i < N; i++) out[i] += c * (cur[i] - nxt[i]);
      cur.set(nxt);
      s = s2;
    } while (s < top);
    let m = 0, v = 0;
    for (let i = 0; i < N; i++) m += out[i];
    m /= N;
    for (let i = 0; i < N; i++) { const d = out[i] - m; v += d * d; }
    const k = 1 / (Math.sqrt(v / N) + 1e-9);
    for (let i = 0; i < N; i++) out[i] = (out[i] - m) * k;
    return out;
  }
  // n kozo fibres on a wrapping tile: long wavy strands whose bend drifts, tapered at both ends.
  // Lengths and bend are inkpaper's, in texture px; a step is S canvas px.
  function fibres(T, n, lenLo, lenHi, bend, S, r) {
    const M = T - 1, acc = new Float32Array(T * T);
    for (let f = 0; f < n; f++) {
      const L = lenLo + (lenHi - lenLo) * r.u();
      let x = r.u() * T, y = r.u() * T;
      const a0 = TAU * r.u();
      let c = cos(a0), s = sin(a0), kap = 4 * bend * r.n();
      const wgt = exp(0.6 * r.n()) * S, steps = Math.ceil(L);
      const tc = cos(PI / L), tsn = sin(PI / L);          // the taper's sine, turned a step at a time
      let ts = 0, tcs = 1;
      for (let k = 0; k < steps; k++) {
        if (k > 0) kap = 0.97 * kap + bend * r.n();
        const k2 = kap * kap, ck = 1 - 0.5 * k2, sk = kap * (1 - k2 * 0.16666666666666666);
        const c2 = c * ck - s * sk; s = s * ck + c * sk; c = c2;
        x += c * S; y += s * S;
        const sn = ts, w = Math.sqrt(sn > 0 ? sn : 0) * wgt;
        const ts2 = ts * tc + tcs * tsn; tcs = tcs * tc - ts * tsn; ts = ts2;
        const X = x - 0.5, Y = y - 0.5, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
        const x0 = xi & M, x1 = (xi + 1) & M, y0 = (yi & M) * T, y1 = ((yi + 1) & M) * T;
        acc[y0 + x0] += w * (1 - fx) * (1 - fy); acc[y0 + x1] += w * fx * (1 - fy);
        acc[y1 + x0] += w * (1 - fx) * fy; acc[y1 + x1] += w * fx * fy;
      }
    }
    return acc;
  }
  function sortedSample(a, step) {
    const m = Math.floor((a.length - 1) / step) + 1, s = new Float32Array(m);
    for (let i = 0, j = 0; i < m; i++, j += step) s[i] = a[j];
    s.sort();
    return s;
  }
  function norm01(a, lo, hi) {
    const s = sortedSample(a, 7), m = s.length - 1;
    const p0 = s[Math.round(m * lo / 100)], p1 = s[Math.round(m * hi / 100)], k = 1 / (p1 - p0 + 1e-9);
    for (let i = 0; i < a.length; i++) { const v = (a[i] - p0) * k; a[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
  }
  // rank-normalise to a flat 0..1 histogram, so a threshold means "this share of the paper"
  function equalize(a) {
    const N = a.length, NB = 4096, hist = new Float64Array(NB), cdf = new Float64Array(NB + 1);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const k = NB / (hi - lo + 1e-12);
    for (let i = 0; i < N; i++) { let b = Math.floor((a[i] - lo) * k); if (b >= NB) b = NB - 1; hist[b]++; }
    for (let b = 0; b < NB; b++) cdf[b + 1] = cdf[b] + hist[b] / N;
    for (let i = 0; i < N; i++) {
      const f = (a[i] - lo) * k; let b = Math.floor(f); if (b >= NB) b = NB - 1;
      a[i] = cdf[b] + (f - b) * (cdf[b + 1] - cdf[b]);
    }
  }
  function lowres(fl, fw, fh, q, x, y) {                // bilinear read of a quarter-size field
    const gx = (x + 0.5) / q - 0.5, gy = (y + 0.5) / q - 0.5;
    let ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    let ix1 = ix + 1, iy1 = iy + 1;
    if (ix < 0) ix = 0; if (iy < 0) iy = 0; if (ix1 > fw - 1) ix1 = fw - 1; if (iy1 > fh - 1) iy1 = fh - 1;
    const a = fl[iy * fw + ix], b = fl[iy * fw + ix1], c = fl[iy1 * fw + ix], d = fl[iy1 * fw + ix1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function makePaper(cv) {
    const S = cv.scale, W = cv.w, H = cv.h, T = 256, M = T - 1;
    const r = Rng(hash32("washi|" + cv.seed));
    const fine = bandNoise(T, T, 1.5 * S, 14 * S, 1.0, r, true);
    const area = (T * T) / (S * S * 4096 * 3072);        // this tile's share of the icon's sheet
    const fibF = fibres(T, Math.max(1, Math.round(60000 * area)), 80, 340, 0.0022, S, r);
    norm01(fibF, 0.5, 99.5);
    const fibB = fibres(T, Math.max(1, Math.round(5000 * area)), 200, 800, 0.0015, S, r);
    norm01(fibB, 1, 99.8);
    const fibre = new Float32Array(T * T);
    for (let i = 0; i < T * T; i++) { const v = 0.5 * fibF[i] + 0.8 * fibB[i]; fibre[i] = v > 1 ? 1 : v; }
    const soft = fibre.slice();
    gblur(soft, T, T, Math.max(0.25, 1.0 * S), true);
    // the formation (cloudy thick and thin) and a slow warp that keeps the tile from repeating,
    // over the whole sheet at a quarter size
    const q = 4, fw = Math.ceil(W / q) + 2, fh = Math.ceil(H / q) + 2;
    const fl = bandNoise(fw, fh, 18 * S / q, 420 * S / q, 2.2, r, true);
    for (let i = 0; i < fl.length; i++) fl[i] = 0.5 + 0.5 * tanh(0.8 * fl[i]);
    const wx = bandNoise(fw, fh, 240 / q, 900 / q, 2.0, r, true), wy = bandNoise(fw, fh, 240 / q, 900 / q, 2.0, r, true);
    const form = new Float32Array(W * H), tooth = new Float32Array(W * H), absorb = new Float32Array(W * H);
    const grain = new Float32Array(W * H), tb = new Float32Array(W * H);
    let tlo = Infinity, thi = -Infinity;
    // the quarter-size fields, read bilinearly: the x weights once, each row's blend once
    const ix0 = new Int32Array(W), ix1 = new Int32Array(W), fxs = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      const gx = (x + 0.5) / q - 0.5, i = Math.floor(gx);
      fxs[x] = gx - i; ix0[x] = i < 0 ? 0 : i; ix1[x] = i + 1 > fw - 1 ? fw - 1 : i + 1;
    }
    const rf = new Float64Array(fw), rx = new Float64Array(fw), ry = new Float64Array(fw);
    for (let y = 0; y < H; y++) {
      const gy = (y + 0.5) / q - 0.5, iy = Math.floor(gy), fy = gy - iy;
      const o0 = (iy < 0 ? 0 : iy) * fw, o1 = (iy + 1 > fh - 1 ? fh - 1 : iy + 1) * fw;
      for (let i = 0; i < fw; i++) {
        rf[i] = fl[o0 + i] + (fl[o1 + i] - fl[o0 + i]) * fy;
        rx[i] = wx[o0 + i] + (wx[o1 + i] - wx[o0 + i]) * fy;
        ry[i] = wy[o0 + i] + (wy[o1 + i] - wy[o0 + i]) * fy;
      }
      for (let x = 0; x < W; x++) {
        const a0 = ix0[x], a1 = ix1[x], u = fxs[x];
        const p = y * W + x, f = rf[a0] + (rf[a1] - rf[a0]) * u;
        const ux = Math.floor(x + 12 * (rx[a0] + (rx[a1] - rx[a0]) * u)), uy = Math.floor(y + 12 * (ry[a0] + (ry[a1] - ry[a0]) * u));
        const ti = (uy & M) * T + (ux & M);
        form[p] = f;
        grain[p] = fibre[ti];
        const b = 0.55 * fibre[ti] + 0.15 * f;
        tb[p] = b;
        if (b < tlo) tlo = b; if (b > thi) thi = b;
        tooth[p] = b + 0.30 * fine[ti];
        absorb[p] = (0.75 + 0.5 * soft[ti]) * (0.85 + 0.3 * f);
      }
    }
    equalize(tooth);
    // What a hair meets: inkpaper's tooth is equalize(0.55 fibre + 0.30 fine + 0.15 form), and its
    // fine grain (1.5..14 texture px) is finer than a pixel here. So a hair reads the fibres and
    // the formation from the sheet and draws the grain afresh for each spot it crosses (a spot is
    // 1.5 texture px, the grain's own size); this table equalizes that sum exactly.
    const NB = 1024, lo = tlo - 1.35, hi = thi + 1.35, bw = (hi - lo) / NB;
    const hist = new Float64Array(NB), conv = new Float64Array(NB), tq = new Float64Array(NB + 1);
    for (let i = 0; i < W * H; i++) { let b = Math.floor((tb[i] - lo) / bw); if (b >= NB) b = NB - 1; hist[b]++; }
    const sg = 0.3 / bw, kr = Math.ceil(4.5 * sg), ker = new Float64Array(2 * kr + 1);
    let ks = 0;
    for (let k = -kr; k <= kr; k++) { ker[k + kr] = exp(-0.5 * (k / sg) * (k / sg)); ks += ker[k + kr]; }
    for (let b = 0; b < NB; b++) {
      if (hist[b] === 0) continue;
      const hb = hist[b] / ks;
      for (let k = -kr; k <= kr; k++) { const c = b + k; if (c >= 0 && c < NB) conv[c] += hb * ker[k + kr]; }
    }
    let tot = 0;
    for (let b = 0; b < NB; b++) tot += conv[b];
    for (let b = 0; b < NB; b++) tq[b + 1] = tq[b] + conv[b] / tot;
    cv.form = form; cv.tooth = tooth; cv.absorb = absorb; cv.fibre = grain;
    cv.tb = tb; cv.tq = tq; cv.tqLo = lo; cv.tqK = 1 / bw; cv.cellK = 1 / (1.5 * S);
  }

  /* ======================= public: the sheet ======================= */
  function canvas(w, h, seed, o) {
    o = o || {};
    const t0 = now();
    w = Math.max(1, Math.floor(num(w, 1))); h = Math.max(1, Math.floor(num(h, 1)));
    const cv = {
      w: w, h: h, seed: hash32(seed === undefined ? 0 : seed), scale: clamp(num(o.scale, 0.42), 0.1, 2),
      ink: new Float32Array(w * h), damp: null, dampAt: null, dampHalf: Math.max(1, num(o.dampHalf, 12)),
      clock: 0, ms: { paper: 0, stroke: 0, dab: 0, wash: 0 }, counts: { stroke: 0, dab: 0, wash: 0, hairSamples: 0 },
      tooth: null, absorb: null, form: null, fibre: null,
    };
    makePaper(cv);
    cv.ms.paper = now() - t0;
    return cv;
  }

  /* ======================= the brush (brushkit.paint) ======================= */
  // The icon's stroke runs 5018 texture px (t 0..1) from a head whose half-width R peaks at
  // 167.6 px. brushkit gives the head and tail in t; here they are multiples of R, so a small
  // brush has a small head. The waves and the edges' waver keep brushkit's lengths on the paper
  // (bars.py: wave_scale = L / the icon's length; noise1d over 24 and 161 texture px), and a hair
  // lands and lifts over brushkit's fixed share of the stroke.
  const HEAD_R = 1.048, JAG = 0.0429, HAIRJ = 0.0229, TAIL_R = 1.497, TAILK_R = 0.898;
  const ICON_L = 5018, EDGE_F = 24.2, EDGE_C = 161.4;
  const ICON = {
    onset_side: 0.10, onset_spread: 0.12, onset_clump: 0.04, onset_edge: 0.0, hair_thr: 0.04,
    squeeze_from: 0.55, squeeze: 0.25, hair_wander: 0.012, clump_wander: 0.03, lift_amp: 0.15,
    edge_fine: 0.012, edge_coarse: 0.02, bleed: 0.9, bleed_near: 0.8, bleed_far: 0.6, blur: 0,
    soften: 1.2, wet_scale: 1,
  };
  function iconWet(t) { return t < 0.04 ? 1 : 0.25 + 0.75 * exp(-(t - 0.04) / 0.28); }

  // Options (tone, load, wet, head, tail, hairs) and the stroke's size -> the model's numbers.
  function params(cv, R, L, o, extra) {
    const S = cv.scale, rl = R / L, q = {};
    for (const k in ICON) q[k] = ICON[k];
    // the icon's brush: 900 hairs across 335 texture px, 2.69 to the texture px
    const hairs = clamp(num(o.hairs, 2.69 / S), 0.5, 16);
    q.B = clamp(Math.round(hairs * 2 * R), 12, 900);
    q.G = clamp(Math.round(2 * R / (7.6 * S)), 3, 45);
    q.K = clamp(Math.round(q.G / 5), 2, 9);
    q.onset = -0.2 + 1.4 * o.load;                      // load 0.5: the icon, dry from mid-stroke
    q.span0 = 0.2 * (0.5 + o.load); q.span1 = 0.5 * (0.5 + o.load);
    q.head = Math.min(HEAD_R * o.head * rl, 0.6);
    q.head_jag = JAG * q.head; q.head_hair = Math.max(HAIRJ * q.head, 0.08 * rl);
    let tf = 0.6;
    if (o.tail === "dry") { tf = 1; q.onset = Math.min(q.onset, 0.72); }
    else if (o.tail === "blunt") tf = 0.15;
    q.tail = Math.min(TAIL_R * tf * rl, 0.3); q.tail_clump = Math.min(TAILK_R * tf * rl, 0.2);
    q.blunt = o.tail === "blunt" ? Math.min(0.45 * rl, 0.25) : 0;
    q.ramp_a = 0.0004; q.ramp_b = 0.0008; q.ramp_t = 0.012;
    q.wave_scale = clamp(L / (ICON_L * S), 0.005, 20);
    q.edge_fine_px = EDGE_F * S; q.edge_coarse_px = EDGE_C * S;
    q.drag = 6 * S; q.sig_near = 3 * S; q.sig_far = 10 * S;
    q.wet = o.wet;
    if (extra) for (const k in extra) q[k] = extra[k];
    if (o.brush) for (const k in o.brush) q[k] = o.brush[k];
    q.B = Math.max(2, Math.round(q.B)); q.G = Math.max(1, Math.round(q.G)); q.K = Math.max(1, Math.round(q.K));
    // coverage per hair: the icon's hairs lie 2.69 to the texture px and cover 1 - exp(-2 A)
    if (!(o.brush && "cov" in o.brush)) q.cov = 10.76 * R / q.B;
    return q;
  }

  // The centre line: a centripetal Catmull-Rom spline through the points, resampled at an even
  // step small enough that the outer hairs never jump more than about 0.6 px.
  // A thin stroke is painted on a finer grid (2 or 3 to the pixel) and reduced, as the kit's
  // masks are painted at the texture's size and reduced: at one sample a pixel a hairline would
  // spread over two pixels at full strength.
  function fineness(R) { return R < 1.5 ? 3 : R < 6 ? 2 : 1; }
  function centreLine(pts, ssOpt) {
    const X = [], Y = [], Wd = [];
    for (let i = 0; i < (pts ? pts.length : 0); i++) {
      const p = pts[i];
      if (!p) continue;
      const x = +p.x, y = +p.y;
      let w = +p.w;
      if (!(x === x && y === y && Math.abs(x) < 1e7 && Math.abs(y) < 1e7)) continue;
      if (!(w >= 0)) w = 0;
      const m = X.length;
      if (m && Math.abs(x - X[m - 1]) < 1e-6 && Math.abs(y - Y[m - 1]) < 1e-6) { if (w > Wd[m - 1]) Wd[m - 1] = w; continue; }
      X.push(x); Y.push(y); Wd.push(w);
    }
    const m = X.length;
    if (m < 2) return null;
    let R = 0;
    for (let i = 0; i < m; i++) if (Wd[i] > R) R = Wd[i];
    if (R < 0.35) R = 0.35;
    const dx = [], dy = [], dw = [];
    for (let i = 0; i < m - 1; i++) {
      const x1 = X[i], y1 = Y[i], x2 = X[i + 1], y2 = Y[i + 1];
      const x0 = i > 0 ? X[i - 1] : 2 * x1 - x2, y0 = i > 0 ? Y[i - 1] : 2 * y1 - y2;
      const x3 = i + 2 < m ? X[i + 2] : 2 * x2 - x1, y3 = i + 2 < m ? Y[i + 2] : 2 * y2 - y1;
      const w0 = Wd[i > 0 ? i - 1 : 0], w1 = Wd[i], w2 = Wd[i + 1], w3 = Wd[i + 2 < m ? i + 2 : m - 1];
      const d01 = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      const d12 = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
      const d23 = Math.sqrt((x3 - x2) * (x3 - x2) + (y3 - y2) * (y3 - y2));
      const k0 = 0, k1 = Math.sqrt(Math.max(d01, 1e-9)), k2 = k1 + Math.sqrt(Math.max(d12, 1e-9)), k3 = k2 + Math.sqrt(Math.max(d23, 1e-9));
      const cnt = Math.max(1, Math.ceil(d12 / 0.25)), last = i === m - 2;
      for (let j = 0; j < cnt + (last ? 1 : 0); j++) {
        const s = j / cnt, k = k1 + (k2 - k1) * s;
        const a1x = ((k1 - k) * x0 + (k - k0) * x1) / (k1 - k0), a1y = ((k1 - k) * y0 + (k - k0) * y1) / (k1 - k0);
        const a2x = ((k2 - k) * x1 + (k - k1) * x2) / (k2 - k1), a2y = ((k2 - k) * y1 + (k - k1) * y2) / (k2 - k1);
        const a3x = ((k3 - k) * x2 + (k - k2) * x3) / (k3 - k2), a3y = ((k3 - k) * y2 + (k - k2) * y3) / (k3 - k2);
        const b1x = ((k2 - k) * a1x + (k - k0) * a2x) / (k2 - k0), b1y = ((k2 - k) * a1y + (k - k0) * a2y) / (k2 - k0);
        const b2x = ((k3 - k) * a2x + (k - k1) * a3x) / (k3 - k1), b2y = ((k3 - k) * a2y + (k - k1) * a3y) / (k3 - k1);
        dx.push(((k2 - k) * b1x + (k - k1) * b2x) / (k2 - k1));
        dy.push(((k2 - k) * b1y + (k - k1) * b2y) / (k2 - k1));
        const w = 0.5 * (2 * w1 + (w2 - w0) * s + (2 * w0 - 5 * w1 + 4 * w2 - w3) * s * s + (3 * w1 - w0 - 3 * w2 + w3) * s * s * s);
        dw.push(w > 0 ? w : 0);
      }
    }
    const nd = dx.length, cum = new Float64Array(nd);
    for (let i = 1; i < nd; i++) cum[i] = cum[i - 1] + Math.sqrt((dx[i] - dx[i - 1]) * (dx[i] - dx[i - 1]) + (dy[i] - dy[i - 1]) * (dy[i] - dy[i - 1]));
    const L = cum[nd - 1];
    if (!(L > 0.05)) return null;
    function resample(h0) {
      const N = Math.max(3, Math.ceil(L / h0) + 1), h = L / (N - 1);
      const x = new Float64Array(N), y = new Float64Array(N), w = new Float64Array(N);
      let seg = 0;
      for (let i = 0; i < N; i++) {
        const s = i === N - 1 ? L : i * h;
        while (seg < nd - 2 && cum[seg + 1] < s) seg++;
        const span = cum[seg + 1] - cum[seg], f = span > 0 ? clamp((s - cum[seg]) / span, 0, 1) : 0;
        x[i] = dx[seg] + (dx[seg + 1] - dx[seg]) * f; y[i] = dy[seg] + (dy[seg + 1] - dy[seg]) * f;
        w[i] = dw[seg] + (dw[seg + 1] - dw[seg]) * f;
      }
      const tx = new Float64Array(N), ty = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const a = i - 2 < 0 ? 0 : i - 2, b = i + 2 > N - 1 ? N - 1 : i + 2;
        let ex = x[b] - x[a], ey = y[b] - y[a], el = Math.sqrt(ex * ex + ey * ey);
        if (el < 1e-12) { ex = i > 0 ? tx[i - 1] : 1; ey = i > 0 ? ty[i - 1] : 0; el = 1; }
        tx[i] = ex / el; ty[i] = ey / el;
      }
      return { n: N, h: h, x: x, y: y, w: w, tx: tx, ty: ty };
    }
    const ss = ssOpt >= 1 && ssOpt <= 4 ? Math.round(ssOpt) : fineness(R);
    let P = resample(0.5 / ss);
    // how fast the outer hairs move per step: curvature and the change of width
    let worst = 0;
    const k4 = Math.max(1, Math.round(2 / P.h));
    for (let i = k4; i < P.n - k4; i++) {
      const cx = P.tx[i + k4] - P.tx[i - k4], cy = P.ty[i + k4] - P.ty[i - k4];
      const kap = Math.sqrt(cx * cx + cy * cy) / (2 * k4 * P.h);
      const dwv = Math.abs(P.w[i + 1] - P.w[i - 1]) / (2 * P.h);
      const v = R * kap + dwv;
      if (v > worst) worst = v;
    }
    const h = clamp(0.6 / (ss * (1 + worst)), 0.15 / ss, 0.5 / ss);
    if (h < 0.47 / ss) P = resample(h);
    P.L = L; P.R = R; P.ss = ss;
    return P;
  }

  // Samples along the stroke with the head run on backwards along the start's own curve.
  function withHead(base, q, wetOpt) {
    const L = base.L, h = base.h, N = base.n, R = base.R;
    const headLen = (q.head + q.head_jag + q.head_hair + q.ramp_a) * L * 1.05 + 2 * h;
    const NH = Math.max(1, Math.ceil(headLen / h));
    const n = NH + N;
    const t = new Float64Array(n), cx = new Float64Array(n), cy = new Float64Array(n);
    const nx = new Float64Array(n), ny = new Float64Array(n), hw = new Float64Array(n), wet = new Float64Array(n);
    const tx0 = base.tx[0], ty0 = base.ty[0], nx0 = ty0, ny0 = -tx0;
    const j = Math.min(N - 1, Math.max(2, Math.round(Math.min(L / 3, Math.max(2 * R, 4)) / h)));
    let kap = ((base.tx[j] - tx0) * nx0 + (base.ty[j] - ty0) * ny0) / (j * h);
    const kmax = 0.5 / Math.max(headLen, 1);
    kap = clamp(kap, -kmax, kmax);
    for (let i = 0; i < NH; i++) {
      const s = -(NH - i) * h;
      cx[i] = base.x[0] + tx0 * s + nx0 * kap * s * s / 2;
      cy[i] = base.y[0] + ty0 * s + ny0 * kap * s * s / 2;
      let ex = nx0 - tx0 * kap * s, ey = ny0 - ty0 * kap * s;
      const el = Math.sqrt(ex * ex + ey * ey); ex /= el; ey /= el;
      nx[i] = ex; ny[i] = ey; hw[i] = base.w[0]; t[i] = s / L;
    }
    for (let i = 0; i < N; i++) {
      const k = NH + i;
      cx[k] = base.x[i]; cy[k] = base.y[i]; nx[k] = base.ty[i]; ny[k] = -base.tx[i]; hw[k] = base.w[i];
      t[k] = i === N - 1 ? 1 : (i * h) / L;
    }
    const ws = q.wet_scale;
    for (let i = 0; i < n; i++) wet[i] = wetOpt * iconWet(t[i] * ws);
    return { n: n, t: t, t0: t[0], dt: h / L, cx: cx, cy: cy, nx: nx, ny: ny, hw: hw, wet: wet, h: h, L: L, R: R, ss: base.ss };
  }

  function sortedCuts(n, r) { const a = new Float64Array(Math.max(0, n)); for (let i = 0; i < a.length; i++) a[i] = 2 * r.u() - 1; a.sort(); return a; }
  function assign(u0, cuts, out) {                      // np.searchsorted(cuts, u0)
    let c = 0;
    for (let j = 0; j < u0.length; j++) { while (c < cuts.length && cuts[c] < u0[j]) c++; out[j] = c; }
  }
  function means(u0, idx, n) {
    const s = new Float64Array(n), c = new Float64Array(n);
    for (let j = 0; j < u0.length; j++) { s[idx[j]] += u0[j]; c[idx[j]]++; }
    for (let k = 0; k < n; k++) s[k] = c[k] > 0 ? s[k] / c[k] : 0;
    return s;
  }
  // three sines with random frequency, phase and weight, summed and scaled, along the stroke
  function sines3(out, off, n, t0, dt, fr, ph, am, b, scale) {
    let s1 = sin(TAU * fr[b] * t0 + ph[b]), c1 = cos(TAU * fr[b] * t0 + ph[b]);
    let s2 = sin(TAU * fr[b + 1] * t0 + ph[b + 1]), c2 = cos(TAU * fr[b + 1] * t0 + ph[b + 1]);
    let s3 = sin(TAU * fr[b + 2] * t0 + ph[b + 2]), c3 = cos(TAU * fr[b + 2] * t0 + ph[b + 2]);
    const e1 = cos(TAU * fr[b] * dt), f1 = sin(TAU * fr[b] * dt);
    const e2 = cos(TAU * fr[b + 1] * dt), f2 = sin(TAU * fr[b + 1] * dt);
    const e3 = cos(TAU * fr[b + 2] * dt), f3 = sin(TAU * fr[b + 2] * dt);
    const a1 = am[b] * scale, a2 = am[b + 1] * scale, a3 = am[b + 2] * scale;
    for (let i = 0; i < n; i++) {
      out[off + i] = a1 * s1 + a2 * s2 + a3 * s3;
      let z = s1 * e1 + c1 * f1; c1 = c1 * e1 - s1 * f1; s1 = z;
      z = s2 * e2 + c2 * f2; c2 = c2 * e2 - s2 * f2; s2 = z;
      z = s3 * e3 + c3 * f3; c3 = c3 * e3 - s3 * f3; s3 = z;
    }
  }
  function waveSet(count, lo, hi, ws, r) {
    const f = new Float64Array(count * 3), p = new Float64Array(count * 3), a = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) { f[i] = (lo + (hi - lo) * r.u()) * ws; p[i] = TAU * r.u(); a[i] = 0.5 + 0.5 * r.u(); }
    return { f: f, p: p, a: a };
  }
  // smooth noise along the stroke, unit std, correlated over sig samples (inkpaper.noise1d)
  function noise1d(n, sig, r) {
    // drawn every k samples (a quarter of its correlation) and joined by straight lines
    const st = Math.max(1, Math.floor(sig / 4)), sg = Math.max(1, Math.round(sig / st));
    const nc = Math.ceil((n - 1) / st) + 1, m = nc + 6 * sg + 1, a = new Float32Array(m);
    for (let i = 0; i < m; i++) a[i] = r.n();
    gblur(a, m, 1, sg, false);
    const out = new Float64Array(n);
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const c = i / st, ci = Math.floor(c), f = c - ci, j = 3 * sg + ci;
      out[i] = a[j] + (a[j + 1] - a[j]) * f; s += out[i];
    }
    s /= n;
    for (let i = 0; i < n; i++) { out[i] -= s; s2 += out[i] * out[i]; }
    const k = 1 / (Math.sqrt(s2 / n) + 1e-12);
    for (let i = 0; i < n; i++) out[i] *= k;
    return out;
  }

  // Lay the hairs along the samples and finish the stroke onto the sheet.
  function lay(cv, P, q, tone, seed) {
    const r = Rng(seed);
    const n = P.n, T = P.t, CX = P.cx, CY = P.cy, NX = P.nx, NY = P.ny, HW = P.hw, WT = P.wet;
    const t0 = P.t0, dt = P.dt, B = q.B, K = q.K, G = q.G;
    // the hairs: lateral slot (-1 right edge, +1 left edge of travel), a clump that squeezes
    // together near the end, and a group that runs dry, lifts off and lands together
    const u0 = new Float64Array(B);
    for (let j = 0; j < B; j++) u0[j] = (B > 1 ? -1 + 2 * j / (B - 1) : 0) + r.n() * 0.8 / B;
    u0.sort();
    const clump = new Int32Array(B), grp = new Int32Array(B);
    assign(u0, sortedCuts(K - 1, r), clump);
    assign(u0, sortedCuts(G - 1, r), grp);
    const ck = means(u0, clump, K), ug = means(u0, grp, G);
    const onG = new Float64Array(G), spG = new Float64Array(G), onK = new Float64Array(K);
    for (let g = 0; g < G; g++) onG[g] = q.onset - q.onset_side * ug[g] - q.onset_edge * ug[g] * ug[g] + q.onset_spread * r.n();
    for (let k = 0; k < K; k++) onK[k] = q.onset_clump * r.n();
    for (let g = 0; g < G; g++) spG[g] = q.span0 + (q.span1 - q.span0) * r.u();
    const onset = new Float64Array(B), ispan = new Float64Array(B), hthr = new Float64Array(B);
    for (let j = 0; j < B; j++) { onset[j] = onG[grp[j]] + onK[clump[j]]; ispan[j] = 1 / spG[grp[j]]; hthr[j] = q.hair_thr * r.n(); }
    // the head: round like the brush, leaning so the left side reaches back a little further
    const jag = [r.u(), r.u(), r.u(), r.u(), r.u(), r.u()];
    const tS = new Float64Array(B), tE = new Float64Array(B), tk = new Float64Array(K), sqk = new Float64Array(K);
    for (let k = 0; k < K; k++) { tk[k] = r.u(); sqk[k] = q.squeeze * (0.6 + 0.4 * r.u()); }
    for (let j = 0; j < B; j++) {
      const u = u0[j], c = Math.sqrt(Math.max(0, 1 - u * u));
      const g = clamp((u + 1) * 2.5, 0, 4.999999), gi = Math.floor(g), jg = jag[gi] + (jag[gi + 1] - jag[gi]) * (g - gi);
      tS[j] = -q.head * (0.55 * c + 0.45 * (u + 1) / 2) - q.head_jag * jg - q.head_hair * r.u();
      const a = r.u();
      tE[j] = 1 - q.tail * a * Math.sqrt(a) - q.tail_clump * tk[clump[j]] - q.blunt * (1 - c);
    }
    const ws = q.wave_scale;
    const hwv = waveSet(B, 2, 9, ws, r), cwv = waveSet(K, 1, 4, ws, r), lwv = waveSet(G, 1, 6, ws, r);
    // along the stroke, shared by every hair
    const SQT = new Float64Array(n);
    for (let i = 0; i < n; i++) SQT[i] = sstep(q.squeeze_from, 1, T[i]);
    const CW = new Float64Array(K * n), LIFT = new Float64Array(G * n);
    for (let k = 0; k < K; k++) sines3(CW, k * n, n, t0, dt, cwv.f, cwv.p, cwv.a, k * 3, q.clump_wander / 2);
    for (let g = 0; g < G; g++) {
      sines3(LIFT, g * n, n, t0, dt, lwv.f, lwv.p, lwv.a, g * 3, 0.5);
      for (let i = g * n; i < (g + 1) * n; i++) LIFT[i] = q.lift_amp * tanh(LIFT[i] * 4.25531914893617);
    }
    const nf = noise1d(n, q.edge_fine_px / P.h, r), nc = noise1d(n, q.edge_coarse_px / P.h, r);
    const nf2 = noise1d(n, q.edge_fine_px / P.h, r), nc2 = noise1d(n, q.edge_coarse_px / P.h, r);
    const EI = new Float64Array(n), EO = new Float64Array(n);
    for (let i = 0; i < n; i++) { EI[i] = q.edge_fine * nf[i] + q.edge_coarse * nc[i]; EO[i] = q.edge_fine * nf2[i] + q.edge_coarse * nc2[i]; }

    // the box the hairs land in (on the fine grid when the stroke is thin), and round it the
    // box the wet fringe can reach
    const W = cv.w, H = cv.h, ss = P.ss || 1;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const e = HW[i] * 1.3 + 1.5;
      if (CX[i] - e < bx0) bx0 = CX[i] - e; if (CX[i] + e > bx1) bx1 = CX[i] + e;
      if (CY[i] - e < by0) by0 = CY[i] - e; if (CY[i] + e > by1) by1 = CY[i] + e;
    }
    const fx0 = Math.max(0, Math.floor(bx0)), fy0 = Math.max(0, Math.floor(by0));
    const fx1 = Math.min(W, Math.ceil(bx1) + 1), fy1 = Math.min(H, Math.ceil(by1) + 1);
    if (fx1 - fx0 < 1 || fy1 - fy0 < 1) return 0;
    const fw = (fx1 - fx0) * ss, fh = (fy1 - fy0) * ss;
    // beyond about 2.2 sigma of the far blur the fringe is under bleed's threshold, even damp
    const mg = Math.ceil(2.2 * q.sig_far + 2);
    const rx0 = Math.max(0, fx0 - mg), ry0 = Math.max(0, fy0 - mg);
    const rx1 = Math.min(W, fx1 + mg), ry1 = Math.min(H, fy1 + mg);
    const acc = f64("acc", fw * fh * 3);
    acc.fill(0, 0, fw * fh * 3);

    // the hairs travel
    const TB = cv.tb, TQ = cv.tq, tqLo = cv.tqLo, tqK = cv.tqK, cellK = cv.cellK, pseed = cv.seed | 0;
    const fw3 = fw * 3, fxo = fx0 + 0.5 / ss, fyo = fy0 + 0.5 / ss;
    const invDrag = 1 / q.drag, ra = q.ramp_a, rb = q.ramp_b, rt = q.ramp_t;
    const hf = hwv.f, hp = hwv.p, ha = hwv.a, hamp = q.hair_wander / 2;
    let samples = 0;
    for (let j = 0; j < B; j++) {
      const ts = tS[j], te = tE[j];
      let i0 = Math.ceil((ts - ra - t0) / dt); if (i0 < 1) i0 = 1;
      let i1 = Math.floor((te - t0) / dt); if (i1 > n - 1) i1 = n - 1;
      if (i1 < i0) continue;
      samples += i1 - i0 + 2;
      const uj = u0[j], cl = clump[j], cj = sqk[cl] * (ck[cl] - uj);
      const cOff = cl * n, gOff = grp[j] * n, onj = onset[j], isp = ispan[j], thj = hthr[j], b3 = j * 3;
      const ta = T[i0 - 1];
      const p1 = TAU * hf[b3] * ta + hp[b3], p2 = TAU * hf[b3 + 1] * ta + hp[b3 + 1], p3 = TAU * hf[b3 + 2] * ta + hp[b3 + 2];
      let s1 = sin(p1), c1 = cos(p1), s2 = sin(p2), c2 = cos(p2), s3 = sin(p3), c3 = cos(p3);
      const d1 = TAU * hf[b3] * dt, d2 = TAU * hf[b3 + 1] * dt, d3 = TAU * hf[b3 + 2] * dt;
      const e1 = cos(d1), f1 = sin(d1), e2 = cos(d2), f2 = sin(d2), e3 = cos(d3), f3 = sin(d3);
      const a1 = ha[b3] * hamp, a2 = ha[b3 + 1] * hamp, a3 = ha[b3 + 2] * hamp;
      let ppx = 0, ppy = 0, dPrev = 1;
      for (let i = i0 - 1; i <= i1; i++) {
        const tt = T[i];
        let u = uj + SQT[i] * cj + (a1 * s1 + a2 * s2 + a3 * s3) * (0.5 + tt) + CW[cOff + i] * (0.3 + tt);
        let z = s1 * e1 + c1 * f1; c1 = c1 * e1 - s1 * f1; s1 = z;
        z = s2 * e2 + c2 * f2; c2 = c2 * e2 - s2 * f2; s2 = z;
        z = s3 * e3 + c3 * f3; c3 = c3 * e3 - s3 * f3; s3 = z;
        const au = u < 0 ? -u : u;
        u *= 1 + au * au * au * (u > 0 ? EO[i] : EI[i]);
        const off = HW[i] * u, px = CX[i] + NX[i] * off, py = CY[i] + NY[i] * off;
        if (i < i0) { ppx = px; ppy = py; continue; }
        const ddx = px - ppx, ddy = py - ppy, ds = Math.sqrt(ddx * ddx + ddy * ddy);
        ppx = px; ppy = py;
        // drying: only where the paper stands higher than the hair's threshold does it still touch
        let dry = (tt - onj) * isp, dep = 1;
        if (dry > 0) {
          if (dry > 1) dry = 1;
          let thr = 1.05 * dry + LIFT[gOff + i] + thj;
          thr = thr < 0 ? 0 : thr > 1.1 ? 1.1 : thr;
          const xi = Math.floor(px), yi = Math.floor(py);
          let ti = 0;
          if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
            let hh = Math.imul(Math.floor(px * cellK), 0x27d4eb2d) ^ Math.imul(Math.floor(py * cellK), 0x165667b1) ^ pseed;
            hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = Math.imul(hh ^ (hh >>> 12), 0x297a2d39); hh ^= hh >>> 15;
            let f = (TB[yi * W + xi] + 0.3 * NORM[hh >>> 20] - tqLo) * tqK;
            f = f <= 0 ? 0 : f >= 1023.999 ? 1023.999 : f;
            const fi = Math.floor(f);
            ti = TQ[fi] + (f - fi) * (TQ[fi + 1] - TQ[fi]);
          }
          const v = (ti - thr) * 10 + 0.5;
          dep = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
        } else dry = 0;
        // a dry hair drags what it picked up from a high point a short way on
        const xx = ds * invDrag, carried = dPrev / (1 + xx * (1 + xx * (0.5 + xx * 0.16666666666666666)));
        if (carried > dep) dep = carried;
        dPrev = dep;
        // on the paper: the head lands hair by hair, the tail lifts hair by hair
        let on = 1;
        if (tt < ts + rb) { const v = (tt - ts + ra) / (ra + rb); on = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); }
        if (tt > te - rt) { const v = (te - tt) / rt; on *= v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); }
        const pres = on * ds;
        if (pres <= 1e-7) continue;
        const iw = pres * dep * (1 - 0.15 * dry), sw = iw * WT[i];
        const X = (px - fxo) * ss, Y = (py - fyo) * ss, xf = Math.floor(X), yf = Math.floor(Y);
        if (xf < 0 || yf < 0 || xf >= fw - 1 || yf >= fh - 1) continue;
        const fx = X - xf, fy = Y - yf, gx = 1 - fx, gy = 1 - fy;
        let k = (yf * fw + xf) * 3, w = gx * gy;
        acc[k] += pres * w; acc[k + 1] += iw * w; acc[k + 2] += sw * w;
        w = fx * gy;
        acc[k + 3] += pres * w; acc[k + 4] += iw * w; acc[k + 5] += sw * w;
        k += fw3; w = gx * fy;
        acc[k] += pres * w; acc[k + 1] += iw * w; acc[k + 2] += sw * w;
        w = fx * fy;
        acc[k + 3] += pres * w; acc[k + 4] += iw * w; acc[k + 5] += sw * w;
      }
    }
    cv.counts.hairSamples += samples;
    finish(cv, rx0, ry0, rx1 - rx0, ry1 - ry0, fx0, fy0, fw, fh, ss, q, tone);
    return samples;
  }

  function dampNow(cv, gi) {
    const d = cv.damp[gi];
    return d > 0 ? d * exp(-LN2 * (cv.clock - cv.dampAt[gi]) / cv.dampHalf) : 0;
  }

  // Hairs to ink: coverage times the share that inked, then the wet fringe (brushkit.finish),
  // laid over what is already on the sheet. The hairs are on the fine grid (fw x fh, ss to the
  // pixel, from fx0, fy0); coverage is taken there and reduced to pixels, the fringe is pixels.
  function finish(cv, rx0, ry0, rw, rh, fx0, fy0, fw, fh, ss, q, tone) {
    const N = rw * rh, acc = SCR.acc, tmp = f64("acc2", fw * fh * 3);
    // brushkit softens each hair by 0.55 texture px; a pixel here is 2.4 to 2.8 of those, and
    // the reduction to pixels softens again, so 0.3 px (0.55 on the finer grids) matches its edge
    const sb = q.blur > 0 ? q.blur : ss === 1 ? 0.3 : 0.55;
    const g = exp(-0.5 / (sb * sb)), w0 = 1 / (1 + 2 * g), w1 = g * w0;
    for (let y = 0; y < fh; y++) {
      const o = y * fw * 3, e = o + (fw - 1) * 3;
      for (let k = o; k <= e; k += 3) {
        const l = k > o, r = k < e;
        tmp[k] = w0 * acc[k] + w1 * ((l ? acc[k - 3] : 0) + (r ? acc[k + 3] : 0));
        tmp[k + 1] = w0 * acc[k + 1] + w1 * ((l ? acc[k - 2] : 0) + (r ? acc[k + 4] : 0));
        tmp[k + 2] = w0 * acc[k + 2] + w1 * ((l ? acc[k - 1] : 0) + (r ? acc[k + 5] : 0));
      }
    }
    const core = f32("core", N), wetm = f32("wetm", N);
    core.fill(0, 0, N); wetm.fill(0, 0, N);
    const cov = q.cov * ss * ss, fw3 = fw * 3, inv = 1 / (ss * ss), ox = fx0 - rx0, oy = fy0 - ry0;
    for (let y = 0; y < fh; y++) {
      const up = y > 0, dn = y < fh - 1, crow = (oy + Math.floor(y / ss)) * rw + ox;
      for (let x = 0; x < fw; x++) {
        const k = (y * fw + x) * 3;
        let a = w0 * tmp[k], d = w0 * tmp[k + 1], s = w0 * tmp[k + 2];
        if (up) { const u = k - fw3; a += w1 * tmp[u]; d += w1 * tmp[u + 1]; s += w1 * tmp[u + 2]; }
        if (dn) { const u = k + fw3; a += w1 * tmp[u]; d += w1 * tmp[u + 1]; s += w1 * tmp[u + 2]; }
        if (a < 1e-7) continue;
        let sh = d / (a + 1e-4); if (sh > 1) sh = 1;
        const c = (1 - exp(-cov * a)) * sh;
        let wf = s / (d + 1e-4); if (wf > 1) wf = 1;
        const p = crow + (ss === 1 ? x : Math.floor(x / ss));
        core[p] += c * inv; wetm[p] += wf * c * inv;
      }
    }
    const b1 = f32("b1", N), b2 = f32("b2", N);
    copyN(wetm, b1, N);
    gblur(b1, rw, rh, q.sig_near, false);
    copyN(b1, b2, N);
    gblur(b2, rw, rh, Math.sqrt(Math.max(0, q.sig_far * q.sig_far - q.sig_near * q.sig_near)), false);
    const W = cv.w, ink = cv.ink, absorb = cv.absorb, damp = cv.damp;
    const bn = q.bleed_near, bf = q.bleed_far, bl = q.bleed, soft = q.soften;
    // absorb is at most 1.25 x 1.15; below this no pixel can reach bleed's threshold
    const quiet = 0.06 / (1.4375 * (damp !== null ? 1 + soft : 1));
    for (let y = 0; y < rh; y++) {
      const go = (ry0 + y) * W + rx0, po = y * rw;
      for (let x = 0; x < rw; x++) {
        const p = po + x, sp0 = bn * b1[p] + bf * b2[p];
        if (sp0 < quiet && core[p] <= 0) continue;
        const gi = go + x;
        let spread = sp0 * absorb[gi];
        if (damp !== null && damp[gi] > 0) spread *= 1 + soft * dampNow(cv, gi);
        let v = core[p];
        if (spread > 0.06) {
          const z = (spread - 0.06) * 1.1904761904761905;
          const b = bl * (z >= 1 ? 1 : z * z * (3 - 2 * z));
          v = 1 - (1 - v) * (1 - b);
        }
        if (v > 0) ink[gi] = 1 - (1 - ink[gi]) * (1 - tone * v);
      }
    }
  }

  function strokeSeed(cv, o, kind) {
    return o.seed !== undefined ? hash32(kind + "|" + o.seed) : hash32(kind + "|" + cv.seed + "|" + cv.clock);
  }
  function normOpts(o, d) {
    return {
      tone: clamp(num(o.tone, d.tone), 0, 1), load: clamp(num(o.load, d.load), 0, 1), wet: clamp(num(o.wet, d.wet), 0, 1),
      head: clamp(num(o.head, d.head), 0, 1), tail: o.tail === "dry" || o.tail === "blunt" || o.tail === "taper" ? o.tail : d.tail,
      hairs: o.hairs, brush: o.brush,
    };
  }

  /* ======================= public: a stroke ======================= */
  function planStroke(cv, pts, o) {
    const oo = normOpts(o, { tone: 1, load: 0.7, wet: 0.6, head: 0.5, tail: "taper" });
    const base = centreLine(pts, o.brush && o.brush.ss);
    if (!base) return null;
    const q = params(cv, base.R, base.L, oo, null);
    return { P: withHead(base, q, oo.wet), q: q, tone: oo.tone, seed: strokeSeed(cv, o, "stroke") };
  }
  function stroke(cv, pts, o) {
    o = o || {};
    const t0 = now();
    const pl = planStroke(cv, pts, o);
    if (pl) lay(cv, pl.P, pl.q, pl.tone, pl.seed);
    cv.clock++; cv.counts.stroke++;
    cv.ms.stroke += now() - t0;
  }

  /* ======================= public: a dab ======================= */
  // One press of the brush, painted as a very short stroke with its own width profile, so it
  // keeps the hairs, the dry edges and the wet fringe. (x, y) is the base of a leaf or petal
  // (the brush enters there and travels along angle), and the centre of a round or a dot.
  function planDab(cv, x, y, o) {
    const shape = o.shape === "petal" || o.shape === "round" || o.shape === "dot" ? o.shape : "leaf";
    const size = Math.max(0.6, num(o.size, 16)), ang = num(o.angle, 0);
    const seed = strokeSeed(cv, o, "dab");
    const r = Rng(hash32("shape|" + seed));
    const tx = cos(ang), ty = sin(ang), nx = ty, ny = -tx;
    let L = size, Wd, prof, x0 = x, y0 = y, bend = 0, tail = "blunt";
    const extra = { onset_edge: 0.2, squeeze_from: 0.8, wet_scale: 0.6 };
    if (shape === "leaf") {
      const aspect = Math.max(1.2, num(o.aspect, 3.2)), gam = ln(0.5) / ln(0.38);
      Wd = size / (2 * aspect);
      prof = function (s) { return Math.max(0.02, pow(Math.max(0, sin(PI * pow(s, gam))), 0.85)); };
      bend = num(o.bend, (r.u() - 0.5) * 0.8) * 0.1 * L;
      tail = "taper";
    } else if (shape === "petal") {
      Wd = size * 0.36;
      prof = function (s) {
        return s <= 0.6 ? 0.12 + 0.88 * sin(HALF_PI * pow(s / 0.6, 0.7)) : Math.max(0.08, Math.sqrt(Math.max(0, 1 - ((s - 0.6) / 0.4) * ((s - 0.6) / 0.4))));
      };
      bend = num(o.bend, (r.u() - 0.5) * 0.4) * 0.1 * L;
    } else if (shape === "round") {
      Wd = size / 2;
      prof = function (s) { return Math.max(0.14, Math.sqrt(Math.max(0, 1 - (2 * s - 1) * (2 * s - 1)))); };
      x0 = x - tx * L / 2; y0 = y - ty * L / 2;
    } else {                                             // dot: a tip, then a round belly (dots.py)
      Wd = size / 2.1;
      const e = 1.1 * Wd, Lp = e + Wd, tip = 0.2, cap = tip * Wd;
      L = Lp;
      prof = function (s) {
        const d = s * Lp;
        if (d < cap) return tip * Math.sqrt(Math.max(0, 1 - ((cap - d) / cap) * ((cap - d) / cap))) + 0.02;
        if (d < e) return tip + (1 - tip) * pow(d / e, 0.8);
        return Math.max(0.05, Math.sqrt(Math.max(0, 1 - ((d - e) / (Lp - e)) * ((d - e) / (Lp - e)))));
      };
      x0 = x - tx * (e - 0.15 * Wd); y0 = y - ty * (e - 0.15 * Wd);
    }
    const m = Math.max(8, Math.ceil(L / 1.2));
    const pts = [];
    for (let i = 0; i <= m; i++) {
      const s = i / m, b = bend * 4 * s * (1 - s);
      pts.push({ x: x0 + tx * s * L + nx * b, y: y0 + ty * s * L + ny * b, w: Wd * prof(s) });
    }
    const oo = normOpts(o, { tone: 1, load: 0.85, wet: 0.5, head: 0, tail: tail });
    oo.head = 0; oo.tail = tail;
    const base = centreLine(pts, o.brush && o.brush.ss);
    if (!base) return null;
    const q = params(cv, base.R, base.L, oo, extra);
    return { P: withHead(base, q, oo.wet), q: q, tone: oo.tone, seed: seed };
  }
  function dab(cv, x, y, o) {
    o = o || {};
    const t0 = now();
    const pl = planDab(cv, num(x, 0), num(y, 0), o);
    if (pl) lay(cv, pl.P, pl.q, pl.tone, pl.seed);
    cv.clock++; cv.counts.dab++;
    cv.ms.dab += now() - t0;
  }


  /* ======================= public: a wash ======================= */
  function rings(poly) {
    if (!poly || !poly.length) return [];
    return Array.isArray(poly[0]) ? poly : [poly];
  }
  // coverage of the rings (even-odd) in a box: four sub-rows a pixel, exact across each span
  function rasterize(rs, x0, y0, rw, rh, out) {
    out.fill(0, 0, rw * rh);
    const E = [];
    for (const ring of rs) {
      const m = ring.length;
      for (let i = 0; i < m; i++) {
        const a = ring[i], b = ring[(i + 1) % m];
        if (!a || !b || a.y === b.y) continue;
        E.push(+a.x, +a.y, +b.x, +b.y);
      }
    }
    const xs = [];
    for (let sy = 0; sy < rh * 4; sy++) {
      const Y = y0 + (sy + 0.5) / 4, row = (sy >> 2) * rw;
      xs.length = 0;
      for (let e = 0; e < E.length; e += 4) {
        const ya = E[e + 1], yb = E[e + 3];
        if ((ya <= Y && yb > Y) || (yb <= Y && ya > Y)) xs.push(E[e] + (Y - ya) * (E[e + 2] - E[e]) / (yb - ya));
      }
      if (xs.length < 2) continue;
      xs.sort(function (p, q) { return p - q; });
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let a = xs[k] - x0, b = xs[k + 1] - x0;
        if (a < 0) a = 0; if (b > rw) b = rw;
        if (b <= a) continue;
        const ia = Math.floor(a), ib = Math.floor(b);
        if (ia === ib) { out[row + ia] += (b - a) * 0.25; continue; }
        out[row + ia] += (ia + 1 - a) * 0.25;
        for (let x = ia + 1; x < ib; x++) out[row + x] += 0.25;
        if (ib < rw) out[row + ib] += (b - ib) * 0.25;
      }
    }
  }
  // A wide blur of a smooth field: at half size when it is wide enough that nothing finer shows.
  function softBlur(a, W, H, sigma) {
    if (sigma < 3 || W < 8 || H < 8) { gblur(a, W, H, sigma, false); return; }
    const w2 = (W + 1) >> 1, h2 = (H + 1) >> 1, h = f32("half", w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const x0 = 2 * x, y0 = 2 * y, x1 = x0 + 1 < W ? x0 + 1 : x0, y1 = y0 + 1 < H ? y0 + 1 : y0;
      h[y * w2 + x] = 0.25 * (a[y0 * W + x0] + a[y0 * W + x1] + a[y1 * W + x0] + a[y1 * W + x1]);
    }
    gblur(h, w2, h2, sigma / 2, false);
    for (let y = 0; y < H; y++) {
      const gy = (y + 0.5) / 2 - 0.5, iy = Math.floor(gy), fy = gy - iy;
      const o0 = (iy < 0 ? 0 : iy) * w2, o1 = (iy + 1 > h2 - 1 ? h2 - 1 : iy + 1) * w2;
      for (let x = 0; x < W; x++) {
        const gx = (x + 0.5) / 2 - 0.5, ix = Math.floor(gx), fx = gx - ix;
        const i0 = ix < 0 ? 0 : ix, i1 = ix + 1 > w2 - 1 ? w2 - 1 : ix + 1;
        const t = h[o0 + i0] + (h[o0 + i1] - h[o0 + i0]) * fx, b = h[o1 + i0] + (h[o1 + i1] - h[o1 + i0]) * fx;
        a[y * W + x] = t + (b - t) * fy;
      }
    }
  }
  function wash(cv, poly, o) {
    o = o || {};
    const t0 = now();
    const rs = rings(poly);
    const tone = clamp(num(o.tone, 0.25), 0, 1), soft = Math.max(0, num(o.soft, 3));
    const bloom = clamp(num(o.bloom, 0.35), 0, 1), grain = clamp(num(o.grain, 0.35), 0, 1);
    const seed = strokeSeed(cv, o, "wash"), S = cv.scale, W = cv.w, H = cv.h;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const ring of rs) for (const p of ring) {
      if (!p) continue;
      if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x; if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y;
    }
    if (bx1 > bx0 && by1 > by0 && tone > 0) {
      const sig = soft / 2, jig = 1.2 + 0.1 * soft, rb = 1.0 + 0.1 * soft + 1.5 * S;
      const mg = Math.ceil(3 * Math.max(sig, rb) + jig + 4);
      const rx0 = Math.max(0, Math.floor(bx0) - mg), ry0 = Math.max(0, Math.floor(by0) - mg);
      const rx1 = Math.min(W, Math.ceil(bx1) + mg + 1), ry1 = Math.min(H, Math.ceil(by1) + mg + 1);
      const rw = rx1 - rx0, rh = ry1 - ry0, N = rw * rh;
      if (rw > 1 && rh > 1) {
        const r = Rng(seed);
        const cover = f32("wCover", N), edge = f32("wEdge", N), rim = f32("wRim", N), gr = f32("wGrain", N);
        rasterize(rs, rx0, ry0, rw, rh, cover);
        // the water's edge wanders with the paper: further into thin, absorbent paper
        copyN(cover, edge, N);
        gblur(edge, rw, rh, 0.8 + 0.25 * jig, false);
        const lx = r.u() * 1000, ly = r.u() * 1000;
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
          const p = y * rw + x, gi = (ry0 + y) * W + rx0 + x;
          const e = edge[p] + 0.18 * (cv.absorb[gi] - 1.05) + 0.08 * (cv.form[gi] - 0.5) + 0.05 * (cv.tooth[gi] - 0.5);
          edge[p] = sstep(0.38, 0.62, e);
        }
        // the drying edge: pigment carried to where the water stopped
        copyN(edge, rim, N);
        gblur(rim, rw, rh, rb, false);
        for (let i = 0; i < N; i++) { const d = edge[i] - rim[i]; rim[i] = d > 0 ? sstep(0, 0.45, d) * edge[i] : 0; }
        copyN(edge, cover, N);
        if (sig > 0.2) { softBlur(cover, rw, rh, sig); softBlur(rim, rw, rh, sig * 0.6); }
        // pigment settles into the paper's hollows: its grain, softened to the size a wash shows it
        for (let y = 0; y < rh; y++) {
          const go = (ry0 + y) * W + rx0;
          for (let x = 0; x < rw; x++) gr[y * rw + x] = 0.6 * (0.5 - cv.tooth[go + x]) + 0.4 * (cv.fibre[go + x] - 0.3);
        }
        gblur(gr, rw, rh, 0.65, false);
        let fx0 = 0, fy0 = 0, fdx = 0, fdy = 0, fto = 1, fl2 = 0;
        const fade = o.fade;
        if (fade && typeof fade === "object") {
          fx0 = num(fade.x0, 0); fy0 = num(fade.y0, 0); fdx = num(fade.x1, 0) - fx0; fdy = num(fade.y1, 0) - fy0;
          fto = clamp(num(fade.to, 0), 0, 1); fl2 = fdx * fdx + fdy * fdy;
        }
        const ink = cv.ink;
        if (!cv.damp) { cv.damp = new Float32Array(W * H); cv.dampAt = new Float32Array(W * H); }
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
          const p = y * rw + x, c = cover[p];
          if (c <= 0.002) continue;
          const gi = (ry0 + y) * W + rx0 + x;
          let d = tone * c * (1 + 0.4 * (cv.form[gi] - 0.5));
          d *= 1 + grain * 1.1 * gr[p];
          d *= 1 + bloom * 1.6 * rim[p];
          if (fl2 > 0) { const f = sstep(0, 1, ((rx0 + x + 0.5 - fx0) * fdx + (ry0 + y + 0.5 - fy0) * fdy) / fl2); d *= 1 + (fto - 1) * f; }
          if (d > 1) d = 1;
          if (d > 0) ink[gi] = 1 - (1 - ink[gi]) * (1 - d);
          const now_ = cv.damp[gi] > 0 ? dampNow(cv, gi) : 0, nd = c * (0.4 + 0.6 * (1 - tone));
          if (nd > now_) { cv.damp[gi] = nd; cv.dampAt[gi] = cv.clock; }
        }
      }
    }
    cv.clock++; cv.counts.wash++;
    cv.ms.wash += now() - t0;
  }

  /* ======================= public: out ======================= */
  function render(cv) { return cv.ink.slice(); }

  function hexRGB(s, d) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(s || ""));
    const v = m ? parseInt(m[1], 16) : d;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  // ink over paper in sRGB, as brushkit.preview composites; o.mask gives the ink colour with the
  // density in alpha (for laying over the game's own paper); o.canvas + o.grain tint the paper
  // with the sheet's own formation and fibres.
  function rgba(ink, w, h, o) {
    o = o || {};
    const P = hexRGB(o.paper, 0xEFE8D8), I = hexRGB(o.ink, 0x1A1611), n = w * h;
    const out = new Uint8ClampedArray(n * 4);
    const cv = o.canvas && o.canvas.form && o.canvas.w === w && o.canvas.h === h ? o.canvas : null;
    const grain = cv ? clamp(num(o.grain, 0), 0, 1) : 0;
    for (let p = 0, k = 0; p < n; p++, k += 4) {
      let a = ink[p]; a = a > 0 ? (a < 1 ? a : 1) : 0;
      if (o.mask) { out[k] = I[0]; out[k + 1] = I[1]; out[k + 2] = I[2]; out[k + 3] = a * 255; continue; }
      let r = P[0], g = P[1], b = P[2];
      if (grain > 0) {
        const m = 1 + grain * 0.07 * (cv.form[p] - 0.5), f = grain * 10.2 * cv.fibre[p];
        r = r * m + f; g = g * m + f; b = b * m + f;
      }
      out[k] = r + (I[0] - r) * a; out[k + 1] = g + (I[1] - g) * a; out[k + 2] = b + (I[2] - b) * a; out[k + 3] = 255;
    }
    return out;
  }

  return {
    version: "brush-0.1",
    canvas: canvas, stroke: stroke, dab: dab, wash: wash, render: render, rgba: rgba,
    // for tests and the README: the exact-everywhere maths and the seed hash
    _math: { exp: exp, sin: sin, cos: cos, ln: ln, pow: pow, tanh: tanh, hash32: hash32 },
    // what a stroke or dab would lay down (the centre-line samples and the model's numbers),
    // without painting: brush-test.mjs hands these to brushkit.py for the side-by-side
    _plan: function (cv, kind, a, b, c, o) { return kind === "dab" ? planDab(cv, a, b, c || {}) : planStroke(cv, a, b || {}); },
  };
})();
