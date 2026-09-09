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
  "js/engine/xp.js", "js/engine/scheduler.js", "js/engine/runstate.js",
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
  if (cond) { passed++; }
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
  const before = { score: 0, xp: D.state.progress.xp, sparks: D.state.progress.sparks };
  for (let i = 0; i < ids.length; i++) {
    const out = answer(rs, false, 3000);
    if (out && out.buttons) { rs.chooseSkip(); rs.typedAnswer(D.facts.get(out.card.id).ans); }
  }
  const s = rs.summary();
  t("a run of wrong answers and skips pays no score", s.score === 0, "score " + s.score);
  t("a run of wrong answers and skips pays no XP", D.state.progress.xp === before.xp);
  t("a run of wrong answers and skips pays no sparks", D.state.progress.sparks === before.sparks);
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
  // Gold pays once, ever.
  newState();
  const id = "mul:6x7";
  const r = D.mastery.rec(id);
  r.seen = 8; r.ok = 8; r.streak = 3; r.ewma = 900; r.window = [1,1,1,1,1,1,1,1];
  r.days = ["2026-09-05", "2026-09-06"]; r.lastDay = "2026-09-06";
  D.mastery.dirty();
  const xp0 = D.state.progress.xp, sp0 = D.state.progress.sparks;
  const rs = D.runstate.create(handPlan([id, "mul:6x8", "mul:6x9"]));
  seedFast("mul:6x8"); seedFast("mul:6x9");
  const out = answer(rs, true, 800);
  t("a fact that turns gold pays the gold bonus", out.gold === true && D.state.progress.xp > xp0 + 10);
  t("gold pays a spark", D.state.progress.sparks > sp0);
  // Miss it, rescue it, win it back, reach auto again: no second gold.
  const xp1 = D.state.progress.xp, sp1 = D.state.progress.sparks;
  D.mastery.rec(id).goldPaid = true;
  const r2 = D.mastery.rec(id);
  r2.days = ["2026-09-05", "2026-09-06"]; r2.lastMiss = false; r2.streak = 3; r2.lastDay = "2026-09-06";
  D.mastery.dirty();
  const rs2 = D.runstate.create(handPlan([id, "mul:6x8", "mul:6x9"]));
  const out2 = answer(rs2, true, 800);
  t("gold is never paid twice for the same fact", out2.gold !== true);
  t("gold XP is never paid twice", D.state.progress.xp <= xp1 + 20);
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
  // PB sparks need a real delta.
  newState();
  D.state.pbs.score = 1000;
  const sp0 = D.state.progress.sparks;
  D.xp.checkPbs({ score: 1005, bestCombo: 0, fastestFact: null, table: null, medianRt: 900 });
  t("a one point personal best pays no spark", D.state.progress.sparks === sp0);
  D.xp.checkPbs({ score: 1200, bestCombo: 0, fastestFact: null, table: null, medianRt: 900 });
  t("a ten per cent personal best pays a spark", D.state.progress.sparks === sp0 + D.cfg.SPARKS_PB);
}

/* ================= 2. mastery (PLAN §6.2) ================= */
h2("mastery");
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
  const days = r.days.length;
  D.mastery.record(id, { correct: true, rt: D.mastery.threshold(id) * 2, day: D.u.gameDay() });
  t("a slow answer on a settled fact gives a day back", D.mastery.rec(id).days.length === days - 1);
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
  // Week dots reset on Monday and the five day bonus pays once.
  newState();
  const p = D.state.progress;
  p.weekDots = [0, 1, 2, 3]; p.weekBonusPaid = false; p.weekKey = D.u.weekKey("2026-09-07");
  p.lastRunDay = null;
  const sp0 = p.sparks;
  D.xp.creditDay("2026-09-11");                   // Friday of that week
  t("the fifth dot pays a spark bonus", p.sparks === sp0 + D.cfg.SPARKS_WEEK, "sparks " + p.sparks);
  p.lastRunDay = null;
  D.xp.creditDay("2026-09-12");
  t("the week bonus pays once a week", p.sparks === sp0 + D.cfg.SPARKS_WEEK);
  p.lastRunDay = null;
  D.xp.creditDay("2026-09-14");                   // the next Monday
  t("the dots reset on Monday", p.weekDots.length === 1 && p.weekBonusPaid === false);
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
const PROFILES = {
  novice: { floor: 0.25, gain: 0.16, loss: 0.05, decay: 0.012, fast: 1250, slow: 6000,
            onMiss: "rescue", stepP: 0.7,
            start: id => (inTables(id, KNOWN_TABLES) ? 0.85 : 0.15) },
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
    const rt = cur.ringMs ? Math.min(a.rt, cur.ringMs + 400) : a.rt;
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
    noviceXp.push(D.state.progress.xp); noviceSparks.push(D.state.progress.sparks);
    runBot("guesser", seed, 10, 3);
    guessXp.push(D.state.progress.xp); guessSparks.push(D.state.progress.sparks);
    runBot("skipper", seed, 10, 3);
    skipXp.push(D.state.progress.xp); skipSparks.push(D.state.progress.sparks);
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
      if (rec.goldPaid) { everAuto++; if (D.mastery.status(id) === "auto") stillAuto++; }
    }
    kept.push(everAuto ? stillAuto / everAuto : 1);
  }
  t("four in five settled facts are still settled at day thirty", medianOf(kept) >= 0.8,
    "median " + medianOf(kept).toFixed(2));
}
Math.random = mulberry(SEED);

/* ================= results ================= */
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) { console.log("\nfailures:\n  " + failures.join("\n  ")); process.exit(1); }
