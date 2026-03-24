import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GameStatus, UserProfile, VirtualConfig } from './src/types';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

// SQLite Setup
let db: any;
async function initDb() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      telegramId TEXT UNIQUE,
      displayName TEXT,
      balance INTEGER DEFAULT 1000000,
      role TEXT DEFAULT 'user',
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roundId TEXT,
      dice TEXT,
      result TEXT,
      total INTEGER,
      jackpotWon INTEGER,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      roundId TEXT,
      side TEXT,
      amount INTEGER,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      displayName TEXT,
      bankName TEXT,
      accountNumber TEXT,
      accountHolder TEXT,
      amount INTEGER,
      status TEXT DEFAULT 'pending',
      timestamp TEXT
    );
  `);

  // Initial settings
  await db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['virtualConfig', JSON.stringify({
    enabled: true,
    minPlayers: 1,
    maxPlayers: 5,
    minAmount: 1000,
    maxAmount: 50000
  })]);

  await db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['depositSettings', JSON.stringify({
    bankName: 'MB BANK',
    accountNumber: '123456789',
    accountHolder: 'NGUYEN MINH TAN',
    minDeposit: 10000
  })]);
}

let bot: TelegramBot | null = null;

if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
  if (APP_URL) {
    bot.setWebHook(`${APP_URL}/api/telegram-webhook`);
    console.log('Telegram Webhook set to:', `${APP_URL}/api/telegram-webhook`);
  } else {
    bot.startPolling();
    console.log('Telegram Bot started with polling (APP_URL missing)');
  }

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const text = `Chào mừng ${msg.from?.first_name} đến với Tài Xỉu Realtime! 🎲\n\nBạn có thể chơi game trực tiếp tại: ${APP_URL}\nSử dụng /balance để kiểm tra số dư.`;
    bot?.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Chơi ngay 🎮', web_app: { url: APP_URL || '' } }]
        ]
      }
    });
  });

  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id.toString();

    if (!telegramId) return;

    try {
      const user = await db.get('SELECT balance FROM users WHERE telegramId = ?', [telegramId]);

      if (!user) {
        bot?.sendMessage(chatId, 'Tài khoản của bạn chưa được liên kết. Hãy mở game từ Telegram để tự động liên kết!');
      } else {
        bot?.sendMessage(chatId, `Số dư của bạn: ${user.balance.toLocaleString()} VNĐ`);
      }
    } catch (error) {
      console.error('Error fetching balance via Telegram:', error);
      bot?.sendMessage(chatId, 'Có lỗi xảy ra khi kiểm tra số dư.');
    }
  });
}

const PORT = 3000;
const app = express();
app.use(express.json());

// Telegram Auth Middleware
function verifyTelegramWebAppData(initData: string): any | null {
  if (initData === 'demo') {
    return { id: 'demo_user', first_name: 'Người chơi Demo', last_name: '', username: 'demo' };
  }
  if (!TELEGRAM_BOT_TOKEN) return null;
  
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  urlParams.sort();

  let dataCheckString = '';
  for (const [key, value] of urlParams.entries()) {
    dataCheckString += `${key}=${value}\n`;
  }
  dataCheckString = dataCheckString.slice(0, -1);

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash === hash) {
    const userStr = urlParams.get('user');
    if (userStr) return JSON.parse(userStr);
  }
  return null;
}

// API Endpoints
app.post('/api/auth', async (req, res) => {
  const { initData } = req.body;
  const tgUser = verifyTelegramWebAppData(initData);

  if (!tgUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const telegramId = tgUser.id.toString();
  let user = await db.get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);

  if (!user) {
    const uid = `tg_${telegramId}`;
    const displayName = tgUser.first_name + (tgUser.last_name ? ` ${tgUser.last_name}` : '');
    const role = (tgUser.username === 'nminhtan89' || telegramId === '123456789') ? 'admin' : 'user'; // Example admin check
    
    await db.run(
      'INSERT INTO users (uid, telegramId, displayName, balance, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [uid, telegramId, displayName, 1000000, role, new Date().toISOString()]
    );
    user = await db.get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);
  }

  res.json(user);
});

app.get('/api/history', async (req, res) => {
  const history = await db.all('SELECT * FROM history ORDER BY timestamp DESC LIMIT 20');
  res.json(history.map((h: any) => ({
    ...h,
    dice: JSON.parse(h.dice),
    jackpotWon: !!h.jackpotWon
  })));
});

app.get('/api/leaderboard', async (req, res) => {
  const topUsers = await db.all('SELECT uid, displayName, balance FROM users ORDER BY balance DESC LIMIT 10');
  res.json(topUsers);
});

app.post('/api/bet', async (req, res) => {
  const { initData, side, amount } = req.body;
  const tgUser = verifyTelegramWebAppData(initData);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const telegramId = tgUser.id.toString();
  const user = await db.get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);

  if (!user || user.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Deduct balance
  await db.run('UPDATE users SET balance = balance - ? WHERE telegramId = ?', [amount, telegramId]);
  
  // Save bet to database
  await db.run(
    'INSERT INTO bets (userId, roundId, side, amount, timestamp) VALUES (?, ?, ?, ?, ?)',
    [user.uid, gameStatus.roundId, side, amount, new Date().toISOString()]
  );

  // In a real app, we'd track the bet in a 'bets' table and resolve it when the round ends.
  // For this simplified version, we'll just broadcast the bet.
  broadcast({
    type: 'BET_PLACED',
    uid: user.uid,
    side,
    amount,
    newBalance: user.balance - amount
  });

  res.json({ success: true, newBalance: user.balance - amount });
});

app.get('/api/user-bets', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramWebAppData(initData as string);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const telegramId = tgUser.id.toString();
  const user = await db.get('SELECT uid FROM users WHERE telegramId = ?', [telegramId]);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const bets = await db.all('SELECT * FROM bets WHERE userId = ? ORDER BY timestamp DESC LIMIT 50', [user.uid]);
  res.json(bets);
});

app.get('/api/deposit-settings', async (req, res) => {
  const settings = await db.get('SELECT value FROM settings WHERE key = ?', ['depositSettings']);
  res.json(JSON.parse(settings.value));
});

app.post('/api/withdraw', async (req, res) => {
  const { initData, bankName, accountNumber, accountHolder, amount } = req.body;
  const tgUser = verifyTelegramWebAppData(initData);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const telegramId = tgUser.id.toString();
  const user = await db.get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);

  if (!user || user.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Deduct balance and create withdrawal record
  await db.run('UPDATE users SET balance = balance - ? WHERE telegramId = ?', [amount, telegramId]);
  await db.run(
    'INSERT INTO withdrawals (userId, displayName, bankName, accountNumber, accountHolder, amount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user.uid, user.displayName, bankName, accountNumber, accountHolder, amount, new Date().toISOString()]
  );

  res.json({ success: true, newBalance: user.balance - amount });
});

app.get('/api/admin/users', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramWebAppData(initData as string);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const user = await db.get('SELECT role FROM users WHERE telegramId = ?', [tgUser.id.toString()]);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const users = await db.all('SELECT * FROM users ORDER BY createdAt DESC');
  res.json(users);
});

app.post('/api/admin/update-balance', async (req, res) => {
  const { initData, uid, amount } = req.body;
  const tgUser = verifyTelegramWebAppData(initData);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const admin = await db.get('SELECT role FROM users WHERE telegramId = ?', [tgUser.id.toString()]);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  await db.run('UPDATE users SET balance = balance + ? WHERE uid = ?', [amount, uid]);
  const updatedUser = await db.get('SELECT * FROM users WHERE uid = ?', [uid]);
  
  res.json(updatedUser);
});

app.get('/api/admin/virtual-settings', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramWebAppData(initData as string);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const user = await db.get('SELECT role FROM users WHERE telegramId = ?', [tgUser.id.toString()]);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const settings = await db.get('SELECT value FROM settings WHERE key = ?', ['virtualConfig']);
  res.json(JSON.parse(settings.value));
});

app.post('/api/admin/virtual-settings', async (req, res) => {
  const { initData, settings } = req.body;
  const tgUser = verifyTelegramWebAppData(initData);

  if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

  const admin = await db.get('SELECT role FROM users WHERE telegramId = ?', [tgUser.id.toString()]);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  await db.run('UPDATE settings SET value = ? WHERE key = ?', [JSON.stringify(settings), 'virtualConfig']);
  res.json({ success: true });
});

// Telegram Webhook Endpoint
app.post('/api/telegram-webhook', (req, res) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

let gameStatus: GameStatus = {
  state: 'betting',
  timeLeft: 45,
  lastDice: [1, 1, 1],
  lastResult: null,
  roundId: Date.now().toString(),
  jackpotWon: false,
  virtualStats: {
    tai: { players: 0, amount: 0 },
    xiu: { players: 0, amount: 0 }
  }
};

const broadcast = (data: any) => {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const VIRTUAL_MESSAGES = [
  "Cầu này đẹp quá anh em ơi!",
  "Tài đi, tin tôi!",
  "Xỉu chắc luôn, 100%",
  "Vừa nổ hũ xong, sướng quá",
  "Admin ơi cộng điểm cho em với",
  "Game mượt quá, uy tín",
  "Đánh nhẹ tay thôi anh em",
  "Tất tay Tài luôn!",
  "Hết tiền rồi, cứu em",
  "Lịch sử toàn Tài, cầu bệt rồi",
];

const VIRTUAL_NAMES = ["Hùng", "Lan", "Tuấn", "Linh", "Cường", "Mai", "Dũng", "Trang", "Phong", "Vân"];

// Virtual Chat Loop
setInterval(() => {
  if (Math.random() > 0.6) {
    const isBetMsg = Math.random() > 0.5;
    const sender = VIRTUAL_NAMES[Math.floor(Math.random() * VIRTUAL_NAMES.length)] + " " + Math.floor(Math.random() * 99);
    
    let text = "";
    if (isBetMsg) {
      const amount = [1000, 5000, 10000, 50000][Math.floor(Math.random() * 4)];
      const side = Math.random() > 0.5 ? "Tài" : "Xỉu";
      text = `Đã đặt ${amount.toLocaleString()} vào ${side}`;
    } else {
      text = VIRTUAL_MESSAGES[Math.floor(Math.random() * VIRTUAL_MESSAGES.length)];
    }

    const msg = {
      type: 'CHAT',
      id: Date.now().toString(),
      sender,
      text,
      timestamp: new Date().toISOString(),
      isVirtual: true
    };
    broadcast(msg);
  }
}, 4000);

// Game Loop
setInterval(async () => {
  if (!db) return;
  
  gameStatus.timeLeft--;

  const settings = await db.get('SELECT value FROM settings WHERE key = ?', ['virtualConfig']);
  const virtualConfig = JSON.parse(settings.value);

  // Simulate virtual betting
  if (gameStatus.state === 'betting' && gameStatus.timeLeft > 5 && virtualConfig.enabled) {
    if (Math.random() > 0.3) {
      const side = Math.random() > 0.5 ? 'tai' : 'xiu';
      const players = Math.floor(Math.random() * (virtualConfig.maxPlayers - virtualConfig.minPlayers + 1)) + virtualConfig.minPlayers;
      const amount = Math.floor(Math.random() * (virtualConfig.maxAmount - virtualConfig.minAmount + 1)) + virtualConfig.minAmount;
      
      if (gameStatus.virtualStats) {
        gameStatus.virtualStats[side].players += players;
        gameStatus.virtualStats[side].amount += amount;
      }
    }
  }

  if (gameStatus.timeLeft === 5 && gameStatus.state === 'betting') {
    broadcast({ type: 'BETTING_LOCKED' });
  }

  if (gameStatus.timeLeft <= 0) {
    if (gameStatus.state === 'betting') {
      // Switch to result phase
      gameStatus.state = 'result';
      gameStatus.timeLeft = 15;
      
      // Generate result
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const d3 = Math.floor(Math.random() * 6) + 1;
      gameStatus.lastDice = [d1, d2, d3];
      const total = d1 + d2 + d3;
      gameStatus.lastResult = total >= 11 ? 'tai' : 'xiu';
      
      const jackpotChance = Math.random();
      gameStatus.jackpotWon = jackpotChance < 1e-6;
      
      // Save to history
      try {
        await db.run(
          'INSERT INTO history (roundId, dice, result, total, jackpotWon, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [gameStatus.roundId, JSON.stringify(gameStatus.lastDice), gameStatus.lastResult, total, gameStatus.jackpotWon ? 1 : 0, new Date().toISOString()]
        );

        // Resolve bets
        const bets = await db.all('SELECT * FROM bets WHERE roundId = ?', [gameStatus.roundId]);
        for (const bet of bets) {
          if (bet.side === gameStatus.lastResult) {
            const winAmount = bet.amount * 2;
            await db.run('UPDATE users SET balance = balance + ? WHERE uid = ?', [winAmount, bet.userId]);
            
            // Broadcast win to the specific user if they are connected (optional, but we'll just let the client handle it for now or broadcast to all)
            // For now, we'll just update the DB. The client will fetch the new balance or receive it via WS.
          }
        }
      } catch (error) {
        console.error('Error saving history or resolving bets:', error);
      }
      
      broadcast({ type: 'GAME_RESULT', ...gameStatus });
    } else {
      // Switch back to betting phase
      gameStatus.state = 'betting';
      gameStatus.timeLeft = 45;
      gameStatus.roundId = Date.now().toString();
      gameStatus.jackpotWon = false;
      gameStatus.virtualStats = {
        tai: { players: 0, amount: 0 },
        xiu: { players: 0, amount: 0 }
      };
      broadcast({ type: 'GAME_START', ...gameStatus });
    }
  } else {
    broadcast({ type: 'TICK', timeLeft: gameStatus.timeLeft, state: gameStatus.state, virtualStats: gameStatus.virtualStats });
  }
}, 1000);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'INIT', ...gameStatus }));
});

async function startServer() {
  try {
    await initDb();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Continue anyway, but some features might fail
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
