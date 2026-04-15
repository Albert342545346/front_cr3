const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');

// Твои ключи
const PUBLIC_KEY = 'BAwgm-bZLth6Ttuz73QOrfzl5NOSwuKoXcT3Jvy8WrszEEV7aGf_-kXoHH25gg1k__DCFv0OESU0mPsTL2jU8Y4';
const PRIVATE_KEY = 'UQDw5Au8hVU-52ZbOq7hLfl87ioQSnPH0InRrYeUwJ0';

webpush.setVapidDetails('mailto:me@example.com', PUBLIC_KEY, PRIVATE_KEY);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname));
app.use(express.json());

let subscriptions = [];

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('newTask', (task) => {
        console.log('New task:', task.text);
        io.emit('taskAdded', task);
        
        const payload = JSON.stringify({ title: 'New task', body: task.text });
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(() => {});
        });
    });
});

app.post('/subscribe', (req, res) => {
    subscriptions.push(req.body);
    res.sendStatus(201);
});

app.post('/unsubscribe', (req, res) => {
    subscriptions = subscriptions.filter(s => s.endpoint !== req.body.endpoint);
    res.sendStatus(200);
});

server.listen(3000, () => {
    console.log('Server: http://localhost:3000');
});