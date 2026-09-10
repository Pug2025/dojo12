/* Dojo 12 — the run screen. This file only binds D.runstate to the DOM; every
   rule about scoring, rescues, comebacks and redemption lives in the engine. */
"use strict";
D.run = (function () {
  const u = () => D.u;
  let rs = null, dom = null, ring = null, raf = 0, deadline = 0, t0 = 0,
      pad = null, lateTimer = 0, done = null, expired = false;

  function start(root, opts) {
    const o = opts || {};
    rs = o.rs;
    done = o.onDone;
    build(root);
    showCard();
  }

  function build(root) {
    D.u.clear(root);
    const total = rs.raw.cards.length;
    dom = {};
    dom.score = u().el('div', { class: 'runscore num' }, '0');
    dom.combo = u().el('div', { class: 'combo off' }, '');
    dom.pips = u().el('div', { class: 'pips' });
    for (let i = 0; i < total; i++) dom.pips.appendChild(u().el('i', { class: 'pip' }));
    dom.label = u().el('div', { class: 'cardlabel' }, '');
    dom.question = u().el('div', { class: 'question' }, '');
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.card = u().el('div', { class: 'card' }, [dom.label, dom.question, dom.typed, dom.slots]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    dom.buttons = u().el('div', { class: 'miss-buttons hidden' });
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: v => { dom.typed.textContent = v; paintSlots(v.length); },
      onSubmit: onSubmit,
    });
    dom.pad = pad.node;
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'runtop' }, [dom.score, dom.pips, dom.combo]),
      dom.wrap, dom.line, dom.buttons, dom.pad,
    ]));
  }

  function paintSlots(typedCount) {
    Array.from(dom.slots.children).forEach((k, i) => k.classList.toggle('on', i < typedCount));
  }
  function setSlots(n) {
    u().clear(dom.slots);
    for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i', { class: 'slot' }));
  }
  function paintTop() {
    const r = rs.raw;
    countTo(dom.score, r.score);
    const mult = rs.comboMult();
    const tier = D.cfg.COMBO_TIERS.indexOf(mult);
    dom.combo.textContent = mult > 1 ? mult + '×' : '';
    dom.combo.className = 'combo' + (tier > 0 ? ' t' + tier : '');
    dom.wrap.classList.toggle('hot', tier >= 2);
    Array.from(dom.pips.children).forEach((p, i) => {
      if (p.classList.contains('miss')) return;
      p.className = 'pip' + (i < r.i ? ' done' : i === r.i ? ' now' : '');
    });
  }
  // The score climbs rather than jumping, so a big card lands as a big number.
  function countTo(node, target) {
    const from = Number(node.dataset.v || 0);
    if (from === target) return;
    node.dataset.v = String(target);
    const t0 = performance.now(), span = 380;
    (function step() {
      const k = D.u.clamp((performance.now() - t0) / span, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = D.copy.num(Math.round(from + (target - from) * eased));
      if (k < 1) requestAnimationFrame(step);
    })();
  }

  /* ---- one card ---- */
  function showCard() {
    stopRing();
    clearTimeout(lateTimer);
    expired = false;
    const c = rs.present();
    if (!c) return finish();
    dom.buttons.classList.add('hidden');
    u().clear(dom.buttons);
    dom.line.textContent = '';
    dom.card.classList.remove('gold');
    pad.clear();
    pad.setLive(true);
    dom.typed.textContent = '';
    paintTop();

    dom.label.textContent = c.last ? D.copy.run.lastCard : c.comeback ? D.copy.run.comebackLabel : '';
    if (c.comeback) dom.card.classList.add('gold');
    dom.question.textContent = c.question;
    const fact = D.facts.get(rs.raw.cards[rs.raw.i].id);
    pad.setMode(fact.input || 'number');
    setSlots(fact.input === 'number' || !fact.input ? c.digits : 0);
    pad.setDigits(c.digits);
    if (c.last) D.audio.lastCard();

    t0 = performance.now();
    if (c.ringMs) startRing(c);
    else lateTimer = setTimeout(offerRescue, D.cfg.RESCUE_BUTTON_MS);
  }

  function startRing(c) {
    const card = rs.raw.cards[rs.raw.i];
    const rec = D.mastery.peek(card.id);
    const goldAt = D.u.clamp(1 - D.mastery.threshold(card.id) / c.ringMs, 0, 1);
    const ghost = rec && rec.best && rec.ok >= D.cfg.GHOST_MIN_ATTEMPTS
      ? D.u.clamp(1 - rec.best / c.ringMs, 0, 1) : 0;
    ring = D.fx.ring(dom.card, { goldAt: goldAt, ghostAt: ghost });
    deadline = performance.now() + c.ringMs;
    const span = c.ringMs;
    (function tick() {
      const left = deadline - performance.now();
      if (!ring) return;
      ring.set(left / span);
      if (left <= 0) { onExpired(); return; }
      raf = requestAnimationFrame(tick);
    })();
  }
  function stopRing() {
    cancelAnimationFrame(raf);
    if (ring) { ring.remove(); ring = null; }
  }
  // A second of grace after the ring empties, then the card is scored as a miss.
  function onExpired() {
    if (expired) return;
    expired = true;
    cancelAnimationFrame(raf);
    setTimeout(() => {
      if (!expired) return;
      stopRing();
      handle(rs.timeout());
    }, D.cfg.RING_GRACE_MS);
  }

  function onSubmit(v) {
    if (rs.raw.phase === 'rescue') return onStep(v);
    if (rs.raw.phase === 'reveal') return onReveal(v);
    if (rs.raw.phase !== 'card' || !pad.isLive()) return;
    expired = false;
    clearTimeout(lateTimer);
    const rt = Math.round(performance.now() - t0);
    stopRing();
    handle(rs.submit(v, rt));
  }

  function handle(out) {
    if (!out) return;
    pad.setLive(false);
    paintTop();
    if (out.kind === 'correct') {
      D.fx.pop(dom.card);
      D.audio.correct(rs.raw.combo);
      const tier = D.cfg.COMBO_TIERS.indexOf(rs.comboMult());
      if (out.gold) {
        dom.card.classList.add('gold');
        D.u.pulse(dom.card, 'ignite', 700);
        D.audio.gold();
        D.fx.burst(dom.card, 16, 'gold');
        D.fx.float(dom.card, '+' + out.points, 'gold');
      } else if (out.marks.indexOf('bonus') >= 0) {
        D.audio.bonus();
        D.fx.burst(dom.card, 14, 'gold');
        D.fx.float(dom.card, '+' + out.points, 'gold');
      } else if (out.points) {
        D.fx.burst(dom.card, 4 + tier * 4);
        D.fx.float(dom.card, '+' + out.points);
      }
      if (out.marks.indexOf('pb') >= 0) D.fx.toast(D.copy.run.pb, 1200);
      if (out.line) dom.line.textContent = out.line;
      commitAnd(out, out.line ? 900 : 460);
      return;
    }
    if (out.kind === 'rescued' || out.kind === 'revealed') {
      if (out.line) dom.line.textContent = out.line;
      commitAnd(out, out.line ? 700 : 300);
      return;
    }
    if (out.kind === 'miss') {
      D.fx.crack(dom.card);
      D.audio.miss();
      markMiss();
      if (out.slip || out.silent) { commitAnd(out, 520); return; }
      dom.line.textContent = out.line || out.intro || '';
      showMissButtons(out);
      return;
    }
    commitAnd(out, 300);
  }
  function markMiss() {
    const p = dom.pips.children[rs.raw.i];
    if (p) p.classList.add('miss');
  }
  function commitAnd(out, ms) {
    D.state.inRun = rs.snapshot();
    D.save.commit();
    setTimeout(() => {
      if (out.redemptionStart) {
        D.fx.toast(out.redemptionStart, 1800);
        setTimeout(next, 700);
        return;
      }
      next();
    }, ms);
  }
  function next() {
    if (rs.isDone()) return finish();
    showCard();
  }

  /* ---- the miss (PLAN §6.7). No words, two buttons. ---- */
  function showMissButtons(out) {
    u().clear(dom.buttons);
    dom.buttons.classList.remove('hidden');
    pad.setLive(false);                        // the only moves here are the two buttons
    const rescue = u().el('button', { class: 'btn primary', type: 'button' }, D.copy.rescue.button);
    rescue.addEventListener('pointerdown', e => { e.preventDefault(); onRescue(); });
    dom.buttons.appendChild(rescue);
    if (!out.mandatory) {
      const skip = u().el('button', { class: 'btn ghost', type: 'button' }, D.copy.rescue.skip);
      skip.addEventListener('pointerdown', e => { e.preventDefault(); onSkip(); });
      dom.buttons.appendChild(skip);
    }
  }
  // A card with no ring gets a Rescue button after a long silence, and no text.
  function offerRescue() {
    if (rs.raw.phase !== 'card') return;
    u().clear(dom.buttons);
    dom.buttons.classList.remove('hidden');
    const b = u().el('button', { class: 'btn ghost', type: 'button' }, D.copy.rescue.button);
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      handle(rs.submit('', Math.round(performance.now() - t0)));
    });
    dom.buttons.appendChild(b);
  }

  function onRescue() {
    const out = rs.chooseRescue();
    dom.buttons.classList.add('hidden');
    if (!out) return;
    if (out.kind === 'reveal') return showReveal(out);
    const c = rs.raw.cards[rs.raw.i];
    dom.question.textContent = D.facts.display(c.id, c.flip);
    dom.line.textContent = out.diagnosis || '';
    pad.setLive(true);
    showStep(rs.currentStep());
  }
  function onSkip() {
    dom.buttons.classList.add('hidden');
    showReveal(rs.chooseSkip());
  }
  function showStep(step) {
    if (!step) return;
    dom.label.textContent = '';
    dom.typed.textContent = '';
    pad.clear();
    dom.forced = false;
    u().clear(dom.slots);
    pad.setMode('number');
    pad.setDigits(0);
    setStepPrompt(step.prompt);
  }
  function setStepPrompt(text) {
    if (!dom.step) {
      dom.step = u().el('div', { class: 'stepline' }, '');
      dom.card.insertBefore(dom.step, dom.typed);
    }
    dom.step.textContent = text;
    dom.question.style.fontSize = '26px';
    dom.question.style.color = 'var(--dim)';
  }
  function clearStepPrompt() {
    if (dom.step) { dom.step.remove(); dom.step = null; }
    dom.question.style.fontSize = '';
    dom.question.style.color = '';
  }
  function onStep(v) {
    if (!pad.isLive()) return;
    const out = dom.forced ? rs.stepForced(v) : rs.stepSubmit(v);
    if (!out) return;
    pad.clear();
    dom.typed.textContent = '';
    if (out.kind === 'step') { dom.forced = false; dom.line.textContent = ''; return showStep(out.step); }
    if (out.kind === 'stepValue') {
      dom.forced = true;
      dom.line.textContent = out.line;
      D.fx.shake(dom.card);
      return setStepPrompt(out.step.prompt);
    }
    if (out.kind === 'rescued') {
      clearStepPrompt();
      pad.setLive(false);
      dom.line.textContent = out.line;
      if (out.points) D.fx.float(dom.card, '+' + out.points);
      paintTop();
      return commitAnd(out, 800);
    }
  }
  function showReveal(out) {
    clearStepPrompt();
    pad.setLive(true);
    const c = rs.raw.cards[rs.raw.i];
    dom.label.textContent = '';
    dom.question.textContent = D.facts.display(c.id, c.flip);
    dom.line.textContent = out.line;
    dom.typed.textContent = '';
    pad.clear();
    pad.setMode(out.input || 'number');
    const n = (out.input && out.input !== 'number') ? 0 : D.u.digitsOf(out.answer);
    setSlots(n);
    pad.setDigits(n);
  }
  function onReveal(v) {
    if (!pad.isLive()) return;
    const out = rs.typedAnswer(v);
    pad.clear();
    dom.typed.textContent = '';
    if (!out) return;
    if (out.again) { D.fx.shake(dom.card); return; }
    pad.setLive(false);
    dom.line.textContent = '';
    commitAnd(out, 260);
  }

  function finish() {
    stopRing();
    clearTimeout(lateTimer);
    const summary = D.runstate.finishRun(rs);
    if (done) done(summary);
  }

  return { start };
})();
