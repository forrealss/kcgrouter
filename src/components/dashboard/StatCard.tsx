import type { LucideIcon } from "lucide-react";
import { ArrowUpRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatCardTone = "neutral" | "ok" | "warn" | "bad";

const toneClasses: Record<StatCardTone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatCardTone;
  loading?: boolean;
  error?: string | null;
  onClick?: () => void;
}

/**
 * Dashboard summary card. Shell mirrors `ProviderCard`: top-edge gradient,
 * hover border/shadow when clickable, and a `bg-muted/20` footer strip for
 * secondary detail — so dashboard tiles read as the same visual family as
 * the provider grid instead of a separate ad-hoc style.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  loading,
  error,
  onClick,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden border-border/80 py-0 shadow-sm transition-[border-color,box-shadow,background-color] duration-150",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border before:to-transparent",
        onClick &&
          "cursor-pointer hover:border-primary/40 hover:bg-accent/20 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:hover:shadow-[0_0_24px_-18px] dark:hover:shadow-primary",
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${value}` : undefined}
    >
      <CardHeader className="flex min-h-0 flex-row items-start gap-3 px-4 py-3.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border",
            toneClasses[tone],
          )}
          aria-hidden
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </CardTitle>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-16" />
          ) : (
            <p className="mt-0.5 font-mono text-xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          )}
        </div>
        {onClick ? (
          <ArrowUpRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        ) : null}
      </CardHeader>

      {error ? (
        <CardContent className="border-t border-destructive/25 bg-destructive/10 px-4 py-2">
          <p className="truncate text-xs text-destructive">{error}</p>
        </CardContent>
      ) : hint ? (
        <CardContent className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
          {loading ? (
            <Skeleton className="h-3 w-28" />
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card aria-hidden className="gap-0 overflow-hidden border-border/80 py-0">
      <CardHeader className="flex flex-row items-start gap-3 px-4 py-3.5">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1.5 h-7 w-14" />
        </div>
      </CardHeader>
      <CardContent className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}
