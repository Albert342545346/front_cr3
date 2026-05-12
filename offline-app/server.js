const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// 🔑 VAPID-ключи (ВАШИ РЕАЛЬНЫЕ КЛЮЧИ)
const vapidKeys = {
  publicKey: 'BOiKuoUf_vvD8unOtts9_Epbxwr1codeq9ErZ2wDKHsU4oijUIV48VHs5i8tXZjxBwHmu72OJZBzaPHbSyQWPuk',
  privateKey: 'IZVu6BXjP3_85nGR8uQAlgEIrzUeU75gOUqP2S36mFk'
};

webpush.setVapidDetails('mailto:your-email@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// 📡 HTTPS-сервер с сертификатами mkcert
const httpsOptions = {
  key: fs.readFileSync('localhost+2-key.pem'),
  cert: fs.readFileSync('localhost+2.pem')
};
const server = https.createServer(httpsOptions, app);

// 🔌 Socket.IO
const io = socketIo(server, { 
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] } 
});

// Хранилища
let subscriptions = [];
const reminders = new Map(); // id -> { timeoutId, text, reminderTime }

// 🔌 WebSocket подключения
io.on('connection', (socket) => {
  console.log('✅ Клиент подключён:', socket.id);

  // 📝 Новая задача (без напоминания)
  socket.on('newTask', (task) => {
    io.emit('taskAdded', task);
    
    const payload = JSON.stringify({ 
      title: '📝 Новая задача', 
      body: task.text 
    });
    
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
    });
  });

  // ⏰ Новая задача с напоминанием
  socket.on('newReminder', (reminder) => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    
    if (delay <= 0) {
      console.log('⚠️ Напоминание уже просрочено');
      return;
    }

    console.log(`⏰ Запланировано напоминание #${id} через ${delay/1000} сек`);

    const timeoutId = setTimeout(() => {
      console.log('🔔 Срабатывание напоминания #${id}:', text);
      
      const payload = JSON.stringify({ 
        title: '⏰ Напоминание', 
        body: text, 
        reminderId: id 
      });
      
      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
      });
      
      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  // 🗑️ Отмена напоминания при удалении заметки
  socket.on('cancelReminder', ({ id }) => {
    console.log(`🗑️ Отмена напоминания #${id}`);
    
    if (reminders.has(id)) {
      const reminder = reminders.get(id);
      clearTimeout(reminder.timeoutId);
      reminders.delete(id);
      console.log(`✅ Напоминание #${id} отменено`);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Клиент отключён:', socket.id);
  });
});

// 📬 Эндпоинты
app.post('/subscribe', (req, res) => {
  if (!subscriptions.some(s => s.endpoint === req.body.endpoint)) {
    subscriptions.push(req.body);
    console.log('✅ Подписка сохранена. Всего:', subscriptions.length);
  }
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  console.log('🗑️ Подписка удалена. Осталось:', subscriptions.length);
  res.status(200).json({ message: 'Подписка удалена' });
});

// ⏸ Snooze - отложить на 5 минут
app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  
  if (!reminderId || !reminders.has(reminderId)) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  const reminder = reminders.get(reminderId);
  clearTimeout(reminder.timeoutId);

  const newDelay = 5 * 60 * 1000;
  
  const newTimeoutId = setTimeout(() => {
    const payload = JSON.stringify({ 
      title: '🔁 Напоминание отложено', 
      body: reminder.text, 
      reminderId: reminderId 
    });
    
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
    });
    
    reminders.delete(reminderId);
  }, newDelay);

  reminders.set(reminderId, { 
    timeoutId: newTimeoutId, 
    text: reminder.text, 
    reminderTime: Date.now() + newDelay 
  });
  
  console.log('✅ Напоминание #${reminderId} отложено на 5 минут');
  res.status(200).json({ message: 'Snoozed for 5 minutes' });
});

// 🚀 Запуск
const PORT = 3001;
server.listen(PORT, () => {
  console.log('\n🔒 ========================================');
  console.log('🔒 HTTPS-сервер запущен: https://localhost:' + PORT);
  console.log('🔒 ========================================\n');
});

// Обработка ошибок
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
});