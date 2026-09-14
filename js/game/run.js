/* Dojo 12 — the round screen. This file binds an engine (D.runstate, or
   D.roundone for the placement rounds) to the DOM; every rule about scoring,
   seals, rescues and comebacks lives in the engine. The screen shows four things
   and nothing else: the points, the streak, where the round is up to, and the
   card with its seal. */
"use strict";
D.run = (function () {
  const u = () => D.u;
  let rs = null, dom = null, enso = null, raf = 0, deadline = 0, t0 = 0,
      pad = null, lateTimer = 0, done = null, onLeave = null, expired = false, holdTimer = 0,
      teachQueue = [], spentCard = false, taughtThisRound = null;

  function start(root, opts) {
    const o = opts || {};
    rs = o.rs;
    done = o.onDone;
    onLeave = o.onLeave;
    teachQueue = [];
    taughtThisRound = new Set();
    build(root);
    if (rs.raw.phase === 'reveal') { paintTop(); showCard(true); showReveal(rs.revealInfo()); return; }
    showCard();
  }

  function build(root) {
    u().clear(root);
    dom = {};
    const total = rs.raw.cards.length;
    dom.leave = u().el('button', { class: 'btn quiet holdbar', type: 'button', style: { padding: '5px 9px', fontSize: '13px' } },
                       [u().el('i', { class: 'fill' }), u().el('span', {}, D.copy.run.leave)]);
    bindHold(dom.leave);
    dom.score = u().el('div', { class: 'runscore num' }, '0');
    dom.streakN = u().el('div', { class: 'label' }, '');
    dom.mult = u().el('div', { class: 'mult hidden' }, '');
    dom.streak = u().el('div', { class: 'streak' }, [dom.streakN, dom.mult]);
    dom.pips = u().el('div', { class: 'pips' });
    for (let i = 0; i < total; i++) dom.pips.appendChild(u().el('i'));

    dom.label = u().el('div', { class: 'cardlabel' }, '');
    dom.question = u().el('div', { class: 'question' }, '');
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.seal = u().el('div', { class: 'cardseal' }, [u().el('i')]);
    dom.time = u().el('div', { class: 'cardtime' }, '');
    dom.card = u().el('div', { class: 'card' }, [dom.seal, dom.label, dom.question, dom.typed, dom.slots, dom.time]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    dom.buttons = u().el('div', { class: 'missbtns idle' });
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: v => { dom.typed.textContent = v; paintSlots(v.length); },
      onSubmit: onSubmit,
      onEmpty: () => D.u.pulse(dom.slots, 'pop', 200),
    });
    dom.pad = pad.node;
    root.appendChild(u().el('div', { class: 'screen fit' }, [
      u().el('div', { class: 'runtop' }, [
        u().el('div', { class: 'row', style: { gap: '11px' } }, [dom.leave, dom.score]),
        dom.streak,
      ]),
      dom.pips, dom.wrap, dom.line, dom.buttons, dom.pad,
    ]));
    D.fx.watchFit(dom.wrap, dom.card);
  }

  /* Leaving takes a hold, and the round is kept exactly where it is: the same
     thing closing the app does, so leaving can never dodge a miss. */
  function bindHold(btn) {
    const fill = btn.querySelector('.fill');
    const cancel = () => { clearTimeout(holdTimer); fill.style.transition = 'none'; fill.style.width = '0'; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      D.fx.toast(D.copy.run.leaveHold, 1200);
      fill.style.transition = 'width 800ms linear';
      fill.style.width = '100%';
      holdTimer = setTimeout(() => { saveNow(); leave(); }, 850);
    });
    for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(evt, cancel);
  }
  function leave() {
    stopRing();
    clearTimeout(lateTimer);
    if (onLeave) onLeave();
  }

  // Whatever appears under the card, the card gives way to it. Left alone it kept
  // the size it had when it was dealt and slid over the marks above it (the 375 by
  // 667 overlap, rework 2026-09-10).
  function refit() { D.fx.fitCard(dom.wrap, dom.card); }
  function setLine(text) {
    dom.line.textContent = text || '';
    refit();
  }
  /* The lines that teach a rule the first few times it matters (§13.3). They take
     the line slot when it is free and wait for the next card when it is not, and
     each one is counted only when it was actually on the screen. Written into one
     slot and flagged regardless, the first "Sealed" line was replaced in the same
     frame by "Bonus card" and never came back (audit 2026-09-14). */
  function teach(key, text) {
    const taught = D.state.flags.taught || (D.state.flags.taught = {});
    if ((taught[key] || 0) >= D.cfg.TEACH_TIMES) return false;
    // Once a round: an occasion is a round, not a card, or the streak line would
    // run on every card of a streak.
    if (taughtThisRound.has(key) || teachQueue.some(q => q.key === key)) return false;
    taughtThisRound.add(key);
    if (!dom.line.textContent) { taught[key] = (taught[key] || 0) + 1; setLine(text); return true; }
    teachQueue.push({ key: key, text: text });
    return false;
  }
  function teachNext() {
    if (dom.line.textContent || !teachQueue.length) return;
    const q = teachQueue.shift();
    const taught = D.state.flags.taught || (D.state.flags.taught = {});
    taught[q.key] = (taught[q.key] || 0) + 1;
    setLine(q.text);
  }
  // A teaching line queued behind a game line on the same card follows it on that
  // card, so the seal and the sentence about it are on the screen together.
  function teachAfter(ms) {
    if (!teachQueue.length) return 0;
    setTimeout(() => { setLine(''); teachNext(); }, ms);
    return 1300;
  }
  function paintSlots(typedCount) {
    Array.from(dom.slots.children).forEach((k, i) => k.classList.toggle('on', i < typedCount));
  }
  function setSlots(n) {
    u().clear(dom.slots);
    for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i'));
  }
  function paintTop() {
    const r = rs.raw;
    countTo(dom.score, r.score);
    const mult = rs.comboMult();
    const tier = D.cfg.COMBO_TIERS.indexOf(mult);
    dom.streakN.textContent = r.combo > 0 ? D.copy.run.streak(r.combo) : '';
    dom.mult.textContent = D.copy.run.times(mult);
    dom.mult.classList.toggle('hidden', mult <= 1);
    if (enso) enso.thickness(tier);
    Array.from(dom.pips.children).forEach((p, i) => {
      if (p.classList.contains('miss')) return;
      p.className = i < r.i ? 'done' : i === r.i ? 'now' : '';
    });
  }
  // The score climbs rather than jumping, so a big card lands as a big number.
  function countTo(node, target) {
    const from = Number(node.dataset.v || 0);
    if (from === target) return;
    node.dataset.v = String(target);
    const at = performance.now(), span = 360;
    (function step() {
      const k = D.u.clamp((performance.now() - at) / span, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = D.copy.num(Math.round(from + (target - from) * eased));
      if (k < 1) requestAnimationFrame(step);
    })();
  }

  /* ---- one card ---- */
  function showCard(quiet) {
    stopRing();
    clearTimeout(lateTimer);
    expired = false;
    const c = rs.present();
    if (!c) return finish();
    dom.buttons.classList.add('idle');
    u().clear(dom.buttons);
    setLine('');
    clearStepPrompt();
    pad.clear();
    pad.setLive(true);
    dom.typed.textContent = '';
    paintTop();

    dom.label.textContent = c.last ? D.copy.run.lastCard
      : c.comeback ? D.copy.run.comebackLabel : '';
    const card = rs.raw.cards[rs.raw.i];
    const fact = D.facts.get(card.id);
    setQuestion(c.question);
    pad.setMode(fact.input || 'number');
    setSlots(fact.input === 'number' || !fact.input ? c.digits : 0);
    pad.setDigits(c.digits);
    paintSeal(card);
    dom.time.textContent = '';
    dom.time.className = 'cardtime';
    spentCard = !!rs.raw.cardSpent;
    if (c.intro) setLine(c.intro);
    teachNext();
    if (c.last) D.audio.lastCard();

    t0 = performance.now();
    if (quiet) return;
    if (c.ringMs && !c.overtime) startRing(c);
    else {
      // A card that came back after Leave, or whose ring already ran out, shows the
      // ring emptied: the reason it will not count as fast is on the card (§13.3).
      if (c.ringMs && c.overtime) { enso = D.fx.enso(dom.card, { goldAt: 0, bestAt: 0 }); enso.set(0); }
      lateTimer = setTimeout(offerHelp, D.cfg.RESCUE_BUTTON_MS);
    }
  }
  function setQuestion(text) {
    dom.question.textContent = text;
    dom.question.classList.toggle('words', /[a-z]{2,}/i.test(text));
  }
  /* The seal: nothing, an outline once the question has been fast, stamped once
     it has been fast on two days. The outline is red when a fast answer now would
     stamp it, which is the whole explanation of what this card is worth. */
  function paintSeal(card) {
    const state = D.mastery.sealState(card.id);
    const eligible = ['warmup', 'comeback', 'scout', 'redemption'].indexOf(card.kind) < 0;
    const lit = eligible && state === 'fast' && D.mastery.canCountToday(card.id, rs.raw.day);
    dom.seal.className = 'cardseal' + (state === 'none' ? '' : ' ' + state) + (lit ? ' lit' : '');
  }

  function startRing(c) {
    const card = rs.raw.cards[rs.raw.i];
    const rec = D.mastery.peek(card.id);
    // The gold tick sits exactly where fast is judged (§13.3), and the black tick
    // is always drawn, at the ring's edge when the best is longer than the ring.
    const goldAt = D.u.clamp(1 - D.mastery.threshold(card.id) / c.ringMs, 0.03, 0.97);
    const bestAt = rec && rec.best && rec.ok >= D.cfg.GHOST_MIN_ATTEMPTS
      ? (rec.best >= c.ringMs ? 0.03 : D.u.clamp(1 - rec.best / c.ringMs, 0.03, 0.97)) : 0;
    enso = D.fx.enso(dom.card, { goldAt: goldAt, bestAt: bestAt });
    enso.thickness(D.cfg.COMBO_TIERS.indexOf(rs.comboMult()));
    if (bestAt > 0.02) teach('tick', D.copy.run.firstTick);
    deadline = performance.now() + c.ringMs;
    const span = c.ringMs;
    (function tick() {
      if (!enso) return;
      const left = deadline - performance.now();
      enso.set(left / span);
      if (left <= 0) { onExpired(); return; }
      raf = requestAnimationFrame(tick);
    })();
  }
  function stopRing() {
    cancelAnimationFrame(raf);
    if (enso) { enso.remove(); enso = null; }
  }
  /* A second of grace after the ring empties. On every card the card then stays
     up and keeps taking the answer, as slow (§13.3). */
  function onExpired() {
    if (expired) return;
    expired = true;
    cancelAnimationFrame(raf);
    setTimeout(() => {
      if (!expired) return;
      const out = rs.timeout();
      if (out && out.kind === 'overtime') return onOvertime();
      if (!out) return;
      stopRing();
      handle(out);
    }, D.cfg.RING_GRACE_MS);
  }
  function onOvertime() {
    if (enso) enso.set(0);
    teach('overtime', D.copy.run.overtime);
    clearTimeout(lateTimer);
    lateTimer = setTimeout(offerHelp, Math.max(0, D.cfg.RESCUE_BUTTON_MS - (performance.now() - t0)));
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
    clearTimeout(lateTimer);
    dom.buttons.classList.add('idle');
    u().clear(dom.buttons);
    paintTop();
    if (out.kind === 'correct') return onCorrect(out);
    if (out.kind === 'rescued' || out.kind === 'revealed') {
      if (out.line) setLine(out.line);
      commitAnd(out, out.line ? 620 : 260);
      return;
    }
    if (out.kind === 'miss') {
      // A slip on a settled question: the digits shake off and the same card comes
      // back, no crack, no buzz (§13.3). Cracked and re-dealt in silence, it read
      // as the game refusing to talk (audit 2026-09-14).
      if (out.slip) { D.fx.shake(dom.card); D.audio.key(); commitAnd(out, 300); return; }
      D.fx.crack(dom.card);
      D.audio.miss();
      markMiss(out);
      if (out.lostSeal) liftSeal(out);
      if (out.silent) { commitAnd(out, 520); return; }
      if (out.reveal) {                       // a placement round or a scout: the answer, then type it
        saveNow();
        setTimeout(() => showReveal(rs.revealInfo()), 520);
        return;
      }
      if (out.line) setLine(out.line);
      if (out.intro) teach('rescue', out.intro);
      showMissButtons(out);
      saveNow();                              // the miss is on the record before any choice
      return;
    }
    commitAnd(out, 300);
  }

  function onCorrect(out) {
    D.fx.pop(dom.question);
    D.audio.correct(rs.raw.combo);
    let wait = 420;
    if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points));
    // Coins are seen arriving, in the shape they have on Home (§13.3).
    if (out.coins) D.fx.floatCoin(dom.card, out.coins);
    if (out.marks.indexOf('bonus') >= 0) D.audio.bonus();
    if (out.marks.indexOf('pb') >= 0) D.fx.toast(D.copy.run.pb, 1100);
    // How long it took, always, and red when it was fast: this is what "fast" means.
    // A card that came back spent prints no time: the ring was already empty.
    if (typeof out.rt === 'number' && !(out.card && out.card.slipRepair) && !spentCard) {
      dom.time.textContent = D.copy.run.time(out.rt);
      dom.time.className = 'cardtime' + (out.fast ? ' fast' : '');
    }
    // The seal as it now stands. A check-in on a sealed question adds a day without
    // sealing it again; painted from "stamped" alone, the outline went over the
    // stamp (audit 2026-09-14).
    // The game's own line first (a comeback won, a bonus card), then the teaching
    // lines, which queue behind it and follow on the same card.
    if (out.line) { setLine(out.line); wait = Math.max(wait, 800); }
    if (out.stamped || out.sealed) {
      const now = out.sealNow || (out.sealed ? 'sealed' : 'fast');
      dom.seal.className = 'cardseal ' + now + ' press';
      if (now === 'sealed') { D.audio.thump(); wait = Math.max(wait, 1000); } else { D.audio.stamp(); wait = Math.max(wait, 700); }
      if (out.sealed && teach('seal', D.copy.run.firstSeal)) wait = Math.max(wait, 1500);
      else if (out.stamped && !out.sealed && now === 'fast' && teach('stamp', D.copy.run.firstStamp)) wait = Math.max(wait, 1500);
    }
    if (out.lostSeal) liftSeal(out);
    const mult = rs.comboMult();
    if (mult > 1 && teach('streak', D.copy.run.firstStreak(mult))) wait = Math.max(wait, 1200);
    wait += teachAfter(wait);
    commitAnd(out, wait);
  }

  /* A seal that comes off is seen coming off, and said the first few times. */
  function liftSeal(out) {
    dom.seal.className = 'cardseal sealed lift';
    teach('lostSeal', D.copy.run.lostSeal(out.card.id));
  }
  function markMiss(out) {
    // The card that was missed, which is not always the one the cursor is on: a
    // slip and a silent scout have already moved it along.
    const at = out && out.card && typeof out.card.slot === 'number' ? out.card.slot : rs.raw.i;
    const p = dom.pips.children[at];
    if (p) p.className = 'miss';
  }
  // The round as it stands, written at once: closing the app must never undo a card.
  function saveNow() {
    const snap = rs.snapshot();
    if (snap) { D.state.inRun = snap; D.save.commitNow(); }
  }
  function commitAnd(out, ms) {
    saveNow();
    setTimeout(() => {
      const seal = dom.card.querySelector('.sealslam');
      if (seal) seal.remove();
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
    dom.buttons.classList.remove('idle');
    pad.setLive(false);
    const help = u().el('button', { class: 'btn', type: 'button' }, D.copy.rescue.button);
    help.addEventListener('pointerdown', e => { e.preventDefault(); onRescue(); });
    dom.buttons.appendChild(help);
    if (!out.mandatory) {
      const show = u().el('button', { class: 'btn quiet', type: 'button' }, D.copy.rescue.skip);
      show.addEventListener('pointerdown', e => { e.preventDefault(); onSkip(); });
      dom.buttons.appendChild(show);
    }
    refit();                                  // both buttons are in place before the card is measured
  }
  // A card with no timer offers help after a long silence, and no text.
  function offerHelp() {
    if (rs.raw.phase !== 'card') return;
    const at = rs.raw.i;
    u().clear(dom.buttons);
    dom.buttons.classList.remove('idle');
    const b = u().el('button', { class: 'btn quiet', type: 'button' },
                     rs.raw.roundOne ? D.copy.rescue.skip : D.copy.rescue.button);
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      // A tap that lands after this card was answered belongs to nobody.
      if (rs.raw.i !== at || rs.raw.phase !== 'card' || !pad.isLive()) return;
      handle(rs.submit('', Math.round(performance.now() - t0)));
    });
    dom.buttons.appendChild(b);
    refit();
  }

  function onRescue() {
    const out = rs.chooseRescue();
    dom.buttons.classList.add('idle');
    if (!out) return;
    saveNow();
    if (out.kind === 'reveal') return showReveal(out);
    const c = rs.raw.cards[rs.raw.i];
    setQuestion(D.facts.display(c.id, c.flip));
    setLine(out.diagnosis || '');
    pad.setLive(true);
    showStep(rs.currentStep());
  }
  // Show me costs the streak, and the streak is seen going (§13.3).
  function onSkip() {
    dom.buttons.classList.add('idle');
    const out = rs.chooseSkip();
    if (!out) return;
    paintTop();
    D.u.pulse(dom.streak, 'pop', 200);
    saveNow();
    showReveal(out);
  }
  function showStep(step) {
    if (!step) return;
    dom.label.textContent = '';
    dom.typed.textContent = '';
    pad.clear();
    dom.forced = false;
    u().clear(dom.slots);
    pad.setMode(Number.isInteger(step.answer) ? 'number' : 'decimal');
    pad.setDigits(0);
    setStepPrompt(step.prompt);
    refit();
  }
  function setStepPrompt(text) {
    if (!dom.step) {
      dom.step = u().el('div', { class: 'stepline' }, '');
      dom.card.insertBefore(dom.step, dom.typed);
    }
    dom.step.textContent = text;
    dom.question.style.fontSize = '22px';
    dom.question.style.color = 'var(--ink2)';
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
    if (out.kind === 'step') {
      dom.forced = false;
      setLine('');
      if (out.splat) D.fx.splats(dom.card, 1);   // a wrong step is seen, then asked smaller
      return showStep(out.step);
    }
    if (out.kind === 'stepValue') {
      dom.forced = true;
      setLine(out.line);
      D.fx.splats(dom.card, 1);
      pad.setMode(Number.isInteger(out.step.answer) ? 'number' : 'decimal');
      return setStepPrompt(out.step.prompt);
    }
    if (out.kind === 'rescued') {
      clearStepPrompt();
      pad.setLive(false);
      setLine(out.line);
      if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points));
      paintTop();
      return commitAnd(out, 800);
    }
  }
  function showReveal(out) {
    if (!out) return;
    clearStepPrompt();
    pad.setLive(true);
    const c = rs.raw.cards[rs.raw.i];
    dom.label.textContent = '';
    setQuestion(D.facts.display(c.id, c.flip));
    setLine(out.line);
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
    if (out.again) { D.fx.splats(dom.card, 1); return; }
    pad.setLive(false);
    setLine('');
    commitAnd(out, 260);
  }

  function finish() {
    stopRing();
    clearTimeout(lateTimer);
    const summary = rs.finish ? rs.finish() : D.runstate.finishRun(rs);
    if (done) done(summary);
  }

  return { start };
})();
