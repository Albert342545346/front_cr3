// Автоматическое определение адреса сервера
const socket = io(); // Использует текущий адрес страницы

const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');

// === НАВИГАЦИЯ ===
function setActive(btn) {
    [homeBtn, aboutBtn].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function loadContent(page) {
    try {
        const res = await fetch(`/content/${page}.html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        contentDiv.innerHTML = await res.text();
        if (page === 'home') initNotes();
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        contentDiv.innerHTML = '<p class="is-center" style="color:red; padding:2rem;">Ошибка загрузки контента</p>';
    }
}

homeBtn.onclick = () => { setActive(homeBtn); loadContent('home'); };
aboutBtn.onclick = () => { setActive(aboutBtn); loadContent('about'); };
loadContent('home');

// === ЛОГИКА ЗАМЕТОК ===
function initNotes() {
    const noteForm = document.getElementById('note-form');
    const noteInput = document.getElementById('note-input');
    const rForm = document.getElementById('reminder-form');
    const rText = document.getElementById('reminder-text');
    const rTime = document.getElementById('reminder-time');
    const list = document.getElementById('notes-list');

    // Отрисовка с кнопками
    function render() {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        if (notes.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#666; padding:2rem;">Нет заметок. Создайте первую!</p>';
            return;
        }
        
        list.innerHTML = notes.map(n => {
            const info = n.reminder ? 
                `<small style="color:#667eea; display:block; margin-top:4px;">⏰ ${new Date(n.reminder).toLocaleString()}</small>` : '';
            return `
            <li style="display:flex; justify-content:space-between; align-items:center; padding:1rem; margin-bottom:0.7rem; background:#fff; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="flex:1;">
                    <strong>${escapeHtml(n.text)}</strong>
                    ${info}
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-edit" data-id="${n.id}" style="background:#ffc107; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:14px;">✏️</button>
                    <button class="btn-delete" data-id="${n.id}" style="background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:14px;">🗑️</button>
                </div>
            </li>`;
        }).join('');
    }

    // Функция для экранирования HTML
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Добавление заметки
    function addNote(text, reminder = null) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const newNote = { id: Date.now(), text, reminder };
        notes.push(newNote);
        localStorage.setItem('notes', JSON.stringify(notes));
        render();
        
        if (reminder) {
            socket.emit('newReminder', { id: newNote.id, text, reminderTime: reminder });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    }

    // Удаление заметки
    function deleteNote(id) {
        if (!confirm('Удалить эту заметку?')) return;
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        if (notes.length === 0) {
            localStorage.removeItem('notes');
        } else {
            localStorage.setItem('notes', JSON.stringify(notes));
        }
        render();
    }

    // Редактирование заметки
    function editNote(id) {
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        const newText = prompt('Редактировать заметку:', note.text);
        if (newText !== null && newText.trim() !== '') {
            note.text = newText.trim();
            localStorage.setItem('notes', JSON.stringify(notes));
            render();
        }
    }

    // Обработчик обычной формы
    if (noteForm && noteInput) {
        noteForm.onsubmit = e => {
            e.preventDefault();
            if (noteInput.value.trim()) {
                addNote(noteInput.value.trim());
                noteInput.value = '';
            }
        };
    }

    // Обработчик формы с напоминанием
    if (rForm && rText && rTime) {
        rForm.onsubmit = e => {
            e.preventDefault();
            if (rText.value.trim() && rTime.value) {
                const ts = new Date(rTime.value).getTime();
                if (ts > Date.now()) {
                    addNote(rText.value.trim(), ts);
                    rText.value = '';
                    rTime.value = '';
                } else {
                    alert('Время должно быть в будущем');
                }
            }
        };
    }

    // Делегирование событий для кнопок
    if (list) {
        list.onclick = e => {
            const id = Number(e.target.dataset.id);
            if (e.target.classList.contains('btn-delete')) {
                deleteNote(id);
            }
            if (e.target.classList.contains('btn-edit')) {
                editNote(id);
            }
        };
    }

    render();
}

// === WebSocket уведомления ===
socket.on('taskAdded', task => {
    const notification = document.createElement('div');
    notification.textContent = `📥 Новая задача: ${task.text}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
});

// Добавляем CSS анимации
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// === Push API ===
const VAPID_KEY = 'BFUuYSDyQ9-JqFsChjlujS6GyFi1RcNUT3akOSULscag2bn0kSVfvkvsLXapxF1GLMblPjAoGuyC4muvD5BKmpA';

function b64ToUint8(b64) {
    const padding = '='.repeat((4 - b64.length % 4) % 4);
    const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribePush() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: b64ToUint8(VAPID_KEY)
        });
        
        const response = await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
        });
        
        if (response.ok) {
            console.log('Подписка на push уведомления успешна');
            return true;
        }
    } catch (err) {
        console.error('Ошибка подписки:', err);
    }
    return false;
}

async function unsubscribePush() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await fetch('/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: sub.endpoint })
            });
            await sub.unsubscribe();
            console.log('Отписка от push уведомлений успешна');
            return true;
        }
    } catch (err) {
        console.error('Ошибка отписки:', err);
    }
    return false;
}

// === Регистрация Service Worker ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker зарегистрирован:', registration);
            
            const onBtn = document.getElementById('enable-push');
            const offBtn = document.getElementById('disable-push');
            
            if (onBtn && offBtn) {
                const sub = await registration.pushManager.getSubscription();
                
                if (sub) {
                    onBtn.style.display = 'none';
                    offBtn.style.display = 'inline-block';
                } else {
                    onBtn.style.display = 'inline-block';
                    offBtn.style.display = 'none';
                }
                
                onBtn.onclick = async () => {
                    if (Notification.permission === 'default') {
                        await Notification.requestPermission();
                    }
                    
                    if (Notification.permission === 'granted') {
                        const success = await subscribePush();
                        if (success) {
                            onBtn.style.display = 'none';
                            offBtn.style.display = 'inline-block';
                        }
                    } else {
                        alert('Для получения уведомлений разрешите их в настройках браузера');
                    }
                };
                
                offBtn.onclick = async () => {
                    await unsubscribePush();
                    offBtn.style.display = 'none';
                    onBtn.style.display = 'inline-block';
                };
            }
        } catch (err) {
            console.error('Ошибка регистрации Service Worker:', err);
        }
    });
}