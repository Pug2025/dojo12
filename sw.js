/* Dojo 12 service worker. BUILD is rewritten by deploy.sh on every deploy. */
const BUILD = '20260926-111445';
const CACHE = 'dojo12-' + BUILD;
const FILES = [
  './', 'index.html', 'dashboard.html', 'manifest.webmanifest',
  'css/app.css', 'css/themes.css', 'css/kit.css', 'css/frame.css', 'css/home.css', 'css/screens.css', 'css/paint.css',
  'js/core/util.js', 'js/core/cfg.js', 'js/core/save.js', 'js/core/install.js', 'js/data/copy.js',
  'js/engine/facts.js', 'js/engine/mastery.js', 'js/engine/scripts.js', 'js/engine/diagnose.js', 'js/engine/xp.js',
  'js/engine/belt.js', 'js/engine/scheduler.js', 'js/engine/runstate.js', 'js/engine/tryout.js', 'js/engine/roundone.js',
  'js/engine/belttest.js', 'js/engine/beyond.js', 'js/engine/share.js', 'js/game/audio.js', 'js/game/fx.js',
  'js/game/keypad.js', 'js/game/run.js', 'js/game/cards.js', 'js/game/grid.js', 'js/game/belts.js',
  'js/game/shop.js', 'js/game/recap.js', 'js/game/dashboard.js', 'js/game/main.js', 'js/game/kit.js',
  'js/game/frame.js', 'js/engine/daily.js', 'js/game/book.js',
  // the painting of the day (PLAN §15, 2026-09-26): the painter, and the worker with the brush and the scenes it loads
  'js/paint/painter.js', 'js/paint/worker.js', 'js/paint/brush.js', 'js/paint/scenes.js',
  'icons/enso-180.png', 'icons/enso-192.png', 'icons/enso-512.png',
  // the image kit (ART.md Assets), painted in art/kit/
  'img/belt-black.webp', 'img/belt-blue.webp', 'img/belt-brown.webp', 'img/belt-purple.webp',
  'img/belt-white.webp', 'img/card-grain.webp', 'img/card-grid.webp', 'img/card-hemp.webp',
  'img/card-wave.webp', 'img/coin.webp', 'img/dot.webp', 'img/enso-brush.webp',
  'img/enso-dotted.webp', 'img/enso-double.webp', 'img/enso-mark.webp', 'img/enso-pen.webp',
  'img/paper-kinpaku.webp', 'img/paper-kraft.webp', 'img/paper-matcha.webp', 'img/paper-night.webp',
  'img/paper-sakura.webp', 'img/paper-sumi.webp', 'img/paper-washi.webp', 'img/ring.webp',
  'img/seal-blank.webp', 'img/seal-enso-small.webp', 'img/seal-enso.webp', 'img/seal-outline-small.webp',
  'img/seal-outline.webp', 'img/seal-small.webp', 'img/seal.webp', 'img/strike.webp',
  'img/tape.webp', 'img/titlebar-2.webp', 'img/titlebar-l.webp', 'img/titlebar-m.webp',
  'img/titlebar-s.webp',
];

self.addEventListener('install', e => {
  // Bypass the HTTP cache, or a fresh deploy can precache yesterday's files.
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.indexOf('dojo12-') === 0 && k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
