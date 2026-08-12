"use client";
import * as React from "react";
import { cn } from "./button";

/**
 * Form controls.
 *
 * One shared surface class so an input, a textarea and a select are
 * indistinguishable until you interact with them — a form should read as one
 * object, not as five differently-shaped boxes.
 */
const field = cn(
  "w-full rounded bg-surface text-content",
  "border border-line-strong",
  "placeholder:text-faint",
  "transition-[border-color,box-shadow] duration-150",
  "hover:border-ink-300 dark:hover:border-ink-600",
  "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-2"
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the value in mono LTR — for phone numbers, ids, keys, amounts. */
  numeric?: boolean;
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, numeric, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        field,
        "h-10 px-3 text-[14px]",
        numeric && "num",
        invalid && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        field,
        "px-3 py-2 text-[14px] resize-y min-h-[80px]",
        invalid && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(field, "h-10 px-3 text-[14px] cursor-pointer appearance-none", className)}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

/**
 * Label, control, hint and error as one unit.
 *
 * The error replaces the hint rather than stacking under it, so the form never
 * changes height while you are typing in it.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-label font-medium text-content">
          {label}
          {required && <span className="text-danger-500 mr-1">*</span>}
        </label>
      )}
      {children}
      {(error || hint) && (
        <p className={cn("text-micro leading-snug", error ? "text-danger-500" : "text-faint")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/** A switch, for settings that take effect the moment you flip them. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full",
        "transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-brand" : "bg-ink-200 dark:bg-ink-700"
      )}
    >
      <span
        className={cn(
          "absolute h-[18px] w-[18px] rounded-full bg-white shadow-card",
          "transition-[inset-inline-start] duration-200"
        )}
        style={{ insetInlineStart: checked ? "calc(100% - 21px)" : "3px" }}
      />
    </button>
  );
}

export { Input, Textarea, Select };
