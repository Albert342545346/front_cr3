const CACHE_NAME = 'notes-cache-v1';
const FILES = ['/', '/index.html', '/app.js'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('push', (e) => {
    const data = e.data ? e.data.json() : { title: 'Notification', body: '' };
    e.waitUntil(
        self.registration.showNotification(data.title, { body: data.body })
    );
});