const socket = io();

let notes = JSON.parse(localStorage.getItem('notes') || '[]');

function save() {
    localStorage.setItem('notes', JSON.stringify(notes));
    render();
    updateCount();
}

function updateCount() {
    const counter = document.getElementById('notesCount');
    if (counter) {
        counter.textContent = notes.length;
    }
}

function render() {
    const container = document.getElementById('notesList');
    if (!container) return;
    
    if (notes.length === 0) {
        container.innerHTML = '<div class="empty-message">Пока нет заметок. Добавьте первую!</div>';
        return;
    }
    
    let html = '';
    for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        html += `
            <div class="note">
                <div>
                    <div class="note-text">${escapeHtml(n.text)}</div>
                    <div class="note-date">${new Date(n.date).toLocaleString('ru-RU')}</div>
                </div>
                <button class="delete" onclick="deleteNote(${n.id})">Удалить</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.deleteNote = (id) => {
    notes = notes.filter(n => n.id !== id);
    save();
    showToast('Заметка удалена');
};

function addNote(text) {
    const newNote = {
        id: Date.now(),
        text: text,
        date: new Date().toISOString()
    };
    notes.push(newNote);
    save();
    socket.emit('newTask', { text: text });
    showToast('Заметка добавлена');
}

document.getElementById('addBtn').onclick = () => {
    const input = document.getElementById('noteInput');
    const text = input.value.trim();
    if (!text) {
        showToast('Напишите что-нибудь');
        return;
    }
    addNote(text);
    input.value = '';
};

document.getElementById('noteInput').onkeypress = (e) => {
    if (e.key === 'Enter') {
        document.getElementById('addBtn').click();
    }
};

socket.on('taskAdded', (task) => {
    showToast('Новая заметка: ' + task.text);
    notes = JSON.parse(localStorage.getItem('notes') || '[]');
    render();
    updateCount();
});

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

const VAPID_KEY = 'BAwgm-bZLth6Ttuz73QOrfzl5NOSwuKoXcT3Jvy8WrszEEV7aGf_-kXoHH25gg1k__DCFv0OESU0mPsTL2jU8Y4';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator)) {
        showToast('Ваш браузер не поддерживает уведомления');
        return;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
        });
        await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
        });
        showToast('Уведомления включены');
    } catch (err) {
        console.error(err);
        showToast('Ошибка при включении уведомлений');
    }
}

async function unsubscribeFromPush() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        await fetch('/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
        showToast('Уведомления выключены');
    }
}

const enableBtn = document.getElementById('enablePush');
const disableBtn = document.getElementById('disablePush');

if (enableBtn) {
    enableBtn.onclick = async () => {
        if (Notification.permission === 'denied') {
            showToast('Уведомления запрещены в настройках браузера');
            return;
        }
        if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') {
                showToast('Нужно разрешить уведомления');
                return;
            }
        }
        await subscribeToPush();
        enableBtn.style.display = 'none';
        disableBtn.style.display = 'inline-block';
    };
}

if (disableBtn) {
    disableBtn.onclick = async () => {
        await unsubscribeFromPush();
        disableBtn.style.display = 'none';
        enableBtn.style.display = 'inline-block';
    };
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => {
        console.log('Service Worker зарегистрирован');
    });
}

render();
updateCount();