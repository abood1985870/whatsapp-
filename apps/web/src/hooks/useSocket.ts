"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:3002";

export function useSocket() {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token || !user) return;

    const socket = io(REALTIME_URL, {
      auth: { token },
      transports: ["websocket"]
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
  }, [token, user]);

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
