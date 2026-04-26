// server/server.js
// This is the main backend server for the OS Event Logger

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = 3000;

// ─── Serve Static Frontend Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));

// ─── In-Memory Event Store ────────────────────────────────────────────────────
let eventLog = [];          // stores all events
let isLogging = false;      // controls whether events are being generated
let eventInterval = null;   // reference to the interval timer
let eventIdCounter = 1;     // unique ID for each event

// ─── OS Event Types ───────────────────────────────────────────────────────────
const EVENT_TYPES = {
  PROCESS: 'process',
  CPU:     'cpu',
  MEMORY:  'memory',
  FILE:    'file',
  NETWORK: 'network',
  ERROR:   'error'
};

// ─── Event Generator Functions ────────────────────────────────────────────────

// Generates a random integer between min and max (inclusive)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a random element from an array
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generates a realistic fake OS event
function generateEvent() {
  const type = randChoice(Object.values(EVENT_TYPES));
  let message = '';
  let cpuUsage = randInt(5, 95);
  let memUsage = randInt(20, 90);
  let severity = 'info';

  const processes = ['chrome.exe', 'node.exe', 'python.py', 'bash', 'nginx', 'mysqld', 'sshd', 'explorer.exe'];
  const files     = ['/etc/hosts', '/var/log/syslog', '/home/user/docs/report.pdf', 'C:\\Windows\\System32\\config', '/tmp/cache.tmp'];
  const ips       = ['192.168.1.10', '10.0.0.5', '172.16.0.1', '8.8.8.8', '1.1.1.1'];

  switch (type) {
    case EVENT_TYPES.PROCESS:
      const action  = randChoice(['started', 'stopped', 'crashed', 'forked', 'resumed']);
      const process = randChoice(processes);
      const pid     = randInt(1000, 9999);
      message  = `Process "${process}" (PID: ${pid}) ${action}`;
      severity = action === 'crashed' ? 'error' : action === 'stopped' ? 'warning' : 'info';
      break;

    case EVENT_TYPES.CPU:
      cpuUsage = randInt(10, 99);
      message  = `CPU spike detected: ${cpuUsage}% usage on Core ${randInt(0, 7)}`;
      severity = cpuUsage > 85 ? 'critical' : cpuUsage > 70 ? 'warning' : 'info';
      break;

    case EVENT_TYPES.MEMORY:
      memUsage = randInt(30, 98);
      message  = `Memory usage at ${memUsage}% — ${randInt(1, 16)}GB of ${randInt(16, 32)}GB used`;
      severity = memUsage > 90 ? 'critical' : memUsage > 75 ? 'warning' : 'info';
      break;

    case EVENT_TYPES.FILE:
      const fileAction = randChoice(['read', 'write', 'delete', 'modified', 'accessed']);
      const file       = randChoice(files);
      message  = `File "${file}" was ${fileAction} by PID ${randInt(100, 9999)}`;
      severity = fileAction === 'delete' ? 'warning' : 'info';
      break;

    case EVENT_TYPES.NETWORK:
      const direction = randChoice(['Inbound', 'Outbound']);
      const protocol  = randChoice(['TCP', 'UDP', 'HTTP', 'HTTPS', 'SSH']);
      const ip        = randChoice(ips);
      const port2     = randInt(1024, 65535);
      message  = `${direction} ${protocol} connection from ${ip}:${port2}`;
      severity = 'info';
      break;

    case EVENT_TYPES.ERROR:
      const errors = [
        'Segmentation fault in process memory allocation',
        'Kernel panic: unable to mount root filesystem',
        'Disk I/O error on /dev/sda1 — bad sector detected',
        'Authentication failure for user root from 192.168.1.100',
        'Out of memory: kill process (OOM Killer invoked)',
        'Network interface eth0 is down — reconnecting...'
      ];
      message  = randChoice(errors);
      severity = 'critical';
      cpuUsage = randInt(60, 99);
      break;
  }

  const event = {
    id:        eventIdCounter++,
    type,
    message,
    severity,
    cpuUsage,
    memUsage,
    timestamp: new Date().toISOString()
  };

  eventLog.push(event);

  // Keep in-memory log to last 500 events to avoid memory overflow
  if (eventLog.length > 500) {
    eventLog.shift();
  }

  return event;
}

// ─── Socket.io Connection Handler ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Send the existing event log to the newly connected client
  socket.emit('init', {
    events:    eventLog,
    isLogging: isLogging
  });

  // ── Start Logging ──────────────────────────────────────────────────────────
  socket.on('start-logging', () => {
    if (isLogging) return; // already running
    isLogging = true;
    console.log('▶️  Event logging started');

    // Emit a new event every 1 second
    eventInterval = setInterval(() => {
      const event = generateEvent();
      io.emit('new-event', event);           // broadcast to ALL connected clients
      io.emit('stats', {                     // send updated CPU/Memory stats
        cpuUsage: event.cpuUsage,
        memUsage: event.memUsage
      });
    }, 1000);

    io.emit('logging-status', { isLogging: true });
  });

  // ── Stop Logging ───────────────────────────────────────────────────────────
  socket.on('stop-logging', () => {
    if (!isLogging) return;
    isLogging = false;
    clearInterval(eventInterval);
    eventInterval = null;
    console.log('⏹️  Event logging stopped');
    io.emit('logging-status', { isLogging: false });
  });

  // ── Clear Logs ─────────────────────────────────────────────────────────────
  socket.on('clear-logs', () => {
    eventLog = [];
    eventIdCounter = 1;
    console.log('🗑️  Logs cleared');
    io.emit('logs-cleared');
  });

  // ── Download Logs (server sends full log) ──────────────────────────────────
  socket.on('request-download', () => {
    socket.emit('download-data', eventLog);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ─── Start HTTP Server ─────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 OS Event Logger server running at http://localhost:${PORT}`);
});