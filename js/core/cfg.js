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
  RT_RELATIVE: 1.4,         // (unused since §13.3; kept for the dashboard's checks)
  RT_RELATIVE_MIN_FACTS: 10,
  RT_OWN_SHARE: 1.0,        // the fast line is this share of the child's own median time on the fact's table (§13.3; 0.85 of one pool by answer length left an even child with nothing, replay 2026-09-14)
  RT_OWN_MAX: 5000,         // ... never slower than this
  RT_OWN_MIN_SAMPLES: 5,    // ... once this many unaided right answers of that length exist
  EWMA_ALPHA: 0.3,          // updated by unaided correct answers only
  ACC_WINDOW: 8,            // outcomes kept in window[]
  ACC_WINDOW_PCT: 0.87,     // window accuracy needed once the window is full
  ACC_LIFETIME_PCT: 0.70,   // accuracy needed before the window fills
  AUTO_DAYS: 2,             // fast on this many counted days seals a question
  MAX_DAYS_KEPT: 12,
  REVIEW_INTERVALS: [1, 3, 7, 14, 30],   // the wait after dot one, then check-ins once both are filled
  SLOW_AUTO: 2.0,           // ewma above this x the fast line on a sealed fact removes a day (1.5 churned seals on the child's own line, replay 2026-09-14)
  FAST_WRONG_FLOOR: 800,    // fast wrong = wrong within max(this, FAST_WRONG_W x W)
  FAST_WRONG_W: 0.25,
  ROLLOVER_HOUR: 4,         // local hour a new game-day may first credit
  ROLLOVER_MIN_MS: 6 * 3600 * 1000,

  /* ---- run composition (PLAN §6.5) ---- */
  RUN_CARDS: 5,            // five questions a round (Jamie, 2026-09-14: "max 5 questions before something happens")
  WARMUPS: 1,
  HOT_SET: 4,
  LEARN_START: 2, LEARN_MIN: 1, LEARN_MAX: 2,
  LEARN_DOWN_PCT: 0.75, LEARN_UP_PCT: 0.92, LEARN_LOOKBACK: 3,
  PROMOTE_SLOTS: 1,
  SCOUTS: 1,               // one scout card every other round (§13.3)
  DUE_MAX: 2,              // questions that can seal today come first (§13.3)
  SAFETY_MAX: 1,
  BEYOND_SHARE: 0.25,
  COMEBACK_MIN: 2, COMEBACK_MAX: 3,
  CARRY_COMEBACKS: 1,       // a miss with no room left comes back in the next round, one a round (§13.3)
  REDEMPTION_MAX: 0,        // the redemption tail is cut; misses come back inside the next round (§13.3)
  PROMOTE_LAGS: [],         // no in-round repeat in a five-card round; the pool re-serves next round
  RUN_SPARES: 3,            // facts held back to take a repeat's slot when it has no job left
  RUN_MIN_CORRECT: 3,       // below this a run does not count as played
  BONUS_CHANCE: 0.4,        // rounds with a hidden bonus card (§13.3)

  /* ---- rings (PLAN §6.5) ---- */
  RING_MEDIAN_MULT: 2.2,
  RING_MIN_MULT: 1.25,      // clamp on W, relative to the fact's threshold
  RING_MAX_MULT: 2.0,
  RING_BY_STATUS: { known: 1.25, fast: 1.25, auto: 1.25, comeback: 1.5, redemption: 2.0 },  // the ring never shrinks when a question earns an outline (§13.3)
  RING_GRACE_MS: 1000,
  // An emptied ring on these leaves the card up for base points and no combo step;
  // on fast and auto cards it is still a miss (Jamie, rework 2026-09-10).
  RING_OVERTIME_KINDS: ['known', 'fast', 'auto', 'comeback', 'redemption'],  // every card: a right answer typed late is slow, never a miss (§13.3)
  RT_SAMPLES: 50,           // unaided-correct RTs kept per lane and digit count
  RESCUE_BUTTON_MS: 12000,  // silent wait on an unringed card before Rescue appears

  /* ---- progression (PLAN §6.4) ---- */
  FOCUS_PROMOTE_PCT: 0.80,  // primary this fast+auto opens the next table
  FOCUS_MAX_DAYS: 5,        // ... or after this many days of play on it (§13.3)
  DIVISION_OPEN_PCT: 0.50,
  DIVISION_OPEN_KNOWN_PCT: 0.70,   // ... or this share of the products correct twice in a row (§13.3)
  TABLE_PREREQ_PCT: 0.60,
  TABLE_REOPEN_PCT: 0.60,   // fast+auto share below this re-opens a table as focus
  SCOUT_SEED_FAST: 2,       // fast correct probes that seed a fact known
  SCOUT_TABLE_PROBES: 6, SCOUT_TABLE_PCT: 0.80,
  SCOUT_DECLINE: 3,
  BEYOND_OPEN_STEP: 10,     // the Beyond lane opens at the purple belt

  /* ---- the belt (rework 2026-09-10, sealed questions 2026-09-14) ----
     One belt per child, Brazilian jiu-jitsu: white, blue, purple, brown, black,
     four stripes on each before the next. It moves on sealed questions: a
     question is sealed once it has been answered fast on AUTO_DAYS counted days.
     Step n is reached at BELT_STEPS[n-1] questions sealed; steps 5, 10 and 15 are
     the blue, purple and brown belts, and step 19, brown's fourth stripe, opens the
     black belt test. The marks sit at 187 x (n/20)^2, 187 being every times and
     divide question, so they come closer together early. */
  BELT_STEPS: [1, 2, 5, 8, 12, 17, 23, 30, 38, 47, 57, 68, 79, 92, 105, 120, 135, 152, 169],
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
  LEVEL_BASE: 50, LEVEL_STEP: 75,     // level n -> n+1 needs BASE + STEP x n: 125, 200, 275... (ten-card rounds)
  COINS_PER_CORRECT: 1,     // every unaided right answer, fast or slow
  COINS_STRIPE: 10, COINS_BELT: 50,
  GHOST_MIN_ATTEMPTS: 3, GHOST_BEAT_MS: 100,   // "Your best time" on any answer this much faster, fast or not (§13.3)
  TEACH_TIMES: 3,           // each teaching line shows on this many separate occasions (§13.3)
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
  ROUND_ONE_CARDS: 5,           // round 1 is a normal round of this many cards; two of them run the placement (§13.3)
  PLACEMENT_ROUNDS: 2,          // timer-less rounds that run the placement behind them
  PLACEMENT_SCOUTS: 2,          // scout cards per round for tables the placement rounds ran out of cards for
  PLACEMENT_SAFETY: 1,          // quiet plus-and-minus checks per round, moved out of round 1
  PLACEMENT_RUNS: 8,            // ... for this many rounds, tables and the quiet checks taking turns

  /* ---- shop (PLAN §7.1). Nothing here touches play. Prices are set so a
     novice earning about ten sparks a run reaches the two big themes on day
     four to six, and so there are four to six things to want at every level. ---- */
  // Two papers are free and picked on first launch; everything below is stock.
  FREE_PAPERS: ['washi', 'night'],
  SHOP: [
    { id: 'theme:matcha',  kind: 'theme',  value: 'matcha',   price: 40,   level: 2 },   // the first paper is reachable on day one (§13.3)
    { id: 'theme:sakura',  kind: 'theme',  value: 'sakura',   price: 110,  level: 3 },
    { id: 'theme:kraft',   kind: 'theme',  value: 'kraft',    price: 150,  level: 5 },
    { id: 'theme:sumi',    kind: 'theme',  value: 'sumi',     price: 230,  level: 7 },
    { id: 'theme:kinpaku', kind: 'theme',  value: 'kinpaku',  price: 340, level: 10 },

    { id: 'skin:grain',    kind: 'skin',   value: 'grain',    price: 20,   level: 1 },
    { id: 'skin:grid',     kind: 'skin',   value: 'grid',     price: 50,  level: 2 },
    { id: 'skin:wave',     kind: 'skin',   value: 'wave',     price: 90,  level: 4 },
    { id: 'skin:hemp',     kind: 'skin',   value: 'hemp',     price: 160,  level: 6 },
    { id: 'skin:gilt',     kind: 'skin',   value: 'gilt',     price: 290, level: 10 },

    { id: 'ring:thin',     kind: 'ring',   value: 'thin',     price: 35,  level: 1 },
    { id: 'ring:double',   kind: 'ring',   value: 'double',   price: 75,  level: 3 },
    { id: 'ring:dotted',   kind: 'ring',   value: 'dotted',   price: 140,  level: 5 },
    { id: 'ring:gold',     kind: 'ring',   value: 'gold',     price: 260, level: 8 },

    { id: 'combo:ink',     kind: 'combo',  value: 'ink',      price: 30,  level: 1 },
    { id: 'combo:round',   kind: 'combo',  value: 'round',    price: 80,  level: 4 },
    { id: 'combo:gold',    kind: 'combo',  value: 'gold',     price: 210,  level: 7 },

    { id: 'sound:bell',    kind: 'sound',  value: 'bell',     price: 30,  level: 1 },
    { id: 'sound:wood',    kind: 'sound',  value: 'wood',     price: 65,  level: 2 },
    { id: 'sound:glass',   kind: 'sound',  value: 'glass',    price: 130,  level: 5 },
    { id: 'sound:deep',    kind: 'sound',  value: 'deep',     price: 240,  level: 8 },

    { id: 'mark:circle',   kind: 'mark',   value: 'circle',   price: 20,   level: 1 },
    { id: 'mark:triangle', kind: 'mark',   value: 'triangle', price: 20,   level: 1 },
    { id: 'mark:square',   kind: 'mark',   value: 'square',   price: 40,  level: 2 },
    { id: 'mark:diamond',  kind: 'mark',   value: 'diamond',  price: 70,  level: 3 },
    { id: 'mark:hex',      kind: 'mark',   value: 'hex',      price: 110,  level: 5 },
    { id: 'mark:star',     kind: 'mark',   value: 'star',     price: 180,  level: 7 },
    { id: 'mark:ring',     kind: 'mark',   value: 'ring',     price: 250,  level: 9 },
    { id: 'mark:cross',    kind: 'mark',   value: 'cross',    price: 375, level: 12 },
  ],

  /* ---- misc ---- */
  RUNS_KEPT: 200,
  FAST_WRONG_WINDOW_DAYS: 7,
};
