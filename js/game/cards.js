/* Dojo 12 — the plain card screen, used by the black belt test. The test has no
   rescues, comebacks or redemption, so it does not need the round screen; it
   needs a question, a timer, a keypad and honest feedback. It is drawn like the
   round's card: the sum with its operators at the numerals' weight, the answer in
   ink on one short line, a miss struck through, a keypad that holds still while a
   card shows its result (review 2026-09-24). */
"use strict";
D.cards = (function () {
  const u = () => D.u;

  function start(root, opts) {
    const dom = {};
    let pad = null, ring = null, raf = 0, deadline = 0, t0 = 0, busy = false, expired = false,
        slotCount = 0, typed = '';

    u().clear(root);
    dom.left = u().el('div', { class: 'runscore num' }, opts.leftValue ? opts.leftValue() : '');
    dom.pips = u().el('div', { class: 'pips' + (opts.total > 10 ? ' many' : '') });
    if (opts.total) for (let i = 0; i < opts.total; i++) dom.pips.appendChild(u().el('i'));
    dom.question = u().el('div', { class: 'question' }, '');
    dom.wrong = u().el('div', { class: 'wrong' });
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.answer = u().el('div', { class: 'answer' }, [dom.wrong, dom.typed, dom.slots]);
    dom.card = u().el('div', { class: 'card' }, [dom.question, dom.answer]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: paintAnswer,
      onSubmit: onSubmit,
      onEmpty: () => D.u.pulse(dom.answer, 'pop', 200),
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

    function setSlots(n) {
      slotCount = n;
      u().clear(dom.slots);
      for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i'));
      dom.answer.classList.toggle('free', n === 0);
      dom.typed.textContent = '';
    }
    function paintAnswer(v) {
      const s = v || '';
      if (!slotCount) { dom.typed.textContent = s; return; }
      const want = Math.max(slotCount, s.length);
      while (dom.slots.children.length < want) dom.slots.appendChild(u().el('i'));
      while (dom.slots.children.length > want) dom.slots.lastChild.remove();
      Array.from(dom.slots.children).forEach((b, i) => { b.textContent = s[i] || ''; b.classList.toggle('on', !!s[i]); });
    }
    function stopRing() { cancelAnimationFrame(raf); if (ring) { ring.remove(); ring = null; } }

    function show(card) {
      stopRing();
      expired = false;
      if (!card) return finish();
      busy = false;
      typed = '';
      u().clear(dom.wrong);
      dom.answer.classList.remove('missed');
      pad.setLive(true);
      pad.clear();
      dom.line.textContent = card.intro || '';
      D.fx.fitCard(dom.wrap, dom.card);
      const words = /[a-z]{2,}/i.test(card.question);
      dom.question.classList.toggle('words', words);
      if (words) dom.question.textContent = card.question; else D.fx.sum(dom.question, card.question);
      pad.setMode(card.input || 'number');
      setSlots(card.input && card.input !== 'number' ? 0 : card.digits);
      pad.setDigits(card.digits);
      if (opts.total) {
        Array.from(dom.pips.children).forEach((p, i) => {
          if (p.classList.contains('miss') || p.classList.contains('done')) return;
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
      setTimeout(() => { if (expired && !busy) { stopRing(); typed = pad.value(); deliver(opts.timeout ? opts.timeout() : null); } },
                 D.cfg.RING_GRACE_MS);
    }
    function onSubmit(v) {
      if (busy || !pad.isLive()) return;
      expired = false;
      busy = true;
      cancelAnimationFrame(raf);               // the ring stops where the answer landed
      typed = v;
      deliver(opts.answer(v, Math.round(performance.now() - t0)));
    }
    function deliver(out) {
      if (!out) return finish();
      pad.setHold();                           // the next card comes by itself
      const p = dom.pips.children[out.index === undefined ? -1 : out.index];
      if (out.correct) {
        paintAnswer(typed);                    // the answer stays on its line
        D.fx.pop(dom.question);
        D.audio.correct(out.streak || 1);
        if (out.sealed) { D.fx.seal(dom.card); D.audio.thump(0.07); }
        if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points), null, dom.left);
        if (p) p.className = 'done';
      } else {
        D.audio.miss();
        // What was typed stays, struck through in one dry stroke (ART.md).
        if (typed) {
          dom.wrong.appendChild(u().el('span', { class: 'digits' }, typed));
          dom.wrong.appendChild(u().el('i', { class: 'strike' }));
          dom.answer.classList.add('missed');
        }
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
