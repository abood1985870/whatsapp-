"use client";
import * as React from "react";
import { cn } from "./button";

/**
 * Page furniture.
 *
 * Every screen opens the same way: what this is, one line of why it matters,
 * and the single action the screen exists for. Nothing else lives up here.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6 mb-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-title font-semibold text-content">{title}</h1>
        {description && (
          <p className="text-label text-muted mt-1 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-content">{title}</h2>}
            {description && <p className="text-micro text-muted mt-0.5">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Empty is a state worth designing.
 *
 * It says what would appear here, why it is not here yet, and — when there is
 * one — offers the action that fills it. It never apologises.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-16",
        "rounded-lg border border-dashed border-line",
        className
      )}
    >
      {Icon && (
        <span className="w-11 h-11 rounded-lg bg-surface-2 grid place-items-center mb-4">
          <Icon className="w-5 h-5 text-faint" />
        </span>
      )}
      <p className="text-[15px] font-semibold text-content">{title}</p>
      {description && (
        <p className="text-label text-muted mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Loading shows the shape of what is coming, not a spinner in a void — so the
 * layout does not jump when the data lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded bg-ink-100 dark:bg-ink-800 animate-pulse", className)}
      aria-hidden
    />
  );
}

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A failure the user can act on: what broke, and the way out. The raw message
 * is shown rather than hidden — an operator debugging a WhatsApp outage at
 * 2am needs the actual error, not "حدث خطأ ما".
 */
export function ErrorState({
  title = "تعذّر تحميل البيانات",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-danger-500/30 bg-danger-50 dark:bg-danger-600/10 px-5 py-4",
        className
      )}
      role="alert"
    >
      <p className="text-label font-semibold text-danger-600 dark:text-danger-400">{title}</p>
      {message && <p className="text-micro text-muted mt-1 break-words">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-label font-medium text-brand hover:underline underline-offset-4"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
