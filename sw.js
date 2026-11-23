const CACHE_NAME = 'solartrack-v1';

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './style.css',
                './script.js',
                './logo.png'
            ]).catch(err => console.log('Cache install error:', err));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Network first, fallback to cache
    e.respondWith(
        fetch(e.request)
            .then(response => {
                // If valid response, clone and cache it
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(e.request, responseToCache));
                }
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
