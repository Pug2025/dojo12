/* Dojo 12. Every string the player reads, and nothing player-facing lives
   anywhere else (PLAN §10.1). Rewritten for the rework on 10 September 2026:
   one belt, a seal on every question, coins, and round 1 played like any
   round. Ten questions a round and the seal came on 14 September. Canadian hybrid spelling. Two exclamation marks in the whole file, for
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

    /* ---- the one screen before round 1. Everything else is taught the first
       time it happens (2026-09-14). ---- */
    intro: {
      title: 'Times and divide, up to 12 × 12.',
      body: 'Type the answer and tap Go. Five cards a round. The first two rounds have no timer and work out where you start.',
      start: 'Start round 1',
    },

    /* ---- How it works, from Settings, any time ---- */
    howto: {
      title: 'How it works',
      sections: [
        ['The card', 'Type the answer and tap Go. Get one wrong and you can break it into smaller questions, or be shown the answer and type it.'],
        ['Fast', 'After you answer, the card shows how long you took. Questions you have answered before get a timer with a gold tick on it. Beat the tick and the time shows in red. That is fast. The tick starts where you are and moves in as you get quicker.'],
        ['Out of time', 'When the timer runs out the card stays up. Answer it and it still counts, though not as fast.'],
        ['The seal', 'Answer a question fast and it gets the outline of a seal. Answer it fast again on another day and the seal is stamped. A sealed question comes back now and then to check. Miss it and the seal comes off until you get it fast again.'],
        ['Your belt', 'Every question you seal moves your belt. A question that is fast once shows on the bar as a half mark. Four stripes on each belt, then the next colour: white, blue, purple, brown, black. The black belt is a test.'],
        ['The streak', 'Three right in a row and your points count 1.5 times, then 2, then 3. It carries from round to round. A rushed wrong answer drops it to nothing.'],
        ['A wrong answer', 'Get every step of Break it down right and you keep your streak. The question comes back a few cards later worth double. Show me costs the streak. The question comes back later as an ordinary card.'],
        ['Coins and levels', 'Every right answer pays a coin to spend in the Shop. Right answers also add XP, and each new level puts more in the Shop.'],
        ['The black tick', 'The small black tick on the timer is your best time on that question.'],
      ],
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
      titleN: n => 'Round ' + n + ' done.',
      start: keys => 'You start on ' + keys.map(k => tableName(k) + ', like ' + tableExample(k)).join(', and ') + '.',
      allOpen: 'Every table is open. The next rounds check what you know.',
      rest: 'The other tables come in as you play.',
      coins: 'Coins: one for every right answer. Spend them in the Shop.',
      xp: 'XP: every right answer adds some. Each new level puts more in the Shop.',
      play: 'Next round',
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
      comebackLabel: 'Comeback. Double points.',
      comebackWin: 'Got it back.',
      bonus: 'Bonus card. Triple points.',
      bonusLabel: 'Bonus',
      redemption: 'The ones you missed, with more time.',
      pb: 'Your best time',
      firstStreak: m => 'Three right in a row, so points count ' + m + ' times. Miss one and Break it down keeps the streak. Show me loses it.',
      firstTick: 'The small black tick is your best time on this question.',
      time: ms => secs(ms),
      firstStamp: "Fast. Get it fast again tomorrow and it's sealed.",
      firstSeal: 'Sealed. It comes back now and then to check.',
      lostSeal: id => factText(id, false) + ' lost its seal. Get it fast on another day to seal it again.',
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
      showAnswer: (id, flip) => {
        const f = D.facts.get(id);
        if (f && f.input === 'yesno') {
          const say = f.ans ? D.copy.beyond.yes : D.copy.beyond.no;
          return D.copy.beyond.question(f) + ' ' + say + '. Tap ' + say + ' to keep going.';
        }
        return factEquation(id, flip) + '. Type it to keep going.';
      },
    },

    /* ---- the end of a round ---- */
    summary: {
      points: 'points',
      best: n => 'Best ' + num(n),
      newBest: d => 'New best, ' + num(d) + ' more points',
      streak: (n, best) => 'Longest streak ' + n + (n >= best && best > 0 ? ', your best' : ''),
      sealed: list => 'Sealed: ' + list.join(', ') + '.',
      fastNew: n => 'Fast on ' + count(n, 'new question', 'new questions') + '.',
      unsealed: list => 'Lost a seal: ' + list.join(', ') + '.',
      gotBack: list => 'Missed, then got right: ' + list.join(', ') + '.',
      xp: n => '+' + num(n) + ' XP',
      coins: n => '+' + count(n, 'coin', 'coins'),
      levelUp: (n, names) => 'Level ' + n + '.' + (names && names.length ? ' New in the Shop: ' + names.join(', ') + '.' : ''),
      fastToday: n => 'Fast today: ' + n,
      bestTime: (id, ms, from) => factText(id, false) + ' in ' + secs(ms) + ', your best. Was ' + secs(from) + '.',
      coinsLine: (answers, bonus, belt) => {
        const parts = [];
        if (answers) parts.push(answers + ' for right answers');
        if (bonus) parts.push(bonus + ' for the bonus card');
        if (belt) parts.push(belt + ' for the belt');
        return '+' + count(answers + bonus + belt, 'coin', 'coins') + (parts.length > 1 ? '. ' + cap(parts.join(', ')) + '.' : '');
      },
      again: 'Next round',
      home: 'Home',
    },

    /* ---- the belt ---- */
    belt: {
      title: 'Belt',
      names: { white: 'White', blue: 'Blue', purple: 'Purple', brown: 'Brown', black: 'Black' },
      now: (belt, n) => beltName(belt, n),
      stripeTied: (belt, n) => 'Stripe ' + n + ' on your ' + belt + ' belt.',
      stripesTied: (belt, from, to) => 'Stripes ' + from + ' and ' + to + ' on your ' + belt + ' belt.',
      beltTied: belt => cap(belt) + ' belt!',
      blackBelt: 'Black belt!',
      toNext: info => info.nextKind === 'test' ? 'Your black belt test is open.'
        : 'Sealed ' + info.sealed + ' of ' + info.nextAt + ' for ' +
          (info.nextKind === 'belt' ? 'your ' + info.nextBelt + ' belt' : 'stripe ' + (info.stripes + 1)) + '.' +
          (info.outlined ? ' ' + info.outlined + (info.outlined === 1 ? ' is' : ' are') + ' fast once.' : ''),
      filled: n => 'You have sealed ' + count(n, 'question', 'questions') + '.',
      how: 'Every question you seal moves your belt. Four stripes, then the next colour.',
      testTitle: 'Black belt test',
      testRules: '24 questions from across the grid. Get 22 right, with 20 of them fast. No Break it down.',
      testLocked: 'Opens when your brown belt has four stripes.',
      far: n => 'That is ' + n + ' questions sealed.',
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
      sealed: n => count(n, 'question', 'questions') + ' sealed',
      best: n => 'Best round ' + num(n),
      working: (key, sealed, total, next, days) => 'Working on ' + tableName(key) + ', ' + sealed + ' of ' + total + ' sealed.' +
        (next ? ' ' + tableNameCap(next) + ' open ' + (days > 1 ? 'in ' + days + ' days.' : days === 1 ? 'tomorrow.' : 'next.') : ''),
      workingTwo: (a, sealed, total, b, next, days) => 'Working on ' + tableName(a) + ', ' + sealed + ' of ' + total + ' sealed, and ' + tableName(b) + '.' +
        (next ? ' ' + tableNameCap(next) + ' open ' + (days > 1 ? 'in ' + days + ' days.' : days === 1 ? 'tomorrow.' : 'next.') : ''),
      today: (rounds, fastNew, canSeal) => rounds
        ? 'Today: ' + count(rounds, 'round', 'rounds') + ', ' + fastNew + ' fast for the first time.' +
          (canSeal ? ' ' + count(canSeal, 'question', 'questions') + (canSeal === 1 ? ' is' : ' are') + ' ready to seal.' : '')
        : (canSeal ? count(canSeal, 'question', 'questions') + (canSeal === 1 ? ' is' : ' are') + ' ready to seal today.' : ''),
      nudge: (name, price, have) => name + ' is ' + count(price, 'coin', 'coins') + '. You have ' + num(have) + '.',
      xpline: (into, need) => num(into) + ' / ' + num(need) + ' XP',
      play: 'Play',
      carryOn: 'Keep going',
      grid: 'Grid', belt: 'Belt', shop: 'Shop', settings: 'Settings',
    },

    /* ---- the grid ---- */
    grid: {
      title: 'Grid',
      times: 'Times',
      divide: 'Divide',
      legend: { none: 'Not sealed', fast: 'Fast once', sealed: 'Sealed', unasked: 'Not asked yet' },
      empty: 'Play a round first.',
      rowsNote: 'A row shows up when its table opens.',
      divideNote: 'Each row divides by its number. Each column is the answer.',
      cell: (id, flip, state, best) => factText(id, flip) + ': ' +
        (state === 'sealed' ? 'sealed' : state === 'fast' ? 'fast once' : 'not sealed yet') +
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
      confirm: price => 'Tap again to buy for ' + count(price, 'coin', 'coins'),
      lockedRow: (level, price) => 'Level ' + level + ' · ' + count(price, 'coin', 'coins'),
      shortRow: (price, have) => count(price, 'coin', 'coins') + ' · ' + count(price - have, 'more', 'more'),
      owned: (n, total) => n + ' of ' + total,
      groups: { theme: 'Paper', skin: 'Card', ring: 'Timer', combo: 'Streak', sound: 'Sound', mark: 'Mark' },
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
        'combo:red': 'Red', 'combo:ink': 'Ink', 'combo:round': 'Round',
        'combo:gold': 'Gold',
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
      done: n => count(n, 'question', 'questions') + ' sealed.',
      improved: (id, flip, from, to) => 'Most improved: ' + factText(id, flip) + ', ' +
        secs(from) + ' to ' + secs(to) + '.',
      fastest: (id, flip, ms) => 'Fastest: ' + factText(id, flip) + ', ' + secs(ms) + '.',
      close: 'Play',
    },

    /* ---- settings ---- */
    settings: {
      title: 'Settings',
      howItWorks: 'How it works',
      sound: 'Sound',
      autoSubmit: 'Send without tapping Go',
      on: 'On',
      off: 'Off',
      paper: 'Paper',
      backup: 'Save a copy with Dad',
      backupNote: 'Puts a link in Messages. If this phone ever loses the game, the link brings it back.',
      backupHow: 'Pick Dad in Messages and send it.',
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
      changeName: 'Change name',
      saveName: 'Save',
      nameSaved: 'Name changed.',
      startOver: 'Start over',
      startOverAsk: 'Type RESET to start over. Everything this phone has saved for this player goes.',
      resetWord: 'RESET',
    },

    /* ---- the parent dashboard (PLAN §9.5). Jamie reads this one, not the
       kids, so it may use plain report words the game itself never uses. ---- */
    dash: {
      title: 'Dojo 12',
      belt: 'Belt',
      beltLine: (belt, n, sealed) => beltName(belt, n) + '. ' + count(sealed, 'question', 'questions') + ' sealed.',
      level: n => 'Level ' + n,
      coins: n => count(n, 'coin', 'coins'),
      coinsLabel: 'Coins',
      tableRow: (label, fast, total) => label + ': ' + fast + ' of ' + total + ' fast',
      working: 'Working on',
      week: 'This week',
      runsThisWeek: 'Rounds this week',
      doneThisWeek: 'Questions sealed',
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
