/* Dojo 12 — every tunable number in the game. Change a value here and nowhere
   else, and log the change in CHANGELOG.md with its old and new value
   (PLAN.md §14, §16). */
"use strict";
D.cfg = {
  SAVE_PREFIX: 'dojo12.save.v2.',
  VERSION: 2,

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
  AUTO_DAYS: 3,             // spaced days to reach auto
  MAX_DAYS_KEPT: 12,
  REVIEW_INTERVALS: [1, 2, 4, 7, 14, 30],
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
  RUN_MIN_CORRECT: 10,      // below this a run does not count as played

  /* ---- rings (PLAN §6.5) ---- */
  RING_MEDIAN_MULT: 2.2,
  RING_MIN_MULT: 1.25,      // clamp on W, relative to the fact's threshold
  RING_MAX_MULT: 2.0,
  RING_BY_STATUS: { known: 1.25, fast: 1.0, auto: 1.0, comeback: 1.5, redemption: 2.0 },
  RING_GRACE_MS: 1000,
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
  BEYOND_OPEN_BELTS: 6,

  /* ---- belts (PLAN §7.1) ---- */
  BELT_YELLOW_PCT: 0.50, BELT_ORANGE_PCT: 0.80, BELT_TEST_PCT: 0.90,
  TEST_CARDS: 24, TEST_WILDCARDS: 2,
  TEST_PASS_CORRECT: 22, TEST_PASS_FAST: 20,
  PROVISIONAL_DAYS: 3, PROVISIONAL_FLOOR: 0.80,

  /* ---- scoring (PLAN §7.3) ---- */
  BASE_SCORE: 100,
  RING_BONUS: 50,           // x the fraction of the ring left
  COMBO_STEP: 3,            // every N correct in a row steps the multiplier
  COMBO_TIERS: [1, 1.5, 2, 3],
  RESCUE_SCORE: 50,
  LAST_CARD_MULT: 2,
  COMEBACK_MULT: 2,
  BONUS_MULT: 3, BONUS_SPARKS: 5,
  WEIGHTS: { 2: 0.8, 10: 0.8, 5: 1.0, 4: 1.0, 11: 1.0, 3: 1.1, 9: 1.1, 6: 1.1, sq: 1.1,
             8: 1.25, 12: 1.25, 7: 1.25 },
  WEIGHT_DIV_BONUS: 0.1,
  WEIGHT_ADDSUB: 0.6,
  WEIGHT_BEYOND: 1.5,

  /* ---- XP, levels, sparks (PLAN §7.4) ---- */
  XP_PER_CORRECT: 10,       // x table weight
  XP_FULL_PER_DAY: 60,      // answers after this pay half. Never mentioned in copy.
  XP_GOLD: 25, XP_BLACK_BELT: 500, XP_GRANDMASTER: 2000,
  LEVEL_BASE: 1000, LEVEL_STEP: 250,   // level n -> n+1 needs BASE + STEP x n
  SPARKS_PER_CORRECT: 0.5,  // 1 per 2 correct unaided answers
  SPARKS_GOLD: 1, SPARKS_GHOST: 1, SPARKS_BLACK_BELT: 50, SPARKS_PB: 5,
  SPARKS_WEEK: 25, WEEK_DOTS_FOR_BONUS: 5,
  SPARKS_DAYS: 25, DAYS_BONUS_AT: [30, 100],
  GHOST_MIN_ATTEMPTS: 3, GHOST_BEAT_MS: 100,
  PB_SCORE_PCT: 0.10, PB_COMBO: 3, PB_FACT_MS: 200, PB_TABLE_RUNS: 5,

  /* ---- Beyond (PLAN §6.9) ---- */
  BEYOND_RT_BASE: 5000, BEYOND_RT_PER_DIGIT: 900,

  /* ---- safety net (PLAN §6.8) ---- */
  SAFETY_TRIGGER_PROBES: 2, // misses out of the four tryout probes
  SAFETY_DEACTIVATE_PCT: 0.90,
  SAFETY_DEACTIVATE_MIN: 12,  // ... measured over facts of that family the child has seen

  /* ---- tryout (PLAN §6.6) ---- */
  TRYOUT_MAX: 30, TRYOUT_OPENERS: 4, TRYOUT_STOP_AFTER_WRONG: 2,

  /* ---- misc ---- */
  RUNS_KEPT: 200,
  FAST_WRONG_WINDOW_DAYS: 7,
};
