const CACHE_NAME = 'cosmoblock-v2';
const ASSETS = [
  './',
  './index.html',
  './script.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});
