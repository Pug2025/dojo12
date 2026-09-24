/* Dojo 12 — the visual half of every piece of feedback (PLAN §7.6, ART.md).
   Motion is ink behaving: a brush circle drawn in one breath, a seal slammed
   down, a crack and three splats. Every sound has a twin here, because most
   kids' phones are on silent. */
"use strict";
D.fx = (function () {
  const u = () => D.u;
  const NS = 'http://www.w3.org/2000/svg';

  function pop(node) { D.u.pulse(node, 'pop', 180); }
  // A miss is the crack alone (§13.3): the three splats read as "white dots for no
  // apparent reason" (Jamie, 2026-09-14).
  function crack(node) { D.u.pulse(node, 'cracked', 900); }
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

  /* A number that lifts off the card and fades: points, coins. */
  function float(anchor, text, tone) {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const n = D.u.el('div', { class: 'floatnum num', text: text, style: {
      left: (box.left + box.width / 2) + 'px', top: (box.top + 24) + 'px',
      transform: 'translateX(-50%)', color: tone === 'gold' ? 'var(--kin)' : 'var(--shu)',
    } });
    document.body.appendChild(n);
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

  function toast(text, ms) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const n = D.u.el('div', { class: 'toast', text: text });
    document.body.appendChild(n);
    setTimeout(() => n.remove(), ms || 2000);
  }

  /* The seal: a square vermilion hanko with 12 cut into it, slammed onto
     anything that just settled. */
  function seal(anchor) {
    if (!anchor) return null;
    const n = D.u.el('div', { class: 'seal big sealslam', text: '12' });
    anchor.appendChild(n);
    return n;
  }

  /* ---- the ensō ----
     One brush circle, open at the top right, drawn clockwise from the top. The
     remaining time is a shu stroke that shortens; the gold tick sits where an
     answer stops counting as fast, and a small ink tick at this child's own best
     time on the question. pathLength normalises the circle to 100 units, so the
     dash maths does not care how big the card is on a given phone. */
  function enso(container, opts) {
    const o = opts || {};
    const R = 46, CX = 50, CY = 50;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'enso');
    svg.setAttribute('viewBox', '0 0 100 100');
    function circle(cls, dash, offset, rotate) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(CX)); c.setAttribute('cy', String(CY)); c.setAttribute('r', String(R));
      c.setAttribute('class', cls);
      c.setAttribute('pathLength', '100');
      if (dash) c.setAttribute('stroke-dasharray', dash);
      if (offset) c.setAttribute('stroke-dashoffset', offset);
      c.setAttribute('transform', 'rotate(' + rotate + ' ' + CX + ' ' + CY + ')');
      return c;
    }
    // The track is drawn open, thick at the start of the stroke and thin at its tail.
    svg.appendChild(circle('track', '94 6', '0', -84));
    const arc = circle('arc', '100 0', '0', -90);
    svg.appendChild(arc);
    function tick(cls, at) {
      const angle = (at * 360 - 90) * Math.PI / 180;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(CX + Math.cos(angle) * (R - 5)));
      line.setAttribute('y1', String(CY + Math.sin(angle) * (R - 5)));
      line.setAttribute('x2', String(CX + Math.cos(angle) * (R + 5)));
      line.setAttribute('y2', String(CY + Math.sin(angle) * (R + 5)));
      line.setAttribute('class', cls);
      svg.appendChild(line);
    }
    if (o.bestAt > 0.02 && o.bestAt < 0.99) tick('tick-best', o.bestAt);
    if (o.goldAt > 0.02 && o.goldAt < 0.99) tick('tick-gold', o.goldAt);
    container.appendChild(svg);
    return {
      node: svg,
      set(fraction) {
        const f = D.u.clamp(fraction, 0, 1) * 100;
        arc.setAttribute('stroke-dasharray', f + ' ' + (100 - f));
      },
      // The stroke thickens at three, six and nine in a row (ART.md).
      thickness(tier) { container.style.setProperty('--ensoW', [4.5, 4.5, 6.5, 8.5][D.u.clamp(tier, 0, 3)] + 'px'); },
      remove() { svg.remove(); },
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

  return { pop, crack, shake, splats, float, floatCoin, glyph, toast, seal, enso, markGlyph, fitCard, watchFit };
})();
