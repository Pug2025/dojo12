/* Dojo 12 — the day's painting on screen, and the book of finished days (PLAN §15,
   2026-09-25 and 2026-09-26). D.daily counts the rounds and D.painter paints; this lays the
   ink on a sheet of paper edged like the game's cards, fades a round's new part in over
   the old one, puts the date seal on, and draws the book: one page for each day finished,
   newest first. Today's painting is shown on the child's own paper in its ink, like the rest
   of the kit (Night paints light ink on indigo). A page of the book is always Rice paper and
   sumi, because the page kept on the phone and sent to Dad is a picture on washi, and a page
   painted again (after a save is brought back) must look like the ones kept. Every word comes
   from copy.js; the look is in css/paint.css. */
"use strict";
D.book = (function () {
  const u = () => D.u;
  const W = 600, H = 800;          // the painter's sheet
  const SUMI = '#1A1611';          // Rice paper's ink (themes.css), for the book's pages
  const BIG = 300;                 // a painting opened big: the size Jamie judged the sheets at

  function name() { return (D.state && D.state.profile && D.state.profile.name) || ''; }
  function still() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function dpr() { return Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)); }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // A painting opened big is 300 points wide, or the width there is on a narrower phone.
  function bigWidth(root) {
    const room = (root && root.getBoundingClientRect ? root.getBoundingClientRect().width : 0) - 32;
    return room > 0 ? Math.min(BIG, Math.floor(room)) : BIG;
  }

  /* ---- the ink ----
     The painter's answers, kept for the screen that shows the same painting next: the end of
     a round shows the stage before it and the stage after, and Home shows the stage again. A
     sheet's pixels are 1.9 MB, so three are kept. A painting's name and seed are kept for every
     day asked about, so a kept page's name costs the painter nothing the second time. */
  const held = [];
  const known = new Map();       // day|name -> { caption, seed }
  function learn(day, res) {
    if (res && res.caption) known.set(day + '|' + name(), { caption: res.caption, seed: res.seed });
  }
  function inked(day, target, stage, ink) {
    const key = [day, name(), target, stage, ink].join('|');
    const hit = held.find(h => h.key === key);
    if (hit) return Promise.resolve(hit);
    return D.painter.paint(day, name(), target, stage, ink).then(res => {
      learn(day, res);
      const got = { key: key, cv: D.painter.toCanvas(res), px: res.px, caption: res.caption, seal: res.seal, seed: res.seed };
      held.push(got);
      while (held.length > 3) held.shift();
      return got;
    });
  }
  /* What a round added, alone: ink that lands exactly on the new painting when it is laid
     over the old one. The ink is one colour with its density in alpha, so over old ink of
     density a0 the new part needs (a1 - a0) / (1 - a0). Laid as a second canvas, it fades in
     over the old without the old strokes ever darkening. */
  function added(old, now) {
    const out = new Uint8ClampedArray(now.length);
    for (let i = 0; i < now.length; i += 4) {
      const a0 = old ? old[i + 3] : 0, a1 = now[i + 3];
      out[i] = now[i]; out[i + 1] = now[i + 1]; out[i + 2] = now[i + 2];
      out[i + 3] = a1 > a0 && a0 < 255 ? Math.round((a1 - a0) * 255 / (255 - a0)) : 0;
    }
    return out;
  }
  function fromPixels(px) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
    return cv;
  }
  /* The ink drawn at the size it is shown, halving in steps first, so a thumbnail keeps its
     thin strokes instead of dropping them (one bilinear step from 600 to 130 pixels skips
     most of them). */
  function fit(src, width, cls) {
    const w = Math.max(1, Math.min(W, Math.round(width * dpr()))), h = Math.round(w * H / W);
    let from = src, fw = W, fh = H;
    while (fw / 2 >= w * 1.5) {
      const half = document.createElement('canvas');
      half.width = Math.round(fw / 2); half.height = Math.round(fh / 2);
      const g = half.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(from, 0, 0, half.width, half.height);
      from = half; fw = half.width; fh = half.height;
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    if (cls) cv.className = cls;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(from, 0, 0, w, h);
    return cv;
  }

  /* ---- the date seal: the level stamp's stone (kit.css .hanko-level, img/seal-blank.webp),
     the date written on it in the paper's colour, the month small over the day like a leaf of
     a calendar, where the painting leaves room for it (res.seal, on the 600 x 800 sheet). The
     stone is 10/13 of its box, as every seal file holds it. Too small to read, it is the stone
     alone. ---- */
  function sealAt(day, seal, width) {
    const k = width / W, stone = seal.size * k, box = stone * 13 / 10;
    const el = u().el('i', { class: 'pp-seal', 'aria-hidden': 'true' });
    el.style.left = (seal.x * k - box / 2).toFixed(1) + 'px';
    el.style.top = (seal.y * k - box / 2).toFixed(1) + 'px';
    el.style.width = box.toFixed(1) + 'px';
    el.style.height = box.toFixed(1) + 'px';
    if (stone >= 17) {
      const d = new Date(day + 'T12:00:00');
      const m = u().el('i', {}, String(d.getMonth() + 1)), dd = u().el('i', {}, String(d.getDate()));
      m.style.fontSize = (stone * 0.3).toFixed(1) + 'px';
      m.style.marginBottom = (stone * 0.03).toFixed(1) + 'px';
      dd.style.fontSize = (stone * 0.5).toFixed(1) + 'px';
      el.appendChild(u().el('b', {}, [m, dd]));
    }
    return el;
  }

  /* ---- a painting on its sheet ----
     The frame is edged like a card; inside it the paper, a cut of the sheet the page is on
     (each day's from its own place in the tile), and the ink over it.
       o.day, o.target, o.stage   which painting, split into how many rounds, and how many are in
       o.width                    CSS px; the sheet is 3:4
       o.from                     a stage to show first, with the rest fading in over it (the round's part)
       o.fadeAt                   ms after the sheet is made before the fade may start
       o.seal                     'still' puts the date seal on once the ink is down; 'wait' leaves it
                                  to out.stamp(), which lays it and returns it for the caller's slam
       o.washi                    a page of the book: Rice paper and sumi, whatever the paper
     out.ready resolves with { caption, seal } once the ink is down and any fade is over. */
  /* The paper is cut where the kept picture cuts it (painter.js): the part of the sheet the
     painting's seed picks, with the tile at the size it has beside a painting 300 points wide,
     so a smaller painting is that page made smaller, fibres and all. Until the painter says the
     seed, a cut from the day and the name. */
  function tileOf(washi) {
    if (washi) return [420, 900];
    try {
      const m = /([0-9.]+)px\s+([0-9.]+)px/.exec(getComputedStyle(document.documentElement).getPropertyValue('--tileSize'));
      if (m) return [Number(m[1]), Number(m[2])];
    } catch (e) { /* the default tile */ }
    return [420, 900];
  }
  function place(paper, seed, width, washi) {
    const k = width / BIG, t = tileOf(washi), s = seed >>> 0;
    paper.style.backgroundSize = (t[0] * k).toFixed(1) + 'px ' + (t[1] * k).toFixed(1) + 'px';
    paper.style.backgroundPosition = (-(s % 420) * k).toFixed(1) + 'px ' + (-((s >>> 9) % 900) * k).toFixed(1) + 'px';
  }
  function frame(day, width, washi) {
    const paper = u().el('div', { class: 'pp-paper' });
    if (washi) paper.setAttribute('data-theme', 'washi');
    const was = known.get(day + '|' + name());
    place(paper, was && was.seed !== undefined ? was.seed : hash(day + '|' + name()), width, washi);
    const el = u().el('div', { class: 'pp-sheet', 'aria-hidden': 'true' }, [paper]);
    el.style.width = Math.round(width) + 'px';
    el.style.height = Math.round(width * H / W) + 'px';
    return { el: el, paper: paper, seed: seed => { if (seed !== undefined) place(paper, seed, width, washi); } };
  }
  function sheet(o) {
    const width = Math.round(o.width);
    const out = frame(o.day, width, o.washi);
    const made = Date.now();
    const ink = o.washi ? SUMI : D.painter.inkColor();
    const stage = Math.max(0, o.stage | 0);
    out.stamp = () => null;
    if (stage === 0) { out.ready = Promise.resolve(null); return out; }
    const fading = typeof o.from === 'number' && o.from >= 0 && o.from < stage && still() === false;
    const before = fading && o.from > 0 ? inked(o.day, o.target, o.from, ink) : Promise.resolve(null);
    let meta = null;
    out.stamp = () => {
      if (meta === null || meta.seal === undefined) return null;
      const s = sealAt(o.day, meta.seal, width);
      out.paper.appendChild(s);
      return s;
    };
    // The parts already painted go down as soon as they are here (on an older phone the new
    // part can take half a second), and the new part fades in over them when it comes.
    out.ready = before.then(old => {
      if (old) out.paper.appendChild(fit(old.cv, width));
      return inked(o.day, o.target, stage, ink).then(now => ({ old: old, now: now }));
    }).then(({ old, now }) => {
      meta = { caption: now.caption, seal: now.seal };
      out.seed(now.seed);
      if (fading === false) {
        out.paper.appendChild(fit(now.cv, width));
      } else {
        const part = fit(fromPixels(added(old ? old.px : null, now.px)), width, 'pp-new');
        const wait = Math.max(0, (o.fadeAt || 0) - (Date.now() - made));
        part.style.animationDelay = wait + 'ms';
        out.paper.appendChild(part);
        return new Promise(res => setTimeout(() => res(meta), wait + 540));
      }
      return meta;
    }).then(m => {
      if (o.seal === 'still' && m) out.stamp();
      return m;
    });
    out.ready.catch(() => {});
    return out;
  }

  /* ---- a page of the book, finished: the picture kept on the phone when its seal went on,
     or, without one (a save brought back on another phone), the painting painted here at its
     full stage with the seal laid on it. ---- */
  function kept(day) {
    return Promise.resolve().then(() => D.painter.kept(day)).catch(() => null);
  }
  function pictureFor(page) {
    return Promise.resolve().then(() => D.painter.picture(page.day, name(), page.rounds))
      .then(blob => blob ? Promise.resolve(D.painter.keep(page.day, blob)).then(() => blob) : null)
      .catch(() => null);
  }
  let urls = [];
  function pageSheet(page, width, alive) {
    const out = frame(page.day, width, true);
    out.el.classList.add('pp-page');
    out.ready = kept(page.day).then(blob => {
      if (alive && alive() === false) return null;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        out.paper.appendChild(u().el('img', { src: url, alt: '', draggable: 'false' }));
        // The painting's name is not in the picture: the painter says it without painting.
        const was = known.get(page.day + '|' + name());
        if (was) return { caption: was.caption };
        return D.painter.paint(page.day, name(), page.rounds, 0, SUMI)
          .then(r => { learn(page.day, r); return { caption: r.caption }; }, () => ({ caption: '' }));
      }
      return inked(page.day, page.rounds, page.rounds, SUMI).then(now => {
        out.seed(now.seed);
        out.paper.appendChild(fit(now.cv, width));
        out.paper.appendChild(sealAt(page.day, now.seal, width));
        return { caption: now.caption };
      });
    });
    out.ready.catch(() => {});
    return out;
  }
  function release() {
    for (const url of urls) { try { URL.revokeObjectURL(url); } catch (e) {} }
    urls = [];
    if (watcher) { watcher.disconnect(); watcher = null; }
    queue.length = 0;
    shown++;
  }

  /* ---- keeping the finished page, and Send to Dad ---- */
  // The picture of a finished day, kept on the phone once, when its seal goes on.
  function keepDay(day) {
    const page = D.daily.book().find(p => p.day === day);
    if (page === undefined) return Promise.resolve(false);
    return kept(day).then(have => have ? true : pictureFor(page).then(b => b !== null));
  }
  /* Send to Dad, readied before it can be tapped: iOS opens the share sheet only straight
     from a tap, never after a wait, so the picture and its words are made first. Until then
     it lies flat; if this phone cannot send it, it goes. `first`, if given, runs first (the
     picture being kept) and `onHide` hears when the button goes. */
  function sendButton(page, opts) {
    const o = opts || {};
    const b = u().el('button', { class: 'btn ink wide pp-send', type: 'button', disabled: 'disabled' }, D.copy.paint.send);
    const text = D.copy.paint.sendText(name(), page.day, page.at);
    let ready = false;
    const prepare = () => Promise.resolve(o.first).catch(() => null)
      .then(() => D.painter.prepareSend(page.day, name(), page.rounds, text))
      .then(ok => {
        ready = ok === true;
        if (ready) b.removeAttribute('disabled');
        else { b.classList.add('hidden'); if (o.onHide) o.onHide(); }
      }, () => { b.classList.add('hidden'); if (o.onHide) o.onHide(); });
    prepare();
    b.addEventListener('click', () => {
      if (ready === false) return;
      if (D.painter.sendNow()) { D.fx.toast(D.copy.settings.backupHow, 3200); return; }
      ready = false;
      b.setAttribute('disabled', 'disabled');
      D.fx.toast(D.copy.paint.sendWait, 2400);
      o.first = null;
      prepare();
    });
    return b;
  }

  /* ---- Home: the row under Play ----
     A thumbnail of today's painting as it stands and one line: how many rounds are in, of how
     many, or that training is done and when. The whole row opens the painting big. */
  function homeRow(onOpen) {
    const t = D.daily.today();
    const short = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches;
    const s = sheet({ day: t.day, target: t.target, stage: t.stage, width: short ? 36 : 51, seal: t.done ? 'still' : null });
    const b = u().el('button', { class: 'pp-row', type: 'button' }, [
      s.el,
      u().el('span', { class: 'pp-row-line' }, t.done ? D.copy.paint.rowDone(t.doneAt) : D.copy.paint.row(t.stage, t.target)),
      D.frame.glyph('go'),
    ]);
    b.addEventListener('click', onOpen);
    return b;
  }

  /* ---- the end of a round: the painting at the top right, beside the score, as a scroll
     hangs beside the board. This round's part fades in over the ones before it; the line under
     it says which round of the day it was, or, once the day is done, when training was done.
     `day` is what D.daily.noteRound() said for this round. ---- */
  function roundFigure(day) {
    const t = D.daily.today();
    const short = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches;
    const fresh = day && day.painted && day.justDone === false;
    const width = short ? 84 : 102;
    const s = sheet({ day: t.day, target: t.target, stage: t.stage, width: width,
                      from: fresh ? t.stage - 1 : null, fadeAt: 260, seal: t.done ? 'still' : null });
    // As wide as the painting and its offset, so its line wraps under it rather than widening it.
    const fig = u().el('figure', { class: 'pp-fig' }, [
      s.el,
      u().el('figcaption', {}, t.done ? D.copy.paint.roundDone : D.copy.paint.round(t.stage, t.target)),
    ]);
    fig.style.width = (width + 2) + 'px';
    return fig;
  }

  /* ---- today's painting, opened big from Home. Finished, it is the day's page in the book. ---- */
  function today(root, onBack) {
    const t = D.daily.today();
    if (t.done) {
      const page = D.daily.book().find(p => p.day === t.day);
      if (page) return pageView(root, page, onBack);
    }
    release();
    u().clear(root);
    const s = sheet({ day: t.day, target: t.target, stage: t.stage, width: bigWidth(root) });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen pp-view' }, [
      u().el('div', { class: 'grow top' }),
      s.el,
      u().el('div', { class: 'pp-words' }, [
        u().el('div', { class: 't17 pp-status' }, D.copy.paint.row(t.stage, t.target)),
        u().el('div', { class: 't15 dim' }, D.copy.paint.how(t.target)),
      ]),
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* ---- one page of the book, big: the painting with its seal, its name, the day and when
     training was done, and Send to Dad ---- */
  function pageView(root, page, onBack) {
    release();
    u().clear(root);
    const me = shown;
    const s = pageSheet(page, bigWidth(root), () => shown === me);
    const cap = u().el('div', { class: 'mincho pp-caption' });
    s.ready.then(m => { if (m && m.caption) cap.textContent = m.caption; });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', () => { release(); onBack(); });
    root.appendChild(u().el('div', { class: 'screen pp-view' }, [
      u().el('div', { class: 'grow top' }),
      s.el,
      u().el('div', { class: 'pp-words' }, [cap, u().el('div', { class: 't15 dim' }, D.copy.paint.pageWhen(page.day, page.at))]),
      u().el('div', { class: 'grow' }),
      sendButton(page),
      back,
    ]));
  }

  /* ---- the book: the finished days, newest first, two to a row, each with its date and the
     painting's name. Pages are drawn as they come into view, one at a time, so a year of them
     never paints at once. ---- */
  let watcher = null, shown = 0;
  const queue = [];
  let busy = false;
  function pump() {
    if (busy || queue.length === 0) return;
    busy = true;
    const job = queue.shift();
    job().then(() => { busy = false; pump(); }, () => { busy = false; pump(); });
  }
  function render(root, onBack) {
    release();
    u().clear(root);
    const me = shown;
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', () => { release(); onBack(); });
    const pages = D.daily.book();
    const kids = [u().el('div', { class: 'titlebar' }, D.copy.paint.title)];
    const again = () => render(root, onBack);
    let grid = null;
    if (pages.length === 0) {
      kids.push(u().el('div', { class: 't15 pp-empty' }, D.copy.paint.empty(D.daily.today().target)));
    } else {
      grid = u().el('div', { class: 'pp-book' });
      kids.push(grid);
    }
    kids.push(u().el('div', { class: 'grow' }), back);
    root.appendChild(u().el('div', { class: 'screen scr-book' }, kids));
    if (grid === null) return;
    const width = Math.floor((grid.getBoundingClientRect().width - 14) / 2) || 160;
    const load = new Map();
    for (const page of pages) {
      const cap = u().el('div', { class: 'pp-tile-cap' });
      const box = u().el('div', { class: 'pp-tile-sheet' });
      const tile = u().el('button', { class: 'pp-tile', type: 'button' }, [
        box,
        u().el('div', { class: 'pp-tile-date' }, D.copy.paint.pageDate(page.day)),
        cap,
      ]);
      tile.addEventListener('click', () => pageView(root, page, again));
      grid.appendChild(tile);
      const frameOnly = frame(page.day, width, true);
      frameOnly.el.classList.add('pp-page');
      box.appendChild(frameOnly.el);
      load.set(tile, () => {
        const s = pageSheet(page, width, () => shown === me);
        return s.ready.then(m => {
          if (shown !== me) return;
          box.replaceChild(s.el, box.firstChild);
          if (m && m.caption) cap.textContent = m.caption;
        });
      });
    }
    const start = tile => {
      const job = load.get(tile);
      if (job === undefined) return;
      load.delete(tile);
      queue.push(job);
      pump();
    };
    if (typeof IntersectionObserver === 'function') {
      watcher = new IntersectionObserver((seen, obs) => {
        if (shown !== me) return;
        for (const e of seen) if (e.isIntersecting) { obs.unobserve(e.target); start(e.target); }
      }, { rootMargin: '240px 0px' });
      for (const tile of load.keys()) watcher.observe(tile);
    } else {
      for (const tile of Array.from(load.keys())) start(tile);
    }
  }

  return { sheet, homeRow, roundFigure, today, pageView, render, sendButton, keepDay, bigWidth, BIG };
})();
