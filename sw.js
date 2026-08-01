const VERSION = '3519673a69a6';
const CACHE = `geogayssr-${VERSION}`;

const RESSOURCES = [
  './',
  'css/base.css',
  'css/theme-sombre.css',
  'css/theme-sorbet.css',
  'data/alias.json',
  'data/carte-onu.json',
  'data/carte-subunits.json',
  'data/carte-units.json',
  'icones/icone-180.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'index.html',
  'js/carte.js',
  'js/main.js',
  'js/maj.js',
  'js/messages.js',
  'js/partie.js',
  'js/saisie.js',
  'js/stockage.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(
      RESSOURCES.map((r) => new Request(r, { cache: 'reload' }))
    ))
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((nom) => nom !== CACHE).map((nom) => caches.delete(nom))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const requete = ev.request;
  if (requete.method !== 'GET') return;
  if (new URL(requete.url).origin !== self.location.origin) return;

  ev.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(requete, { ignoreSearch: true }))
      .then((depuisCache) => depuisCache || fetch(requete))
      .catch(() => {
        if (requete.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      })
  );
});

self.addEventListener('message', (ev) => {
  if (ev.data === 'appliquer-maintenant') self.skipWaiting();
});
