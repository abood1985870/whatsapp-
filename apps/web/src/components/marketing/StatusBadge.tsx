import { CAMPAIGN_STATUS_AR } from "@/lib/marketing";

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    PREPARING: "bg-blue-50 text-blue-700",
    READY: "bg-indigo-50 text-indigo-700",
    RUNNING: "bg-green-50 text-green-700",
    PAUSED: "bg-yellow-50 text-yellow-700",
    COMPLETED: "bg-gray-100 text-gray-700",
    CANCELLED: "bg-red-50 text-red-600",
    FAILED: "bg-red-50 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-gray-100"}`}>
      {CAMPAIGN_STATUS_AR[status] || status}
    </span>
  );
}
