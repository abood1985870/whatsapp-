"use client";
import * as React from "react";
import { cn } from "./button";

/**
 * Machine-generated values.
 *
 * Every phone number, price, duration, id and timestamp in this product is
 * set in mono, left-to-right, with tabular figures — so columns of them line
 * up, and so a number is never mistaken for prose. In an Arabic RTL interface
 * this also removes the bidirectional confusion that makes "+966 50 123 4567"
 * render with its parts in the wrong order.
 */

export function Data({ children, className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("num", className)} {...rest}>
      {children}
    </span>
  );
}

/** +966 50 123 4567 — grouped the way a Saudi number is actually read. */
export function formatPhone(raw?: string | null): string {
  if (!raw) return "—";
  const d = String(raw).replace(/\D/g, "");
  if (!d) return "—";
  if (d.startsWith("966") && d.length === 12) {
    return `+966 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  if (d.startsWith("05") && d.length === 10) {
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  if (d.length > 10) return `+${d}`;
  return d;
}

export function Phone({ value, className }: { value?: string | null; className?: string }) {
  return <Data className={className}>{formatPhone(value)}</Data>;
}

/** Money is stored in halalas everywhere. It is never displayed as one. */
export function formatSar(minor?: number | null): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return "—";
  const riyals = Math.floor(Math.abs(minor) / 100);
  const halalas = Math.abs(minor) % 100;
  const sign = minor < 0 ? "-" : "";
  return `${sign}${riyals.toLocaleString("en-US")}.${String(halalas).padStart(2, "0")}`;
}

export function Money({
  minor,
  className,
  unit = "ر.س",
}: {
  minor?: number | null;
  className?: string;
  unit?: string | null;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <Data className="font-medium">{formatSar(minor)}</Data>
      {unit && <span className="text-micro text-faint">{unit}</span>}
    </span>
  );
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function Duration({ seconds, className }: { seconds?: number | null; className?: string }) {
  return <Data className={className}>{formatDuration(seconds)}</Data>;
}

/**
 * Time in a support console answers one question: how stale is this?
 * So the relative form leads, and the exact timestamp lives in the tooltip.
 */
export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} ي`;
  return new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
}

export function Stamp({ iso, className }: { iso?: string | null; className?: string }) {
  const [title, setTitle] = React.useState<string | undefined>(undefined);
  // Rendered after mount so the server and client never disagree on locale.
  React.useEffect(() => {
    if (iso) setTitle(new Date(iso).toLocaleString("ar-SA"));
  }, [iso]);
  return (
    <span className={cn("text-micro text-faint tabular-nums", className)} title={title}>
      {relativeTime(iso)}
    </span>
  );
}

/** A count that belongs to a metric, not to a sentence. */
export function Count({
  value,
  className,
}: {
  value?: number | null;
  className?: string;
}) {
  return (
    <Data className={className}>
      {value === null || value === undefined ? "—" : value.toLocaleString("en-US")}
    </Data>
  );
}
