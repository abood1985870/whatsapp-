"use client";
import * as React from "react";
import { Bot, UserRound, Hand, Check } from "lucide-react";
import { cn } from "./button";

/**
 * The duty model — the one idea the whole interface is built on.
 *
 * A hue only ever means "the machine is involved":
 *   auto  → Qano is handling it, nobody is watching   (teal)
 *   alert → it is waiting for a person                (amber)
 *   human → a person has it                           (no hue)
 *   done  → finished                                  (no hue, receded)
 *
 * Because human-held work carries no colour, an agent scanning a list sees
 * only the rows that are not under human control. That is the whole point.
 */
export type Duty = "auto" | "alert" | "human" | "done";

/** Derives duty from the conversation shape the API already returns. */
export function dutyOf(input: {
  status?: string | null;
  mode?: string | null;
  assigned?: boolean;
}): Duty {
  const { status, mode, assigned } = input;
  if (status === "RESOLVED" || status === "CLOSED") return "done";
  if (status === "WAITING_FOR_AGENT") return "alert";
  if (mode === "AI_AUTOMATIC") return "auto";
  if (assigned) return "human";
  return "alert";
}

const LABEL: Record<Duty, string> = {
  auto: "يتولّاها الموظف الذكي",
  alert: "بانتظارك",
  human: "يتولّاها موظف",
  done: "منتهية",
};

const SHORT: Record<Duty, string> = {
  auto: "آلي",
  alert: "بانتظارك",
  human: "موظف",
  done: "منتهية",
};

const ICON: Record<Duty, React.ComponentType<{ className?: string }>> = {
  auto: Bot,
  alert: Hand,
  human: UserRound,
  done: Check,
};

export const dutyLabel = (d: Duty) => LABEL[d];

/** The signature element: a rail on the leading edge of a row. */
export function railClass(duty: Duty) {
  return cn("rail", {
    "rail-auto": duty === "auto",
    "rail-alert": duty === "alert",
    "rail-human": duty === "human",
    "rail-done": duty === "done",
  });
}

export function DutyBadge({
  duty,
  short,
  className,
}: {
  duty: Duty;
  short?: boolean;
  className?: string;
}) {
  const Icon = ICON[duty];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-micro font-semibold",
        {
          "bg-qano-50 text-qano-700 dark:bg-qano-900 dark:text-qano-300": duty === "auto",
          "bg-alert-50 text-alert-700 dark:bg-alert-700/25 dark:text-alert-300": duty === "alert",
          "bg-surface-2 text-muted border border-line": duty === "human",
          "text-faint": duty === "done",
        },
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {short ? SHORT[duty] : LABEL[duty]}
    </span>
  );
}

/**
 * The rail, promoted to a full band at the top of an open thread — so the
 * question "who is answering this customer right now?" is answered before
 * you read a single message, and the action to change it is right there.
 */
export function DutyBand({
  duty,
  detail,
  action,
}: {
  duty: Duty;
  detail?: string;
  action?: React.ReactNode;
}) {
  const Icon = ICON[duty];
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-2.5 border-b border-line",
        {
          "bg-qano-50 dark:bg-qano-900/40": duty === "auto",
          "bg-alert-50 dark:bg-alert-700/20": duty === "alert",
          "bg-surface-2": duty === "human" || duty === "done",
        }
      )}
    >
      <span
        className={cn("shrink-0 w-7 h-7 rounded-sm grid place-items-center", {
          "bg-qano-600 text-white": duty === "auto",
          "bg-alert-500 text-white": duty === "alert",
          "bg-ink-300 text-ink-900 dark:bg-ink-700 dark:text-ink-100": duty === "human",
          "bg-transparent text-faint": duty === "done",
        })}
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold leading-tight">{LABEL[duty]}</p>
        {detail && <p className="text-micro text-muted truncate">{detail}</p>}
      </div>
      {action}
    </div>
  );
}
