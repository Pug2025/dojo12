/* Dojo 12 — what Dad sees (PLAN §9.5). The same view opens from the backup link
   on any device and from For Dad on the child's own phone. It reads the save and
   renders it; it never changes anything. */
"use strict";
D.dashboard = (function () {
  const u = () => D.u;

  /* The look (review 2026-09-24): a report on paper, plain and adult. The name and level
     over an ink rule, then one ruled section a subject, the label small above it, the
     child's own tied belt drawn as Home draws it. No boxes, and no red: a check that
     fails is set in ink, heavier, never red. */
  function plate(label, children) {
    return u().el('section', { class: 'fr-sec' },
      [u().el('div', { class: 'label' }, label)].concat(children));
  }
  function line(text, cls) { return u().el('div', { class: 't15' + (cls ? ' ' + cls : '') }, text); }
  // the small grey line under a main one
  function sub(text) { return u().el('div', { class: 't13 dim' }, text); }
  function stat(label, value) {
    return u().el('div', { class: 'sumline' }, [
      u().el('span', { class: 'dim' }, label),
      u().el('span', { class: 'v' }, String(value)),
    ]);
  }

  function render(root, opts) {
    const o = opts || {};
    const s = D.state;
    D.beyond.build();
    u().clear(root);
    const kids = [
      u().el('div', { class: 'fr-dash-head' }, [
        u().el('div', { class: 'home-name' }, s.profile.name || D.copy.dash.title),
        u().el('div', { class: 'fr-dash-level' }, D.copy.dash.level(Math.max(1, (s.progress.level | 0) || 1))),
      ]),
      trainingPlate(s), checksPlate(s), beltPlate(s), workingPlate(s), weekPlate(s),
      gridPlate('mul'), gridPlate('div'),
    ];
    const tests = testsPlate(s);
    if (tests) kids.push(tests);
    if (o.onBack) {
      const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
      back.addEventListener('click', o.onBack);
      kids.push(back);
    }
    root.appendChild(u().el('div', { class: 'screen fr-dash' }, kids));
  }

  /* The day's training first, since it is what the screens wait on (PLAN §15, 2026-09-25):
     the save's game day, its rounds of the rounds a day or when it was done, and on how many
     days of that week it was done. Read straight from the save, as everything here is: the
     link opens on a phone that never loads D.daily, and this page never changes the save. A
     save from an earlier day names that day instead of today. */
  function trainingPlate(s) {
    const d = s.daily;
    if (!d || typeof d !== 'object') return null;
    const day = D.u.gameDay(), target = d.target || D.cfg.DAY_ROUNDS;
    const now = d.day === day;
    const rounds = now ? d.rounds || 0 : 0;
    const when = day === D.u.todayKey() ? D.copy.paint.dashToday : D.u.longDate(day);
    const wk = D.u.weekKey(day);
    const days = (Array.isArray(d.book) ? d.book : []).filter(p => p && p.day && D.u.weekKey(p.day) === wk).length;
    return plate(D.copy.paint.dash, [
      line(now && d.doneAt ? D.copy.paint.dashDone(when, d.doneAt) : D.copy.paint.dashRounds(when, Math.min(rounds, target), target)),
      stat(D.copy.paint.dashWeek, days),
      stat(D.copy.paint.target, target),
    ]);
  }

  /* The save check and the phone clock together, each line saying what it checked
     (2026-09-24): "The numbers add up." and "The phone clock is not ahead of this one."
     sat in two plates at either end of the page. */
  function checksPlate(s) {
    const found = D.share.checks(s);
    const rows = [line(found.length ? D.copy.dash.checksBad : D.copy.dash.checksOk, found.length ? 'fr-flag' : '')];
    for (const c of found) rows.push(line(D.copy.dash.checkLine(c.id, c.n), 'fr-flag'));
    const ahead = (s.lastSeenEpoch || 0) - Date.now();
    rows.push(ahead > 5 * 60000 ? line(D.copy.dash.clockAhead(Math.round(ahead / 60000)), 'fr-flag') : line(D.copy.dash.clockOk));
    if (s.lastSeenEpoch) rows.push(line(D.copy.dash.lastPlayed(D.u.todayKey(new Date(s.lastSeenEpoch))), 'dim'));
    return plate(D.copy.dash.checks, rows);
  }

  function beltPlate(s) {
    const info = D.belt.info();
    return plate(D.copy.dash.belt, [
      D.kit.belt(info.belt, info.stripes, { cls: 'fr-dash-belt' }),
      u().el('div', { class: 't15' }, D.copy.dash.beltLine(info.belt, info.stripes, info.sealed)),
      stat(D.copy.dash.coinsLabel, D.copy.num(s.progress.coins)),
    ]);
  }

  function workingPlate(s) {
    const rows = [];
    for (const key of [s.focus.primary, s.focus.secondary].filter(Boolean)) {
      const st = D.belt.tableSeals(key);
      rows.push(u().el('div', { class: 't15' }, D.copy.dash.tableRow(D.copy.tableLabel(key), st.sealed, st.halfway, st.total)));
      const hot = D.scheduler.tableState(key).hot || [];
      if (hot.length) rows.push(sub(D.copy.dash.hot(hot)));
    }
    if (s.placement && s.placement.tables) rows.push(sub(D.copy.dash.placement(s.placement.tables.length)));
    if (!rows.length) rows.push(sub(D.copy.dash.noData));
    return plate(D.copy.dash.working, rows);
  }

  function weekPlate(s) {
    const day = D.u.gameDay(), wk = D.u.weekKey(day);
    const inWeek = d => d && D.u.weekKey(d) === wk;
    const rows = [
      stat(D.copy.dash.runsThisWeek, (s.runs || []).filter(r => inWeek(r.day)).length),
      stat(D.copy.dash.doneThisWeek, s.progress.doneThisWeek || 0),
      stat(D.copy.dash.daysPlayed, s.progress.daysPlayed || 0),
      stat(D.copy.dash.restores, (s.restores || []).filter(r => inWeek(r.day)).length),
      stat(D.copy.dash.fastWrongs,
           (s.progress.fastWrongs7d || []).filter(d => D.u.daysBetween(d, day) < 7).length),
    ];
    const moved = D.recap.mostImproved();
    if (moved) rows.push(sub(D.copy.recap.improved(moved.id, false, moved.from, moved.to)));
    return plate(D.copy.dash.week, rows);
  }

  // Every table, as the child's Grid draws it (2026-09-26): what no open table covers yet is faint.
  function gridPlate(op) {
    const keys = []; for (let n = 2; n <= 12; n++) keys.push(n);
    const label = op === 'mul' ? D.copy.dash.products : D.copy.dash.divisions;
    if (!keys.some(a => D.scheduler.isOpen(String(a)))) return plate(label, [sub(D.copy.dash.noData)]);
    const t = u().el('table', { class: 'grid' });
    const head = u().el('tr', {}, [u().el('th', {}, op === 'mul' ? '×' : '÷')]);
    for (let n = 2; n <= 12; n++) head.appendChild(u().el('th', {}, String(n)));
    t.appendChild(head);
    for (const a of keys) {
      const row = u().el('tr', {}, [u().el('th', { class: D.scheduler.isOpen(String(a)) ? '' : 'later' }, String(a))]);
      for (let b = 2; b <= 12; b++) {
        const id = op === 'mul' ? D.facts.mulId(a, b) : D.facts.divId(a * b, a);
        // Never asked is blank here too; the fallback drew it as "not sealed".
        const cls = D.grid ? D.grid.cellClass(id)
          : ({ unasked: 'na', none: '', halfway: 's-fast', sealed: 's-sealed' })[D.mastery.gridState(id)];
        const later = D.grid && D.mastery.gridState(id) === 'unasked' && D.grid.opensWith(id);
        row.appendChild(u().el('td', { class: cls + (later ? ' later' : '') }));
      }
      t.appendChild(row);
    }
    return plate(label, [u().el('div', { class: 'wrapx' }, [t])]);
  }

  /* Each test's speed beside that week's round speed: a test sat by someone else
     tends to be much faster than the child's own rounds (audit R10). */
  function testsPlate(s) {
    const tests = (s.tests || []).slice(-8).reverse();
    if (!tests.length) return null;
    const rows = tests.map(tt => {
      const wk = D.u.weekKey(tt.day);
      const runMs = D.u.median((s.runs || []).filter(r => D.u.weekKey(r.day) === wk && r.medianRt)
        .map(r => r.medianRt));
      return line(D.copy.dash.testRow(tt.day, tt.passed, tt.correct, tt.total, tt.medianRt, runMs));
    });
    return plate(D.copy.dash.tests, rows);
  }

  /* ---- dashboard.html on its own: a link, a pasted link, or a file ---- */
  async function boot() {
    const root = document.getElementById('app');
    const m = location.hash.match(/s=([A-Za-z0-9_-]+)/);
    if (m && await load(m[1])) return render(root, {});
    loader(root);
  }
  async function load(payload) {
    try {
      D.state = D.save.migrate(await D.share.decode(payload));
      D.mastery.dirty();
      if (D.belt) D.belt.sync();
      return true;
    } catch (e) {
      return false;
    }
  }
  function loader(root) {
    u().clear(root);
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    placeholder: D.copy.dash.paste });
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.dash.open);
    go.addEventListener('click', async () => {
      const m = String(field.value || '').match(/s=([A-Za-z0-9_-]+)/);
      const payload = m ? m[1] : String(field.value || '').trim();
      if (payload && await load(payload)) render(root, {});
    });
    const file = u().el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          D.state = D.save.migrate(JSON.parse(reader.result));
          D.mastery.dirty();
          if (D.belt) D.belt.sync();
          render(root, {});
        } catch (e) { /* not a save: stay on the loader */ }
      };
      reader.readAsText(f);
    });
    const pick = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.dash.openFile);
    pick.addEventListener('click', () => file.click());
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'titlebar' }, D.copy.dash.title),
      field, go, pick, file,
      u().el('div', { class: 'grow' }),
    ]));
  }

  if (document.documentElement && document.documentElement.getAttribute &&
      document.documentElement.getAttribute('data-page') === 'dashboard') {
    document.addEventListener('DOMContentLoaded', boot);
  }

  return { render, boot };
})();
