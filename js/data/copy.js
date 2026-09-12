/* Dojo 12. Every string the player reads, and nothing player-facing lives
   anywhere else (PLAN §10.1). Rewritten for the rework on 10 September 2026:
   one belt, two dots on every question, coins, and round 1 played like any
   round. Canadian hybrid spelling. Two exclamation marks in the whole file, for
   a new belt colour and for the black belt. The gate counts every one of those
   marks in this file, so nothing here uses the negation operator.
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
  function count(n, one, many) { return D.u.commas(n) + ' ' + (n === 1 ? one : many); }

  function tableName(key) { return key === 'sq' ? 'the squares' : 'the ' + plural(Number(key)); }
  function tableNameCap(key) { return cap(tableName(key)); }
  // One question out of a table, so "the squares" says what it means.
  function tableExample(key) {
    if (key === 'sq') return '7 × 7';
    if (Number(key) === 6) return '6 × 7';
    return key + ' × 6';
  }

  const num = n => D.u.commas(n);
  // Commas in the whole part only, so 0.0045 never becomes 0.0,045.
  function numx(n) {
    const t = String(n), i = t.indexOf('.');
    return i < 0 ? D.u.commas(t) : D.u.commas(t.slice(0, i)) + t.slice(i);
  }
  const secs = ms => D.u.seconds(ms);

  /* ---- one fact, written out ---- */
  function factText(id, flip) { return D.facts.display(id, flip); }
  function factEquation(id, flip) { return D.facts.equation(id, flip); }

  /* ---- the belt ---- */
  const BELTS = { white: 'white', blue: 'blue', purple: 'purple', brown: 'brown', black: 'black' };
  function stripeCount(n) { return n === 1 ? '1 stripe' : n + ' stripes'; }
  function beltName(belt, n) {
    return cap(BELTS[belt] || belt) + ' belt' + (n > 0 ? ', ' + stripeCount(n) : '');
  }

  /* ---- rescue step prompts (PLAN §6.7). Each returns the question the child
     types an answer to. The value just confirmed is substituted into the next
     one, so the chain reads the way a person would say it. ---- */
  const step = {
    double: n => 'Double ' + n + '?',
    groups: (n, of) => cap(word(n)) + ' ' + plural(of) + '?',
    zeroEnd: n => n + ' with a zero on the end?',
    half: n => 'Half of ' + n + '?',
    add: (x, y) => x + ' + ' + y + '?',
    sub: (x, y) => x + ' − ' + y + '?',
    div: (p, d) => p + ' ÷ ' + d + '?',
    mul: (a, b) => a + ' × ' + b + '?',
    mulSo: (a, b) => 'So ' + a + ' × ' + b + '?',
    divSo: (p, d) => 'So ' + p + ' ÷ ' + d + '?',
    whatTimes: (d, p) => 'What times ' + d + ' makes ' + p + '?',
    oneLess: n => 'One less than ' + n + '?',
    andWhatMake: (x, total) => x + ' and what make ' + total + '?',
    typeTwice: n => 'Type ' + n + ' twice.',
    tensThenZero: n => 'Ten ' + plural(n) + '. ' + n + ', then 0.',
    whatTimesUnder: (d, p) => 'How many ' + plural(d) + ' fit in ' + p + '?',
    biggestInto: (a, b) => 'Biggest number that goes into ' + a + ' and ' + b + '?',
    smallestBoth: (a, b) => 'Smallest number both ' + a + ' and ' + b + ' go into?',
    howManyOver: (m, n) => 'How many ' + plural(m) + ' to pass ' + n + '?',
  };

  /* The plain arithmetic behind a step, for when a step has to be shown:
     "7 × 10 is 70. Type 70 to keep going." */
  const label = {
    mul: (a, b) => a + ' × ' + b,
    add: (x, y) => x + ' + ' + y,
    sub: (x, y) => x + ' − ' + y,
    div: (p, d) => p + ' ÷ ' + d,
    half: n => 'Half of ' + n,
    addUnknown: x => x + ' + ?',
  };

  /* A table or a Beyond topic, by name. */
  function tableLabel(key) {
    if (String(key).indexOf('bey:') === 0) return (D.copy.beyond.topics[String(key).slice(4)] || key);
    return tableNameCap(key);
  }
  /* What each parent check means, in the words a parent would use. */
  const CHECK_NAMES = {
    thin: 'Questions with more counted days than answers',
    ahead: "Days dated after the phone's own day",
    xp: 'XP above what the answers could have paid',
    runs: 'More rounds in a day than a day holds',
    counts: 'More right answers than answers',
    belts: 'A black belt with no passed test on record',
    coins: 'Coins above what the answers and the belt could have paid',
    days: 'More days played than days since the save began',
  };

  return {
    word, plural, cap, count, tableName, tableNameCap, tableExample, tableLabel, beltName,
    factText, factEquation, num, secs, step, label,

    /* ---- install and first launch ---- */
    install: {
      line: 'Add this to your Home Screen so your progress saves.',
      how: 'Tap Share, then Add to Home Screen.',
    },
    first: {
      askName: "What's your name?",
      start: 'Start',
      nameNeeded: 'Type your name first.',
      haveSave: 'I have a saved game',
      pickPaper: 'Pick a paper.',
      paperNote: 'You can change it later in the Shop.',
    },

    /* ---- the three screens before round 1 ---- */
    intro: {
      card: 'Every card is a times or divide question, up to 12 × 12.',
      cardHow: 'Type the answer and tap Go.',
      timer: 'Some cards have a timer around them.',
      timerHow: 'Answer before it reaches the gold tick and the answer counts as fast. A question you have never answered has no timer yet.',
      dots: 'Every question has two dots.',
      dotsHow: 'A fast answer fills one, and the second has to wait for another day. Every dot you fill moves your belt, from white to black.',
      roundOne: 'Round 1 has no timer. It works out where you start.',
      next: 'Next',
      start: 'Start round 1',
    },

    /* ---- the placement questions inside round 1 (PLAN §6.6). Round 1 says
       nothing about a fast answer, so this line stays empty. ---- */
    tryout: {
      firstCard: 'Type the answer and tap Go.',
      hardWin: '',
    },

    /* ---- the end of round 1 ---- */
    roundOne: {
      title: 'Round 1 done.',
      start: keys => 'You start on ' + keys.map(k => tableName(k) + ' (' + tableExample(k) + ')').join(' and ') + '.',
      allOpen: 'Every table is open. The next rounds check what you know.',
      rest: 'The other tables come in as you play.',
      coins: 'Coins: one for every right answer. Spend them in the Shop.',
      xp: 'XP: every right answer adds some. Each new level puts more in the Shop.',
      play: 'Play round 2',
      home: 'Home',
    },

    /* ---- a round ---- */
    run: {
      go: 'Go',
      leave: 'Leave',
      leaveHold: 'Hold to leave. The round is kept for next time.',
      roundOne: 'Round 1',
      streak: n => 'streak ' + n,
      times: m => '× ' + m,
      lastCard: 'Last card. Double points.',
      outOfTime: 'Out of time.',
      overtime: 'Out of time. You can still answer.',
      slowDown: 'Slow down. Look at it properly.',
      comebackLabel: 'Comeback',
      comebackWin: 'Got it back.',
      bonus: 'Bonus card. Triple points.',
      bonusLabel: 'Bonus',
      redemption: 'The ones you missed, with more time.',
      pb: 'Your best time',
      firstStreak: m => 'Three right in a row, so points count ' + m + ' times. A miss drops it a step.',
      firstTick: 'The small black tick is your best time on this question.',
      firstDot: 'That filled a dot. The second one needs another day.',
      firstBoth: 'Both dots filled. It comes back in a few days to check.',
    },

    /* ---- rescue (PLAN §6.7) ---- */
    rescue: {
      button: 'Break it down',
      skip: 'Show me',
      first: 'Break it down turns this into smaller questions.',
      addedInstead: (a, b) => "That's " + a + ' plus ' + b + '. You need ' + word(a) + ' ' + plural(b) + '.',
      divSubtracted: (p, d) => "That's " + p + ' take away ' + d + '. You need how many ' + plural(d) + ' make ' + p + '.',
      stepValue: (question, value) => question + ' is ' + value + '. Type ' + value + ' to keep going.',
      done: 'Got it.',
      showAnswer: (id, flip) => factEquation(id, flip) + '. Type it to keep going.',
    },

    /* ---- the end of a round ---- */
    summary: {
      points: 'points',
      best: n => 'Best ' + num(n),
      newBest: d => 'New best (+' + num(d) + ')',
      streak: (n, best) => 'Longest streak ' + n + (best > n ? ' (best ' + best + ')' : ''),
      dots: n => count(n, 'dot', 'dots') + ' filled',
      done: list => 'Both dots: ' + list.join(', ') + '.',
      gotBack: list => 'Got back: ' + list.join(', ') + '.',
      xp: n => '+' + num(n) + ' XP',
      coins: n => '+' + count(n, 'coin', 'coins'),
      levelUp: n => 'Level ' + n + '.',
      again: 'Play again',
      home: 'Home',
    },

    /* ---- the belt ---- */
    belt: {
      title: 'Belt',
      names: { white: 'White', blue: 'Blue', purple: 'Purple', brown: 'Brown', black: 'Black' },
      now: (belt, n) => beltName(belt, n),
      stripeTied: (belt, n) => 'Stripe ' + n + ' on your ' + belt + ' belt.',
      beltTied: belt => cap(belt) + ' belt!',
      blackBelt: 'Black belt!',
      toNext: (dots, kind, belt) => kind === 'test' ? 'Your black belt test is open.'
        : count(dots, 'dot', 'dots') + ' to your ' + (kind === 'belt' ? belt + ' belt' : 'next stripe') + '.',
      filled: n => 'You have filled ' + count(n, 'dot', 'dots') + '.',
      how: 'Every dot you fill moves your belt. Four stripes, then the next colour.',
      testTitle: 'Black belt test',
      testRules: '24 questions from across the grid. Get 22 right, with 20 of them fast. No Break it down.',
      testLocked: 'Opens when your brown belt has four stripes.',
      testTaken: 'You took it today. Try again tomorrow.',
      start: 'Start the test',
      failCount: (got, total) => got + ' of ' + total + '. Try again tomorrow.',
      failSlow: (got, total, slow) => got + ' of ' + total + ', but ' + word(slow) +
        (slow === 1 ? ' was' : ' were') + ' too slow. Try again tomorrow.',
    },

    /* ---- home ---- */
    home: {
      level: n => 'Level ' + n,
      coins: n => count(n, 'coin', 'coins'),
      working: (key, next) => 'Working on ' + tableName(key) + '.' +
        (next ? ' ' + tableNameCap(next) + ' open after.' : ''),
      workingTwo: (a, b) => 'Working on ' + tableName(a) + ' and ' + tableName(b) + '.',
      play: 'Play',
      grid: 'Grid', belt: 'Belt', shop: 'Shop', settings: 'Settings',
    },

    /* ---- the grid ---- */
    grid: {
      title: 'Grid',
      times: 'Times',
      divide: 'Divide',
      legend: { none: 'No dots', one: 'One dot', both: 'Both dots', unasked: 'Not asked yet' },
      empty: 'Play a round first.',
      rowsNote: next => 'A row shows up when its table opens.' +
        (next ? ' Next up: ' + tableName(next) + '.' : ''),
      cell: (id, flip, dots, best) => factText(id, flip) + ': ' +
        (dots === 2 ? 'both dots' : dots === 1 ? 'one dot' : 'no dots') +
        (best ? '. Best time ' + secs(best) + '.' : '.'),
      cellUnasked: (id, flip) => factText(id, flip) + ': not asked yet.',
    },

    /* ---- the shop. Plain nouns. Nothing here changes how the game plays. ---- */
    shop: {
      title: 'Shop',
      coins: n => count(n, 'coin', 'coins'),
      price: n => count(n, 'coin', 'coins'),
      levelNeeded: n => 'Level ' + n,
      use: 'Use',
      inUse: 'In use',
      free: 'Free',
      tooDear: (price, have) => count(price, 'coin', 'coins') + '. You have ' + num(have) + '.',
      locked: n => 'This opens at level ' + n + '.',
      bought: 'Bought. It is in use now.',
      groups: { theme: 'Paper', skin: 'Card', ring: 'Timer', combo: 'Streak', sound: 'Sound', mark: 'Seal' },
      notes: {
        theme: 'Changes the whole look.',
        skin: 'The paper every card is printed on.',
        ring: 'How the timer is drawn.',
        combo: 'The streak mark at the top of a round.',
        sound: 'The sound of a right answer.',
        mark: 'Sits beside your name.',
      },
      names: {
        'theme:washi': 'Rice paper', 'theme:night': 'Night',
        'theme:matcha': 'Green tea', 'theme:sakura': 'Blossom', 'theme:kraft': 'Brown paper',
        'theme:sumi': 'Charcoal', 'theme:kinpaku': 'Gold leaf',
        'skin:plain': 'Plain', 'skin:grain': 'Grain', 'skin:grid': 'Squares', 'skin:wave': 'Waves',
        'skin:hemp': 'Stars', 'skin:gilt': 'Gold edge',
        'ring:brush': 'Brush', 'ring:thin': 'Pen', 'ring:double': 'Double', 'ring:dotted': 'Dotted',
        'ring:gold': 'Gold',
        'combo:red': 'Red seal', 'combo:ink': 'Ink seal', 'combo:round': 'Round seal',
        'combo:gold': 'Gold seal',
        'sound:plain': 'Tick', 'sound:bell': 'Bell', 'sound:wood': 'Wood', 'sound:glass': 'Glass',
        'sound:deep': 'Drum',
        'mark:circle': 'Circle', 'mark:triangle': 'Triangle', 'mark:square': 'Square',
        'mark:diamond': 'Diamond', 'mark:hex': 'Hexagon', 'mark:star': 'Star',
        'mark:ring': 'Ring', 'mark:cross': 'Cross',
      },
    },

    /* ---- the Beyond lane (PLAN §6.9). Grade 6 vocabulary, said plainly. ---- */
    beyond: {
      title: 'Beyond',
      question(f) {
        switch (f.kind) {
          case 'square': return f.a + '²';
          case 'cube': return f.a + '³';
          case 'mul': return f.a + ' × ' + f.b;
          case 'divrem': return f.a + ' ÷ ' + f.b;
          case 'divis': return 'Is ' + f.a + ' a multiple of ' + f.b + '?';
          case 'gcf': return 'Biggest number that goes into ' + f.a + ' and ' + f.b + '?';
          case 'lcm': return 'Smallest number both ' + f.a + ' and ' + f.b + ' go into?';
          case 'prime': return 'Is ' + f.a + ' prime?';
          case 'next': return 'Next multiple of ' + f.b + ' after ' + f.a + '?';
          case 'frac': return f.a + '/' + f.b + ' of ' + f.c + '?';
          case 'pct': return f.a + ' % of ' + f.b + '?';
          case 'dec': return numx(f.a) + (f.form === 'x' ? ' × ' : ' ÷ ') + num(f.b);
          case 'ops':
            if (f.form === 1) return f.a + ' + ' + f.b + ' × ' + f.c;
            if (f.form === 2) return '(' + f.a + ' + ' + f.b + ') × ' + f.c;
            if (f.form === 3) return f.a + ' − ' + f.b + ' ÷ ' + f.c;
            if (f.form === 4) return f.a + ' × ' + f.b + ' − ' + f.c;
            return f.a + ' ÷ (' + f.b + ' + ' + f.c + ')';
          default: return String(f.a);
        }
      },
      equation(f) {
        const q = D.copy.beyond.question(f).replace(/\?$/, '');
        if (f.input === 'yesno') return q + ' ' + (f.ans ? D.copy.beyond.yes : D.copy.beyond.no);
        if (f.input === 'remainder') return q + ' = ' + f.ans + ' r ' + f.ans2;
        return q + ' = ' + numx(f.ans);
      },
      yes: 'Yes',
      no: 'No',
      remainder: 'r',
      point: '.',
      topics: {
        sq: 'Squares and cubes', easy2d: 'Round numbers', mul2x1: 'Two digits by one',
        divrem: 'Remainders', divis: 'Multiples', factors: 'Factors',
        frac: 'Fractions of amounts', pct: 'Percentages', dec10: 'Tens, hundreds and thousands',
        mul2x2: 'Two digits by two', ops: 'Order of operations',
      },
    },

    /* ---- the week's recap, after the first round of a new week ---- */
    recap: {
      title: 'Last week.',
      done: n => count(n, 'question', 'questions') + ' got both dots.',
      improved: (id, flip, from, to) => 'Most improved: ' + factText(id, flip) + ', ' +
        secs(from) + ' to ' + secs(to) + '.',
      fastest: (id, flip, ms) => 'Fastest: ' + factText(id, flip) + ', ' + secs(ms) + '.',
      close: 'Play',
    },

    /* ---- settings ---- */
    settings: {
      title: 'Settings',
      sound: 'Sound',
      autoSubmit: 'Send without tapping Go',
      on: 'On',
      off: 'Off',
      paper: 'Paper',
      backup: 'Send Dad a copy',
      backupHow: 'Pick Dad in Messages and send it. If this phone ever loses the game, his copy brings it back.',
      copied: 'Link copied. Paste it into a message to Dad.',
      saveFile: 'Save a file instead',
      forDad: 'For Dad',
      forDadHold: 'Hold for two seconds',
      clockMoved: day => 'Clock moved. No new days until ' + D.u.longDate(day) + '.',
      updated: 'Updated.',
      back: 'Back',
    },

    /* ---- the parent's corner of Settings ---- */
    forDad: {
      title: 'For Dad',
      dashboard: 'What Dad sees',
      restore: 'Bring back a saved game',
      paste: 'Paste the link here',
      bringBack: 'Bring it back',
      openFile: 'Open a saved file',
      restoreOlder: "That copy is older than this phone's game.",
      restoreBad: "That did not open a saved game.",
      restoreDone: 'Brought back. No belt test today.',
      reset: 'Wipe this phone',
      resetAsk: 'Type RESET to wipe everything on this phone.',
      resetWord: 'RESET',
      resetGo: 'Wipe it',
    },

    /* ---- the parent dashboard (PLAN §9.5). Jamie reads this one, not the
       kids, so it may use plain report words the game itself never uses. ---- */
    dash: {
      title: 'Dojo 12',
      belt: 'Belt',
      beltLine: (belt, n, dots) => beltName(belt, n) + '. ' + count(dots, 'dot', 'dots') + ' filled.',
      level: n => 'Level ' + n,
      coins: n => count(n, 'coin', 'coins'),
      coinsLabel: 'Coins',
      tableRow: (label, fast, total) => label + ': ' + fast + ' of ' + total + ' fast',
      working: 'Working on',
      week: 'This week',
      runsThisWeek: 'Rounds this week',
      doneThisWeek: 'Questions that got both dots',
      restores: 'Restores this week',
      fastWrongs: 'Fast wrong answers, last 7 days',
      daysPlayed: 'Days played',
      products: 'Times',
      divisions: 'Divide',
      tests: 'Black belt tests',
      testRow: (day, passed, correct, total, testMs, runMs) => D.u.longDate(day) + '. ' +
        (passed ? 'Passed, ' : 'Not passed, ') + correct + ' of ' + total +
        (testMs ? ', ' + secs(testMs) + ' a card in the test' : '') +
        (runMs ? ', ' + secs(runMs) + ' in rounds that week.' : '.'),
      checks: 'Checks',
      checksOk: 'The numbers add up.',
      checksBad: 'Some numbers do not add up.',
      checkLine: (id, n) => (CHECK_NAMES[id] || id) + ': ' + n + '.',
      skew: 'Phone clock',
      clockAhead: mins => 'The phone clock is ' + mins + ' min ahead of this one.',
      clockOk: 'The phone clock is not ahead of this one.',
      lastPlayed: day => 'Last played ' + D.u.longDate(day) + '.',
      placement: n => 'Tables still to place from round 1: ' + n + '.',
      noData: 'Nothing to show yet.',
      hot: ids => ids.map(id => factText(id, false)).join(', '),
      paste: 'Paste the link here.',
      openFile: 'Open a file',
      open: 'Open',
    },
  };
})();
