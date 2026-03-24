import React, { useEffect, useState, useMemo, useRef, Component } from 'react';
import { useGame } from './hooks/useGame';
import Dice from './components/Dice';
import { GameRound, UserProfile, ChatMessage, DepositSettings, Bet, VirtualConfig } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coins, History, Trophy, User as UserIcon, LogOut, Info, Zap, 
  MessageSquare, Send, Shield, X, Check, Search, Volume2, VolumeX, Music, ArrowUpRight 
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BET_LEVELS = [10000, 50000, 100000, 500000, 1000000, 3000000, 5000000];

export class ErrorBoundary extends (React.Component as any) {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 text-white">
          <h1 className="text-2xl font-bold mb-4">Đã có lỗi xảy ra</h1>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-500 rounded-xl font-bold"
          >
            Tải lại trang
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function App() {
  const { status, connected } = useGame();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [betAmount, setBetAmount] = useState(10000);
  const [pendingBet, setPendingBet] = useState<{ side: 'tai' | 'xiu', amount: number } | null>(null);
  const [currentBet, setCurrentBet] = useState<{ side: 'tai' | 'xiu', amount: number } | null>(null);
  const [history, setHistory] = useState<GameRound[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
  const [showWallet, setShowWallet] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [isBetting, setIsBetting] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    amount: 0
  });
  const [adminSearch, setAdminSearch] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [depositSettings, setDepositSettings] = useState<DepositSettings | null>(null);
  const [userBets, setUserBets] = useState<Record<string, Bet>>({});
  const [isEditingDeposit, setIsEditingDeposit] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'deposit' | 'virtual'>('users');
  const [virtualSettings, setVirtualSettings] = useState<VirtualConfig | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth and Initial Data
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    const authenticate = async () => {
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: WebApp.initData })
        });
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setLoading(false);
      }
    };

    authenticate();
  }, []);

  // Fetch History, Leaderboard, and User Bets
  useEffect(() => {
    if (!profile) return;

    const fetchData = async () => {
      try {
        const [historyRes, leaderboardRes, userBetsRes] = await Promise.all([
          fetch('/api/history'),
          fetch('/api/leaderboard'),
          fetch(`/api/user-bets?initData=${encodeURIComponent(WebApp.initData)}`)
        ]);
        if (historyRes.ok) setHistory(await historyRes.json());
        if (leaderboardRes.ok) setTopUsers(await leaderboardRes.json());
        if (userBetsRes.ok) {
          const betsArr = await userBetsRes.json();
          const betsMap: Record<string, Bet> = {};
          betsArr.forEach((b: any) => {
            if (b.roundId) betsMap[b.roundId] = b;
          });
          setUserBets(betsMap);
        }
      } catch (error) {
        console.error('Fetch data error:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [profile]);

  // Background Music
  useEffect(() => {
    const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'); // Gentler track
    audio.loop = true;
    audio.volume = 0.3;
    musicRef.current = audio;
    
    if (!isMusicMuted && profile) {
      audio.play().catch(e => console.log('Music play failed:', e));
    }

    return () => {
      audio.pause();
      musicRef.current = null;
    };
  }, [profile]);

  useEffect(() => {
    if (musicRef.current) {
      if (isMusicMuted) {
        musicRef.current.pause();
      } else {
        musicRef.current.play().catch(e => console.log('Music play failed:', e));
      }
    }
  }, [isMusicMuted]);

  // WebSocket Chat Listener
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'CHAT') {
        setMessages(prev => [...prev.slice(-49), data]);
      } else if (data.type === 'BET_PLACED' && profile && data.uid === profile.uid) {
        setProfile(prev => prev ? { ...prev, balance: data.newBalance } : null);
      }
    };
    return () => socket.close();
  }, [profile]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch Deposit Settings
  useEffect(() => {
    if (!profile) return;
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/deposit-settings');
        if (res.ok) setDepositSettings(await res.json());
      } catch (error) {
        console.error('Fetch deposit settings error:', error);
      }
    };
    fetchSettings();
  }, [profile]);

  // Admin Data Fetching
  useEffect(() => {
    if (showAdmin && profile?.role === 'admin') {
      const fetchAdminData = async () => {
        try {
          const [usersRes, virtualRes] = await Promise.all([
            fetch(`/api/admin/users?initData=${encodeURIComponent(WebApp.initData)}`),
            fetch(`/api/admin/virtual-settings?initData=${encodeURIComponent(WebApp.initData)}`)
          ]);
          if (usersRes.ok) setAdminUsers(await usersRes.json());
          if (virtualRes.ok) setVirtualSettings(await virtualRes.json());
        } catch (error) {
          console.error('Fetch admin data error:', error);
        }
      };
      fetchAdminData();
    }
  }, [showAdmin, profile?.role]);

  const handleSaveVirtualSettings = async () => {
    if (!virtualSettings) return;
    try {
      const res = await fetch('/api/admin/virtual-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          settings: virtualSettings
        })
      });
      if (res.ok) {
        alert('Đã lưu cấu hình người ảo!');
      } else {
        alert('Có lỗi xảy ra khi lưu cấu hình');
      }
    } catch (error) {
      console.error('Save virtual settings error:', error);
    }
  };

  const playSound = (type: 'bet' | 'win' | 'lose' | 'jackpot') => {
    if (isMuted) return;
    const urls = {
      bet: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
      win: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
      lose: 'https://assets.mixkit.co/active_storage/sfx/251/251-preview.mp3',
      jackpot: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3'
    };
    const audio = new Audio(urls[type]);
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  // Handle Game Result
  useEffect(() => {
    if (status?.state === 'result' && status.timeLeft === 14) {
      // Fetch updated balance from server
      const fetchNewBalance = async () => {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: WebApp.initData })
          });
          if (res.ok) {
            const data = await res.json();
            setProfile(data);
          }
        } catch (error) {
          console.error('Fetch new balance error:', error);
        }
      };
      
      if (currentBet) {
        if (currentBet.side === status.lastResult) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          playSound('win');
        } else {
          playSound('lose');
        }
        setTimeout(() => setCurrentBet(null), 10000);
      }
      
      fetchNewBalance();
    }
    if (status?.jackpotWon && status.timeLeft === 14) {
      confetti({ particleCount: 500, spread: 160, origin: { y: 0.5 }, colors: ['#FFD700', '#FFA500', '#FF4500'] });
      playSound('jackpot');
    }
    // Reset pending if locked
    if (status?.state === 'betting' && status.timeLeft <= 5) {
      setPendingBet(null);
    }
  }, [status?.state, status?.lastResult, status?.jackpotWon, currentBet, profile, status?.timeLeft, isMuted]);

  const handleSideClick = (side: 'tai' | 'xiu') => {
    if (status?.state !== 'betting' || status.timeLeft <= 5) return;
    // If already bet on the other side, block it
    if (currentBet && currentBet.side !== side) return;
    
    setPendingBet(prev => {
      if (prev && prev.side === side) {
        return { ...prev, amount: prev.amount + betAmount };
      }
      return { side, amount: betAmount };
    });
  };

  const handleCancelConfirmedBet = async () => {
    if (!profile || !currentBet || status?.state !== 'betting' || status.timeLeft <= 5) return;
    // Cancellation via API is not implemented in this simplified version,
    // but we can just clear it locally if the server doesn't track it yet.
    setCurrentBet(null);
  };

  const sendMessage = () => {
    if (!chatInput.trim() || !profile) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'CHAT',
        sender: profile.displayName,
        text: chatInput,
        isVirtual: false
      }));
      setChatInput('');
      socket.close();
    };
  };

  const handleTopUp = () => {
    // Just scroll to instructions or do nothing as instructions are already visible
    const element = document.getElementById('deposit-instructions');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleWithdraw = async () => {
    if (!profile || withdrawForm.amount < 50000) {
      alert('Số tiền rút tối thiểu là 50,000 VNĐ');
      return;
    }
    if (withdrawForm.amount > profile.balance) {
      alert('Số dư không đủ');
      return;
    }
    if (!withdrawForm.bankName || !withdrawForm.accountNumber || !withdrawForm.accountHolder) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }

    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          ...withdrawForm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => prev ? { ...prev, balance: data.newBalance } : null);
        setShowWithdraw(false);
        alert('Yêu cầu rút tiền đã được gửi thành công!');
      } else {
        const data = await response.json();
        alert(data.error || 'Có lỗi xảy ra khi rút tiền');
      }
    } catch (e) {
      console.error(e);
      alert('Có lỗi xảy ra, vui lòng thử lại sau');
    }
  };
  const confirmBet = async () => {
    if (!profile || !pendingBet || status?.state !== 'betting' || status.timeLeft <= 5 || isBetting) {
      if (status?.timeLeft && status.timeLeft <= 5) {
        alert('Đã hết thời gian đặt cược!');
      }
      return;
    }
    setIsBetting(true);
    try {
      const response = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          side: pendingBet.side,
          amount: pendingBet.amount
        })
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => prev ? { ...prev, balance: data.newBalance } : null);
        setCurrentBet(prev => {
          if (prev && prev.side === pendingBet.side) {
            return { ...prev, amount: prev.amount + pendingBet.amount };
          }
          return { ...pendingBet, roundId: status.roundId } as any;
        });
        setPendingBet(null);
        playSound('bet');
      } else {
        const data = await response.json();
        alert(data.error || 'Có lỗi xảy ra khi đặt cược');
      }
    } catch (error) {
      console.error('Bet error:', error);
    } finally {
      setIsBetting(false);
    }
  };

  const cancelBet = () => {
    setPendingBet(null);
  };

  const handleAdminUpdateBalance = async (uid: string, amount: number) => {
    try {
      const response = await fetch('/api/admin/update-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          uid,
          amount
        })
      });
      if (response.ok) {
        const updatedUser = await response.json();
        setAdminUsers(prev => prev.map(u => u.uid === uid ? updatedUser : u));
      } else {
        alert('Có lỗi xảy ra khi cập nhật số dư');
      }
    } catch (e) {
      console.error(e);
      alert('Có lỗi xảy ra, vui lòng thử lại sau');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 text-white font-sans">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-8">
          <div className="relative">
             <div className="absolute -inset-4 bg-blue-500/20 blur-3xl rounded-full" />
             <h1 className="text-6xl font-black tracking-tighter italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 relative">TÀI XỈU PRO</h1>
          </div>
          <p className="text-slate-400">Vui lòng mở ứng dụng từ Telegram để chơi.</p>
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
            <button 
              onClick={() => window.open(`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'your_bot_username'}?start=link`, '_blank')}
              className="w-full px-8 py-4 bg-blue-500 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
            >
              Mở Telegram
            </button>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: 'demo' })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                  }
                } catch (error) {
                  console.error('Demo auth error:', error);
                }
              }}
              className="w-full px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 active:scale-95 transition-all"
            >
              Chế độ Demo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30 relative overflow-x-hidden">
      {/* Background Image */}
      <div 
        className="fixed inset-0 z-0 opacity-40 pointer-events-none"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=2070&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-white/5 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="text-white fill-white" size={20} />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight text-white uppercase">TÀI XỈU REALTIME</h2>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", connected ? "bg-emerald-500" : "bg-red-500")} />
              <span className="text-[10px] uppercase tracking-widest font-bold opacity-50">{connected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setIsMusicMuted(!isMusicMuted)} className="p-2 bg-slate-800/50 rounded-lg text-slate-400 hover:text-white transition-colors" title="Nhạc nền">
            {isMusicMuted ? <Music size={18} className="opacity-40" /> : <Music size={18} className="text-pink-500" />}
          </button>
          {profile?.telegramId && (
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400" title="Đã liên kết Telegram">
              <Send size={18} className="-rotate-45" />
            </div>
          )}
          <button onClick={() => setIsMuted(!isMuted)} className="p-2 bg-slate-800/50 rounded-lg text-slate-400 hover:text-white transition-colors" title="Âm thanh game">
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {profile?.role === 'admin' && (
            <button onClick={() => setShowAdmin(true)} className="p-2 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-colors">
              <Shield size={18} />
            </button>
          )}
          <button onClick={() => setShowWallet(true)} className="bg-slate-800/50 px-3 py-1.5 rounded-full border border-white/5 flex items-center gap-2 hover:bg-white/5 transition-colors">
            <Coins className="text-yellow-500" size={16} />
            <span className="font-mono font-bold text-sm text-yellow-500">{profile?.balance.toLocaleString()}</span>
          </button>
          <button onClick={() => {}} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <LogOut size={18} className="text-slate-400" />
          </button>
        </div>
      </header>

      {/* Floating Icon Menu */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 flex items-center gap-2 shadow-2xl">
        <button onClick={() => setShowHistory(true)} className="p-3 hover:bg-white/5 rounded-2xl transition-all group">
          <History size={20} className="text-blue-400 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => setShowChat(true)} className="p-3 hover:bg-white/5 rounded-2xl transition-all group">
          <MessageSquare size={20} className="text-emerald-400 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => setShowLeaderboard(true)} className="p-3 hover:bg-white/5 rounded-2xl transition-all group">
          <Trophy size={20} className="text-yellow-500 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => setShowWallet(true)} className="p-3 hover:bg-white/5 rounded-2xl transition-all group">
          <Coins size={20} className="text-orange-400 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <main className="max-w-md mx-auto p-4 space-y-6 pb-32">
        {/* Game Area */}
        <section className="relative bg-slate-900/40 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
             <motion.div className="h-full bg-blue-500" initial={{ width: '100%' }} animate={{ width: `${(status?.timeLeft || 0) / (status?.state === 'betting' ? 45 : 15) * 100}%` }} transition={{ duration: 1, ease: "linear" }} />
          </div>

          <div className="text-center space-y-4">
            <div className="space-y-1">
              <span className={cn("text-xs font-black tracking-[0.4em] uppercase", status?.timeLeft && status.timeLeft <= 5 && status.state === 'betting' ? "text-red-500" : "text-blue-400")}>
                {status?.state === 'betting' ? (status.timeLeft <= 5 ? 'KHÓA CƯỢC' : 'Đang đặt cược') : 'Đang mở thưởng'}
              </span>
              <h3 className={cn("text-5xl font-mono font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]", status?.timeLeft && status.timeLeft <= 10 && status.state === 'betting' && "text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]")}>
                00:{status?.timeLeft.toString().padStart(2, '0')}
              </h3>
            </div>

            <div className="flex justify-center gap-6 py-4">
              {status?.state === 'result' ? (
                status.lastDice.map((d, i) => <Dice key={i} value={d} rolling={false} />)
              ) : (
                <><Dice value={1} rolling={true} /><Dice value={1} rolling={true} /><Dice value={1} rolling={true} /></>
              )}
            </div>

            {status?.state === 'result' && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-2">
                <div className={cn("inline-block px-10 py-4 rounded-full text-4xl font-black uppercase tracking-[0.2em] shadow-2xl border-4", status.lastResult === 'tai' ? "bg-blue-600 text-white border-blue-400 shadow-blue-500/40" : "bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/40")}>
                  {status.lastResult === 'tai' ? 'TÀI' : 'XỈU'}
                </div>
                <p className="text-white font-mono text-xl font-bold drop-shadow-md">Tổng: {status.lastDice.reduce((a, b) => a + b, 0)}</p>
              </motion.div>
            )}
          </div>
        </section>

        {/* Confirmation Button */}
        <AnimatePresence>
          {pendingBet && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }} 
              className="bg-slate-900/80 border border-blue-500/30 p-3 rounded-2xl space-y-3 shadow-2xl mb-2"
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-black italic shadow-lg",
                    pendingBet.side === 'tai' ? "bg-blue-500 text-white shadow-blue-500/30" : "bg-emerald-500 text-white shadow-emerald-500/30"
                  )}>
                    {pendingBet.side === 'tai' ? 'T' : 'X'}
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black italic uppercase tracking-tight">Xác nhận</h3>
                    <p className="text-[9px] text-slate-400">Cửa <span className={cn("font-bold", pendingBet.side === 'tai' ? "text-blue-400" : "text-emerald-400")}>{pendingBet.side === 'tai' ? 'TÀI' : 'XỈU'}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase opacity-40">Tiền cược</p>
                  <p className="text-sm font-mono font-black text-yellow-500">{pendingBet.amount.toLocaleString()} VNĐ</p>
                </div>
              </div>

              {profile && profile.balance < pendingBet.amount && (
                <p className="text-[9px] text-red-500 font-bold text-center animate-pulse">Số dư không đủ!</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={cancelBet} 
                  className="py-2 bg-slate-800 text-slate-400 rounded-xl font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 text-[10px]"
                >
                  <X size={12} /> Hủy
                </button>
                <button 
                  disabled={!profile || profile.balance < pendingBet.amount || isBetting}
                  onClick={confirmBet} 
                  className="py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-bold hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:bg-slate-800 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-[10px]"
                >
                  {isBetting ? <Zap size={12} className="animate-spin" /> : <Check size={12} />} Xác nhận
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Balance & Betting Board */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Số dư khả dụng</span>
            <span className="text-[10px] font-mono font-bold text-yellow-500">{profile?.balance.toLocaleString()} VNĐ</span>
          </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <div className="absolute -top-6 left-0 right-0 flex justify-between px-2 text-[7px] font-bold text-slate-500 uppercase">
                  <span>{status?.virtualStats?.tai.players || 0} người</span>
                  <span>{status?.virtualStats?.tai.amount.toLocaleString() || 0}</span>
                </div>
                <button
                  disabled={status?.state !== 'betting' || status.timeLeft <= 5 || (!!currentBet && currentBet.side !== 'tai')}
                  onClick={() => handleSideClick('tai')}
                  className={cn(
                    "w-full group relative aspect-square rounded-[1.5rem] border-2 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden",
                    (currentBet?.side === 'tai' || pendingBet?.side === 'tai') ? "bg-blue-500 border-blue-400" : "bg-slate-900/40 border-white/5 hover:border-blue-500/50",
                    (status?.state !== 'betting' || (status.timeLeft <= 5 && !currentBet)) && "opacity-50 grayscale"
                  )}
                >
                  <span className={cn("text-3xl font-black italic uppercase", (currentBet?.side === 'tai' || pendingBet?.side === 'tai') ? "text-white" : "text-blue-500")}>TÀI</span>
                  <span className="text-[8px] font-bold opacity-50">11 - 17</span>
                  {currentBet?.side === 'tai' && <div className="absolute bottom-2 bg-white/20 px-2 py-0.5 rounded-full text-[8px] font-bold">ĐÃ CƯỢC: {currentBet.amount.toLocaleString()}</div>}
                  {pendingBet?.side === 'tai' && <div className="absolute bottom-2 bg-yellow-500/40 px-2 py-0.5 rounded-full text-[8px] font-bold animate-pulse">CHỜ: {pendingBet.amount.toLocaleString()}</div>}
                </button>
                {currentBet?.side === 'tai' && status?.state === 'betting' && status.timeLeft > 5 && (
                  <button 
                    onClick={handleCancelConfirmedBet}
                    className="absolute -top-1 -right-1 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-colors z-10"
                    title="Hủy đặt cược"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="relative">
                <div className="absolute -top-6 left-0 right-0 flex justify-between px-2 text-[7px] font-bold text-slate-500 uppercase">
                  <span>{status?.virtualStats?.xiu.players || 0} người</span>
                  <span>{status?.virtualStats?.xiu.amount.toLocaleString() || 0}</span>
                </div>
                <button
                  disabled={status?.state !== 'betting' || status.timeLeft <= 5 || (!!currentBet && currentBet.side !== 'xiu')}
                  onClick={() => handleSideClick('xiu')}
                  className={cn(
                    "w-full group relative aspect-square rounded-[1.5rem] border-2 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden",
                    (currentBet?.side === 'xiu' || pendingBet?.side === 'xiu') ? "bg-emerald-500 border-emerald-400" : "bg-slate-900/40 border-white/5 hover:border-emerald-500/50",
                    (status?.state !== 'betting' || (status.timeLeft <= 5 && !currentBet)) && "opacity-50 grayscale"
                  )}
                >
                  <span className={cn("text-3xl font-black italic uppercase", (currentBet?.side === 'xiu' || pendingBet?.side === 'xiu') ? "text-white" : "text-emerald-500")}>XỈU</span>
                  <span className="text-[8px] font-bold opacity-50">3 - 10</span>
                  {currentBet?.side === 'xiu' && <div className="absolute bottom-2 bg-white/20 px-2 py-0.5 rounded-full text-[8px] font-bold">ĐÃ CƯỢC: {currentBet.amount.toLocaleString()}</div>}
                  {pendingBet?.side === 'xiu' && <div className="absolute bottom-2 bg-yellow-500/40 px-2 py-0.5 rounded-full text-[8px] font-bold animate-pulse">CHỜ: {pendingBet.amount.toLocaleString()}</div>}
                </button>
                {currentBet?.side === 'xiu' && status?.state === 'betting' && status.timeLeft > 5 && (
                  <button 
                    onClick={handleCancelConfirmedBet}
                    className="absolute -top-1 -right-1 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-colors z-10"
                    title="Hủy đặt cược"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
        </div>

        {/* Bet Levels */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-900/60 p-2 rounded-2xl border border-white/10 flex gap-1 overflow-x-auto no-scrollbar">
            {BET_LEVELS.map((amount) => (
              <button 
                key={amount} 
                onClick={() => setBetAmount(amount)} 
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all border", 
                  betAmount === amount 
                    ? "bg-yellow-500 text-black border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]" 
                    : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/5"
                )}
              >
                {amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}K`}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setBetAmount(prev => prev * 2)}
            className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black rounded-xl text-sm font-black shadow-lg hover:scale-105 transition-all whitespace-nowrap"
          >
            X2 CƯỢC
          </button>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {showChat && (
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed inset-0 z-[100] bg-[#020617] p-4 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black italic uppercase">Trò chuyện trực tuyến</h2>
                <button onClick={() => setShowChat(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col gap-0.5">
                    <span className={cn("text-[10px] font-bold", msg.isVirtual ? "text-slate-500" : "text-blue-400")}>{msg.sender}</span>
                    <div className="bg-white/5 px-3 py-1.5 rounded-2xl rounded-tl-none inline-block max-w-[80%]">
                      <p className="text-xs text-slate-300">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-2 bg-slate-800/30 flex gap-2 rounded-2xl mt-4">
                <input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 bg-white/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button onClick={sendMessage} className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors">
                  <Send size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {showLeaderboard && (
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed inset-0 z-[100] bg-[#020617] p-4 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-black italic uppercase">Bảng Xếp Hạng Đại Gia</h2>
                <button onClick={() => setShowLeaderboard(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={24} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {topUsers.map((u, index) => (
                  <div key={u.uid} className={cn(
                    "p-4 rounded-2xl border flex items-center justify-between transition-all",
                    index === 0 ? "bg-yellow-500/10 border-yellow-500/30" : 
                    index === 1 ? "bg-slate-300/10 border-slate-300/30" :
                    index === 2 ? "bg-orange-500/10 border-orange-500/30" :
                    "bg-slate-900/60 border-white/5"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg italic shadow-lg",
                        index === 0 ? "bg-yellow-500 text-black" :
                        index === 1 ? "bg-slate-300 text-black" :
                        index === 2 ? "bg-orange-500 text-black" :
                        "bg-slate-800 text-white"
                      )}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{u.displayName || 'Người chơi'}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">#{u.uid.slice(-6)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-yellow-500 font-mono font-black">{u.balance.toLocaleString()}</p>
                      <p className="text-[8px] text-slate-500 uppercase font-bold">VNĐ</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {showWallet && (
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed inset-0 z-[100] bg-[#020617] p-4 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-black italic uppercase">Ví của tôi</h2>
                <button onClick={() => setShowWallet(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={24} /></button>
              </div>
              
              <div className="space-y-6 overflow-y-auto pb-8">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-[2.5rem] shadow-xl shadow-blue-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Coins size={120} />
                  </div>
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-2">Số dư khả dụng</p>
                  <h3 className="text-4xl font-mono font-black text-white">{profile?.balance.toLocaleString()} <span className="text-lg">VNĐ</span></h3>
                </div>

                {!profile?.telegramId && (
                  <div className="bg-blue-500/10 p-6 rounded-[2.5rem] border border-blue-500/20 flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-blue-400">Liên kết Telegram</h4>
                      <p className="text-[10px] text-slate-400">Nhận thông báo và kiểm tra số dư nhanh</p>
                    </div>
                    <button 
                      onClick={() => window.open(`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'your_bot_username'}?start=link`, '_blank')}
                      className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20"
                    >
                      Liên kết
                    </button>
                  </div>
                )}

                <div id="deposit-instructions" className="bg-slate-900/60 p-6 rounded-[2.5rem] border border-white/5 space-y-4">
                  <h3 className="font-black italic uppercase text-sm text-blue-400">Hướng dẫn nạp tiền</h3>
                  
                  {depositSettings ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase opacity-40">Ngân hàng</p>
                          <p className="text-sm font-bold">{depositSettings.bankName}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase opacity-40">Chủ tài khoản</p>
                          <p className="text-sm font-bold">{depositSettings.accountHolder}</p>
                        </div>
                      </div>
                      <div className="space-y-1 p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[10px] font-bold uppercase opacity-40">Số tài khoản</p>
                        <p className="text-lg font-mono font-black text-yellow-500 tracking-wider">{depositSettings.accountNumber}</p>
                      </div>
                      
                      {depositSettings.qrCodeUrl && (
                        <div className="flex flex-col items-center gap-2 pt-2">
                          <p className="text-[10px] font-bold uppercase opacity-40">Quét mã QR để nạp nhanh</p>
                          <img src={depositSettings.qrCodeUrl} alt="QR Code" className="w-48 h-48 rounded-2xl border-4 border-white/10" referrerPolicy="no-referrer" />
                        </div>
                      )}

                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] text-slate-400 italic">* Nội dung chuyển khoản: <span className="text-white font-bold">NAP {profile?.uid.slice(-6)}</span></p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Đang tải hướng dẫn nạp tiền...</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button onClick={handleTopUp} className="p-6 bg-slate-900 rounded-3xl border border-white/5 text-center space-y-2 hover:bg-white/5 transition-all">
                    <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mx-auto"><Check size={20} /></div>
                    <p className="font-bold text-sm">Nạp tiền</p>
                  </button>
                  <button onClick={() => setShowWithdraw(true)} className="p-6 bg-slate-900 rounded-3xl border border-white/5 text-center space-y-2 hover:bg-white/5 transition-all">
                    <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mx-auto"><ArrowUpRight size={20} /></div>
                    <p className="font-bold text-sm">Rút tiền</p>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed inset-0 z-[100] bg-[#020617] p-4 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black italic uppercase">Lịch sử vòng chơi</h2>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full"><LogOut size={20} className="rotate-180" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {history.map((round) => {
                  const userBet = userBets[round.roundId];
                  const isWin = userBet && userBet.side === round.result;
                  
                  return (
                    <div 
                      key={round.roundId} 
                      className={cn(
                        "p-4 rounded-2xl border transition-all flex items-center justify-between",
                        userBet ? (isWin ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30") : "bg-slate-900/60 border-white/5"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs italic shadow-lg", 
                          round.result === 'tai' ? "bg-blue-500 text-white shadow-blue-500/30" : "bg-emerald-500 text-white shadow-emerald-500/30"
                        )}>
                          {round.result === 'tai' ? 'TÀI' : 'XỈU'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-400">#{round.roundId.slice(-6)}</p>
                            {userBet && (
                              <span className={cn(
                                "text-[8px] px-2 py-0.5 rounded-full font-black uppercase shadow-sm", 
                                isWin ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                              )}>
                                {isWin ? 'Thắng' : 'Thua'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-mono font-bold">{round.dice.join(' - ')} = {round.total}</p>
                          {userBet && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] text-slate-400">
                                Cược <span className="text-white font-bold">{userBet.amount.toLocaleString()}</span> vào <span className={cn("font-bold", userBet.side === 'tai' ? "text-blue-400" : "text-emerald-400")}>{userBet.side === 'tai' ? 'Tài' : 'Xỉu'}</span>
                              </p>
                              {isWin && <p className="text-[10px] text-emerald-400 font-bold">+{ (userBet.amount * 1.95).toLocaleString() }</p>}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500">{new Date(round.timestamp).toLocaleTimeString()}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Modal */}
        <AnimatePresence>
          {showWithdraw && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-xs bg-slate-900 border border-blue-500/30 p-6 rounded-[2.5rem] space-y-6 shadow-2xl relative">
                <button onClick={() => setShowWithdraw(false)} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-slate-500"><X size={20} /></button>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3"><ArrowUpRight size={24} /></div>
                  <h3 className="text-xl font-black italic uppercase">Rút tiền</h3>
                  <p className="text-[10px] text-slate-400">Vui lòng điền thông tin nhận tiền</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-40">Ngân hàng</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="VD: Vietcombank"
                      value={withdrawForm.bankName}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-40">Số tài khoản</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Nhập số tài khoản"
                      value={withdrawForm.accountNumber}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-40">Chủ tài khoản</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Tên in trên thẻ"
                      value={withdrawForm.accountHolder}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, accountHolder: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-40">Số tiền rút</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Tối thiểu 50,000"
                      value={withdrawForm.amount || ''}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setShowWithdraw(false)} className="py-3 bg-slate-800 text-slate-400 rounded-2xl font-bold text-sm">Hủy</button>
                  <button onClick={handleWithdraw} className="py-3 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/20">Xác nhận</button>
                </div>
              </div>
            </motion.div>
          )}

          {showAdmin && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md p-4 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Shield className="text-blue-400" />
                  <h2 className="text-xl font-black italic uppercase">Quản lý Admin</h2>
                </div>
                <button onClick={() => setShowAdmin(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={24} /></button>
              </div>
              
              <div className="flex gap-2 mb-6">
                <button 
                  onClick={() => setAdminTab('users')}
                  className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold transition-all", adminTab === 'users' ? "bg-blue-500 text-white" : "bg-white/5 text-slate-400")}
                >
                  Người chơi
                </button>
                <button 
                  onClick={() => setAdminTab('deposit')}
                  className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold transition-all", adminTab === 'deposit' ? "bg-blue-500 text-white" : "bg-white/5 text-slate-400")}
                >
                  Cấu hình nạp
                </button>
                <button 
                  onClick={() => setAdminTab('virtual')}
                  className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold transition-all", adminTab === 'virtual' ? "bg-blue-500 text-white" : "bg-white/5 text-slate-400")}
                >
                  Người ảo
                </button>
              </div>

              {adminTab === 'users' && (
                <>
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 mb-6">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input 
                        placeholder="Tìm kiếm ID người chơi..."
                        className="w-full bg-white/5 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4">
                    {adminUsers.filter(u => u.uid.includes(adminSearch) || u.displayName?.toLowerCase().includes(adminSearch.toLowerCase())).map((u) => (
                      <div key={u.uid} className="bg-slate-900 p-4 rounded-2xl border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-white">{u.displayName}</p>
                            <p className="text-[10px] font-mono text-slate-500">{u.uid}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-yellow-500">{u.balance.toLocaleString()} VNĐ</p>
                            <p className="text-[8px] uppercase opacity-40">Số dư hiện tại</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => handleAdminUpdateBalance(u.uid, 100000)} className="py-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-500/30">+100K</button>
                          <button onClick={() => handleAdminUpdateBalance(u.uid, -100000)} className="py-2 bg-red-500/20 text-red-400 rounded-xl text-xs font-bold hover:bg-red-500/30">-100K</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {adminTab === 'deposit' && (
                <div className="flex-1 overflow-y-auto space-y-4 bg-slate-900 p-6 rounded-[2rem] border border-white/5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase opacity-40">Tên ngân hàng</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        value={depositSettings?.bankName || ''}
                        onChange={(e) => setDepositSettings(prev => prev ? { ...prev, bankName: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase opacity-40">Số tài khoản</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        value={depositSettings?.accountNumber || ''}
                        onChange={(e) => setDepositSettings(prev => prev ? { ...prev, accountNumber: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase opacity-40">Chủ tài khoản</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        value={depositSettings?.accountHolder || ''}
                        onChange={(e) => setDepositSettings(prev => prev ? { ...prev, accountHolder: e.target.value } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase opacity-40">Link mã QR (URL)</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        value={depositSettings?.qrCodeUrl || ''}
                        onChange={(e) => setDepositSettings(prev => prev ? { ...prev, qrCodeUrl: e.target.value } : null)}
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        if (depositSettings) {
                          // Note: Saving deposit settings via API is not implemented in this version
                          alert('Chức năng này đang được phát triển');
                        }
                      }}
                      className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 transition-all"
                    >
                      Lưu cấu hình
                    </button>
                  </div>
                </div>
              )}

              {adminTab === 'virtual' && (
                <div className="flex-1 overflow-y-auto space-y-4 bg-slate-900 p-6 rounded-[2rem] border border-white/5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                      <span className="text-xs font-bold uppercase opacity-60">Kích hoạt người ảo</span>
                      <button 
                        onClick={() => setVirtualSettings(prev => prev ? { ...prev, enabled: !prev.enabled } : null)}
                        className={cn("w-12 h-6 rounded-full transition-all relative", virtualSettings?.enabled ? "bg-emerald-500" : "bg-slate-700")}
                      >
                        <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", virtualSettings?.enabled ? "left-7" : "left-1")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Số người tối thiểu</label>
                        <input 
                          type="number"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={virtualSettings?.minPlayers || 0}
                          onChange={(e) => setVirtualSettings(prev => prev ? { ...prev, minPlayers: parseInt(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Số người tối đa</label>
                        <input 
                          type="number"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={virtualSettings?.maxPlayers || 0}
                          onChange={(e) => setVirtualSettings(prev => prev ? { ...prev, maxPlayers: parseInt(e.target.value) || 0 } : null)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Tiền cược tối thiểu</label>
                        <input 
                          type="number"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={virtualSettings?.minAmount || 0}
                          onChange={(e) => setVirtualSettings(prev => prev ? { ...prev, minAmount: parseInt(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Tiền cược tối đa</label>
                        <input 
                          type="number"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={virtualSettings?.maxAmount || 0}
                          onChange={(e) => setVirtualSettings(prev => prev ? { ...prev, maxAmount: parseInt(e.target.value) || 0 } : null)}
                        />
                      </div>
                    </div>
                    <button onClick={handleSaveVirtualSettings} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20">Lưu cấu hình người ảo</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
