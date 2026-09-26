/* Dojo 12 engine — the day's training and its painting (PLAN §15, 2026-09-25 and 2026-09-26). Headless.
   A day's training is a set number of finished rounds (For Dad sets it, 8 to start). Each finished
   round paints the next part of that day's painting; the last one finishes it, and that day goes in
   the book. The day is the game day (D.u.gameDay()), which only moves forward, so winding the phone's
   clock paints nothing new. A day not finished leaves no page and takes nothing away: there is no
   streak (§2).

   D.state.daily = { target, day, rounds, doneAt, book: [{ day, at, rounds }] }
     target   rounds a day, 4 to 12
     day      the game day the count below belongs to
     rounds   rounds finished that day (it keeps counting past the target)
     doneAt   when the day's training was done (ms), or null; once set, the day stays done, even
              if For Dad then raises the rounds a day, so a day is done, and says so, once
     book     one entry per finished day, oldest first; the painting itself is painted from the
              day and the child's name, and kept as a picture on the phone by D.painter */
"use strict";
D.daily = (function () {
  const MIN = 4, MAX = 12;

  function st() {
    const s = D.state;
    if (!s.daily || typeof s.daily !== 'object') s.daily = blank();
    const d = s.daily;
    d.target = d.target >= MIN && d.target <= MAX ? Math.round(d.target) : D.cfg.DAY_ROUNDS;
    if (!Array.isArray(d.book)) d.book = [];
    if (!(d.rounds >= 0)) d.rounds = 0;
    // a new game day starts a new painting
    const today = D.u.gameDay();
    if (d.day !== today) { d.day = today; d.rounds = 0; d.doneAt = null; }
    return d;
  }
  function blank() { return { target: D.cfg.DAY_ROUNDS, day: null, rounds: 0, doneAt: null, book: [] }; }
  function isDone(d) { return d.doneAt != null; }
  function finish(d) {
    d.doneAt = D.u.now();
    if (!d.book.some(p => p.day === d.day)) d.book.push({ day: d.day, at: d.doneAt, rounds: d.target });
  }

  // Where today stands: the painting's date, how many rounds are in, and whether it is done.
  // A done day's painting is finished: its stage is the target.
  function today() {
    const d = st();
    const done = isDone(d);
    return { day: d.day, rounds: d.rounds, target: d.target, stage: done ? d.target : Math.min(d.rounds, d.target),
             left: done ? 0 : Math.max(0, d.target - d.rounds), done: done, doneAt: d.doneAt };
  }

  /* A round reached its end. Returns what it did to the painting:
     { stage, target, painted: true when it added a part, justDone: true when it finished the day }.
     Rounds after the day is done are counted but paint nothing more. */
  function noteRound() {
    const d = st();
    const wasDone = isDone(d);
    d.rounds += 1;
    const painted = !wasDone;
    const justDone = painted && d.rounds >= d.target;
    if (justDone) finish(d);
    return { stage: wasDone ? d.target : Math.min(d.rounds, d.target), target: d.target, painted: painted, justDone: justDone };
  }

  /* For Dad changes the rounds a day. Lowering it to today's rounds or below finishes today's
     painting then and there; raising it reopens nothing: a done day stays done and its page stays
     in the book. */
  function setTarget(n) {
    const d = st();
    d.target = Math.max(MIN, Math.min(MAX, Math.round(Number(n) || D.cfg.DAY_ROUNDS)));
    if (d.rounds >= d.target && !isDone(d)) finish(d);
    return d.target;
  }

  // The finished days, newest first.
  function book() { return st().book.slice().reverse(); }
  // How many days in the week of `day` (Monday first) were finished, for What Dad sees.
  function doneInWeek(day) {
    const wk = D.u.weekKey(day || D.u.gameDay());
    return st().book.filter(p => D.u.weekKey(p.day) === wk).length;
  }

  return { MIN, MAX, today, noteRound, setTarget, book, doneInWeek, blank };
})();
