/* Dojo 12 service worker. BUILD is rewritten by deploy.sh on every deploy. */
const BUILD = '20260909-155444';
const CACHE = 'dojo12-' + BUILD;
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/themes.css',
  'js/core/util.js', 'js/core/cfg.js', 'js/core/save.js', 'js/core/install.js',
  'js/data/copy.js',
  'js/engine/facts.js', 'js/engine/mastery.js', 'js/engine/scripts.js', 'js/engine/diagnose.js',
  'js/engine/xp.js', 'js/engine/scheduler.js', 'js/engine/runstate.js',
  'js/game/audio.js', 'js/game/fx.js', 'js/game/keypad.js', 'js/game/run.js',
  'js/game/grid.js', 'js/game/main.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
