/* Dojo 12 — the shop. Coins buy looks and nothing else: the level decides what
   is on the shelf, the coins decide what leaves it. Every tap answers, even the
   ones that cannot buy anything.

   Every item is a tile with a real preview, two to a row (review 2026-09-24: 29
   identical rows, and Grain, Grid, Waves and Stars all showed the same beige square;
   kids buy what they can see). A paper is a small card sitting on a sheet of that
   paper, a card pattern is a small card printed with it, a timer is drawn on a card
   with a little over half its time left, a streak mark is the streak as a round
   shows it, a sound has a play button, and a mark sits beside the player's name.
   The previews carry their own data-theme and data-skin, so they show the item and
   not what is worn. The look is in css/screens.css. */
"use strict";
D.shop = (function () {
  const u = () => D.u;
  let pending = null;         // the item waiting for its second tap

  // The papers' colours, for the status bar. These match css/themes.css.
  const PAPER = { washi: '#EFE8D8', night: '#1E3B62', matcha: '#E4E7D4', sakura: '#F2E3E1',
                  kraft: '#D9C4A3', sumi: '#23211C', kinpaku: '#EDDCAB' };
  // Where each timer's gold mark crosses its stroke when the fast line is at 0.45 of
  // the time, in the ensō's 100-unit box (from the brush kit's stroke edges,
  // art/kit/out/brush/spec.json), so the preview shows the mark the child knows.
  const GOLD_TICK = { brush: [85.27, 67.74, 93.01, 71.63], thin: [86.67, 68.45, 91.61, 70.93],
                      double: [85.14, 67.68, 93.17, 71.71], dotted: [86.08, 68.15, 92.12, 71.19] };
  const NS = 'http://www.w3.org/2000/svg';

  function items() { return D.cfg.SHOP; }
  function owned(id) { return D.state.cosmetics.owned.indexOf(id) >= 0; }
  function equipped(kind) { return D.state.cosmetics.equipped[kind] || null; }
  function available(item) { return D.xp.levelFor(D.state.progress.xp).level >= item.level; }
  function afford(item) { return D.state.progress.coins >= item.price; }

  function buy(item) {
    if (owned(item.id) || !available(item) || !afford(item)) return false;
    D.xp.spendCoins(item.price);
    D.state.cosmetics.owned.push(item.id);
    equip(item);
    D.save.commitNow();
    return true;
  }
  function equip(item) {
    if (!owned(item.id)) return false;
    D.state.cosmetics.equipped[item.kind] = item.value;
    if (item.kind === 'theme') D.state.profile.theme = item.value;
    apply();
    D.save.commit();
    return true;
  }
  function unequip(kind) {
    delete D.state.cosmetics.equipped[kind];
    if (kind === 'theme') D.state.profile.theme = D.cfg.FREE_PAPERS[0];
    apply();
    D.save.commit();
  }

  /* Put what is worn onto the document, so every screen picks it up. The status bar
     takes the paper's colour too, where the phone draws one. */
  function apply() {
    const root = document.documentElement;
    const theme = (D.state.profile && D.state.profile.theme) || D.cfg.FREE_PAPERS[0];
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-skin', equipped('skin') || 'plain');
    root.setAttribute('data-ring', equipped('ring') || 'brush');
    root.setAttribute('data-combo', equipped('combo') || 'red');
    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar && PAPER[theme]) bar.setAttribute('content', PAPER[theme]);
  }

  function render(root, onBack, onlyKind) {
    u().clear(root);
    if (!root.__shopOpen) pending = null;
    apply();
    // Home's nudge stands down once the Shop has been seen with these coins.
    D.state.flags.shopSeenCoins = D.state.progress.coins;
    D.state.flags.shopSeenLevel = D.xp.levelFor(D.state.progress.xp).level;
    const list = u().el('div', { class: 'shop-list' });
    const groups = {};
    for (const item of items()) {
      if (onlyKind && item.kind !== onlyKind) continue;
      (groups[item.kind] = groups[item.kind] || []).push(item);
    }
    const again = () => rerender(root, onBack, onlyKind);
    for (const kind of Object.keys(groups)) {
      const shelf = u().el('div', { class: 'shop-tiles' });
      if (kind === 'theme') for (const value of D.cfg.FREE_PAPERS) shelf.appendChild(freeTile(value, again));
      for (const item of groups[kind]) shelf.appendChild(tile(item, again));
      list.appendChild(u().el('div', { class: 'shop-group' }, [
        u().el('div', { class: 'shop-group-name' }, D.copy.shop.groups[kind]),
        u().el('div', { class: 't13 dim' }, D.copy.shop.notes[kind]),
      ]));
      list.appendChild(shelf);
    }
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen scr-shop' }, [
      u().el('div', { class: 'row between shop-head' }, [
        u().el('div', { class: 'titlebar' }, D.copy.shop.title),
        u().el('div', { class: 'col shop-purse' }, [
          u().el('div', { class: 'row', style: { gap: '7px' } }, [
            u().el('i', { class: 'coin' }),
            u().el('div', { class: 't17 num' }, D.copy.shop.coins(D.state.progress.coins)),
          ]),
          u().el('div', { class: 't13 dim' }, D.copy.shop.owned(D.state.cosmetics.owned.length, items().length)),
        ]),
      ]),
      list,
      back,
    ]));
  }
  // Drawn again after a tap, where it was: the page does not jump back to the top.
  function rerender(root, onBack, onlyKind) {
    const y = window.scrollY || 0;
    root.__shopOpen = true;
    render(root, onBack, onlyKind);
    root.__shopOpen = false;
    window.scrollTo(0, y);
  }

  // The two papers that came free with the game.
  function freeTile(value, again) {
    const on = equipped('theme') === value;
    return shell({ kind: 'theme', value: value }, D.copy.shop.names['theme:' + value],
      on ? D.copy.shop.inUse : D.copy.shop.free, on ? ' on' : '', () => {
        D.state.profile.theme = value;
        D.state.cosmetics.equipped.theme = value;
        apply();
        D.save.commit();
        again();
      });
  }

  function tile(item, again) {
    const have = owned(item.id);
    const on = equipped(item.kind) === item.value;
    const canSee = available(item);
    const asking = pending === item.id;
    const short = !have && canSee && !afford(item);
    const status = have ? (on ? D.copy.shop.inUse : D.copy.shop.use)
      : !canSee ? D.copy.shop.lockedRow(item.level, item.price)
      : short ? D.copy.shop.shortRow(item.price, D.state.progress.coins)
      : asking ? D.copy.shop.confirm(item.price) : D.copy.shop.price(item.price);
    // A tile the child cannot afford is dimmed like a locked one, with the shortfall on
    // it (§13.3): drawn at full strength it read as buyable (audit 2026-09-14).
    const state = (on ? ' on' : '') + (have ? ' have' : '') + (asking ? ' ask' : '') +
      (!have && (!canSee || short) ? ' shut' : '');
    return shell(item, D.copy.shop.names[item.id], status, state, () => {
      if (item.kind === 'sound') listen(item.value);   // heard before it is bought
      if (have) {
        pending = null;
        if (on) unequip(item.kind); else equip(item);
      } else if (!canSee) {
        pending = null;
        D.fx.toast(D.copy.shop.locked(item.level), 1800);
        return;
      } else if (!afford(item)) {
        pending = null;
        D.fx.toast(D.copy.shop.tooDear(item.price, D.state.progress.coins), 2200);
        return;
      } else if (pending !== item.id) {
        // One tap shows the price as a question; nothing is spent until the second.
        pending = item.id;
      } else {
        pending = null;
        buy(item);
        D.fx.toast(D.copy.shop.bought, 1600);
      }
      again();
    });
  }

  /* One tile: the preview, the name and what a tap does now. The whole tile is the
     button; a sound's play button sits over its preview, beside it in the markup, so
     it plays without choosing. */
  function shell(item, name, status, state, onTap) {
    const b = u().el('button', { class: 'stile-b', type: 'button' }, [
      preview(item),
      u().el('span', { class: 'stile-name' }, name),
      u().el('span', { class: 'stile-status' }, [u().el('span', {}, status)]),
    ]);
    b.addEventListener('click', onTap);
    const node = u().el('div', { class: 'stile k-' + item.kind + state }, [b]);
    if (item.kind === 'sound') {
      const play = u().el('button', { class: 'pv-play', type: 'button', 'aria-label': D.copy.home.play },
                          [svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [svgEl('path', { d: 'M8 5.5v13l10.5-6.5z' })])]);
      play.addEventListener('click', () => listen(item.value));
      node.appendChild(play);
    }
    return node;
  }
  // A sound's preview, or a word that the sound is off rather than a button that does nothing.
  function listen(value) {
    if (D.audio.enabled()) D.audio.preview(value);
    else D.fx.toast(D.copy.shop.soundOff, 1800);
  }

  /* ---- the previews ---- */
  function sum() { return u().el('span', { class: 'mini-q' }, D.facts.display(D.facts.mulId(7, 8))); }
  function miniCard(attrs, kids) {
    return u().el('span', Object.assign({ class: 'card mini' }, attrs), kids);
  }
  function preview(item) {
    const v = item.value;
    let inner = null, attrs = { class: 'pv pv-' + item.kind, 'aria-hidden': 'true' };
    if (item.kind === 'theme') {
      // A sheet of the paper with a card of the same paper on it, in its own ink.
      attrs['data-theme'] = v;
      inner = miniCard({ 'data-theme': v, 'data-skin': 'plain' }, [sum()]);
    } else if (item.kind === 'skin') {
      inner = miniCard({ 'data-skin': v }, [sum()]);
    } else if (item.kind === 'ring') {
      inner = miniCard({ 'data-skin': 'plain' }, [enso(v), sum()]);
    } else if (item.kind === 'combo') {
      inner = u().el('span', { class: 'pv-streak' }, [
        u().el('span', { class: 'label' }, D.copy.run.streak(6)),
        u().el('span', { class: 'pv-mult v-' + v }, D.copy.run.times(2)),
      ]);
    } else if (item.kind === 'mark') {
      inner = u().el('span', { class: 'pv-named' }, [
        D.fx.markGlyph(v), u().el('span', { class: 'pv-name' }, (D.state.profile && D.state.profile.name) || ''),
      ]);
    }
    return u().el('span', attrs, inner ? [inner] : []);
  }
  // The timer as a card shows it: the whole stroke faint, the time left in ink from
  // its head, a little over half of it, and the gold mark where fast ends.
  function enso(value) {
    const t = GOLD_TICK[value] || GOLD_TICK.brush;
    const ticks = svgEl('svg', { class: 'pv-ticks', viewBox: '0 0 100 100' }, [
      value === 'gold' ? svgEl('line', { class: 'edge', x1: t[0], y1: t[1], x2: t[2], y2: t[3] }) : null,
      svgEl('line', { class: 'gold', x1: t[0], y1: t[1], x2: t[2], y2: t[3] }),
    ]);
    return u().el('span', { class: 'pv-enso v-' + value }, [u().el('i', { class: 'trail' }), u().el('i', { class: 'left' }), ticks]);
  }
  function svgEl(tag, attrs, kids) {
    const n = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) n.setAttribute(k, String(attrs[k]));
    for (const c of kids || []) if (c) n.appendChild(c);
    return n;
  }

  /* A small picture of a paper, for anywhere that names one: a sheet of it with a card
     on it, and its name written on the sheet in its own ink when one is given (the
     paper pick on first launch). */
  function paperSwatch(value, name) {
    return u().el('span', { class: 'pv pv-theme', 'data-theme': value, 'aria-hidden': 'true' }, [
      miniCard({ 'data-theme': value, 'data-skin': 'plain' }, [sum()]),
      name ? u().el('span', { class: 'pv-label' }, name) : null,
    ]);
  }

  // The cheapest thing the child could buy now and has not seen the Shop with, for Home.
  function nudge() {
    const lvl = D.xp.levelFor(D.state.progress.xp).level;
    const seenCoins = D.state.flags.shopSeenCoins || 0, seenLevel = D.state.flags.shopSeenLevel || 1;
    const can = items().filter(it => !owned(it.id) && available(it) && afford(it)).sort((a, b) => a.price - b.price);
    if (!can.length) return null;
    const it = can[0];
    const fresh = it.price > seenCoins || it.level > seenLevel;
    return fresh ? it : null;
  }

  return { render, apply, buy, equip, unequip, owned, equipped, available, items, paperSwatch, nudge };
})();
