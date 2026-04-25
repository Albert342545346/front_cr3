const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// 🔑 ВАШИ КЛЮЧИ (те же самые, что использовали в практике 16)
const vapidKeys = {
  publicKey: 'BFUuYSDyQ9-JqFsChjlujS6GyFi1RcNUT3akOSULscag2bn0kSVfvkvsLXapxF1GLMblPjAoGuyC4muvD5BKmpA',
  privateKey: 'tlc8tFltMjCMVSeYBLL_JRKV14TZ0_CbQZ0E2wcuwwM'
};
webpush.setVapidDetails('mailto:test@test.com', vapidKeys.publicKey, vapidKeys.privateKey);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

let subscriptions = [];
// Хранилище активных таймеров: ID -> { timeoutId, data }
const reminders = new Map();

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    console.log('Клиент подключён:', socket.id);

    // 1. Обычная задача (из практики 16)
    socket.on('newTask', (task) => {
        io.emit('taskAdded', task);
        const payload = JSON.stringify({ title: 'Новая задача', body: task.text });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
        });
    });

    // 2. НОВАЯ ЛОГИКА: Задача с напоминанием
    socket.on('newReminder', (reminder) => {
        const { id, text, reminderTime } = reminder;
        const delay = reminderTime - Date.now();

        if (delay <= 0) return; // Уже прошло

        console.log(`Установлен таймер на ${delay} мс для задачи: ${text}`);

        const timeoutId = setTimeout(() => {
            console.log(`Сработал таймер для задачи ID: ${id}`);
            const payload = JSON.stringify({ 
                title: '⏰ Напоминание', 
                body: text, 
                reminderId: id 
            });
            
            subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
            });
            
            reminders.delete(id); // Удаляем таймер из памяти
        }, delay);

        reminders.set(id, { timeoutId, text, reminderTime });
    });

    socket.on('disconnect', () => {
        console.log('Клиент отключён');
    });
});

// Эндпоинты подписки (из практики 16)
app.post('/subscribe', (req, res) => {
    subscriptions.push(req.body);
    res.status(201).json({ message: 'Подписка сохранена' });
});
app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
    res.status(200).json({ message: 'Отписка' });
});

// НОВЫЙ ЭНДПОИНТ: Отложить (Snooze) на 5 минут
app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);
    
    if (!reminders.has(reminderId)) {
        // Если таймера нет в памяти (сервер перезагружался или время вышло), просто ок
        return res.status(200).json({ message: 'Snoozed (reminder not found)' });
    }

    const reminder = reminders.get(reminderId);
    clearTimeout(reminder.timeoutId); // Останавливаем старый таймер

    const newDelay = 5 * 60 * 1000; // 5 минут
    console.log(`Откладываем задачу ID: ${reminderId} на 5 минут`);

    const newTimeoutId = setTimeout(() => {
        const payload = JSON.stringify({ 
            title: '⏰ Отложенное напоминание', 
            body: reminder.text, 
            reminderId: reminderId 
        });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
        });
        reminders.delete(reminderId);
    }, newDelay);

    reminders.set(reminderId, { timeoutId: newTimeoutId, text: reminder.text, reminderTime: Date.now() + newDelay });
    
    res.status(200).json({ message: 'Отложено на 5 минут' });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});