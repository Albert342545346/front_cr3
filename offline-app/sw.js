const CACHE_NAME = 'app-shell-v2';
const DYNAMIC_CACHE = 'dynamic-content-v1';

const SHELL_ASSETS = [
    '/', '/index.html', '/app.js', '/manifest.json',
    '/icons/favicon-16x16.png', '/icons/favicon-32x32.png',
    '/icons/favicon-128x128.png', '/icons/favicon-256x256.png', '/icons/favicon-512x512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE).map(k => caches.delete(k))))
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;

    // Динамический контент: Network First
    if (url.pathname.startsWith('/content/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(DYNAMIC_CACHE).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request).then(cached => cached || caches.match('/content/home.html')))
        );
    } 
    // Статика (App Shell): Cache First
    else {
        e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
    }
});

self.addEventListener('push', event => {
    let data = { title: 'Новое уведомление', body: '' };
    if (event.data) {
        try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
    }
    const options = {
        body: data.body,
        icon: '/icons/favicon-128x128.png',
        badge: '/icons/favicon-48x48.png',
        tag: 'note-update'
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});