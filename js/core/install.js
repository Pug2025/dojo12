/* Dojo 12 — install gating (PLAN §9.3).
   On an iPhone or iPad a Home Screen web app has its own storage, separate from
   the Safari tab it was installed from, and Safari can clear a plain tab's
   storage after seven days without a visit. So on iOS the browser tab shows the
   install screen and nothing else: the name, the theme and the tryout all happen
   on the first launch from the icon, and nothing is lost at install time.
   Desktop and other browsers run the game directly, which is how it is reviewed
   and tested. */
"use strict";
D.install = (function () {
  function isIOS() {
    const ua = navigator.userAgent || '';
    // An iPad reports itself as a Macintosh, so a Mac user agent plus real touch
    // points is an iPad. Checking the user agent rather than navigator.platform
    // keeps an emulated phone in a desktop browser out of this branch.
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
  }
  function isStandalone() {
    return window.navigator.standalone === true ||
           (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function needsInstall() { return isIOS() && !isStandalone(); }

  function render(root) {
    const u = D.u;
    u.clear(root);
    root.appendChild(u.el('div', { class: 'screen centre install col' }, [
      u.el('div', { class: 'grow' }),
      u.el('div', { class: 'big' }, D.copy.install.line),
      u.el('div', { class: 'shot col centre', style: { gap: '10px' } }, [
        shareGlyph(), u.el('div', { class: 'small' }, D.copy.install.how),
      ]),
      u.el('div', { class: 'grow' }),
    ]));
  }
  // The iOS Share glyph, drawn rather than shipped, so the screen needs no asset.
  function shareGlyph() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 44 56');
    svg.setAttribute('width', '54'); svg.setAttribute('height', '68');
    const parts = [
      ['path', { d: 'M22 4 L22 34', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round' }],
      ['path', { d: 'M13 13 L22 4 L31 13', stroke: 'currentColor', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M8 22 L4 22 L4 52 L40 52 L40 22 L36 22', stroke: 'currentColor', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ];
    for (const [tag, attrs] of parts) {
      const n = document.createElementNS(ns, tag);
      for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
      svg.appendChild(n);
    }
    return svg;
  }

  return { isIOS, isStandalone, needsInstall, render };
})();
