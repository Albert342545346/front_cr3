const CACHE_NAME = 'notes-cache-v4';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v3';

const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/icons/favicon-128x128.png',
    '/icons/favicon-256x256.png',
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
            .catch(err => {
                console.error('SW: Ошибка кэширования:', err);
            })
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
    if (url.origin !== self.location.origin) {
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
                .catch(() => {
                    // Если нет в кэше и сеть недоступна
                    if (url.pathname === '/') {
                        return caches.match('/index.html');
                    }
                })
        );
    }
});

// Push уведомления
self.addEventListener('push', event => {
    let data = { title: 'Уведомление', body: '', reminderId: null };
    if (event.data) {
        try { 
            data = event.data.json(); 
        } catch(e) { 
            data.body = event.data.text(); 
        }
    }
    
    const options = {
        body: data.body,
        icon: '/icons/favicon-128x128.png',
        badge: '/icons/favicon-128x128.png',
        vibrate: [200, 100, 200],
        data: { 
            reminderId: data.reminderId,
            url: '/'
        },
        actions: []
    };
    
    if (data.reminderId) {
        options.actions.push({ 
            action: 'snooze', 
            title: '⏰ Отложить 5 мин' 
        });
        options.actions.push({ 
            action: 'open', 
            title: '📝 Открыть' 
        });
    }
    
    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'snooze') {
        const reminderId = event.notification.data?.reminderId;
        if (reminderId) {
            fetch(`/snooze?reminderId=${reminderId}`, { method: 'POST' })
                .catch(err => console.error('Snooze error:', err));
        }
    } else {
        // Открываем приложение
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(windowClients => {
                    for (let client of windowClients) {
                        if (client.url === '/' && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});