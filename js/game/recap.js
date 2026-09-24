/* Dojo 12 — the week's recap. Three lines at most, and only when it has at least
   two of them. Numbers, not adjectives. It sits on Home, titled "Your week", until
   the child taps OK (2026-09-24): after the first round of a new week it came
   between the last card and the score, with a Play button. */
"use strict";
D.recap = (function () {
  function due() {
    const wk = D.u.weekKey(D.u.gameDay());
    return D.state.flags.lastRecapWeek !== wk && (D.state.runs || []).length > 0;
  }

  function lines() {
    const out = [];
    const p = D.state.progress;
    if (p.doneLastWeek > 0) out.push(D.copy.recap.done(p.doneLastWeek));
    const moved = mostImproved();
    if (moved) out.push(D.copy.recap.improved(moved.id, false, moved.from, moved.to));
    // Last week's own fastest (save.rollWeek). The all-time best could be months old,
    // or set that morning and shown as last week's (review 2026-09-24).
    const fast = p.lastWeekFastest;
    if (fast && fast.ms && D.facts.get(fast.id)) out.push(D.copy.recap.fastest(fast.id, !!fast.flip, fast.ms));
    return out;
  }

  // The biggest honest drop in a question's own average time over last week.
  // rollWeek writes this week's snapshot at the same rollover the recap follows,
  // so the newest one is this morning's; last week's is the one before it
  // (audit 2026-09-14: "Most improved" could never fire).
  function mostImproved() {
    const keys = Object.keys(D.state.snapshots || {}).sort();
    const shot = keys.length >= 2 ? D.state.snapshots[keys[keys.length - 2]] : null;
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

  /* The plate Home shows while the recap is due, or null. A week with fewer than two
     lines is marked shown and says nothing. OK puts it away for the week. */
  function plate(onOk) {
    if (!due()) return null;
    const list = lines();
    if (list.length < 2) { markShown(); return null; }
    const ok = D.u.el('button', { class: 'btn', type: 'button' }, D.copy.recap.close);
    ok.addEventListener('click', () => { markShown(); if (onOk) onOk(); });
    return D.u.el('div', { class: 'plate recap' }, [
      D.u.el('div', { class: 't17', style: { fontWeight: '700' } }, D.copy.recap.title),
    ].concat(list.slice(0, 3).map(line => D.u.el('div', { class: 't15' }, line)), [ok]));
  }

  return { due, lines, mostImproved, plate, markShown };
})();
