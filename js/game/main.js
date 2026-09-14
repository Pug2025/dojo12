/* Dojo 12 — screens and the flow between them (ART.md for the look, PLAN §7.1
   for what each screen holds). Four things a child tracks: points for the round,
   coins to spend, a level that stocks the shop, and one belt moved by sealed
   questions. */
"use strict";
D.main = (function () {
  const u = () => D.u;
  let root = null;
  let pendingReload = false;

  function boot() {
    root = document.getElementById('app');
    D.beyond.build();
    D.audio.install();
    registerWorker();
    if (D.install.needsInstall()) { D.install.render(root); return; }
    const list = D.save.profiles();
    if (!list.length) return firstLaunch();
    if (list.length > 1) return profilePick(list);
    open(list[0].slug);
  }

  function open(slug) {
    D.save.loadProfile(slug);
    D.shop.apply();
    D.save.touchDay();
    // A belt test that was walked away from is a fail, and it stays stamped.
    if (D.state.flags.testInProgress) {
      const prog = D.state.flags.testProgress;
      D.state.tests.push({ day: (prog && prog.day) || D.u.gameDay(), key: 'black', passed: false,
                           abandoned: true, correct: prog ? prog.correct : 0,
                           total: prog ? prog.total : D.cfg.TEST_CARDS,
                           medianRt: prog ? D.u.median(prog.rts) : null });
      while (D.state.tests.length > 100) D.state.tests.shift();
      D.state.flags.testInProgress = null;
      D.state.flags.testProgress = null;
      D.save.commitNow();
    }
    D.scheduler.ensureProgression();
    if (!D.state.flags.tryoutDone) return D.state.placementHalf ? startRoundOne() : intro();
    home();
  }

  /* ---- first launch ---- */
  function firstLaunch() {
    u().clear(root);
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    autocapitalize: 'words', maxlength: '14' });
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.first.start);
    const startNamed = () => {
      const name = (field.value || '').trim();
      if (!name) { D.fx.toast(D.copy.first.nameNeeded, 1600); field.focus(); return; }
      D.save.startProfile(name, 'washi');
      D.shop.apply();
      D.scheduler.ensureProgression();
      D.save.commitNow();
      paperPick();
    };
    go.addEventListener('click', startNamed);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') startNamed(); });
    // A lost phone or a deleted icon comes back through here, before round 1.
    const box = u().el('div', { class: 'col', style: { gap: '9px' } });
    const link = u().el('button', { class: 'link small', type: 'button' }, D.copy.first.haveSave);
    link.addEventListener('click', () => toggleRestore(box));
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'titlebar' }, D.copy.first.askName),
      field, go,
      u().el('div', { class: 'grow' }),
      link, box,
    ]));
    setTimeout(() => field.focus(), 120);
  }

  /* Two papers are free. The rest are shop stock, so nothing here is taken back. */
  function paperPick() {
    u().clear(root);
    const list = u().el('div', { class: 'col', style: { gap: '9px' } });
    for (const value of D.cfg.FREE_PAPERS) {
      const b = u().el('button', { class: 'btn wide row between', type: 'button' }, [
        u().el('span', {}, D.copy.shop.names['theme:' + value]),
        D.shop.paperSwatch(value),
      ]);
      b.addEventListener('click', () => {
        D.state.profile.theme = value;
        D.state.cosmetics.equipped.theme = value;
        D.state.cosmetics.free = 'theme:' + value;
        D.shop.apply();
        D.save.commitNow();
        intro();
      });
      list.appendChild(b);
    }
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'titlebar' }, D.copy.first.pickPaper),
      list,
      u().el('div', { class: 'small dim t13' }, D.copy.first.paperNote),
      u().el('div', { class: 'grow' }),
    ]));
  }

  /* ---- the one screen before round 1 (2026-09-14). The timer, the seal and the
     streak are taught the first time each one happens. ---- */
  function intro() {
    u().clear(root);
    const card = u().el('div', { class: 'card', style: { width: '210px', height: '210px', '--cs': '210px' } }, [
      u().el('div', { class: 'question' }, '7 × 8'),
      u().el('div', { class: 'slots' }, [u().el('i', { class: 'on' }), u().el('i')]),
    ]);
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.intro.start);
    go.addEventListener('click', startRoundOne);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'cardwrap', style: { flex: 'none' } }, [card]),
      u().el('div', { class: 'titlebar' }, D.copy.intro.title),
      u().el('div', { class: 't15' }, D.copy.intro.body),
      u().el('div', { class: 'grow' }),
      go,
    ]));
  }

  /* ---- round 1: the same screen as every round ---- */
  function startRoundOne() {
    D.audio.unlock();
    const saved = D.state.inRun && D.state.inRun.roundOne ? D.state.inRun : null;
    const ro = D.roundone.create(saved ? { resume: saved } : {});
    D.state.inRun = ro.snapshot();
    D.save.commitNow();
    D.__rs = ro;
    D.run.start(root, { rs: ro, onDone: roundOneEnd, onLeave: intro });
  }
  /* The end of a placement round. Before the last one it is the score and Next
     round; after it, where the child starts (§13.3). */
  function roundOneEnd(sum) {
    u().clear(root);
    const lines = u().el('div', { class: 'lines' });
    if (sum.placementContinues) {
      if (D.state.progress.fastToday) lines.appendChild(fastTodayRow(D.state.progress.fastToday));
    } else {
      const focus = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
      lines.appendChild(u().el('div', { class: 't17' }, focus.length ? D.copy.roundOne.start(focus) : D.copy.roundOne.allOpen));
      lines.appendChild(u().el('div', { class: 't15 dim' }, D.copy.roundOne.rest));
      if (D.state.progress.fastToday) lines.appendChild(fastTodayRow(D.state.progress.fastToday));
      lines.appendChild(u().el('div', { class: 'row', style: { gap: '7px' } }, [
        u().el('i', { class: 'coin' }),
        u().el('div', { class: 't15' }, D.copy.roundOne.coins + ' ' + D.copy.home.coins(D.state.progress.coins) + '.'),
      ]));
      lines.appendChild(u().el('div', { class: 't15' }, D.copy.roundOne.xp));
    }
    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.roundOne.play);
    again.addEventListener('click', sum.placementContinues ? startRoundOne : startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.roundOne.home);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.roundOne.titleN(sum.roundNo || 1)),
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 't44 num' }, D.copy.num(sum.score)),
        u().el('div', { class: 'label' }, D.copy.summary.points),
      ]),
      lines,
      sum.placementContinues ? null : beltPlate(D.belt.info(), [], false),
      u().el('div', { class: 'grow' }),
      again, back,
    ]));
    D.save.commitNow();
  }
  // "Fast today: 3" with a red tick for each one.
  function fastTodayRow(n) {
    const ticks = u().el('div', { class: 'fastticks' });
    for (let i = 0; i < Math.min(n, 12); i++) ticks.appendChild(u().el('i'));
    return u().el('div', { class: 'row', style: { gap: '9px' } }, [
      u().el('div', { class: 't15' }, D.copy.summary.fastToday(n)), ticks,
    ]);
  }

  /* ---- home ---- */
  function home() {
    if (pendingReload && !busy()) {
      pendingReload = false;
      D.fx.toast(D.copy.settings.updated, 1400);
      setTimeout(() => location.reload(), 1200);
    }
    u().clear(root);
    const p = D.state.progress;
    // Home ends a streak (§13.3); Next round carries it.
    p.carryCombo = 0;
    // A stripe tied by a round that was left is settled here and announced by the
    // next summary; unsettled, the plate read "Sealed 2 of 1" (replay 2026-09-14).
    const tied = D.belt.update();
    if (tied.length) p.pendingBelt = (p.pendingBelt || []).concat(tied);
    const lvl = D.xp.levelFor(p.xp);
    const info = D.belt.info();
    const worn = D.shop.equipped('mark');

    const head = u().el('div', { class: 'home-head' }, [
      u().el('div', { class: 'row', style: { gap: '9px' } }, [
        worn ? D.fx.markGlyph(worn) : null,
        u().el('div', { class: 'home-name' }, D.state.profile.name),
      ]),
      u().el('div', { class: 'col', style: { alignItems: 'flex-end' } }, [
        u().el('div', { class: 't17', style: { fontWeight: '700' } }, D.copy.home.level(lvl.level)),
        u().el('div', { class: 't13 dim' }, D.copy.home.xpline(lvl.into, lvl.need)),
      ]),
    ]);
    const xp = u().el('div', { class: 'xpline' }, [
      u().el('i', { style: { width: Math.round(100 * lvl.into / lvl.need) + '%' } }),
    ]);

    const belt = beltPlate(info, [], true);
    const counts = u().el('div', { class: 'sumline' }, [
      u().el('span', {}, D.copy.home.sealed(info.sealed)),
      D.state.pbs.score ? u().el('span', { class: 'dim' }, D.copy.home.best(D.state.pbs.score)) : null,
    ]);

    const workLine = workingLine();
    const today = D.copy.home.today(p.runsToday || 0, p.fastToday || 0, D.scheduler.sealablePool().length);
    const nudgeItem = D.shop.nudge();

    const waiting = D.state.inRun && !D.state.inRun.finished;
    const play = u().el('button', { class: 'btn ink wide', type: 'button' }, waiting ? D.copy.home.carryOn : D.copy.home.play);
    play.addEventListener('click', startRun);
    const nav = u().el('div', { class: 'navrow' }, [
      link(D.copy.home.grid, () => D.grid.render(root, home)),
      link(D.copy.home.belt, () => D.belts.render(root, home, startTest)),
      link(D.copy.home.shop, () => D.shop.render(root, home)),
      link(D.copy.home.settings, settings),
    ]);

    root.appendChild(u().el('div', { class: 'screen' }, [
      head, xp,
      u().el('div', { class: 'grow' }),
      today ? u().el('div', { class: 't15', style: { fontWeight: '700' } }, today) : null,
      belt, counts,
      workLine ? u().el('div', { class: 't15' }, workLine) : null,
      u().el('div', { class: 'row', style: { gap: '7px' } }, [
        u().el('i', { class: 'coin' }), u().el('div', { class: 't15' }, D.copy.home.coins(p.coins)),
        nudgeItem ? u().el('div', { class: 't13 dim' }, D.copy.home.nudge(D.copy.shop.names[nudgeItem.id], nudgeItem.price, p.coins)) : null,
      ]),
      u().el('div', { class: 'grow' }),
      play, nav,
    ]));
    if (D.state.flags.clockFrozenUntil) {
      D.fx.toast(D.copy.settings.clockMoved(D.state.flags.clockFrozenUntil), 3000);
    }
  }
  /* The belt bar: sealed questions solid, questions fast once as half marks in a
     paler shade, never full before the stripe is tied (§13.3). */
  function beltFill(info) {
    if (info.black || !info.nextAt) return { solid: 100, pale: 100 };
    const span = Math.max(1, info.nextAt - info.prevAt);
    const solid = D.u.clamp((info.sealed - info.prevAt) / span, 0, 1);
    const pale = D.u.clamp((info.sealed - info.prevAt + 0.5 * (info.outlined || 0)) / span, 0, (span - 0.5) / span);
    return { solid: Math.round(100 * solid), pale: Math.round(100 * Math.max(solid, pale)) };
  }
  function beltPlate(info, events, tall) {
    const fill = beltFill(info);
    const tied = events && events.length;
    const plate = u().el('div', { class: 'plate' + (tall ? ' lift' : '') }, [
      beltBand(info, tall, tied),
      u().el('div', { class: tall ? 't22' : 't17', style: { fontWeight: '700' } }, D.copy.belt.now(info.belt, info.stripes)),
      u().el('div', { class: 'bar-fill' }, [
        u().el('i', { class: 'pale', style: { width: fill.pale + '%' } }),
        u().el('i', { style: { width: fill.solid + '%' } }),
      ]),
      u().el('div', { class: 't13 dim' }, info.black ? D.copy.belt.filled(info.sealed) : D.copy.belt.toNext(info)),
    ]);
    return plate;
  }
  // Which table the rounds are working on, how far it is, and when the next one opens (§13.3).
  function workingLine() {
    const focusKey = D.state.focus.primary, second = D.state.focus.secondary;
    if (!focusKey) return null;
    const items = D.mastery.activeItems(focusKey);
    const sealed = items.filter(id => D.mastery.isSealed(id)).length;
    const next = D.scheduler.nextUnopened();
    const days = D.scheduler.daysUntilNext();
    return second ? D.copy.home.workingTwo(focusKey, sealed, items.length, second, next, days)
                  : D.copy.home.working(focusKey, sealed, items.length, next, days);
  }
  // A belt drawn as a belt: two tips, the cloth, the black bar with its stripes.
  // A stripe just tied slides on.
  function beltBand(info, tall, tied) {
    const bar = u().el('div', { class: 'bar' });
    for (let i = 0; i < info.stripes; i++) bar.appendChild(u().el('i', { class: tied && i === info.stripes - 1 ? 'new' : '' }));
    return u().el('div', { class: 'beltband b-' + info.belt + (tall ? ' tall' : '') },
                  [u().el('div', { class: 'tip' }), u().el('div', { class: 'cloth' }), bar, u().el('div', { class: 'tip' })]);
  }
  function link(text, fn) {
    const b = u().el('button', { class: 'link', type: 'button' }, text);
    b.addEventListener('click', fn);
    return b;
  }
  function tile(text, fn) {
    const b = u().el('button', { class: 'btn wide', type: 'button' }, text);
    b.addEventListener('click', fn);
    return b;
  }

  /* ---- a round ---- */
  function startRun() {
    D.audio.unlock();
    D.save.touchDay();
    D.scheduler.ensureProgression();
    const rs = D.state.inRun && !D.state.inRun.finished
      ? D.runstate.resume(D.state.inRun)
      : D.runstate.create(D.scheduler.plan(), { table: D.state.focus.primary, combo: D.state.progress.carryCombo || 0 });
    D.state.inRun = rs.snapshot();
    D.__rs = rs;
    D.run.start(root, { rs: rs, onDone: afterRun, onLeave: home });
  }
  function afterRun(sum) {
    if (D.recap.due()) {
      if (D.recap.lines().length >= 2) { D.recap.render(root, () => summary(sum)); return; }
      D.recap.markShown();
    }
    summary(sum);
  }

  /* ---- the end of a round ----
     One line leads, the most important thing that moved: a stripe or a belt, then
     questions sealed, then a new best, then the streak (2026-09-14). */
  function summary(sum) {
    u().clear(root);
    const info = D.belt.info();
    const events = (sum.extra && sum.extra.belt) || [];
    const pbs = (sum.extra && sum.extra.pbs) || [];
    const scorePb = pbs.find(x => x.kind === 'score');
    const ev = events[events.length - 1];
    const listed = ids => ids.map(id => D.facts.display(id, false));

    // The child's best time this round, if any: the biggest improvement.
    const pbFact = (sum.pbFacts || []).slice().sort((a, b) => (b.from - b.ms) - (a.from - a.ms))[0];
    const bestTimeLine = pbFact ? D.copy.summary.bestTime(pbFact.id, pbFact.ms, pbFact.from) : null;

    // One line leads: a stripe or belt, a seal, a new best round, the child's best
    // time, and never a streak below the best (§13.3).
    let lead = null, leadIsBelt = false;
    if (ev) {
      // Two stripes in one round are both named (audit 2026-09-14: "Stripe 2" with no stripe 1 seen).
      const stripes = events.filter(e => e.kind === 'stripe' && e.belt === ev.belt);
      lead = ev.kind === 'belt' ? D.copy.belt.beltTied(ev.belt)
        : stripes.length > 1 ? D.copy.belt.stripesTied(ev.belt, stripes[0].stripes, ev.stripes)
        : D.copy.belt.stripeTied(ev.belt, ev.stripes);
      leadIsBelt = true;
    }
    else if (sum.sealed.length) lead = D.copy.summary.sealed(listed(sum.sealed));
    else if (scorePb) lead = D.copy.summary.newBest(scorePb.delta);
    else if (bestTimeLine) lead = bestTimeLine;
    else if (sum.bestCombo >= D.cfg.COMBO_STEP) lead = D.copy.summary.streak(sum.bestCombo, D.state.pbs.combo);

    const lines = u().el('div', { class: 'lines' });
    const add = text => { if (text && text !== lead) lines.appendChild(u().el('div', { class: 't15' }, text)); };
    if (sum.sealed.length && leadIsBelt) add(D.copy.summary.sealed(listed(sum.sealed)));
    if (D.state.progress.fastToday) lines.appendChild(fastTodayRow(D.state.progress.fastToday));
    if (sum.unsealed.length) add(D.copy.summary.unsealed(listed(sum.unsealed)));
    if (sum.gotBack.length) add(D.copy.summary.gotBack(listed(sum.gotBack)));
    add(bestTimeLine);
    add(scorePb ? D.copy.summary.newBest(scorePb.delta) : D.state.pbs.score > sum.score ? D.copy.summary.best(D.state.pbs.score) : null);
    if (sum.levelUp) {
      const stock = D.cfg.SHOP.filter(it => it.level === sum.levelUp).map(it => D.copy.shop.names[it.id]);
      add(D.copy.summary.levelUp(sum.levelUp, stock));
    }

    const beltBox = beltPlate(info, events, false);
    if (events.length) { D.audio.belt(); D.fx.pop(beltBox); }

    const lvl = D.xp.levelFor(D.state.progress.xp);
    const tail = u().el('div', { class: 'lines dim t13' }, [
      u().el('div', { class: 'row', style: { gap: '7px' } }, [
        u().el('i', { class: 'coin' }),
        u().el('span', {}, D.copy.summary.coinsLine(sum.coinsAnswers || 0, sum.coinsBonus || 0, sum.coinsBelt || 0) + ' · ' + D.copy.home.coins(D.state.progress.coins)),
      ]),
      u().el('div', {}, [D.copy.summary.xp(sum.xp), ' · ', D.copy.home.level(lvl.level), ' · ', D.copy.home.xpline(lvl.into, lvl.need)].join('')),
    ]);

    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.summary.again);
    again.addEventListener('click', startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);

    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 't64 num' }, D.copy.num(sum.score)),
        u().el('div', { class: 'label' }, D.copy.summary.points),
      ]),
      lead ? u().el('div', { class: leadIsBelt ? 't30' : 't22' }, lead) : null,
      lines, beltBox, tail,
      u().el('div', { class: 'grow' }),
      again, back,
    ]));
    D.save.commitNow();
  }

  /* ---- the black belt test ---- */
  function startTest() {
    D.audio.unlock();
    const test = D.belttest.create();
    D.state.flags.testInProgress = 'black';
    D.save.commitNow();
    D.cards.start(root, {
      total: D.cfg.TEST_CARDS,
      title: D.copy.belt.testTitle,
      leftValue: () => D.copy.num(test.raw.score),
      ringInfo: () => {
        const c = test.raw.cards[test.raw.i];
        if (!c) return {};
        const ms = D.mastery.ringMs(c.id, c.ringKind);
        return { goldAt: D.u.clamp(1 - D.mastery.threshold(c.id) / ms, 0, 1) };
      },
      provide: () => {
        const p = test.present();
        if (!p) return null;
        return { question: p.question, digits: p.digits, ringMs: p.ringMs, index: p.index,
                 input: D.facts.get(p.card.id).input || 'number' };
      },
      answer: (v, rt) => {
        const out = test.submit(v, rt);
        return { correct: out.kind === 'correct', points: out.points, sealed: out.sealed,
                 index: out.card ? test.raw.cards.indexOf(out.card) : -1,
                 done: out.done, streak: test.raw.correct };
      },
      timeout: () => {
        const out = test.timeout();
        return { correct: false, index: out.card ? test.raw.cards.indexOf(out.card) : -1, done: out.done };
      },
      onDone: () => testResult(test.result()),
    });
  }
  function testResult(res) {
    D.state.flags.testInProgress = null;
    D.save.commitNow();
    u().clear(root);
    const lines = u().el('div', { class: 'lines' });
    if (res.passed) {
      D.audio.belt();
      lines.appendChild(u().el('div', { class: 't30' }, D.copy.belt.blackBelt));
      lines.appendChild(beltBand(D.belt.info(), true));
      lines.appendChild(backupButton());
    } else {
      lines.appendChild(u().el('div', { class: 't17' }, D.belttest.failLine(res)));
    }
    if (res.xp) lines.appendChild(u().el('div', { class: 't15' }, D.copy.summary.xp(res.xp)));
    if (res.coins) lines.appendChild(u().el('div', { class: 't15' }, D.copy.summary.coins(res.coins)));
    const back = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.belt.testTitle),
      u().el('div', { class: 't44 num' }, D.copy.num(res.score)),
      lines,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* ---- sending Dad a copy (PLAN §9.5) ----
     The link is built before the button is live, because Safari will not open
     the share sheet across an awaited compression. Whatever happens, the child
     is told what happened. */
  function backupButton() {
    const b = u().el('button', { class: 'btn wide', type: 'button', disabled: 'disabled' },
                     D.copy.settings.backup);
    D.share.precompute().then(() => b.removeAttribute('disabled')).catch(() => {});
    b.addEventListener('click', () => {
      if (D.share.shareNow()) { D.fx.toast(D.copy.settings.backupHow, 3200); return; }
      if (D.share.copyNow()) { D.fx.toast(D.copy.settings.copied, 3200); return; }
      D.share.fileNow();
    });
    return b;
  }

  /* ---- settings ---- */
  function settings() {
    u().clear(root);
    const f = D.state.flags;
    const rows = u().el('div', { class: 'col', style: { gap: '9px' } }, [
      tile(D.copy.settings.howItWorks, howItWorks),
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }),
      tile(D.copy.settings.paper, () => D.shop.render(root, settings, 'theme')),
      backupButton(),
      u().el('div', { class: 't13 dim' }, D.copy.settings.backupNote),
    ]);
    const dad = u().el('button', { class: 'btn quiet wide holdbar', type: 'button' },
                       [u().el('i', { class: 'fill' }), u().el('span', {}, D.copy.settings.forDad)]);
    holdFor(dad, 2000, forDad, D.copy.settings.forDadHold);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.settings.title),
      rows,
      u().el('div', { class: 'grow' }),
      dad, back,
    ]));
  }
  /* The parent's corner: a hold, so it is out of a child's way without being a
     secret (Jamie, rework 2026-09-10). */
  function holdFor(btn, ms, fn, hint) {
    const fill = btn.querySelector('.fill');
    let timer = 0;
    const cancel = () => { clearTimeout(timer); fill.style.transition = 'none'; fill.style.width = '0'; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (hint) D.fx.toast(hint, 1400);
      fill.style.transition = 'width ' + ms + 'ms linear';
      fill.style.width = '100%';
      timer = setTimeout(() => { cancel(); fn(); }, ms + 40);
    });
    for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(evt, cancel);
  }

  /* ---- How it works: the rules, any time ---- */
  function howItWorks() {
    u().clear(root);
    const box = u().el('div', { class: 'howto' });
    const GLYPHS = ['card', 'time', 'overtime', 'seal', 'belt', 'streak', 'wrong', 'coins', 'tick'];
    D.copy.howto.sections.forEach(([head, body], i) => {
      box.appendChild(u().el('div', { class: 'howrow' }, [
        D.fx.glyph(GLYPHS[i] || ''),
        u().el('div', {}, [u().el('h3', {}, head), u().el('p', {}, body)]),
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', settings);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.howto.title),
      box,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  function forDad() {
    u().clear(root);
    const rows = u().el('div', { class: 'col', style: { gap: '9px' } }, [
      tile(D.copy.forDad.dashboard, () => D.dashboard.render(root, { onBack: forDad })),
    ]);
    const restore = tile(D.copy.forDad.restore, () => toggleRestore(rows));
    const rename = tile(D.copy.forDad.changeName, () => {
      if (rows.querySelector('.namebox')) return;
      const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                      autocapitalize: 'words', maxlength: '14', value: D.state.profile.name });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.saveName);
      const saveName = () => {
        const name = (field.value || '').trim();
        if (!name) { D.fx.toast(D.copy.first.nameNeeded, 1600); return; }
        D.state.profile.name = name;
        D.save.rememberProfile(D.state.profile);
        D.save.commitNow();
        D.fx.toast(D.copy.forDad.nameSaved, 1400);
        forDad();
      };
      go.addEventListener('click', saveName);
      field.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
      rows.appendChild(u().el('div', { class: 'col namebox', style: { gap: '8px' } }, [field, go]));
    });
    // Start over wipes this player's save and goes back to the name screen, so
    // the whole first run can be seen again (Jamie, 2026-09-14).
    const over = u().el('button', { class: 'btn quiet wide', type: 'button' }, D.copy.forDad.startOver);
    over.addEventListener('click', () => {
      if (rows.querySelector('.resetbox')) return;
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.startOver);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.forDad.resetWord) return;
        D.save.reset();
        location.reload();
      });
      rows.appendChild(u().el('div', { class: 'col resetbox', style: { gap: '8px' } }, [
        u().el('div', { class: 't15' }, D.copy.forDad.startOverAsk), field, go,
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', settings);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.forDad.title),
      rows, restore, rename,
      u().el('div', { class: 'grow' }),
      over, back,
    ]));
  }

  /* ---- bringing a saved game back (PLAN §9.5) ---- */
  function toggleRestore(container) {
    const open = container.querySelector('.restorebox');
    if (open) { open.remove(); return; }
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    placeholder: D.copy.forDad.paste });
    const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.bringBack);
    go.addEventListener('click', () => restoreFromText(field.value));
    const file = u().el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
    file.addEventListener('change', () => { if (file.files && file.files[0]) restoreFromFile(file.files[0]); });
    const pick = u().el('button', { class: 'link small', type: 'button' }, D.copy.forDad.openFile);
    pick.addEventListener('click', () => file.click());
    container.appendChild(u().el('div', { class: 'col restorebox', style: { gap: '9px' } },
                                 [field, go, pick, file]));
  }
  function restoreFromText(text) {
    const m = String(text || '').match(/s=([A-Za-z0-9_-]+)/);
    const payload = m ? m[1] : String(text || '').trim();
    if (!payload) return;
    D.share.decode(payload).then(finishRestore).catch(() => D.fx.toast(D.copy.forDad.restoreBad, 2400));
  }
  function restoreFromFile(fileObj) {
    const reader = new FileReader();
    reader.onload = () => {
      try { finishRestore(JSON.parse(reader.result)); }
      catch (e) { D.fx.toast(D.copy.forDad.restoreBad, 2400); }
    };
    reader.readAsText(fileObj);
  }
  function finishRestore(payload) {
    const res = D.share.apply(payload);
    if (!res.ok) {
      D.fx.toast(res.reason === 'older' ? D.copy.forDad.restoreOlder : D.copy.forDad.restoreBad, 2800);
      return;
    }
    D.save.key = D.save.keyFor(D.state.profile.slug);
    D.save.rememberProfile(D.state.profile);
    D.save.commitNow();
    D.shop.apply();
    D.fx.toast(D.copy.forDad.restoreDone, 2400);
    home();
  }

  function toggle(labelText, on, fn) {
    const state = u().el('span', { class: 'seal' }, on ? D.copy.settings.on : D.copy.settings.off);
    const b = u().el('button', { class: 'btn wide row between', type: 'button' }, [
      u().el('span', {}, labelText), state,
    ]);
    b.addEventListener('click', () => {
      on = !on;
      state.textContent = on ? D.copy.settings.on : D.copy.settings.off;
      state.style.background = on ? 'var(--shu)' : 'var(--ink2)';
      fn(on);
    });
    state.style.background = on ? 'var(--shu)' : 'var(--ink2)';
    return b;
  }

  function profilePick(list) {
    u().clear(root);
    const box = u().el('div', { class: 'col', style: { gap: '9px' } });
    for (const p of list) {
      const b = u().el('button', { class: 'btn wide', type: 'button' }, p.name);
      b.addEventListener('click', () => open(p.slug));
      box.appendChild(b);
    }
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }), box, u().el('div', { class: 'grow' }),
    ]));
  }

  function busy() {
    return !!(D.state && (D.state.flags.testInProgress || (D.__rs && !D.__rs.isDone())));
  }

  /* ---- service worker ---- */
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated' && hadController) {
            // Never in the middle of a round or a test: a reload mid-test counts
            // as walking away from it. It waits for Home instead.
            if (busy()) { pendingReload = true; return; }
            D.fx.toast(D.copy.settings.updated, 1400);
            setTimeout(() => location.reload(), 1200);
          }
        });
      });
    }).catch(() => {});
  }

  return { boot, home, startRun, summary, settings, startTest, intro, howItWorks };
})();

document.addEventListener('DOMContentLoaded', D.main.boot);
