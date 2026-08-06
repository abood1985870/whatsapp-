"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { Send, Phone, Bot, ArrowRight, Check, CheckCheck, Clock, UserCheck, CheckCircle2, RotateCcw, Ban } from "lucide-react";

interface Message {
  id: string;
  text: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  senderType: string;
  createdAt: string;
  providerStatus: string;
  isAiGenerated: boolean;
}

interface ConversationDetail {
  id: string;
  contact: { name: string | null; primaryPhone: string };
  status: string;
  mode: string;
  messages: Message[];
}

export default function ConversationPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { socket, isConnected, joinConversation, leaveConversation, emitTyping } = useSocket();
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { 
    if (id) {
      loadConversation();
      joinConversation(id);
    }
    return () => {
      if (id) leaveConversation(id);
    };
  }, [id, isConnected]);

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [conversation?.messages, typingUsers]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewMessage = (msg: Message & { conversationId: string }) => {
      if (msg.conversationId === id) {
        setConversation((prev) => {
          if (!prev) return prev;
          // Prevent duplicates
          if (prev.messages.some(m => m.id === msg.id)) return prev;
          return { ...prev, messages: [...prev.messages, msg] };
        });
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[msg.senderType];
          return next;
        });
      }
    };

    const handleMessageStatus = (data: { messageId: string, status: string }) => {
      setConversation((prev) => {
        if (!prev) return prev;
        const messages = prev.messages.map(m => m.id === data.messageId ? { ...m, providerStatus: data.status } : m);
        return { ...prev, messages };
      });
    };

    const handleTyping = (data: { userId: string, isTyping: boolean }) => {
      setTypingUsers((prev) => ({ ...prev, [data.userId]: data.isTyping }));
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:status", handleMessageStatus);
    socket.on("typing", handleTyping);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:status", handleMessageStatus);
      socket.off("typing", handleTyping);
    };
  }, [socket, isConnected, id]);

  const loadConversation = async () => {
    try { const res = await api.get(`/conversations/${id}`); setConversation(res.data.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !conversation) return;
    setSending(true);
    try { await api.post("/messages", { conversationId: id, text: message }); setMessage(""); loadConversation(); }
    catch (err) { console.error(err); } setSending(false);
  };

  const runAction = async (action: () => Promise<any>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); await loadConversation(); }
    catch (err) { console.error(err); }
    setActionBusy(false);
  };

  const resolveConversation = () => runAction(() => api.post(`/conversations/${id}/resolve`));
  const reopenConversation = () => runAction(() => api.post(`/conversations/${id}/reopen`));
  const blockConversation = () => runAction(() => api.post(`/conversations/${id}/block`));
  const toggleAiMode = () => runAction(() =>
    api.patch(`/conversations/${id}`, { mode: conversation?.mode === "AI_AUTOMATIC" ? "HUMAN_ONLY" : "AI_AUTOMATIC" })
  );
  const assignToMe = () => {
    const membershipId = user?.memberships?.[0]?.id;
    if (!membershipId) return;
    return runAction(() => api.post(`/conversations/${id}/assign`, { membershipId }));
  };

  if (loading) return <div className="flex items-center justify-center h-screen">جاري التحميل...</div>;
  if (!conversation) return <div className="flex items-center justify-center h-screen">المحادثة غير موجودة</div>;

  const handleTyping = (val: string) => {
    setMessage(val);
    if (!val.trim()) {
      emitTyping(id, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }
    
    emitTyping(id, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(id, false);
    }, 2000);
  };

  return (
    <div className="h-screen flex flex-col relative">
      <header className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/app/inbox" className="text-gray-400 hover:text-gray-600"><ArrowRight className="w-5 h-5" /></Link>
            <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold">{conversation.contact.name?.charAt(0) || "?"}</div>
            <div>
              <h2 className="font-bold text-gray-900">{conversation.contact.name || conversation.contact.primaryPhone}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500"><Phone className="w-3 h-3" /><span>{conversation.contact.primaryPhone}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleAiMode} disabled={actionBusy} title="تبديل وضع الرد الآلي"
              className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 transition disabled:opacity-50 ${conversation.mode === "AI_AUTOMATIC" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {conversation.mode === "AI_AUTOMATIC" ? <><Bot className="w-3 h-3" /> AI يعمل</> : <><UserCheck className="w-3 h-3" /> بشري فقط</>}
            </button>
            <span className={`text-xs px-2 py-1 rounded-full ${conversation.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{conversation.status}</span>
            <button onClick={assignToMe} disabled={actionBusy} title="تعيين لي"
              className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-1 disabled:opacity-50">
              <UserCheck className="w-3 h-3" /> تعيين لي
            </button>
            {conversation.status === "RESOLVED" || conversation.status === "CLOSED" ? (
              <button onClick={reopenConversation} disabled={actionBusy} title="إعادة فتح"
                className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition flex items-center gap-1 disabled:opacity-50">
                <RotateCcw className="w-3 h-3" /> إعادة فتح
              </button>
            ) : (
              <button onClick={resolveConversation} disabled={actionBusy} title="إنهاء المحادثة"
                className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition flex items-center gap-1 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> إنهاء
              </button>
            )}
            <button onClick={blockConversation} disabled={actionBusy} title="حظر (سبام)"
              className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition flex items-center gap-1 disabled:opacity-50">
              <Ban className="w-3 h-3" /> حظر
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {conversation.messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.direction === "OUTBOUND" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-lg px-4 py-3 rounded-2xl ${msg.direction === "OUTBOUND" ? "bg-white border border-gray-200 text-gray-900 rounded-tr-sm" : "bg-gold-500 text-white rounded-tl-sm"}`}>
              {msg.isAiGenerated && <div className="flex items-center gap-1 mb-1 text-xs opacity-70"><Bot className="w-3 h-3" /> AI</div>}
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              <div className="flex items-center gap-1 mt-1 justify-end">
                <span className="text-xs opacity-60">{new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
                {msg.direction === "OUTBOUND" && (msg.providerStatus === "READ" ? <CheckCheck className="w-3 h-3 text-blue-500" /> : msg.providerStatus === "DELIVERED" ? <Check className="w-3 h-3 text-gray-400" /> : <Clock className="w-3 h-3 text-gray-400" />)}
              </div>
            </div>
          </div>
        ))}
        {Object.keys(typingUsers).some(k => typingUsers[k]) && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 text-gray-400 px-4 py-2 rounded-2xl rounded-tr-sm text-sm italic">
              جاري الكتابة...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 p-4 shrink-0">
        <div className="flex items-center gap-3">
          <input type="text" value={message} onChange={(e) => handleTyping(e.target.value)} placeholder="اكتب رسالتك..." className="flex-1 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500 text-sm" disabled={sending} />
          <button type="submit" disabled={sending || !message.trim()} className="bg-gold-500 text-charcoal-900 p-3 rounded-xl hover:bg-gold-400 transition disabled:opacity-50"><Send className="w-5 h-5" /></button>
        </div>
      </form>
    </div>
  );
}
