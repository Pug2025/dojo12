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

  /* ---- first launch: the game's face over the first question (review 2026-09-24).
     The face sits high, so the field and Start stay above the keyboard. ---- */
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
    root.appendChild(u().el('div', { class: 'screen fr-first' }, [
      u().el('div', { class: 'fr-lead' }),
      D.frame.face({ draw: true }),
      u().el('div', { class: 'titlebar fr-centre' }, D.copy.first.askName),
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
      u().el('div', { class: 't15' }, D.copy.first.paperWhy),
      list,
      u().el('div', { class: 'small dim t13' }, D.copy.first.paperNote),
      u().el('div', { class: 'grow' }),
    ]));
  }

  /* ---- the one screen before round 1 (2026-09-14). The timer, the seal and the
     streak are taught the first time each one happens. Its card is the round's own,
     as round 1 will deal it: the five card dots, the sum at the numerals' weight, the
     answer line, and no timer (review 2026-09-24). ---- */
  function intro() {
    u().clear(root);
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.intro.start);
    go.addEventListener('click', startRoundOne);
    root.appendChild(u().el('div', { class: 'screen fr-intro' }, [
      u().el('div', { class: 'titlebar' }, D.copy.intro.title),
      u().el('div', { class: 'grow' }),
      D.frame.firstCard(D.facts.mulId(7, 8)),
      u().el('div', { class: 't15 fr-intro-words' }, D.copy.intro.body),
      u().el('div', { class: 'grow fr-intro-after' }),
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
     round; after it, where the child starts (§13.3), and once, what coins and XP
     are, with the numbers (2026-09-24). */
  function roundOneEnd(sum) {
    D.xp.noteRound(sum);
    u().clear(root);
    const lines = u().el('div', { class: 'lines' });
    const half = halfwayLine();
    if (sum.placementContinues) {
      if (half) lines.appendChild(u().el('div', { class: 't15' }, keep(half)));
    } else {
      const focus = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
      lines.appendChild(u().el('div', { class: 't17' }, keep(focus.length ? D.copy.roundOne.start(focus) : D.copy.roundOne.allOpen)));
      lines.appendChild(u().el('div', { class: 't15 dim' }, D.copy.roundOne.rest));
      if (half) lines.appendChild(u().el('div', { class: 't15' }, keep(half)));
      lines.appendChild(u().el('div', { class: 'row', style: { gap: '7px', alignItems: 'flex-start' } }, [
        u().el('i', { class: 'coin', style: { marginTop: '3px' } }),
        u().el('div', { class: 't15' }, D.copy.roundOne.coins(sum.coinsAnswers || 0, D.state.progress.coins)),
      ]));
      lines.appendChild(u().el('div', { class: 't15' }, D.copy.roundOne.xp));
      // What is open now is what the child was just told; news starts from here.
      D.state.flags.tablesSeen = D.scheduler.tablesNow();
    }
    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.roundOne.play);
    again.addEventListener('click', sum.placementContinues ? startRoundOne : startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.roundOne.home);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.roundOne.titleN(sum.roundNo || 1)),
      scoreRow(sum.score, 't44'),
      lines,
      sum.placementContinues ? null : beltPlate(D.belt.info(), [], false),
      u().el('div', { class: 'grow' }),
      again, back,
    ]));
    D.save.commitNow();
  }
  // A question never breaks across two lines: "4 ×" at the end of one line and "4" on the
  // next read as two things (2026-09-24). The spaces around its sign stop the break.
  function keep(text) { return text ? String(text).replace(/ ([×÷+−=]) /g, '\u00a0$1\u00a0') : text; }
  // The score with its word beside it, not at the far edge (review 2026-09-24).
  function scoreRow(score, size) {
    return u().el('div', { class: 'row scorerow' }, [
      u().el('div', { class: size + ' num' }, D.copy.num(score)),
      u().el('div', { class: 'label' }, D.copy.summary.points),
    ]);
  }
  // "Halfway today: 2 × 3, 4 × 6." The day's questions that got halfway and still are,
  // each written the way its card showed it (2026-09-24).
  function halfwayLine() {
    const list = D.xp.halfwayToday();
    if (!list.length) return null;
    const MAX = 8;
    const names = list.slice(0, MAX).map(x => D.facts.display(x.id, x.flip));
    return D.copy.summary.halfwayToday(names, Math.max(0, list.length - MAX));
  }
  /* Tables that opened, or left the two being worked on, since the child last looked,
     said once (2026-09-24). A save from before this starts from what it has now. */
  function tableNewsLine() {
    const f = D.state.flags, now = D.scheduler.tablesNow();
    if (!f.tablesSeen || !Array.isArray(f.tablesSeen.open)) { f.tablesSeen = now; D.save.commit(); return null; }
    const news = D.scheduler.tableNews(f.tablesSeen);
    f.tablesSeen = now;
    if (news.opened.length || news.left.length) { D.save.commit(); return D.copy.summary.tables(news.opened, news.left); }
    return null;
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

    // How it works, from a ? at the top right: a kid will not look in Settings (2026-09-24).
    const help = u().el('button', { class: 'helpbtn', type: 'button', 'aria-label': D.copy.home.helpLabel }, D.copy.home.help);
    help.addEventListener('click', () => howItWorks(home));
    const head = u().el('div', { class: 'home-head' }, [
      u().el('div', { class: 'row', style: { gap: '9px', minWidth: '0' } }, [
        worn ? D.fx.markGlyph(worn) : null,
        u().el('div', { class: 'home-name' }, D.state.profile.name),
      ]),
      u().el('div', { class: 'row', style: { gap: '12px', flex: 'none' } }, [
        u().el('div', { class: 't17', style: { fontWeight: '700' } }, D.copy.home.level(lvl.level)),
        help,
      ]),
    ]);
    const xp = u().el('div', { class: 'xpline' }, [
      u().el('i', { style: { width: Math.round(100 * lvl.into / lvl.need) + '%' } }),
    ]);
    const xpWords = u().el('div', { class: 't13 dim', style: { textAlign: 'right', marginTop: '-6px' } },
                           D.copy.home.toLevel(lvl.need - lvl.into, lvl.level + 1));

    const belt = beltPlate(info, [], true);
    // No "You have sealed 0 questions.": the plate above already says what the first
    // seal does, and a row of zeros on day one says nothing a kid needs (2026-09-24).
    const counts = u().el('div', { class: 'sumline' }, [
      info.sealed ? u().el('span', {}, D.copy.home.sealed(info.sealed)) : u().el('span'),
      D.state.pbs.score ? u().el('span', { class: 'dim' }, D.copy.home.best(D.state.pbs.score)) : null,
    ]);

    const news = tableNewsLine();
    const workLine = workingLine();
    const today = D.copy.home.today(p.runsToday || 0, D.xp.halfwayToday().length, D.scheduler.sealablePool().length);
    const nudgeItem = D.shop.nudge();
    const recap = D.recap.plate(home);

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
      head, xp, xpWords, recap,
      u().el('div', { class: 'grow' }),
      today ? u().el('div', { class: 't15', style: { fontWeight: '700' } }, today) : null,
      belt, counts,
      news ? u().el('div', { class: 't15' }, keep(news)) : null,
      workLine ? u().el('div', { class: 't15' }, keep(workLine)) : null,
      u().el('div', { class: 'col', style: { gap: '4px' } }, [
        u().el('div', { class: 'row', style: { gap: '7px' } }, [
          u().el('i', { class: 'coin' }), u().el('div', { class: 't15' }, D.copy.home.coins(p.coins)),
        ]),
        nudgeItem ? u().el('div', { class: 't13 dim' }, D.copy.home.nudge(nudgeItem.id, nudgeItem.price)) : null,
      ]),
      u().el('div', { class: 'grow' }),
      play, nav,
    ]));
    if (D.state.flags.clockFrozenUntil) {
      D.fx.toast(D.copy.settings.clockMoved(D.state.flags.clockFrozenUntil), 3000);
    }
  }
  /* The plate under the belt. The bar and the words say the same thing: one cell for
     each seal between the last stripe and the next, sealed ones solid and halfway
     ones half filled, and the line says how many are still to come (D.belt.bar). */
  function beltPlate(info, events, tall) {
    const bar = D.belt.bar(info);
    const tied = events && events.length;
    const cells = u().el('div', { class: 'sealbar' }, bar.cells.map(c => u().el('i', { class: c })));
    return u().el('div', { class: 'plate' + (tall ? ' lift' : '') }, [
      beltBand(info, tall, tied),
      u().el('div', { class: tall ? 't22' : 't17', style: { fontWeight: '700' } }, D.copy.belt.now(info.belt, info.stripes)),
      cells,
      u().el('div', { class: 't13 dim' }, info.black ? D.copy.belt.filled(info.sealed)
        : D.copy.belt.toNext(Object.assign({}, info, { left: bar.left }))),
    ]);
  }
  // The tables being worked on, each out of its whole 22, and when the next opens (2026-09-24).
  function workingLine() {
    const keys = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
    if (!keys.length) return null;
    const next = D.scheduler.nextUnopened();
    return D.copy.home.working(keys.map(k => D.belt.tableSeals(k)), next, next ? D.scheduler.nextOpening() : null);
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
  // The week's recap waits on Home now; it no longer comes between the last card and
  // the score (2026-09-24).
  function afterRun(sum) {
    D.xp.noteRound(sum);
    summary(sum);
  }

  /* ---- the end of a round ----
     One line leads, the most important thing that moved: a stripe or a belt, then
     questions sealed, then a new best, then the streak (2026-09-14). Every number says
     what it is, and every question is written the way its card showed it (2026-09-24). */
  function summary(sum) {
    u().clear(root);
    const info = D.belt.info();
    const events = (sum.extra && sum.extra.belt) || [];
    const pbs = (sum.extra && sum.extra.pbs) || [];
    const scorePb = pbs.find(x => x.kind === 'score');
    const ev = events[events.length - 1];
    const flips = sum.flips || {};
    const listed = ids => ids.map(id => D.facts.display(id, !!flips[id]));

    // The child's best time this round, if any: the biggest improvement.
    const pbFact = (sum.pbFacts || []).slice().sort((a, b) => (b.from - b.ms) - (a.from - a.ms))[0];
    const bestTimeLine = pbFact ? D.copy.summary.bestTime(pbFact.id, pbFact.ms, pbFact.from, !!flips[pbFact.id]) : null;

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
    const add = text => { if (text && text !== lead) lines.appendChild(u().el('div', { class: 't15' }, keep(text))); };
    if (sum.sealed.length && leadIsBelt) add(D.copy.summary.sealed(listed(sum.sealed)));
    add(halfwayLine());
    if (sum.unsealed.length) add(D.copy.summary.unsealed(listed(sum.unsealed)));
    // A question that lost its seal this round is not also listed as "got it back": under
    // "lost its seal" that read as the seal coming back, which takes another day. The card
    // said "Got it back." when it happened (2026-09-24).
    const wonBack = sum.gotBack.filter(id => sum.unsealed.indexOf(id) < 0);
    if (wonBack.length) add(D.copy.summary.gotBack(listed(wonBack)));
    add(bestTimeLine);
    add(scorePb ? D.copy.summary.newBest(scorePb.delta) : D.state.pbs.score > sum.score ? D.copy.summary.best(D.state.pbs.score) : null);
    if (sum.levelUp) add(D.copy.summary.levelUp(sum.levelUp, D.cfg.SHOP.filter(it => it.level === sum.levelUp).map(it => it.id)));
    add(tableNewsLine());

    const beltBox = beltPlate(info, events, false);
    if (events.length) { D.audio.belt(); D.fx.pop(beltBox); }

    // What the round paid and what the child has now, in words (2026-09-24).
    const p = D.state.progress, lvl = D.xp.levelFor(p.xp);
    const tail = u().el('div', { class: 'lines t15' }, [
      u().el('div', { class: 'row', style: { gap: '7px', alignItems: 'flex-start' } }, [
        u().el('i', { class: 'coin', style: { marginTop: '3px' } }),
        u().el('span', {}, D.copy.summary.coinsLine(sum.coinsAnswers || 0, sum.coinsBonus || 0, events, p.coins)),
      ]),
      u().el('div', {}, D.copy.summary.xpLine(sum.xp || 0, lvl.need - lvl.into, lvl.level + 1)),
    ]);

    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.summary.again);
    again.addEventListener('click', startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);

    root.appendChild(u().el('div', { class: 'screen' }, [
      scoreRow(sum.score, 't64'),
      lead ? u().el('div', { class: leadIsBelt ? 't30' : 't22' }, keep(lead)) : null,
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
    // The same two lines as the end of a round: what it paid, then what there is now.
    const belts = res.belt || [];
    const answers = (res.coins || 0) - belts.reduce((n, e) => n + (e.coins || 0), 0);
    const lvl = D.xp.levelFor(D.state.progress.xp);
    lines.appendChild(u().el('div', { class: 't15' }, D.copy.summary.coinsLine(answers, 0, belts, D.state.progress.coins)));
    lines.appendChild(u().el('div', { class: 't15' }, D.copy.summary.xpLine(res.xp || 0, lvl.need - lvl.into, lvl.level + 1)));
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
  // asRow: the calm row Settings lists it as, with its note and the Share glyph.
  function backupButton(asRow) {
    const b = asRow
      ? D.frame.row(D.copy.settings.backup, { note: D.copy.settings.backupNote, end: D.frame.glyph('share') })
      : u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.backup);
    b.setAttribute('disabled', 'disabled');
    D.share.precompute().then(() => b.removeAttribute('disabled')).catch(() => {});
    b.addEventListener('click', () => {
      if (D.share.shareNow()) { D.fx.toast(D.copy.settings.backupHow, 3200); return; }
      if (D.share.copyNow()) { D.fx.toast(D.copy.settings.copied, 3200); return; }
      D.share.fileNow();
    });
    return b;
  }

  /* ---- settings: one calm list of paper rows, each saying what it is set to or where
     it goes, its note under it; For Dad sits apart, quiet, behind its hold
     (review 2026-09-24). ---- */
  function settings() {
    u().clear(root);
    const f = D.state.flags;
    const F = D.frame;
    const paper = D.state.profile.theme || D.cfg.FREE_PAPERS[0];
    const list = u().el('div', { class: 'fr-list' }, [
      F.row(D.copy.settings.howItWorks, { end: F.glyph('go'), onClick: () => howItWorks(settings) }),
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }, D.copy.settings.autoSubmitNote),
      F.row(D.copy.settings.paper, { value: D.copy.shop.names['theme:' + paper], note: D.copy.settings.paperNote,
                                     end: F.glyph('go'), onClick: () => D.shop.render(root, settings, 'theme') }),
      backupButton(true),
    ]);
    // The hold's words sit under it, so nothing has to pop up to explain it.
    const dad = F.row(D.copy.settings.forDad, { cls: 'fr-quiet fr-hold', note: D.copy.settings.forDadHold });
    dad.appendChild(u().el('i', { class: 'fill' }));
    holdFor(dad, 2000, forDad);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.settings.title),
      list,
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'fr-solo' }, [dad]),
      back,
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

  /* ---- How it works: five panels, a picture and a few short lines each, from the ?
     on Home or from Settings, and back to wherever it was opened from (2026-09-24).
     Each picture is drawn with the pieces the game itself uses (D.frame.picture), set
     beside its words so the page reads as five short things. ---- */
  function howItWorks(from) {
    const onBack = typeof from === 'function' ? from : settings;
    u().clear(root);
    const box = u().el('div', { class: 'fr-howto' });
    const PICTURES = ['card', 'seal', 'belt', 'streak', 'coins'];
    D.copy.howto.sections.forEach(([head, body], i) => {
      box.appendChild(u().el('section', { class: 'fr-panel' }, [
        D.frame.picture(PICTURES[i]),
        u().el('h3', {}, head),
        u().el('p', {}, body),
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.howto.title),
      box,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* ---- For Dad: the same calm rows, plain and adult. A row that asks for more opens
     under itself; Start over sits apart and quiet, and a reset is never red. ---- */
  function forDad() {
    u().clear(root);
    const F = D.frame;
    // A row and the slot it opens into; the row says whether it is open.
    const opener = (label, fill, cls) => {
      const slot = u().el('div', { class: 'fr-slot' });
      const b = F.row(label, { cls: cls, end: F.glyph('open') });
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', () => {
        if (slot.firstChild) u().clear(slot); else fill(slot);
        b.setAttribute('aria-expanded', String(!!slot.firstChild));
      });
      return u().el('div', { class: 'fr-item' }, [b, slot]);
    };
    const rename = slot => {
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
      slot.appendChild(u().el('div', { class: 'col namebox', style: { gap: '10px' } }, [field, go]));
    };
    // Start over wipes this player's save and goes back to the name screen, so
    // the whole first run can be seen again (Jamie, 2026-09-14).
    const reset = slot => {
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.startOver);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.forDad.resetWord) return;
        D.save.reset();
        location.reload();
      });
      slot.appendChild(u().el('div', { class: 'col resetbox', style: { gap: '10px' } }, [
        u().el('div', { class: 't15' }, D.copy.forDad.startOverAsk), field, go,
      ]));
    };
    const list = u().el('div', { class: 'fr-list' }, [
      F.row(D.copy.forDad.dashboard, { end: F.glyph('go'), onClick: () => D.dashboard.render(root, { onBack: forDad }) }),
      opener(D.copy.forDad.restore, toggleRestore),
      opener(D.copy.forDad.changeName, rename),
    ]);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', settings);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.forDad.title),
      list,
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'fr-solo' }, [opener(D.copy.forDad.startOver, reset, 'fr-quiet')]),
      back,
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

  /* A setting that is on or off: a row with its stamp, On the solid red block and Off
     an empty ink outline (review 2026-09-24: both were red). */
  function toggle(labelText, on, fn, note) {
    const state = D.frame.stamp(on);
    const b = D.frame.row(labelText, { end: state, note: note });
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(!!on));
    b.addEventListener('click', () => {
      on = !on;
      D.frame.setStamp(state, on);
      b.setAttribute('aria-checked', String(on));
      fn(on);
    });
    return b;
  }

  // More than one player on this phone: the game's face, then each name, in the face
  // names are set in (PLAN §7.1: names only).
  function profilePick(list) {
    u().clear(root);
    const box = u().el('div', { class: 'fr-list fr-names' });
    for (const p of list) box.appendChild(D.frame.row(p.name, { end: D.frame.glyph('go'), onClick: () => open(p.slug) }));
    root.appendChild(u().el('div', { class: 'screen fr-first' }, [
      u().el('div', { class: 'fr-lead' }), D.frame.face(), box, u().el('div', { class: 'grow' }),
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
