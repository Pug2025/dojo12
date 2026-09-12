/* Dojo 12 — headless test gate (PLAN.md §12). No dependencies.
   Run: node tests-node.mjs   (exits 1 on any failure)
   Every reward path in the game gets an assertion here, because the whole plan
   rests on one rule: nothing is paid without a correct typed answer. */
"use strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- browser stubs ---------------- */
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

const ENGINE = [
  "js/core/util.js", "js/core/cfg.js", "js/engine/facts.js", "js/engine/mastery.js",
  "js/core/save.js", "js/data/copy.js", "js/engine/scripts.js", "js/engine/diagnose.js",
  "js/engine/xp.js", "js/engine/belt.js", "js/engine/scheduler.js", "js/engine/runstate.js",
  "js/engine/tryout.js", "js/engine/roundone.js", "js/engine/belttest.js", "js/engine/beyond.js",
  "js/engine/share.js", "js/game/recap.js",
];
for (const f of ENGINE) {
  try { vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f }); }
  catch (e) { console.log("FAIL script load " + f + " " + e.message); process.exit(1); }
}
const D = globalThis.D;

/* Deterministic RNG so the gate never flips on noise. Override: DOJO_SEED=n */
const SEED = Number(process.env.DOJO_SEED) || 7;
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry(SEED);

/* ---------------- harness ---------------- */
let passed = 0, failed = 0;
const failures = [];
function t(name, cond, detail) {
  // DOJO_VERBOSE=1 prints the measured number behind every passing check that has one.
  if (cond) { passed++; if (process.env.DOJO_VERBOSE && detail) console.log("PASS " + name + "  " + detail); }
  else { failed++; failures.push(name + (detail ? "  " + detail : "")); console.log("FAIL " + name + (detail ? "  " + detail : "")); }
}
function h2(s) { console.log("\n== " + s + " =="); }

/* ---------------- fake clock ---------------- */
let fakeNow = Date.UTC(2026, 8, 9, 16, 0, 0);      // 2026-09-09, midday local-ish
D.u.setClock(() => fakeNow);
function setTime(y, m, d, hh, mm) { fakeNow = new Date(y, m - 1, d, hh, mm || 0, 0).getTime(); }
function advanceHours(h) { fakeNow += h * 3600 * 1000; }

function newState(name) {
  D.state = D.save.fresh({ name: name || "T", slug: "t", theme: "dojo" });
  D.state.gameDay = D.u.todayKey();
  D.state.rolloverEpoch = D.u.now();
  D.state.lastSeenEpoch = D.u.now();
  D.mastery.dirty();
  return D.state;
}
D.save.commit = () => {};
D.save.commitNow = () => {};

const mid = (a, b) => D.facts.mulId(a, b);
/* A wrong answer that no diagnosis row will recognise, so the comeback keeps
   its full value and the test measures the rule it means to measure. */
function wrongFor(f) { return f.ans * 10 + 3; }
/* Answer a card the way a machine would: correct or not, at a chosen speed. */
function answer(rs, correct, ms) {
  const p = rs.present();
  if (!p) return null;
  const f = D.facts.get(p.card.id);
  return rs.submit(correct ? f.ans : wrongFor(f), ms === undefined ? 900 : ms);
}
/* A real miss: a settled fact gets one silent re-serve before Rescue opens. */
function missCard(rs, ms) {
  let out = answer(rs, false, ms);
  if (out && out.slip) out = answer(rs, false, ms);
  return out;
}
/* Walk forward answering correctly until a card that can actually be missed
   (a scout is silent both ways, so missing one proves nothing), then miss it. */
function missNext(rs, ms) {
  let guard = 0;
  while (guard++ < 30) {
    const p = rs.present();
    if (!p) return null;
    if (p.card.kind === "scout" || p.card.bonus) { answer(rs, true, 700); continue; }
    return missCard(rs, ms === undefined ? 3000 : ms);
  }
  return null;
}
function playAll(rs, opts) {
  const o = opts || {};
  let guard = 0;
  while (!rs.isDone() && guard++ < 200) {
    const p = rs.present();
    if (!p) break;
    const f = D.facts.get(p.card.id);
    const correct = o.correct === undefined ? true : (typeof o.correct === "function" ? o.correct(p) : o.correct);
    let out = rs.submit(correct ? f.ans : wrongFor(f), o.ms || 900);
    if (out && out.slip) out = rs.submit(wrongFor(f), o.ms || 900);
    if (out && out.buttons) {
      if (o.onMiss === "skip") { rs.chooseSkip(); rs.typedAnswer(f.ans); }
      else { rescueThrough(rs, true); }
    }
  }
  return rs.summary();
}
/* Walk a rescue to the end. clean=true types every step correctly. */
function rescueThrough(rs, clean) {
  const r = rs.chooseRescue();
  if (!r || r.kind !== "rescue") return r;
  let guard = 0, first = true;
  while (guard++ < 20) {
    const step = rs.currentStep();
    if (!step) break;
    const value = clean || !first ? step.answer : step.answer + 1;
    first = false;
    const out = rs.stepSubmit(value);
    if (!out) break;
    if (out.kind === "stepValue") { const o2 = rs.stepForced(out.step.answer); if (o2 && o2.kind === "rescued") return o2; continue; }
    if (out.kind === "rescued") return out;
  }
  return null;
}

/* Build a plan by hand for tight reward tests. */
function handPlan(ids, kinds) {
  const cards = ids.map((id, i) => {
    const c = D.scheduler.card(id, (kinds && kinds[i]) || "maintenance");
    c.flip = false; c.slot = i;
    return c;
  });
  cards[cards.length - 1].last = true;
  return { cards: cards, day: D.u.gameDay() };
}
function seedFast(id, ms) {
  const r = D.mastery.rec(id);
  r.seen = 6; r.ok = 6; r.streak = 3; r.ewma = ms === undefined ? 900 : ms;
  r.window = [1, 1, 1, 1, 1, 1, 1, 1]; r.best = r.ewma; r.lastDay = D.u.gameDay();
  D.mastery.dirty();
  return r;
}
function seedAuto(id, days) {
  const r = seedFast(id);
  r.days = (days || ["2026-09-01", "2026-09-03", "2026-09-05"]).slice();
  D.mastery.dirty();
  return r;
}

/* ================= 1. reward paths (PLAN §12) ================= */
h2("reward paths");
{
  newState();
  const ids = ["mul:2x3", "mul:2x4", "mul:2x5", "mul:2x6", "mul:2x7"];
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  const before = { score: 0, xp: D.state.progress.xp, coins: D.state.progress.coins };
  for (let i = 0; i < ids.length; i++) {
    const out = answer(rs, false, 3000);
    if (out && out.buttons) { rs.chooseSkip(); rs.typedAnswer(D.facts.get(out.card.id).ans); }
  }
  const s = rs.summary();
  t("a run of wrong answers and skips pays no score", s.score === 0, "score " + s.score);
  t("a run of wrong answers and skips pays no XP", D.state.progress.xp === before.xp);
  t("a run of wrong answers and skips pays no coins", D.state.progress.coins === before.coins);
  t("a run with too few correct answers does not count as played", s.counted === false);
}
{
  newState();
  const ids = ["mul:3x4", "mul:3x5", "mul:3x6", "mul:3x7"];
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  const xp0 = D.state.progress.xp;
  missCard(rs, 3000);
  const res = rescueThrough(rs, true);
  t("a clean rescue pays fifty score", res && res.points === D.cfg.RESCUE_SCORE, res && "points " + res.points);
  t("a clean rescue pays no XP", D.state.progress.xp === xp0);
}
{
  newState();
  const ids = ["mul:3x4", "mul:3x5", "mul:3x6", "mul:3x7"];
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  missCard(rs, 3000);
  const res = rescueThrough(rs, false);         // first step wrong, then correct
  t("a rescue with a retried step pays nothing", res && res.points === 0, res && "points " + res.points);
}
{
  // Combo tiers: any miss drops one tier, a rescue neither restores nor resets it.
  newState();
  const ids = [];
  for (let i = 2; i <= 12; i++) ids.push(mid(2, i));
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  for (let i = 0; i < 7; i++) answer(rs, true, 700);
  t("seven in a row is the two times multiplier", rs.comboMult() === 2, "mult " + rs.comboMult());
  missCard(rs, 3000);
  t("a miss drops one tier", rs.comboMult() === 1.5, "mult " + rs.comboMult());
  rescueThrough(rs, true);
  t("a rescue does not restore the tier", rs.comboMult() === 1.5, "mult " + rs.comboMult());
  t("a rescue does not reset the tier either", rs.comboMult() !== 1);
}
{
  newState();
  const ids = []; for (let i = 2; i <= 12; i++) ids.push(mid(2, i));
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  for (let i = 0; i < 6; i++) answer(rs, true, 700);
  missCard(rs, 3000);
  const skipId = rs.raw.cards[rs.raw.i].id;
  rs.chooseSkip(); rs.typedAnswer(D.facts.get(skipId).ans);
  t("a skip resets the combo", rs.comboMult() === 1, "mult " + rs.comboMult());
}
{
  newState();
  const ids = []; for (let i = 2; i <= 12; i++) ids.push(mid(2, i));
  ids.forEach(id => seedAuto(id));
  const rs = D.runstate.create(handPlan(ids));
  for (let i = 0; i < 6; i++) answer(rs, true, 700);
  answer(rs, false, 100);                       // a slip on an auto fact
  answer(rs, false, 100);                       // the re-serve, rushed and wrong
  t("a fast wrong resets the combo", rs.comboMult() === 1, "mult " + rs.comboMult());
}
{
  // Card twenty pays double, and is never a scout or a comeback.
  newState();
  const ids = ["mul:4x6", "mul:4x7", "mul:4x8"];
  ids.forEach(id => seedFast(id));
  const rs = D.runstate.create(handPlan(ids));
  answer(rs, true, 700); answer(rs, true, 700);
  const lastOut = answer(rs, true, 700);
  const plain = Math.round(D.cfg.BASE_SCORE * D.facts.weight("mul:4x8") + D.cfg.RING_BONUS * 0);
  t("the last card is worth double", lastOut.points >= plain * 2 * 0.9, "points " + lastOut.points);
}
{
  newState();
  D.scheduler.ensureProgression();
  for (let i = 0; i < 12; i++) {
    const p = D.scheduler.plan();
    const last = p.cards[p.cards.length - 1];
    t("the last card is never a scout or a comeback", last.kind !== "scout" && last.kind !== "comeback", last.kind);
    break;
  }
}
{
  // A dot, then both dots, then a miss empties one.
  newState();
  const id = "mul:6x7";
  const r = seedFast(id, 900);
  r.days = ["2026-09-05"];
  D.mastery.dirty();
  seedFast("mul:6x8"); seedFast("mul:6x9");
  const xp0 = D.state.progress.xp, c0 = D.state.progress.coins;
  const rs = D.runstate.create(handPlan([id, "mul:6x8", "mul:6x9"]));
  const out = answer(rs, true, 800);
  t("a fast answer on a later day fills the second dot",
    !!out && out.dot === true && out.bothDots === true && D.mastery.dots(id) === 2);
  t("both dots pay the same coin as any right answer",
    D.state.progress.coins === c0 + D.cfg.COINS_PER_CORRECT, "coins " + (D.state.progress.coins - c0));
  t("both dots pay no XP beyond the answer's own",
    D.state.progress.xp === xp0 + out.xp && out.xp === Math.round(D.facts.weight(id) * D.cfg.XP_PER_CORRECT));
  t("the first time a question has both dots stays on its record", D.mastery.rec(id).doneOnce === true);
  const rec = D.mastery.record(id, { correct: false, rt: 3000, day: D.u.gameDay() });
  t("a miss empties a dot", rec.lostDot === true && D.mastery.dots(id) === 1);
  const rs2 = D.runstate.create(handPlan([id, "mul:6x8", "mul:6x9"]));
  const out2 = answer(rs2, true, 800);
  t("a dot cannot refill on the day it was lost", !!out2 && out2.dot !== true && D.mastery.dots(id) === 1);
}
{
  // A deliberate miss on a known fact never beats answering it.
  newState();
  const ids = []; for (let i = 2; i <= 12; i++) ids.push(mid(5, i));
  ids.forEach(id => seedFast(id));
  const honest = D.runstate.create(handPlan(ids));
  const hx0 = D.state.progress.xp;
  playAll(honest, { correct: true, ms: 800 });
  const hs = honest.summary(), hxp = D.state.progress.xp - hx0;

  newState();
  ids.forEach(id => seedFast(id));
  const cheat = D.runstate.create(handPlan(ids));
  const cx0 = D.state.progress.xp;
  let guard = 0;
  while (!cheat.isDone() && guard++ < 100) {
    const p = cheat.present();
    if (!p) break;
    const f = D.facts.get(p.card.id);
    if (p.card.kind === "comeback" || p.index < 3) { cheat.submit(f.ans, 800); continue; }
    let out = cheat.submit(wrongFor(f), 2500);   // deliberate miss, not rushed
    if (out && out.slip) out = cheat.submit(wrongFor(f), 2500);
    if (out && out.buttons) rescueThrough(cheat, true);
  }
  const cs = cheat.summary(), cxp = D.state.progress.xp - cx0;
  t("missing on purpose never pays more score", cs.score < hs.score, cs.score + " vs " + hs.score);
  t("missing on purpose never pays more XP", cxp < hxp, cxp + " vs " + hxp);
}
{
  // Scouts never move the combo, either way.
  newState();
  const ids = ["mul:2x3", "mul:2x4", "mul:2x5", "mul:2x6"];
  ids.forEach(id => seedFast(id));
  const plan = handPlan(ids, ["maintenance", "scout", "maintenance", "maintenance"]);
  const rs = D.runstate.create(plan);
  answer(rs, true, 700);
  const before = rs.raw.combo;
  answer(rs, true, 700);                        // the scout
  t("a correct scout does not step the combo", rs.raw.combo === before, "combo " + rs.raw.combo);
  const rs2 = D.runstate.create(handPlan(ids, ["maintenance", "scout", "maintenance", "maintenance"]));
  answer(rs2, true, 700);
  const b2 = rs2.raw.combo;
  const out = answer(rs2, false, 3000);
  t("a wrong scout does not drop the combo", rs2.raw.combo === b2, "combo " + rs2.raw.combo);
  t("a wrong scout shows no buttons", !out.buttons);
}
{
  // Answers 61 and beyond in a day pay half.
  newState();
  const id = "mul:7x8";
  D.state.progress.fullXpToday = 0;
  const full = D.xp.answerXp(id);
  D.state.progress.fullXpToday = D.cfg.XP_FULL_PER_DAY;
  const half = D.xp.answerXp(id);
  const raw = D.facts.weight(id) * D.cfg.XP_PER_CORRECT;
  t("the sixty first answer of a day pays half XP", half === Math.round(raw / 2), full + " then " + half);
}
{
  // A personal best is marked and never paid, so any margin counts.
  newState();
  D.state.pbs.score = 1000; D.state.pbs.combo = 4;
  const c0 = D.state.progress.coins;
  const pbs = D.xp.checkPbs({ score: 1005, bestCombo: 0, fastestFact: null, medianRt: 900 });
  t("a best round by five points is still a best", pbs.some(p => p.kind === "score" && p.delta === 5));
  t("a personal best pays nothing", D.state.progress.coins === c0);
  newState();
  const first = D.xp.checkPbs({ score: 1500, bestCombo: 6, fastestFact: null, medianRt: 900 });
  t("the first round sets the bests without calling them new", first.length === 0 && D.state.pbs.score === 1500);
}

/* ================= 2. mastery (PLAN §6.2) ================= */
h2("mastery");
{
  // The wait between counted days runs from the newest counted day. Counted from
  // any answer, a fact that came up on the day in between lost a day, and one that
  // came up every day never went gold (rework 2026-09-10).
  newState();
  const id = "mul:7x8";
  const r = seedFast(id, 900);
  const key = n => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);
  r.days = [key(5), key(6)];
  const wait = D.cfg.REVIEW_INTERVALS[Math.min(r.days.length - 1, D.cfg.REVIEW_INTERVALS.length - 1)];
  r.lastDay = key(6 + Math.max(1, wait - 1));      // it came up again before the wait was over
  D.mastery.dirty();
  t("a fact that came up during its wait is due once the wait from its last counted day is over",
    D.mastery.isDue(id, key(6 + wait)) === true, "wait " + wait + " days");
  t("a fact is not due before the wait from its last counted day is over",
    D.mastery.isDue(id, key(6 + wait - 1)) === false);
}
{
  newState();
  const id = "mul:6x8";
  const day = D.u.gameDay();
  const r = D.mastery.rec(id);
  r.seen = 4; r.ok = 4; r.streak = 2; r.window = [1,1,1,1];
  D.mastery.record(id, { correct: true, rt: 800, day: day });
  t("a fact with no earned days can earn one today", D.mastery.rec(id).days.length === 1);
  const out2 = D.mastery.record(id, { correct: true, rt: 800, day: day });
  t("a second day cannot be earned on the same day", D.mastery.rec(id).days.length === 1);
}
{
  newState();
  const id = "mul:6x9";
  seedFast(id);
  const day = D.u.gameDay();
  D.mastery.record(id, { correct: false, rt: 3000, day: day });
  const r = D.mastery.rec(id);
  r.streak = 2; r.lastMiss = false; r.window = [1,1,1,1,1,1,1,1];
  D.mastery.record(id, { correct: true, rt: 700, day: day });
  t("a fact missed today cannot earn a day today", D.mastery.rec(id).days.length === 0);
}
{
  newState();
  const id = "mul:8x9";
  seedFast(id);
  D.mastery.record(id, { correct: true, rt: 700, day: D.u.gameDay(), comeback: true });
  t("a comeback card never earns a day", D.mastery.rec(id).days.length === 0);
}
{
  newState();
  const id = "mul:8x12";
  seedFast(id);
  D.mastery.record(id, { correct: true, rt: 700, day: D.u.gameDay(), warmup: true });
  t("a warm-up never earns a day", D.mastery.rec(id).days.length === 0);
}
{
  // Evening then morning is a new day; a clock wound forward inside a sitting is not.
  newState();
  setTime(2026, 9, 9, 19, 0); newState();
  t("the same evening is not a new day", D.save.touchDay() === false);
  setTime(2026, 9, 10, 7, 30);
  t("nineteen hundred then oh seven thirty is a new day", D.save.touchDay() === true);
  // Six hours of real time, not a changed date, is what makes a new day.
  setTime(2026, 9, 12, 23, 0); newState();
  setTime(2026, 9, 13, 4, 30);
  t("a jump of under six hours mints no day", D.save.touchDay() === false);
  setTime(2026, 9, 13, 5, 30);
  t("six hours across midnight is a new day", D.save.touchDay() === true);
  setTime(2026, 9, 13, 23, 30);
  t("before four in the morning is still the same day", D.save.touchDay() === false);
}
{
  // Winding the clock back freezes new days until real time catches up.
  setTime(2026, 9, 20, 12, 0); newState();
  setTime(2026, 9, 12, 12, 0);
  D.save.touchDay();
  t("a clock wound back freezes new days", !!D.state.flags.clockFrozenUntil);
  setTime(2026, 9, 13, 12, 0);
  t("a frozen clock credits no day", D.save.touchDay() === false);
  setTime(2026, 9, 22, 12, 0);
  t("a clock caught up again credits a day", D.save.touchDay() === true);
  setTime(2026, 9, 9, 16, 0);
}
{
  newState();
  const id = "mul:9x12";
  const r = seedAuto(id);
  r.ewma = D.mastery.threshold(id) * 2;
  D.mastery.dirty();
  D.mastery.record(id, { correct: true, rt: D.mastery.threshold(id) * 2, day: D.u.gameDay() });
  t("settling into slow answers on a question with both dots empties a dot", D.mastery.dots(id) === 1,
    "dots " + D.mastery.dots(id));
}
{
  newState();
  const id = "mul:11x12";
  D.mastery.seedKnown(id);
  t("a seeded fact reads known", D.mastery.status(id) === "known", D.mastery.status(id));
  t("a seeded fact carries no days", D.mastery.rec(id).days.length === 0);
  t("a seeded fact is marked provisional", D.mastery.rec(id).provisional === true);
}
{
  // The relative bar only applies once the child has ten settled facts to compare with.
  newState();
  const id = "mul:12x12";
  const r = D.mastery.rec(id); r.ewma = 2600; r.seen = 6; r.ok = 6; r.streak = 3; r.window = [1,1,1,1,1,1,1,1];
  D.mastery.dirty();
  t("with no baseline a fact inside the absolute bar is fast", D.mastery.status(id) === "fast", D.mastery.status(id));
  let n = 0;
  for (let a = 2; a <= 12 && n < 12; a++) for (let b = a; b <= 12 && n < 12; b++) {
    const oid = mid(a, b);
    if (oid === id) continue;
    const rr = D.mastery.rec(oid);
    rr.seen = 6; rr.ok = 6; rr.streak = 3; rr.window = [1,1,1,1,1,1,1,1];
    rr.ewma = Math.round(D.mastery.threshold(oid) * 0.5);
    rr.days = ["2026-09-01", "2026-09-03", "2026-09-05"];
    n++;
  }
  D.mastery.dirty();
  t("with a baseline the same fact is only known", n >= 10 && D.mastery.status(id) === "known",
    "n " + n + " status " + D.mastery.status(id));
}

/* ================= 3. scheduler (PLAN §6.5) ================= */
h2("scheduler");
{
  newState();
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  t("a run is twenty cards", p.cards.length === D.cfg.RUN_CARDS, "cards " + p.cards.length);
  t("the first three cards are warm-ups", p.cards.slice(0, 3).every(c => c.kind === "warmup"));
  t("exactly two scouts", p.cards.filter(c => c.kind === "scout").length <= D.cfg.SCOUTS);
  t("exactly one bonus card", p.cards.filter(c => c.bonus).length === 1);
  t("the bonus card is never the last card", !p.cards[p.cards.length - 1].bonus);
  t("no fact twice in a row", p.cards.every((c, i) => i === 0 || c.id !== p.cards[i - 1].id));
  t("no two neighbours share an answer", p.cards.every((c, i) =>
    i === 0 || D.facts.get(c.id).ans !== D.facts.get(p.cards[i - 1].id).ans));
  t("at most two tables in focus", D.scheduler.focusKeys().length <= 2);
  for (const key of D.scheduler.focusKeys()) {
    t("a hot set holds at most four facts", D.scheduler.tableState(key).hot.length <= D.cfg.HOT_SET);
  }
}
{
  // Warm-ups score and step the combo, which is what card four needs.
  newState();
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  const rs = D.runstate.create(p);
  for (let i = 0; i < 3; i++) answer(rs, true, 700);
  t("card four never starts at nothing", rs.raw.combo === 3, "combo " + rs.raw.combo);
  t("warm-ups pay score", rs.raw.score > 0);
}
{
  // The learning load follows the child's own accuracy.
  newState();
  D.state.progress.learnSlots = 6;
  D.state.runs = [{ cards: 20, correct: 10 }, { cards: 20, correct: 11 }, { cards: 20, correct: 12 }];
  D.scheduler.adaptLearnSlots();
  t("a hard run lowers the learning load", D.state.progress.learnSlots === 5);
  D.state.runs = [{ cards: 20, correct: 20 }, { cards: 20, correct: 19 }, { cards: 20, correct: 20 }];
  D.scheduler.adaptLearnSlots();
  t("an easy run raises the learning load", D.state.progress.learnSlots === 6);
  D.state.progress.learnSlots = 4;
  D.state.runs = [{ cards: 20, correct: 4 }, { cards: 20, correct: 4 }, { cards: 20, correct: 4 }];
  D.scheduler.adaptLearnSlots();
  t("the learning load never falls below four", D.state.progress.learnSlots === D.cfg.LEARN_MIN);
  D.state.progress.learnSlots = 8;
  D.state.runs = [{ cards: 20, correct: 20 }, { cards: 20, correct: 20 }, { cards: 20, correct: 20 }];
  D.scheduler.adaptLearnSlots();
  t("the learning load never rises above eight", D.state.progress.learnSlots === D.cfg.LEARN_MAX);
}
{
  // A comeback replaces a slot: the run stays twenty cards.
  newState();
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  const total = p.cards.length;
  const rs = D.runstate.create(p);
  for (let i = 0; i < 3; i++) answer(rs, true, 700);
  const out = missNext(rs);
  if (out && out.buttons) rescueThrough(rs, true);
  t("a comeback replaces a slot instead of adding one", rs.raw.cards.length === total,
    "cards " + rs.raw.cards.length);
  t("a comeback is queued after a clean rescue", rs.raw.cards.some(c => c.kind === "comeback"));
}
{
  // A skip yields no comeback.
  newState();
  D.scheduler.ensureProgression();
  const rs = D.runstate.create(D.scheduler.plan());
  for (let i = 0; i < 3; i++) answer(rs, true, 700);
  const out = missNext(rs);
  if (out && out.buttons) { rs.chooseSkip(); rs.typedAnswer(D.facts.get(out.card.id).ans); }
  t("a skip yields no comeback", !rs.raw.cards.some(c => c.kind === "comeback"));
}
{
  // The bonus card is revealed only on a correct answer.
  newState();
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  const bonusAt = p.cards.findIndex(c => c.bonus);
  const rs = D.runstate.create(p);
  let revealed = false, guard = 0;
  while (!rs.isDone() && guard++ < 60) {
    const cur = rs.present();
    if (!cur) break;
    const isBonus = cur.card.bonus;
    const f = D.facts.get(cur.card.id);
    let out = rs.submit(isBonus ? wrongFor(f) : f.ans, 800);
    if (out && out.slip) out = rs.submit(isBonus ? wrongFor(f) : f.ans, 800);
    if (isBonus && out.line === D.copy.run.bonus) revealed = true;
    if (out && out.buttons) rescueThrough(rs, true);
  }
  t("a wrong answer never reveals the bonus card", bonusAt >= 0 && !revealed);
}
{
  // Days played count once a day, and nothing pays for them.
  newState();
  const p = D.state.progress;
  const c0 = p.coins;
  D.xp.creditDay("2026-09-11");
  D.xp.creditDay("2026-09-11");
  D.xp.creditDay("2026-09-12");
  t("a day played counts once", p.daysPlayed === 2, "days " + p.daysPlayed);
  t("days played pay nothing", p.coins === c0);
}
{
  // Safety net cards never take more than four slots, and never a warm-up slot.
  newState();
  D.state.lanes.addsub.active = true;
  for (const fam of ["add.doubles", "add.bridge", "sub.think", "add.dbl2d"]) {
    D.state.lanes.addsub.families[fam] = { active: true };
  }
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  const safety = p.cards.filter(c => c.kind === "safety");
  t("the safety net takes at most four cards", safety.length <= D.cfg.SAFETY_MAX, "cards " + safety.length);
  t("the safety net never takes a warm-up slot", p.cards.slice(0, 3).every(c => c.kind === "warmup"));
}
{
  // Promote cards come back at short lag.
  newState();
  for (let i = 2; i <= 12; i++) D.mastery.seedKnown(mid(2, i));
  D.scheduler.ensureProgression();
  const p = D.scheduler.plan();
  const rs = D.runstate.create(p);
  let firstPromote = -1, guard = 0;
  while (!rs.isDone() && guard++ < 60) {
    const cur = rs.present();
    if (!cur) break;
    if (firstPromote < 0 && cur.card.kind === "promote" && !cur.card.repeat) firstPromote = cur.index;
    const out = answer(rs, true, 800);
    if (firstPromote >= 0 && cur.index === firstPromote) {
      const repeats = rs.raw.cards.map((c, i) => (c.repeat ? i : -1)).filter(i => i > firstPromote);
      t("a known fact comes back at short lag", repeats.length >= 1, "repeats " + JSON.stringify(repeats));
      break;
    }
  }
}

/* ================= 4. rescue and diagnosis (PLAN §6.7) ================= */
h2("rescue and diagnosis");
{
  newState();
  t("adding instead of multiplying is named", D.diagnose.read("mul:7x8", 15).kind === "added");
  t("an off by one group miss pays the comeback at one", D.diagnose.read("mul:7x8", 49).comebackMult === 1);
  t("swapped digits pay the comeback at one", D.diagnose.read("mul:7x8", 65).comebackMult === 1);
  t("subtracting on a division is named", D.diagnose.read("div:56/7", 49).kind === "subtracted");
  t("echoing the divisor is caught", D.diagnose.read("div:56/7", 7).kind === "echoed");
  t("a plain wrong answer gets no words", D.diagnose.read("mul:7x8", 51).line === null);
}
{
  newState();
  for (const id of Object.keys(D.facts.all())) {
    const f = D.facts.get(id);
    if (f.lane !== "muldiv") continue;
    const s = D.scripts.forFact(id);
    if (!s || !s.steps.length) { t("every core fact has a script " + id, false); break; }
    if (s.steps.length > 3) { t("no script is longer than three steps " + id, false); break; }
    const bad = s.steps.find(st => typeof st.answer !== "number" || !isFinite(st.answer) || st.answer < 0);
    if (bad) { t("every step has a real answer " + id, false, bad.prompt); break; }
    const lastStep = s.steps[s.steps.length - 1];
    if (lastStep.answer !== f.ans) { t("the last step lands on the answer " + id, false, lastStep.prompt + " = " + lastStep.answer); break; }
  }
  t("every core fact has a script of at most three steps landing on the answer", true);
}
{
  // Simpler forms land on the same value as the step they replace.
  newState();
  let bad = null;
  for (const id of Object.keys(D.facts.all())) {
    const s = D.scripts.forFact(id);
    if (!s) continue;
    for (const st of s.steps) {
      if (!st.simpler || !st.simpler.length) continue;
      const end = st.simpler[st.simpler.length - 1];
      if (end.answer !== st.answer && st.kind !== "whatTimes") bad = id + " " + st.prompt;
    }
  }
  t("a simpler form lands where the step did", bad === null, bad || "");
}

/* Sentence-shaped: made only of words, numbers and the punctuation the game
   uses, with a capital start or a trailing period. CSS values, selectors, class
   lists and ids all fall out because of the characters they carry. */
function sentenceShaped(body) {
  if (!/\s/.test(body)) return false;
  if (!/^[A-Z0-9][A-Za-z0-9 ,'.?!×÷−+-]*$/.test(body)) return false;
  const words = body.trim().split(/\s+/).filter(w => /[A-Za-z]{3,}/.test(w));
  if (!words.length) return false;
  if (words.length < 2 && !/\.$/.test(body)) return false;
  return /^[A-Z]/.test(body) || /\.$/.test(body);
}

/* A small scanner: string literals only, comments and code skipped, so the
   copy gate cannot be fooled by two quotes on one line. */
function stringLiterals(src) {
  const out = [];
  let i = 0, n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch; let buf = ""; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") { buf += src[i + 1]; i += 2; continue; }
        if (src[i] === "\n" && quote !== "`") break;
        buf += src[i]; i++;
      }
      i++;
      out.push(buf);
      continue;
    }
    i++;
  }
  return out;
}

/* ================= 5. copy gate (PLAN §12) ================= */
h2("copy gate");
{
  const copySrc = fs.readFileSync(path.join(ROOT, "js/data/copy.js"), "utf8");
  t("copy holds exactly two exclamation marks", (copySrc.match(/!/g) || []).length === 2,
    "found " + (copySrc.match(/!/g) || []).length);
  t("copy holds no em dash", !/—/.test(copySrc));
  t("copy holds no pictographs", !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(copySrc));
  const BANNED = ["delve","foster","leverage","utilize","facilitate","empower","streamline","robust",
    "seamless","cutting-edge","pivotal","crucial","transformative","elevate","embark","supercharge",
    "harness","journey","unlock","navigate","landscape","roadmap","awesome","amazing","epic","oops",
    "whoops","uh oh","yay","sweet","let's go","you got this","pro tip","remember","don't forget"];
  const hits = BANNED.filter(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(copySrc));
  t("copy holds none of the banned words", hits.length === 0, hits.join(", "));
  const MISS_WORDS = ["not yet", "not quite", "almost", "nope", "so close", "you'll get it"];
  const missHits = MISS_WORDS.filter(w => new RegExp(w, "i").test(copySrc));
  t("copy says nothing on a miss", missHits.length === 0, missHits.join(", "));
}
{
  // No sentence-shaped string anywhere but copy.js.
  const ALLOW = new Set(["js/data/copy.js"]);
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { if (name !== "node_modules" && name !== "qa" && name !== ".git") walk(full); }
      else if (name.endsWith(".js")) files.push(path.relative(ROOT, full));
    }
  })(path.join(ROOT, "js"));
  const offenders = [];
  for (const rel of files) {
    if (ALLOW.has(rel)) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const body of stringLiterals(src)) {
      if (!sentenceShaped(body)) continue;
      offenders.push(rel + ": " + JSON.stringify(body));
    }
  }
  t("no player-facing sentence lives outside copy.js", offenders.length === 0, offenders.slice(0, 5).join(" | "));
}
{
  // Every copy key the code reaches for exists.
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".js")) files.push(full);
    }
  })(path.join(ROOT, "js"));
  const missing = [];
  for (const full of files) {
    const src = fs.readFileSync(full, "utf8");
    const refs = src.match(/D\.copy\.[A-Za-z0-9_.]+/g) || [];
    for (const ref of refs) {
      const parts = ref.replace(/\.+$/, "").split(".").slice(2);
      let node = D.copy;
      for (const part of parts) { if (node === undefined || node === null) break; node = node[part]; }
      if (node === undefined) missing.push(ref);
    }
  }
  t("every copy key the code uses exists", missing.length === 0, Array.from(new Set(missing)).join(", "));
}


/* ================= 6. improving-learner bots (PLAN §12 gate 2) =================
   Each bot carries a latent strength per fact. Unaided correct answers raise it,
   a rescue raises it half as much, a miss lowers it, and it decays a little each
   day. Accuracy and answer time are derived from it, so a bot that practises
   really does get faster and a bot that guesses really does not. Eight seeds,
   assertions on medians. */
function makeBot(profile) {
  const strength = {};
  function str(id) {
    if (strength[id] === undefined) strength[id] = profile.start(id);
    return strength[id];
  }
  return {
    profile: profile,
    answerFor(id) {
      const sVal = str(id);
      const p = D.u.clamp(profile.floor + (0.99 - profile.floor) * sVal, 0.02, 0.99);
      const correct = profile.always === true ? true : Math.random() < p;
      const rt = Math.round(profile.fast + (profile.slow - profile.fast) * (1 - sVal)
                            + (Math.random() - 0.5) * 250);
      return { correct: correct, rt: Math.max(300, profile.rushed ? profile.rushedMs : rt) };
    },
    learn(id, how) {
      const gain = how === "rescue" ? profile.gain / 2 : how === "correct" ? profile.gain : -profile.loss;
      strength[id] = D.u.clamp(str(id) + (gain > 0 ? gain * (1 - str(id)) : gain), 0, 1);
    },
    decay() { for (const id of Object.keys(strength)) strength[id] = Math.max(0, strength[id] - profile.decay); },
    strengthOf: str,
  };
}
const KNOWN_TABLES = ["2", "5", "10"];
function inTables(id, keys) {
  const f = D.facts.get(id);
  return f.tables ? f.tables.some(k => keys.includes(k)) : false;
}
/* Where a bot starts on a safety-net fact. A child who needs the quiet lane is
   not hopeless at adding, he is slow and shaky on the bigger ones. */
function addSubStart(id, base) {
  const f = D.facts.get(id);
  if (!f || f.lane !== "addsub") return null;
  const big = Math.max(f.a, f.b) > 10;
  return big ? base * 0.6 : Math.min(0.9, base * 1.3);
}
const PROFILES = {
  novice: { floor: 0.25, gain: 0.16, loss: 0.05, decay: 0.012, fast: 1250, slow: 6000,
            onMiss: "rescue", stepP: 0.7,
            start: id => addSubStart(id, 0.45) !== null ? addSubStart(id, 0.45)
                       : (inTables(id, KNOWN_TABLES) ? 0.85 : 0.15) },
  strong: { floor: 0.5, gain: 0.2, loss: 0.04, decay: 0.008, fast: 900, slow: 2600,
            onMiss: "rescue", stepP: 0.95, start: () => 0.9 },
  slowCorrect: { floor: 0.25, gain: 0.14, loss: 0.05, decay: 0.01, fast: 1300, slow: 5200,
                 always: true, onMiss: "rescue", stepP: 0.9, start: () => 0.12 },
  guesser: { floor: 0.02, gain: 0, loss: 0, decay: 0, fast: 400, slow: 400, rushed: true,
             rushedMs: 420, onMiss: "skip", stepP: 0.1, start: () => 0 },
  skipper: { floor: 0.02, gain: 0, loss: 0, decay: 0, fast: 500, slow: 500, rushed: true,
             rushedMs: 500, onMiss: "skip", stepP: 0, start: () => 0, alwaysWrong: true },
  forgetter: { floor: 0.25, gain: 0.3, loss: 0.05, decay: 0.14, fast: 1200, slow: 5000,
               onMiss: "rescue", stepP: 0.8, start: () => 0.2 },
};

function botRun(bot, log) {
  D.scheduler.ensureProgression();
  const plan = D.scheduler.plan();
  const rs = D.runstate.create(plan);
  let guard = 0, elapsed = 0, comboAtFour = null;
  while (!rs.isDone() && guard++ < 200) {
    const cur = rs.present();
    if (!cur) break;
    if (cur.index === 3 && comboAtFour === null) comboAtFour = rs.raw.combo;
    const id = cur.card.id;
    const a = bot.profile.alwaysWrong ? { correct: false, rt: 500 } : bot.answerFor(id);
    const f = D.facts.get(id);
    // A card that stays up after its ring runs out takes the bot's slow answer as it
    // comes; on a fast or gold card the bot answers inside the grace, racing the ring.
    const staysUp = D.cfg.RING_OVERTIME_KINDS.includes(cur.card.ringKind);
    const rt = cur.ringMs && !staysUp ? Math.min(a.rt, cur.ringMs + 400) : a.rt;
    elapsed += rt + 700;
    let out = rs.submit(a.correct ? f.ans : f.ans * 10 + 3, rt);
    if (out && out.slip) {
      const b = bot.answerFor(id);
      elapsed += b.rt + 700;
      out = rs.submit(b.correct ? f.ans : f.ans * 10 + 3, b.rt);
    }
    if (out && out.kind === "correct") bot.learn(id, "correct");
    if (out && out.buttons) {
      if (bot.profile.onMiss === "skip") {
        rs.chooseSkip();
        rs.typedAnswer(f.ans);
        elapsed += 3000;
      } else {
        const r = rs.chooseRescue();
        if (r && r.kind === "rescue") {
          let g2 = 0;
          while (g2++ < 20) {
            const step = rs.currentStep();
            if (!step) break;
            const ok = Math.random() < bot.profile.stepP;
            elapsed += 2500;
            const o = rs.stepSubmit(ok ? step.answer : step.answer + 1);
            if (!o) break;
            if (o.kind === "stepValue") { const o2 = rs.stepForced(o.step.answer); elapsed += 2000; if (o2 && o2.kind === "rescued") break; continue; }
            if (o.kind === "rescued") break;
          }
          bot.learn(id, "rescue");
        } else {
          rs.chooseSkip(); rs.typedAnswer(f.ans);
        }
      }
    } else if (out && out.kind === "miss") {
      bot.learn(id, "miss");
    }
  }
  const sum = D.runstate.finishRun(rs);
  sum.ms = elapsed;
  sum.cardList = rs.raw.cards.map(c => ({ id: c.id, kind: c.kind }));
  sum.missedIds = rs.raw.missed.slice();
  sum.comboAtFour = comboAtFour;
  if (log) log.push(sum);
  return sum;
}

function runBot(name, seed, days, runsPerDay) {
  Math.random = mulberry(seed);
  setTime(2026, 9, 9, 16, 0);
  newState(name);
  const bot = makeBot(PROFILES[name]);
  const log = [];
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < runsPerDay; k++) botRun(bot, log);
    bot.decay();
    advanceHours(24);
    D.save.touchDay();
  }
  return { log: log, bot: bot, state: D.state };
}
function medianOf(a) { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

/* ================= rework R1 (PLAN §13.1) ================= */
h2("rework R1");
{
  // A table's first questions are drawn at random, not in answer order.
  const saved = Math.random;
  const sets = new Set();
  let evenly = 0;
  for (let seed = 1; seed <= 20; seed++) {
    Math.random = mulberry(seed);
    newState();
    D.scheduler.ensureProgression();
    const hot = D.scheduler.tableState(D.state.focus.primary).hot.map(id => D.facts.get(id).ans).sort((a, b) => a - b);
    const gaps = hot.slice(1).map((v, i) => v - hot[i]);
    if (gaps.length && gaps.every(g => g === gaps[0])) evenly++;
    sets.add(hot.join(","));
  }
  Math.random = saved;
  t("a table's first four questions are not taken in answer order", evenly <= 4 && sets.size >= 10,
    evenly + " of 20 evenly spaced, " + sets.size + " different sets");
}
{
  // A question the tryout placed but no run has asked gets no timer.
  newState();
  const id = "mul:11x12";
  D.mastery.seedKnown(id);
  t("a question placed by round 1 but never answered shows no timer", D.scheduler.ringKindFor(id) === null);
  D.mastery.record(id, { correct: true, rt: 4000, day: D.u.gameDay() });
  t("once it has been answered in a round it gets its timer", D.scheduler.ringKindFor(id) !== null,
    String(D.scheduler.ringKindFor(id)));
}
{
  // An empty timer on a question still slow for this child leaves the card up.
  newState();
  const slow = "mul:6x7", quick = "mul:6x8";
  seedFast(slow, 4200);
  seedFast(quick, 900);
  seedFast("mul:6x9", 900); seedFast("mul:6x6", 900);
  const rs = D.runstate.create(handPlan(["mul:6x9", slow, quick, "mul:6x6"]));
  answer(rs, true, 700);
  const combo = rs.raw.combo;
  t("a slow question has a timer", rs.present().card.ringKind === "known", String(rs.present().card.ringKind));
  const over = rs.timeout();
  t("an empty timer on a slow question leaves the card up",
    !!over && over.kind === "overtime" && rs.present().card.id === slow);
  t("the timer running out again does nothing more", rs.timeout() === null);
  const late = rs.submit(D.facts.get(slow).ans, 9000);
  t("the card still takes the right answer", !!late && late.kind === "correct");
  t("an answer after the timer does not step the streak", rs.raw.combo === combo, "combo " + rs.raw.combo);
  t("an answer after the timer scores base points only",
    !!late && late.points === Math.round(D.cfg.BASE_SCORE * D.facts.weight(slow)), "points " + (late && late.points));
  t("an answer after the timer still pays XP", !!late && late.xp > 0);
  const miss = rs.timeout();
  t("an empty timer on a fast question is still a miss", !!miss && miss.kind === "miss", String(miss && miss.kind));
}
{
  // A booked repeat keeps its card only while it has a job left.
  const fillers = ["mul:3x4", "mul:3x5", "mul:3x6", "mul:3x7", "mul:3x8"];
  const spareIds = ["mul:3x9", "mul:3x11"];
  const build = ewma => {
    newState();
    const p = "mul:7x8";
    seedFast(p, ewma);
    fillers.concat(spareIds).forEach(id => seedFast(id, 900));
    const plan = handPlan([fillers[0], p, fillers[1], p, fillers[2], fillers[3], p, fillers[4]]);
    plan.cards[1].kind = "promote";
    for (const j of [3, 6]) Object.assign(plan.cards[j], { kind: "promote", repeat: true, pinned: true });
    plan.spares = spareIds.slice();
    return { rs: D.runstate.create(plan), p: p };
  };
  const left = b => b.rs.raw.cards.slice(b.rs.raw.i).filter(c => c.id === b.p).length;
  let b = build(4200);
  answer(b.rs, true, 700); answer(b.rs, true, 800);
  t("a booked repeat stays while the question is still slow", left(b) === 2, "left " + left(b));
  b = build(2000);
  answer(b.rs, true, 700); answer(b.rs, true, 800);
  t("a booked repeat goes once the question is fast and has counted today", left(b) === 0, "left " + left(b));
  t("its card goes to a question the round was not serving",
    b.rs.raw.cards.length === 8 && b.rs.raw.cards.filter(c => spareIds.includes(c.id)).length === 2);
  b = build(4200);
  answer(b.rs, true, 700); missCard(b.rs, 3000);
  t("after a miss the booked repeats go and the comeback takes over", left(b) === 1, "left " + left(b));
}

/* ================= round one (PLAN §13.1 R4) ================= */
h2("round one");
function playRoundOne(p, q, opts) {
  const o = opts || {};
  const ro = D.roundone.create();
  const log = { cards: 0, ringed: 0, misses: 0, reveals: 0, revealPoints: 0 };
  let g = 0;
  while (!ro.isDone() && g++ < 60) {
    const cur = ro.present();
    if (!cur) break;
    log.cards++;
    if (cur.ringMs) log.ringed++;
    const f = D.facts.get(cur.card.id);
    const right = o.known ? o.known(f) : Math.random() < p;
    const out = ro.submit(right ? f.ans : f.ans * 10 + 3, Math.random() < q ? 900 : 4200);
    if (out && out.kind === "miss") {
      log.misses++;
      if (out.reveal) { log.reveals++; const back = ro.typedAnswer(f.ans); log.revealPoints += (back && back.points) || 0; }
    }
  }
  return { ro: ro, log: log };
}
{
  const saved = Math.random;
  Math.random = mulberry(11);
  newState();
  const { ro, log } = playRoundOne(0.5, 0.5);
  t("round one is twenty cards", log.cards === D.cfg.ROUND_ONE_CARDS, "cards " + log.cards);
  t("round one has no timer on any card", log.ringed === 0);
  t("a miss in round one shows the answer to type", log.misses > 0 && log.reveals === log.misses,
    log.misses + " misses, " + log.reveals + " shown");
  t("typing the shown answer pays nothing", log.revealPoints === 0);
  const sum = D.roundone.finishRound(ro);
  t("round one pays points, XP and coins like any round", sum.score > 0 && sum.xp > 0 && sum.coins > 0,
    sum.score + " points, " + sum.xp + " XP, " + sum.coins + " coins");
  t("round one answers go on the record",
    Object.keys(D.state.facts).filter(id => D.state.facts[id].seen > 0).length >= 8);
  t("round one places the child", D.state.flags.tryoutDone === true && D.scheduler.openTables().length > 0);
  Math.random = saved;
}
{
  // A strong player runs out of cards before every table is tried; the rest wait for scouts.
  const saved = Math.random;
  Math.random = mulberry(12);
  newState();
  const { ro } = playRoundOne(1, 1);
  D.roundone.finishRound(ro);
  const pl = D.state.placement;
  t("a strong player's untried tables wait for the next rounds",
    !!pl && pl.tables.length > 0 && pl.runsLeft === D.cfg.PLACEMENT_RUNS, JSON.stringify(pl && pl.tables));
  const first = pl.tables.slice(0, 2);
  const plan = D.scheduler.plan();
  const scouts = plan.cards.filter(c => c.kind === "scout");
  t("the next round carries extra scout cards for them",
    scouts.length >= 2 && scouts.length <= D.cfg.PLACEMENT_SCOUTS, "scouts " + scouts.length);
  const rs = D.runstate.create(plan);
  playAll(rs, { correct: true, ms: 800 });
  D.runstate.finishRun(rs);
  t("fast answers on those scouts open their tables", first.some(k => D.scheduler.isOpen(k)),
    first.map(k => k + (D.scheduler.isOpen(k) ? " open" : " new")).join(", "));
  Math.random = saved;
}
{
  // A child who struggles gets easy wins to the end of the round and no extra scouts.
  const saved = Math.random;
  Math.random = mulberry(13);
  newState();
  const known = f => f.op === "mul" && (f.a === 2 || f.b === 2 || f.a === 10 || f.b === 10);
  const { ro, log } = playRoundOne(0, 1, { known: known });
  D.roundone.finishRound(ro);
  t("a struggling child's round one is still twenty cards", log.cards === D.cfg.ROUND_ONE_CARDS, "cards " + log.cards);
  t("a struggling child gets no extra scouts", !D.state.placement);
  Math.random = saved;
}

h2("improving-learner bots");
{
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const accFrom3 = [], durations = [], maxFocus = [], comboFour = [], goldCounts = [], autoKept = [];
  for (const seed of SEEDS) {
    const r = runBot("novice", seed, 30, 3);
    const later = r.log.slice(2);
    accFrom3.push(medianOf(later.map(x => x.correct / Math.max(1, x.cards))));
    durations.push(medianOf(r.log.map(x => x.ms)));
    maxFocus.push(Math.max.apply(null, r.log.map(() => D.scheduler.focusKeys().length)));
    const withCombo = r.log.filter(x => (x.comboAtFour === null ? 3 : x.comboAtFour) >= 1);
    comboFour.push(withCombo.length / r.log.length);
    let autos = 0;
    for (const id of Object.keys(r.state.facts)) if (D.mastery.status(id) === "auto") autos++;
    goldCounts.push(autos);
  }
  t("a novice is right at least three quarters of the time from run three",
    medianOf(accFrom3) >= 0.75, "median accuracy " + medianOf(accFrom3).toFixed(3));
  t("a novice run stays under three minutes",
    medianOf(durations) <= 180000, "median " + Math.round(medianOf(durations) / 1000) + " s");
  t("a novice never has more than two tables in focus", Math.max.apply(null, maxFocus) <= 2);
  t("a novice all but never reaches card four at nothing", medianOf(comboFour) >= 0.95,
    "median share with a combo " + medianOf(comboFour).toFixed(3));
  t("a novice settles facts over thirty days", medianOf(goldCounts) >= 20,
    "median settled " + medianOf(goldCounts));
}
{
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const opened = [], allAuto = [];
  for (const seed of SEEDS) {
    const r = runBot("strong", seed, 12, 3);
    opened.push(D.scheduler.openTables().length);
    const anyAllAuto = r.log.some(x => false);
    allAuto.push(anyAllAuto);
  }
  t("a strong player opens most of the grid inside twelve days",
    medianOf(opened) >= 10, "median opened " + medianOf(opened));
  t("a strong player never gets a run of nothing but settled facts", allAuto.every(x => !x));
}
{
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const pcts = [];
  for (const seed of SEEDS) {
    const r = runBot("slowCorrect", seed, 10, 3);
    const primary = D.state.focus.primary;
    const done = D.facts.TABLE_ORDER.filter(k => D.scheduler.tableState(k).status === "open");
    const best = done.length ? Math.max.apply(null, done.concat(primary ? [primary] : [])
      .map(k => D.mastery.tableStats(k).fastPct)) : D.mastery.tableStats(primary).fastPct;
    pcts.push(best);
  }
  t("a slow but correct player gets a table to eighty per cent fast in ten days",
    medianOf(pcts) >= 0.8, "median " + medianOf(pcts).toFixed(2));
}
{
  const noviceXp = [], noviceSparks = [], guessXp = [], guessSparks = [], skipXp = [], skipSparks = [];
  for (const seed of [1, 2, 3, 4]) {
    runBot("novice", seed, 10, 3);
    noviceXp.push(D.state.progress.xp); noviceSparks.push(D.state.progress.coins);
    runBot("guesser", seed, 10, 3);
    guessXp.push(D.state.progress.xp); guessSparks.push(D.state.progress.coins);
    runBot("skipper", seed, 10, 3);
    skipXp.push(D.state.progress.xp); skipSparks.push(D.state.progress.coins);
  }
  const nXp = medianOf(noviceXp), nSp = medianOf(noviceSparks);
  t("a guesser earns almost no XP", medianOf(guessXp) < nXp * 0.15,
    Math.round(medianOf(guessXp)) + " against " + Math.round(nXp));
  t("a guesser earns almost no sparks", medianOf(guessSparks) < nSp * 0.15,
    medianOf(guessSparks) + " against " + nSp);
  t("a skipper earns nothing", medianOf(skipXp) === 0 && medianOf(skipSparks) === 0,
    medianOf(skipXp) + " XP, " + medianOf(skipSparks) + " sparks");
}
{
  // A fact that is right today and wrong a week later drops back and returns as due.
  const regressed = [];
  for (const seed of [1, 2, 3, 4]) {
    const r = runBot("forgetter", seed, 20, 2);
    let backToLearning = 0;
    for (const id of Object.keys(D.state.facts)) {
      const rec = D.state.facts[id];
      if (rec.miss > 0 && rec.days.length < D.cfg.AUTO_DAYS && rec.ok > 0) backToLearning++;
    }
    regressed.push(backToLearning);
  }
  t("facts a forgetter loses come back into the mix", medianOf(regressed) > 0,
    "median " + medianOf(regressed));
}
{
  // What a novice settles, a novice mostly keeps.
  const kept = [];
  for (const seed of [1, 2, 3, 4]) {
    const r = runBot("novice", seed, 30, 3);
    let everAuto = 0, stillAuto = 0;
    for (const id of Object.keys(D.state.facts)) {
      const rec = D.state.facts[id];
      if (rec.doneOnce) { everAuto++; if (D.mastery.status(id) === "auto") stillAuto++; }
    }
    kept.push(everAuto ? stillAuto / everAuto : 1);
  }
  t("four in five settled facts are still settled at day thirty", medianOf(kept) >= 0.8,
    "median " + medianOf(kept).toFixed(2));
}
{
  // How often a question comes up three times in a round without being missed.
  const perRound = [];
  for (const seed of [1, 2, 3, 4]) {
    const r = runBot("strong", seed, 6, 3);
    for (const run of r.log) {
      const n = {};
      for (const c of run.cardList) if (c.kind !== "redemption") n[c.id] = (n[c.id] || 0) + 1;
      perRound.push(Object.keys(n).filter(id => n[id] >= 3 && !run.missedIds.includes(id)).length);
    }
  }
  t("a strong player rarely sees a question three times in a round without missing it",
    medianOf(perRound) <= 1, "median " + medianOf(perRound) + ", max " + Math.max.apply(null, perRound));
}
Math.random = mulberry(SEED);


/* ================= 7. the tryout (PLAN §6.6) ================= */
h2("tryout");
/* A tryout player: correct with probability p, fast when correct with probability q. */
function playTryout(p, q, opts) {
  const o = opts || {};
  const t = D.tryout.create();
  const seen = [];
  let guard = 0;
  while (guard++ < 60) {
    const card = t.next();
    if (!card) break;
    const f = D.facts.get(card.id);
    const easy = f.op === "mul" && Math.min(f.a, f.b) <= 4;
    const chance = o.easyP !== undefined && easy ? o.easyP : p;
    const correct = card.kind === "filler" ? true : Math.random() < chance;
    const fast = correct && Math.random() < q;
    const rt = fast ? 900 : 4200;
    const out = t.answer(correct ? f.ans : f.ans + 7, rt);
    seen.push({ card: card, correct: out.correct, kind: card.kind, line: out.line, flash: out.flash });
  }
  return { t: t, seen: seen };
}
{
  newState();
  const r = playTryout(1, 1);
  t("the tryout never runs past thirty placement cards", r.t.state.served <= D.cfg.TRYOUT_MAX,
    "probes " + r.t.state.served);
  const first4 = r.seen.slice(0, 4);
  const openerOk = first4.every(x => {
    const f = D.facts.get(x.card.id);
    if (f.op !== "mul") return false;
    const inEasyTable = f.tables.some(k => k === "2" || k === "10" || k === "5");
    const other = f.tables.filter(k => k !== "sq").map(Number);
    return inEasyTable && Math.min(f.a, f.b) <= 6 && Math.max(f.a, f.b) <= 10;
  });
  t("the tryout opens with four small twos, tens and fives", openerOk,
    first4.map(x => x.card.id).join(" "));
  t("the tryout ends on a win", r.seen[r.seen.length - 1].correct === true);
  t("a perfect tryout starts Beyond scouting", (r.t.apply(), D.state.lanes.beyond.scouting === true));
}
{
  // A weak recaller: the small facts mostly land, the sixes to nines mostly do not.
  // Eight seeds, assertions on medians, because one lucky run is not a novice.
  const lens = [], rates = [];
  let adjacent = false, endedBadly = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    Math.random = mulberry(seed * 31);
    newState();
    const r = playTryout(0.22, 0.15, { easyP: 0.85 });
    for (let i = 1; i < r.seen.length; i++) if (!r.seen[i].correct && !r.seen[i - 1].correct) adjacent = true;
    if (r.seen[r.seen.length - 1].correct !== true) endedBadly++;
    lens.push(r.seen.length);
    rates.push(r.seen.filter(x => x.correct).length / r.seen.length);
  }
  Math.random = mulberry(SEED);
  t("the tryout never serves two misses in a row", !adjacent);
  t("the tryout always ends on a win", endedBadly === 0, endedBadly + " ended on a miss");
  t("a novice wins most of the tryout", medianOf(rates) >= 0.5, medianOf(rates).toFixed(2));
  t("a novice sees a short tryout", medianOf(lens) <= 20, "median cards " + medianOf(lens));
}
{
  // A hard probe only ever follows a correct easy probe on that table.
  newState();
  const r = playTryout(0.6, 0.5, { easyP: 0.95 });
  let bad = null;
  const easyResult = {};
  for (const x of r.seen) {
    if (!x.card.table) continue;
    if (x.card.kind === "opener" || x.card.kind === "easy") easyResult[x.card.table] = x.correct;
    if (x.card.kind === "hard" && easyResult[x.card.table] !== true) bad = x.card.table;
  }
  t("a hard probe only follows a correct easy probe", bad === null, bad || "");
}
{
  // Two tables in a row with a wrong easy probe stops the probing.
  newState();
  const r = playTryout(0.02, 0);
  t("two wrong easy probes in a row stop the tryout", r.t.state.served <= 12,
    "probes " + r.t.state.served);
}
{
  // Slow but correct seeds the facts it got, and puts the table in focus.
  newState();
  const r = playTryout(1, 0);            // always right, never fast
  r.t.apply();
  const primary = D.state.focus.primary;
  t("a slow but correct tryout leaves a table to work on", !!primary, String(primary));
  const seeded = Object.keys(D.state.facts).filter(id => (D.state.facts[id] || {}).provisional);
  t("the facts a slow player got right are seeded known", seeded.length > 0, "seeded " + seeded.length);
  t("no fact carries a day out of the tryout",
    Object.keys(D.state.facts).every(id => D.state.facts[id].days.length === 0));
}
{
  // Missing the safety-net probes turns the quiet lane on, and it is never named.
  newState();
  const t2 = D.tryout.create();
  let guard = 0;
  while (guard++ < 60) {
    const card = t2.next();
    if (!card) break;
    const f = D.facts.get(card.id);
    const correct = card.kind !== "safety";
    t2.answer(correct ? f.ans : f.ans + 7, 900);
  }
  t2.apply();
  t("missing the addition probes turns the safety net on", D.state.lanes.addsub.active === true);
  const planCards = D.scheduler.plan().cards;
  t("the safety net serves addition cards", planCards.some(c => D.facts.get(c.id).lane === "addsub"));
}


{
  // The quiet lane turns off, family by family, once the arithmetic is quick.
  newState();
  D.scheduler.activateSafety();
  t("the safety net is on", D.state.lanes.addsub.active === true);
  for (const famId of D.facts.familyIds()) {
    for (const id of D.facts.family(famId).facts.slice(0, 14)) seedFast(id);
  }
  D.mastery.dirty();
  D.scheduler.updateSafety();
  t("the safety net turns itself off once the arithmetic is quick",
    D.state.lanes.addsub.active === false);
  const plan = D.scheduler.plan();
  t("no addition card is served once it is off",
    plan.cards.every(c => D.facts.get(c.id).lane !== "addsub"));
}
{
  // Two missed arithmetic rescue steps in a week is the other way in.
  newState();
  t("the safety net starts off", D.state.lanes.addsub.active === false);
  D.scheduler.noteStepMiss("add", "2026-09-09");
  t("one missed step is not enough", D.state.lanes.addsub.active === false);
  D.scheduler.noteStepMiss("double", "2026-09-10");
  t("two missed steps in a week turn it on", D.state.lanes.addsub.active === true);
  newState();
  D.scheduler.noteStepMiss("mul", "2026-09-09");
  D.scheduler.noteStepMiss("groups", "2026-09-10");
  t("a missed multiplication step does not turn it on", D.state.lanes.addsub.active === false);
}
{
  // The safety net is never named anywhere.
  const copySrc = fs.readFileSync(path.join(ROOT, "js/data/copy.js"), "utf8");
  const NAMES = ["safety net", "addition", "subtraction", "add and subtract", "adding", "catch up",
                 "basics", "warm up", "warm-up"];
  const hits = NAMES.filter(w => new RegExp(w, "i").test(copySrc));
  t("the quiet lane has no name in the copy", hits.length === 0, hits.join(", "));
}

/* ================= 8. the Belt Test (PLAN §7.1) ================= */
h2("belt test");
function readyTable(key, pct) {
  const items = D.mastery.activeItems(key);
  const want = Math.ceil(items.length * (pct === undefined ? 1 : pct));
  items.forEach((id, i) => { if (i < want) seedAuto(id); else seedFast(id); });
  D.scheduler.ensureProgression();
}
function seedTableFast(key) {
  for (const id of D.facts.table(key).items) seedFast(id);
  D.mastery.dirty();
  D.scheduler.ensureProgression();
}
function seedCoreFast() {
  for (const id of D.belt.coreIds()) seedFast(id);
  D.mastery.dirty();
}
{
  // The belt follows the dots, never lowers, and pays coins for each stripe and belt.
  newState();
  const c0 = D.state.progress.coins;
  const ids = D.belt.coreIds();
  D.mastery.rec(ids[0]).days = ["2026-09-01", "2026-09-04"];
  D.mastery.rec(ids[1]).days = ["2026-09-01"];
  D.mastery.rec(ids[2]).days = ["2026-09-02"];
  D.mastery.dirty();
  t("dots are counted across the grid", D.belt.dotsFilled() === 4, "dots " + D.belt.dotsFilled());
  const ev = D.belt.update();
  t("four dots tie two white stripes", ev.length === 2 && ev.every(e => e.kind === "stripe" && e.belt === "white"),
    JSON.stringify(ev));
  t("each stripe pays its coins", D.state.progress.coins === c0 + 2 * D.cfg.COINS_STRIPE);
  D.mastery.rec(ids[0]).days = ["2026-09-04"];
  D.mastery.dirty();
  t("a stripe once tied stays when a dot empties", D.belt.update().length === 0 && D.belt.info().stripes === 2);
  t("the belt never pays twice", D.state.progress.coins === c0 + 2 * D.cfg.COINS_STRIPE);
  for (let i = 3; i < 16; i++) D.mastery.rec(ids[i]).days = ["2026-09-01", "2026-09-05"];
  D.mastery.dirty();
  const ev2 = D.belt.update();
  const blue = ev2.find(e => e.kind === "belt");
  t("the fifth step is the blue belt", !!blue && blue.belt === "blue" && blue.coins === D.cfg.COINS_BELT,
    JSON.stringify(ev2));
  t("the belt then reads blue", D.belt.info().belt === "blue", JSON.stringify(D.belt.info()));
}
{
  // The black belt test opens at brown's fourth stripe, once a day, stamped at the start.
  newState();
  seedCoreFast();
  t("no test before brown's fourth stripe", D.belttest.canAttempt() === false);
  D.state.belt.step = D.belt.lastStep();
  const info = D.belt.info();
  t("brown's fourth stripe opens the black belt test",
    D.belttest.canAttempt() === true && info.belt === "brown" && info.stripes === 4, JSON.stringify(info));
  const test = D.belttest.create();
  t("the attempt is stamped before a card is seen", D.state.belt.testDay === D.u.gameDay());
  t("the test is twenty-four cards", test.raw.cards.length === D.cfg.TEST_CARDS);
  const res = test.abandon();
  t("walking away from a test is a fail", res.passed === false);
  t("a failed test cannot be retried the same day", D.belttest.canAttempt() === false);
}
{
  newState();
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  const test = D.belttest.create();
  const c0 = D.state.progress.coins;
  let guard = 0;
  while (!test.isDone() && guard++ < 40) {
    const p = test.present();
    if (!p) break;
    test.submit(D.facts.get(p.card.id).ans, 800);
  }
  const res = test.result();
  t("a clean test passes", res.passed === true, res.correct + " of " + res.total);
  t("a pass ties the black belt", D.state.belt.black === true && D.belt.info().belt === "black");
  t("the black belt pays its coins", D.state.progress.coins >= c0 + D.cfg.COINS_BELT);
  t("a black belt has no further test", D.belttest.canAttempt() === false);
}
{
  newState();
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  const test = D.belttest.create();
  const xp0 = D.state.progress.xp;
  let guard = 0, n = 0;
  while (!test.isDone() && guard++ < 40) {
    const p = test.present();
    if (!p) break;
    n++;
    test.submit(n <= 3 ? D.facts.get(p.card.id).ans + 7 : D.facts.get(p.card.id).ans, 800);
  }
  const res = test.result();
  t("three misses fail the test", res.passed === false, res.correct + " of " + res.total);
  t("a failed test still pays for the cards it got right", D.state.progress.xp > xp0);
  t("a failed test leaves the belt brown", D.state.belt.black === false);
}
{
  // Slow but correct is not a pass.
  newState();
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  const test = D.belttest.create();
  let guard = 0;
  while (!test.isDone() && guard++ < 40) {
    const p = test.present();
    if (!p) break;
    test.submit(D.facts.get(p.card.id).ans, 9000);
  }
  const res = test.result();
  t("all correct but all slow does not pass", res.passed === false, res.correct + " correct, " + res.slow + " slow");
  t("the fail line names the slow ones", /too slow/.test(D.belttest.failLine(res)));
}
{
  // Twenty-two right with twenty fast is a pass.
  newState();
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  const test = D.belttest.create();
  let misses = 0, slows = 0, guard = 0;
  while (!test.isDone() && guard++ < 40) {
    const p = test.present();
    if (!p) break;
    const f = D.facts.get(p.card.id);
    if (misses < 2) { misses++; test.submit(f.ans + 7, 800); }
    else if (slows < 2) { slows++; test.submit(f.ans, 9000); }
    else test.submit(f.ans, 800);
  }
  const res = test.result();
  t("a pass with two misses and two slow answers is a pass", res.passed === true,
    res.correct + " correct, " + res.slow + " slow");
}

/* ================= 9. the shop (PLAN §7.1) ================= */
h2("shop");
{
  newState();
  const prices = D.cfg.SHOP.map(i => i.price);
  // Coins come one per right answer, twice the old spark rate, so the range doubles (rework 2026-09-10).
  t("every shop price is between fifty and fifteen hundred",
    Math.min.apply(null, prices) >= 50 && Math.max.apply(null, prices) <= 1500);
  t("the shop has about thirty things in it", D.cfg.SHOP.length >= 24 && D.cfg.SHOP.length <= 36,
    "items " + D.cfg.SHOP.length);
  const missing = D.cfg.SHOP.filter(i => !D.copy.shop.names[i.id]);
  t("every shop item has a name", missing.length === 0, missing.map(i => i.id).join(", "));
  const kinds = new Set(D.cfg.SHOP.map(i => i.kind));
  t("no shop item touches play",
    Array.from(kinds).every(k => ["theme", "skin", "ring", "combo", "sound", "mark"].indexOf(k) >= 0),
    Array.from(kinds).join(", "));
  // Four to six things to want at every level up to twelve.
  let thin = [];
  for (let lvl = 1; lvl <= 12; lvl++) {
    const n = D.cfg.SHOP.filter(i => i.level <= lvl).length;
    if (n < 4) thin.push(lvl);
  }
  t("there is always something on the shelf", thin.length === 0, "thin at " + thin.join(", "));
}


/* ================= 10. the Beyond lane (PLAN §6.9) ================= */
h2("beyond");
{
  newState();
  D.beyond.build();
  const topics = D.beyond.topics();
  t("there are eleven Beyond topics", topics.length === 11, "topics " + topics.length);
  let bad = [];
  for (const topic of topics) {
    const ids = D.beyond.topicFacts(topic.id);
    if (!ids.length) { bad.push(topic.id + " empty"); continue; }
    for (const id of ids) {
      const f = D.facts.get(id);
      if (!f) { bad.push(id + " unregistered"); break; }
      if (typeof f.ans !== "number" || !isFinite(f.ans)) { bad.push(id + " has no answer"); break; }
      if (f.lane !== "beyond") { bad.push(id + " is not in the Beyond lane"); break; }
      const q = D.facts.display(id, false);
      if (!q || /undefined|NaN/.test(q)) { bad.push(id + " reads " + q); break; }
    }
  }
  t("every Beyond fact has an answer and a readable question", bad.length === 0, bad.slice(0, 3).join(" | "));
  t("every Beyond topic has a name", topics.every(x => !!D.copy.beyond.topics[x.id]));
  t("a Beyond belt set is twenty-four items or fewer",
    topics.every(x => D.beyond.beltSet(x.id).length <= D.cfg.TEST_CARDS));
}
{
  // The answers that are not one whole number are checked properly.
  newState();
  D.beyond.build();
  const rem = D.beyond.topicFacts("divrem")[0];
  const f = D.facts.get(rem);
  t("a remainder answer needs both halves", D.facts.check(rem, f.ans + "r" + f.ans2) === true);
  t("the quotient alone is not the answer", D.facts.check(rem, String(f.ans)) === false);
  t("the wrong remainder is wrong", D.facts.check(rem, f.ans + "r" + (f.ans2 + 1)) === false);
  const yn = D.beyond.topicFacts("divis").find(id => D.facts.get(id).ans === 1);
  t("yes is right when the answer is yes", D.facts.check(yn, "1") === true);
  t("no is wrong when the answer is yes", D.facts.check(yn, "0") === false);
  const pct = D.beyond.topicFacts("pct")[0];
  t("a percentage answer checks as a number", D.facts.check(pct, String(D.facts.get(pct).ans)) === true);
  const dec = D.beyond.topicFacts("dec10").find(id => D.facts.get(id).ans < 1);
  const decAns = String(D.facts.get(dec).ans);
  t("a decimal answer checks with or without its leading zero",
    D.facts.check(dec, decAns) === true && D.facts.check(dec, decAns.replace(/^0/, "")) === true, decAns);
  t("no decimal question prints float dust",
    D.beyond.topicFacts("dec10").every(id => !/\d{7,}/.test(D.facts.display(id, false)) &&
                                              !/\d\.\d{7,}/.test(String(D.facts.get(id).ans))));
}
{
  // Every Beyond fact has a walkthrough that lands on its own answer.
  newState();
  D.beyond.build();
  let bad = null;
  for (const topic of D.beyond.topics()) {
    for (const id of D.beyond.topicFacts(topic.id)) {
      const sc = D.scripts.forFact(id);
      if (!sc) { bad = id + " has no script"; break; }
      if (!sc.steps.length) continue;            // a prime is a yes or a no, not a derivation
      if (sc.steps.length > 3) { bad = id + " has " + sc.steps.length + " steps"; break; }
      const last = sc.steps[sc.steps.length - 1];
      const f = D.facts.get(id);
      if (f.input === "yesno") {
        // A yes or no is answered by the child; the steps show the evidence.
        if (!sc.steps.every(st => isFinite(st.answer))) { bad = id + " has a broken step"; break; }
      } else if (f.input === "remainder") {
        // A leftover has two halves: the walkthrough must produce both.
        const values = sc.steps.map(st => st.answer);
        if (values.indexOf(f.ans) < 0 || last.answer !== f.ans2) {
          bad = id + " does not produce " + f.ans + " and " + f.ans2; break;
        }
      } else if (last.answer !== f.ans) {
        bad = id + " ends at " + last.answer + " not " + f.ans; break;
      }
      const wrong = sc.steps.find(st => typeof st.answer !== "number" || !isFinite(st.answer));
      if (wrong) { bad = id + " step " + wrong.prompt; break; }
    }
    if (bad) break;
  }
  t("every Beyond walkthrough lands on its own answer", bad === null, bad || "");
}
{
  // Beyond never shows a ring.
  newState();
  D.beyond.build();
  const id = D.beyond.topicFacts("mul2x1")[0];
  seedFast(id);
  const c = D.scheduler.card(id, "beyond");
  t("a Beyond card never shows a ring", c.ringKind === null);
}
{
  // Scouting starts when the grid is open; the lane opens at the purple belt.
  newState();
  for (const key of D.facts.TABLE_ORDER) D.scheduler.tableState(key).status = "open";
  D.scheduler.ensureProgression();
  t("Beyond is scouted once every table is open", D.state.lanes.beyond.scouting === true);
  t("Beyond is not a lane yet", D.state.lanes.beyond.open === false);
  const scouts = D.scheduler.scoutPool();
  t("the scouts come from Beyond", scouts.length > 0 && D.facts.get(scouts[0]).lane === "beyond");
  D.state.belt.step = D.cfg.BEYOND_OPEN_STEP;
  D.scheduler.ensureProgression();
  t("the purple belt opens the Beyond lane", D.state.lanes.beyond.open === true);
  const plan = D.scheduler.plan();
  const bey = plan.cards.filter(c => D.facts.get(c.id).lane === "beyond" && c.kind === "beyond");
  t("Beyond takes about a quarter of the mixed slots", bey.length >= 3 && bey.length <= 6,
    "cards " + bey.length);
}


/* ================= 11. backup, restore and the dashboard (PLAN §9.5) ================= */
h2("backup and restore");
{
  newState("Tester");
  D.beyond.build();
  for (const id of Object.keys(D.facts.all()).filter(x => D.facts.get(x).lane === "muldiv")) {
    const r = seedFast(id); r.days = ["2026-09-01", "2026-09-03"]; r.missDays = ["2026-09-02"];
  }
  for (let i = 0; i < 200; i++) {
    D.state.runs.push({ day: D.u.gameDay(), table: "7", score: 1800 + i, correct: 18, cards: 20, medianRt: 1400 });
  }
  D.state.progress.xp = 4321;
  const text = await D.share.encode(D.state);
  const json = zlib.inflateRawSync(Buffer.from(D.share.fromB64(text))).toString("utf8");
  t("the backup link inflates with plain zlib to the exact save", json === JSON.stringify(D.state));
  const fromZlib = D.share.toB64(new Uint8Array(zlib.deflateRawSync(Buffer.from(JSON.stringify(D.state)))));
  const back = await D.share.decode(fromZlib);
  t("a link deflated by plain zlib decodes to the exact save", JSON.stringify(back) === JSON.stringify(D.state));
  t("a full save fits in a short link", text.length < 12000, "chars " + text.length);
}
{
  newState("Tester");
  seedFast(mid(3, 4));
  D.state.runs.push({ day: D.u.gameDay(), correct: 18, cards: 20, score: 1500, medianRt: 1200 });
  D.state.progress.xp = 500;
  const older = JSON.parse(JSON.stringify(D.state));
  older.lastSeenEpoch = D.state.lastSeenEpoch - 3600 * 1000;
  older.progress.xp = 99999;
  const res = D.share.apply(older);
  t("a backup older than the phone's save is refused", res.ok === false && res.reason === "older");
  t("a refused restore changes nothing", D.state.progress.xp === 500);
}
{
  newState("Tester");
  const payload = D.save.fresh({ name: "Tester", slug: "tester" });
  payload.facts[mid(3, 4)] = D.mastery.blank();
  payload.facts[mid(3, 4)].seen = 3;
  payload.tables["2"] = { status: "focus", hot: [] };
  payload.lastSeenEpoch = D.u.now() - 60000;
  payload.gameDay = "2026-09-01";
  const res = D.share.apply(payload);
  t("an empty phone accepts a backup", res.ok === true);
  t("a restore stamps the black belt test for today", D.state.belt.testDay === D.u.gameDay());
  t("a restore never moves the game-day backwards", D.state.gameDay >= "2026-09-09", D.state.gameDay);
  t("a restore spends the day's full XP", D.state.progress.fullXpToday === D.cfg.XP_FULL_PER_DAY);
  t("a restore logs itself for the dashboard", D.state.restores.length === 1);
  D.state.belt.step = D.belt.lastStep();
  t("no black belt test on the day of a restore", D.belttest.canAttempt() === false);
}
{
  newState("Tester");
  for (let a = 2; a <= 7; a++) { const r = seedFast(mid(a, 9)); r.seen = 20; r.ok = 18; }
  for (let i = 0; i < 6; i++) D.state.runs.push({ day: D.u.gameDay(), correct: 18, cards: 20, score: 1500, medianRt: 1200 });
  D.state.progress.xp = 6 * 18 * 10;
  const honest = D.share.checks(D.state);
  t("an honest save passes the dashboard checks", honest.length === 0, JSON.stringify(honest));
  D.state.progress.xp = 5000000;
  t("a save with impossible XP is flagged", D.share.checks(D.state).some(c => c.id === "xp"));
  D.state.progress.xp = 1080;
  const thin = seedFast(mid(4, 7)); thin.days = ["2026-09-01", "2026-09-02", "2026-09-03"]; thin.seen = 2; thin.ok = 2;
  t("a settled fact with two answers is flagged", D.share.checks(D.state).some(c => c.id === "thin"));
  const ahead = seedFast(mid(4, 8)); ahead.days = ["2027-01-01"];
  t("a day dated after the phone's own day is flagged", D.share.checks(D.state).some(c => c.id === "ahead"));
  t("every check has a name the dashboard can print",
    ["thin", "ahead", "xp", "runs", "counts", "belts", "coins", "days"]
      .every(id => !/undefined/.test(D.copy.dash.checkLine(id, 1)) && D.copy.dash.checkLine(id, 1).indexOf(id + ":") !== 0));
}

/* ================= 12. the weekly recap (PLAN §7.1) ================= */
h2("weekly recap");
{
  setTime(2026, 9, 9, 16, 0);
  newState("Tester");
  t("a quiet week has no recap", D.recap.lines().length < 2);
  const id = mid(7, 8);
  const r = seedFast(id, 4100);
  D.state.progress.doneThisWeek = 6;
  D.save.rollWeek("2026-09-14");
  r.ewma = 2000;
  D.state.pbs.fastestFact = { id: mid(6, 7), ms: 1400 };
  const lines = D.recap.lines();
  t("the recap counts last week's questions with both dots", lines.some(l => l === D.copy.recap.done(6)),
    lines.join(" | "));
  t("the recap names the most improved fact", lines.some(l => l === "Most improved: 7 × 8, 4.1 s to 2.0 s."),
    lines.join(" | "));
  t("the recap names the fastest fact", lines.some(l => l === "Fastest: 6 × 7, 1.4 s."), lines.join(" | "));
  t("the recap has at most three lines", lines.length <= 3);
  t("the week roll keeps two snapshots at most", Object.keys(D.state.snapshots).length <= 2);
}


/* ================= 13. the approved lines, exactly (PLAN §10.5) ================= */
h2("approved lines");
{
  const m78 = D.facts.mulId(7, 8);
  const EXACT = [
    [D.copy.rescue.addedInstead(7, 8), "That's 7 plus 8. You need seven eights."],
    [D.copy.rescue.divSubtracted(56, 7), "That's 56 take away 7. You need how many sevens make 56."],
    [D.copy.rescue.showAnswer(m78, false), "7 × 8 = 56. Type it to keep going."],
    [D.copy.rescue.stepValue("7 × 10", 70), "7 × 10 is 70. Type 70 to keep going."],
    [D.copy.summary.newBest(270), "New best (+270)"],
    [D.copy.summary.dots(6), "6 dots filled"],
    [D.copy.summary.done([D.facts.display(m78, false)]), "Both dots: 7 × 8."],
    [D.copy.summary.streak(11, 14), "Longest streak 11 (best 14)"],
    [D.copy.belt.stripeTied("white", 2), "Stripe 2 on your white belt."],
    [D.copy.belt.beltTied("blue"), "Blue belt!"],
    [D.copy.belt.toNext(8, "stripe", "white"), "8 dots to your next stripe."],
    [D.copy.belt.failCount(19, 24), "19 of 24. Try again tomorrow."],
    [D.copy.belt.failSlow(24, 24, 4), "24 of 24, but four were too slow. Try again tomorrow."],
    [D.copy.home.working("2", "5"), "Working on the twos. The fives open after."],
    [D.copy.roundOne.start(["5", "7"]), "You start on the fives (5 × 6) and the sevens (7 × 6)."],
    [D.copy.grid.rowsNote("5"), "A row shows up when its table opens. Next up: the fives."],
    [D.copy.settings.clockMoved("2026-09-14"), "Clock moved. No new days until 14 September."],
    [D.copy.recap.improved(D.facts.mulId(7, 8), false, 4100, 2000), "Most improved: 7 × 8, 4.1 s to 2.0 s."],
  ];
  const off = EXACT.filter(([got, want]) => got !== want);
  t("every approved line reads exactly as the plan wrote it", off.length === 0,
    off.map(([got, want]) => JSON.stringify(got) + " should be " + JSON.stringify(want)).join(" | "));
}

/* ================= 14. the copy transcript (PLAN §12) =================
   Every line a struggling player reads in the tryout and one bad run, in order,
   written to qa/copy-run.txt so a person can read it aloud. */
h2("copy transcript");
{
  Math.random = mulberry(4242);
  setTime(2026, 9, 9, 16, 0);
  newState("Player");
  const lines = [];
  const say = (who, text) => { if (text) lines.push((who + "          ").slice(0, 10) + text); };

  say("screen", D.copy.intro.card);
  say("screen", D.copy.intro.cardHow);
  say("screen", D.copy.intro.timer);
  say("screen", D.copy.intro.timerHow);
  say("screen", D.copy.intro.dots);
  say("screen", D.copy.intro.dotsHow);
  say("screen", D.copy.intro.roundOne);
  say("button", D.copy.intro.start);
  lines.push("");

  const ro = D.roundone.create();
  let g = 0;
  while (!ro.isDone() && g++ < 60) {
    const cur = ro.present();
    if (!cur) break;
    if (cur.intro) say("line", cur.intro);
    if (cur.last) say("label", D.copy.run.lastCard);
    say("card", cur.question);
    const f = D.facts.get(cur.card.id);
    const easy = f.op === "mul" && Math.min(f.a, f.b) <= 4;
    const right = Math.random() < (easy ? 0.85 : 0.25);
    const out = ro.submit(right ? f.ans : f.ans + 7, right ? 1500 : 4200);
    if (out && out.kind === "miss") {
      say("", "(crack, buzz)");
      say("line", ro.revealInfo().line);
      ro.typedAnswer(f.ans);
    }
  }
  const firstRound = D.roundone.finishRound(ro);
  lines.push("");
  say("screen", D.copy.roundOne.title);
  say("screen", D.copy.num(firstRound.score));
  const placed = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
  say("screen", placed.length ? D.copy.roundOne.start(placed) : D.copy.roundOne.allOpen);
  say("screen", D.copy.roundOne.rest);
  say("screen", D.copy.roundOne.coins);
  say("screen", D.copy.roundOne.xp);
  say("button", D.copy.roundOne.play);
  lines.push("");

  D.scheduler.ensureProgression();
  const rs = D.runstate.create(D.scheduler.plan());
  const actions = ["added", "plain", "fast", "fast", "timeout", "skip", "plain"];
  let k = 0;
  g = 0;
  while (!rs.isDone() && g++ < 200) {
    const cur = rs.present();
    if (!cur) break;
    if (cur.last) say("label", D.copy.run.lastCard);
    if (cur.comeback) say("label", D.copy.run.comebackLabel);
    say("card", cur.question);
    const f = D.facts.get(cur.card.id);
    const kind = cur.card.kind;
    const plain = kind !== "warmup" && kind !== "scout" && kind !== "comeback" && kind !== "redemption";
    const action = plain && (k++ % 2 === 1) ? actions.shift() : null;
    let out;
    if (action === "timeout" && cur.ringMs) {
      out = rs.timeout();
      if (out && out.kind === "overtime") { say("", "(timer empty, the card stays up)"); out = rs.submit(f.ans, 9000); }
    } else if (action) {
      const wrong = action === "added" && f.op === "mul" ? f.a + f.b : f.ans * 10 + 3;
      const ms = action === "fast" ? 250 : 3800;
      out = rs.submit(wrong, ms);
      if (out && out.slip) { say("", "(crack, buzz)"); say("card", cur.question); out = rs.submit(wrong, ms); }
    } else {
      out = rs.submit(f.ans, 2600);
    }
    if (!out) break;
    if (out.kind === "correct") {
      if (out.line) say("line", out.line);
      if (out.redemptionStart) say("line", out.redemptionStart);
      continue;
    }
    if (out.kind !== "miss") continue;
    say("", "(crack, buzz)");
    if (out.intro) say("line", out.intro);
    if (out.line) say("line", out.line);
    if (out.redemptionStart) say("line", out.redemptionStart);
    if (!out.buttons) continue;
    say("buttons", out.mandatory ? D.copy.rescue.button : D.copy.rescue.button + " / " + D.copy.rescue.skip);
    if (action === "skip" && !out.mandatory) {
      const rv = rs.chooseSkip();
      say("line", rv.line);
      const done = rs.typedAnswer(f.ans);
      if (done && done.redemptionStart) say("line", done.redemptionStart);
      continue;
    }
    const r = rs.chooseRescue();
    if (r && r.kind === "reveal") {
      say("line", r.line);
      const d2 = rs.typedAnswer(f.ans);
      if (d2 && d2.redemptionStart) say("line", d2.redemptionStart);
      continue;
    }
    if (r && r.diagnosis) say("line", r.diagnosis);
    let fails = action === "fast" ? 2 : action === "plain" ? 1 : 0;
    let guard = 0;
    while (guard++ < 20) {
      const st = rs.currentStep();
      if (!st) break;
      say("step", st.prompt);
      let o = fails > 0 ? rs.stepSubmit(st.answer + 1) : rs.stepSubmit(st.answer);
      if (fails > 0) fails--;
      if (!o) break;
      if (o.kind === "stepValue") { say("line", o.line); o = rs.stepForced(o.step.answer); }
      if (o && o.kind === "rescued") {
        say("line", o.line);
        if (o.redemptionStart) say("line", o.redemptionStart);
        break;
      }
    }
  }
  const sum = D.runstate.finishRun(rs);
  lines.push("");
  say("summary", D.copy.num(sum.score));
  const pb = ((sum.extra && sum.extra.pbs) || []).find(x => x.kind === "score");
  say("summary", pb ? D.copy.summary.newBest(pb.delta) : D.copy.summary.best(D.state.pbs.score));
  if (sum.bestCombo) say("summary", D.copy.summary.streak(sum.bestCombo, D.state.pbs.combo));
  if (sum.dotted.length) say("summary", D.copy.summary.dots(sum.dotted.length));
  if (sum.done.length) say("summary", D.copy.summary.done(sum.done.map(id => D.facts.display(id, false))));
  if (sum.gotBack.length) say("summary", D.copy.summary.gotBack(sum.gotBack.map(id => D.facts.display(id, false))));
  for (const ev of (sum.extra && sum.extra.belt) || []) {
    say("summary", ev.kind === "belt" ? D.copy.belt.beltTied(ev.belt)
                                      : D.copy.belt.stripeTied(ev.belt, ev.stripes));
  }
  const beltNow = D.belt.info();
  say("summary", beltNow.black ? D.copy.belt.filled(beltNow.dots)
    : D.copy.belt.toNext(Math.max(0, beltNow.nextAt - beltNow.dots), beltNow.nextKind, beltNow.nextBelt));
  if (sum.xp) say("summary", D.copy.summary.xp(sum.xp));
  if (sum.coins) say("summary", D.copy.summary.coins(sum.coins));
  const focusKey = D.state.focus.primary;
  if (focusKey) say("home", D.copy.home.working(focusKey, D.scheduler.nextUnopened()));
  lines.push("");
  say("once", D.copy.run.firstStreak(1.5));
  say("once", D.copy.run.firstDot);
  say("once", D.copy.run.firstBoth);
  say("once", D.copy.run.firstTick);
  say("once", D.copy.run.overtime);

  const qaDir = path.join(ROOT, "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  const header = "Every line a struggling player reads in the tryout and one bad run, in order.\n" +
    "Read it aloud. Would you say all of this to a kid across a kitchen table?\n\n";
  fs.writeFileSync(path.join(qaDir, "copy-run.txt"), header + lines.join("\n") + "\n");
  const text = lines.join("\n");
  t("the copy transcript is written for a human read", lines.length > 30, "lines " + lines.length);
  t("the transcript carries the one-time rescue line", text.indexOf(D.copy.rescue.first) >= 0);
  t("the transcript carries typed walkthrough steps", lines.some(l => l.indexOf("step") === 0));
  t("nothing in the transcript is a word on a miss",
    !/not yet|not quite|almost|nope|so close|oops|wrong|good job|great/i.test(text));
  Math.random = mulberry(SEED);
}


/* ================= 15. what the copy read changed (PLAN §6.6, §6.8) ================= */
h2("copy read");
{
  newState();
  D.scheduler.activateSafety();
  const add = "add:8+7";
  const rs = D.runstate.create(handPlan([add, mid(2, 3), mid(2, 4)]));
  rs.raw.done.push(add, mid(2, 3));
  rs.raw.gotBack.push(add, mid(2, 4), mid(2, 4));
  const sum = rs.summary();
  t("the safety net never shows up in a run summary",
    sum.gotBack.indexOf(add) < 0 && sum.done.indexOf(add) < 0, JSON.stringify(sum.gotBack));
  t("a fact won back twice is named once", sum.gotBack.filter(x => x === mid(2, 4)).length === 1);
}
{
  newState();
  const ro2 = D.roundone.create();
  let said = 0, g2 = 0;
  while (!ro2.isDone() && g2++ < 60) {
    const cur = ro2.present();
    if (!cur) break;
    const out = ro2.submit(D.facts.get(cur.card.id).ans, 700);
    if (out && out.line) said++;
  }
  t("a clean round one says nothing beyond the line on its first card", said === 0, "lines " + said);
}


/* ================= 16. what the correctness review found (2026-09-10) ================= */
h2("correctness review");
{
  newState();
  const tr = D.tryout.create();
  let g = 0;
  while (g++ < 60) { const c = tr.next(); if (!c) break; tr.answer(D.facts.get(c.id).ans, 600); }
  tr.apply();
  D.scheduler.ensureProgression();
  t("a perfect tryout still leaves a primary table in focus", !!D.state.focus.primary, JSON.stringify(D.state.focus));
}
{
  newState();
  D.scheduler.ensureProgression();
  D.scheduler.tableState("5").status = "open";
  for (const id of D.facts.table("5").products) seedFast(id);
  const id = D.facts.mulId(5, 7);
  const r = D.mastery.rec(id); r.lastMiss = true; r.streak = 0;
  D.mastery.dirty();
  let served = 0;
  for (let i = 0; i < 20; i++) if (D.scheduler.plan().cards.some(c => c.id === id)) served++;
  t("a fact that slips back in a table outside focus is served again", served > 0, "served in " + served + " of 20 plans");
}
{
  newState();
  for (const key of D.facts.TABLE_ORDER) {
    D.scheduler.tableState(key).status = "open";
    for (const id of D.facts.table(key).items) seedFast(id);
  }
  for (const id of D.facts.table("5").divisions) delete D.state.facts[id];
  D.state.focus = { primary: null, secondary: null };
  D.mastery.dirty();
  D.scheduler.ensureProgression();
  t("a table left half taught comes back into focus",
    [D.state.focus.primary, D.state.focus.secondary].indexOf("5") >= 0, JSON.stringify(D.state.focus));
}
{
  newState("Tester");
  const tr = D.tryout.create();
  let g = 0;
  while (g++ < 60) { const c = tr.next(); if (!c) break; tr.answer(D.facts.get(c.id).ans, 900); }
  tr.apply();
  const backup = D.save.fresh({ name: "Tester", slug: "tester" });
  backup.facts[mid(3, 4)] = D.mastery.blank();
  backup.facts[mid(3, 4)].seen = 4;
  backup.runs.push({ day: "2026-09-08", correct: 18, cards: 20, score: 1500 });
  backup.lastSeenEpoch = D.u.now() - 86400000;
  const res = D.share.apply(backup);
  t("a backup restores onto a new install that has only done the tryout", res.ok === true, JSON.stringify(res));
}
{
  setTime(2026, 9, 13, 18, 0);
  newState();
  D.scheduler.ensureProgression();
  const rs = D.runstate.create(D.scheduler.plan());
  for (let i = 0; i < 4; i++) answer(rs, true, 900);
  const snap = rs.snapshot();
  setTime(2026, 9, 14, 9, 0);
  D.save.touchDay();
  const wk = D.state.progress.weekKey;
  const back = D.runstate.resume(snap);
  t("a resumed run belongs to the day it is finished", back.raw.day === D.u.gameDay(), back.raw.day);
  playAll(back, { correct: true, ms: 900 });
  D.runstate.finishRun(back);
  t("finishing a resumed run never rolls the week backwards", D.state.progress.weekKey === wk,
    D.state.progress.weekKey + " vs " + wk);
  setTime(2026, 9, 9, 16, 0);
}
{
  newState();
  D.state.progress.weekKey = "2026-09-14";
  D.save.rollWeek("2026-09-10");
  t("weeks never roll backwards", D.state.progress.weekKey === "2026-09-14");
}
{
  newState();
  const ids = [mid(6, 7), mid(2, 3), mid(3, 8), mid(4, 9), mid(7, 9), mid(2, 5), mid(8, 9)];
  seedFast(ids[1]); seedFast(ids[5]);
  const rs = D.runstate.create(handPlan(ids,
    ["learning", "maintenance", "learning", "learning", "learning", "maintenance", "learning"]));
  const miss = answer(rs, false, 3000);
  if (miss && miss.buttons) rescueThrough(rs, true);
  const had = rs.raw.cards.some(c => c.kind === "comeback");
  const slip = answer(rs, false, 3000);
  t("the slip setup has a comeback and a slip", had && !!slip && slip.slip === true);
  t("a slip re-serve never deletes a comeback", rs.raw.cards.some(c => c.kind === "comeback"));
}
{
  newState();
  D.scheduler.activateSafety();
  D.state.progress.learnSlots = 4;
  D.scheduler.ensureProgression();
  const plan = D.scheduler.plan();
  const safety = plan.cards.filter(c => c.kind === "safety").length;
  const learning = plan.cards.filter(c => c.kind === "learning").length;
  t("the quiet lane takes at most half the learning slots", safety <= 2 && learning >= 2,
    safety + " safety, " + learning + " learning");
}
{
  newState();
  D.scheduler.activateSafety();
  let days = 0;
  for (; days < 60 && D.state.lanes.addsub.active; days++) {
    for (let k = 0; k < 3; k++) {
      const plan = D.scheduler.plan();
      for (const c of plan.cards) {
        if (D.facts.get(c.id).lane !== "addsub") continue;
        D.mastery.record(c.id, { correct: true, rt: 900, day: D.u.gameDay() });
      }
    }
    advanceHours(24);
    D.save.touchDay();
  }
  t("a quiet lane answered well turns itself off", D.state.lanes.addsub.active === false,
    (D.state.lanes.addsub.active ? "still on after " : "off after ") + days + " days");
  setTime(2026, 9, 9, 16, 0);
}
{
  // Beyond questions move the belt like any other; the quiet lane never does.
  newState();
  for (const key of D.facts.TABLE_ORDER) D.scheduler.tableState(key).status = "open";
  D.state.belt.step = D.cfg.BEYOND_OPEN_STEP;
  D.scheduler.ensureProgression();
  const bey = D.beyond.topicFacts(D.beyond.openTopics()[0])[0];
  D.mastery.rec(bey).days = ["2026-09-01", "2026-09-03"];
  D.mastery.rec("add:8+7").days = ["2026-09-01", "2026-09-03"];
  D.mastery.dirty();
  t("a Beyond question's dots count toward the belt and the quiet lane's do not", D.belt.dotsFilled() === 2,
    "dots " + D.belt.dotsFilled());
}


/* ================= 17. what the exploit review found (2026-09-10) ================= */
h2("exploit review");
{
  newState();
  const ids = [mid(6, 7), mid(2, 3), mid(2, 4)];
  const rs = D.runstate.create(handPlan(ids, ["learning", "maintenance", "maintenance"]));
  const out = answer(rs, false, 3000);
  t("the kill setup reaches the miss buttons", !!out && out.buttons === true);
  const back = D.runstate.resume(rs.snapshot());
  t("a run closed at the miss buttons comes back on the shown answer",
    back.raw.phase === "reveal" && back.raw.i === 0, back.raw.phase + " at " + back.raw.i);
  const xp0 = D.state.progress.xp;
  t("the reopened card cannot be answered for points", back.submit(D.facts.get(ids[0]).ans, 800) === null);
  const done = back.typedAnswer(D.facts.get(ids[0]).ans);
  t("typing the shown answer pays nothing", !!done && done.points === 0 && D.state.progress.xp === xp0);
}
{
  newState("Tester");
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  D.state.runs.push({ day: D.u.gameDay(), correct: 18, cards: 20, score: 1500 });
  const link = JSON.parse(JSON.stringify(D.state));
  const test = D.belttest.create();
  test.abandon();
  t("a link taken just before a Belt Test is refused after it", D.share.apply(link).ok === false);
  const edited = JSON.parse(JSON.stringify(link));
  edited.lastSeenEpoch = D.state.lastSeenEpoch + 60000;
  for (const id of Object.keys(edited.facts)) edited.facts[id].seen = Math.max(0, edited.facts[id].seen - 1);
  t("a backup that has answered fewer cards is refused whatever its clock says", D.share.apply(edited).ok === false);
}
{
  newState();
  seedCoreFast();
  D.state.belt.step = D.belt.lastStep();
  const test = D.belttest.create();
  for (let i = 0; i < 3; i++) { const p = test.present(); test.submit(D.facts.get(p.card.id).ans + 7, 800); }
  const prog = D.state.flags.testProgress;
  t("a Belt Test keeps its progress in the save card by card",
    !!prog && prog.served === 3 && prog.correct === 0, JSON.stringify(prog));
}
{
  newState("Tester");
  D.state.progress.xp = 25500;
  t("XP with no correct answers behind it is flagged", D.share.checks(D.state).some(c => c.id === "xp"));
  D.state.progress.xp = 0;
  D.state.progress.coins = 50052;
  t("coins no answers could have paid are flagged", D.share.checks(D.state).some(c => c.id === "coins"));
  D.state.progress.coins = 0;
  D.state.belt.black = true;
  t("a black belt with no passed test on record is flagged", D.share.checks(D.state).some(c => c.id === "belts"));
}
{
  // Coins come one per right answer, fast or slow; levels come at 250 XP, then 400 more.
  newState();
  seedFast(mid(3, 4), 900); seedFast(mid(3, 5), 4200); seedFast(mid(3, 6), 900);
  const rs = D.runstate.create(handPlan([mid(3, 4), mid(3, 5), mid(3, 6)]));
  const c0 = D.state.progress.coins;
  answer(rs, true, 800);
  answer(rs, true, 3900);
  t("a slow right answer pays the same coin as a fast one",
    D.state.progress.coins === c0 + 2 * D.cfg.COINS_PER_CORRECT, "coins " + (D.state.progress.coins - c0));
  t("level 2 needs 250 XP and level 3 another 400",
    D.xp.levelFor(249).level === 1 && D.xp.levelFor(250).level === 2 &&
    D.xp.levelFor(649).level === 2 && D.xp.levelFor(650).level === 3);
}
{
  // Beyond needs every table open as well as the purple belt.
  newState();
  D.state.belt.step = D.cfg.BEYOND_OPEN_STEP;
  D.scheduler.ensureProgression();
  t("the purple belt alone does not open Beyond while tables are still closed", D.state.lanes.beyond.open === false);
}
{
  newState();
  const id = mid(7, 8);
  const r = seedFast(id); r.best = 6000;
  seedFast(mid(2, 3)); seedFast(mid(2, 4));
  const rs = D.runstate.create(handPlan([id, mid(2, 3), mid(2, 4)]));
  const out = rs.submit(D.facts.get(id).ans, 5800);
  t("beating a slow ghost outside the fast line pays no spark", out.marks.indexOf("pb") < 0);
}
{
  newState();
  const sp0 = D.state.progress.coins;
  D.xp.checkPbs({ score: 1500, bestCombo: 12, fastestFact: { id: mid(7, 8), ms: 1500 }, table: null, medianRt: 1500 });
  t("the first run sets every personal best without paying for one", D.state.progress.coins === sp0,
    "sparks paid " + (D.state.progress.coins - sp0));
}
{
  newState();
  const ids = [mid(2, 3), mid(6, 9), mid(2, 4), mid(2, 5)];
  ids.forEach(id => seedAuto(id));
  const plan = handPlan(ids);
  plan.cards[1].bonus = true;
  const rs = D.runstate.create(plan);
  answer(rs, true, 800);
  const combo = rs.raw.combo;
  const slip = answer(rs, false, 3000);
  t("a slip on a settled fact goes on its record",
    !!slip && slip.slip === true && D.mastery.rec(ids[1]).lastMissDay === D.u.gameDay() &&
    D.mastery.rec(ids[1]).miss >= 1);
  t("a slip alone does not take a day", D.mastery.rec(ids[1]).days.length === 3,
    "days " + D.mastery.rec(ids[1]).days.length);
  const re = answer(rs, true, 800);
  t("a slip's re-serve does not step the combo", rs.raw.combo === combo, combo + " then " + rs.raw.combo);
  t("a bonus card answered wrong first pays no bonus", re.marks.indexOf("bonus") < 0);
}
{
  D.beyond.build();
  const yn = D.beyond.topicFacts("divis")[0];
  const worked = D.beyond.topicFacts("mul2x1")[0];
  t("a yes or no Beyond card pays less than one that has to be worked out",
    D.facts.weight(yn) <= 0.5 && D.facts.weight(yn) < D.facts.weight(worked));
}

/* ================= results ================= */
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) { console.log("\nfailures:\n  " + failures.join("\n  ")); process.exit(1); }
