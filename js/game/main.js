/* Dojo 12 — screens and the flow between them (ART.md for the look, PLAN §7.1
   for what each screen holds). Four things a child tracks: points for the round,
   coins to spend, a level that stocks the shop, and one belt moved by dots. */
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
    if (!D.state.flags.tryoutDone) return intro(0);
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
        intro(0);
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

  /* ---- the three screens before round 1 ---- */
  function intro(step) {
    u().clear(root);
    const art = u().el('div', { class: 'cardwrap', style: { maxHeight: '46vh' } });
    const card = u().el('div', { class: 'card', style: { width: '210px', height: '210px', '--cs': '210px' } });
    art.appendChild(card);
    let title = '', body = '';
    if (step === 0) {
      title = D.copy.intro.card; body = D.copy.intro.cardHow;
      card.appendChild(u().el('div', { class: 'question' }, '7 × 8'));
      card.appendChild(u().el('div', { class: 'slots' }, [u().el('i', { class: 'on' }), u().el('i')]));
    } else if (step === 1) {
      title = D.copy.intro.timer; body = D.copy.intro.timerHow;
      card.appendChild(u().el('div', { class: 'question' }, '7 × 8'));
      const ring = D.fx.enso(card, { goldAt: 0.42, bestAt: 0 });
      ring.set(0.62);
    } else {
      title = D.copy.intro.dots; body = D.copy.intro.dotsHow;
      card.appendChild(u().el('div', { class: 'question' }, '7 × 8'));
      card.appendChild(u().el('div', { class: 'dots' }, [u().el('i', { class: 'on' }), u().el('i', { class: 'lit' })]));
    }
    const last = step >= 2;
    const go = u().el('button', { class: 'btn ink wide', type: 'button' },
                      last ? D.copy.intro.start : D.copy.intro.next);
    go.addEventListener('click', () => (last ? startRoundOne() : intro(step + 1)));
    const marks = u().el('div', { class: 'pips' });
    for (let i = 0; i < 3; i++) marks.appendChild(u().el('i', { class: i === step ? 'now' : i < step ? 'done' : '' }));
    root.appendChild(u().el('div', { class: 'screen' }, [
      marks, art,
      u().el('div', { class: 'titlebar' }, title),
      u().el('div', { class: 't15' }, body),
      last ? u().el('div', { class: 't13 dim' }, D.copy.intro.roundOne) : null,
      u().el('div', { class: 'grow' }),
      go,
    ]));
  }

  /* ---- round 1: the same screen as every round ---- */
  function startRoundOne() {
    D.audio.unlock();
    const ro = D.roundone.create();
    D.__rs = ro;
    D.run.start(root, { rs: ro, onDone: roundOneEnd, onLeave: () => intro(2) });
  }
  function roundOneEnd(sum) {
    u().clear(root);
    const focus = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
    const lines = u().el('div', { class: 'lines' }, [
      u().el('div', { class: 't17' }, focus.length ? D.copy.roundOne.start(focus) : D.copy.roundOne.allOpen),
      u().el('div', { class: 't15 dim' }, D.copy.roundOne.rest),
      u().el('div', { class: 't15' }, D.copy.roundOne.coins),
      u().el('div', { class: 't15' }, D.copy.roundOne.xp),
    ]);
    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.roundOne.play);
    again.addEventListener('click', startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.roundOne.home);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.roundOne.title),
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 't44 num' }, D.copy.num(sum.score)),
        u().el('div', { class: 'label' }, D.copy.summary.points),
      ]),
      lines,
      u().el('div', { class: 'grow' }),
      again, back,
    ]));
    D.save.commitNow();
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
    const lvl = D.xp.levelFor(p.xp);
    const info = D.belt.info();
    const worn = D.shop.equipped('mark');

    const head = u().el('div', { class: 'home-head' }, [
      u().el('div', { class: 'row', style: { gap: '9px' } }, [
        worn ? D.fx.markGlyph(worn) : null,
        u().el('div', { class: 'home-name' }, D.state.profile.name),
      ]),
      u().el('div', { class: 'seal' }, D.copy.home.level(lvl.level)),
    ]);
    const xp = u().el('div', { class: 'xpline' }, [
      u().el('i', { style: { width: Math.round(100 * lvl.into / lvl.need) + '%' } }),
    ]);

    const belt = u().el('div', { class: 'plate lift' }, [
      beltBand(info, true),
      u().el('div', { class: 't22' }, D.copy.belt.now(info.belt, info.stripes)),
      u().el('div', { class: 'bar-fill' }, [u().el('i', { style: { width: beltPct(info) + '%' } })]),
      u().el('div', { class: 't13 dim' }, info.black ? D.copy.belt.filled(info.dots)
        : D.copy.belt.toNext(Math.max(0, info.nextAt - info.dots), info.nextKind, info.nextBelt)),
    ]);

    const focusKey = D.state.focus.primary;
    const second = D.state.focus.secondary;
    const workLine = focusKey
      ? (second ? D.copy.home.workingTwo(focusKey, second)
                : D.copy.home.working(focusKey, D.scheduler.nextUnopened()))
      : null;

    const play = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.home.play);
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
      belt,
      workLine ? u().el('div', { class: 't15' }, workLine) : null,
      u().el('div', { class: 'row', style: { gap: '7px' } }, [
        u().el('i', { class: 'coin' }), u().el('div', { class: 't15' }, D.copy.home.coins(p.coins)),
      ]),
      u().el('div', { class: 'grow' }),
      play, nav,
    ]));
    if (D.state.flags.clockFrozenUntil) {
      D.fx.toast(D.copy.settings.clockMoved(D.state.flags.clockFrozenUntil), 3000);
    }
  }
  function beltPct(info) {
    if (info.black || !info.nextAt) return 100;
    const span = Math.max(1, info.nextAt - info.prevAt);
    return D.u.clamp(Math.round(100 * (info.dots - info.prevAt) / span), 0, 100);
  }
  function beltBand(info, tall) {
    const bar = u().el('div', { class: 'bar' });
    for (let i = 0; i < info.stripes; i++) bar.appendChild(u().el('i'));
    return u().el('div', { class: 'beltband b-' + info.belt + (tall ? ' tall' : '') },
                  [u().el('div', { class: 'cloth' }), bar]);
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
      : D.runstate.create(D.scheduler.plan(), { table: D.state.focus.primary });
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

  /* ---- the end of a round ---- */
  function summary(sum) {
    u().clear(root);
    const info = D.belt.info();
    const events = (sum.extra && sum.extra.belt) || [];
    const pbs = (sum.extra && sum.extra.pbs) || [];
    const scorePb = pbs.find(x => x.kind === 'score');
    const lines = u().el('div', { class: 'lines' });
    const add = (text, cls) => { if (text) lines.appendChild(u().el('div', { class: cls || 't15' }, text)); };

    add(scorePb ? D.copy.summary.newBest(scorePb.delta) : D.copy.summary.best(D.state.pbs.score), 't15 dim');
    if (sum.bestCombo) add(D.copy.summary.streak(sum.bestCombo, D.state.pbs.combo));
    if (sum.dotted.length) add(D.copy.summary.dots(sum.dotted.length));
    if (sum.done.length) add(D.copy.summary.done(sum.done.map(id => D.facts.display(id, false))));
    if (sum.gotBack.length) add(D.copy.summary.gotBack(sum.gotBack.map(id => D.facts.display(id, false))));

    const beltBox = u().el('div', { class: 'plate' }, [beltBand(info)]);
    for (const ev of events) {
      beltBox.appendChild(u().el('div', { class: 't22' },
        ev.kind === 'belt' ? D.copy.belt.beltTied(ev.belt) : D.copy.belt.stripeTied(ev.belt, ev.stripes)));
    }
    beltBox.appendChild(u().el('div', { class: 'bar-fill' }, [u().el('i', { style: { width: beltPct(info) + '%' } })]));
    beltBox.appendChild(u().el('div', { class: 't13 dim' }, info.black ? D.copy.belt.filled(info.dots)
      : D.copy.belt.toNext(Math.max(0, info.nextAt - info.dots), info.nextKind, info.nextBelt)));
    if (events.length) { D.audio.belt(); D.fx.seal(beltBox); }

    const lvl = D.xp.levelFor(D.state.progress.xp);
    const tail = u().el('div', { class: 'lines' }, [
      sum.xp ? u().el('div', { class: 'sumline' }, [
        u().el('span', {}, D.copy.summary.xp(sum.xp)),
        u().el('span', { class: 'v' }, D.copy.home.level(lvl.level)),
      ]) : null,
      sum.coins ? u().el('div', { class: 'sumline' }, [
        u().el('span', {}, D.copy.summary.coins(sum.coins)),
        u().el('span', { class: 'v' }, D.copy.home.coins(D.state.progress.coins)),
      ]) : null,
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
        return { correct: out.kind === 'correct', points: out.points, bothDots: out.bothDots,
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
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }),
      tile(D.copy.settings.paper, () => D.shop.render(root, settings, 'theme')),
      backupButton(),
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

  function forDad() {
    u().clear(root);
    const rows = u().el('div', { class: 'col', style: { gap: '9px' } }, [
      tile(D.copy.forDad.dashboard, () => D.dashboard.render(root, { onBack: forDad })),
    ]);
    const restore = tile(D.copy.forDad.restore, () => toggleRestore(rows));
    const reset = u().el('button', { class: 'btn quiet wide', type: 'button' }, D.copy.forDad.reset);
    reset.addEventListener('click', () => {
      if (rows.querySelector('.resetbox')) return;
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.resetGo);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.forDad.resetWord) return;
        D.save.reset();
        location.reload();
      });
      rows.appendChild(u().el('div', { class: 'col resetbox', style: { gap: '8px' } }, [
        u().el('div', { class: 't15' }, D.copy.forDad.resetAsk), field, go,
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', settings);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.forDad.title),
      rows, restore,
      u().el('div', { class: 'grow' }),
      reset, back,
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

  return { boot, home, startRun, summary, settings, startTest, intro };
})();

document.addEventListener('DOMContentLoaded', D.main.boot);
