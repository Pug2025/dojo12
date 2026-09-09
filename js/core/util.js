/* Dojo 12 — shared utilities. Global namespace: window.D
   Headless-safe: nothing here touches the DOM at load time. */
"use strict";
window.D = window.D || {};

D.u = (function () {
  /* ---- DOM ---- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // el('div', {class:'x', onclick:fn, text:'..'}, [children])
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (const c of [].concat(children)) {
        if (c === null || c === undefined) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function pulse(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;              // restart the animation
    node.classList.add(cls);
    if (ms) setTimeout(() => node.classList.remove(cls), ms);
  }

  /* ---- numbers and arrays ---- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }  // inclusive
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function weightedChoice(items, weightFn) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return choice(items);
    let r = Math.random() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  // Draw up to n distinct items from a weighted pool without replacement.
  function take(pool, n, weightFn) {
    const left = pool.slice(), out = [];
    while (out.length < n && left.length) {
      const pick = weightedChoice(left, weightFn || (() => 1));
      out.push(pick);
      left.splice(left.indexOf(pick), 1);
    }
    return out;
  }
  function median(nums) {
    if (!nums || !nums.length) return null;
    const a = nums.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  }
  function digitsOf(n) { return String(Math.abs(Math.trunc(n))).length; }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function seconds(ms) { return (Math.round(ms / 100) / 10).toFixed(1) + ' s'; }

  /* ---- time ---- */
  // One seam for the wall clock, so day rollover has exactly one thing to fake.
  let clockFn = () => Date.now();
  function now() { return clockFn(); }
  function setClock(fn) { clockFn = fn || (() => Date.now()); }
  function todayKey(d) {
    const t = d || new Date(now());
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const day = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + day;
  }
  // The key everything day-gated reads: only ever moved forward by save.touchDay().
  function gameDay() {
    const s = D.state;
    return (s && s.gameDay) || todayKey();
  }
  function daysBetween(keyA, keyB) {
    const a = new Date(keyA + 'T12:00:00');
    const b = new Date(keyB + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }
  // ISO-ish week key anchored on Monday, used by the week dots and the recap.
  function weekKey(dayKey) {
    const d = new Date((dayKey || todayKey()) + 'T12:00:00');
    const dow = (d.getDay() + 6) % 7;          // Monday = 0
    d.setDate(d.getDate() - dow);
    return todayKey(d);
  }
  // Monday = 0 .. Sunday = 6, for which of the seven dots to light.
  function weekIndex(dayKey) {
    const d = new Date((dayKey || todayKey()) + 'T12:00:00');
    return (d.getDay() + 6) % 7;
  }
  // "14 September" — used once, for the clock-moved line.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  function longDate(dayKey) {
    const d = new Date(dayKey + 'T12:00:00');
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  return { $, $all, el, clear, pulse, clamp, randInt, choice, shuffle, weightedChoice, take,
           median, digitsOf, commas, seconds, now, setClock, todayKey, gameDay, daysBetween,
           weekKey, weekIndex, longDate, wait };
})();
