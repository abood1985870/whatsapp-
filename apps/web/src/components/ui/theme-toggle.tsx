"use client";
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "./button";

const KEY = "qano-theme";

/**
 * Theme switch.
 *
 * The initial class is applied by an inline script in the root layout before
 * paint; this component only reads what that script already decided, so there
 * is no flash and no hydration mismatch.
 */
export function ThemeToggle({ className, frame }: { className?: string; frame?: boolean }) {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* private mode — the choice just does not persist */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      title={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      className={cn(
        "grid place-items-center w-9 h-9 rounded transition-colors",
        frame
          ? "text-frame-muted hover:text-frame-text hover:bg-white/5"
          : "text-muted hover:text-content hover:bg-surface-2",
        className
      )}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
