const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const PORT = 3000;

app.use(express.static(path.join(__dirname, '../client')));

let eventLog = [];
let isLogging = false;
let eventInterval = null;
let eventIdCounter = 1;

const EVENT_TYPES = ['process', 'cpu', 'memory', 'file', 'network', 'error'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEvent() {
  const type = randChoice(EVENT_TYPES);
  let message = '';
  let cpuUsage = randInt(5, 95);
  let memUsage = randInt(20, 90);
  let severity = 'info';

  const processes = ['chrome.exe', 'node.exe', 'python.py', 'bash', 'nginx', 'mysqld'];
  const files = ['/etc/hosts', '/var/log/syslog', '/tmp/cache.tmp', '/home/user/docs/report.pdf'];
  const ips = ['192.168.1.10', '10.0.0.5', '8.8.8.8', '172.16.0.1'];

  switch (type) {
    case 'process':
      const action = randChoice(['started', 'stopped', 'crashed', 'forked']);
      const proc = randChoice(processes);
      const pid = randInt(1000, 9999);
      message = 'Process "' + proc + '" (PID: ' + pid + ') ' + action;
      severity = action === 'crashed' ? 'error' : action === 'stopped' ? 'warning' : 'info';
      break;
    case 'cpu':
      cpuUsage = randInt(10, 99);
      message = 'CPU spike detected: ' + cpuUsage + '% usage on Core ' + randInt(0, 7);
      severity = cpuUsage > 85 ? 'critical' : cpuUsage > 70 ? 'warning' : 'info';
      break;
    case 'memory':
      memUsage = randInt(30, 98);
      message = 'Memory usage at ' + memUsage + '% — ' + randInt(1, 16) + 'GB of 32GB used';
      severity = memUsage > 90 ? 'critical' : memUsage > 75 ? 'warning' : 'info';
      break;
    case 'file':
      const fileAction = randChoice(['read', 'write', 'delete', 'modified']);
      const file = randChoice(files);
      message = 'File "' + file + '" was ' + fileAction + ' by PID ' + randInt(100, 9999);
      severity = fileAction === 'delete' ? 'warning' : 'info';
      break;
    case 'network':
      const dir = randChoice(['Inbound', 'Outbound']);
      const proto = randChoice(['TCP', 'UDP', 'HTTP', 'HTTPS']);
      const ip = randChoice(ips);
      message = dir + ' ' + proto + ' connection from ' + ip + ':' + randInt(1024, 65535);
      severity = 'info';
      break;
    case 'error':
      const errors = [
        'Segmentation fault in process memory allocation',
        'Disk I/O error on /dev/sda1 — bad sector detected',
        'Authentication failure for user root',
        'Out of memory: OOM Killer invoked',
        'Network interface eth0 is down'
      ];
      message = randChoice(errors);
      severity = 'critical';
      cpuUsage = randInt(60, 99);
      break;
  }

  const event = {
    id: eventIdCounter++,
    type,
    message,
    severity,
    cpuUsage,
    memUsage,
    timestamp: new Date().toISOString()
  };

  eventLog.push(event);
  if (eventLog.length > 500) eventLog.shift();
  return event;
}

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);
  socket.emit('init', { events: eventLog, isLogging: isLogging });

  socket.on('start-logging', () => {
    if (isLogging) return;
    isLogging = true;
    console.log('Event logging started');
    eventInterval = setInterval(() => {
      const event = generateEvent();
      io.emit('new-event', event);
      io.emit('stats', { cpuUsage: event.cpuUsage, memUsage: event.memUsage });
    }, 1000);
    io.emit('logging-status', { isLogging: true });
  });

  socket.on('stop-logging', () => {
    if (!isLogging) return;
    isLogging = false;
    clearInterval(eventInterval);
    eventInterval = null;
    console.log('Event logging stopped');
    io.emit('logging-status', { isLogging: false });
  });

  socket.on('clear-logs', () => {
    eventLog = [];
    eventIdCounter = 1;
    io.emit('logs-cleared');
  });

  socket.on('request-download', () => {
    socket.emit('download-data', eventLog);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
  });
});

app.get('/api/stats', (req, res) => {
  res.json({ totalEvents: eventLog.length, isLogging, uptime: process.uptime().toFixed(0) + 's' });
});

httpServer.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
