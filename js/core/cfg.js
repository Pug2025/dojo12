/* Dojo 12 — every tunable number in the game. Change a value here and nowhere
   else, and log the change in CHANGELOG.md with its old and new value
   (PLAN.md §14, §16). */
"use strict";
D.cfg = {
  SAVE_PREFIX: 'dojo12.save.v2.',
  VERSION: 3,

  /* ---- mastery model (PLAN §6.2) ---- */
  RT_BASE: 2000,            // ms allowed for a 1-digit answer
  RT_PER_DIGIT: 400,        // extra ms per extra answer digit
  RT_DIV_BONUS: 400,        // divisions get this much more: the work is in the
                            // question, not the answer, and 20 / 10 is not
                            // recalled faster than 2 x 10 just because the
                            // answer is one digit (PLAN §6.2)
  RT_RELATIVE: 1.4,         // fast also needs ewma <= 1.4 x own median over auto facts
  RT_RELATIVE_MIN_FACTS: 10,// ... once this many auto facts of the same digit count exist
  EWMA_ALPHA: 0.3,          // updated by unaided correct answers only
  ACC_WINDOW: 8,            // outcomes kept in window[]
  ACC_WINDOW_PCT: 0.87,     // window accuracy needed once the window is full
  ACC_LIFETIME_PCT: 0.70,   // accuracy needed before the window fills
  AUTO_DAYS: 2,             // the two dots: fast answers on this many counted days (rework 2026-09-10)
  MAX_DAYS_KEPT: 12,
  REVIEW_INTERVALS: [1, 3, 7, 14, 30],   // the wait after dot one, then check-ins once both are filled
  SLOW_AUTO: 1.5,           // ewma above this x threshold on an auto fact removes a day
  FAST_WRONG_FLOOR: 800,    // fast wrong = wrong within max(this, FAST_WRONG_W x W)
  FAST_WRONG_W: 0.25,
  ROLLOVER_HOUR: 4,         // local hour a new game-day may first credit
  ROLLOVER_MIN_MS: 6 * 3600 * 1000,

  /* ---- run composition (PLAN §6.5) ---- */
  RUN_CARDS: 20,
  WARMUPS: 3,
  HOT_SET: 4,
  LEARN_START: 6, LEARN_MIN: 4, LEARN_MAX: 8,
  LEARN_DOWN_PCT: 0.75, LEARN_UP_PCT: 0.92, LEARN_LOOKBACK: 3,
  PROMOTE_SLOTS: 4,
  SCOUTS: 2,
  DUE_MAX: 5,
  SAFETY_MAX: 4,
  BEYOND_SHARE: 0.25,
  COMEBACK_MIN: 3, COMEBACK_MAX: 6,
  REDEMPTION_MAX: 5,
  PROMOTE_LAGS: [2, 5],     // short-lag re-serves inside the run while correct
  RUN_SPARES: 8,            // facts held back to take a repeat's slot when it has no job left
  RUN_MIN_CORRECT: 10,      // below this a run does not count as played

  /* ---- rings (PLAN §6.5) ---- */
  RING_MEDIAN_MULT: 2.2,
  RING_MIN_MULT: 1.25,      // clamp on W, relative to the fact's threshold
  RING_MAX_MULT: 2.0,
  RING_BY_STATUS: { known: 1.25, fast: 1.0, auto: 1.0, comeback: 1.5, redemption: 2.0 },
  RING_GRACE_MS: 1000,
  // An emptied ring on these leaves the card up for base points and no combo step;
  // on fast and auto cards it is still a miss (Jamie, rework 2026-09-10).
  RING_OVERTIME_KINDS: ['known', 'comeback', 'redemption'],
  RT_SAMPLES: 50,           // unaided-correct RTs kept per lane and digit count
  RESCUE_BUTTON_MS: 12000,  // silent wait on an unringed card before Rescue appears

  /* ---- progression (PLAN §6.4) ---- */
  FOCUS_PROMOTE_PCT: 0.80,  // primary this fast+auto opens the next table
  DIVISION_OPEN_PCT: 0.50,
  TABLE_PREREQ_PCT: 0.60,
  TABLE_REOPEN_PCT: 0.60,   // fast+auto share below this re-opens a table as focus
  SCOUT_SEED_FAST: 2,       // fast correct probes that seed a fact known
  SCOUT_TABLE_PROBES: 6, SCOUT_TABLE_PCT: 0.80,
  SCOUT_DECLINE: 3,
  BEYOND_OPEN_STEP: 10,     // the Beyond lane opens at the purple belt

  /* ---- the belt (rework 2026-09-10) ----
     One belt per child, Brazilian jiu-jitsu: white, blue, purple, brown, black,
     four stripes on each before the next. It moves on dots: every question has
     AUTO_DAYS of them, and a fast answer on a counted day fills one. Step n is
     reached at BELT_STEPS[n-1] dots filled; steps 5, 10 and 15 are the blue,
     purple and brown belts, and step 19, brown's fourth stripe, opens the black
     belt test. The marks sit at 374 x (n/20)^2, 374 being the two dots on each of
     the 187 times and divide questions, so they come closer together early. */
  BELT_STEPS: [1, 4, 9, 15, 24, 34, 46, 60, 76, 94, 114, 135, 159, 184, 211, 240, 271, 303, 338],
  BELT_NAMES: ['white', 'blue', 'purple', 'brown'],
  TEST_CARDS: 24, TEST_WEAK: 16,        // the black belt test: the child's sixteen weakest, eight more
  TEST_PASS_CORRECT: 22, TEST_PASS_FAST: 20,

  /* ---- scoring (PLAN §7.3) ---- */
  BASE_SCORE: 100,
  RING_BONUS: 50,           // x the fraction of the ring left
  COMBO_STEP: 3,            // every N correct in a row steps the multiplier
  COMBO_TIERS: [1, 1.5, 2, 3],
  RESCUE_SCORE: 50,
  LAST_CARD_MULT: 2,
  COMEBACK_MULT: 2,
  BONUS_MULT: 3, BONUS_COINS: 5,
  WEIGHTS: { 2: 0.8, 10: 0.8, 5: 1.0, 4: 1.0, 11: 1.0, 3: 1.1, 9: 1.1, 6: 1.1, sq: 1.1,
             8: 1.25, 12: 1.25, 7: 1.25 },
  WEIGHT_DIV_BONUS: 0.1,
  WEIGHT_ADDSUB: 0.6,
  WEIGHT_BEYOND: 1.5,
  WEIGHT_BEYOND_YESNO: 0.5,   // guessable half the time (exploit review 2026-09-10)

  /* ---- XP, levels, coins (PLAN §7.4, rework 2026-09-10) ---- */
  XP_PER_CORRECT: 10,       // x table weight, and the only source of XP
  XP_FULL_PER_DAY: 60,      // answers after this pay half. Never mentioned in copy.
  LEVEL_BASE: 100, LEVEL_STEP: 150,    // level n -> n+1 needs BASE + STEP x n: 250, 400, 550...
  COINS_PER_CORRECT: 1,     // every unaided right answer, fast or slow
  COINS_STRIPE: 10, COINS_BELT: 50,
  GHOST_MIN_ATTEMPTS: 3, GHOST_BEAT_MS: 100,
  PB_FACT_MS: 0,            // a faster fastest fact is a new best by any margin; nothing pays for it

  /* ---- Beyond (PLAN §6.9) ---- */
  BEYOND_RT_BASE: 5000, BEYOND_RT_PER_DIGIT: 900,

  /* ---- safety net (PLAN §6.8) ---- */
  SAFETY_TRIGGER_PROBES: 2, // misses out of the four tryout probes
  SAFETY_DEACTIVATE_PCT: 0.90,
  SAFETY_DEACTIVATE_MIN: 12,  // ... measured over facts of that family the child has seen
  SAFETY_WORKING: 3,          // facts a family works at once, like a hot set
  SAFETY_FAMILIES: 2,         // families served at once; the next ones wait their turn
  SAFETY_SHARE: 0.5,          // never more than this share of the learning slots

  /* ---- tryout (PLAN §6.6) ---- */
  TRYOUT_MAX: 30,           // placement probes; fillers do not count
  TRYOUT_MAX_CARDS: 34,     // cards of any kind: a valve, not the usual stop
  TRYOUT_OPENERS: 4,
  TRYOUT_STOP_AFTER_WRONG: 2,   // consecutive tables with a wrong easy probe
  TRYOUT_STOP_AFTER_HARD: 2,    // consecutive wrong hard probes: the ceiling is found
  TRYOUT_REPROBES: 1,           // suspicious easy misses given a second look
  ROUND_ONE_CARDS: 20,          // round 1 is a normal round of this many cards (rework 2026-09-10)
  PLACEMENT_SCOUTS: 4,          // scout cards per round for tables round 1 ran out of cards for
  PLACEMENT_RUNS: 3,            // ... for this many rounds

  /* ---- shop (PLAN §7.1). Nothing here touches play. Prices are set so a
     novice earning about ten sparks a run reaches the two big themes on day
     four to six, and so there are four to six things to want at every level. ---- */
  // Two papers are free and picked on first launch; everything below is stock.
  FREE_PAPERS: ['washi', 'night'],
  SHOP: [
    { id: 'theme:matcha',  kind: 'theme',  value: 'matcha',   price: 390,  level: 2 },
    { id: 'theme:sakura',  kind: 'theme',  value: 'sakura',   price: 450,  level: 3 },
    { id: 'theme:kraft',   kind: 'theme',  value: 'kraft',    price: 600,  level: 5 },
    { id: 'theme:sumi',    kind: 'theme',  value: 'sumi',     price: 930,  level: 7 },
    { id: 'theme:kinpaku', kind: 'theme',  value: 'kinpaku',  price: 1350, level: 10 },

    { id: 'skin:grain',    kind: 'skin',   value: 'grain',    price: 90,   level: 1 },
    { id: 'skin:grid',     kind: 'skin',   value: 'grid',     price: 210,  level: 2 },
    { id: 'skin:wave',     kind: 'skin',   value: 'wave',     price: 360,  level: 4 },
    { id: 'skin:hemp',     kind: 'skin',   value: 'hemp',     price: 630,  level: 6 },
    { id: 'skin:gilt',     kind: 'skin',   value: 'gilt',     price: 1170, level: 10 },

    { id: 'ring:thin',     kind: 'ring',   value: 'thin',     price: 140,  level: 1 },
    { id: 'ring:double',   kind: 'ring',   value: 'double',   price: 300,  level: 3 },
    { id: 'ring:dotted',   kind: 'ring',   value: 'dotted',   price: 570,  level: 5 },
    { id: 'ring:gold',     kind: 'ring',   value: 'gold',     price: 1050, level: 8 },

    { id: 'combo:ink',     kind: 'combo',  value: 'ink',      price: 120,  level: 1 },
    { id: 'combo:round',   kind: 'combo',  value: 'round',    price: 330,  level: 4 },
    { id: 'combo:gold',    kind: 'combo',  value: 'gold',     price: 840,  level: 7 },

    { id: 'sound:bell',    kind: 'sound',  value: 'bell',     price: 110,  level: 1 },
    { id: 'sound:wood',    kind: 'sound',  value: 'wood',     price: 260,  level: 2 },
    { id: 'sound:glass',   kind: 'sound',  value: 'glass',    price: 510,  level: 5 },
    { id: 'sound:deep',    kind: 'sound',  value: 'deep',     price: 960,  level: 8 },

    { id: 'mark:circle',   kind: 'mark',   value: 'circle',   price: 80,   level: 1 },
    { id: 'mark:triangle', kind: 'mark',   value: 'triangle', price: 80,   level: 1 },
    { id: 'mark:square',   kind: 'mark',   value: 'square',   price: 170,  level: 2 },
    { id: 'mark:diamond',  kind: 'mark',   value: 'diamond',  price: 290,  level: 3 },
    { id: 'mark:hex',      kind: 'mark',   value: 'hex',      price: 450,  level: 5 },
    { id: 'mark:star',     kind: 'mark',   value: 'star',     price: 720,  level: 7 },
    { id: 'mark:ring',     kind: 'mark',   value: 'ring',     price: 990,  level: 9 },
    { id: 'mark:cross',    kind: 'mark',   value: 'cross',    price: 1500, level: 12 },
  ],

  /* ---- misc ---- */
  RUNS_KEPT: 200,
  FAST_WRONG_WINDOW_DAYS: 7,
};
