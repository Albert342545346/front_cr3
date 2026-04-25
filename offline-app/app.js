const contentDiv = document.getElementById('app-content');
const tabs = document.querySelectorAll('.tab');
const socket = io('http://localhost:3001');

// --- Навигация (без изменений) ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadContent(tab.dataset.page);
    });
});

async function loadContent(page) {
    contentDiv.innerHTML = '<p style="text-align:center;padding:1rem;">Загрузка...</p>';
    try {
        const res = await fetch(`/content/${page}.html`);
        contentDiv.innerHTML = await res.text();
        if (page === 'home') initNotes();
    } catch (err) {
        contentDiv.innerHTML = '<p style="color:red">Ошибка загрузки</p>';
    }
}

// --- Логика заметок (ОБНОВЛЕНО) ---
function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');
    const list = document.getElementById('notes-list');

    function loadNotes(){
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        list.innerHTML = notes.map(note => {
            let reminderInfo = '';
            if(note.reminder){
                const date = new Date(note.reminder);
                reminderInfo = `<br><small style="color:#8A8578">⏰ Напоминание: ${date.toLocaleString()}</small>`;
            }
            return `<li class="card" style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    ${note.text}${reminderInfo}
                </div>
                <div style="display: flex; gap: 5px; margin-left: 10px;">
                    <button class="btn-edit" data-id="${note.id}" style="background: #ffc107; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;">✏️</button>
                    <button class="btn-delete" data-id="${note.id}" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;">🗑️</button>
                </div>
            </li>`;
        }).join('');
    }

    function deleteNote(id){
        if(!confirm('Удалить заметку?')) return;
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();
    }

    function editNote(id){
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const note = notes.find(n => n.id === id);
        if(!note) return;
        
        const newText = prompt('Редактировать заметку:', note.text);
        if(newText !== null && newText.trim() !== ''){
            note.text = newText.trim();
            localStorage.setItem('notes', JSON.stringify(notes));
            loadNotes();
        }
    }

    function addNote(text, reminderTimestamp = null) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const newNote = { id: Date.now(), text, reminder: reminderTimestamp };
        notes.push(newNote);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();

        if (reminderTimestamp) {
            socket.emit('newReminder', { id: newNote.id, text: text, reminderTime: reminderTimestamp });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    }

    // Обработка обычной заметки
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
            addNote(text);
            input.value = '';
        }
    });

    // Обработка заметки с напоминанием
    reminderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = reminderText.value.trim();
        const datetime = reminderTime.value;
        if (text && datetime) {
            const timestamp = new Date(datetime).getTime();
            if (timestamp > Date.now()) {
                addNote(text, timestamp);
                reminderText.value = '';
                reminderTime.value = '';
            } else {
                alert('Дата напоминания должна быть в будущем');
            }
        }
    });

    loadNotes();

    // Обработчики кнопок редактирования и удаления
    list.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        const editBtn = e.target.closest('.btn-edit');
        
        if(deleteBtn){
            const id = Number(deleteBtn.dataset.id);
            deleteNote(id);
        }
        if(editBtn){
            const id = Number(editBtn.dataset.id);
            editNote(id);
        }
    });
}

// --- WebSocket (без изменений) ---
socket.on('taskAdded', (task) => {
    const notif = document.createElement('div');
    notif.textContent = `📥 Новая задача: ${task.text}`;
    notif.style.cssText = 'position:fixed;top:10px;right:10px;background:#4285f4;color:white;padding:1rem;border-radius:8px;z-index:1000;';
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
});

// --- Push (без изменений) ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array('BFUuYSDyQ9-JqFsChjlujS6GyFi1RcNUT3akOSULscag2bn0kSVfvkvsLXapxF1GLMblPjAoGuyC4muvD5BKmpA') 
            // ^^^ ВАШ ПУБЛИЧНЫЙ КЛЮЧ (оставьте тот, что генерировали ранее)
        });
        await fetch('http://localhost:3001/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
    } catch (err) { console.error('Push sub error:', err); }
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        await fetch('http://localhost:3001/unsubscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const enableBtn = document.getElementById('enable-push');
    const disableBtn = document.getElementById('disable-push');
    if (!enableBtn) return;
    
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { enableBtn.style.display = 'none'; disableBtn.style.display = 'inline-block'; }

    enableBtn.addEventListener('click', async () => {
        const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (perm === 'granted') { 
            await subscribeToPush(); 
            enableBtn.style.display = 'none'; 
            disableBtn.style.display = 'inline-block'; 
        }
    });

    disableBtn.addEventListener('click', async () => {
        await unsubscribeFromPush(); 
        disableBtn.style.display = 'none'; 
        enableBtn.style.display = 'inline-block'; 
    });
});

loadContent('home');