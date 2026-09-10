/* Dojo 12 — the backup link (PLAN §9.5).
   One link holds the whole save, exactly. The save is JSON, deflated and
   base64url encoded: the key names repeat so much that deflate does the work a
   hand-packed integer block would have done, and a round trip through JSON
   cannot lose a field the way a fixed layout can. About 5 KB in practice.
   There is no server and no account; this link is the only durable copy. */
"use strict";
D.share = (function () {
  let cached = null;                 // { link, file } precomputed for a click

  /* ---- base64url, chunked so a big payload cannot blow the stack ---- */
  function toB64(bytes) {
    let out = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(text) {
    const pad = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(pad + '==='.slice((pad.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function squeeze(text) {
    const input = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'undefined') return input;
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([input]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unsqueeze(bytes) {
    if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes);
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }

  async function encode(state) { return toB64(await squeeze(JSON.stringify(state))); }
  async function decode(text) { return JSON.parse(await unsqueeze(fromB64(text))); }

  function base() {
    const here = location.href.split('#')[0].split('?')[0];
    return here.replace(/[^/]*$/, '') + 'dashboard.html';
  }

  /* Precomputed, because Safari drops the user activation across an awaited
     compression and navigator.share then refuses to open (PLAN §9.5). */
  async function precompute() {
    const payload = await encode(D.state);
    cached = { payload: payload, link: base() + '#s=' + payload };
    return cached;
  }
  function link() { return cached ? cached.link : null; }

  // Called straight from a click handler, with no await before it.
  function shareNow() {
    if (!cached) return false;
    if (navigator.share) {
      navigator.share({ url: cached.link }).catch(() => {});
      return true;
    }
    return false;
  }
  function copyNow() {
    if (!cached) return false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cached.link).catch(() => {});
      return true;
    }
    return false;
  }
  function fileNow() {
    if (!cached) return false;
    const blob = new Blob([JSON.stringify(D.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dojo12-' + D.state.profile.slug + '-' + D.u.todayKey() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }

  /* ---- restore (PLAN §9.5) ----
     A backup older than the phone's own save is refused, so the link cannot be
     used to undo a failed Belt Test or a bad run. Every restore stamps the day's
     tests and the day's full-XP count, and logs itself where the dashboard can
     see it. */
  function isOlder(payload) {
    const local = D.state;
    const empty = !local || !local.facts || Object.keys(local.facts).length === 0;
    if (empty) return false;
    return (payload.lastSeenEpoch || 0) < (local.lastSeenEpoch || 0);
  }
  function apply(payload) {
    if (!payload || !payload.facts || !payload.profile) return { ok: false, reason: 'shape' };
    if (isOlder(payload)) return { ok: false, reason: 'older' };
    const local = D.state || {};
    const fromEpoch = local.lastSeenEpoch || 0;
    const next = D.save.migrate(payload);
    // Nothing a restore brings back may move the clock anchors backwards, or a
    // restore would mint a game-day the six-hour rule would not.
    next.lastSeenEpoch = Math.max(next.lastSeenEpoch || 0, fromEpoch, D.u.now());
    next.rolloverEpoch = Math.max(next.rolloverEpoch || 0, local.rolloverEpoch || 0);
    if (local.gameDay && (!next.gameDay || local.gameDay > next.gameDay)) next.gameDay = local.gameDay;
    for (const key of Object.keys(next.tables || {})) {
      next.tables[key].testAttemptDay = next.gameDay;
    }
    next.progress.fullXpToday = D.cfg.XP_FULL_PER_DAY;
    next.restores = (next.restores || []).concat([{ day: next.gameDay, fromEpoch: fromEpoch }]);
    while (next.restores.length > 20) next.restores.shift();
    D.state = next;
    D.mastery.dirty();
    D.save.commitNow();
    return { ok: true };
  }

  /* ---- what the dashboard checks (PLAN §9.5) ----
     Not proof, but a doctored save has to be doctored consistently, and these
     are the numbers that are easy to raise and hard to keep in step. */
  function checks(state) {
    const out = [];
    const facts = state.facts || {};
    let autoThin = 0, dayAhead = 0, everSeen = 0, correct = 0;
    for (const id of Object.keys(facts)) {
      const r = facts[id];
      if (r.days && r.days.length >= D.cfg.AUTO_DAYS && r.seen < 4) autoThin++;
      for (const d of (r.days || [])) if (d > state.gameDay) dayAhead++;
      everSeen += r.seen || 0;
      correct += r.ok || 0;
    }
    if (autoThin) out.push({ id: 'thin', n: autoThin });
    if (dayAhead) out.push({ id: 'ahead', n: dayAhead });

    const runs = state.runs || [];
    // XP can only have come from correct answers, gold, belts and grandmaster.
    // Each fact counts its own correct answers for life, so their sum bounds the
    // answers that could ever have paid, even after the run history rolls over.
    // A belt can be won, lost to the provisional rule and won again, hence two.
    const belts = D.facts.TABLE_ORDER.length + (D.beyond ? D.beyond.topics().length : 0);
    const ceiling = correct * D.cfg.XP_PER_CORRECT * D.cfg.WEIGHT_BEYOND
      + Object.keys(facts).length * D.cfg.XP_GOLD
      + 2 * belts * D.cfg.XP_BLACK_BELT + D.cfg.XP_GRANDMASTER + 500;
    if ((state.progress.xp || 0) > ceiling) out.push({ id: 'xp', n: Math.round(state.progress.xp - ceiling) });

    // A run takes at least a minute and a half of real time.
    const byDay = {};
    for (const r of runs) byDay[r.day] = (byDay[r.day] || 0) + 1;
    const busiest = Object.keys(byDay).reduce((m, d) => Math.max(m, byDay[d]), 0);
    if (busiest > 16 * 60 / 1.5) out.push({ id: 'runs', n: busiest });
    if (correct > everSeen) out.push({ id: 'counts', n: correct - everSeen });
    return out;
  }

  return { encode, decode, precompute, link, shareNow, copyNow, fileNow, apply, isOlder,
           checks, toB64, fromB64, base,
           get cached() { return cached; } };
})();
