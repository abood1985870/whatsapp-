"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingRows } from "@/components/ui/page";
import { Phone, Stamp } from "@/components/ui/data";
import { dutyOf, railClass, DutyBadge, type Duty } from "@/components/ui/duty";
import { Search, Inbox as InboxIcon, MessageSquare, Building2 } from "lucide-react";

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

/**
 * صندوق الوارد — the duty board.
 *
 * The list is sorted by nothing clever: it is the order the API returns,
 * newest activity first. What changed is that you can now answer "who is on
 * this?" from the rail alone, and the filters are the duty states themselves
 * with real counts — so "بانتظارك ٣" is a number you can act on, not a label.
 */
export default function InboxPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Duty>("all");
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
      setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
    };

    const handleUpdateConversation = (updatedConv: Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
      );
    };

    const handleNewMessage = (msg: any) => {
      if (msg.conversationId) {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.conversationId);
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

  const withDuty = useMemo(
    () =>
      conversations.map((c) => ({
        conv: c,
        duty: dutyOf({ status: c.status, mode: c.mode, assigned: !!c.assignedMembership }),
      })),
    [conversations]
  );

  // Counts come from the loaded list, so they always match what is on screen.
  const counts = useMemo(() => {
    const base: Record<string, number> = { all: withDuty.length, auto: 0, alert: 0, human: 0, done: 0 };
    withDuty.forEach(({ duty }) => { base[duty] += 1; });
    return base;
  }, [withDuty]);

  // Search and filter now compose. Previously a search term silently
  // discarded the active filter.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return withDuty.filter(({ conv, duty }) => {
      if (filter !== "all" && duty !== filter) return false;
      if (!term) return true;
      return (
        conv.contact.name?.toLowerCase().includes(term) ||
        conv.contact.primaryPhone.replace(/\D/g, "").includes(term.replace(/\D/g, "")) ||
        false
      );
    });
  }, [withDuty, filter, search]);

  const TABS: { key: "all" | Duty; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "alert", label: "بانتظارك" },
    { key: "auto", label: "آلي" },
    { key: "human", label: "موظف" },
    { key: "done", label: "منتهية" },
  ];

  return (
    <div className="h-screen flex flex-col">
      <header className="shrink-0 bg-surface border-b border-line">
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h1 className="text-title font-semibold text-content">صندوق الوارد</h1>
            <p className="text-label text-muted mt-0.5 flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  isConnected ? "bg-qano-500" : "bg-ink-300 dark:bg-ink-600"
                )}
                aria-hidden
              />
              {isConnected ? "التحديث المباشر يعمل" : "غير متصل بالتحديث المباشر"}
            </p>
          </div>

          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 text-faint absolute inset-y-0 my-auto start-3 pointer-events-none" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل أو رقمه…"
              className="ps-9"
            />
          </div>
        </div>

        {/* حالات المناوبة — الأرقام من نفس القائمة المعروضة */}
        <div className="flex items-center gap-1 px-6 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2.5 text-label whitespace-nowrap transition-colors",
                  "border-b-2",
                  active
                    ? "border-brand text-content font-medium"
                    : "border-transparent text-muted hover:text-content"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "num text-micro rounded-sm px-1.5 py-0.5",
                    tab.key === "alert" && counts.alert > 0
                      ? "bg-alert-50 text-alert-700 dark:bg-alert-700/25 dark:text-alert-300 font-semibold"
                      : "bg-surface-2 text-faint"
                  )}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-[380px] shrink-0 bg-surface border-e border-line overflow-y-auto">
          {loading ? (
            <div className="p-4">
              <LoadingRows rows={6} />
            </div>
          ) : !orgId ? (
            <div className="p-4">
              <EmptyState
                icon={Building2}
                title="ما فيه منشأة مرتبطة بحسابك"
                description="تواصل مع مالك الحساب لإضافتك إلى المنشأة، وبعدها تظهر لك المحادثات هنا."
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={InboxIcon}
                title={search || filter !== "all" ? "ما فيه نتائج" : "الصندوق فاضي"}
                description={
                  search || filter !== "all"
                    ? "جرّب كلمة بحث ثانية أو أزل التصفية."
                    : "أول ما يوصل عميل رسالة على واتساب، تظهر محادثته هنا مباشرة."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map(({ conv, duty }) => (
                <li key={conv.id}>
                  <Link
                    href={`/app/inbox/${conv.id}`}
                    className={cn(
                      railClass(duty),
                      "flex items-start gap-3 py-3.5 pe-4 ps-4 transition-colors hover:bg-surface-2",
                      duty === "done" && "opacity-65"
                    )}
                  >
                    <span
                      className={cn(
                        "w-9 h-9 rounded-full grid place-items-center text-label font-semibold shrink-0",
                        duty === "auto"
                          ? "bg-qano-50 text-qano-700 dark:bg-qano-900 dark:text-qano-300"
                          : "bg-surface-2 text-muted"
                      )}
                    >
                      {conv.contact.name?.charAt(0) || "؟"}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-[14px] font-medium text-content truncate">
                          {conv.contact.name || <Phone value={conv.contact.primaryPhone} />}
                        </h3>
                        <Stamp iso={conv.lastMessageAt} className="shrink-0" />
                      </div>

                      {conv.contact.name && (
                        <Phone value={conv.contact.primaryPhone} className="text-micro text-faint" />
                      )}

                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <DutyBadge duty={duty} short />
                        <div className="flex items-center gap-2 shrink-0">
                          {conv.assignedMembership && (
                            <span className="text-micro text-faint truncate max-w-[100px]">
                              {conv.assignedMembership.user.name}
                            </span>
                          )}
                          {conv.unreadCount ? (
                            <span className="num bg-brand text-brand-fg text-micro font-semibold min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center">
                              {conv.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden md:flex flex-1 items-center justify-center bg-bg px-6">
          <div className="text-center max-w-xs">
            <span className="w-12 h-12 rounded-lg bg-surface-2 grid place-items-center mx-auto mb-4">
              <MessageSquare className="w-5 h-5 text-faint" />
            </span>
            <p className="text-[15px] font-semibold text-content">اختر محادثة</p>
            <p className="text-label text-muted mt-1.5 leading-relaxed">
              الشريط على حافة كل صف يقول لك من يتولّاها الآن — الأخضر للموظف الذكي،
              والبرتقالي ينتظر ردّك.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
