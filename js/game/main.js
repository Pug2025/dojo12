/* Dojo 12 — screens and the flow between them. */
"use strict";
D.main = (function () {
  const u = () => D.u;
  let root = null;

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
    // A Belt Test that was walked away from is a fail, and it stays stamped.
    if (D.state.flags.testInProgress) {
      const t = D.scheduler.tableState(D.state.flags.testInProgress);
      t.testFailed = true;
      D.state.flags.testInProgress = null;
      D.save.commit();
    }
    D.scheduler.ensureProgression();
    if (!D.state.flags.tryoutDone) return tryoutIntro();
    home();
  }
  function applyTheme() { D.shop.apply(); }

  /* ---- first launch ---- */
  function firstLaunch() {
    u().clear(root);
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    autocapitalize: 'words', maxlength: '14' });
    const go = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.firstLaunch.nameGo);
    go.addEventListener('click', () => {
      const name = (field.value || '').trim();
      if (!name) { field.focus(); return; }
      D.save.startProfile(name, 'dojo');
      applyTheme();
      D.scheduler.ensureProgression();
      D.save.commitNow();
      themePick();
    });
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.firstLaunch.askName),
      field, go,
      u().el('div', { class: 'grow' }),
    ]));
    setTimeout(() => field.focus(), 120);
  }

  /* One theme, free, chosen before anything else. The rest are shop stock. */
  function themePick() {
    u().clear(root);
    const list = u().el('div', { class: 'tiles' });
    const themes = ['dojo'].concat(D.cfg.SHOP.filter(i => i.kind === 'theme').map(i => i.value));
    for (const value of themes) {
      const item = D.cfg.SHOP.find(i => i.kind === 'theme' && i.value === value);
      const name = D.copy.shop.names['theme:' + value];
      const b = u().el('button', { class: 'btn wide col centre', type: 'button',
                                   style: { gap: '9px', padding: '17px' } }, [
        u().el('i', { class: 'swatch big-swatch v-' + value }),
        u().el('span', {}, name),
      ]);
      b.addEventListener('click', () => {
        D.state.profile.theme = value;
        D.state.cosmetics.equipped.theme = value;
        if (item) D.state.cosmetics.owned.push(item.id);
        D.shop.apply();
        D.save.commitNow();
        tryoutIntro();
      });
      list.appendChild(b);
    }
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.firstLaunch.themeTitle),
      list,
      u().el('div', { class: 'grow' }),
    ]));
  }

  /* ---- the tryout (PLAN §6.6) ---- */
  function tryoutIntro() {
    u().clear(root);
    const go = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.tryout.play);
    go.addEventListener('click', runTryout);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.tryout.intro),
      u().el('div', { class: 'grow' }),
      go,
    ]));
  }
  function runTryout() {
    const t = D.tryout.create();
    let pending = null;
    D.cards.start(root, {
      provide: () => { pending = t.next(); return pending; },
      answer: (v, rt) => {
        const out = t.answer(v, rt);
        if (!out) return { correct: false, done: true };
        return { correct: out.correct, line: out.line, flash: out.flash,
                 done: false, streak: 1 };
      },
      onDone: () => tryoutEnd(t),
    });
  }
  function tryoutEnd(t) {
    const sum = t.apply();
    u().clear(root);
    const go = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.tryout.play);
    go.addEventListener('click', () => { home(); startRun(); });
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'mid' }, D.copy.tryout.end(sum.open, sum.next)),
      u().el('div', { class: 'grow' }),
      backupButton(),
      go,
    ]));
    D.save.commitNow();
  }

  function profilePick(list) {
    u().clear(root);
    const box = u().el('div', { class: 'col', style: { gap: '10px' } });
    for (const p of list) {
      const b = u().el('button', { class: 'btn wide', type: 'button' }, p.name);
      b.addEventListener('click', () => open(p.slug));
      box.appendChild(b);
    }
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.profilePick),
      box,
      u().el('div', { class: 'grow' }),
    ]));
  }

  /* ---- home (PLAN §7.1) ----
     One object dominates: the table being worked on, with its belt colour and
     how much of it is fast. Everything else is a small line under it. */
  function home() {
    u().clear(root);
    const p = D.state.progress;
    const lvl = D.xp.levelFor(p.xp);

    const worn = D.shop.equipped('mark');
    const nameRow = u().el('div', { class: 'row between' }, [
      u().el('div', { class: 'row', style: { gap: '9px' } }, [
        worn ? markGlyph(worn) : null,
        u().el('div', { class: 'big' }, D.state.profile.name),
      ]),
      u().el('div', { class: 'mid lvl' }, D.copy.home.level(lvl.level)),
    ]);
    const bar = u().el('div', { class: 'xpbar' }, [
      u().el('i', { style: { width: Math.round(100 * lvl.into / lvl.need) + '%' } }),
    ]);

    const focusKey = D.state.focus.primary;
    const plate = u().el('div', { class: 'plate' });
    if (focusKey) {
      const st = D.mastery.tableStats(focusKey);
      const belt = D.scheduler.tableState(focusKey).belt;
      plate.appendChild(u().el('div', { class: 'row between' }, [
        u().el('div', { class: 'label' }, D.copy.dash.nextUp),
        u().el('i', { class: 'belt b-' + belt }),
      ]));
      plate.appendChild(u().el('div', { class: 'value' }, D.copy.tableNameCap(focusKey)));
      plate.appendChild(u().el('div', { class: 'small' }, D.copy.belts.count(st.fastPlus, st.total)));
      plate.appendChild(u().el('div', { class: 'beltbar' }, [
        u().el('i', { style: { width: Math.round(100 * st.fastPct) + '%' } }),
      ]));
    }

    const dots = u().el('div', { class: 'dots' });
    for (let i = 0; i < 7; i++) {
      dots.appendChild(u().el('i', { class: 'dot' + (p.weekDots.indexOf(i) >= 0 ? ' on' : '') }));
    }
    const week = u().el('div', { class: 'plate col', style: { gap: '9px' } }, [
      u().el('div', { class: 'label' }, D.copy.home.week),
      dots,
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 'small' }, D.copy.home.runsToday(p.runsToday)),
        u().el('div', { class: 'small' }, D.copy.home.daysPlayed(p.daysPlayed)),
      ]),
    ]);

    const play = u().el('button', { class: 'btn primary wide', type: 'button' },
      D.state.inRun && !D.state.inRun.finished ? D.copy.summary.again : D.copy.home.play);
    play.addEventListener('click', startRun);
    const tiles = u().el('div', { class: 'tiles' }, [
      tile(D.copy.home.grid, () => D.grid.render(root, home)),
      tile(D.copy.home.belts, () => D.belts.render(root, home, startTest)),
      tile(D.copy.home.shop, () => D.shop.render(root, home)),
      tile(D.copy.home.settings, settings),
    ]);

    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'col hero' }, [nameRow, bar]),
      u().el('div', { class: 'grow' }),
      plate, week,
      u().el('div', { class: 'grow' }),
      play, tiles,
    ]));
    if (D.state.flags.clockFrozenUntil) {
      D.fx.toast(D.copy.settings.clockMoved(D.state.flags.clockFrozenUntil), 3000);
    }
  }
  function tile(text, fn) {
    const b = u().el('button', { class: 'btn wide', type: 'button' }, text);
    b.addEventListener('click', fn);
    return b;
  }

  /* ---- a run ---- */
  function startRun() {
    D.save.touchDay();
    D.scheduler.ensureProgression();
    const rs = D.state.inRun && !D.state.inRun.finished
      ? D.runstate.resume(D.state.inRun)
      : D.runstate.create(D.scheduler.plan());
    D.state.inRun = rs.snapshot();
    D.__rs = rs;                      // the run in progress, for the browser gate
    D.run.start(root, { rs: rs, onDone: afterRun });
  }

  /* The weekly recap comes first after the first run of a new week, and only
     when it has at least two things to say (PLAN §7.1). */
  function afterRun(sum) {
    if (D.recap.due()) {
      if (D.recap.lines().length >= 2) { D.recap.render(root, () => summary(sum)); return; }
      D.recap.markShown();
    }
    summary(sum);
  }

  /* ---- backup (PLAN §9.5) ----
     The link is built before the button is live, because Safari will not open
     the share sheet across an awaited compression. */
  function backupButton() {
    const b = u().el('button', { class: 'btn wide', type: 'button', disabled: 'disabled' },
                     D.copy.settings.backup);
    D.share.precompute().then(() => b.removeAttribute('disabled')).catch(() => {});
    b.addEventListener('click', () => {
      if (D.share.shareNow()) return;
      if (D.share.copyNow()) { D.fx.toast(D.copy.settings.copied, 1400); return; }
      D.share.fileNow();
    });
    return b;
  }

  /* ---- run summary (PLAN §7.1) ---- */
  function summary(sum) {
    u().clear(root);
    const lines = u().el('div', { class: 'col lines' });
    const pbs = (sum.extra && sum.extra.pbs) || [];
    const scorePb = pbs.find(x => x.kind === 'score');
    if (scorePb) lines.appendChild(u().el('div', { class: 'small' }, D.copy.summary.newBest(scorePb.delta)));
    else if (D.state.pbs.score > sum.score) {
      lines.appendChild(u().el('div', { class: 'small' }, D.copy.summary.best(D.state.pbs.score)));
    }
    if (sum.golds.length) {
      lines.appendChild(u().el('div', { class: 'small' },
        D.copy.summary.gold(sum.golds.map(id => D.facts.display(id, false)))));
    }
    if (sum.gotBack.length) {
      lines.appendChild(u().el('div', { class: 'small' },
        D.copy.summary.gotBack(sum.gotBack.map(id => D.facts.display(id, false)))));
    }
    const nextLine = nextUp();
    if (nextLine) lines.appendChild(u().el('div', { class: 'small' }, nextLine));
    if (sum.xp) lines.appendChild(u().el('div', { class: 'small' }, D.copy.summary.xp(sum.xp)));
    if (sum.sparks) lines.appendChild(u().el('div', { class: 'small' }, D.copy.summary.sparks(sum.sparks)));
    if (sum.extra && sum.extra.weekBonus) {
      lines.appendChild(u().el('div', { class: 'small' },
        D.copy.home.plusSparks(sum.extra.weekBonus) + D.copy.home.weekBonus));
    }
    if (sum.extra && sum.extra.daysBonus) {
      lines.appendChild(u().el('div', { class: 'small' },
        D.copy.home.plusSparks(sum.extra.daysBonus) + D.copy.home.daysBonus(sum.extra.daysBonusAt)));
    }

    const again = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.summary.again);
    again.addEventListener('click', startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);

    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'score' }, D.copy.num(sum.score)),
      lines,
      u().el('div', { class: 'grow' }),
      again, back,
    ]));
    D.save.commitNow();
  }
  // The one line that says where the child is going next.
  function nextUp() {
    const key = D.state.focus.primary;
    if (!key) return null;
    const st = D.mastery.tableStats(key);
    if (D.scheduler.testOpen(key)) return D.copy.summary.nextTestOpen(key);
    const left = st.total - st.fastPlus;
    if (st.fastPct >= D.cfg.BELT_ORANGE_PCT) return D.copy.summary.nextTest(key, left);
    const next = D.scheduler.nextUnopened();
    return next ? D.copy.summary.nextTable(next) : null;
  }

  /* A worn mark, drawn rather than shipped. */
  const MARKS = {
    circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    triangle: 'M12 3 22 21H2z',
    square: 'M4 4h16v16H4z',
    diamond: 'M12 2 22 12 12 22 2 12z',
    hex: 'M7 3h10l5 9-5 9H7l-5-9z',
    star: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z',
    ring: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    cross: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  };
  function markGlyph(value) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', MARKS[value] || MARKS.circle);
    path.setAttribute('fill', 'var(--accent)');
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    return u().el('span', { class: 'mark' }, [svg]);
  }

  /* ---- the Belt Test (PLAN §7.1) ---- */
  function startTest(key) {
    const test = D.belttest.create(key);
    D.state.flags.testInProgress = key;
    D.save.commitNow();
    D.cards.start(root, {
      total: D.cfg.TEST_CARDS,
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
        return { question: p.question, digits: p.digits, ringMs: p.ringMs, index: p.index };
      },
      answer: (v, rt) => {
        const out = test.submit(v, rt);
        return { correct: out.kind === 'correct', points: out.points, gold: out.gold,
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
    const lines = u().el('div', { class: 'col lines' });
    if (res.passed) {
      D.audio.belt();
      D.fx.shake(document.getElementById('app'));
      lines.appendChild(u().el('div', { class: 'big' }, D.copy.belts.pass(res.key)));
      if (res.grandmaster) lines.appendChild(u().el('div', { class: 'mid' }, D.copy.belts.grandmaster));
      lines.appendChild(u().el('div', { class: 'small' }, D.copy.settings.backupNudge));
      lines.appendChild(backupButton());
    } else {
      lines.appendChild(u().el('div', { class: 'mid' }, D.belttest.failLine(res)));
    }
    if (res.xp) lines.appendChild(u().el('div', { class: 'small' }, D.copy.summary.xp(res.xp)));
    const back = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'score' }, D.copy.num(res.score)),
      lines,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* ---- settings ---- */
  function settings() {
    u().clear(root);
    const f = D.state.flags;
    const rows = u().el('div', { class: 'col', style: { gap: '10px' } }, [
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }),
      backupButton(),
      u().el('div', { class: 'tiles' }, [
        tile(D.copy.settings.copyLink, () => {
          if (D.share.copyNow()) D.fx.toast(D.copy.settings.copied, 1400);
        }),
        tile(D.copy.settings.shareFile, () => D.share.fileNow()),
      ]),
      tile(D.copy.settings.dashboard, () => D.dashboard.render(root, { onBack: settings })),
    ]);
    const restore = tile(D.copy.settings.restore, () => openRestore(rows));
    const reset = u().el('button', { class: 'btn ghost wide', type: 'button' }, D.copy.settings.reset);
    reset.addEventListener('click', () => {
      if (rows.querySelector('.resetbox')) return;
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.reset);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.settings.resetWord) return;
        D.save.reset();
        location.reload();
      });
      rows.appendChild(u().el('div', { class: 'col resetbox', style: { gap: '8px' } }, [
        u().el('div', { class: 'small' }, D.copy.settings.resetAsk), field, go,
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'big' }, D.copy.settings.title),
      rows, restore, u().el('div', { class: 'grow' }), reset, back,
    ]));
  }

  /* ---- restore (PLAN §9.5): a pasted link or a saved file ---- */
  function openRestore(container) {
    if (container.querySelector('.restorebox')) return;
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    placeholder: D.copy.dash.paste });
    const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.restore);
    go.addEventListener('click', () => restoreFromText(field.value));
    const file = u().el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
    file.addEventListener('change', () => { if (file.files && file.files[0]) restoreFromFile(file.files[0]); });
    const pick = u().el('button', { class: 'btn ghost wide', type: 'button' }, D.copy.dash.openFile);
    pick.addEventListener('click', () => file.click());
    container.appendChild(u().el('div', { class: 'col restorebox', style: { gap: '8px' } },
                                 [field, go, pick, file]));
  }
  function restoreFromText(text) {
    const m = String(text || '').match(/s=([A-Za-z0-9_-]+)/);
    const payload = m ? m[1] : String(text || '').trim();
    if (!payload) return;
    D.share.decode(payload).then(finishRestore).catch(() => {});
  }
  function restoreFromFile(fileObj) {
    const reader = new FileReader();
    reader.onload = () => { try { finishRestore(JSON.parse(reader.result)); } catch (e) { /* not a save */ } };
    reader.readAsText(fileObj);
  }
  function finishRestore(payload) {
    const res = D.share.apply(payload);
    if (!res.ok) {
      if (res.reason === 'older') D.fx.toast(D.copy.settings.restoreOlder, 2600);
      return;
    }
    D.save.key = D.save.keyFor(D.state.profile.slug);
    D.save.rememberProfile(D.state.profile);
    D.save.commitNow();
    D.shop.apply();
    D.fx.toast(D.copy.settings.restoreDone, 2400);
    home();
  }

  function toggle(label, on, fn) {
    const knob = u().el('i', {});
    const sw = u().el('span', { class: 'sw' + (on ? ' on' : '') }, [knob]);
    const b = u().el('button', { class: 'btn wide row between', type: 'button' }, [
      u().el('span', {}, label), sw,
    ]);
    b.addEventListener('click', () => {
      on = !on;
      sw.classList.toggle('on', on);
      fn(on);
    });
    return b;
  }

  /* ---- service worker ---- */
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    // A first install is not an update: only say so when a worker was already
    // driving the page and a new one has taken over.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated' && hadController) {
            D.fx.toast(D.copy.settings.updated, 1400);
            setTimeout(() => location.reload(), 1200);
          }
        });
      });
    }).catch(() => {});
  }

  return { boot, home, startRun, summary, settings, applyTheme, startTest, runTryout };
})();

document.addEventListener('DOMContentLoaded', D.main.boot);
