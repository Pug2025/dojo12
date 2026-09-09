/* Dojo 12. Every string the player reads. Nothing player-facing lives anywhere
   else (PLAN.md §10.1). The approved lines in PLAN.md §10.5 are copied here
   exactly; to change one, change the plan first, then this file, then log it.
   Canadian hybrid spelling. Two exclamation marks in the whole file, and they
   are spoken for: the belt test pass and grandmaster.
   The house rule is silence. If a moment is not here, it has no text. */
"use strict";
D.copy = (function () {

  /* ---- number words. Factors are words inside a step prompt, results are
     numerals, which is how a person says it out loud. ---- */
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
                'nine', 'ten', 'eleven', 'twelve'];
  const PLURALS = ['zeros', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'sevens',
                   'eights', 'nines', 'tens', 'elevens', 'twelves'];
  function word(n) { return ONES[n] || String(n); }
  function plural(n) { return PLURALS[n] || (n + 's'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function tableName(key) { return key === 'sq' ? 'the squares' : 'the ' + plural(Number(key)); }
  function tableNameCap(key) { return cap(tableName(key)); }

  const num = n => D.u.commas(n);
  const secs = ms => D.u.seconds(ms);

  /* ---- one fact, written out ---- */
  function factText(id, flip) { return D.facts.display(id, flip); }
  function factEquation(id, flip) { return D.facts.equation(id, flip); }

  /* ---- rescue step prompts (PLAN §6.7). Each returns the question the child
     types an answer to. The value the child just confirmed is substituted into
     the next one, so the chain reads the way a person would say it. ---- */
  const step = {
    double: n => 'Double ' + n + '?',
    groups: (count, of) => cap(word(count)) + ' ' + plural(of) + '?',
    zeroEnd: n => n + ' with a zero on the end?',
    half: n => 'Half of ' + n + '?',
    add: (x, y) => x + ' + ' + y + '?',
    sub: (x, y) => x + ' − ' + y + '?',
    mul: (a, b) => a + ' × ' + b + '?',
    mulSo: (a, b) => 'So ' + a + ' × ' + b + '?',
    divSo: (p, d) => 'So ' + p + ' ÷ ' + d + '?',
    whatTimes: (d, p) => 'What times ' + d + ' makes ' + p + '?',
    oneLess: n => 'One less than ' + n + '?',
    andWhatMake: (x, total) => x + ' and what make ' + total + '?',
    typeTwice: n => 'Type ' + n + ' twice.',
    tensThenZero: n => 'Ten ' + plural(n) + '. ' + n + ', then 0.',
  };

  /* The plain arithmetic behind a step, used when a step has to be shown:
     "7 × 10 is 70. Type 70." */
  const label = {
    mul: (a, b) => a + ' × ' + b,
    add: (x, y) => x + ' + ' + y,
    sub: (x, y) => x + ' − ' + y,
    div: (p, d) => p + ' ÷ ' + d,
    half: n => 'Half of ' + n,
    addUnknown: x => x + ' + ?',
  };

  return {
    word, plural, cap, tableName, tableNameCap, factText, factEquation, num, secs, step, label,

    /* ---- install and first launch (PLAN §7.1) ---- */
    install: {
      line: 'Add this to your Home Screen so it saves properly.',
      how: 'Tap Share, then Add to Home Screen.',
    },
    firstLaunch: {
      askName: "What's your name?",
      nameGo: 'Start',
      themeTitle: 'Pick a look.',
    },
    profilePick: 'Who is playing?',

    /* ---- tryout (PLAN §6.6) ---- */
    tryout: {
      intro: 'Two minutes. Then you play.',
      firstCard: 'Type the answer.',
      hardWin: "That one's yours.",
      // Ends with a short list, never a board reveal.
      end: (openKeys, nextKey) => {
        const open = 'Open: ' + openKeys.map(k => tableName(k).replace(/^the /, '')).join(', ') + '.';
        return nextKey ? open + ' Next: ' + tableName(nextKey).replace(/^the /, '') + '.' : open;
      },
      play: 'Play',
    },

    /* ---- the run (PLAN §7.1, §7.2) ---- */
    run: {
      go: 'Go',
      lastCard: 'Last card. Double.',
      outOfTime: 'Out of time.',
      slowDown: 'Slow down. Look at it properly.',
      comebackLabel: 'Comeback',
      comebackWin: 'Got it back.',
      bonus: 'Bonus.',
      redemption: 'The ones you missed. No rush.',
      // The one earned line a run may show, at most once.
      earned: (id, flip, ms) => factText(id, flip) + '. ' + secs(ms) + ". That one's yours.",
      pb: 'PB',
    },

    /* ---- rescue (PLAN §6.7) ---- */
    rescue: {
      button: 'Rescue',
      skip: 'Skip',
      first: 'Rescue. You type the steps. The answer is yours.',
      addedInstead: (a, b) => 'That is ' + a + ' plus ' + b + '. You need ' + word(a) + ' ' + plural(b) + '.',
      divSubtracted: (p, d) => 'That is ' + p + ' take away ' + d + '. You need how many ' + plural(d) + ' make ' + p + '.',
      stepValue: (question, value) => question + ' is ' + value + '. Type ' + value + ' to advance.',
      done: 'Got it.',
      showAnswer: (id, flip) => factEquation(id, flip) + '. Type it to advance.',
    },

    /* ---- run summary (PLAN §7.1) ---- */
    summary: {
      best: n => 'Best ' + num(n),
      newBest: d => 'New best (+' + num(d) + ')',
      gold: list => 'Gold: ' + list.join(', ') + '.',
      gotBack: list => 'Got back: ' + list.join(', ') + '.',
      nextTest: (key, n) => tableNameCap(key) + ': ' + n + ' ' + (n === 1 ? 'fact' : 'facts') + ' from the test.',
      nextTestOpen: key => tableNameCap(key) + ': test open.',
      nextTable: key => 'Next: ' + tableName(key).replace(/^the /, '') + '.',
      xp: n => '+' + num(n) + ' XP',
      sparks: n => '+' + num(n) + ' sparks',
      again: 'Play again',
      home: 'Home',
    },

    /* ---- home (PLAN §7.1) ---- */
    home: {
      level: n => 'Level ' + n + '.',
      table: (key, fast, total) => tableNameCap(key) + '. ' + fast + ' of ' + total + ' fast.',
      runsToday: n => 'Runs today: ' + n,
      daysPlayed: n => 'Days played: ' + n + '.',
      play: 'Play',
      grid: 'Grid', belts: 'Belts', shop: 'Shop', settings: 'Settings',
      week: 'This week',
      weekBonus: 'sparks. 5 days this week.',
      daysBonus: n => n + ' days.',
      plusSparks: n => '+' + num(n) + ' ',
    },

    /* ---- belts (PLAN §7.1) ---- */
    belts: {
      title: 'Belts',
      yellow: key => 'Yellow belt. ' + tableNameCap(key) + '.',
      orange: key => 'Orange belt. ' + tableNameCap(key) + '.',
      testOpen: key => 'Test open. ' + tableNameCap(key) + '.',
      count: (fast, total) => fast + ' of ' + total + ' fast',
      offer: key => 'Belt Test. ' + tableNameCap(key) + '. 24 cards, 22 to pass, no rescues, quick.',
      start: 'Start',
      pass: key => 'Black belt. ' + tableNameCap(key) + ' are yours!',
      failCount: (got, total) => got + ' of ' + total + '. Same test tomorrow.',
      failSlow: (got, total, slow) => got + ' of ' + total + ', too slow on ' + word(slow) + '. Same test tomorrow.',
      grandmaster: 'Grandmaster. All 66, both ways!',
      colours: { white: 'White', yellow: 'Yellow', orange: 'Orange', black: 'Black' },
    },

    /* ---- grid (PLAN §7.1) ---- */
    grid: {
      title: 'Grid',
      changed: 'Changed this week',
      full: 'All of it',
      products: 'Times',
      divisions: 'Divided',
      empty: 'Play a run first.',
      cellHistory: (id, flip, best) => factText(id, flip) + '. Best ' + secs(best) + '.',
      cellNoTime: (id, flip) => factText(id, flip) + '.',
      states: { learning: 'Learning', known: 'Known', fast: 'Fast', auto: 'Gold' },
    },

    /* ---- shop (PLAN §7.1). Plain nouns. Nothing here changes how the game
       plays, and nothing here is a joke. ---- */
    shop: {
      title: 'Shop',
      sparks: n => num(n) + ' sparks',
      price: n => num(n),
      owned: 'Owned',
      equipped: 'On',
      levelNeeded: n => 'Level ' + n,
      buy: 'Buy',
      equip: 'Wear',
      groups: { theme: 'Colours', skin: 'Card', ring: 'Ring', combo: 'Combo',
                sound: 'Sound', mark: 'Mark' },
      names: {
        'theme:dojo': 'Dojo',
        'theme:space': 'Space', 'theme:animals': 'Animals', 'theme:neon': 'Neon',
        'theme:paper': 'Paper',
        'skin:mat': 'Mat', 'skin:weave': 'Weave', 'skin:carbon': 'Carbon',
        'skin:wave': 'Wave', 'skin:sun': 'Sun',
        'ring:gold': 'Gold', 'ring:ice': 'Ice', 'ring:split': 'Split', 'ring:mono': 'Mono',
        'combo:bar': 'Bar', 'combo:ladder': 'Ladder', 'combo:halo': 'Halo',
        'sound:bell': 'Bell', 'sound:wood': 'Wood', 'sound:glass': 'Glass', 'sound:deep': 'Deep',
        'mark:circle': 'Circle', 'mark:triangle': 'Triangle', 'mark:square': 'Square',
        'mark:diamond': 'Diamond', 'mark:hex': 'Hexagon', 'mark:star': 'Star',
        'mark:ring': 'Ring', 'mark:cross': 'Cross',
      },
    },

    /* ---- weekly recap (PLAN §7.1) ---- */
    recap: {
      title: 'This week.',
      gold: n => 'Gold: ' + n + ' ' + (n === 1 ? 'fact' : 'facts') + '.',
      improved: (id, flip, from, to) => 'Most improved: ' + factText(id, flip) + ', ' + secs(from) + ' to ' + secs(to) + '.',
      fastest: (id, flip, ms) => 'Fastest fact: ' + factText(id, flip) + ', ' + secs(ms) + '.',
      close: 'Play',
    },

    /* ---- settings, backup, restore (PLAN §7.1, §9.5) ---- */
    settings: {
      title: 'Settings',
      sound: 'Sound',
      theme: 'Look',
      backup: 'Back up to Dad.',
      backupNudge: 'New belt. Back it up.',
      dashboard: 'What Dad sees',
      restore: 'Restore',
      restoreOlder: "That backup is older than this phone's save.",
      restoreDone: 'Restored. No belt tests today.',
      reset: 'Reset',
      resetAsk: 'Type RESET to wipe everything on this phone.',
      resetWord: 'RESET',
      copyLink: 'Copy link',
      copied: 'Copied',
      shareFile: 'Save a file',
      autoSubmit: 'Send at the last digit',
      clockMoved: day => 'Clock moved. No new days until ' + D.u.longDate(day) + '.',
      updated: 'Updated.',
      back: 'Back',
    },

    /* ---- parent dashboard (PLAN §9.5). Jamie reads this one, not the kids,
       so it may use plain report words the game itself never uses. ---- */
    dash: {
      title: 'Dojo 12',
      nextUp: 'Working on',
      belts: 'Belts',
      products: 'Times',
      divisions: 'Divided',
      week: 'This week',
      daysPlayed: 'Days played',
      golds: 'Gold facts',
      improved: 'Most improved',
      testMedian: 'Belt test speed',
      runMedian: 'Run speed',
      restores: 'Restores this week',
      skew: 'Phone clock',
      checks: 'Checks',
      checksOk: 'Everything reconciles.',
      checksBad: 'Something does not reconcile.',
      paste: 'Paste the link here.',
      openFile: 'Open a file',
      noData: 'Nothing to show yet.',
      fastWrongs: 'Fast wrong answers, last 7 days',
    },
  };
})();
