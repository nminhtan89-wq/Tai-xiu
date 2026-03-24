export type GameState = 'betting' | 'result';

export interface VirtualConfig {
  enabled: boolean;
  minPlayers: number;
  maxPlayers: number;
  minAmount: number;
  maxAmount: number;
}

export interface GameStatus {
  state: GameState;
  timeLeft: number;
  lastDice: number[];
  lastResult: 'tai' | 'xiu' | null;
  roundId: string;
  jackpotWon: boolean;
  virtualStats?: {
    tai: { players: number, amount: number },
    xiu: { players: number, amount: number }
  };
}

export interface UserProfile {
  uid: string;
  telegramId?: string | null;
  displayName?: string;
  balance: number;
  createdAt: string;
  role?: 'admin' | 'user';
}

export interface Bet {
  id: string;
  userId: string;
  displayName: string;
  amount: number;
  side: 'tai' | 'xiu';
  status: 'pending' | 'confirmed';
  timestamp: string;
  roundId: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isVirtual?: boolean;
}

export interface GameRound {
  roundId: string;
  dice: number[];
  result: 'tai' | 'xiu';
  total: number;
  timestamp: string;
  jackpotWon: boolean;
}

export interface DepositSettings {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  qrCodeUrl?: string;
  methods: string[];
}

export interface Withdrawal {
  id?: string;
  userId: string;
  displayName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: string;
}
