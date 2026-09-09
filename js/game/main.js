/* Dojo 12 — screens and the flow between them. */
"use strict";
D.main = (function () {
  const u = () => D.u;
  let root = null;

  function boot() {
    root = document.getElementById('app');
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
    applyTheme();
    D.save.touchDay();
    D.scheduler.ensureProgression();
    home();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', (D.state.profile && D.state.profile.theme) || 'dojo');
  }

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
      home();
    });
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.firstLaunch.askName),
      field, go,
      u().el('div', { class: 'grow' }),
    ]));
    setTimeout(() => field.focus(), 120);
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

    const nameRow = u().el('div', { class: 'row between' }, [
      u().el('div', { class: 'big' }, D.state.profile.name),
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
    D.run.start(root, { rs: rs, onDone: summary });
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

  /* ---- settings ---- */
  function settings() {
    u().clear(root);
    const f = D.state.flags;
    const rows = u().el('div', { class: 'col', style: { gap: '10px' } }, [
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }),
    ]);
    const reset = u().el('button', { class: 'btn ghost wide', type: 'button' }, D.copy.settings.reset);
    reset.addEventListener('click', () => {
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.reset);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.settings.resetWord) return;
        D.save.reset();
        location.reload();
      });
      rows.appendChild(u().el('div', { class: 'col', style: { gap: '8px' } }, [
        u().el('div', { class: 'small' }, D.copy.settings.resetAsk), field, go,
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'big' }, D.copy.settings.title),
      rows, u().el('div', { class: 'grow' }), reset, back,
    ]));
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

  return { boot, home, startRun, summary, settings, applyTheme };
})();

document.addEventListener('DOMContentLoaded', D.main.boot);
