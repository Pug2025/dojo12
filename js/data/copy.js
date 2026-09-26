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
  // "a, b and c", the way a person lists things out loud.
  function andList(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function tableName(key) { return key === 'sq' ? 'the squares' : 'the ' + plural(Number(key)); }
  function tableNameCap(key) { return cap(tableName(key)); }
  // The squares carry an example wherever Home names them, so a child can find them
  // ("where are the squares?", fresh playtest 2026-09-24).
  function tableNameLong(key) { return key === 'sq' ? 'the squares, like 7 × 7' : tableName(key); }
  // When the next table opens, counted in days of play (scheduler.nextOpening). A day
  // counts once its first round is played, so on the last day it opens after that
  // round: "tomorrow" on the morning it opened was wrong by the afternoon. "Within",
  // because a table that gets fast opens sooner (2026-09-24).
  function opensWhen(o) {
    if (o.days === 0) return 'next';
    if (o.nextRound) return 'after your next round';
    return 'within ' + count(o.days, 'more day', 'more days') + ' of play';
  }
  // One question out of a table, so "the squares" says what it means.
  function tableExample(key) {
    if (key === 'sq') return '7 × 7';
    if (Number(key) === 6) return '6 × 7';
    return key + ' × 6';
  }

  const num = n => D.u.commas(n);
  /* The day and the time, the way a person writes them in Canada: "Saturday 26 September"
     and "4:12 p.m." (the day's painting, PLAN §15, 2026-09-26). */
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayName(dayKey) {
    return WEEKDAYS[new Date(dayKey + 'T12:00:00').getDay()] + ' ' + D.u.longDate(dayKey);
  }
  function clockTime(ms) {
    const t = new Date(ms), h = t.getHours();
    return (h % 12 || 12) + ':' + String(t.getMinutes()).padStart(2, '0') + (h < 12 ? ' a.m.' : ' p.m.');
  }
  // A sentence that ends on "p.m." takes no second period.
  function stop(s) { return /\.$/.test(s) ? s : s + '.'; }
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
    // One number, the digit written twice: "Type 2 twice." read as type 2, Go, then 2 again (2026-09-24).
    typeTwice: n => n + ' next to ' + n + '?',
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
    return cap(tableNameLong(key));
  }
  /* ---- the shop's stock, and what kind of thing each one is ---- */
  const NAMES = {
    'theme:washi': 'Rice paper', 'theme:night': 'Night',
    'theme:matcha': 'Green tea', 'theme:sakura': 'Blossom', 'theme:kraft': 'Brown paper',
    'theme:sumi': 'Charcoal', 'theme:kinpaku': 'Gold leaf',
    // "Grid", not "Squares": beside the Square mark and the square numbers it was a third
    // thing called square (2026-09-24).
    'skin:plain': 'Plain', 'skin:grain': 'Grain', 'skin:grid': 'Grid', 'skin:wave': 'Waves',
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
  };
  // Every name says what kind of thing it is (2026-09-24): "Blossom, Double, Diamond"
  // meant nothing on a level-up. A name that already ends in its kind keeps it once, so
  // it is "Brown paper" and never "Brown paper paper".
  const KIND = { theme: 'paper', skin: 'card', ring: 'timer', combo: 'streak mark', sound: 'sound', mark: 'mark' };
  const KIND_A = { theme: 'a paper', skin: 'a card pattern', ring: 'a timer', combo: 'a streak mark',
                   sound: 'a sound', mark: 'a mark for your name' };
  function kindOf(id) { return String(id).split(':')[0]; }
  function itemName(id) {
    const name = NAMES[id] || String(id), kind = KIND[kindOf(id)];
    if (kind === undefined) return name;
    const low = name.toLowerCase();
    return low === kind || low.endsWith(' ' + kind) ? name : name + ' ' + kind;
  }

  /* What each parent check means, in the words a parent would use. */
  const CHECK_NAMES = {
    thin: 'Questions with more counted days than answers',
    ahead: "Days dated after the phone's own day",
    xp: 'More paid than the right answers could earn',
    runs: 'More rounds in a day than a day holds',
    counts: 'More right answers than answers',
    belts: 'A black belt with no passed test on record',
    coins: 'Coins above what the answers and the belt could have paid',
    days: 'More days played than days since the save began',
  };

  return {
    word, plural, cap, count, andList, tableName, tableNameCap, tableNameLong, tableExample, tableLabel, beltName,
    factText, factEquation, num, secs, step, label, itemName, dayName, clockTime,

    /* ---- install and first launch ---- */
    install: {
      // The game's name under its mark, on the install and name screens (2026-09-24).
      name: 'Dojo 12',
      line: 'Add this to your Home Screen so your progress saves.',
      how: 'Tap Share, then Add to Home Screen.',
    },
    first: {
      askName: "What's your name?",
      start: 'Start',
      nameNeeded: 'Type your name first.',
      haveSave: 'I have a saved game',
      pickPaper: 'Pick a paper.',
      paperWhy: "It's the colour of the whole game.",
      paperNote: 'You can change it later in the Shop.',
    },

    /* ---- the one screen before round 1. It says what the game is for; the rest
       is taught the first time it happens (2026-09-14, 2026-09-24). ---- */
    intro: {
      title: 'Times and divide, up to 12 × 12.',
      body: "Type the answer and tap Go. Five cards a round. Answer a question fast on two different days and it's sealed. Every question you seal moves your belt. The first two rounds have no timer and work out where you start.",
      start: 'Start round 1',
    },

    /* ---- How it works: five panels, from the ? on Home and from Settings. Each
       sentence was checked against the engine on 2026-09-24; the nine sections before
       them said seven things the game does not do (fresh playtest). ---- */
    howto: {
      title: 'How it works',
      sections: [
        ['The card', "Type the answer and tap Go. A question you've been getting right gets a timer. Beat its gold mark and that's fast. A red time means it counted toward a seal. The small tick is your best time."],
        ['The seal', "The first red time on a question puts it halfway. A red time on another day seals it, and a sealed question comes back now and then to check. A miss takes a question back a step, and so does getting slow at a sealed one. Your belt keeps its place."],
        ['Your belt', 'Every question you seal moves your belt. Four stripes on each belt, then the next colour: white, blue, purple, brown, black. The fourth stripe on brown opens the black belt test.'],
        ['The streak', 'Three right in a row and your points count 1.5 times, six makes it 2 times and nine makes it 3. The streak carries into the next round. Going Home ends it, and so does a quick wrong guess, even if you break it down after. After any other miss, Break it down with every step right keeps it. Show me loses it.'],
        ['Points, coins and your level', 'Points are for beating your best round. Fast answers and a streak score more. Coins buy things in the Shop. Every right answer pays one, but not after Break it down or Show me. Your level goes up by one on every day you finish your training, and new levels put more in the Shop.'],
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
      // Once, at the end of round 2: what this round paid, then what the child has.
      coins: (got, have) => (got ? 'You got ' + count(got, 'coin', 'coins') + ', one for each right answer.'
        : 'You get a coin for each right answer.') + (have ? ' You have ' + num(have) + '.' : '') + ' Spend them in the Shop.',
      // "New levels", not "each new level": level 11 and the levels after 12 add nothing.
      level: target => 'Finish ' + target + ' rounds in a day and your level goes up. New levels open more of the Shop.',
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
      // A wrong answer typed too fast to be anything but a guess. The streak part is
      // said only when there was a streak to lose (review 2026-09-24).
      quickGuess: lost => 'Too quick. That was a guess' + (lost ? ', so the streak is gone.' : '.'),
      quickAgain: 'Too quick again. Break this one down.',
      // A slip on a settled question: the digits come off and the card waits.
      lookAgain: 'Look again.',
      comebackLabel: 'Comeback. Double points.',
      // A comeback after a near miss or a guess pays single points, so it says nothing about double.
      comebackPlain: 'Comeback.',
      comebackWin: 'Got it back.',
      bonus: 'Bonus card. Triple points.',
      bonusLabel: 'Bonus',
      redemption: 'The ones you missed, with more time.',
      pb: 'Your best time',
      // Every step at once, so the line is true at whatever streak it shows (review 2026-09-24).
      firstStreak: 'Three in a row: points count 1.5 times. Six: 2 times. Nine: 3 times.',
      // No colour named: on the Night and Charcoal papers the tick is drawn in light ink.
      firstTick: 'The small tick is your best time on this question.',
      time: ms => secs(ms),
      firstStamp: "Fast. Get it fast again on another day and it's sealed.",
      firstSeal: 'Sealed. It comes back now and then to check.',
      lostSeal: id => factText(id, false) + ' lost its seal. Get it fast on another day to seal it again.',
    },

    /* ---- rescue (PLAN §6.7) ---- */
    rescue: {
      button: 'Break it down',
      skip: 'Show me',
      first: 'Break it down turns this into smaller questions.',
      // The same, when there is a streak on the line. Never after a quick guess, which has
      // already cost it.
      firstKeep: 'Break it down turns this into smaller questions. Get them all right and you keep your streak.',
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
    /* Every number says what it is (2026-09-24): "+4 coins · 13 coins" never said
       which was new and which was the total. Questions are written the way their
       card showed them. */
    summary: {
      points: 'points',
      best: n => 'Best round ' + num(n),
      // "New best, 12 more points" read as twelve still to go.
      newBest: d => 'New best round, ' + num(d) + ' points more than before.',
      streak: (n, best) => 'Longest streak ' + n + (n >= best && best > 0 ? ', your best' : ''),
      sealed: list => 'Sealed: ' + list.join(', ') + '.',
      // Named, so the list can be checked against the red times ("Fast today: 1" never matched them).
      halfwayToday: (list, more) => 'Halfway today: ' + list.join(', ') + (more ? ' and ' + more + ' more' : '') + '.',
      // The belt counts every question ever sealed (§13.3), so it holds its place.
      unsealed: list => (list.length > 1 ? andList(list) + ' lost their seals.' : list[0] + ' lost its seal.') +
        ' Your belt keeps its place.',
      gotBack: list => (list.length > 1 ? 'Got them back: ' : 'Got it back: ') + list.join(', ') + '.',
      levelUp: (n, ids) => 'Level ' + n + '.' + (ids && ids.length ? ' New in the Shop: ' + ids.map(itemName).join(', ') + '.' : ''),
      bestTime: (id, ms, from, flip) => factText(id, flip) + ' in ' + secs(ms) + ', your best. Was ' + secs(from) + '.',
      // What this round paid, from where, then what the child has. Each source is named
      // for what happened: two stripes are "the stripes", never "the belt".
      coinsLine: (answers, bonus, events, have) => {
        const evs = events || [];
        const of = kind => evs.filter(e => e.kind === kind);
        const paid = list => list.reduce((n, e) => n + (e.coins || 0), 0);
        const stripes = of('stripe'), belts = of('belt');
        const parts = [];
        if (answers) parts.push(answers === 1 ? '1 for a right answer' : answers + ' for right answers');
        if (bonus) parts.push(bonus + ' for the bonus card');
        if (stripes.length) parts.push(paid(stripes) + (stripes.length > 1 ? ' for the stripes' : ' for the stripe'));
        if (belts.length) parts.push(paid(belts) + (belts.length > 1 ? ' for the belts' : ' for the belt'));
        const got = answers + bonus + paid(stripes) + paid(belts);
        if (got === 0) return 'You have ' + count(have, 'coin', 'coins') + '.';
        const why = parts.length > 1 ? ': ' + andList(parts) : answers ? '' : ' ' + parts[0].replace(/^[0-9,]+ /, '');
        return 'You got ' + count(got, 'coin', 'coins') + why + '. You have ' + num(have) + '.';
      },
      // A table that opened, and the ones that stepped out of the two being worked on.
      // A table that left the list with nothing said read as dropped unfinished.
      tables: (opened, left) => {
        const out = [];
        if (opened.length) {
          const named = opened.map(k => tableName(k) + ', like ' + tableExample(k) + ',');
          const said = named.length > 1 ? named.slice(0, -1).join(' ') + ' and ' + named[named.length - 1] : named[0];
          out.push(cap(said) + ' are open now.');
        }
        if (left.length) out.push(cap(andList(left.map(tableName))) + ' come up less often.');
        return out.join(' ');
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
      // What is left, never a fraction (2026-09-24): "Sealed 4 of 5" counted from zero
      // and sat over a bar counted from the last stripe. The bar (D.belt.bar) shows the
      // same seals still to come.
      toNext: info => {
        if (info.nextKind === 'test') return info.testOpen ? 'Your black belt test is open.' : 'Your black belt test opens again tomorrow.';
        const left = info.left || Math.max(1, info.nextAt - info.sealed);
        const head = info.step === 0 ? 'Seal ' + count(left, 'question', 'questions') + ' for your first stripe.'
          : count(left, 'more seal', 'more seals') + ' for ' +
            (info.nextKind === 'belt' ? 'your ' + info.nextBelt + ' belt' : 'stripe ' + (info.stripes + 1)) + '.';
        return head + (info.outlined ? ' ' + info.outlined + (info.outlined === 1 ? ' is' : ' are') + ' halfway.' : '');
      },
      filled: n => 'You have sealed ' + count(n, 'question', 'questions') + '.',
      how: 'Every question you seal moves your belt. Four stripes, then the next colour.',
      // Under each belt on the Belt screen, what it takes (BELT_STEPS).
      rungAt: n => num(n) + ' sealed',
      rungBlack: n => num(n) + ' sealed, then the test',
      testTitle: 'Black belt test',
      testRules: '24 questions from across the grid. Get 22 right, with 20 of them fast. No Break it down.',
      testLocked: n => 'Black belt test. It opens at ' + num(n) + ' questions sealed, when your brown belt has four stripes.',
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
      // "You have sealed": the belt's count keeps every question ever sealed, so the Grid
      // can show fewer stamped today than this (§13.3).
      sealed: n => 'You have sealed ' + count(n, 'question', 'questions') + '.',
      best: n => 'Best round ' + num(n),
      // "The twos: 3 of 22 sealed, times and divide. The fours: 1 of 22." A table's total
      // is its whole 22 from the start, so it never jumps from 11 when divide joins.
      working: (rows, next, opening) => {
        const out = rows.map((r, i) => cap(tableNameLong(r.key)) + ': ' + r.sealed + ' of ' + r.total +
          (i === 0 ? ' sealed, times and divide.' : '.'));
        if (next && opening) out.push(cap(tableNameLong(next)) + (next === 'sq' ? ',' : '') + ' open ' + opensWhen(opening) + '.');
        return out.join(' ');
      },
      // "Halfway" is the one word for a question fast once (§15, 2026-09-24).
      today: (rounds, halfway, canSeal) => {
        const out = [];
        if (rounds) out.push('Today: ' + count(rounds, 'round', 'rounds') + '.');
        const ready = (canSeal === 1 ? ' is' : ' are') + ' ready to seal' + (rounds ? '' : ' today');
        if (halfway && canSeal) out.push(count(halfway, 'question', 'questions') + ' got halfway, and ' + canSeal + ready + '.');
        else if (halfway) out.push(count(halfway, 'question', 'questions') + ' got halfway.');
        else if (canSeal) out.push(count(canSeal, 'question', 'questions') + ready + '.');
        return out.join(' ');
      },
      // Under the coins, said once: what the thing is and what it costs.
      nudge: (id, price) => (NAMES[id] || id) + ', ' + (KIND_A[kindOf(id)] || 'a thing') + ', is ' + num(price) + ' in the Shop.',
      play: 'Play',
      carryOn: 'Keep going',
      grid: 'Grid', belt: 'Belt', book: 'Book', shop: 'Shop', settings: 'Settings',
      help: '?',
      helpLabel: 'How it works',
    },

    /* ---- the day's painting (PLAN §15, 2026-09-25 and 2026-09-26). Each finished round
       paints the next part; the round that finishes the day puts the date seal on, and the
       painting goes in the book. A day not finished leaves no page and takes nothing away,
       so nothing here counts down or warns. Jamie's word for the day's rounds is training. ---- */
    paint: {
      // Home, the row under Play. It carries the day's round count, so Home's "Today:" line
      // leaves its own count out when this row is there.
      row: (stage, target) => "Today's painting: " + stage + ' of ' + target + ' rounds.',
      rowDone: at => stop('Training done at ' + clockTime(at)),
      // The end of a round, under the painting: which round of the day it was, and once the
      // day is done, only that (the time is on Home and in the book).
      round: (stage, target) => 'Round ' + stage + ' of ' + target,
      roundDone: 'Training done',
      openBig: "Open today's painting",
      // The round that finishes the day, before its usual end.
      done: 'Training done.',
      doneWhen: (day, at) => dayName(day) + ', ' + clockTime(at),
      on: 'See your points',
      // Send to Dad: the picture goes with this line, into Messages.
      send: 'Send to Dad',
      sendText: (name, day, at) => name + ' finished training at ' + clockTime(at) + ' on ' + dayName(day) + '.',
      // The share sheet did not open: the picture is readied again.
      sendWait: 'Still making the picture. Tap again in a moment.',
      // Today's painting, opened from Home before it is finished.
      how: target => 'Each round you finish paints the next part. Finish ' + target + ' rounds today and it goes in your book.',
      // The book: one page for each day finished, newest first.
      title: 'Book',
      empty: target => 'Finish ' + target + " rounds in a day and that day's painting goes in here.",
      pageDate: day => D.u.longDate(day),
      pageWhen: (day, at) => dayName(day) + '. ' + stop('Training done at ' + clockTime(at)),
      // For Dad
      target: 'Rounds a day',
      targetNote: "Rounds that finish a day's painting. The same number on both phones is fairest.",
      fewer: 'Fewer rounds',
      more: 'More rounds',
      minus: '−',
      plus: '+',
      // What Dad sees
      dash: 'Training',
      dashToday: 'Today',
      dashRounds: (when, rounds, target) => when + ': ' + rounds + ' of ' + target + ' rounds.',
      dashDone: (when, at) => stop(when + ': done at ' + clockTime(at)),
      dashWeek: 'Days finished this week',
    },

    /* ---- the grid ---- */
    grid: {
      title: 'Grid',
      times: 'Times',
      divide: 'Divide',
      legend: { none: 'Not sealed', fast: 'Halfway', sealed: 'Sealed', unasked: 'Not asked yet' },
      empty: 'Play a round first.',
      rowsNote: 'A row shows up when its table opens.',
      divideNote: 'Each row divides by its number. Each column is the answer.',
      cell: (id, flip, state, best) => factText(id, flip) + ': ' +
        (state === 'sealed' ? 'sealed' : state === 'fast' ? 'halfway' : 'not sealed yet') +
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
      tooDear: (price, have) => 'You need ' + count(price - have, 'more coin', 'more coins') + '.',
      locked: n => 'This opens at level ' + n + '.',
      bought: 'Bought. It is in use now.',
      confirm: price => 'Tap again to buy for ' + count(price, 'coin', 'coins'),
      lockedRow: (level, price) => 'Level ' + level + ' · ' + count(price, 'coin', 'coins'),
      shortRow: (price, have) => count(price, 'coin', 'coins') + ' · ' + count(price - have, 'more coin to go', 'more coins to go'),
      owned: (n, total) => 'You own ' + n + ' of ' + total,
      // A sound's play button when sound is turned off, so the button is never silent
      // for no reason (review 2026-09-24).
      soundOff: 'Sound is off in Settings.',
      groups: { theme: 'Paper', skin: 'Card', ring: 'Timer', combo: 'Streak', sound: 'Sound', mark: 'Mark' },
      notes: {
        theme: 'Changes the whole look.',
        skin: 'The paper every card is printed on.',
        ring: 'How the timer is drawn.',
        combo: 'The streak mark at the top of a round.',
        sound: 'The sound of a right answer.',
        mark: 'Sits beside your name.',
      },
      names: NAMES,
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

    /* ---- the week's recap, on Home in the first days of a new week, until OK. It
       interrupted the end of a round, between the last card and the score (2026-09-24). ---- */
    recap: {
      title: 'Your week',
      done: n => count(n, 'question', 'questions') + ' sealed.',
      improved: (id, flip, from, to) => 'Most improved: ' + factText(id, flip) + ', ' +
        secs(from) + ' to ' + secs(to) + '.',
      fastest: (id, flip, ms) => 'Fastest: ' + factText(id, flip) + ', ' + secs(ms) + '.',
      close: 'OK',
    },

    /* ---- settings ---- */
    settings: {
      title: 'Settings',
      howItWorks: 'How it works',
      sound: 'Sound',
      autoSubmit: 'Answer as soon as I type it',
      // True to the keypad: it never sends a one-digit answer by itself (PLAN §7.2).
      autoSubmitNote: 'One-digit answers still need Go.',
      on: 'On',
      off: 'Off',
      paper: 'Paper',
      paperNote: 'Changes the colour of the whole game.',
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
      startOverAsk: 'Type RESET to start over. Everything this phone has saved for this player is deleted.',
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
      // The same words and the same 22 as Home, so the child reads one count in both places.
      tableRow: (label, sealed, halfway, total) => label + ': ' + sealed + ' of ' + total + ' sealed' +
        (halfway ? ', ' + halfway + ' halfway' : ''),
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
      checksOk: 'Save check: nothing looks edited.',
      checksBad: 'Save check: some numbers do not add up.',
      checkLine: (id, n) => (CHECK_NAMES[id] || id) + ': ' + n + '.',
      clockAhead: mins => 'Phone clock: ' + count(mins, 'minute', 'minutes') + ' ahead of this one.',
      clockOk: 'Phone clock: fine.',
      lastPlayed: day => 'Last played ' + D.u.longDate(day) + '.',
      placement: n => 'Tables not tried yet: ' + n + '.',
      noData: 'Nothing to show yet.',
      hot: ids => ids.map(id => factText(id, false)).join(', '),
      paste: 'Paste the link here.',
      openFile: 'Open a file',
      open: 'Open',
    },
  };
})();
