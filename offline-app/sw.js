// sw.js - Service Worker для PWA "Заметки" (исправленная версия)

const CACHE_NAME = 'notes-cache-v3';
const DYNAMIC_CACHE = 'dynamic-content-v1';

// 📦 Ресурсы для кэширования (только существующие файлы!)
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/content/home.html',
  '/content/about.html',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-48x48.png',
  '/icons/favicon-64x64.png',
  '/icons/favicon-128x128.png',
  '/icons/favicon-256x256.png',
  '/icons/favicon-512x512.png'
];

// 🚫 URL, которые не нужно перехватывать (внешние CDN)
const EXCLUDED_URLS = [
  'https://unpkg.com/chota@latest',
  'https://cdn.socket.io',
  'google-analytics.com'
];

// ============================================================================
// 📦 УСТАНОВКА: кэшируем статику с обработкой ошибок для каждого файла
// ============================================================================
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('[SW] Кэшируем ресурсы:', ASSETS);
        
        // Кэшируем по одному файлу, чтобы ошибка одного не ломала всё
        for (const url of ASSETS) {
          try {
            await cache.add(url);
            console.log('[SW] ✓ Закэширован:', url);
          } catch (err) {
            console.warn(`[SW] ✗ Не удалось закэшировать ${url}:`, err.message);
            // Не прерываем установку — продолжаем с остальными файлами
          }
        }
      })
      .then(() => {
        console.log('[SW] Пропускаем ожидание (skipWaiting)');
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Критическая ошибка при установке:', err))
  );
});

// ============================================================================
// 🧹 АКТИВАЦИЯ: чистим старые кэши
// ============================================================================
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys()
      .then(keys => {
        console.log('[SW] Найдены кэши:', keys);
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW] Удаляю старый кэш:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => {
        console.log('[SW] Захватываю клиентов (clients.claim)');
        return self.clients.claim();
      })
      .catch(err => console.error('[SW] Ошибка при активации:', err))
  );
});

// ============================================================================
// 🌐 ПЕРЕХВАТ ЗАПРОСОВ: стратегии кэширования
// ============================================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Пропускаем не-GET запросы
  if (request.method !== 'GET') return;
  
  // Пропускаем внешние ресурсы (CDN, аналитика)
  if (EXCLUDED_URLS.some(excl => url.href.includes(excl))) return;
  
  // Пропускаем запросы к другим источникам
  if (url.origin !== location.origin) return;

  // 🎯 ДИНАМИЧЕСКИЙ КОНТЕНТ (/content/*) → Network First с кэшированием
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(
      fetch(request)
        .then(async networkRes => {
          // Кэшируем только успешные ответы
          if (networkRes && networkRes.status === 200) {
            try {
              const resClone = networkRes.clone();
              const cache = await caches.open(DYNAMIC_CACHE);
              await cache.put(request, resClone);
              console.log('[SW] 📥 Кэширован динамический:', request.url);
            } catch (err) {
              console.warn('[SW] Не удалось закэшировать динамический:', err);
            }
          }
          return networkRes;
        })
        .catch(async () => {
          // Офлайн: пробуем вернуть из кэша
          console.log('[SW] 📴 Сеть недоступна, ищу в кэше:', request.url);
          const cached = await caches.match(request);
          if (cached) {
            console.log('[SW] ✓ Возвращаю из dynamic-cache:', request.url);
            return cached;
          }
          // Фолбек на главную страницу контента
          const fallback = await caches.match('/content/home.html');
          if (fallback) {
            console.log('[SW] ✓ Возвращаю фолбек: /content/home.html');
            return fallback;
          }
          // Если ничего не найдено — возвращаем ошибку
          return new Response('Контент недоступен офлайн', { 
            status: 503, 
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 🎯 СТАТИКА → Cache First с фолбеком на сеть
  event.respondWith(
    caches.match(request)
      .then(async cached => {
        if (cached) {
          console.log('[SW] ✓ Из кэша (Cache First):', request.url);
          return cached;
        }
        
        // Если нет в кэше — пробуем сеть
        try {
          const networkRes = await fetch(request);
          
          // Кэшируем новые успешные ответы
          if (networkRes && networkRes.status === 200) {
            try {
              const resClone = networkRes.clone();
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, resClone);
              console.log('[SW] 📥 Добавлено в кэш:', request.url);
            } catch (err) {
              console.warn('[SW] Не удалось добавить в кэш:', err);
            }
          }
          return networkRes;
        } catch (err) {
          console.warn('[SW] Не удалось загрузить из сети:', request.url);
          
          // Фолбек для навигации (если запрашивают страницу)
          if (request.mode === 'navigate') {
            const fallback = await caches.match('/index.html');
            if (fallback) {
              console.log('[SW] ✓ Фолбек навигации: /index.html');
              return fallback;
            }
          }
          
          // Возвращаем ошибку, если ничего не помогло
          return new Response('Offline', { 
            status: 503, 
            statusText: 'Service Unavailable' 
          });
        }
      })
      .catch(err => {
        console.error('[SW] Ошибка в respondWith:', err);
        return new Response('Ошибка сервиса', { status: 500 });
      })
  );
});

// ============================================================================
// 🔔 PUSH-УВЕДОМЛЕНИЯ
// ============================================================================
self.addEventListener('push', event => {
  console.log('[SW] 🔔 Push received:', event.data?.text());
  
  let data = { 
    title: '📝 Заметки', 
    body: '', 
    reminderId: null,
    url: '/' // URL для перехода при клике
  };
  
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      console.error('[SW] Ошибка парсинга push-данных:', e);
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/favicon-128x128.png',
    badge: '/icons/favicon-48x48.png',
    vibrate: [100, 50, 100],
    data: { 
      reminderId: data.reminderId,
      url: data.url || '/'
    },
    requireInteraction: true,
    tag: `reminder-${data.reminderId || 'general'}`, // Группируем уведомления
    actions: []
  };
  
  // Добавляем действия только для напоминаний
  if (data.reminderId) {
    options.actions = [
      { 
        action: 'snooze', 
        title: '⏸ Отложить на 5 мин',
        icon: '/icons/favicon-48x48.png'
      },
      {
        action: 'dismiss',
        title: '✕ Закрыть'
      }
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .catch(err => console.error('[SW] Ошибка показа уведомления:', err))
  );
});

// ============================================================================
// 👆 ОБРАБОТКА КЛИКА ПО УВЕДОМЛЕНИЮ
// ============================================================================
self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const action = event.action;
  const targetUrl = notification.data?.url || '/';
  
  console.log('[SW] 👆 Notification click:', { action, url: targetUrl });
  
  // Обязательно закрываем уведомление
  notification.close();

  if (action === 'snooze') {
    // 🔄 Обработка "Отложить"
    const reminderId = notification.data?.reminderId;
    
    if (reminderId) {
      event.waitUntil(
        fetch(`/snooze?reminderId=${reminderId}`, { 
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }
        })
          .then(async res => {
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Snooze failed: ${res.status} ${errText}`);
            }
            console.log('[SW] ✅ Reminder snoozed successfully');
            
            // Показываем подтверждение (опционально)
            return self.registration.showNotification('⏸ Отложено', {
              body: 'Напоминание перенесено на 5 минут',
              icon: '/icons/favicon-128x128.png',
              tag: 'snooze-confirm'
            });
          })
          .catch(err => {
            console.error('[SW] ❌ Ошибка snooze:', err);
            // Показываем ошибку пользователю
            return self.registration.showNotification('⚠️ Ошибка', {
              body: 'Не удалось отложить напоминание',
              icon: '/icons/favicon-128x128.png',
              tag: 'error'
            });
          })
      );
    }
  } 
  else if (action === 'dismiss') {
    // Просто закрываем — ничего не делаем
    console.log('[SW] ✕ Уведомление закрыто пользователем');
  } 
  else {
    // 🎯 Обычный клик — открываем приложение
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
          // Ищем уже открытую вкладку с нужным URL
          for (const client of windowClients) {
            if (client.url === targetUrl && 'focus' in client) {
              console.log('[SW] 🎯 Фокусирую существующую вкладку');
              return client.focus();
            }
          }
          // Если нет — открываем новую
          if (clients.openWindow) {
            console.log('[SW] 🎯 Открываю новую вкладку:', targetUrl);
            return clients.openWindow(targetUrl);
          }
        })
        .catch(err => console.error('[SW] Ошибка работы с клиентами:', err))
    );
  }
});

// ============================================================================
// 🔄 ФОНОВАЯ СИНХРОНИЗАЦИЯ (опционально, для офлайн-отправки)
// ============================================================================
self.addEventListener('sync', event => {
  console.log('[SW] 🔄 Sync event:', event.tag);
  
  if (event.tag === 'sync-notes') {
    event.waitUntil(
      // Здесь можно добавить логику отправки накопленных офлайн-заметок
      fetch('/api/sync', { 
        method: 'POST',
        credentials: 'same-origin'
      })
        .then(res => res.json())
        .catch(err => console.error('[SW] Sync failed:', err))
    );
  }
});

// ============================================================================
// 📩 СООБЩЕНИЯ ОТ КЛИЕНТА (для управления кэшем и обновлениями)
// ============================================================================
self.addEventListener('message', event => {
  console.log('[SW] 📨 Message from client:', event.data);
  
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] 🔄 Принудительное обновление');
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    console.log('[SW] 🧹 Очистка кэша по запросу');
    event.waitUntil(
      caches.delete(CACHE_NAME)
        .then(() => console.log('[SW] ✓ Кэш очищен'))
        .catch(err => console.error('[SW] Ошибка очистки кэша:', err))
    );
  }
  
  if (event.data?.type === 'GET_CACHE_STATUS') {
    // Отправляем клиенту информацию о кэше
    event.waitUntil(
      caches.keys()
        .then(keys => caches.open(CACHE_NAME))
        .then(cache => cache.keys())
        .then(requests => {
          const urls = requests.map(r => r.url);
          event.ports?.[0]?.postMessage({ cached: urls });
        })
    );
  }
});