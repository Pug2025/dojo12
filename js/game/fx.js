/* Dojo 12 — the visual half of every piece of feedback (PLAN §7.6, ART.md).
   Motion is ink behaving: a brush circle drawn in one breath, a seal slammed
   down, a crack and three splats. Every sound has a twin here, because most
   kids' phones are on silent. */
"use strict";
D.fx = (function () {
  const u = () => D.u;
  const NS = 'http://www.w3.org/2000/svg';

  function pop(node) { D.u.pulse(node, 'pop', 180); }
  function crack(node) {
    D.u.pulse(node, 'cracked', 900);
    splats(node, 3);
  }
  function shake(node) { D.u.pulse(node, 'pop', 180); }

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

  return { pop, crack, shake, splats, float, toast, seal, enso, markGlyph, fitCard, watchFit };
})();
