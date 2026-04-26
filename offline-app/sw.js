const CACHE_NAME = 'notes-cache-v3'; // 🔥 УВЕЛИЧЕНА ВЕРСИЯ!
const DYNAMIC_CACHE_NAME = 'dynamic-content-v2'; // 🔥 ТОЖЕ УВЕЛИЧЕНА!

const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/icons/favicon.ico',
    '/icons/favicon-16x16.png',
    '/icons/favicon-32x32.png',
    '/icons/favicon-128x128.png',
    '/icons/favicon-512x512.png'
];

self.addEventListener('install', event => {
    console.log('SW: Установка...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SW: Кэширование ресурсов');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    console.log('SW: Активация...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
                    .map(key => {
                        console.log('SW: Удаление старого кэша:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            console.log('SW: Активирован');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Пропускаем CDN и внешние ресурсы
    if (url.origin !== location.origin) {
        return;
    }
    
    // Динамический контент (/content/*)
    if (url.pathname.startsWith('/content/')) {
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                    return res;
                })
                .catch(() => {
                    return caches.match(event.request)
                        .then(cached => cached || caches.match('/content/home.html'));
                })
        );
    } 
    // Статика (Cache First)
    else {
        event.respondWith(
            caches.match(event.request)
                .then(cached => {
                    if (cached) {
                        return cached;
                    }
                    return fetch(event.request);
                })
        );
    }
});

// Push уведомления
self.addEventListener('push', event => {
    let data = { title: 'Уведомление', body: '', reminderId: null };
    if (event.data) {
        try { data = event.data.json(); } 
        catch { data.body = event.data.text(); }
    }
    
    const opts = {
        body: data.body,
        icon: '/icons/favicon-128x128.png',
        badge: '/icons/favicon-48x48.png',
        data: { reminderId: data.reminderId },
        actions: []
    };
    
    if (data.reminderId) {
        opts.actions.push({ action: 'snooze', title: '⏰ Отложить 5 мин' });
    }
    
    event.waitUntil(self.registration.showNotification(data.title, opts));
});

// Обработка клика
self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'snooze') {
        const id = event.notification.data?.reminderId;
        if (id) fetch(`/snooze?reminderId=${id}`, { method: 'POST' });
    }
});