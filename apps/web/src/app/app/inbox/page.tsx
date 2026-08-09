"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import {
  Search, Filter, MessageSquare, User, Clock,
  CheckCircle2, AlertCircle, Bot, UserCheck, MoreVertical
} from "lucide-react";

interface Conversation {
  id: string;
  contact: { name: string | null; primaryPhone: string; avatarUrl: string | null };
  status: string;
  mode: string;
  priority: string;
  lastMessageAt: string | null;
  assignedMembership: { user: { name: string } } | null;
  unreadCount?: number;
}

export default function InboxPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [orgId, setOrgId] = useState("");

  const { socket, isConnected } = useSocket({ token, enabled: !!orgId });

  useEffect(() => {
    const membership = user?.memberships?.[0];
    if (membership) {
      setOrgId(membership.organizationId);
      loadConversations(membership.organizationId);
      return;
    }
    if (!authLoading) setLoading(false);
  }, [authLoading, user]);

  useEffect(() => {
    if (!socket || !isConnected || !orgId) return;

    const handleNewConversation = (newConv: Conversation) => {
      setConversations((prev) => [newConv, ...prev.filter(c => c.id !== newConv.id)]);
    };

    const handleUpdateConversation = (updatedConv: Conversation) => {
      setConversations((prev) => prev.map(c => c.id === updatedConv.id ? { ...c, ...updatedConv } : c));
    };

    const handleNewMessage = (msg: any) => {
      if (msg.conversationId) {
        setConversations((prev) => {
          const idx = prev.findIndex(c => c.id === msg.conversationId);
          if (idx === -1) return prev;
          const updated = { ...prev[idx], lastMessageAt: msg.createdAt };
          const newList = [...prev];
          newList.splice(idx, 1);
          return [updated, ...newList];
        });
      }
    };

    socket.on("conversation:new", handleNewConversation);
    socket.on("conversation:updated", handleUpdateConversation);
    socket.on("message:new", handleNewMessage);

    return () => {
      socket.off("conversation:new", handleNewConversation);
      socket.off("conversation:updated", handleUpdateConversation);
      socket.off("message:new", handleNewMessage);
    };
  }, [socket, isConnected, orgId]);

  const loadConversations = async (organizationId: string) => {
    try {
      const res = await api.get(`/conversations?organizationId=${organizationId}`);
      setConversations(res.data.data || []);
    } catch (err) {
      console.error("Failed to load conversations", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (search) {
      const term = search.toLowerCase();
      return (
        c.contact.name?.toLowerCase().includes(term) ||
        c.contact.primaryPhone.includes(term)
      );
    }
    if (filter === "unassigned") return !c.assignedMembership;
    if (filter === "ai") return c.mode === "AI_AUTOMATIC";
    if (filter === "human") return c.mode === "HUMAN_ONLY";
    if (filter === "waiting") return c.status === "WAITING_FOR_AGENT";
    return true;
  });

  const getStatusIcon = (status: string, mode: string) => {
    if (mode === "AI_AUTOMATIC") return <Bot className="w-4 h-4 text-blue-500" />;
    if (status === "RESOLVED") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "WAITING_FOR_AGENT") return <AlertCircle className="w-4 h-4 text-amber-500" />;
    return <MessageSquare className="w-4 h-4 text-gray-400" />;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      NEW: "bg-blue-100 text-blue-700",
      OPEN: "bg-green-100 text-green-700",
      WAITING_FOR_AGENT: "bg-amber-100 text-amber-700",
      WAITING_FOR_CUSTOMER: "bg-purple-100 text-purple-700",
      RESOLVED: "bg-gray-100 text-gray-600",
      CLOSED: "bg-gray-100 text-gray-500",
    };
    return styles[status] || "bg-gray-100 text-gray-600";
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">صندوق الوارد</h1>
            <p className="text-sm text-gray-500 mt-1">إدارة محادثات العملاء</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في المحادثات..." className="pr-10 pl-4 py-2 border border-gray-200 rounded-lg w-64 focus:outline-none focus:border-gold-500 text-sm" />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-500">
              <option value="all">الكل</option>
              <option value="unassigned">غير مخصص</option>
              <option value="ai">ذكاء اصطناعي</option>
              <option value="human">بشري فقط</option>
              <option value="waiting">بانتظار موظف</option>
            </select>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-96 bg-white border-l border-gray-200 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
          ) : !orgId ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">لا توجد منظمة مرتبطة بالحساب</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">لا توجد محادثات</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((conv) => (
                <Link key={conv.id} href={`/app/inbox/${conv.id}`} className="block p-4 hover:bg-gray-50 transition border-r-2 border-transparent hover:border-gold-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold flex-shrink-0">
                      {conv.contact.name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-gray-900 truncate">{conv.contact.name || conv.contact.primaryPhone}</h3>
                        {conv.lastMessageAt && (
                          <span className="text-xs text-gray-400">
                            {new Date(conv.lastMessageAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(conv.status, conv.mode)}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(conv.status)}`}>
                          {conv.status === "NEW" ? "جديدة" : conv.status === "OPEN" ? "مفتوحة" : conv.status === "WAITING_FOR_AGENT" ? "بانتظار موظف" : conv.status === "RESOLVED" ? "محلولة" : conv.status}
                        </span>
                        {conv.mode === "AI_AUTOMATIC" && <span className="text-xs text-blue-600">AI</span>}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {conv.assignedMembership ? `مخصص لـ ${conv.assignedMembership.user.name}` : "غير مخصص"}
                        </span>
                        {conv.unreadCount ? (
                          <span className="bg-gold-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{conv.unreadCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Empty State */}
        <div className="flex-1 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-1">اختر محادثة</h3>
            <p className="text-gray-400 text-sm">اختر محادثة من القائمة لعرض التفاصيل</p>
          </div>
        </div>
      </div>
    </div>
  );
}
