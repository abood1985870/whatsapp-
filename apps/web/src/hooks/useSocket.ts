"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:3002";

export function useSocket(options?: { token?: string | null; enabled?: boolean }) {
  const fallbackAuth = useAuth();
  const token = options?.token ?? fallbackAuth.token;
  const enabled = options?.enabled ?? true;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token || !enabled) return;

    const socket = io(REALTIME_URL, {
      auth: { token },
      reconnectionAttempts: 3,
      timeout: 5000,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to Realtime Server");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from Realtime Server");
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token, enabled]);

  const joinConversation = (conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("join-conversation", conversationId);
    }
  };

  const leaveConversation = (conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("leave-conversation", conversationId);
    }
  };

  const emitTyping = (conversationId: string, isTyping: boolean) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("typing", { conversationId, isTyping });
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinConversation,
    leaveConversation,
    emitTyping
  };
}
