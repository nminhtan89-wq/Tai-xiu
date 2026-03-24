import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GameStatus } from './src/types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, doc, onSnapshot, query, where, getDocs, updateDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { VirtualConfig } from './src/types';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

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
      const q = query(collection(db, 'users'), where('telegramId', '==', telegramId));
      const snap = await getDocs(q);

      if (snap.empty) {
        bot?.sendMessage(chatId, 'Tài khoản của bạn chưa được liên kết. Hãy mở game từ Telegram để tự động liên kết!');
      } else {
        const profile = snap.docs[0].data();
        bot?.sendMessage(chatId, `Số dư của bạn: ${profile.balance.toLocaleString()} VNĐ`);
      }
    } catch (error) {
      console.error('Error fetching balance via Telegram:', error);
      bot?.sendMessage(chatId, 'Có lỗi xảy ra khi kiểm tra số dư.');
    }
  });
}

let virtualConfig: VirtualConfig = {
  enabled: true,
  minPlayers: 1,
  maxPlayers: 5,
  minAmount: 1000,
  maxAmount: 50000
};

// Listen for virtual config changes
onSnapshot(doc(db, 'settings', 'virtual'), (snapshot) => {
  if (snapshot.exists()) {
    virtualConfig = snapshot.data() as VirtualConfig;
    console.log('Virtual config updated:', virtualConfig);
  }
});

const PORT = 3000;
const app = express();
app.use(express.json()); // Add this to parse JSON bodies

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
  gameStatus.timeLeft--;

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
      
      // Jackpot check (1/10^12 is too low for a demo, let's make it 1/1000 for visibility in a prototype, but keep the logic)
      const jackpotChance = Math.random();
      gameStatus.jackpotWon = jackpotChance < 1e-6; // Slightly more likely for demo purposes but still rare
      
      // Save to history
      try {
        await addDoc(collection(db, 'history'), {
          roundId: gameStatus.roundId,
          dice: gameStatus.lastDice,
          result: gameStatus.lastResult,
          total: total,
          timestamp: serverTimestamp(),
          jackpotWon: gameStatus.jackpotWon
        });
      } catch (error) {
        console.error('Error saving history:', error);
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
