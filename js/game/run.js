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
      teachQueue = [], spentCard = false, taughtThisRound = null,
      pipMark = {}, multAtAsk = 1, askLine = false, slotCount = 0, lastTyped = '', sealShown = 'none';

  function start(root, opts) {
    const o = opts || {};
    rs = o.rs;
    done = o.onDone;
    onLeave = o.onLeave;
    teachQueue = [];
    taughtThisRound = new Set();
    pipMark = {};
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
    // The score says what it is (review 2026-09-24): a bare number read as coins.
    dom.score = u().el('span', { class: 'runscore num' }, '0');
    dom.scoreBox = u().el('div', { class: 'scorebox' },
                          [dom.score, u().el('span', { class: 'label' }, D.copy.summary.points)]);
    dom.streakN = u().el('div', { class: 'label' }, '');
    dom.mult = u().el('div', { class: 'mult hidden' }, '');
    dom.streak = u().el('div', { class: 'streak' }, [dom.streakN, dom.mult]);
    dom.pips = u().el('div', { class: 'pips' });
    for (let i = 0; i < total; i++) dom.pips.appendChild(u().el('i'));

    dom.label = u().el('div', { class: 'cardlabel' }, '');
    dom.question = u().el('div', { class: 'question' }, '');
    // The answer: each digit sits on its own short ink line right under the sum, in
    // ink at the numerals' weight. A miss leaves what was typed on the card, struck
    // through; after Show me the right answer sits beside it in pencil, to be inked
    // over (review 2026-09-24).
    dom.wrong = u().el('div', { class: 'wrong' });
    dom.typed = u().el('div', { class: 'typed' }, '');
    dom.slots = u().el('div', { class: 'slots' });
    dom.answer = u().el('div', { class: 'answer' }, [dom.wrong, dom.typed, dom.slots]);
    // The seal's corner: the pencil square underneath, the stamp on top once it comes,
    // one box (the seal kit's hanko stack).
    dom.seal = u().el('div', { class: 'cardseal' }, [
      u().el('span', { class: 'hanko-stack' }, [u().el('i', { class: 'hanko-pencil' }), u().el('i', { class: 'hanko' })]),
    ]);
    dom.time = u().el('div', { class: 'cardtime' }, '');
    dom.card = u().el('div', { class: 'card' }, [dom.seal, dom.label, dom.question, dom.answer, dom.time]);
    dom.wrap = u().el('div', { class: 'cardwrap' }, [dom.card]);
    dom.line = u().el('div', { class: 'diagline' }, '');
    dom.buttons = u().el('div', { class: 'missbtns idle' });
    pad = D.keypad.build({
      autoSubmit: !!D.state.flags.autoSubmit,
      onChange: paintAnswer,
      onSubmit: onSubmit,
      onEmpty: () => D.u.pulse(dom.answer, 'pop', 200),
    });
    dom.pad = pad.node;
    root.appendChild(u().el('div', { class: 'screen fit' }, [
      u().el('div', { class: 'runtop' }, [
        u().el('div', { class: 'row', style: { gap: '11px' } }, [dom.leave, dom.scoreBox]),
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
  // `ask` marks a line about the question while it is being asked (the first card's
  // line, the best-time tick, out of time, look again). The answer ends that moment,
  // so the line goes and the outcome has the slot: kept, the tick line sat over a
  // miss and the line about the two buttons never showed.
  function setLine(text, ask) {
    askLine = !!(ask && text);
    dom.line.textContent = text || '';
    refit();
  }
  /* The lines that teach a rule the first few times it matters (§13.3). They take
     the line slot when it is free and wait for the next card when it is not, and
     each one is counted only when it was actually on the screen. Written into one
     slot and flagged regardless, the first "Sealed" line was replaced in the same
     frame by "Bonus card" and never came back (audit 2026-09-14). */
  // `now` marks a line about this moment on this card (the timer running out, the
  // tick, the two buttons): it is said now or not at all. Queued, "Out of time. You
  // can still answer." came up after the answer was in (review 2026-09-24).
  function teach(key, text, now, ask) {
    const taught = D.state.flags.taught || (D.state.flags.taught = {});
    if ((taught[key] || 0) >= D.cfg.TEACH_TIMES) return false;
    // Once a round: an occasion is a round, not a card, or the streak line would
    // run on every card of a streak.
    if (taughtThisRound.has(key) || teachQueue.some(q => q.key === key)) return false;
    if (!dom.line.textContent) {
      taughtThisRound.add(key);
      taught[key] = (taught[key] || 0) + 1;
      setLine(text, ask);
      return true;
    }
    if (now) return false;
    taughtThisRound.add(key);
    teachQueue.push({ key: key, text: text });
    return false;
  }
  function countTaught(key) {
    const taught = D.state.flags.taught || (D.state.flags.taught = {});
    taught[key] = (taught[key] || 0) + 1;
    taughtThisRound.add(key);
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
  /* One box a digit, each on its own line. `hint` pencils in the digits to type (the
     shown answer). With no boxes (a step, a decimal) the answer is free text over
     one line. */
  function setSlots(n, hint) {
    slotCount = n;
    u().clear(dom.slots);
    const digits = hint === undefined || hint === null ? '' : String(hint);
    for (let i = 0; i < n; i++) dom.slots.appendChild(u().el('i', digits[i] ? { 'data-hint': digits[i] } : null));
    dom.answer.classList.toggle('free', n === 0);
    dom.typed.textContent = '';
  }
  function paintAnswer(v) {
    const s = v || '';
    if (!slotCount) { dom.typed.textContent = s; return; }
    const want = Math.max(slotCount, s.length);
    while (dom.slots.children.length < want) dom.slots.appendChild(u().el('i', { class: 'extra' }));
    while (dom.slots.children.length > want) dom.slots.lastChild.remove();
    Array.from(dom.slots.children).forEach((b, i) => { b.textContent = s[i] || ''; b.classList.toggle('on', !!s[i]); });
  }
  // A miss leaves the typed answer on the card and one dry stroke goes through it,
  // in ink (ART.md: failure is black, never red).
  function strikeWrong(v) {
    u().clear(dom.wrong);
    if (!v) return;
    dom.wrong.appendChild(u().el('span', { class: 'digits' }, v));
    dom.wrong.appendChild(u().el('i', { class: 'strike' }));
    dom.answer.classList.add('missed');
  }
  function clearWrong() {
    u().clear(dom.wrong);
    dom.answer.classList.remove('missed', 'reveal');
  }
  function paintTop(scoreDelay) {
    const r = rs.raw;
    countTo(dom.score, r.score, scoreDelay || 0);
    const mult = rs.comboMult();
    dom.streakN.textContent = r.combo > 0 ? D.copy.run.streak(r.combo) : '';
    dom.mult.textContent = D.copy.run.times(mult);
    dom.mult.classList.toggle('hidden', mult <= 1);
    // One dot a card: the card on the screen is an open ring, an answered card is
    // ink, and red when that answer counted toward a seal (review 2026-09-24).
    Array.from(dom.pips.children).forEach((p, i) => {
      p.className = pipMark[i] || (i < r.i ? 'done' : i === r.i ? 'now' : '');
    });
  }
  // The dot of the card an outcome belongs to: a right answer has already moved the
  // cursor on, a miss has not.
  function slotOf(out, fallback) {
    return out && out.card && typeof out.card.slot === 'number' ? out.card.slot : fallback;
  }
  // The score climbs rather than jumping, so a big card lands as a big number. After
  // a right answer it waits for the points to fly up to it.
  function countTo(node, target, delay) {
    const from = Number(node.dataset.v || 0);
    if (from === target) return;
    node.dataset.v = String(target);
    const at = performance.now() + (delay || 0), span = 360;
    (function step() {
      if (node.dataset.v !== String(target)) return;      // a newer count took over
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
    clearWrong();
    lastTyped = '';
    pad.clear();
    pad.setLive(true);
    paintTop();
    multAtAsk = rs.comboMult();

    const card = rs.raw.cards[rs.raw.i];
    // A comeback after a near miss or a guess pays single points, and its label says
    // so: it read "Double points." and paid single (review 2026-09-24).
    dom.label.textContent = c.last ? D.copy.run.lastCard
      : c.comeback ? (card.comebackMult === 1 ? D.copy.run.comebackPlain : D.copy.run.comebackLabel) : '';
    const fact = D.facts.get(card.id);
    setQuestion(c.question);
    pad.setMode(fact.input || 'number');
    setSlots(fact.input === 'number' || !fact.input ? c.digits : 0);
    pad.setDigits(c.digits);
    paintSeal(card);
    dom.time.textContent = '';
    dom.time.className = 'cardtime';
    spentCard = !!rs.raw.cardSpent;
    if (c.intro) setLine(c.intro, true);
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
  // A sum is set with its operators drawn at the numerals' weight; a question in
  // words (some Beyond cards) is set as words.
  function setQuestion(text) {
    const words = /[a-z]{2,}/i.test(text);
    dom.question.classList.toggle('words', words);
    if (words) dom.question.textContent = text; else D.fx.sum(dom.question, text);
  }
  /* The seal: nothing, a pencil square once the question is halfway (fast once),
     the stamp once it has been fast on two days. The pencil is drawn in full ink when
     a fast answer now would seal it, which is the whole explanation of what this card
     is worth; never in red, which is only ever the seal (review 2026-09-24). */
  function paintSeal(card) {
    const state = D.mastery.sealState(card.id);
    const eligible = ['warmup', 'comeback', 'scout', 'redemption'].indexOf(card.kind) < 0;
    const lit = eligible && state === 'fast' && D.mastery.canCountToday(card.id, rs.raw.day);
    dom.seal.className = 'cardseal' + (state === 'none' ? '' : ' ' + state) + (lit ? ' lit' : '');
    sealShown = state;
  }
  // A miss that takes a halfway mark away rubs the pencil square out. A lost seal
  // lifts off instead (liftSeal) and leaves its pencil square.
  function eraseSeal(card) {
    if (sealShown === 'fast' && D.mastery.sealState(card.id) === 'none') dom.seal.className = 'cardseal erase';
    sealShown = D.mastery.sealState(card.id);
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
    if (bestAt > 0.02) teach('tick', D.copy.run.firstTick, true, true);
    deadline = performance.now() + c.ringMs;
    ringSpan = c.ringMs;
    drawFrom = performance.now();
    runRing();
  }
  // The clock runs from the deadline, so a ring that paused for a slip picks up
  // exactly where the time is. The ensō is drawn in, head to tail, over its first
  // 180 ms (ART.md) while the clock already runs, so the ink never shows more time than
  // is left; with reduced motion it is there at once.
  let ringSpan = 1, drawFrom = 0;
  const DRAW_MS = 180;
  function runRing() {
    cancelAnimationFrame(raf);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function tick() {
      if (!enso) return;
      const now = performance.now(), left = deadline - now;
      const drawn = still ? 1 : D.u.clamp((now - drawFrom) / DRAW_MS, 0, 1);
      enso.set(Math.min(drawn, left / ringSpan));
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
      lastTyped = '';
      handle(out);
    }, D.cfg.RING_GRACE_MS);
  }
  function onOvertime() {
    if (enso) enso.set(0);
    // Running out of time is the newer news about this card: it takes the slot from an
    // earlier line about the asking (the tick line), which otherwise kept it.
    if (askLine) setLine('');
    teach('overtime', D.copy.run.overtime, true, true);
    clearTimeout(lateTimer);
    lateTimer = setTimeout(offerHelp, Math.max(0, D.cfg.RESCUE_BUTTON_MS - (performance.now() - t0)));
  }

  function onSubmit(v) {
    if (rs.raw.phase === 'rescue') return onStep(v);
    if (rs.raw.phase === 'reveal') return onReveal(v);
    if (rs.raw.phase !== 'card' || !pad.isLive()) return;
    const wasExpired = expired;
    expired = false;
    const rt = Math.round(performance.now() - t0);
    // The ring stops where the answer landed and stays on the card with its result.
    cancelAnimationFrame(raf);
    lastTyped = v;
    const out = rs.submit(v, rt);
    if (out && out.slip) return onSlip(out, v, wasExpired);
    clearTimeout(lateTimer);
    if (out && out.kind === 'correct') paintAnswer(v);   // the answer stays on its line
    handle(out);
  }

  /* A slip on a settled question (§13.3): the digits come off, the card waits for the
     answer again with its clock still running, and it says so. In silence the child
     thought the keys had not registered (review 2026-09-24). */
  function onSlip(out, typed, wasExpired) {
    paintAnswer(typed);
    D.fx.shake(dom.answer);
    D.audio.key();
    setTimeout(() => { if (!pad.value()) paintAnswer(''); }, 240);
    setLine(out.line, true);
    saveNow();
    if (enso && !wasExpired) runRing();
    else if (enso && wasExpired) { expired = false; onExpired(); }
  }

  function handle(out) {
    if (!out) return;
    // A result holds the pad quietly; only a miss kills it, because then the two
    // buttons are the only way on (§13.2 #10).
    if (out.kind === 'miss') pad.setLive(false); else pad.setHold();
    clearTimeout(lateTimer);
    dom.buttons.classList.add('idle');
    u().clear(dom.buttons);
    if (askLine) setLine('');
    if (out.kind === 'correct') pipMark[slotOf(out, rs.raw.i - 1)] = out.fast ? 'fast' : 'done';
    else if (out.kind === 'miss' && !out.slip) pipMark[slotOf(out, rs.raw.i)] = 'miss';
    // Points fly up to the score from the card, so the score climbs as they land.
    paintTop(out.kind === 'correct' && out.points ? 300 : 0);
    if (out.kind === 'correct') return onCorrect(out);
    if (out.kind === 'rescued' || out.kind === 'revealed') {
      if (out.line) setLine(out.line);
      commitAnd(out, out.line ? 620 : 260);
      return;
    }
    if (out.kind === 'miss') {
      strikeWrong(lastTyped);
      D.audio.miss();
      if (out.lostSeal) liftSeal(out);
      else if (out.card && out.card.id) eraseSeal(out.card);
      if (out.silent) { commitAnd(out, 520); return; }
      if (out.reveal) {                       // a placement round or a scout: the answer, then type it
        saveNow();
        setTimeout(() => showReveal(rs.revealInfo()), 520);
        return;
      }
      // A quick guess says what it cost; otherwise the first few misses say what
      // Break it down is, in the slot, now or not at all: queued, it came up on the
      // next card, where it meant nothing.
      if (out.line) setLine(out.line);
      if (out.intro && teach(out.introKey || 'rescue', out.intro, true) && out.introKey === 'rescueKeep') countTaught('rescue');
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
    // The points lift off the card and fly to the score, so "+80" is plainly points
    // and not coins (review 2026-09-24).
    if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points), null, dom.score);
    // Coins are seen arriving, in the shape they have on Home (§13.3).
    if (out.coins) D.fx.floatCoin(dom.card, out.coins);
    if (out.marks.indexOf('bonus') >= 0) D.audio.bonus();
    // How long it took, always, and red when it was fast: this is what "fast" means.
    // A card that came back spent prints no time: the ring was already empty.
    if (typeof out.rt === 'number' && !(out.card && out.card.slipRepair) && !spentCard) {
      dom.time.textContent = D.copy.run.time(out.rt);
      dom.time.className = 'cardtime' + (out.fast ? ' fast' : '');
      // A best time is said beside the time itself. As a toast it sat on the keypad.
      if (out.marks.indexOf('pb') >= 0) dom.time.appendChild(u().el('span', { class: 'pb' }, D.copy.run.pb));
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
      sealShown = now;
      // The thump lands with the stamp: the slam meets the paper 60 % into its 120 ms.
      if (now === 'sealed') { D.audio.thump(0.07); wait = Math.max(wait, 1000); } else { D.audio.stamp(); wait = Math.max(wait, 700); }
      if (out.sealed && teach('seal', D.copy.run.firstSeal)) wait = Math.max(wait, 1500);
      else if (out.stamped && !out.sealed && now === 'fast' && teach('stamp', D.copy.run.firstStamp)) wait = Math.max(wait, 1500);
    }
    if (out.lostSeal) liftSeal(out);
    // The streak is taught on the answer that steps it up. The line names every step,
    // so it is true at three, six or nine (review 2026-09-24).
    if (rs.comboMult() > multAtAsk && teach('streak', D.copy.run.firstStreak)) wait = Math.max(wait, 1200);
    wait += teachAfter(wait);
    commitAnd(out, wait);
  }

  /* A seal that comes off is seen coming off, and said the first few times. */
  function liftSeal(out) {
    dom.seal.className = 'cardseal sealed lift';
    sealShown = 'fast';
    teach('lostSeal', D.copy.run.lostSeal(out.card.id));
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
      lastTyped = '';
      handle(rs.submit('', Math.round(performance.now() - t0)));
    });
    dom.buttons.appendChild(b);
    refit();
  }

  function onRescue() {
    const out = rs.chooseRescue();
    dom.buttons.classList.add('idle');
    if (!out) return;
    stopRing();                               // the clock is over; the steps have the card
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
    clearWrong();
    setSlots(0);
    delete dom.typed.dataset.hint;
    pad.clear();
    dom.forced = false;
    pad.setMode(Number.isInteger(step.answer) ? 'number' : 'decimal');
    pad.setDigits(0);
    setStepPrompt(step.prompt);
    refit();
  }
  function setStepPrompt(text) {
    if (!dom.step) {
      dom.step = u().el('div', { class: 'stepline' }, '');
      dom.card.insertBefore(dom.step, dom.answer);
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
      dom.typed.dataset.hint = String(out.step.answer);   // the value to type, in pencil
      pad.setMode(Number.isInteger(out.step.answer) ? 'number' : 'decimal');
      return setStepPrompt(out.step.prompt);
    }
    if (out.kind === 'rescued') {
      clearStepPrompt();
      delete dom.typed.dataset.hint;
      pad.setHold();
      setLine(out.line);
      if (out.points) D.fx.float(dom.card, '+' + D.copy.num(out.points));
      paintTop();
      return commitAnd(out, 800);
    }
  }
  function showReveal(out) {
    if (!out) return;
    stopRing();
    clearStepPrompt();
    pad.setLive(true);
    const c = rs.raw.cards[rs.raw.i];
    dom.label.textContent = '';
    setQuestion(D.facts.display(c.id, c.flip));
    setLine(out.line);
    pad.clear();
    pad.setMode(out.input || 'number');
    const n = (out.input && out.input !== 'number') ? 0 : D.u.digitsOf(out.answer);
    setSlots(n, n ? out.answer : null);
    dom.answer.classList.add('reveal');
    pad.setDigits(n);
  }
  function onReveal(v) {
    if (!pad.isLive()) return;
    const out = rs.typedAnswer(v);
    if (!out) return;
    if (out.again) { pad.clear(); D.fx.splats(dom.card, 1); return; }
    paintAnswer(v);                           // inked over the pencil, and it stays
    pad.setHold();
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
