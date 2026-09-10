/* Dojo 12 — the weekly recap (PLAN §7.1). Three lines at most, after the first
   run of a new week, and only if there are at least two of them. Numbers, not
   adjectives. */
"use strict";
D.recap = (function () {
  function due() {
    const p = D.state.progress;
    const wk = D.u.weekKey(D.u.gameDay());
    return D.state.flags.lastRecapWeek !== wk && (D.state.runs || []).length > 0;
  }

  function lines() {
    const out = [];
    const p = D.state.progress;
    if (p.goldsLastWeek > 0) out.push(D.copy.recap.gold(p.goldsLastWeek));
    const moved = mostImproved();
    if (moved) out.push(D.copy.recap.improved(moved.id, false, moved.from, moved.to));
    const fast = D.state.pbs.fastestFact;
    if (fast && fast.ms) out.push(D.copy.recap.fastest(fast.id, false, fast.ms));
    return out;
  }

  // The biggest honest drop in a fact's own average time since the week began.
  function mostImproved() {
    const keys = Object.keys(D.state.snapshots || {}).sort();
    const shot = D.state.snapshots[keys[keys.length - 1]];
    if (!shot) return null;
    let best = null;
    for (const id of Object.keys(shot)) {
      const r = D.mastery.peek(id);
      if (!r || r.ewma === null) continue;
      const drop = shot[id] - r.ewma;
      if (drop < 400) continue;
      if (!best || drop > best.drop) best = { id: id, drop: drop, from: shot[id], to: r.ewma };
    }
    return best;
  }

  function markShown() {
    D.state.flags.lastRecapWeek = D.u.weekKey(D.u.gameDay());
    D.save.commit();
  }

  function render(root, onDone) {
    const list = lines();
    if (list.length < 2) { markShown(); return onDone(); }
    markShown();
    D.u.clear(root);
    const box = D.u.el('div', { class: 'col lines' });
    for (const line of list.slice(0, 3)) box.appendChild(D.u.el('div', { class: 'mid' }, line));
    const go = D.u.el('button', { class: 'btn primary wide', type: 'button' }, D.copy.recap.close);
    go.addEventListener('click', onDone);
    root.appendChild(D.u.el('div', { class: 'screen' }, [
      D.u.el('div', { class: 'grow' }),
      D.u.el('div', { class: 'big' }, D.copy.recap.title),
      box,
      D.u.el('div', { class: 'grow' }),
      go,
    ]));
    return true;
  }

  return { due, lines, mostImproved, render, markShown };
})();
