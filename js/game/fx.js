/* Dojo 12 — the visual half of every piece of feedback (PLAN §7.6, ART.md).
   Motion is ink behaving: a brush circle drawn in one breath, a seal slammed
   down, a crack and three splats. Every sound has a twin here, because most
   kids' phones are on silent. */
"use strict";
D.fx = (function () {
  const u = () => D.u;
  const NS = 'http://www.w3.org/2000/svg';

  function pop(node) { D.u.pulse(node, 'pop', 180); }
  // A miss is no longer a crack across the card: the wrong answer is struck through
  // where it was typed (ART.md, review 2026-09-24; run.js strikeWrong).
  function shake(node) { D.u.pulse(node, 'shake', 260); }

  /* Three sumi splats that bloom and settle. No red: a miss is ink. */
  function splats(anchor, n) {
    if (!anchor || !anchor.getBoundingClientRect) return;
    const box = anchor.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const size = 7 + Math.random() * 11;
      const node = D.u.el('i', { class: 'splat', style: {
        left: (box.left + box.width * (0.2 + Math.random() * 0.6)) + 'px',
        top: (box.top + box.height * (0.3 + Math.random() * 0.4)) + 'px',
        width: size + 'px', height: size + 'px',
      } });
      document.body.appendChild(node);
      setTimeout(() => node.remove(), 420);
    }
  }

  /* A number that lifts off the card and fades: points, coins. Given a target, it
     flies there instead and lands on it, so the points are seen joining the score. */
  function float(anchor, text, tone, target) {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const x0 = box.left + box.width / 2, y0 = box.top + 24;
    const n = D.u.el('div', { class: 'floatnum num', text: text, style: {
      left: x0 + 'px', top: y0 + 'px',
      transform: 'translateX(-50%)', color: tone === 'gold' ? 'var(--kin)' : 'var(--shu)',
    } });
    document.body.appendChild(n);
    const to = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    if (to && to.width && typeof n.animate === 'function') {
      n.style.transition = 'none';
      const dx = to.left + to.width / 2 - x0, dy = to.top + to.height / 2 - (y0 + 16);
      const flight = n.animate([
        { transform: 'translate(-50%, 0) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -28px) scale(1)', opacity: 1, offset: 0.22 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), ' + dy + 'px) scale(0.62)', opacity: 0.85, offset: 0.9 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), ' + dy + 'px) scale(0.55)', opacity: 0 },
      ], { duration: 560, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' });
      flight.onfinish = () => n.remove();
      setTimeout(() => n.remove(), 900);
      return;
    }
    requestAnimationFrame(() => {
      n.style.transform = 'translateX(-50%) translateY(-54px)';
      n.style.opacity = '0';
    });
    setTimeout(() => n.remove(), 620);
  }

  /* A coin lifting off the card, the same coin Home shows, so a coin is seen
     being earned (§13.3). */
  function floatCoin(anchor, n) {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const node = D.u.el('div', { class: 'floatnum floatcoin', style: {
      left: (box.left + box.width * 0.78) + 'px', top: (box.top + box.height * 0.62) + 'px',
      transform: 'translateX(-50%)',
    } }, [D.u.el('i', { class: 'coin' }), D.u.el('span', {}, '+' + n)]);
    document.body.appendChild(node);
    requestAnimationFrame(() => {
      node.style.transform = 'translateX(-50%) translateY(-40px)';
      node.style.opacity = '0';
    });
    setTimeout(() => node.remove(), 720);
  }

  /* Small drawings for How it works, one kind per panel (2026-09-24): 'card' the card
     with its timer, gold mark, the small best-time tick and a red time; 'seal' a question going
     halfway (a pencil outline of the seal) and then sealed (the stamped 12); 'belt' a
     belt with stripes; 'streak' the streak mark at its three steps; 'coins' a coin.
     The other kinds are kept for anything that still asks for them. The art pass
     redraws these; the kind names stay. */
  function glyph(kind) {
    const wrap = D.u.el('div', { class: 'howglyph' });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 48');
    const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
    const rect = (x, y, w, h, fill, stroke, r) => add('rect', { x, y, width: w, height: h, fill, stroke, 'stroke-width': stroke ? 1.5 : 0, rx: r || 0 });
    const text = (x, y, s, size, fill) => { const n = add('text', { x, y, 'font-size': size, 'font-weight': 900, 'text-anchor': 'middle', fill, 'font-family': 'inherit' }); n.textContent = s; return n; };
    const ring = (cx, cy, r, stroke, dash) => add('circle', { cx, cy, r, fill: 'none', stroke, 'stroke-width': 2.5, 'stroke-dasharray': dash || 'none' });
    // A short radial tick on a circle, at a fraction of the way round from the top.
    const tickAt = (cx, cy, r, at, stroke, w) => {
      const a = (at * 360 - 90) * Math.PI / 180;
      add('line', { x1: cx + Math.cos(a) * (r - 4), y1: cy + Math.sin(a) * (r - 4), x2: cx + Math.cos(a) * (r + 4),
                    y2: cy + Math.sin(a) * (r + 4), stroke: stroke, 'stroke-width': w, 'stroke-linecap': 'round' });
    };
    switch (kind) {
      case 'card': {
        // The card, its timer part spent (a faint trail) and part left (ink), the gold
        // mark where fast ends, the small tick at the best time, and a red time.
        rect(36, 1, 48, 46, 'var(--paper)', 'var(--ink)', 3);
        ring(60, 22, 17, 'var(--ink2)').setAttribute('opacity', '0.35');
        add('path', { d: 'M60 5 A17 17 0 1 1 45.8 31.4', fill: 'none', stroke: 'var(--ink)', 'stroke-width': 3, 'stroke-linecap': 'round' });
        tickAt(60, 22, 17, 0.42, 'var(--kin)', 3.5);
        tickAt(60, 22, 17, 0.22, 'var(--ink)', 2);
        text(60, 25, '7 × 8', 8, 'var(--ink)');
        text(60, 44, '1.4 s', 6.5, 'var(--shu)');
        break;
      }
      case 'time': ring(60, 24, 18, 'var(--ink2)'); add('path', { d: 'M60 6 A18 18 0 1 1 42 24', fill: 'none', stroke: 'var(--shu)', 'stroke-width': 3.5, 'stroke-linecap': 'round' });
        add('line', { x1: 74, y1: 12, x2: 80, y2: 6, stroke: 'var(--kin)', 'stroke-width': 4 }); text(60, 28, '7 × 8', 9, 'var(--ink)'); break;
      case 'overtime': ring(60, 24, 18, 'var(--ink2)'); text(60, 28, '7 × 8', 9, 'var(--ink)'); text(60, 44, '4.9 s', 6, 'var(--ink2)'); break;
      case 'seal': {
        // Halfway is a pencil outline of the seal, the place it will go; sealed is the
        // stamp with 12 cut into it (ART.md, 2026-09-24).
        add('rect', { x: 18, y: 10, width: 28, height: 28, rx: 2, fill: 'none', stroke: 'var(--ink2)', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' });
        add('path', { d: 'M54 24 H66 M62 20 L66 24 L62 28', fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        add('rect', { x: 74, y: 10, width: 28, height: 28, rx: 2, fill: 'var(--shu)', transform: 'rotate(-3 88 24)' });
        text(88, 29, '12', 13, 'var(--onInk)').setAttribute('transform', 'rotate(-3 88 24)');
        break;
      }
      case 'belt': rect(10, 16, 100, 16, 'var(--belt-white)', 'var(--ink)', 2); rect(68, 16, 42, 16, 'var(--belt-bar)', 'none'); rect(74, 16, 3, 16, 'var(--belt-tape)'); rect(81, 16, 3, 16, 'var(--belt-tape)'); break;
      case 'streak':
        // The streak mark at three, six and nine in a row.
        rect(6, 16, 30, 16, 'var(--shu)', null, 3); text(21, 27.5, '× 1.5', 8, 'var(--onInk)');
        rect(44, 14, 30, 20, 'var(--shu)', null, 3); text(59, 28, '× 2', 10, 'var(--onInk)');
        rect(82, 12, 32, 24, 'var(--shu)', null, 3); text(98, 29, '× 3', 12, 'var(--onInk)');
        break;
      case 'wrong': rect(8, 12, 50, 24, 'var(--paper)', 'var(--ink)', 3); rect(64, 12, 48, 24, 'var(--paper)', 'var(--ink2)', 3); text(33, 28, D.copy.rescue.button, 6, 'var(--ink)'); text(88, 28, D.copy.rescue.skip, 6, 'var(--ink2)'); break;
      case 'coins':
        // The coin with its square hole, the same one Home and the Shop show.
        add('circle', { cx: 48, cy: 24, r: 14, fill: 'var(--kin)', stroke: 'var(--ink)', 'stroke-width': 2 }); rect(43, 19, 10, 10, 'var(--paper)', 'var(--ink)');
        text(80, 29, '+1', 13, 'var(--ink)');
        break;
      case 'tick': ring(60, 24, 18, 'var(--ink2)'); add('line', { x1: 44, y1: 10, x2: 40, y2: 5, stroke: 'var(--ink)', 'stroke-width': 3 }); add('line', { x1: 74, y1: 12, x2: 80, y2: 6, stroke: 'var(--kin)', 'stroke-width': 4 }); break;
      default: return wrap;
    }
    wrap.appendChild(svg);
    return wrap;
  }

  /* A sum set the way the card sets it: the numerals in the type, the operators drawn
     at the numerals' weight (a 0.12 em stroke, the stem of a 900 numeral, centred on
     the cap height). The type's own × and ÷ are hairlines between heavy numerals
     (review 2026-09-24). The sign stays in the text, unseen, for VoiceOver. */
  const OPS = {
    '×': '<path d="M11 11L89 89M89 11L11 89"/>',
    '÷': '<path d="M4 50H96"/><circle cx="50" cy="12" r="12"/><circle cx="50" cy="88" r="12"/>',
    '+': '<path d="M4 50H96M50 4V96"/>',
    '−': '<path d="M4 50H96"/>',
  };
  function sum(node, text) {
    D.u.clear(node);
    // Past six characters the sum is set smaller, so a Beyond card like (12 + 3) × 4
    // stays inside the card and the ring.
    const n = String(text).replace(/\s/g, '').length;
    node.style.setProperty('--qs', n > 6 ? String(Math.max(0.6, 6 / n)) : '1');
    String(text).split(/\s*([×÷+−])\s*/).forEach((part, i) => {
      if (i % 2 === 0) { if (part) node.appendChild(document.createTextNode(part)); return; }
      const op = D.u.el('span', { class: 'op' });
      op.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true">' + OPS[part] + '</svg>';
      op.appendChild(D.u.el('span', { class: 'sr' }, ' ' + part + ' '));
      node.appendChild(op);
    });
  }

  function toast(text, ms) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const n = D.u.el('div', { class: 'toast', text: text });
    document.body.appendChild(n);
    setTimeout(() => n.remove(), ms || 2000);
  }

  /* The seal: the icon's own hanko, slammed onto a card that just settled, in the
     card's corner on its pencil square, as the round's card does (seal kit). */
  function seal(anchor) {
    if (!anchor) return null;
    const n = D.u.el('div', { class: 'cardseal sealed press sealslam' }, [
      D.u.el('span', { class: 'hanko-stack' }, [D.u.el('i', { class: 'hanko-pencil' }), D.u.el('i', { class: 'hanko' })]),
    ]);
    anchor.appendChild(n);
    return n;
  }

  /* ---- the ensō (brush kit, art/kit/out/brush/README.md) ----
     The timer is the icon's own brush stroke. Two layers of one mask: the whole stroke
     faint (the time spent) and the stroke in solid ink cut by a conic gradient (the time
     left). One custom property, --left, from 1 (full) to 0, moves the cut back from the
     dry tail toward the head; css/app.css holds the layers. Never red (ART.md). The four
     timers share one mapping (start 124.5 deg, sweep 336 deg, radius 0.4374, centre of
     the box), so the ticks sit at startDeg - sweepDeg * at, the same formula as the cut:
     the gold tick where an answer stops counting as fast, the small ink tick at this
     child's best time. EDGES are each stroke's inner and outer radius every 6 deg along
     the timer, in thousandths of the box (from the kit's spec.json, which does not
     ship), so a tick crosses exactly that stroke's width. The box must be square. */
  const ENSO = { startDeg: 124.5, sweepDeg: 336, step: 6 };
  const EDGES = {
    brush: [427,464,406,472,401,473,402,476,404,477,407,477,411,478,413,477,414,477,417,477,417,477,418,477,419,476,420,475,421,474,423,473,422,472,421,470,421,469,420,468,421,467,419,466,418,465,416,464,416,462,415,462,414,461,414,460,415,459,415,458,416,458,417,458,418,458,420,458,421,458,423,458,425,458,426,459,428,460,430,462,432,461,434,461,436,462,438,462,440,461,442,462,444,464,444,463,446,463,446,450,447,450,448,450,448,450,449,450,449,450,449,450,449,450],
    thin: [432,443,432,443,432,445,436,444,438,445,439,446,441,448,441,449,442,450,442,452,442,453,442,454,442,454,441,455,441,455,440,454,439,455,438,454,436,453,435,452,434,451,433,450,432,449,432,448,431,447,431,446,430,445,430,444,430,443,430,443,431,442,431,442,432,442,434,443,435,443,436,443,438,444,439,446,440,448,442,449,444,450,445,452,446,454,448,455,449,456,450,457,451,458,452,459,453,460,453,460,453,460,453,459,453,459,453,459,454,457,453,456,453,455],
    double: [427,462,407,469,404,471,405,474,407,475,409,476,412,476,414,476,416,476,418,476,418,476,419,476,420,476,421,474,421,474,422,473,422,472,421,471,420,470,419,469,420,467,418,466,416,466,415,465,414,464,414,463,413,463,412,462,412,461,413,461,413,460,414,460,416,460,417,461,418,461,420,462,421,462,423,464,424,464,426,466,428,465,430,466,432,467,434,468,435,468,436,469,438,469,439,470,439,468,440,443,440,443,441,444,441,448,442,462,442,462,442,443,442,442],
    dotted: [453,471,453,471,453,471,402,453,433,460,421,462,438,451,425,469,435,461,421,462,430,447,445,474,419,459,424,471,444,459,431,459,424,463,432,445,424,462,432,444,434,447,421,450,432,452,424,458,423,449,421,453,441,454,421,456,422,445,420,455,426,446,427,453,424,454,429,440,432,451,436,456,429,456,426,450,426,462,446,456,430,456,442,450,443,447,460,464,449,463,443,465,455,456,449,471,456,467,444,461,452,455,453,455,446,449,444,448,448,448,448,448,448,448],
  };
  // The timer the child uses, by the Shop's name for it; Gold is the brush stroke in gold.
  function ensoFile() {
    const ring = (document.documentElement && document.documentElement.getAttribute('data-ring')) || 'brush';
    return EDGES[ring] ? ring : 'brush';
  }
  function enso(container, opts) {
    const o = opts || {};
    const box = D.u.el('div', { class: 'enso-t' }, [D.u.el('i', { class: 'trail' }), D.u.el('i', { class: 'left' })]);
    container.appendChild(box);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'enso-ticks');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const e = EDGES[ensoFile()];
    function line(cls, x1, y1, x2, y2) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1.toFixed(2)); l.setAttribute('y1', y1.toFixed(2));
      l.setAttribute('x2', x2.toFixed(2)); l.setAttribute('y2', y2.toFixed(2));
      l.setAttribute('class', cls);
      svg.appendChild(l);
    }
    // A tick crosses the stroke where the cut is when --left equals `at`, from a little
    // inside the stroke's inner edge to a little outside its outer edge.
    function tick(cls, at, over) {
      const deg = ENSO.sweepDeg * at, th = (ENSO.startDeg - deg) * Math.PI / 180;
      const n = e.length / 2, i = D.u.clamp(Math.floor(deg / ENSO.step), 0, n - 2), f = (deg - i * ENSO.step) / ENSO.step;
      const rin = (e[2 * i] + f * (e[2 * i + 2] - e[2 * i])) / 10 - 100 * over;
      const rout = (e[2 * i + 1] + f * (e[2 * i + 3] - e[2 * i + 1])) / 10 + 100 * over;
      const c = Math.cos(th), sn = Math.sin(th);
      // On the Gold timer the gold mark is edged in ink, or it sinks into the gold stroke.
      if (cls === 'gold') line('gold-edge', 50 + rin * c, 50 - rin * sn, 50 + rout * c, 50 - rout * sn);
      line(cls, 50 + rin * c, 50 - rin * sn, 50 + rout * c, 50 - rout * sn);
    }
    if (o.bestAt > 0.02 && o.bestAt < 0.99) tick('best', o.bestAt, 0.022);
    if (o.goldAt > 0.02 && o.goldAt < 0.99) tick('gold', o.goldAt, 0.02);
    container.appendChild(svg);
    let shown = '';
    return {
      node: box,
      // 1 is full, 0 is empty. Written only when it changes at the fourth decimal.
      set(left) {
        const v = D.u.clamp(left, 0, 1).toFixed(4);
        if (v !== shown) { shown = v; box.style.setProperty('--left', v); }
      },
      remove() { box.remove(); svg.remove(); },
    };
  }

  /* A worn seal, drawn rather than shipped. */
  const MARKS = {
    circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    triangle: 'M12 3 22 21H2z',
    square: 'M4 4h16v16H4z',
    diamond: 'M12 2 22 12 12 22 2 12z',
    hex: 'M7 3h10l5 9-5 9H7l-5-9z',
    star: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z',
    ring: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    cross: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  };
  function markGlyph(value, tone) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', MARKS[value] || MARKS.circle);
    path.setAttribute('fill', tone || 'var(--shu)');
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    return D.u.el('span', { class: 'mark' }, [svg]);
  }

  /* Size the card to the space its row actually gets. The wrapper has no content
     size of its own, so its box is exactly what the top row, the line, the
     buttons and the keypad leave. Watched, because the line and the buttons
     appear after a miss and the card has to give way to them (the 375 by 667
     overlap, rework 2026-09-10). */
  function fitCard(wrap, card) {
    if (!wrap || !card) return;
    const box = wrap.getBoundingClientRect();
    const size = Math.max(120, Math.floor(Math.min(box.width, box.height - 6, 330)));
    card.style.width = size + 'px';
    card.style.height = size + 'px';
    card.style.setProperty('--cs', size + 'px');
  }
  let watcher = null;
  function watchFit(wrap, card) {
    fitCard(wrap, card);
    if (watcher) watcher.disconnect();
    if (typeof ResizeObserver === 'function') {
      watcher = new ResizeObserver(() => fitCard(wrap, card));
      watcher.observe(wrap);
    } else {
      window.addEventListener('resize', () => fitCard(wrap, card));
    }
  }

  return { pop, shake, splats, float, floatCoin, glyph, sum, toast, seal, enso, markGlyph, fitCard, watchFit };
})();
