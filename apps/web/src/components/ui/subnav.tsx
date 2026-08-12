"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./button";

/**
 * Module header + tab strip.
 *
 * Marketing and Voice are modules with their own sections. They share one
 * header shape so moving between them does not feel like moving between two
 * products bolted together.
 */
export type SubNavTab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

export function SubNav({
  title,
  description,
  tabs,
  action,
}: {
  title: string;
  description?: string;
  tabs: SubNavTab[];
  action?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-10 bg-surface border-b border-line">
      <div className="px-6 lg:px-8 pt-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-content">{title}</h1>
            {description && (
              <p className="text-label text-muted mt-1 max-w-2xl leading-relaxed">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        <nav className="flex gap-1 overflow-x-auto -mb-px mt-4">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-label whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-brand text-content font-medium"
                    : "border-transparent text-muted hover:text-content"
                )}
              >
                <Icon className={cn("w-4 h-4", active && "text-brand")} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
