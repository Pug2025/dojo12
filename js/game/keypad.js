/* Dojo 12 — the keypad (PLAN §7.2). Big digits and a Go key. Go sends every
   answer; auto-submit is a setting and never fires on a one-digit answer, so
   the input rhythm does not change from card to card.
   Beyond asks for things that are not one whole number, so the pad has three
   shapes: digits, digits with a remainder key, and a plain yes or no. */
"use strict";
D.keypad = (function () {
  function build(opts) {
    const o = opts || {};
    let value = '';
    let digits = o.digits || 0;
    let mode = o.mode || 'number';
    let live = true;
    const node = D.u.el('div', { class: 'padwrap' });
    const listeners = { change: o.onChange || (() => {}), submit: o.onSubmit || (() => {}) };

    function press(ch) {
      if (!live) return;
      if (ch === 'back') value = value.slice(0, -1);
      else if (ch === 'go') { fire(); return; }
      else if (ch === 'yes') { value = '1'; D.audio.key(); listeners.change(value); return fire(); }
      else if (ch === 'no') { value = '0'; D.audio.key(); listeners.change(value); return fire(); }
      else if (value.length < 8) value += ch;
      D.audio.key();
      listeners.change(value);
      if (o.autoSubmit && mode === 'number' && digits >= 2 && value.length === digits) setTimeout(fire, 40);
    }
    function fire() {
      if (!value.length) return;
      const v = value;
      value = '';
      listeners.change(value);
      listeners.submit(v);
    }
    function key(label, code, cls) {
      const b = D.u.el('button', { class: 'key ' + (cls || ''), type: 'button' }, [label]);
      b.addEventListener('pointerdown', e => { e.preventDefault(); press(code); });
      b.addEventListener('contextmenu', e => e.preventDefault());
      return b;
    }

    function draw() {
      D.u.clear(node);
      node.className = 'padwrap' + (live ? '' : ' off');
      if (mode === 'yesno') {
        const row = D.u.el('div', { class: 'keyrow big' }, [
          key(D.copy.beyond.yes, 'yes', 'go'),
          key(D.copy.beyond.no, 'no', 'go no'),
        ]);
        node.appendChild(row);
        return;
      }
      const grid = D.u.el('div', { class: 'keypad' });
      for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) grid.appendChild(key(n, n));
      node.appendChild(grid);
      const bottom = D.u.el('div', { class: 'keyrow' });
      bottom.appendChild(key('⌫', 'back', 'fn'));
      bottom.appendChild(key('0', '0'));
      if (mode === 'remainder') bottom.appendChild(key(D.copy.beyond.remainder, 'r', 'fn'));
      if (mode === 'decimal') bottom.appendChild(key(D.copy.beyond.point, '.', 'fn'));
      bottom.appendChild(key(D.copy.run.go, 'go', 'go'));
      node.appendChild(bottom);
    }
    draw();

    return {
      node: node,
      clear() { value = ''; listeners.change(value); },
      value() { return value; },
      setDigits(n) { digits = n; },
      setMode(m) { if (m !== mode) { mode = m || 'number'; draw(); } },
      setAutoSubmit(on) { o.autoSubmit = on; },
      setLive(on) { live = !!on; node.classList.toggle('off', !on); },
      isLive() { return live; },
    };
  }
  return { build };
})();
