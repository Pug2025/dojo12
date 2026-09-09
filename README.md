# Dojo 12

A flash-card multiplication and division trainer for a phone. Typed answers, no multiple choice,
adaptive in both directions, installed to the Home Screen and playable offline.

Live: **https://pug2025.github.io/dojo12/**

## What it is

Every product from 2 × 2 to 12 × 12 and every division by 2 to 12, drilled as short runs of
twenty cards. A per-fact mastery model decides what to serve: facts still being learned come
without a timer, facts that are correct but slow are pushed for speed with short-lag repetition,
and settled facts come back on a spaced schedule. A wrong answer opens a walkthrough whose steps
the player types; the same fact returns a few cards later.

Belts are per table, white to black. There is no overall rank and nothing on the screen refers to
any other player.

## Running it

Open the URL in Safari on an iPhone or iPad, then Share, then **Add to Home Screen**, and launch it
from the icon. On iOS the browser tab shows only the install screen: a Home Screen web app has its
own storage, separate from the Safari tab, and Safari can clear a plain tab's storage after seven
days without a visit. Desktop browsers run the game directly.

Recommended on each phone afterwards: turn on **Screen Time with a passcode**, which locks Date &
Time. The game credits a new day only when the date has changed, it is past four in the morning,
and six hours of real time have passed, and it freezes new days if the clock is wound backwards,
but a locked clock is simpler than any of that.

## Working on it

    node tests-node.mjs      # the gate: engine assertions, reward paths, copy, learner bots
    ./deploy.sh "message"    # runs the gate, stamps BUILD into sw.js, commits, pushes

No build step, no dependencies, no framework. Vanilla JavaScript in one namespace (`D`), loaded in
order by `index.html`. Node 21.2 or newer for the test harness.

    js/core/     util, cfg, save, install gating
    js/data/     copy.js   ← every string the player reads, and nowhere else
    js/engine/   facts, mastery, scheduler, scripts, diagnose, xp, runstate  (headless, no DOM)
    js/game/     main, run, keypad, grid, audio, fx                          (DOM only)

The engine is pure and testable without a browser; the game layer only binds it to the screen.
`tests-node.mjs` runs the reward-path assertions, the mastery and scheduler rules, a copy gate over
`js/data/copy.js`, and simulated learners over thirty game-days.

## Privacy

No accounts, no server, no analytics, no network calls. The save lives in the phone's own storage
under `dojo12.save.v2.<name>`. The only way anything leaves the phone is the backup link, which the
player creates and shares deliberately.
