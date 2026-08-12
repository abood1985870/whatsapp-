"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { cn, Button } from "@/components/ui/button";
import { Phone as PhoneValue } from "@/components/ui/data";
import { DutyBand, dutyOf } from "@/components/ui/duty";
import { LoadingRows, EmptyState } from "@/components/ui/page";
import {
  Send, Bot, ArrowRight, Check, CheckCheck, Clock, UserCheck,
  CheckCircle2, RotateCcw, Ban, MoreVertical, MessageSquareOff, AlertCircle,
} from "lucide-react";

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
  assignedMembership?: { user: { name: string } } | null;
  messages: Message[];
}

/**
 * المحادثة.
 *
 * Two things this screen has to answer before anything else: who is holding
 * this conversation right now, and which of these replies came from the machine.
 * The band at the top answers the first; the teal tint on AI bubbles answers
 * the second — the same rule as everywhere else, a hue means the machine was
 * involved. A reply a human typed looks like plain paper.
 */
export default function ConversationPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          return { ...prev, messages: [...prev.messages, msg] };
        });
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[msg.senderType];
          return next;
        });
      }
    };

    const handleMessageStatus = (data: { messageId: string; status: string }) => {
      setConversation((prev) => {
        if (!prev) return prev;
        const messages = prev.messages.map((m) =>
          m.id === data.messageId ? { ...m, providerStatus: data.status } : m
        );
        return { ...prev, messages };
      });
    };

    const handleTyping = (data: { userId: string; isTyping: boolean }) => {
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
    try {
      const res = await api.get(`/conversations/${id}`);
      setConversation(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !conversation || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.post("/messages", { conversationId: id, text: message });
      setMessage("");
      await loadConversation();
    } catch (err: any) {
      // A failed send used to disappear into console.error and the operator
      // was left believing the customer received it.
      setSendError(err?.response?.data?.error?.message || "تعذّر إرسال الرسالة. الرسالة ما وصلت للعميل.");
    } finally {
      setSending(false);
    }
  };

  const runAction = async (action: () => Promise<any>) => {
    if (actionBusy) return;
    setActionBusy(true);
    setMenuOpen(false);
    try {
      await action();
      await loadConversation();
    } catch (err) {
      console.error(err);
    }
    setActionBusy(false);
  };

  const resolveConversation = () => runAction(() => api.post(`/conversations/${id}/resolve`));
  const reopenConversation = () => runAction(() => api.post(`/conversations/${id}/reopen`));
  const blockConversation = () => runAction(() => api.post(`/conversations/${id}/block`));
  const toggleAiMode = () =>
    runAction(() =>
      api.patch(`/conversations/${id}`, {
        mode: conversation?.mode === "AI_AUTOMATIC" ? "HUMAN_ONLY" : "AI_AUTOMATIC",
      })
    );
  const assignToMe = () => {
    const membershipId = user?.memberships?.[0]?.id;
    if (!membershipId) return;
    return runAction(() => api.post(`/conversations/${id}/assign`, { membershipId }));
  };

  const handleTyping = (val: string) => {
    setMessage(val);
    if (!val.trim()) {
      emitTyping(id, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }
    emitTyping(id, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(id, false), 2000);
  };

  if (loading) {
    return (
      <div className="p-6">
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-6">
        <EmptyState
          icon={MessageSquareOff}
          title="المحادثة غير موجودة"
          description="يمكن تكون محذوفة، أو الرابط غير صحيح."
          action={
            <Link href="/app/inbox">
              <Button variant="secondary">رجوع لصندوق الوارد</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const duty = dutyOf({
    status: conversation.status,
    mode: conversation.mode,
    assigned: !!conversation.assignedMembership,
  });
  const closed = conversation.status === "RESOLVED" || conversation.status === "CLOSED";
  const aiOn = conversation.mode === "AI_AUTOMATIC";

  // Day separators, so a thread spanning weeks does not read as one sitting.
  let lastDay = "";

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-surface border-b border-line px-4 sm:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/app/inbox"
              aria-label="رجوع"
              className="grid place-items-center w-9 h-9 -ms-1 rounded text-faint hover:text-content hover:bg-surface-2 transition-colors shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>
            <span className="w-9 h-9 rounded-full bg-surface-2 text-muted grid place-items-center text-label font-semibold shrink-0">
              {conversation.contact.name?.charAt(0) || "؟"}
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-content truncate leading-tight">
                {conversation.contact.name || <PhoneValue value={conversation.contact.primaryPhone} />}
              </h2>
              <PhoneValue value={conversation.contact.primaryPhone} className="text-micro text-faint" />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant={aiOn ? "secondary" : "primary"}
              onClick={toggleAiMode}
              disabled={actionBusy}
              title={aiOn ? "أوقف الرد الآلي واستلمها" : "سلّمها للموظف الذكي"}
            >
              {aiOn ? <UserCheck className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{aiOn ? "استلمها" : "سلّمها للذكي"}</span>
            </Button>

            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="إجراءات أخرى"
                aria-expanded={menuOpen}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute z-20 mt-1 end-0 w-52 rounded-lg border border-line bg-surface shadow-pop py-1 animate-fade-up">
                    <MenuItem icon={UserCheck} onClick={assignToMe} disabled={actionBusy}>
                      عيّنها لي
                    </MenuItem>
                    {closed ? (
                      <MenuItem icon={RotateCcw} onClick={reopenConversation} disabled={actionBusy}>
                        إعادة فتح
                      </MenuItem>
                    ) : (
                      <MenuItem icon={CheckCircle2} onClick={resolveConversation} disabled={actionBusy}>
                        إنهاء المحادثة
                      </MenuItem>
                    )}
                    <div className="my-1 border-t border-line" />
                    <MenuItem icon={Ban} onClick={blockConversation} disabled={actionBusy} danger>
                      حظر (سبام)
                    </MenuItem>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <DutyBand
        duty={duty}
        detail={
          conversation.assignedMembership
            ? `مُعيّنة لـ ${conversation.assignedMembership.user.name}`
            : aiOn
            ? "الردود تنطلق تلقائياً من قاعدة معرفتك"
            : "ما فيه أحد مُعيَّن لها"
        }
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3 bg-bg">
        {conversation.messages.map((msg) => {
          const day = new Date(msg.createdAt).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = msg.direction === "OUTBOUND";
          const internal = msg.direction === "INTERNAL";

          return (
            <div key={msg.id}>
              {showDay && (
                <div className="flex items-center gap-3 my-5">
                  <span className="flex-1 h-px bg-line" />
                  <span className="text-micro text-faint">
                    {new Date(msg.createdAt).toLocaleDateString("ar-SA", {
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                  <span className="flex-1 h-px bg-line" />
                </div>
              )}

              {internal ? (
                <div className="flex justify-center">
                  <div className="max-w-lg rounded border border-dashed border-line bg-surface-2 px-4 py-2 text-micro text-muted">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[min(560px,80%)] px-4 py-2.5 rounded-lg",
                      mine
                        ? msg.isAiGenerated
                          ? "bg-qano-50 dark:bg-qano-900 border border-qano-200 dark:border-qano-800 text-content rounded-ss-sm"
                          : "bg-surface border border-line text-content rounded-ss-sm"
                        : "bg-surface-2 text-content rounded-se-sm"
                    )}
                  >
                    {msg.isAiGenerated && (
                      <div className="flex items-center gap-1.5 mb-1 text-micro font-semibold text-qano-700 dark:text-qano-300">
                        <Bot className="w-3 h-3" />
                        الموظف الذكي
                      </div>
                    )}
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                    <div className="flex items-center gap-1 mt-1 justify-end">
                      <span className="num text-micro text-faint">
                        {new Date(msg.createdAt).toLocaleTimeString("ar-SA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {mine &&
                        (msg.providerStatus === "READ" ? (
                          <CheckCheck className="w-3.5 h-3.5 text-qano-500" />
                        ) : msg.providerStatus === "DELIVERED" ? (
                          <CheckCheck className="w-3.5 h-3.5 text-faint" />
                        ) : msg.providerStatus === "FAILED" ? (
                          <AlertCircle className="w-3.5 h-3.5 text-danger-500" />
                        ) : msg.providerStatus === "SENT" ? (
                          <Check className="w-3.5 h-3.5 text-faint" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-faint" />
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(typingUsers).some((k) => typingUsers[k]) && (
          <div className="flex justify-end">
            <div className="bg-surface border border-line rounded-lg px-4 py-2.5 flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="bg-surface border-t border-line p-4 shrink-0">
        {sendError && (
          <p role="alert" className="mb-2 text-micro text-danger-600 dark:text-danger-400">
            {sendError}
          </p>
        )}
        {aiOn && (
          <p className="mb-2 text-micro text-muted flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-qano-600 dark:text-qano-400 shrink-0" />
            الموظف الذكي يرد على هذي المحادثة. رسالتك تنرسل مباشرة للعميل.
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder="اكتب رسالتك…"
            disabled={sending}
            className={cn(
              "flex-1 h-11 rounded bg-surface text-content border border-line-strong px-4 text-[14px]",
              "placeholder:text-faint transition-[border-color,box-shadow] duration-150",
              "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
              "disabled:opacity-50"
            )}
          />
          <Button
            type="submit"
            size="icon"
            loading={sending}
            disabled={sending || !message.trim()}
            aria-label="إرسال"
            className="h-11 w-11"
          >
            {!sending && <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-label transition-colors text-start",
        "disabled:opacity-50 disabled:pointer-events-none",
        danger
          ? "text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-600/10"
          : "text-content hover:bg-surface-2"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {children}
    </button>
  );
}
