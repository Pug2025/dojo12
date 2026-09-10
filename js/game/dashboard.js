/* Dojo 12 — what Dad sees (PLAN §9.5). The same view opens from the backup
   link on any device and from Settings on the child's own phone, so nothing
   here is written for one reader and hidden from the other. It reads the save
   and renders it; it never changes anything but the table entries it looks up. */
"use strict";
D.dashboard = (function () {
  const u = () => D.u;

  function plate(label, children) {
    return u().el('div', { class: 'plate col', style: { gap: '8px' } },
      [u().el('div', { class: 'label' }, label)].concat(children));
  }
  function line(text, cls) { return u().el('div', { class: 'small' + (cls ? ' ' + cls : '') }, text); }
  function stat(label, value) {
    return u().el('div', { class: 'row between' }, [
      u().el('span', { class: 'small' }, label),
      u().el('span', { class: 'value' }, String(value)),
    ]);
  }

  function render(root, opts) {
    const o = opts || {};
    const s = D.state;
    D.beyond.build();
    u().clear(root);
    const kids = [
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 'big' }, s.profile.name || D.copy.dash.title),
        u().el('div', { class: 'mid lvl' }, D.copy.home.level(D.xp.levelFor(s.progress.xp).level)),
      ]),
      checksPlate(s), workingPlate(s), weekPlate(s), beltPlate(s),
      gridPlate('mul'), gridPlate('div'),
    ];
    const tests = testsPlate(s);
    if (tests) kids.push(tests);
    kids.push(clockPlate(s));
    if (o.onBack) {
      const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
      back.addEventListener('click', o.onBack);
      kids.push(back);
    }
    root.appendChild(u().el('div', { class: 'screen dash' }, kids));
  }

  function checksPlate(s) {
    const found = D.share.checks(s);
    const rows = [line(found.length ? D.copy.dash.checksBad : D.copy.dash.checksOk,
                       found.length ? 'warnline' : 'okline')];
    for (const c of found) rows.push(line(D.copy.dash.checkLine(c.id, c.n), 'warnline'));
    return plate(D.copy.dash.checks, rows);
  }

  function workingPlate(s) {
    const rows = [];
    for (const key of [s.focus.primary, s.focus.secondary].filter(Boolean)) {
      const st = D.mastery.tableStats(key);
      rows.push(u().el('div', { class: 'value' }, D.copy.home.table(key, st.fastPlus, st.total)));
      const hot = D.scheduler.tableState(key).hot || [];
      if (hot.length) rows.push(line(D.copy.dash.hot(hot)));
    }
    if (!rows.length) rows.push(line(D.copy.dash.noData));
    return plate(D.copy.dash.nextUp, rows);
  }

  function weekPlate(s) {
    const day = D.u.gameDay(), wk = D.u.weekKey(day);
    const inWeek = d => d && D.u.weekKey(d) === wk;
    const rows = [
      stat(D.copy.dash.daysPlayed, (s.progress.weekDots || []).length),
      stat(D.copy.dash.runsThisWeek, (s.runs || []).filter(r => inWeek(r.day)).length),
      stat(D.copy.dash.golds, s.progress.goldsThisWeek || 0),
      stat(D.copy.dash.restores, (s.restores || []).filter(r => inWeek(r.day)).length),
      stat(D.copy.dash.fastWrongs,
           (s.progress.fastWrongs7d || []).filter(d => D.u.daysBetween(d, day) < 7).length),
    ];
    const moved = D.recap.mostImproved();
    if (moved) rows.push(line(D.copy.recap.improved(moved.id, false, moved.from, moved.to)));
    return plate(D.copy.dash.week, rows);
  }

  function beltPlate(s) {
    const rows = [];
    for (const key of D.scheduler.beltKeys()) {
      const t = D.scheduler.tableState(key);
      const st = D.mastery.tableStats(key);
      rows.push(u().el('div', { class: 'row between' }, [
        u().el('span', { class: 'row', style: { gap: '10px' } }, [
          u().el('i', { class: 'belt b-' + t.belt }),
          u().el('span', {}, D.copy.tableLabel(key)),
        ]),
        u().el('span', { class: 'small' }, D.copy.belts.count(st.fastPlus, st.total)),
      ]));
    }
    if (!rows.length) rows.push(line(D.copy.dash.noData));
    return plate(D.copy.dash.belts, rows);
  }

  function gridPlate(op) {
    const keys = D.facts.TABLE_ORDER.filter(k => k !== 'sq' && D.scheduler.isOpen(k))
      .map(Number).sort((a, b) => a - b);
    const label = op === 'mul' ? D.copy.dash.products : D.copy.dash.divisions;
    if (!keys.length) return plate(label, [line(D.copy.dash.noData)]);
    const t = u().el('table', { class: 'grid' });
    const head = u().el('tr', {}, [u().el('th', {}, op === 'mul' ? '×' : '÷')]);
    for (let n = 2; n <= 12; n++) head.appendChild(u().el('th', {}, String(n)));
    t.appendChild(head);
    for (const a of keys) {
      const row = u().el('tr', {}, [u().el('th', {}, String(a))]);
      for (let b = 2; b <= 12; b++) {
        const id = op === 'mul' ? D.facts.mulId(a, b) : D.facts.divId(a * b, a);
        const st = D.mastery.status(id);
        const rec = D.mastery.peek(id);
        const cls = ['s-' + st];
        if (st === 'auto' && rec && rec.missDays && rec.missDays.length === 1) cls.push('dotted');
        row.appendChild(u().el('td', { class: cls.join(' ') }));
      }
      t.appendChild(row);
    }
    return plate(label, [u().el('div', { class: 'gridwrap' }, [t])]);
  }

  // Each Belt Test's speed beside that week's run speed: a test sat by someone
  // else tends to be much faster than the child's own runs (audit R10).
  function testsPlate(s) {
    const tests = (s.tests || []).slice(-8).reverse();
    if (!tests.length) return null;
    const rows = tests.map(tt => {
      const wk = D.u.weekKey(tt.day);
      const runMs = D.u.median((s.runs || []).filter(r => D.u.weekKey(r.day) === wk && r.medianRt)
        .map(r => r.medianRt));
      return line(D.copy.dash.testRow(tt.key, tt.correct, tt.total, tt.medianRt, runMs));
    });
    return plate(D.copy.dash.tests, rows);
  }

  function clockPlate(s) {
    const ahead = (s.lastSeenEpoch || 0) - Date.now();
    const rows = [
      line(ahead > 5 * 60000 ? D.copy.dash.clockAhead(Math.round(ahead / 60000)) : D.copy.dash.clockOk,
           ahead > 5 * 60000 ? 'warnline' : ''),
    ];
    if (s.lastSeenEpoch) rows.push(line(D.copy.dash.lastPlayed(D.u.todayKey(new Date(s.lastSeenEpoch)))));
    return plate(D.copy.dash.skew, rows);
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
      return true;
    } catch (e) {
      return false;
    }
  }
  function loader(root) {
    u().clear(root);
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    placeholder: D.copy.dash.paste });
    const go = u().el('button', { class: 'btn primary wide', type: 'button' }, D.copy.dash.open);
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
        try { D.state = D.save.migrate(JSON.parse(reader.result)); D.mastery.dirty(); render(root, {}); }
        catch (e) { /* not a save: stay on the loader */ }
      };
      reader.readAsText(f);
    });
    const pick = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.dash.openFile);
    pick.addEventListener('click', () => file.click());
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'big' }, D.copy.dash.title),
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
