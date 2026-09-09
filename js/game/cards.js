/* Dojo 12 — the plain card screen, shared by the tryout and the Belt Test.
   Neither of those has rescues, comebacks or redemption, so they do not need
   the run screen; they need a question, a keypad and honest feedback. */
"use strict";
D.cards = (function () {
  const u = () => D.u;

  function start(root, opts) {
    const dom = {};
    let pad = null, ring = null, raf = 0, deadline = 0, t0 = 0, busy = false, expired = false;

    u().clear(root);
    dom.head = u().el('div', { class: 'runtop' });
    dom.left = u().el('div', { class: 'runscore num' }, opts.leftText || '');
    dom.pips = u().el('div', { class: 'pips' });
    dom.right = u().el('div', { class: 'combo' }, '');
    dom.head.appendChild(dom.left); dom.head.appendChild(dom.pips); dom.head.appendChild(dom.right);
    if (opts.total) for (let i = 0; i < opts.total; i++) dom.pips.appendChild(u().el('i', { class: 'pip' }));

    dom.label = u().el('div', { class: 'cardlabel' }, '');
    dom.question = u().el('div', { class: 'question' }, '');
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.card = u().el('div', { class: 'card' }, [dom.label, dom.question, dom.typed, dom.slots]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: v => { dom.typed.textContent = v; paintSlots(v.length); },
      onSubmit: onSubmit,
    });
    root.appendChild(u().el('div', { class: 'screen' }, [dom.head, dom.wrap, dom.line, pad.node]));
    show(opts.provide());

    function paintSlots(n) {
      Array.from(dom.slots.children).forEach((k, i) => k.classList.toggle('on', i < n));
    }
    function setSlots(n) {
      u().clear(dom.slots);
      for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i', { class: 'slot' }));
    }
    function stopRing() { cancelAnimationFrame(raf); if (ring) { ring.remove(); ring = null; } }

    function show(card) {
      stopRing();
      expired = false;
      if (!card) return finish();
      busy = false;
      pad.setLive(true);
      pad.clear();
      dom.typed.textContent = '';
      dom.line.textContent = card.intro || '';
      dom.label.textContent = card.label || '';
      dom.question.textContent = card.question;
      setSlots(card.digits);
      pad.setDigits(card.digits);
      if (opts.total) {
        Array.from(dom.pips.children).forEach((p, i) => {
          if (p.classList.contains('miss')) return;
          p.className = 'pip' + (i < (card.index || 0) ? ' done' : i === (card.index || 0) ? ' now' : '');
        });
      }
      if (opts.leftValue) dom.left.textContent = opts.leftValue();
      t0 = performance.now();
      if (card.ringMs) startRing(card.ringMs);
    }
    function startRing(ms) {
      const rec = opts.ringInfo ? opts.ringInfo() : {};
      ring = D.fx.ring(dom.card, { goldAt: rec.goldAt || 0, ghostAt: rec.ghostAt || 0 });
      deadline = performance.now() + ms;
      (function tick() {
        if (!ring) return;
        const left = deadline - performance.now();
        ring.set(left / ms);
        if (left <= 0) { onExpired(); return; }
        raf = requestAnimationFrame(tick);
      })();
    }
    function onExpired() {
      if (expired) return;
      expired = true;
      cancelAnimationFrame(raf);
      setTimeout(() => { if (expired && !busy) { stopRing(); deliver(opts.timeout ? opts.timeout() : null); } },
                 D.cfg.RING_GRACE_MS);
    }
    function onSubmit(v) {
      if (busy || !pad.isLive()) return;
      expired = false;
      busy = true;
      stopRing();
      deliver(opts.answer(v, Math.round(performance.now() - t0)));
    }
    function deliver(out) {
      if (!out) return finish();
      pad.setLive(false);
      if (out.correct) {
        D.fx.pop(dom.card);
        D.audio.correct(out.streak || 1);
        if (out.gold) { dom.card.classList.add('gold'); D.audio.gold(); D.fx.burst(dom.card, 16, 'gold'); }
        else D.fx.burst(dom.card, 6);
        if (out.points) D.fx.float(dom.card, '+' + out.points);
      } else {
        D.audio.miss();
        if (out.flash !== false) D.fx.crack(dom.card);
        const p = dom.pips.children[out.index === undefined ? -1 : out.index];
        if (p) p.classList.add('miss');
      }
      if (out.line) dom.line.textContent = out.line;
      if (opts.leftValue) dom.left.textContent = opts.leftValue();
      const wait = out.line ? 900 : out.correct ? 430 : 620;
      setTimeout(() => {
        dom.card.classList.remove('gold');
        if (out.done) return finish();
        show(opts.provide());
      }, wait);
    }
    function finish() {
      stopRing();
      if (opts.onDone) opts.onDone();
    }
    return { stop: stopRing };
  }

  return { start };
})();
