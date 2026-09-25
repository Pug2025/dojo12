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

  /* The game's face first, as on the icon it is about to put on the Home Screen: the
     ensō, the "12" seal and the name. Then why, and the two taps, drawn the way the
     iPhone draws them: Share, then Add to Home Screen (review 2026-09-24). */
  function render(root) {
    const u = D.u, F = D.frame;
    u.clear(root);
    root.appendChild(u.el('div', { class: 'screen fr-install' }, [
      u.el('div', { class: 'grow' }),
      F.face({ draw: true }),
      u.el('div', { class: 'fr-install-line' }, D.copy.install.line),
      u.el('div', { class: 'fr-steps', 'aria-hidden': 'true' }, [F.glyph('share'), F.glyph('then'), F.glyph('add')]),
      u.el('div', { class: 'fr-install-how' }, D.copy.install.how),
      u.el('div', { class: 'grow' }),
    ]));
  }

  return { isIOS, isStandalone, needsInstall, render };
})();
