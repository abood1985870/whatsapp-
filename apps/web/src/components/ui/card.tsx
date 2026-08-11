"use client";
import * as React from "react";
import { cn } from "./button";
import { Data } from "./data";

/**
 * Surfaces.
 *
 * A card is a hairline and a background change — no drop shadow at rest.
 * Shadow in this system means "floating above the page" (menus, dialogs), so
 * spending it on static content leaves nothing to say that with.
 */
export function Card({
  className,
  interactive,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface",
        interactive && "transition-colors hover:border-line-strong cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 py-4 border-b border-line", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-tight text-content">{title}</h3>
        {subtitle && <p className="text-label text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/**
 * A single measured number.
 *
 * The number leads at display size in mono; the label sits under it, quiet.
 * `trend` is only ever rendered when a real comparison value was passed — this
 * component will not invent a delta to look busy.
 */
export function Metric({
  label,
  value,
  unit,
  hint,
  trend,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  trend?: { direction: "up" | "down"; text: string; good?: boolean } | null;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-5", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-faint shrink-0" />}
        <p className="text-label text-muted truncate">{label}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <Data className="text-display font-semibold text-content">{value}</Data>
        {unit && <span className="text-label text-faint">{unit}</span>}
      </div>
      {trend ? (
        <p
          className={cn(
            "mt-1.5 text-micro font-medium",
            trend.good === false ? "text-danger-500" : "text-qano-600 dark:text-qano-400"
          )}
        >
          {trend.direction === "up" ? "▲" : "▼"} {trend.text}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-micro text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** A quiet status pill. Not a duty badge — see duty.tsx for work state. */
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "alert" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-micro font-medium",
        {
          "bg-surface-2 text-muted border border-line": tone === "neutral",
          "bg-qano-50 text-qano-700 dark:bg-qano-900 dark:text-qano-300": tone === "brand",
          "bg-alert-50 text-alert-700 dark:bg-alert-700/25 dark:text-alert-300": tone === "alert",
          "bg-danger-50 text-danger-600 dark:bg-danger-600/20 dark:text-danger-400": tone === "danger",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
