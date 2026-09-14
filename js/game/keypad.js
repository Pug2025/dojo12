/* Dojo 12 — the keypad (PLAN §7.2). Big digits and a Go key. Go sends every
   answer; auto-submit is a setting and never fires on a one-digit answer, so
   the input rhythm does not change from card to card.
   Beyond asks for things that are not one whole number, so the pad has three
   shapes: digits, digits with a remainder key, and a plain yes or no.
   When the card is not taking an answer the keys are really disabled, not just
   dimmed, so a tap cannot look accepted and vanish (playthrough 2026-09-12). */
"use strict";
D.keypad = (function () {
  let active = null;          // the pad a physical keyboard types into

  // Typing on a laptop works the same as tapping, for testing away from a phone.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', e => {
      if (!active || !active.node.isConnected) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) { active.press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { active.press('back'); e.preventDefault(); }
      else if (e.key === 'Enter') { active.press('go'); e.preventDefault(); }
      else if (e.key === '.') { active.press('.'); e.preventDefault(); }
    });
  }

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
      else if (ch === '.' && mode !== 'decimal') return;
      else if (value.length < 8) value += ch;
      D.audio.key();
      listeners.change(value);
      if (o.autoSubmit && mode === 'number' && digits >= 2 && value.length === digits) setTimeout(fire, 40);
    }
    function fire() {
      // Go with nothing typed answers back, so a tap is never swallowed.
      if (!value.length) { if (o.onEmpty) o.onEmpty(); return; }
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
    function paintLive() {
      node.classList.toggle('off', !live);
      node.querySelectorAll('button').forEach(b => { b.disabled = !live; });
    }

    function draw() {
      D.u.clear(node);
      node.className = 'padwrap';
      if (mode === 'yesno') {
        node.appendChild(D.u.el('div', { class: 'keyrow big' }, [
          key(D.copy.beyond.yes, 'yes', 'go'),
          key(D.copy.beyond.no, 'no', 'go no'),
        ]));
      } else {
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
      paintLive();
    }
    draw();

    const pad = {
      node: node,
      press: press,
      clear() { value = ''; listeners.change(value); },
      value() { return value; },
      setDigits(n) { digits = n; },
      setMode(m) { if (m !== mode) { mode = m || 'number'; draw(); } },
      setAutoSubmit(on) { o.autoSubmit = on; },
      setLive(on) { live = !!on; paintLive(); },
      isLive() { return live; },
    };
    active = pad;
    return pad;
  }
  return { build };
})();
