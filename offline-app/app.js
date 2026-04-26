const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const socket = io('http://localhost:3001');

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

    // 🔥 ОТРИСОВКА с кнопками ✏️️
    function render() {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        list.innerHTML = notes.map(n => {
            const info = n.reminder ? 
                `<small style="color:#667eea; display:block; margin-top:4px;">⏰ ${new Date(n.reminder).toLocaleString()}</small>` : '';
            return `
            <li style="display:flex; justify-content:space-between; align-items:center; padding:1rem; margin-bottom:0.7rem; background:#fff; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="flex:1;">
                    <strong>${n.text}</strong>
                    ${info}
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-edit" data-id="${n.id}" style="background:#ffc107; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:14px;">✏️</button>
                    <button class="btn-delete" data-id="${n.id}" style="background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:14px;">🗑️</button>
                </div>
            </li>`;
        }).join('');
    }

    // 🔥 ДОБАВЛЕНИЕ
    function addNote(text, reminder = null) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes.push({ id: Date.now(), text, reminder });
        localStorage.setItem('notes', JSON.stringify(notes));
        render();
        
        if (reminder) {
            socket.emit('newReminder', { id: Date.now(), text, reminderTime: reminder });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    }

    // 🔥 УДАЛЕНИЕ из localStorage
    function deleteNote(id) {
        if (!confirm('Удалить эту заметку?')) return;
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        // Если массив пустой - удаляем ключ полностью
        if (notes.length === 0) {
            localStorage.removeItem('notes');
        } else {
            localStorage.setItem('notes', JSON.stringify(notes));
        }
        render();
    }

    // 🔥 РЕДАКТИРОВАНИЕ в localStorage
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

    // 🔥 КНОПКИ ✏️🗑️ - делегирование
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

// === WebSocket ===
socket.on('taskAdded', task => {
    const n = document.createElement('div');
    n.textContent = `📥 ${task.text}`;
    n.style.cssText = 'position:fixed;top:10px;right:10px;background:#4285f4;color:#fff;padding:1rem;border-radius:8px;z-index:1000;';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
});

// === Push API ===
const VAPID_KEY = 'BFUuYSDyQ9-JqFsChjlujS6GyFi1RcNUT3akOSULscag2bn0kSVfvkvsLXapxF1GLMblPjAoGuyC4muvD5BKmpA';

function b64ToUint8(b64) {
    const p = '='.repeat((4 - b64.length % 4) % 4);
    const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
    const a = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) a[i] = r.charCodeAt(i);
    return a;
}

async function subscribePush() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(VAPID_KEY)
    });
    await fetch('http://localhost:3001/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
    });
}

async function unsubscribePush() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        await fetch('http://localhost:3001/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
    }
}

// === Регистрация SW + кнопки ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        await navigator.serviceWorker.register('/sw.js');
        const onBtn = document.getElementById('enable-push');
        const offBtn = document.getElementById('disable-push');
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        
        if (sub) {
            onBtn.style.display = 'none';
            offBtn.style.display = 'inline-block';
        }

        onBtn.onclick = async () => {
            const perm = Notification.permission === 'default' ? 
                await Notification.requestPermission() : Notification.permission;
            if (perm === 'granted') {
                await subscribePush();
                onBtn.style.display = 'none';
                offBtn.style.display = 'inline-block';
            }
        };

        offBtn.onclick = async () => {
            await unsubscribePush();
            offBtn.style.display = 'none';
            onBtn.style.display = 'inline-block';
        };
    });
}