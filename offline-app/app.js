// app.js - Полная клиентская логика для PWA "Заметки" (практики 13-17)
// ✅ Service Worker + Manifest + HTTPS/App Shell + WebSocket + Push + Reminders

// 🎯 Глобальные элементы
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const enableBtn = document.getElementById('enable-push');
const disableBtn = document.getElementById('disable-push');

// 🔗 Подключение к серверу (HTTPS + надёжная реконнекция)
const socket = io('https://localhost:3001', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

// 📡 Статус WebSocket-подключения
socket.on('connect', () => {
  console.log('✅ Socket.IO подключён:', socket.id);
  showNotification('🟢 Соединение установлено', 'success');
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket.IO отключён:', reason);
  showNotification('🔴 Соединение потеряно', 'error');
});

socket.on('connect_error', (err) => {
  console.error('❌ Ошибка подключения:', err.message);
  showNotification('⚠️ Не удалось подключиться к серверу', 'error');
});

// 🌐 Навигация (App Shell архитектура)
function setActiveButton(id) {
  [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

async function loadContent(page) {
  // Показываем индикатор загрузки
  if (contentDiv) {
    contentDiv.innerHTML = '<div class="is-center" style="padding:3rem;color:#78909C">⏳ Загрузка...</div>';
  }
  
  try {
    // Для App Shell: используем кэш, но проверяем актуальность
    const res = await fetch(`/content/${page}.html`, { 
      cache: 'force-cache',
      credentials: 'same-origin'
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    if (contentDiv) {
      contentDiv.innerHTML = html;
      if (page === 'home') initNotes();
    }
  } catch (err) {
    console.error('❌ Ошибка загрузки контента:', err);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="card is-center">
          <p class="text-error">⚠️ Ошибка загрузки страницы</p>
          <p style="color:#78909C;margin:1rem 0">Проверьте подключение к интернету</p>
          <button class="button primary" onclick="location.reload()">🔄 Обновить</button>
        </div>`;
    }
  }
}

// Обработчики навигации
homeBtn?.addEventListener('click', () => { 
  setActiveButton('home-btn'); 
  loadContent('home'); 
});

aboutBtn?.addEventListener('click', () => { 
  setActiveButton('about-btn'); 
  loadContent('about'); 
});

// Загружаем главную страницу при старте
document.addEventListener('DOMContentLoaded', () => {
  loadContent('home');
});

// 📝 Логика заметок (localStorage + синхронизация с сервером)
function initNotes() {
  const form = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  const reminderForm = document.getElementById('reminder-form');
  const reminderText = document.getElementById('reminder-text');
  const reminderTime = document.getElementById('reminder-time');
  const list = document.getElementById('notes-list');

  // 🔍 Загрузка заметок из localStorage
  function loadNotes() {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    
    if (notes.length === 0) {
      if (list) {
        list.innerHTML = '<li class="empty-state">📭 Нет заметок. Добавьте первую!</li>';
      }
      return;
    }
    
    // Сортировка: сначала с напоминаниями, потом по времени создания (новые сверху)
    notes.sort((a, b) => {
      if (a.reminder && !b.reminder) return -1;
      if (!a.reminder && b.reminder) return 1;
      return b.id - a.id;
    });
    
    if (list) {
      list.innerHTML = notes.map(note => {
        const timeInfo = note.reminder 
          ? `<br><small class="text-muted">⏰ ${new Date(note.reminder).toLocaleString('ru-RU')}</small>` 
          : '';
        return `
          <li class="card" data-id="${note.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
              <div style="flex:1;word-break:break-word;">
                <strong>${escapeHtml(note.text)}</strong>${timeInfo}
              </div>
              <div style="display:flex;gap:0.5rem;flex-shrink:0;">
                <button class="button edit-btn" data-id="${note.id}" title="Редактировать"
                  style="padding:0.4rem 0.8rem;background:#1976D2;font-size:0.9rem;border:none;border-radius:6px;color:white;cursor:pointer;">✏️</button>
                <button class="button delete-btn" data-id="${note.id}" title="Удалить"
                  style="padding:0.4rem 0.8rem;background:#E53935;font-size:0.9rem;border:none;border-radius:6px;color:white;cursor:pointer;">🗑️</button>
              </div>
            </div>
          </li>`;
      }).join('');
    }

    // 🔥 Навешиваем обработчики на динамические кнопки
    if (list) {
      list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          deleteNote(id);
        });
      });

      list.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          editNote(id);
        });
      });
    }
  }

  // ➕ Добавление заметки
  function addNote(text, reminderTimestamp = null) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const newNote = { 
      id: Date.now(), 
      text, 
      reminder: reminderTimestamp,
      created: Date.now()
    };
    notes.push(newNote);
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotes();

    // Отправляем событие на сервер для синхронизации
    if (reminderTimestamp) {
      // 📤 Практика 17: отправка напоминания на сервер
      socket.emit('newReminder', { 
        id: newNote.id, 
        text, 
        reminderTime: reminderTimestamp 
      });
      showNotification('⏰ Напоминание запланировано', 'success');
    } else {
      // 📤 Практика 16: отправка обычной задачи
      socket.emit('newTask', { 
        text, 
        timestamp: Date.now() 
      });
    }
  }

  // ✏️ Редактирование заметки
  function editNote(id) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const note = notes.find(n => n.id === id);
    if (!note) return;

    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;
      z-index:10000;animation:fadeIn 0.2s ease;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal';
    modalContent.style.cssText = `
      background:white;border-radius:12px;padding:2rem;max-width:500px;width:90%;
      box-shadow:0 10px 40px rgba(0,0,0,0.3);
    `;
    
    // Формируем значение для datetime-local (формат YYYY-MM-DDTHH:mm)
    const reminderValue = note.reminder 
      ? new Date(note.reminder).toISOString().slice(0, 16) 
      : '';
    
    modalContent.innerHTML = `
      <h3 style="margin:0 0 1.5rem;text-align:center;">✏️ Редактировать заметку</h3>
      <textarea id="edit-text" style="width:100%;min-height:80px;padding:0.8rem;border:2px solid #E0E0E0;border-radius:8px;font-size:1rem;margin-bottom:1rem;resize:vertical;">${escapeHtml(note.text)}</textarea>
      ${note.reminder ? `
        <label style="display:block;margin-bottom:0.5rem;font-weight:500;">⏰ Новое время напоминания:</label>
        <input type="datetime-local" id="edit-reminder" value="${reminderValue}" 
          style="width:100%;padding:0.8rem;border:2px solid #E0E0E0;border-radius:8px;margin-bottom:1.5rem;">
      ` : ''}
      <div style="display:flex;gap:1rem;justify-content:flex-end;">
        <button id="edit-cancel" class="button" style="background:#78909C;color:white;padding:0.8rem 1.5rem;border:none;border-radius:8px;cursor:pointer;">Отмена</button>
        <button id="edit-save" class="button primary" style="background:#4CAF50;color:white;padding:0.8rem 1.5rem;border:none;border-radius:8px;cursor:pointer;">💾 Сохранить</button>
      </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Обработчики
    const cancelBtn = document.getElementById('edit-cancel');
    const saveBtn = document.getElementById('edit-save');
    const editInput = document.getElementById('edit-text');
    const editReminder = document.getElementById('edit-reminder');

    const closeModal = () => modal.remove();
    
    cancelBtn?.addEventListener('click', closeModal);
    
    saveBtn?.addEventListener('click', () => {
      const newText = editInput?.value.trim();
      const newReminder = editReminder?.value;
      
      if (!newText) {
        alert('⚠️ Текст заметки не может быть пустым!');
        return;
      }
      
      // Обновляем в localStorage
      const updatedNotes = notes.map(n => {
        if (n.id === id) {
          return {
            ...n,
            text: newText,
            reminder: newReminder ? new Date(newReminder).getTime() : n.reminder,
            updated: Date.now()
          };
        }
        return n;
      });
      
      localStorage.setItem('notes', JSON.stringify(updatedNotes));
      loadNotes();
      closeModal();
      showNotification('✅ Заметка обновлена', 'success');
      
      // 🔁 Если изменили время напоминания — можно отправить на сервер для обновления таймера
      if (newReminder && note.reminder) {
        const newTime = new Date(newReminder).getTime();
        if (newTime !== note.reminder) {
          // Отменяем старое и создаём новое напоминание на сервере
          socket.emit('cancelReminder', { id });
          socket.emit('newReminder', { id, text: newText, reminderTime: newTime });
        }
      }
    });
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', onEsc);
      }
    }, { once: true });
  }

  // 🗑️ Удаление заметки
  function deleteNote(id) {
    if (!confirm('🗑️ Удалить эту заметку?\nЭто действие нельзя отменить.')) return;
    
    let notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const note = notes.find(n => n.id === id);
    
    // Фильтруем массив, удаляя заметку
    notes = notes.filter(n => n.id !== id);
    localStorage.setItem('notes', JSON.stringify(notes));
    
    // 🔥 Если у заметки было напоминание — отменяем его на сервере (Практика 17)
    if (note?.reminder) {
      socket.emit('cancelReminder', { id });
      console.log(`🗑️ Запрос на отмену напоминания #${id} отправлен на сервер`);
    }
    
    loadNotes();
    showNotification('🗑️ Заметка удалена', 'info');
  }

  // 📋 Обработка формы обычной заметки
  if (form && input) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) { 
        addNote(text); 
        input.value = ''; 
        input.focus();
      }
    });
  }

  // ⏰ Обработка формы с напоминанием (Практика 17)
  if (reminderForm && reminderText && reminderTime) {
    // Устанавливаем минимальную дату = сейчас + 1 минута
    const updateMinDate = () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      now.setSeconds(0);
      now.setMilliseconds(0);
      reminderTime.min = now.toISOString().slice(0, 16);
    };
    updateMinDate();
    
    reminderForm.addEventListener('submit', e => {
      e.preventDefault();
      const text = reminderText.value.trim();
      const dt = reminderTime.value;
      
      if (text && dt) {
        const ts = new Date(dt).getTime();
        if (ts > Date.now()) { 
          addNote(text, ts); 
          reminderText.value = ''; 
          reminderTime.value = '';
          updateMinDate();
        } else {
          alert('⚠️ Выберите время в будущем!');
        }
      }
    });
  }

  // Первоначальная загрузка списка
  loadNotes();
}

// 🛡️ Экранирование HTML для защиты от XSS-атак
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 📡 WebSocket: получение событий от других клиентов (Практика 16)
socket.on('taskAdded', task => {
  console.log('📨 Получено событие от сервера:', task);
  // Показываем уведомление только если пользователь не на главной странице
  if (document.getElementById('home-btn')?.classList.contains('active')) {
    showNotification(`📩 ${task.text}`, 'info');
  }
});

// 🔔 Вспомогательная функция: конвертация VAPID-ключа из base64url в Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 🔔 Push: подписка на уведомления (Практики 16-17)
async function subscribeToPush() {
  // Проверяем поддержку API
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('❌ Push API не поддерживается в этом браузере');
    showNotification('⚠️ Push-уведомления не поддерживаются', 'error');
    return false;
  }
  
  try {
    // Запрашиваем разрешение, если ещё не дано
    if (Notification.permission === 'denied') {
      throw new Error('Уведомления запрещены. Разрешите их в настройках браузера.');
    }
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Пользователь не разрешил уведомления');
      }
    }
    
    // Получаем активную регистрацию Service Worker
    const reg = await navigator.serviceWorker.ready;
    
    // Создаём подписку с публичным VAPID-ключом
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BOiKuoUf_vvD8unOtts9_Epbxwr1codeq9ErZ2wDKHsU4oijUIV48VHs5i8tXZjxBwHmu72OJZBzaPHbSyQWPuk')
    });
    
    // Отправляем подписку на сервер для хранения
    const response = await fetch('https://localhost:3001/subscribe', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(subscription),
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || 'Server error');
    }
    
    console.log('✅ Push-подписка активирована');
    return true;
  } catch (err) { 
    console.error('❌ Push sub error:', err); 
    showNotification(`⚠️ Ошибка: ${err.message}`, 'error');
    return false;
  }
}

// 🔕 Push: отписка от уведомлений
async function unsubscribeFromPush() {
  if (!('PushManager' in window)) return;
  
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    
    if (sub) {
      // Удаляем подписку на сервере
      await fetch('https://localhost:3001/unsubscribe', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ endpoint: sub.endpoint }),
        credentials: 'same-origin'
      });
      
      // Отписываемся в браузере
      await sub.unsubscribe();
      console.log('✅ Push-подписка отключена');
      return true;
    }
    return false;
  } catch (err) {
    console.error('❌ Push unsubscribe error:', err);
    return false;
  }
}

// 🎨 Вспомогательная функция: показ уведомлений в интерфейсе
function showNotification(message, type = 'info') {
  // Удаляем предыдущие уведомления
  document.querySelectorAll('.app-notification').forEach(el => el.remove());
  
  const colors = {
    error: '#E53935',
    success: '#43A047',
    info: '#1976D2',
    warning: '#FB8C00'
  };
  
  const notif = document.createElement('div');
  notif.className = `app-notification notification-${type}`;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background: ${colors[type] || colors.info};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 9999;
    animation: slideIn 0.3s ease;
    font-weight: 500;
    max-width: 350px;
    word-wrap: break-word;
  `;
  notif.textContent = message;
  
  document.body.appendChild(notif);
  
  // Автоудаление через 3.5 секунды
  setTimeout(() => {
    notif.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    notif.style.opacity = '0';
    notif.style.transform = 'translateX(20px)';
    setTimeout(() => notif.remove(), 300);
  }, 3500);
}

// 📲 Регистрация Service Worker и кнопок Push (Практики 13-16)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Проверяем безопасный контекст (требуется для SW и Push)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('⚠️ Service Worker требует HTTPS или localhost');
      }
      
      // Регистрируем Service Worker
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('✅ SW registered:', reg.scope);

      // Обновляем состояние кнопок в зависимости от текущей подписки
      if (enableBtn && disableBtn) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { 
          enableBtn.style.display = 'none'; 
          disableBtn.style.display = 'inline-block'; 
        } else {
          enableBtn.style.display = 'inline-block';
          disableBtn.style.display = 'none';
        }
      }

      // Обработчик кнопки "Включить уведомления"
      enableBtn?.addEventListener('click', async () => {
        const success = await subscribeToPush();
        if (success && enableBtn && disableBtn) {
          enableBtn.style.display = 'none'; 
          disableBtn.style.display = 'inline-block';
        }
      });

      // Обработчик кнопки "Отключить уведомления"
      disableBtn?.addEventListener('click', async () => {
        const success = await unsubscribeFromPush();
        if (success && enableBtn && disableBtn) {
          disableBtn.style.display = 'none'; 
          enableBtn.style.display = 'inline-block';
        }
      });
      
    } catch (err) { 
      console.error('❌ SW reg failed:', err); 
      showNotification('⚠️ Ошибка регистрации Service Worker', 'error');
    }
  });
  
  // Реакция на обновление Service Worker
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker обновлён — перезагружаем страницу для применения изменений');
    // Можно показать пользователю кнопку "Обновить", но авто-перезагрузка может быть навязчивой
    // location.reload();
  });
}

// 🎨 Добавляем анимации динамически (чтобы не зависеть от style.css)
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .text-muted { color: #78909C; font-size: 0.85rem; }
  .empty-state { text-align: center; padding: 3rem; color: #78909C; }
  .card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); transform: translateY(-2px); }
`;
document.head.appendChild(style);

// 🔄 Обработка изменения сетевого статуса (Практика 13: офлайн-режим)
window.addEventListener('online', () => {
  console.log('🌐 Сеть доступна');
  showNotification('🌐 Соединение восстановлено', 'success');
  // Можно здесь инициировать синхронизацию офлайн-данных с сервером
});

window.addEventListener('offline', () => {
  console.log('📴 Работа в офлайн-режиме');
  showNotification('📴 Нет соединения. Работаем офлайн.', 'warning');
  // Все данные сохраняются в localStorage, синхронизация произойдёт при восстановлении сети
});

// 💡 Дополнительно: обработка перед закрытием вкладки (опционально)
window.addEventListener('beforeunload', (e) => {
  // Можно сохранить состояние или отправить финальные события на сервер
  // Но браузеры ограничивают асинхронные операции здесь
});