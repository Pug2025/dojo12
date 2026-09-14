/* Dojo 12 — the shop. Coins buy looks and nothing else: the level decides what
   is on the shelf, the coins decide what leaves it. Every tap answers, even the
   ones that cannot buy anything. */
"use strict";
D.shop = (function () {
  const u = () => D.u;
  let pending = null;         // the item waiting for its second tap

  // The papers, so a swatch can show the paper itself. These match css/themes.css.
  const PAPER = { washi: '#EFE8D8', night: '#1B2436', matcha: '#E4E7D4', sakura: '#F2E3E1',
                  kraft: '#D9C4A3', sumi: '#23211C', kinpaku: '#F0E3C0' };

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

  /* Put what is worn onto the document, so every screen picks it up. */
  function apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', (D.state.profile && D.state.profile.theme) || D.cfg.FREE_PAPERS[0]);
    root.setAttribute('data-skin', equipped('skin') || 'plain');
    root.setAttribute('data-ring', equipped('ring') || 'brush');
    root.setAttribute('data-combo', equipped('combo') || 'red');
  }

  function render(root, onBack, onlyKind) {
    u().clear(root);
    if (!root.__shopOpen) pending = null;
    apply();
    // Home's nudge stands down once the Shop has been seen with these coins.
    D.state.flags.shopSeenCoins = D.state.progress.coins;
    D.state.flags.shopSeenLevel = D.xp.levelFor(D.state.progress.xp).level;
    const list = u().el('div', { class: 'col', style: { gap: '9px' } });
    const groups = {};
    for (const item of items()) {
      if (onlyKind && item.kind !== onlyKind) continue;
      (groups[item.kind] = groups[item.kind] || []).push(item);
    }
    for (const kind of Object.keys(groups)) {
      list.appendChild(u().el('div', { class: 'label', style: { marginTop: '6px' } }, D.copy.shop.groups[kind]));
      list.appendChild(u().el('div', { class: 't13 dim' }, D.copy.shop.notes[kind]));
      if (kind === 'theme') for (const value of D.cfg.FREE_PAPERS) list.appendChild(freeRow(value, root, onBack, onlyKind));
      for (const item of groups[kind]) list.appendChild(row(item, root, onBack, onlyKind));
    }
    const back = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    back.addEventListener('click', onBack);
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 'titlebar' }, D.copy.shop.title),
        u().el('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px' } }, [
          u().el('div', { class: 'row', style: { gap: '7px' } }, [
            u().el('i', { class: 'coin' }),
            u().el('div', { class: 't17 num' }, D.copy.shop.coins(D.state.progress.coins)),
          ]),
          u().el('div', { class: 't13 dim' }, D.copy.shop.owned(D.state.cosmetics.owned.length, items().length)),
        ]),
      ]),
      u().el('div', { class: 'wrapx grow' }, [list]),
      back,
    ]));
  }

  // The two papers that came free with the game.
  function freeRow(value, root, onBack, onlyKind) {
    const on = equipped('theme') === value;
    const node = u().el('button', { class: 'btn wide shopitem' + (on ? ' on' : ''), type: 'button' }, [
      u().el('span', { class: 'row', style: { gap: '11px' } }, [
        paperSwatch(value), u().el('span', {}, D.copy.shop.names['theme:' + value]),
      ]),
      u().el('span', { class: 'right' }, on ? D.copy.shop.inUse : D.copy.shop.free),
    ]);
    node.addEventListener('click', () => {
      D.state.profile.theme = value;
      D.state.cosmetics.equipped.theme = value;
      apply();
      D.save.commit();
      render(root, onBack, onlyKind);
    });
    return node;
  }

  function row(item, root, onBack, onlyKind) {
    const have = owned(item.id);
    const on = equipped(item.kind) === item.value;
    const canSee = available(item);
    const asking = pending === item.id;
    const short = !have && canSee && !afford(item);
    const right = have ? (on ? D.copy.shop.inUse : D.copy.shop.use)
      : !canSee ? D.copy.shop.lockedRow(item.level, item.price)
      : short ? D.copy.shop.shortRow(item.price, D.state.progress.coins)
      : asking ? D.copy.shop.confirm(item.price) : D.copy.shop.price(item.price);
    // A row the child cannot afford is dimmed like a locked one, with the shortfall
    // on it (§13.3): drawn at full strength it read as buyable (audit 2026-09-14).
    const node = u().el('button', {
      class: 'btn wide shopitem' + (on ? ' on' : '') + (!have && (!canSee || short) ? ' dim' : ''),
      type: 'button',
    }, [
      u().el('span', { class: 'row', style: { gap: '11px' } }, [swatch(item), u().el('span', {}, D.copy.shop.names[item.id])]),
      u().el('span', { class: 'right' + (asking ? ' ask' : '') }, right),
    ]);
    node.addEventListener('click', () => {
      if (item.kind === 'sound') D.audio.preview(item.value);   // heard before it is bought
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
      root.__shopOpen = true;
      const top = root.querySelector('.wrapx') ? root.querySelector('.wrapx').scrollTop : 0;
      render(root, onBack, onlyKind);
      root.__shopOpen = false;
      const again = root.querySelector('.wrapx');
      if (again) again.scrollTop = top;
    });
    return node;
  }

  /* A small picture of the thing being bought, so the name is never the only clue. */
  function paperSwatch(value) {
    return u().el('i', { class: 'swatch', style: { background: PAPER[value] || 'var(--paper2)' } });
  }
  function swatch(item) {
    if (item.kind === 'theme') return paperSwatch(item.value);
    if (item.kind === 'mark') return D.fx.markGlyph(item.value);
    if (item.kind === 'ring') return ringSwatch(item.value);
    return u().el('i', { class: 'swatch sw-' + item.kind + ' v-' + item.value });
  }
  function ringSwatch(value) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'mark');
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '9');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', value === 'gold' ? 'var(--kin)' : 'var(--shu)');
    c.setAttribute('stroke-width', value === 'thin' ? '1.5' : value === 'double' ? '2' : '3.5');
    if (value === 'dotted') c.setAttribute('stroke-dasharray', '3 3');
    if (value === 'double') c.setAttribute('stroke-dasharray', '60 100');
    svg.appendChild(c);
    return svg;
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
