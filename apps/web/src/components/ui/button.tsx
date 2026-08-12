"use client";
import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary   — the one action this screen exists for. One per view.
   * secondary — a real action, but not the point of the screen.
   * ghost     — navigation and toggles.
   * danger    — destroys something. Never the default.
   */
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

/**
 * `outline` and `destructive` are the old shadcn names, kept so the pages that
 * have not been migrated yet keep compiling. They resolve to secondary/danger.
 * @deprecated use secondary / danger
 */
type LegacyVariant = "outline" | "destructive" | "default";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link" | LegacyVariant;

const ALIAS: Record<string, ButtonVariant> = {
  outline: "secondary",
  destructive: "danger",
  default: "primary",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant: rawVariant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
  const variant = ALIAS[rawVariant] ?? rawVariant;
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium",
        "transition-[background-color,border-color,color,opacity] duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        {
          "bg-brand text-brand-fg hover:bg-qano-700 dark:hover:bg-qano-300": variant === "primary",
          "bg-surface text-content border border-line-strong hover:bg-surface-2": variant === "secondary",
          "text-muted hover:bg-surface-2 hover:text-content": variant === "ghost",
          "bg-danger-500 text-white hover:bg-danger-600": variant === "danger",
          "text-brand underline-offset-4 hover:underline p-0 h-auto": variant === "link",
          "h-8 px-3 text-label": size === "sm",
          "h-10 px-4 text-[14px]": size === "md",
          "h-12 px-6 text-base": size === "lg",
          "h-9 w-9 p-0": size === "icon",
        },
        className
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      )}
      {children}
    </button>
  );
  }
);
Button.displayName = "Button";

export { Button };
