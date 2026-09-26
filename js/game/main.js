/* Dojo 12 — screens and the flow between them (ART.md for the look, PLAN §7.1
   for what each screen holds). Four things a child tracks: points for the round,
   coins to spend, a level that stocks the shop, and one belt moved by sealed
   questions. */
"use strict";
D.main = (function () {
  const u = () => D.u;
  let root = null;
  let pendingReload = false;

  function boot() {
    root = document.getElementById('app');
    D.beyond.build();
    D.audio.install();
    registerWorker();
    if (D.install.needsInstall()) { D.install.render(root); return; }
    const list = D.save.profiles();
    if (!list.length) return firstLaunch();
    if (list.length > 1) return profilePick(list);
    open(list[0].slug);
  }

  function open(slug) {
    D.save.loadProfile(slug);
    D.shop.apply();
    D.save.touchDay();
    // A belt test that was walked away from is a fail, and it stays stamped.
    if (D.state.flags.testInProgress) {
      const prog = D.state.flags.testProgress;
      D.state.tests.push({ day: (prog && prog.day) || D.u.gameDay(), key: 'black', passed: false,
                           abandoned: true, correct: prog ? prog.correct : 0,
                           total: prog ? prog.total : D.cfg.TEST_CARDS,
                           medianRt: prog ? D.u.median(prog.rts) : null });
      while (D.state.tests.length > 100) D.state.tests.shift();
      D.state.flags.testInProgress = null;
      D.state.flags.testProgress = null;
      D.save.commitNow();
    }
    D.scheduler.ensureProgression();
    if (!D.state.flags.tryoutDone) return D.state.placementHalf ? startRoundOne() : intro();
    home();
  }

  /* ---- first launch: the game's face over the first question (review 2026-09-24).
     The face sits high, so the field and Start stay above the keyboard. ---- */
  function firstLaunch() {
    u().clear(root);
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    autocapitalize: 'words', maxlength: '14' });
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.first.start);
    const startNamed = () => {
      const name = (field.value || '').trim();
      if (!name) { D.fx.toast(D.copy.first.nameNeeded, 1600); field.focus(); return; }
      D.save.startProfile(name, 'washi');
      D.shop.apply();
      D.scheduler.ensureProgression();
      D.save.commitNow();
      paperPick();
    };
    go.addEventListener('click', startNamed);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') startNamed(); });
    // A lost phone or a deleted icon comes back through here, before round 1.
    const box = u().el('div', { class: 'col', style: { gap: '9px' } });
    const link = u().el('button', { class: 'link small', type: 'button' }, D.copy.first.haveSave);
    link.addEventListener('click', () => toggleRestore(box));
    root.appendChild(u().el('div', { class: 'screen fr-first' }, [
      u().el('div', { class: 'fr-lead' }),
      D.frame.face({ draw: true }),
      u().el('div', { class: 'titlebar fr-centre' }, D.copy.first.askName),
      field, go,
      u().el('div', { class: 'grow' }),
      link, box,
    ]));
    setTimeout(() => field.focus(), 120);
  }

  /* Two papers are free. The rest are shop stock, so nothing here is taken back.
     Each is a sheet of that paper with a card on it and its name in its own ink, the
     game as it will look (review 2026-09-24: two squares read as tick boxes, the empty
     one unticked and the dark one ticked). */
  function paperPick() {
    u().clear(root);
    const list = u().el('div', { class: 'paperpick' });
    for (const value of D.cfg.FREE_PAPERS) {
      const name = D.copy.shop.names['theme:' + value];
      const b = u().el('button', { class: 'paperpick-b', type: 'button', 'aria-label': name }, [
        D.shop.paperSwatch(value, name),
      ]);
      b.addEventListener('click', () => {
        D.state.profile.theme = value;
        D.state.cosmetics.equipped.theme = value;
        D.state.cosmetics.free = 'theme:' + value;
        D.shop.apply();
        D.save.commitNow();
        intro();
      });
      list.appendChild(b);
    }
    root.appendChild(u().el('div', { class: 'screen scr-paperpick' }, [
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'titlebar' }, D.copy.first.pickPaper),
      u().el('div', { class: 't15' }, D.copy.first.paperWhy),
      list,
      u().el('div', { class: 'small dim t13' }, D.copy.first.paperNote),
      u().el('div', { class: 'grow' }),
    ]));
  }

  /* ---- the one screen before round 1 (2026-09-14). The timer, the seal and the
     streak are taught the first time each one happens. Its card is the round's own,
     as round 1 will deal it: the five card dots, the sum at the numerals' weight, the
     answer line, and no timer (review 2026-09-24). ---- */
  function intro() {
    u().clear(root);
    const go = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.intro.start);
    go.addEventListener('click', startRoundOne);
    root.appendChild(u().el('div', { class: 'screen fr-intro' }, [
      u().el('div', { class: 'titlebar' }, D.copy.intro.title),
      u().el('div', { class: 'grow' }),
      D.frame.firstCard(D.facts.mulId(7, 8)),
      u().el('div', { class: 't15 fr-intro-words' }, D.copy.intro.body),
      u().el('div', { class: 'grow fr-intro-after' }),
      go,
    ]));
  }

  /* ---- round 1: the same screen as every round ---- */
  function startRoundOne() {
    D.audio.unlock();
    const saved = D.state.inRun && D.state.inRun.roundOne ? D.state.inRun : null;
    const ro = D.roundone.create(saved ? { resume: saved } : {});
    D.state.inRun = ro.snapshot();
    D.save.commitNow();
    D.__rs = ro;
    D.run.start(root, { rs: ro, onDone: roundOneEnd, onLeave: intro });
  }
  /* The end of a placement round, laid out like the end of any round: the score brushed
     in, the halfway questions with their pencil squares. After the last one, where the
     child starts (§13.3), the belt for the first time, and once, what coins and XP are,
     with the numbers (2026-09-24). Rounds 1 and 2 count toward the day's painting like
     any round (PLAN §15, 2026-09-26). */
  function roundOneEnd(sum) {
    D.xp.noteRound(sum);
    const day = D.daily.noteRound();
    D.save.commitNow();
    if (day.justDone) return trainingDone(() => roundOneScreen(sum, day));
    roundOneScreen(sum, day);
  }
  function roundOneScreen(sum, day) {
    u().clear(root);
    const beat = beats(0);
    const parts = [
      u().el('div', { class: 'titlebar' }, D.copy.roundOne.titleN(sum.roundNo || 1)),
      scoreRow(sum.score, beat),
    ];
    if (sum.placementContinues) {
      // Round 1's end is short: the score and its line sit in the middle of the paper.
      parts.splice(1, 0, u().el('div', { class: 'grow' }));
      parts.push(halfwayLine(beat));
    } else {
      const focus = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
      parts.push(u().el('div', { class: 'start' }, [
        u().el('div', { class: 't17' }, keep(focus.length ? D.copy.roundOne.start(focus) : D.copy.roundOne.allOpen)),
        u().el('div', { class: 't15 dim' }, D.copy.roundOne.rest),
      ]));
      parts.push(halfwayLine(beat));
      parts.push(beltPlate(D.belt.info()));
      parts.push(ledger(D.copy.roundOne.coins(sum.coinsAnswers || 0, D.state.progress.coins),
                        D.copy.roundOne.level(D.daily.today().target)));
      // What is open now is what the child was just told; news starts from here.
      D.state.flags.tablesSeen = D.scheduler.tablesNow();
    }
    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.roundOne.play);
    again.addEventListener('click', sum.placementContinues ? startRoundOne : startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.roundOne.home);
    back.addEventListener('click', home);
    hangPainting(parts, day);
    root.appendChild(u().el('div', { class: 'screen sum' + (sum.placementContinues ? ' solo' : '') },
                            parts.concat([u().el('div', { class: 'grow' }), again, back])));
    D.save.commitNow();
  }
  // A question never breaks across two lines: "4 ×" at the end of one line and "4" on the
  // next read as two things (2026-09-24). The spaces around its sign stop the break.
  function keep(text) { return text ? String(text).replace(/ ([×÷+−=]) /g, '\u00a0$1\u00a0') : text; }

  /* ---- the end of a round, laid out as a result (review 2026-09-24) ----
     It was a big number, a list of grey lines and a blank lower half. Now a hand makes it,
     in order: the score brushed in numeral by numeral, each new seal stamped in turn, a
     lost seal lifted off its pencil square, the stripe tied onto the belt, a new level
     stamped, and XP drawn along its line (ART.md, the motion table). beats() hands out the
     moments. Each stamp thumps as it meets the paper, but only the first three: a long
     list of seals is a row of stamps, not a drum roll. `reserve` keeps thumps back for
     stamps still to come (a new level). With reduced motion the stamps and the pop stay
     and the draw-ins go: home.css drops their animations. Nothing waits on any of it; the
     buttons work from the first frame. */
  function beats(reserve) {
    let thumps = 0;
    const b = {
      t: 0,
      // A seal or a level comes down at `ms`, with the slam and its thump. `last` is a
      // stamp that may use the thumps kept back for it.
      stamp(node, ms, last) {
        node.classList.add('stampin');
        node.style.animationDelay = Math.round(ms) + 'ms';
        if (thumps < 3 - (last ? 0 : reserve || 0)) { thumps++; D.audio.thump(ms / 1000 + 0.07); }
        b.t = Math.max(b.t, ms + 120);
      },
      // Anything else drawn in at `ms`, lasting `len`. A quiet one (a pencil square) does
      // not hold back what comes after it.
      draw(node, ms, cls, len, quiet) {
        node.classList.add(cls);
        node.style.animationDelay = Math.round(ms) + 'ms';
        if (!quiet) b.t = Math.max(b.t, ms + (len || 0));
      },
    };
    return b;
  }
  function still() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  // "stripe 3", "level 3" and "12 more" stay on one line: "stripe" at the end of one line and
  // "3." on the next read as two things, like a question broken at its sign.
  function glue(text) { return text ? String(text).replace(/(stripe|level|[0-9]) ([0-9]|more)/g, '$1\xa0$2') : text; }
  // The score, brushed in numeral by numeral 40 ms apart (ART.md), its word beside it
  // rather than at the far edge (review 2026-09-24).
  function scoreRow(score, beat) {
    const text = D.copy.num(score);
    const num = u().el('div', { class: 'score num' }, [u().el('span', { class: 'sr' }, text)]);
    Array.from(text).forEach((ch, i) => num.appendChild(
      u().el('span', { class: 'ch', 'aria-hidden': 'true', style: { animationDelay: (i * 40) + 'ms' } }, ch)));
    if (beat) beat.t = Math.max(beat.t, (text.length - 1) * 40 + 110);
    return u().el('div', { class: 'row scorerow' }, [num, u().el('div', { class: 'label' }, D.copy.summary.points)]);
  }
  // A line said slowly is set in Mincho (ART.md: the name, belt names, the ceremony of a
  // round's end). Numerals are never Mincho, so the numbers in it, and a question's
  // signs, are set in the Gothic.
  function ceremony(text, cls) {
    const box = u().el('div', { class: 'mincho ' + (cls || '') });
    const NUM = /([0-9](?:[0-9,.]*[0-9])?(?:\xa0[×÷+−=]\xa0[0-9]+)*)/;
    String(keep(text)).split(NUM).forEach((part, i) => {
      if (part) box.appendChild(i % 2 ? u().el('span', { class: 'nb' }, part) : document.createTextNode(part));
    });
    return box;
  }
  /* A copy line that names questions, set with each question's mark in front of it: its
     seal, its pencil square, a seal lifting off. The words stay the copy's own: the line
     is written with a placeholder for each question and split around them, so the words,
     the commas and the "and" all come from copy.js. */
  function markedLine(write, items, mark, cls) {
    const line = u().el('div', { class: 'marked ' + (cls || 't15') });
    const text = write(items.map((x, i) => '\x01' + i + '\x02'));
    for (const part of text.split(/(\x01\d+\x02)/)) {
      const m = /^\x01(\d+)\x02$/.exec(part);
      if (!m) { if (part) line.appendChild(document.createTextNode(part)); continue; }
      const i = Number(m[1]), x = items[i];
      line.appendChild(u().el('span', { class: 'q' }, [mark(x, i), keep(D.facts.display(x.id, x.flip))]));
    }
    return line;
  }
  // The marks: one per meaning, as on the card and in the Grid (seal kit).
  const marks = {
    // Sealed this round: the ensō seal stamped onto its pencil square, each in turn, as
    // the seal lands on the card.
    seal: (beat, at, big) => (x, i) => {
      const seal = u().el('i', { class: big ? 'hanko' : 'hanko-sm' });
      beat.stamp(seal, at + i * 150);
      return u().el('span', { class: 'mk stack' + (big ? ' big' : ''), 'aria-hidden': 'true' },
                    [u().el('i', { class: big ? 'hanko-pencil' : 'hanko-pencil-sm' }), seal]);
    },
    // Halfway: the pencil square where the seal will go, pencilled in at once, in turn.
    pencil: (beat) => (x, i) => {
      const n = u().el('i', { class: 'hanko-pencil-sm mk', 'aria-hidden': 'true' });
      beat.draw(n, 80 + i * 30, 'pencilin', 200, true);
      return n;
    },
    // A lost seal lifts off and leaves its pencil square, as it does on the card.
    lift: (beat, at) => (x, i) => {
      const seal = u().el('i', { class: 'hanko-sm' });
      beat.draw(seal, at + i * 120, 'liftoff', 460);
      return u().el('span', { class: 'mk stack', 'aria-hidden': 'true' }, [u().el('i', { class: 'hanko-pencil-sm' }), seal]);
    },
  };
  // "Halfway today: 2 × 3, 4 × 6." The day's questions that got halfway and still are,
  // each written the way its card showed it, eight named at most (2026-09-24), each with
  // its pencil square.
  function halfwayLine(beat) {
    const list = D.xp.halfwayToday();
    if (!list.length) return null;
    const MAX = 8, more = Math.max(0, list.length - MAX);
    return markedLine(names => D.copy.summary.halfwayToday(names, more), list.slice(0, MAX), marks.pencil(beat));
  }
  // The level, stamped: the blank stone with its number on it (seal kit), named for VoiceOver.
  function levelStamp(n) {
    const s = D.kit.level(n);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', D.copy.home.level(n));
    return s;
  }
  /* What the round paid and what there is now, in one small ledger: the coin drawn beside
     the coins, and at most one plain line under them. XP is no longer shown anywhere: the
     level counts days of training (PLAN §15, 2026-09-26). */
  function ledger(coinText, note) {
    return u().el('div', { class: 'ledger t15' }, [
      u().el('div', { class: 'lrow' }, [u().el('i', { class: 'coin big' }), u().el('div', {}, glue(coinText))]),
      note ? u().el('div', { class: 'lrow' }, [u().el('i', { class: 'lmark' }), u().el('div', { class: 'dim' }, glue(note))]) : null,
    ]);
  }
  /* Tables that opened, or left the two being worked on, since the child last looked,
     said once (2026-09-24). A save from before this starts from what it has now. */
  function tableNewsLine() {
    const f = D.state.flags, now = D.scheduler.tablesNow();
    if (!f.tablesSeen || !Array.isArray(f.tablesSeen.open)) { f.tablesSeen = now; D.save.commit(); return null; }
    const news = D.scheduler.tableNews(f.tablesSeen);
    f.tablesSeen = now;
    if (news.opened.length || news.left.length) { D.save.commit(); return D.copy.summary.tables(news.opened, news.left); }
    return null;
  }

  /* ---- the day's painting at the end of a round (PLAN §15, 2026-09-26) ----
     The round's reward hangs at the top right beside the score, with this round's part fading
     in, and the score and the lines under it run down its left side and on under it, so the
     buttons keep their place. The block runs from the score to the belt. `day` is what
     D.daily.noteRound() said for this round. */
  function hangPainting(parts, day) {
    const has = (n, cls) => !!(n && n.classList && n.classList.contains(cls));
    const at = parts.findIndex(n => has(n, 'scorerow'));
    if (at < 0) return parts;
    let end = parts.findIndex((n, i) => i > at && has(n, 'beltplate'));
    if (end < 0) end = parts.length;
    parts.splice(at, end - at, u().el('div', { class: 'pp-top' }, [D.book.roundFigure(day)].concat(parts.slice(at, end))));
    return parts;
  }
  /* ---- Training done (PLAN §15, 2026-09-26) ----
     The round that finishes the day opens this before its usual end: the day's painting at
     the size Jamie judged, its last part painting in, then the date seal slammed down as a seal
     is (ART.md, Sealed: the thump lands with it), then the words and the time, Send to Dad, and
     the way on to the round's end. The page is kept on the phone as a picture as the day
     finishes, and Send to Dad is readied from it. The way on works from the first frame. */
  function trainingDone(next) {
    u().clear(root);
    const t = D.daily.today();
    const page = D.daily.book().find(p => p.day === t.day) || { day: t.day, at: t.doneAt, rounds: t.target };
    // As big as the book shows it, or what a short phone has room for above the words, the
    // level and the two buttons (about 330 points), so they never fall below the fold.
    const room = typeof innerHeight === 'number' && innerHeight > 0 ? Math.floor((innerHeight - 356) * 0.75) : D.book.BIG;
    const s = D.book.sheet({ day: t.day, target: t.target, stage: t.stage, width: Math.max(180, Math.min(D.book.bigWidth(root), room)),
                             from: t.stage - 1, fadeAt: 220, seal: 'wait' });
    const kept = D.book.keepDay(t.day);
    // The day's training done is a level (PLAN §15, 2026-09-26): its stamp comes down after the
    // date seal and the words, beside what it opened in the Shop.
    const lvl = D.xp.level();
    const stamp = levelStamp(lvl);
    const words = u().el('div', { class: 'pp-words' }, [
      ceremony(D.copy.paint.done, 'pp-done'),
      u().el('div', { class: 'pp-when' }, D.copy.paint.doneWhen(t.day, t.doneAt)),
      u().el('div', { class: 'levelup pp-level' }, [stamp, u().el('div', { class: 't15' },
        D.copy.summary.levelUp(lvl, D.cfg.SHOP.filter(it => it.level === lvl).map(it => it.id)))]),
    ]);
    words.style.visibility = 'hidden';
    const on = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.paint.on);
    on.addEventListener('click', next);
    // If this phone cannot send the picture, the way on becomes the ink block.
    const send = D.book.sendButton(page, { first: kept, onHide: () => on.classList.add('ink') });
    let screen = null;
    const say = () => {
      if (!screen || !screen.isConnected) return;
      words.style.visibility = '';
      words.classList.add('pp-after');
      levelBeat.stamp(stamp, still() ? 0 : 320, true);
    };
    const levelBeat = beats(0);
    s.ready.then(() => {
      if (!screen || !screen.isConnected) return;
      const seal = s.stamp();
      if (!seal) return say();
      levelBeat.stamp(seal, 0, true);
      setTimeout(say, 280);
    }, say);
    screen = u().el('div', { class: 'screen scr-done' },
                    [u().el('div', { class: 'grow top' }), s.el, words, u().el('div', { class: 'grow' }), send, on]);
    root.appendChild(screen);
  }

  /* ---- home ---- */
  function home() {
    if (pendingReload && !busy()) {
      pendingReload = false;
      D.fx.toast(D.copy.settings.updated, 1400);
      setTimeout(() => location.reload(), 1200);
    }
    u().clear(root);
    const p = D.state.progress;
    // Home ends a streak (§13.3); Next round carries it.
    p.carryCombo = 0;
    // A stripe tied by a round that was left is settled here and announced by the
    // next summary; unsettled, the plate read "Sealed 2 of 1" (replay 2026-09-14).
    const tied = D.belt.update();
    if (tied.length) p.pendingBelt = (p.pendingBelt || []).concat(tied);
    const level = D.xp.level();
    const info = D.belt.info();
    const worn = D.shop.equipped('mark');

    /* Home leads with the belt, drawn big, and the one sentence of what comes next under
       it; then Play; then the rest of the numbers, smaller, in the order a kid scans them:
       today, the tables being worked on, what is sealed and the best round, the coins
       (review 2026-09-24: a dead band under the name, then seven lines of numbers). The
       name is in Mincho with the level stamped beside it, as a name is signed and sealed. */
    // How it works, from a ? at the top right: a kid will not look in Settings (2026-09-24).
    const help = u().el('button', { class: 'helpbtn', type: 'button', 'aria-label': D.copy.home.helpLabel }, D.copy.home.help);
    help.addEventListener('click', () => howItWorks(home));
    const head = u().el('div', { class: 'home-head' }, [
      u().el('div', { class: 'who' }, [
        worn ? D.fx.markGlyph(worn) : null,
        u().el('div', { class: 'home-name' }, D.state.profile.name),
        levelStamp(level),
      ]),
      help,
    ]);

    const news = tableNewsLine();
    const workLine = workingLine();
    // The day's rounds are counted once, on the painting's row under Play: "Today: 3 rounds."
    // counted a round left after its fourth card, which the painting does not, and the two
    // numbers disagreed (PLAN §15, 2026-09-26).
    const today = D.copy.home.today(0, D.xp.halfwayToday().length, D.scheduler.sealablePool().length);
    const nudgeItem = D.shop.nudge();
    const recap = D.recap.plate(home);

    const waiting = D.state.inRun && !D.state.inRun.finished;
    const play = u().el('button', { class: 'btn ink wide', type: 'button' }, waiting ? D.copy.home.carryOn : D.copy.home.play);
    play.addEventListener('click', startRun);
    // Today's painting as it stands, and the day's rounds; it opens the painting big.
    const painting = D.book.homeRow(() => D.book.today(root, home));
    const nav = u().el('div', { class: 'navrow' }, [
      link(D.copy.home.grid, () => D.grid.render(root, home)),
      link(D.copy.home.belt, () => D.belts.render(root, home, startTest)),
      link(D.copy.home.book, () => D.book.render(root, home)),
      link(D.copy.home.shop, () => D.shop.render(root, home)),
      link(D.copy.home.settings, settings),
    ]);

    // No "You have sealed 0 questions.": the words under the belt already say what the
    // first seal does, and a row of zeros on day one says nothing a kid needs. A black
    // belt's words under it already say how many are sealed (2026-09-24).
    const sealedLine = info.sealed && !info.black ? D.copy.home.sealed(info.sealed) : null;
    const best = D.state.pbs.score ? D.copy.home.best(D.state.pbs.score) : null;
    const rest = u().el('div', { class: 'rest t15' }, [
      today ? u().el('div', {}, today) : null,
      news ? u().el('div', {}, keep(news)) : null,
      workLine ? u().el('div', {}, keep(workLine)) : null,
      sealedLine || best ? u().el('div', { class: sealedLine ? 'pair' : '' },
        [sealedLine ? u().el('span', {}, sealedLine) : null, best ? u().el('span', { class: 'dim' }, best) : null]) : null,
      u().el('div', { class: 'coins' }, [
        u().el('i', { class: 'coin' }),
        u().el('span', {}, D.copy.home.coins(p.coins)),
        nudgeItem ? u().el('span', { class: 't13 dim' }, D.copy.home.nudge(nudgeItem.id, nudgeItem.price)) : null,
      ]),
    ]);

    root.appendChild(u().el('div', { class: 'screen home' }, [
      head, recap,
      u().el('div', { class: 'grow top' }),
      beltPlate(info),
      play, painting, rest,
      u().el('div', { class: 'grow' }),
      nav,
    ]));
    if (D.state.flags.clockFrozenUntil) {
      D.fx.toast(D.copy.settings.clockMoved(D.state.flags.clockFrozenUntil), 3000);
    }
  }
  /* The belt drawn as the belt it is (belt kit): the tied belt, its name, a row with a
     place for each seal still between the last stripe and the next, and the one sentence
     of what comes next. The row and the words say the same thing (D.belt.bar): a stamped
     seal for each one sealed, the pencil square, which is the one mark for halfway, where
     a halfway question could fill the place, and a bare place for the rest. On the end of
     a round a stripe just tied wraps on, then the row and the words come (ART.md, Stripe
     tied): opts.fresh is the stripes to tie, from opts.at in ms, on opts.beat. */
  function beltPlate(info, opts) {
    const o = opts || {};
    const belt = D.kit.belt(info.belt, info.stripes, {});
    // A black belt keeps the seal its test stamped on the band, as a stamp stays on cloth.
    if (info.black) belt.appendChild(u().el('i', { class: 'hanko beltseal askew', 'aria-hidden': 'true' }));
    const tapes = belt.querySelectorAll('.tape');
    let after = 0;
    (o.fresh || []).forEach((n, k) => {
      const tape = tapes[n - 1];
      if (!tape) return;
      const at = (o.at || 0) + k * 240;
      tape.classList.add('new');
      tape.style.animationDelay = at + 'ms';
      after = at + 420;
      if (o.beat) o.beat.t = Math.max(o.beat.t, after);
    });
    const bar = D.belt.bar(info);
    const row = info.black || info.nextKind === 'test' ? null
      : u().el('div', { class: 'sealrow', 'aria-hidden': 'true' },
               bar.cells.map(c => u().el('i', { class: c === 'sealed' ? 'cell-sealed' : c === 'half' ? 'cell-halfway' : 'open' })));
    // Thirteen places fit a line; more (a brown belt's stripe takes 17) are set in two even
    // lines rather than thirteen and four.
    if (row && bar.cells.length > 13) row.style.maxWidth = (Math.ceil(bar.cells.length / 2) * 26) + 'px';
    const under = u().el('div', { class: 'under' }, [row, u().el('div', { class: 'next' },
      glue(info.black ? D.copy.belt.filled(info.sealed) : D.copy.belt.toNext(Object.assign({}, info, { left: bar.left }))))]);
    if (after && o.beat) o.beat.draw(under, after, 'drawin', 160);
    return u().el('div', { class: 'beltplate' }, [belt, ceremony(D.copy.belt.now(info.belt, info.stripes), 'beltname'), under]);
  }
  // The tables being worked on, each out of its whole 22, and when the next opens (2026-09-24).
  function workingLine() {
    const keys = [D.state.focus.primary, D.state.focus.secondary].filter(Boolean);
    if (!keys.length) return null;
    const next = D.scheduler.nextUnopened();
    return D.copy.home.working(keys.map(k => D.belt.tableSeals(k)), next, next ? D.scheduler.nextOpening() : null);
  }
  function link(text, fn) {
    const b = u().el('button', { class: 'link', type: 'button' }, text);
    b.addEventListener('click', fn);
    return b;
  }
  function tile(text, fn) {
    const b = u().el('button', { class: 'btn wide', type: 'button' }, text);
    b.addEventListener('click', fn);
    return b;
  }

  /* ---- a round ---- */
  function startRun() {
    D.audio.unlock();
    D.save.touchDay();
    D.scheduler.ensureProgression();
    const rs = D.state.inRun && !D.state.inRun.finished
      ? D.runstate.resume(D.state.inRun)
      : D.runstate.create(D.scheduler.plan(), { table: D.state.focus.primary, combo: D.state.progress.carryCombo || 0 });
    D.state.inRun = rs.snapshot();
    D.__rs = rs;
    D.run.start(root, { rs: rs, onDone: afterRun, onLeave: home });
  }
  // The week's recap waits on Home now; it no longer comes between the last card and
  // the score (2026-09-24). A round that reaches its end counts once toward the day's
  // painting, a resumed one too (it ends once); the round that finishes the day opens
  // Training done first (PLAN §15, 2026-09-26).
  function afterRun(sum) {
    D.xp.noteRound(sum);
    const day = D.daily.noteRound();
    D.save.commitNow();
    if (day.justDone) return trainingDone(() => summary(sum, day));
    summary(sum, day);
  }

  /* ---- the end of a round ----
     One line leads, the most important thing that moved: a stripe or a belt, then
     questions sealed, then a new best, then the streak (2026-09-14). Every number says
     what it is, and every question is written the way its card showed it (2026-09-24).
     Laid out as a result (review 2026-09-24): the score brushed in and the lead line in
     Mincho; a stripe or a belt puts the belt right under it with the new stripe tying on;
     each seal stamped, the halfway questions pencilled, a lost seal lifted off; a new
     level stamped beside its Shop line; coins and XP in one ledger over the buttons. The
     day's painting hangs beside the score with the round's part fading in (hangPainting). */
  function summary(sum, day) {
    u().clear(root);
    const info = D.belt.info();
    const events = (sum.extra && sum.extra.belt) || [];
    const pbs = (sum.extra && sum.extra.pbs) || [];
    const scorePb = pbs.find(x => x.kind === 'score');
    const ev = events[events.length - 1];
    const flips = sum.flips || {};
    const items = ids => ids.map(id => ({ id: id, flip: !!flips[id] }));
    const listed = ids => ids.map(id => D.facts.display(id, !!flips[id]));
    const beat = beats(0);

    // The child's best time this round, if any: the biggest improvement.
    const pbFact = (sum.pbFacts || []).slice().sort((a, b) => (b.from - b.ms) - (a.from - a.ms))[0];
    const bestTimeLine = pbFact ? D.copy.summary.bestTime(pbFact.id, pbFact.ms, pbFact.from, !!flips[pbFact.id]) : null;
    const bestLine = scorePb ? D.copy.summary.newBest(scorePb.delta) : D.state.pbs.score > sum.score ? D.copy.summary.best(D.state.pbs.score) : null;

    // One line leads: a stripe or belt, a seal, a new best round, the child's best
    // time, and never a streak below the best (§13.3).
    let lead = null, leadIsBelt = false;
    if (ev) {
      // Two stripes in one round are both named (audit 2026-09-14: "Stripe 2" with no stripe 1 seen).
      const stripes = events.filter(e => e.kind === 'stripe' && e.belt === ev.belt);
      lead = ev.kind === 'belt' ? D.copy.belt.beltTied(ev.belt)
        : stripes.length > 1 ? D.copy.belt.stripesTied(ev.belt, stripes[0].stripes, ev.stripes)
        : D.copy.belt.stripeTied(ev.belt, ev.stripes);
      leadIsBelt = true;
    }
    else if (sum.sealed.length) lead = D.copy.summary.sealed(listed(sum.sealed));
    else if (scorePb) lead = D.copy.summary.newBest(scorePb.delta);
    else if (bestTimeLine) lead = bestTimeLine;
    else if (sum.bestCombo >= D.cfg.COMBO_STEP) lead = D.copy.summary.streak(sum.bestCombo, D.state.pbs.combo);
    const leadIsSeal = !leadIsBelt && sum.sealed.length > 0;

    const parts = [scoreRow(sum.score, beat)];
    let screen = null;
    if (leadIsBelt) {
      // The stripes this round tied on the belt the child has now, in the order they were tied.
      const fresh = events.filter(e => e.kind === 'stripe' && e.belt === info.belt).map(e => e.stripes);
      const tieAt = 120, t0 = beat.t;
      parts.push(ceremony(lead, 'lead big'));
      const plate = beltPlate(info, { fresh: fresh, at: tieAt, beat: beat });
      parts.push(plate);
      // The seals come while the stripe is still going on, down the page.
      beat.t = t0 + 110;
      // A new colour has no stripe to tie: the new belt pops as it lands, with the belt's sound.
      setTimeout(() => {
        if (!screen || !screen.isConnected) return;
        if (!fresh.length) D.fx.pop(plate.querySelector('.belt'));
        D.audio.belt();
      }, tieAt);
    } else if (lead && !leadIsSeal) {
      parts.push(ceremony(lead, 'lead'));
    }

    const lines = u().el('div', { class: 'lines' });
    const add = node => { if (node) lines.appendChild(node); };
    const say = text => (text ? u().el('div', { class: 't15' }, keep(text)) : null);
    if (sum.sealed.length) {
      const sealed = markedLine(names => D.copy.summary.sealed(names), items(sum.sealed),
                                marks.seal(beat, beat.t + 60, leadIsSeal), leadIsSeal ? 'lead sealed' : 't15');
      if (leadIsSeal) parts.push(sealed); else add(sealed);
    }
    add(halfwayLine(beat));
    if (sum.unsealed.length) add(markedLine(names => D.copy.summary.unsealed(names), items(sum.unsealed), marks.lift(beat, beat.t + 200)));
    // A question that lost its seal this round is not also listed as "got it back": under
    // "lost its seal" that read as the seal coming back, which takes another day. The card
    // said "Got it back." when it happened (2026-09-24).
    const wonBack = sum.gotBack.filter(id => sum.unsealed.indexOf(id) < 0);
    if (wonBack.length) add(say(D.copy.summary.gotBack(listed(wonBack))));
    if (bestTimeLine !== lead) add(say(bestTimeLine));
    if (bestLine !== lead) add(say(bestLine));
    add(say(tableNewsLine()));
    if (lines.childNodes.length) parts.push(lines);
    if (!leadIsBelt) parts.push(beltPlate(info));

    // What the round paid and what the child has now, in words (2026-09-24).
    const p = D.state.progress;
    parts.push(ledger(D.copy.summary.coinsLine(sum.coinsAnswers || 0, sum.coinsBonus || 0, events, p.coins)));

    const again = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.summary.again);
    again.addEventListener('click', startRun);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);
    hangPainting(parts, day);
    screen = u().el('div', { class: 'screen sum' }, parts.concat([u().el('div', { class: 'grow' }), again, back]));
    root.appendChild(screen);
    D.save.commitNow();
  }

  /* ---- the black belt test ---- */
  function startTest() {
    D.audio.unlock();
    const test = D.belttest.create();
    D.state.flags.testInProgress = 'black';
    D.save.commitNow();
    D.cards.start(root, {
      total: D.cfg.TEST_CARDS,
      title: D.copy.belt.testTitle,
      leftValue: () => D.copy.num(test.raw.score),
      // The test judges fast at the fixed line, not the child's own (§13.3), so the gold
      // mark is drawn at the fixed line. At the child's own it sat later than the test's
      // own line for any child slower than the fixed line (round agent, 2026-09-24).
      ringInfo: () => {
        const c = test.raw.cards[test.raw.i];
        if (!c) return {};
        const ms = D.mastery.ringMs(c.id, c.ringKind);
        return { goldAt: D.u.clamp(1 - D.mastery.fixedThreshold(c.id) / ms, 0.03, 0.97) };
      },
      provide: () => {
        const p = test.present();
        if (!p) return null;
        return { question: p.question, digits: p.digits, ringMs: p.ringMs, index: p.index,
                 input: D.facts.get(p.card.id).input || 'number' };
      },
      answer: (v, rt) => {
        const inTime = test.raw.inTime;
        const out = test.submit(v, rt);
        const index = out.card ? test.raw.cards.indexOf(out.card) : -1;
        // Fast is what the test counts toward its twenty: right and inside the fixed line.
        const fast = test.raw.inTime > inTime;
        return { correct: out.kind === 'correct', fast: fast, points: out.points, sealed: out.sealed,
                 index: index, done: out.done, streak: test.raw.correct };
      },
      timeout: () => {
        const out = test.timeout();
        return { correct: false, index: out.card ? test.raw.cards.indexOf(out.card) : -1, done: out.done };
      },
      onDone: () => testResult(test.result()),
    });
  }
  /* A pass is the moment ART.md gives it: the seal slammed onto the black belt's band,
     with PLAN's screen shake and "Black belt!". A fail stays plain and kind: the count,
     what it paid, and Home. */
  function testResult(res) {
    D.state.flags.testInProgress = null;
    D.save.commitNow();
    u().clear(root);
    const beat = beats(0);
    const parts = [u().el('div', { class: 'titlebar' }, D.copy.belt.testTitle), scoreRow(res.score, beat)];
    let screen = null;
    if (res.passed) {
      parts.push(ceremony(D.copy.belt.blackBelt, 'lead big'));
      // The black belt carries its seal on the band left of the knot (beltPlate); here it
      // comes down.
      const plate = beltPlate(D.belt.info());
      const seal = plate.querySelector('.beltseal');
      const at = beat.t + 260;
      beat.stamp(seal, at, true);
      setTimeout(() => {
        if (!screen || !screen.isConnected) return;
        if (!still()) D.fx.shake(screen);
        D.audio.belt();
      }, at + 70);
      parts.push(plate);
    } else {
      // Short, so it sits in the middle of the paper, as round 1's end does.
      parts.splice(1, 0, u().el('div', { class: 'grow' }));
      parts.push(u().el('div', { class: 'lead t22' }, D.belttest.failLine(res)));
    }
    // The same ledger as the end of a round: what it paid, then what there is now.
    const belts = res.belt || [];
    const answers = (res.coins || 0) - belts.reduce((n, e) => n + (e.coins || 0), 0);
    parts.push(ledger(D.copy.summary.coinsLine(answers, 0, belts, D.state.progress.coins)));
    const back = u().el('button', { class: 'btn ink wide', type: 'button' }, D.copy.summary.home);
    back.addEventListener('click', home);
    screen = u().el('div', { class: 'screen sum test' + (res.passed ? '' : ' solo') },
                    parts.concat([u().el('div', { class: 'grow' }), res.passed ? backupButton() : null, back]));
    root.appendChild(screen);
  }

  /* ---- sending Dad a copy (PLAN §9.5) ----
     The link is built before the button is live, because Safari will not open
     the share sheet across an awaited compression. Whatever happens, the child
     is told what happened. */
  // asRow: the calm row Settings lists it as, with its note and the Share glyph.
  function backupButton(asRow) {
    const b = asRow
      ? D.frame.row(D.copy.settings.backup, { note: D.copy.settings.backupNote, end: D.frame.glyph('share') })
      : u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.backup);
    b.setAttribute('disabled', 'disabled');
    D.share.precompute().then(() => b.removeAttribute('disabled')).catch(() => {});
    b.addEventListener('click', () => {
      if (D.share.shareNow()) { D.fx.toast(D.copy.settings.backupHow, 3200); return; }
      if (D.share.copyNow()) { D.fx.toast(D.copy.settings.copied, 3200); return; }
      D.share.fileNow();
    });
    return b;
  }

  /* ---- settings: one calm list of paper rows, each saying what it is set to or where
     it goes, its note under it; For Dad sits apart, quiet, behind its hold
     (review 2026-09-24). ---- */
  function settings() {
    u().clear(root);
    const f = D.state.flags;
    const F = D.frame;
    const paper = D.state.profile.theme || D.cfg.FREE_PAPERS[0];
    const list = u().el('div', { class: 'fr-list' }, [
      F.row(D.copy.settings.howItWorks, { end: F.glyph('go'), onClick: () => howItWorks(settings) }),
      toggle(D.copy.settings.sound, f.sound, v => { f.sound = v; D.save.commit(); }),
      toggle(D.copy.settings.autoSubmit, f.autoSubmit, v => { f.autoSubmit = v; D.save.commit(); }, D.copy.settings.autoSubmitNote),
      F.row(D.copy.settings.paper, { value: D.copy.shop.names['theme:' + paper], note: D.copy.settings.paperNote,
                                     end: F.glyph('go'), onClick: () => D.shop.render(root, settings, 'theme') }),
      backupButton(true),
    ]);
    // The hold's words sit under it, so nothing has to pop up to explain it.
    const dad = F.row(D.copy.settings.forDad, { cls: 'fr-quiet fr-hold', note: D.copy.settings.forDadHold });
    dad.appendChild(u().el('i', { class: 'fill' }));
    holdFor(dad, 2000, forDad);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', home);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.settings.title),
      list,
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'fr-solo' }, [dad]),
      back,
    ]));
  }
  /* The parent's corner: a hold, so it is out of a child's way without being a
     secret (Jamie, rework 2026-09-10). */
  function holdFor(btn, ms, fn, hint) {
    const fill = btn.querySelector('.fill');
    let timer = 0;
    const cancel = () => { clearTimeout(timer); fill.style.transition = 'none'; fill.style.width = '0'; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (hint) D.fx.toast(hint, 1400);
      fill.style.transition = 'width ' + ms + 'ms linear';
      fill.style.width = '100%';
      timer = setTimeout(() => { cancel(); fn(); }, ms + 40);
    });
    for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(evt, cancel);
  }

  /* ---- How it works: five panels, a picture and a few short lines each, from the ?
     on Home or from Settings, and back to wherever it was opened from (2026-09-24).
     Each picture is drawn with the pieces the game itself uses (D.frame.picture), set
     beside its words so the page reads as five short things. ---- */
  function howItWorks(from) {
    const onBack = typeof from === 'function' ? from : settings;
    u().clear(root);
    const box = u().el('div', { class: 'fr-howto' });
    const PICTURES = ['card', 'seal', 'belt', 'streak', 'coins'];
    D.copy.howto.sections.forEach(([head, body], i) => {
      box.appendChild(u().el('section', { class: 'fr-panel' }, [
        D.frame.picture(PICTURES[i]),
        u().el('h3', {}, head),
        u().el('p', {}, body),
      ]));
    });
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.howto.title),
      box,
      u().el('div', { class: 'grow' }),
      back,
    ]));
  }

  /* ---- For Dad: the same calm rows, plain and adult. A row that asks for more opens
     under itself; Start over sits apart and quiet, and a reset is never red. ---- */
  function forDad() {
    u().clear(root);
    const F = D.frame;
    // A row and the slot it opens into; the row says whether it is open. `more` is the
    // row's value and note, for a row that shows what it is set to.
    const opener = (label, fill, cls, more) => {
      const slot = u().el('div', { class: 'fr-slot' });
      const b = F.row(label, Object.assign({ cls: cls, end: F.glyph('open') }, more));
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', () => {
        if (slot.firstChild) u().clear(slot); else fill(slot, b);
        b.setAttribute('aria-expanded', String(!!slot.firstChild));
      });
      return u().el('div', { class: 'fr-item' }, [b, slot]);
    };
    /* The rounds that finish a day's painting, 4 to 12 (PLAN §15, 2026-09-25): fewer and more,
       saved at once. Set below the rounds already played today, it finishes today's painting
       then and there (D.daily.setTarget), and its page is kept as the day's are. */
    const roundsADay = (slot, row) => {
      const n = u().el('span', { class: 'pp-step-n' });
      const less = u().el('button', { class: 'key', type: 'button', 'aria-label': D.copy.paint.fewer }, D.copy.paint.minus);
      const more = u().el('button', { class: 'key', type: 'button', 'aria-label': D.copy.paint.more }, D.copy.paint.plus);
      const show = target => {
        n.textContent = String(target);
        const value = row.querySelector('.fr-value');
        if (value) value.textContent = String(target);
        less.disabled = target <= D.daily.MIN;
        more.disabled = target >= D.daily.MAX;
      };
      const step = by => {
        const was = D.daily.today();
        const target = D.daily.setTarget(was.target + by);
        D.save.commitNow();
        if (!was.done && D.daily.today().done) D.book.keepDay(was.day);
        show(target);
      };
      less.addEventListener('click', () => step(-1));
      more.addEventListener('click', () => step(1));
      show(D.daily.today().target);
      slot.appendChild(u().el('div', { class: 'pp-stepper' }, [less, n, more]));
    };
    const rename = slot => {
      const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                      autocapitalize: 'words', maxlength: '14', value: D.state.profile.name });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.saveName);
      const saveName = () => {
        const name = (field.value || '').trim();
        if (!name) { D.fx.toast(D.copy.first.nameNeeded, 1600); return; }
        D.state.profile.name = name;
        D.save.rememberProfile(D.state.profile);
        D.save.commitNow();
        D.fx.toast(D.copy.forDad.nameSaved, 1400);
        forDad();
      };
      go.addEventListener('click', saveName);
      field.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
      slot.appendChild(u().el('div', { class: 'col namebox', style: { gap: '10px' } }, [field, go]));
    };
    // Start over wipes this player's save and goes back to the name screen, so
    // the whole first run can be seen again (Jamie, 2026-09-14).
    const reset = slot => {
      const field = u().el('input', { class: 'field', type: 'text', autocapitalize: 'characters' });
      const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.startOver);
      go.addEventListener('click', () => {
        if ((field.value || '').trim().toUpperCase() !== D.copy.forDad.resetWord) return;
        D.save.reset();
        location.reload();
      });
      slot.appendChild(u().el('div', { class: 'col resetbox', style: { gap: '10px' } }, [
        u().el('div', { class: 't15' }, D.copy.forDad.startOverAsk), field, go,
      ]));
    };
    const list = u().el('div', { class: 'fr-list' }, [
      F.row(D.copy.forDad.dashboard, { end: F.glyph('go'), onClick: () => D.dashboard.render(root, { onBack: forDad }) }),
      opener(D.copy.paint.target, roundsADay, null,
             { value: String(D.daily.today().target), note: D.copy.paint.targetNote }),
      opener(D.copy.forDad.restore, toggleRestore),
      opener(D.copy.forDad.changeName, rename),
    ]);
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', settings);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'titlebar' }, D.copy.forDad.title),
      list,
      u().el('div', { class: 'grow' }),
      u().el('div', { class: 'fr-solo' }, [opener(D.copy.forDad.startOver, reset, 'fr-quiet')]),
      back,
    ]));
  }

  /* ---- bringing a saved game back (PLAN §9.5) ---- */
  function toggleRestore(container) {
    const open = container.querySelector('.restorebox');
    if (open) { open.remove(); return; }
    const field = u().el('input', { class: 'field', type: 'text', autocomplete: 'off',
                                    placeholder: D.copy.forDad.paste });
    const go = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.forDad.bringBack);
    go.addEventListener('click', () => restoreFromText(field.value));
    const file = u().el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
    file.addEventListener('change', () => { if (file.files && file.files[0]) restoreFromFile(file.files[0]); });
    const pick = u().el('button', { class: 'link small', type: 'button' }, D.copy.forDad.openFile);
    pick.addEventListener('click', () => file.click());
    container.appendChild(u().el('div', { class: 'col restorebox', style: { gap: '9px' } },
                                 [field, go, pick, file]));
  }
  function restoreFromText(text) {
    const m = String(text || '').match(/s=([A-Za-z0-9_-]+)/);
    const payload = m ? m[1] : String(text || '').trim();
    if (!payload) return;
    D.share.decode(payload).then(finishRestore).catch(() => D.fx.toast(D.copy.forDad.restoreBad, 2400));
  }
  function restoreFromFile(fileObj) {
    const reader = new FileReader();
    reader.onload = () => {
      try { finishRestore(JSON.parse(reader.result)); }
      catch (e) { D.fx.toast(D.copy.forDad.restoreBad, 2400); }
    };
    reader.readAsText(fileObj);
  }
  function finishRestore(payload) {
    const res = D.share.apply(payload);
    if (!res.ok) {
      D.fx.toast(res.reason === 'older' ? D.copy.forDad.restoreOlder : D.copy.forDad.restoreBad, 2800);
      return;
    }
    D.save.key = D.save.keyFor(D.state.profile.slug);
    D.save.rememberProfile(D.state.profile);
    D.save.commitNow();
    D.shop.apply();
    D.fx.toast(D.copy.forDad.restoreDone, 2400);
    home();
  }

  /* A setting that is on or off: a row with its stamp, On the solid red block and Off
     an empty ink outline (review 2026-09-24: both were red). */
  function toggle(labelText, on, fn, note) {
    const state = D.frame.stamp(on);
    const b = D.frame.row(labelText, { end: state, note: note });
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(!!on));
    b.addEventListener('click', () => {
      on = !on;
      D.frame.setStamp(state, on);
      b.setAttribute('aria-checked', String(on));
      fn(on);
    });
    return b;
  }

  // More than one player on this phone: the game's face, then each name, in the face
  // names are set in (PLAN §7.1: names only).
  function profilePick(list) {
    u().clear(root);
    const box = u().el('div', { class: 'fr-list fr-names' });
    for (const p of list) box.appendChild(D.frame.row(p.name, { end: D.frame.glyph('go'), onClick: () => open(p.slug) }));
    root.appendChild(u().el('div', { class: 'screen fr-first' }, [
      u().el('div', { class: 'fr-lead' }), D.frame.face(), box, u().el('div', { class: 'grow' }),
    ]));
  }

  function busy() {
    return !!(D.state && (D.state.flags.testInProgress || (D.__rs && !D.__rs.isDone())));
  }

  /* ---- service worker ---- */
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated' && hadController) {
            // Never in the middle of a round or a test: a reload mid-test counts
            // as walking away from it. It waits for Home instead.
            if (busy()) { pendingReload = true; return; }
            D.fx.toast(D.copy.settings.updated, 1400);
            setTimeout(() => location.reload(), 1200);
          }
        });
      });
    }).catch(() => {});
  }

  return { boot, home, startRun, summary, settings, startTest, intro, howItWorks };
})();

document.addEventListener('DOMContentLoaded', D.main.boot);
