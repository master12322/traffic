import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Alert, Segment } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export interface LiveState {
  connected: boolean;
  segments: Segment[];
  alerts: Alert[];
  lastTick: number | null;
}

// Subscribes to the backend's live congestion stream over Socket.IO.
export function useLiveTraffic() {
  const [state, setState] = useState<LiveState>({
    connected: false,
    segments: [],
    alerts: [],
    lastTick: null,
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket"], reconnection: true });
    socketRef.current = socket;

    socket.on("connect", () => setState((s) => ({ ...s, connected: true })));
    socket.on("disconnect", () => setState((s) => ({ ...s, connected: false })));

    socket.on("segments", (segments: Segment[]) => {
      setState((s) => ({ ...s, segments, lastTick: Date.now() }));
    });

    socket.on("alert", (alert: Alert) => {
      setState((s) => ({ ...s, alerts: [alert, ...s.alerts].slice(0, 30) }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return state;
}
