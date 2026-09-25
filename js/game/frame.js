/* Dojo 12 — the frame (review 2026-09-24 art pass): the dry-brush title bar on every
   screen, the game's face on the first screens, the calm rows of Settings and For Dad,
   the first card before round 1, and the pictures in How it works. Everything is drawn
   from the image kit in img/ (ART.md Assets) and coloured by the paper's tokens; the
   look lives in css/frame.css. No word lives here: every word comes from copy.js. */
"use strict";
D.frame = (function () {
  const u = () => D.u;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---- title bars (art/kit/out/brush/README.md) ----
     Every .titlebar in the game, whichever screen draws it, is fitted here as it
     appears: the dry-brush bar that suits the title (s a word, m a short line, l a long
     line, 2 for two lines), stretched no more than 18 % past its own proportions, with
     the title ending before the dry end. Sizes are in em of the title's font, so a
     17 px title gets a smaller bar. Without this script a title still gets the m bar. */
  const BARS = {
    s: { w: 6.0, padL: 0.64, x1: 0.727 },
    m: { w: 12.0, padL: 0.64, x1: 0.782 },
    l: { w: 20.0, padL: 0.708, x1: 0.759 },
    2: { w: 14.56, padL: 0.919, x1: 0.743 },
  };
  function fitTitleBar(el) {
    const p = el.parentElement;
    if (!p || !el.isConnected) return null;
    const pcs = getComputedStyle(p);
    const room = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
    if (!(room > 40)) return null;              // not laid out yet: the next sweep fits it
    const cs = getComputedStyle(el);
    const em = parseFloat(cs.fontSize);
    // The title on one line in its own face (longhands: WebKit leaves the computed
    // 'font' shorthand empty).
    const probe = document.createElement('span');
    probe.textContent = el.textContent;
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0';
    for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'fontFeatureSettings']) probe.style[k] = cs[k];
    document.body.appendChild(probe);
    const text = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    // The bar width that keeps the title clear of the dry end.
    const need = (b, t) => (b.padL * em + t + 4) / b.x1;
    let bar = '2', width = 0;
    for (const k of ['s', 'm', 'l']) {
      const b = BARS[k], w0 = b.w * em, max = Math.min(room, w0 * 1.18);
      if (need(b, text) <= max) { bar = k; width = k === 'l' ? max : Math.max(Math.min(w0, room), need(b, text)); break; }
    }
    if (bar === '2') {
      const w0 = BARS[2].w * em;
      width = Math.min(room, Math.max(w0, need(BARS[2], Math.ceil(text / 2) + em)), w0 * 1.18);
    }
    el.classList.remove('bar-s', 'bar-m', 'bar-l', 'bar-2');
    if (bar !== 'm') el.classList.add('bar-' + bar);
    el.style.width = Math.round(width) + 'px';
    el.style.paddingRight = Math.round(width * (1 - BARS[bar].x1) + 4) + 'px';
    el.dataset.bar = bar;
    el.dataset.textw = text;
    el.dataset.fit = el.textContent;
    return bar;
  }
  // A bar is fitted once for its words; `all` fits every bar again (fonts, a new width).
  function fitAll(all) {
    for (const el of document.querySelectorAll('.titlebar')) if (all || el.dataset.fit !== el.textContent) fitTitleBar(el);
  }
  let queued = 0;
  function soon(all) {
    if (queued) { if (all) queued = 2; return; }
    queued = all ? 2 : 1;
    // A microtask, so a new screen's bar is fitted before it is ever painted.
    Promise.resolve().then(() => { const every = queued === 2; queued = 0; fitAll(every); });
  }
  function watch() {
    const app = document.getElementById('app');
    if (!app || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => soon(false)).observe(app, { childList: true, subtree: true, characterData: true });
    soon(false);
    const fonts = document.fonts;
    if (fonts) {
      if (fonts.ready) fonts.ready.then(() => soon(true));
      if (fonts.addEventListener) fonts.addEventListener('loadingdone', () => soon(true));
      // The title face is fetched only once a title uses it: ask for it now, and fit
      // again when it lands, so the bar is measured in the face it is drawn in.
      if (fonts.load) fonts.load('600 22px "Shippori Mincho"').then(() => soon(true)).catch(() => {});
    }
    let wide = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== wide) { wide = window.innerWidth; soon(true); } });
  }

  /* ---- the game's face, as on the icon: the ensō at full weight and the "12" seal at
     its lower right, where the icon has it (brush kit spec.json, enso-mark.webp.iconSeal),
     with the name under it. draw: the ensō is brushed in and the seal stamped after it. */
  function mark(opts) {
    const o = opts || {};
    return u().el('div', { class: 'fr-mark' + (o.draw ? ' draw' : ''), 'aria-hidden': 'true' }, [
      u().el('i', { class: 'fr-enso' }),
      u().el('i', { class: 'hanko-12' }),
    ]);
  }
  function face(opts) {
    const o = opts || {};
    return u().el('div', { class: 'fr-face' + (o.cls ? ' ' + o.cls : '') }, [
      mark(o),
      u().el('div', { class: 'fr-name' }, D.copy.install.name),
    ]);
  }

  /* ---- small glyphs, drawn in the text's colour ---- */
  const GLYPHS = {
    // where a row goes
    go: ['0 0 10 16', 'M2.5 2 L8 8 L2.5 14'],
    // a row that opens under itself
    open: ['0 0 16 10', 'M2 2.5 L8 8 L14 2.5'],
    // then: from one picture to the next
    then: ['0 0 22 10', 'M1 5 H19 M15 1.2 L19 5 L15 8.8'],
    // iOS Share: a box with an arrow out of it
    share: ['0 0 44 56', 'M22 4 V34 M13 13 L22 4 L31 13 M8 22 H4 V52 H40 V22 H36'],
    // iOS Add to Home Screen: a plus in a square
    add: ['0 0 48 48', 'M9 5 H39 A4 4 0 0 1 43 9 V39 A4 4 0 0 1 39 43 H9 A4 4 0 0 1 5 39 V9 A4 4 0 0 1 9 5 Z M24 15 V33 M15 24 H33'],
  };
  function glyph(kind) {
    const g = GLYPHS[kind] || GLYPHS.go;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fr-glyph fr-g-' + kind);
    svg.setAttribute('viewBox', g[0]);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', g[1]);
    svg.appendChild(path);
    return svg;
  }

  /* ---- a calm list of paper rows (Settings, For Dad): the word on the left; on the
     right what it is set to, or where it goes; a note under it. The row is the button. ---- */
  function row(label, opts) {
    const o = opts || {};
    const b = u().el('button', { class: 'fr-row' + (o.cls ? ' ' + o.cls : ''), type: 'button' }, [
      u().el('span', { class: 'fr-label' }, label),
      o.value ? u().el('span', { class: 'fr-value' }, o.value) : null,
      o.end ? u().el('span', { class: 'fr-end' }, [o.end]) : null,
      o.note ? u().el('span', { class: 'fr-note' }, o.note) : null,
    ]);
    if (o.onClick) b.addEventListener('click', o.onClick);
    return b;
  }
  /* On and Off: On is the solid red block, "this one, now"; Off an empty ink outline.
     Both carry the word. */
  function stamp(on) {
    const s = u().el('span', { class: 'fr-stamp' });
    setStamp(s, on);
    return s;
  }
  function setStamp(s, on) {
    s.classList.toggle('on', !!on);
    s.textContent = on ? D.copy.settings.on : D.copy.settings.off;
  }

  /* ---- the card as the round deals it: the sum with its operators at the numerals'
     weight (D.fx.sum), and the answer on one short ink line right under it ---- */
  function card(id, opts) {
    const o = opts || {};
    const q = u().el('div', { class: 'question' });
    D.fx.sum(q, D.facts.display(id));
    const ans = String(D.facts.answerValue(id));
    const slots = u().el('div', { class: 'slots' });
    for (let i = 0; i < ans.length; i++) {
      slots.appendChild(o.answered ? u().el('i', { class: 'on' }, ans[i]) : u().el('i'));
    }
    return u().el('div', { class: 'card' + (o.cls ? ' ' + o.cls : '') }, [
      o.timer || null,
      q,
      u().el('div', { class: 'answer' }, [slots]),
      o.time ? u().el('div', { class: 'cardtime fast' }, o.time) : null,
      o.ticks || null,
    ]);
  }
  /* The one screen before round 1 shows its first card as the round will deal it: no
     timer (the first two rounds have none), and the five card dots above it with the
     first one this card. */
  function firstCard(id) {
    const pips = u().el('div', { class: 'pips' });
    for (let i = 0; i < D.cfg.RUN_CARDS; i++) pips.appendChild(u().el('i', { class: i ? '' : 'now' }));
    return u().el('div', { class: 'fr-demo', 'aria-hidden': 'true' }, [pips, card(id)]);
  }

  /* ---- the brush timer, still (the brush kit's timer, README "The timer"): the whole
     stroke faint for the time spent, and in ink from its head to the cut for the time
     left. The ticks cross the stroke where the cut stands when the time left is at
     their mark: the gold tick is the fast line, the small ink tick the child's best. ---- */
  const TIMER = { startDeg: 124.5, sweepDeg: 336, rIn: 0.385, rOut: 0.495 };
  function stillTimer(left, goldAt, bestAt) {
    const box = u().el('div', { class: 'fr-timer' }, [u().el('i', { class: 'trail' }), u().el('i', { class: 'left' })]);
    box.style.setProperty('--left', left.toFixed(3));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fr-ticks');
    svg.setAttribute('viewBox', '0 0 100 100');
    const tick = (cls, at) => {
      const th = (TIMER.startDeg - TIMER.sweepDeg * at) * Math.PI / 180;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', (50 + 100 * TIMER.rIn * Math.cos(th)).toFixed(2));
      l.setAttribute('y1', (50 - 100 * TIMER.rIn * Math.sin(th)).toFixed(2));
      l.setAttribute('x2', (50 + 100 * TIMER.rOut * Math.cos(th)).toFixed(2));
      l.setAttribute('y2', (50 - 100 * TIMER.rOut * Math.sin(th)).toFixed(2));
      l.setAttribute('class', cls);
      svg.appendChild(l);
    };
    tick('best', bestAt);
    tick('gold', goldAt);
    return { box: box, ticks: svg };
  }

  /* ---- How it works: one picture a panel, one idea each, drawn with the pieces the
     game itself uses, so the picture is what the child will see ---- */
  function pic(kind, kids) {
    return u().el('div', { class: 'fr-pic fr-pic-' + kind, 'aria-hidden': 'true' }, kids);
  }
  const PICTURES = {
    // The card after a fast answer: the timer stopped with ink still left past the gold
    // tick, the best-time tick on the spent trail, the answer on its line, a red time.
    card() {
      const t = stillTimer(0.62, 0.45, 0.76);
      return pic('card', [card(D.facts.mulId(7, 8), { answered: true, timer: t.box, ticks: t.ticks, time: D.copy.secs(1400) })]);
    },
    // Halfway, the pencil square; sealed, the seal stamped into it, as on the card.
    seal() {
      const stack = sealed => u().el('span', { class: 'fr-stack' }, [
        u().el('i', { class: 'hanko-pencil' }), sealed ? u().el('i', { class: 'hanko' }) : null,
      ]);
      return pic('seal', [stack(false), glyph('then'), stack(true)]);
    },
    // A white belt, tied, with two stripes on its bar.
    belt() {
      return pic('belt', [D.kit.belt('white', 2, { alt: D.copy.beltName('white', 2) })]);
    },
    // The streak mark at its three steps, as the top of a round shows it.
    streak() {
      return pic('streak', D.cfg.COMBO_TIERS.slice(1).map((m, i) => u().el('div', { class: 'streak' }, [
        u().el('span', { class: 'label' }, D.copy.run.streak(D.cfg.COMBO_STEP * (i + 1))),
        u().el('span', { class: 'mult' }, D.copy.run.times(m)),
      ])));
    },
    // Points as a round counts them, a coin, and a level's stamp.
    coins() {
      return pic('coins', [
        u().el('div', { class: 'scorebox' }, [
          u().el('span', { class: 'runscore num' }, D.copy.num(460)),
          u().el('span', { class: 'label' }, D.copy.summary.points),
        ]),
        u().el('div', { class: 'fr-coinrow' }, [u().el('i', { class: 'coin big' }), D.kit.level(3)]),
      ]);
    },
  };
  function picture(kind) { return PICTURES[kind] ? PICTURES[kind]() : null; }

  watch();
  return { fitTitleBar, fitAll, mark, face, glyph, row, stamp, setStamp, card, firstCard, picture };
})();
