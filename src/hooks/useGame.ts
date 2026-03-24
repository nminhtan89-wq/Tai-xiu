import { useEffect, useState, useCallback, useRef } from 'react';
import { GameStatus } from '../types';

export const useGame = () => {
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      setConnected(true);
      console.log('Connected to game server');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT' || data.type === 'GAME_START' || data.type === 'GAME_RESULT') {
        setStatus(data);
      } else if (data.type === 'TICK') {
        setStatus((prev) => prev ? { ...prev, timeLeft: data.timeLeft, state: data.state } : null);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      console.log('Disconnected from game server, retrying...');
      setTimeout(connect, 3000);
    };

    socketRef.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
    };
  }, [connect]);

  return { status, connected };
};
