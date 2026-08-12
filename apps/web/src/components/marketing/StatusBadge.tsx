import { CAMPAIGN_STATUS_AR } from "@/lib/marketing";

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-surface-2 text-muted",
    PREPARING: "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300",
    READY: "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300",
    RUNNING: "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300",
    PAUSED: "bg-alert-50 dark:bg-alert-700/20 text-alert-700 dark:text-alert-300",
    COMPLETED: "bg-surface-2 text-muted",
    CANCELLED: "bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400",
    FAILED: "bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-surface-2"}`}>
      {CAMPAIGN_STATUS_AR[status] || status}
    </span>
  );
}
