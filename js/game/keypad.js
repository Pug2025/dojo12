/* Dojo 12 — the keypad (PLAN §7.2). Big digits, a backspace and a Go key.
   Auto-submit only fires when the answer has two digits or more and the typed
   count reaches it, so a one-digit answer is never sent before the child means
   it. Every key answers on pointerdown so the feel stays under a tenth of a
   second. */
"use strict";
D.keypad = (function () {
  function build(opts) {
    const o = opts || {};
    let value = '';
    let digits = o.digits || 0;
    let live = true;
    const node = D.u.el('div', { class: 'keypad' });
    const listeners = { change: o.onChange || (() => {}), submit: o.onSubmit || (() => {}) };

    function press(ch) {
      if (!live) return;
      if (ch === 'back') value = value.slice(0, -1);
      else if (ch === 'go') { fire(); return; }
      else if (value.length < 6) value += ch;
      D.audio.key();
      listeners.change(value);
      if (o.autoSubmit && digits >= 2 && value.length === digits) setTimeout(fire, 40);
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
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) node.appendChild(key(n, n));
    node.appendChild(key('⌫', 'back', 'fn'));
    node.appendChild(key('0', '0'));
    node.appendChild(key(D.copy.run.go, 'go', 'go'));

    return {
      node: node,
      clear() { value = ''; listeners.change(value); },
      // The keypad goes dead while the card is showing a result or waiting on a
      // choice, so a typed answer can never vanish into nothing.
      setLive(on) { live = !!on; node.classList.toggle('off', !on); },
      isLive() { return live; },
      value() { return value; },
      setDigits(n) { digits = n; },
      setAutoSubmit(on) { o.autoSubmit = on; },
    };
  }
  return { build };
})();
