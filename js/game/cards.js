/* Dojo 12 — the plain card screen, used by the black belt test. The test has no
   rescues, comebacks or redemption, so it does not need the round screen; it
   needs a question, a timer, a keypad and honest feedback. */
"use strict";
D.cards = (function () {
  const u = () => D.u;

  function start(root, opts) {
    const dom = {};
    let pad = null, ring = null, raf = 0, deadline = 0, t0 = 0, busy = false, expired = false;

    u().clear(root);
    dom.left = u().el('div', { class: 'runscore num' }, opts.leftValue ? opts.leftValue() : '');
    dom.pips = u().el('div', { class: 'pips' });
    if (opts.total) for (let i = 0; i < opts.total; i++) dom.pips.appendChild(u().el('i'));
    dom.question = u().el('div', { class: 'question' }, '');
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.card = u().el('div', { class: 'card' }, [dom.question, dom.typed, dom.slots]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: v => { dom.typed.textContent = v; paintSlots(v.length); },
      onSubmit: onSubmit,
      onEmpty: () => D.u.pulse(dom.slots, 'pop', 200),
    });
    root.appendChild(u().el('div', { class: 'screen fit' }, [
      u().el('div', { class: 'runtop' }, [
        u().el('div', { class: 'titlebar', style: { fontSize: '17px' } }, opts.title || ''),
        dom.left,
      ]),
      dom.pips, dom.wrap, dom.line, pad.node,
    ]));
    D.fx.watchFit(dom.wrap, dom.card);
    show(opts.provide());

    function paintSlots(n) {
      Array.from(dom.slots.children).forEach((k, i) => k.classList.toggle('on', i < n));
    }
    function setSlots(n) {
      u().clear(dom.slots);
      for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i'));
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
      D.fx.fitCard(dom.wrap, dom.card);
      dom.question.textContent = card.question;
      dom.question.classList.toggle('words', /[a-z]{2,}/i.test(card.question));
      pad.setMode(card.input || 'number');
      setSlots(card.input && card.input !== 'number' ? 0 : card.digits);
      pad.setDigits(card.digits);
      if (opts.total) {
        Array.from(dom.pips.children).forEach((p, i) => {
          if (p.classList.contains('miss')) return;
          p.className = i < (card.index || 0) ? 'done' : i === (card.index || 0) ? 'now' : '';
        });
      }
      if (opts.leftValue) dom.left.textContent = opts.leftValue();
      t0 = performance.now();
      if (card.ringMs) startRing(card.ringMs);
    }
    function startRing(ms) {
      const info = opts.ringInfo ? opts.ringInfo() : {};
      ring = D.fx.enso(dom.card, { goldAt: info.goldAt || 0, bestAt: info.bestAt || 0 });
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
        D.fx.pop(dom.question);
        D.audio.correct(out.streak || 1);
        if (out.bothDots) { D.fx.seal(dom.card); D.audio.thump(); }
        if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points));
      } else {
        D.audio.miss();
        D.fx.crack(dom.card);
        const p = dom.pips.children[out.index === undefined ? -1 : out.index];
        if (p) p.className = 'miss';
      }
      if (out.line) { dom.line.textContent = out.line; D.fx.fitCard(dom.wrap, dom.card); }
      if (opts.leftValue) dom.left.textContent = opts.leftValue();
      const wait = out.line ? 900 : out.correct ? 430 : 620;
      setTimeout(() => {
        const seal = dom.card.querySelector('.sealslam');
        if (seal) seal.remove();
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
