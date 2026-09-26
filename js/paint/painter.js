/* Dojo 12 — the day's painting in the game (PLAN §15, 2026-09-25 and 2026-09-26). The brush
   (js/paint/brush.js) and the scenes (js/paint/scenes.js) run in a worker (js/paint/worker.js);
   this asks it for the painting as it stands after a number of rounds and puts the pixels in a
   canvas, laid over the paper like the rest of the kit (the ink takes the paper's --ink, so Night
   paints light ink on indigo). A finished day is also kept on the phone as a picture on washi with
   its date seal, for the book and for Send to Dad, so a later change to the painter never changes
   a page a child has already earned (PLAN §15, 2026-09-26).

   D.painter.paint(date, name, rounds, stage, ink?)  -> Promise<{ w, h, px, caption, family, seal, stages, seed }>
       the painting for that game day and child, `stage` of `rounds` rounds painted (0..rounds);
       px is RGBA (the ink colour, its density in alpha); ink defaults to the paper's --ink
   D.painter.toCanvas(res, canvas?)                  -> canvas (res.w x res.h) holding the pixels
   D.painter.inkColor()                              -> the current paper's --ink as hex
   D.painter.picture(date, name, rounds)             -> Promise<Blob>   the finished page: washi, sumi, the seal (JPEG)
   D.painter.keep(date, blob) / kept(date)           -> Promise         the picture stored on the phone / read back (null if not there)
   D.painter.prepareSend(date, name, rounds, text)   -> Promise<bool>   readies the picture for Send to Dad, with the words
                                                                       to go with it (from copy.js, passed in by the screen)
   D.painter.sendNow()                               -> bool            opens the share sheet; call it straight from a tap
   Without a worker (node, an old browser) it paints on the main thread, loading the two scripts on
   first use.

   The picture is 600 x 800, a JPEG at quality 0.9, the page as the approved sheets show it: the washi
   tile over the paper colour at the size the game shows it beside a painting 300 points wide (420 x 900
   CSS px, so 840 x 1800 of the painting's px), cut from the part of the sheet the painting's seed picks;
   the ink in sumi whatever paper the child plays on; the date seal drawn as the level stamp is, the blank
   stone tinted shu at a hand's tilt with the month small over the day in the paper's colour. It needs a
   page (a canvas and the fonts), so in node it rejects.
   keep resolves true once the picture is stored and false when the phone cannot store it; kept resolves
   the Blob or null. They use Cache Storage, a cache of their own ('d12-book': the service worker clears
   only caches named dojo12-*), keyed by a same-origin address made of the profile's slug and the date,
   book/<slug>/<date>.jpg, so two children on one phone never share a page. The address is a path and
   never a query, because the service worker matches requests without their query.
   prepareSend uses the kept picture, or makes and keeps it, and holds it as <name>-2026-09-26.jpg (the
   name as the save's slug) with the words; it resolves true when the phone can share the picture or at
   least the words. sendNow shares the picture and the words if the phone can share files, else the
   words alone, else returns false. It calls navigator.share before returning, because iOS opens the
   share sheet only from a tap with nothing awaited in between.
   Once the page has loaded, today's painting is painted ahead in the worker as it stands (prime, below),
   so the worker is warm and holds the sheet when a screen first asks for it. */
"use strict";
D.painter = (function () {
  const BASE = 'js/paint/';
  const SUMI = '#1A1611', WASHI = '#EFE8D8', SHU = '#C2361E';
  let worker = null, broken = false, seq = 0;
  const waiting = new Map();

  // rounds a day as asked, or the game's own number when a caller leaves it out
  function roundsOf(r) { r = r | 0; return r > 0 ? r : ((D.cfg && D.cfg.DAY_ROUNDS) || 8); }

  function startWorker() {
    if (worker || broken || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker(BASE + 'worker.js');
      worker.onmessage = e => {
        const m = e.data || {};
        const w = waiting.get(m.id);
        if (!w) return;
        waiting.delete(m.id);
        if (m.ok) w.resolve(m); else w.reject(new Error(m.error || 'paint failed'));
      };
      worker.onerror = () => {
        // a worker that cannot start (a missing file, an old browser): paint here from now on
        broken = true; worker = null;
        const all = Array.from(waiting.values()); waiting.clear();
        all.forEach(w => here(w.msg).then(w.resolve, w.reject));
      };
    } catch (e) { broken = true; worker = null; }
    return worker;
  }

  // the same work as worker.js, on this thread
  let loading = null, heldHere = null;
  function loadScripts() {
    if (D.paintBrush && D.paintScenes) return Promise.resolve();
    if (loading) return loading;
    if (typeof document === 'undefined') return Promise.reject(new Error('no brush loaded'));
    const one = src => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = BASE + src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    loading = one('brush.js').then(() => one('scenes.js'));
    return loading;
  }
  function here(m) {
    return loadScripts().then(() => {
      const rounds = Math.max(1, m.rounds | 0);
      const key = m.date + '|' + String(m.name || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + rounds;
      if (!heldHere || heldHere.key !== key) heldHere = { key: key, scene: D.paintScenes.forDay(m.date, m.name, { rounds: rounds }), state: {} };
      const sc = heldHere.scene;
      const stage = Math.max(0, Math.min(sc.stages.length, m.stage | 0));
      const upTo = stage ? sc.stages[stage - 1] : 0;
      if (heldHere.state.done != null && heldHere.state.done > upTo) heldHere.state = {};
      const ink = D.paintScenes.paint(sc, upTo, heldHere.state);
      const px = D.paintBrush.rgba(ink, sc.w, sc.h, { mask: true, ink: m.ink || SUMI });
      return { w: sc.w, h: sc.h, px: px, caption: sc.caption, family: sc.family, seal: sc.seal, stages: sc.stages.length, seed: sc.seed };
    });
  }

  function paint(date, name, rounds, stage, ink) {
    const msg = { id: ++seq, date: String(date), name: String(name || ''), rounds: roundsOf(rounds), stage: stage | 0,
                  ink: ink || inkColor() };
    const w = startWorker();
    if (!w) return here(msg);
    return new Promise((resolve, reject) => {
      waiting.set(msg.id, { resolve: resolve, reject: reject, msg: msg });
      w.postMessage(msg);
    });
  }

  /* Once the page has loaded and the game has a child and a day, today's painting is painted in the
     worker as it stands, so the worker is running, warm and holding the sheet before a round ends:
     that round then paints only its own part. From nothing, on a cold start, the heaviest days took
     just over a second with the CPU 4x slower (Chrome, throttled, 2026-09-26); on the held sheet a
     round's part took 16 to 47 ms at the median and 286 ms at most. */
  function prime() {
    try {
      const p = D.state && D.state.profile;
      if (!p || !p.name || !D.daily || !startWorker()) return;
      const t = D.daily.today();
      if (t.day) paint(t.day, p.name, t.target, t.stage).catch(() => {});
    } catch (e) { /* a guess ahead, never a failure */ }
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => setTimeout(prime, 400));
  }

  function toCanvas(res, canvas) {
    const cv = canvas || document.createElement('canvas');
    cv.width = res.w; cv.height = res.h;
    cv.getContext('2d').putImageData(new ImageData(res.px, res.w, res.h), 0, 0);
    return cv;
  }

  function inkColor() {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return SUMI;
    const el = document.getElementById('app') || document.body || document.documentElement;
    const v = String(getComputedStyle(el).getPropertyValue('--ink') || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : SUMI;
  }

  /* ---- the finished page as a picture ---- */
  const TILE_W = 840, TILE_H = 1800;      // the washi tile beside a painting 300 points wide
  const FACE = '"Zen Kaku Gothic New", "Hiragino Sans", system-ui, sans-serif';
  const images = {};
  function image(src) {
    if (!images[src]) {
      images[src] = new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('picture: no ' + src));
        im.src = src;
      }).then(im => (im.decode ? im.decode().then(() => im, () => im) : im));
      images[src].catch(() => { delete images[src]; });
    }
    return images[src];
  }
  // the seal's face, loaded for the figures it will carry; a phone with no signal and no copy of
  // the font gets the fallback after a few seconds rather than no picture
  function fontReady(text) {
    const set = typeof document !== 'undefined' ? document.fonts : null;
    if (!set || !set.load) return Promise.resolve();
    const load = set.load('900 32px "Zen Kaku Gothic New"', text).catch(() => {});
    return Promise.race([load, new Promise(r => setTimeout(r, 3000))]);
  }
  function free(cv) { cv.width = 0; cv.height = 0; }   // iOS keeps a canvas's memory until it is emptied

  function page(res, tile, stone, date) {
    const W = res.w, H = res.h;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.fillStyle = WASHI;
    g.fillRect(0, 0, W, H);
    const seed = (res.seed >>> 0) || 0;
    const ox = -2 * (seed % 420), oy = -2 * ((seed >>> 9) % 900);
    for (let y = oy; y < H; y += TILE_H) for (let x = ox; x < W; x += TILE_W) g.drawImage(tile, x, y, TILE_W, TILE_H);
    const ink = toCanvas(res);
    g.drawImage(ink, 0, 0);
    free(ink);
    seal(g, res.seal, stone, date);
    return cv;
  }
  // the stone's box is 13/10 of its side (the seal kit's rule), centred on the seal's place
  function seal(g, s, stone, date) {
    const size = s.size, box = size * 13 / 10, n = Math.ceil(box);
    const tint = document.createElement('canvas');
    tint.width = n; tint.height = n;
    const t = tint.getContext('2d');
    t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    t.drawImage(stone, 0, 0, box, box);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = SHU;
    t.fillRect(0, 0, n, n);
    g.save();
    g.translate(s.x, s.y);
    g.rotate(-3 * Math.PI / 180);
    g.drawImage(tint, -box / 2, -box / 2);
    // the month small over the day, set as the sheets set it: each line as tall as its figures'
    // size, a small gap between, the pair centred on the stone
    const mS = size * 0.3, dS = size * 0.5, gap = size * 0.03, top = -(mS + gap + dS) / 2;
    g.fillStyle = WASHI;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    figures(g, String(+date.slice(5, 7)), mS, top);
    figures(g, String(+date.slice(8, 10)), dS, top + mS + gap);
    g.restore();
    free(tint);
  }
  // one line, its baseline where CSS puts it in a line box of line-height 1
  function figures(g, text, px, top) {
    g.font = '900 ' + px.toFixed(2) + 'px ' + FACE;
    const m = g.measureText(text);
    const a = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent;
    const d = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : m.actualBoundingBoxDescent;
    g.fillText(text, 0, top + px / 2 + (a - d) / 2);
  }
  function jpeg(cv) {
    return new Promise((resolve, reject) => {
      cv.toBlob(b => { free(cv); if (b) resolve(b); else reject(new Error('picture: no jpeg')); }, 'image/jpeg', 0.9);
    });
  }

  function picture(date, name, rounds) {
    const iso = String(date || '');
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return Promise.reject(new Error('picture: no page'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return Promise.reject(new Error('picture: bad date ' + iso));
    const r = roundsOf(rounds);
    return Promise.all([
      paint(iso, name, r, r, SUMI),
      image('img/paper-washi.webp'),
      image('img/seal-blank.webp'),
      fontReady(String(+iso.slice(5, 7)) + String(+iso.slice(8, 10))),
    ]).then(a => jpeg(page(a[0], a[1], a[2], iso)));
  }

  /* ---- the book on the phone ---- */
  const BOOK = 'd12-book';
  function bookKey(date) {
    const p = D.state && D.state.profile;
    const slug = String((p && p.slug) || 'player');
    const base = typeof location !== 'undefined' && location.href ? location.href : 'https://dojo12.invalid/';
    return new URL('book/' + encodeURIComponent(slug) + '/' + encodeURIComponent(String(date)) + '.jpg', base).href;
  }
  function openBook() {
    try {
      if (typeof caches === 'undefined' || !caches || typeof caches.open !== 'function') return Promise.reject(new Error('no caches'));
      return Promise.resolve(caches.open(BOOK));
    } catch (e) { return Promise.reject(e); }
  }
  // Write once: a page in the book is the picture the child earned that day, so a later change to
  // the painter never repaints it (PLAN §15, 2026-09-26). Resolves true when the page is there.
  function keep(date, blob) {
    if (!blob) return Promise.resolve(false);
    return openBook()
      .then(c => c.match(bookKey(date)).then(hit => hit ? true
        : c.put(bookKey(date), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).then(() => true)))
      .then(ok => ok, () => false);
  }
  function kept(date) {
    return openBook()
      .then(c => c.match(bookKey(date)))
      .then(r => (r ? r.blob() : null))
      .then(b => (b && b.size ? b : null), () => null);
  }

  /* ---- Send to Dad ---- */
  let ready = null, latest = null;
  function fileName(name, date) {
    const slug = D.save && D.save.slugify ? D.save.slugify(name)
      : (String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player');
    return slug + '-' + date + '.jpg';
  }
  function asFile(blob, name) {
    if (!blob || typeof File === 'undefined') return null;
    try { return new File([blob], name, { type: 'image/jpeg' }); } catch (e) { return null; }
  }
  function filesOk(file) {
    try { return !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; }
  }
  function canShare(r) {
    if (!r || typeof navigator === 'undefined') return false;
    return filesOk(r.file) || typeof navigator.share === 'function';
  }
  function prepareSend(date, name, rounds, text) {
    ready = null;                                   // a tap before this is ready shares nothing old
    const iso = String(date || '');
    const words = text == null ? '' : String(text);
    const p = kept(iso)
      .then(b => b || picture(iso, name, rounds).then(pic => keep(iso, pic).then(() => pic)))
      .then(b => asFile(b, fileName(name, iso)), () => null)
      .then(file => {
        if (p !== latest) return false;
        ready = { file: file, text: words };
        return canShare(ready);
      });
    latest = p;
    return settle(p);
  }
  // a call overtaken by a later one answers with the last one's answer
  function settle(p) { return p.then(ok => (p === latest ? ok : settle(latest))); }
  function sendNow() {
    const r = ready;
    if (!r || typeof navigator === 'undefined') return false;
    let data = null;
    if (filesOk(r.file)) data = { files: [r.file], text: r.text };
    else if (typeof navigator.share === 'function') data = { text: r.text };
    if (!data) return false;
    try {
      const shown = navigator.share(data);
      if (shown && typeof shown.catch === 'function') shown.catch(() => {});   // closing the sheet rejects
      return true;
    } catch (e) { return false; }
  }

  return { paint, toCanvas, inkColor, picture, keep, kept, prepareSend, sendNow };
})();
