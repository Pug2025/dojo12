/* Dojo 12 — the shop (PLAN §7.1). Sparks buy looks and nothing else. A level
   gate decides what is on the shelf; sparks decide what leaves it. */
"use strict";
D.shop = (function () {
  const u = () => D.u;

  function items() { return D.cfg.SHOP; }
  function owned(id) { return D.state.cosmetics.owned.indexOf(id) >= 0; }
  function equipped(kind) { return D.state.cosmetics.equipped[kind] || null; }
  function available(item) { return D.xp.levelFor(D.state.progress.xp).level >= item.level; }
  function afford(item) { return D.state.progress.sparks >= item.price; }

  function buy(item) {
    if (owned(item.id) || !available(item) || !afford(item)) return false;
    D.state.progress.sparks -= item.price;
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
    if (kind === 'theme') D.state.profile.theme = 'dojo';
    apply();
    D.save.commit();
  }

  /* Put what is worn onto the document, so every screen picks it up. */
  function apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', (D.state.profile && D.state.profile.theme) || 'dojo');
    root.setAttribute('data-skin', equipped('skin') || 'plain');
    root.setAttribute('data-ring', equipped('ring') || 'plain');
    root.setAttribute('data-combo', equipped('combo') || 'plain');
  }

  function render(root, onBack) {
    u().clear(root);
    apply();
    const list = u().el('div', { class: 'col', style: { gap: '9px' } });
    const groups = {};
    for (const item of items()) (groups[item.kind] = groups[item.kind] || []).push(item);
    for (const kind of Object.keys(groups)) {
      list.appendChild(u().el('div', { class: 'label shoplabel' }, D.copy.shop.groups[kind]));
      for (const item of groups[kind]) list.appendChild(row(item, root, onBack));
    }
    root.appendChild(u().el('div', { class: 'screen' }, [
      u().el('div', { class: 'row between' }, [
        u().el('div', { class: 'big' }, D.copy.shop.title),
        u().el('div', { class: 'mid lvl' }, D.copy.shop.sparks(D.state.progress.sparks)),
      ]),
      u().el('div', { class: 'gridwrap grow' }, [list]),
      backBtn(onBack),
    ]));
  }

  function row(item, root, onBack) {
    const have = owned(item.id);
    const on = equipped(item.kind) === item.value;
    const canSee = available(item);
    const canBuy = canSee && afford(item);
    const right = have
      ? u().el('span', { class: 'small' }, on ? D.copy.shop.equipped : D.copy.shop.equip)
      : u().el('span', { class: 'small' }, canSee ? D.copy.shop.price(item.price)
                                                 : D.copy.shop.levelNeeded(item.level));
    const node = u().el('button', {
      class: 'btn wide row between shopitem' + (on ? ' on' : '') + (!have && !canBuy ? ' dim' : ''),
      type: 'button',
    }, [
      u().el('span', { class: 'row', style: { gap: '11px' } }, [swatch(item), u().el('span', {}, D.copy.shop.names[item.id])]),
      right,
    ]);
    node.addEventListener('click', () => {
      if (have) { on ? unequip(item.kind) : equip(item); }
      else if (!buy(item)) return;
      render(root, onBack);
    });
    return node;
  }

  /* A small preview of the thing being bought, so the name is never the only clue. */
  function swatch(item) {
    const n = u().el('i', { class: 'swatch sw-' + item.kind + ' v-' + item.value });
    return n;
  }
  function backBtn(onBack) {
    const b = u().el('button', { class: 'btn wide', type: 'button' }, D.copy.settings.back);
    b.addEventListener('click', onBack);
    return b;
  }

  return { render, apply, buy, equip, unequip, owned, equipped, available, items };
})();
