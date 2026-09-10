/* Dojo 12 — the visual half of every piece of feedback (PLAN §7.6).
   Every sound has a twin here, because most kids' phones are on silent. */
"use strict";
D.fx = (function () {
  const u = () => D.u;

  function pop(node) { D.u.pulse(node, 'pop', 260); }
  function crack(node) { D.u.pulse(node, 'cracked', 620); }
  function shake(node) { D.u.pulse(node, 'shake', 340); }

  // A number that lifts off the card and fades. Used for points and sparks.
  function float(anchor, text, tone) {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const n = D.u.el('div', { class: 'num', text: text, style: {
      position: 'fixed', left: (box.left + box.width / 2) + 'px', top: (box.top + 20) + 'px',
      transform: 'translateX(-50%)', fontSize: '28px', fontWeight: '800', zIndex: '30',
      color: tone === 'gold' ? 'var(--gold)' : 'var(--accent)',
      pointerEvents: 'none', transition: 'transform 620ms ease-out, opacity 620ms ease-out',
    } });
    document.body.appendChild(n);
    requestAnimationFrame(() => {
      n.style.transform = 'translateX(-50%) translateY(-52px)';
      n.style.opacity = '0';
    });
    setTimeout(() => n.remove(), 700);
  }

  /* Sparks off the card on a correct answer. More of them as the combo climbs,
     gold when a fact settles. This is the visual half of the tick. */
  function burst(anchor, count, tone) {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const colour = tone === 'gold' ? 'var(--gold)' : 'var(--accent2)';
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = box.width * (0.42 + Math.random() * 0.3);
      const size = 5 + Math.random() * 5;
      const n = D.u.el('i', { class: 'spark', style: {
        left: cx + 'px', top: cy + 'px', width: size + 'px', height: size + 'px',
        background: colour, opacity: '1',
        transition: 'transform 520ms cubic-bezier(.16,.8,.3,1), opacity 520ms ease-out',
      } });
      document.body.appendChild(n);
      requestAnimationFrame(() => {
        n.style.transform = 'translate(' + Math.cos(angle) * dist + 'px,' +
          (Math.sin(angle) * dist + 26) + 'px) scale(0.3)';
        n.style.opacity = '0';
      });
      setTimeout(() => n.remove(), 600);
    }
  }

  function toast(text, ms) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const n = D.u.el('div', { class: 'toast', text: text });
    document.body.appendChild(n);
    setTimeout(() => n.remove(), ms || 2000);
  }

  /* The ring: the card's own edge, lit and draining. It starts at the top
     middle and runs clockwise. A gold mark sits where an answer stops counting
     as fast, and a faint tick at this child's own best time on the fact.
     pathLength normalises the border to 100 units, so the dash maths does not
     care how big the card is on a given phone. */
  function ring(container, opts) {
    const ns = 'http://www.w3.org/2000/svg';
    const S = 100, INSET = 2.4, RX = 10.4, WIDTH = 2.6;
    const side = S - INSET * 2;
    const perimeter = 4 * (side - 2 * RX) + 2 * Math.PI * RX;
    const START = 100 * ((side / 2 - RX) / perimeter);     // top middle, clockwise
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ring');
    svg.setAttribute('viewBox', '0 0 100 100');
    function edge(cls, width) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(INSET)); r.setAttribute('y', String(INSET));
      r.setAttribute('width', String(side)); r.setAttribute('height', String(side));
      r.setAttribute('rx', String(RX)); r.setAttribute('ry', String(RX));
      r.setAttribute('class', cls);
      r.setAttribute('stroke-width', String(width));
      r.setAttribute('pathLength', '100');
      return r;
    }
    function mark(cls, width, len, at) {
      const m = edge(cls, width);
      m.setAttribute('stroke-dasharray', len + ' ' + (100 - len));
      m.setAttribute('stroke-dashoffset', String(-(START + at * 100)));
      m.setAttribute('stroke-linecap', 'butt');
      return m;
    }
    svg.appendChild(edge('track', WIDTH));
    const arc = edge('arc', WIDTH);
    arc.setAttribute('stroke-dashoffset', String(-START));
    svg.appendChild(arc);
    if (opts.ghostAt > 0.02 && opts.ghostAt < 0.99) svg.appendChild(mark('ghost', WIDTH * 1.7, 0.7, opts.ghostAt));
    if (opts.goldAt > 0.02 && opts.goldAt < 0.99) svg.appendChild(mark('goldline', WIDTH * 2.2, 1.1, opts.goldAt));
    container.appendChild(svg);
    return {
      node: svg,
      set(fraction) {
        const f = D.u.clamp(fraction, 0, 1) * 100;
        arc.setAttribute('stroke-dasharray', f + ' ' + (100 - f));
        arc.classList.toggle('low', f < 22);
      },
      remove() { svg.remove(); },
    };
  }

  /* Size the card to the space its row actually gets. The wrapper has no content
     size of its own, so its box is exactly what is left after the top row, the
     line, the buttons and the keypad. CSS container units resolved to zero here
     during layout and collapsed the card to its border, so this measures instead. */
  function fitCard(wrap, card) {
    if (!wrap || !card) return;
    const box = wrap.getBoundingClientRect();
    const size = Math.max(120, Math.floor(Math.min(box.width, box.height - 8, 330)));
    card.style.width = size + 'px';
    card.style.height = size + 'px';
    card.style.setProperty('--cs', size + 'px');
  }
  let fitTarget = null, fitBound = false;
  function watchFit(wrap, card) {
    fitTarget = { wrap: wrap, card: card };
    fitCard(wrap, card);
    if (!fitBound) {
      fitBound = true;
      window.addEventListener('resize', () => { if (fitTarget) fitCard(fitTarget.wrap, fitTarget.card); });
    }
  }

  return { pop, crack, shake, float, burst, toast, ring, fitCard, watchFit };
})();
