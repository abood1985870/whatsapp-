"use client";
import * as React from "react";
import { cn } from "./button";
import { X } from "lucide-react";

/**
 * Dialog.
 *
 * Shadow is reserved for things that float, so this is the one place it goes
 * to full strength. Escape closes it, the backdrop closes it, and focus moves
 * into the panel — a dialog you cannot dismiss from the keyboard is a trap.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "w-full bg-surface rounded-lg shadow-pop border border-line",
          "max-h-[90vh] flex flex-col outline-none animate-fade-up",
          { "max-w-sm": size === "sm", "max-w-lg": size === "md", "max-w-3xl": size === "lg" }
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-content leading-tight">{title}</h2>
            {description && <p className="text-label text-muted mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="shrink-0 grid place-items-center w-8 h-8 -m-1 rounded text-faint hover:text-content hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line bg-surface-2 rounded-b-lg">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
