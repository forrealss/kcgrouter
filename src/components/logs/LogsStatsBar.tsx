import {
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  ListTreeIcon,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LogsStats } from "@/types/log";

const numberFormatter = new Intl.NumberFormat("en-US");

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  muted: "border-border bg-muted/50 text-muted-foreground",
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  loading = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone: MetricTone;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          metricTone[tone],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-14" />
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-base font-semibold tracking-tight tabular-nums">
              {value}
            </span>
            {hint ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

export function LogsStatsBar({
  totalEntries,
  stats,
  isLoading = false,
}: {
  totalEntries: number;
  stats: LogsStats;
  isLoading?: boolean;
}) {
  return (
    <Card className="!py-0 overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
        <MetricCell
          label="Entries"
          value={numberFormatter.format(totalEntries)}
          hint="retained"
          loading={isLoading}
          icon={ListTreeIcon}
          tone="primary"
        />
        <MetricCell
          label="Successful"
          value={numberFormatter.format(stats.successes)}
          icon={CircleCheckIcon}
          loading={isLoading}
          tone={stats.successes > 0 ? "ok" : "muted"}
        />
        <MetricCell
          label="Errors"
          value={numberFormatter.format(stats.errors)}
          hint={stats.errors > 0 ? "need attention" : "all clear"}
          icon={CircleXIcon}
          loading={isLoading}
          tone={stats.errors > 0 ? "error" : "muted"}
        />
        <MetricCell
          label="Avg latency"
          value={
            stats.averageLatency == null ? "—" : `${stats.averageLatency}ms`
          }
          hint={stats.averageLatency == null ? "no samples" : undefined}
          icon={Clock3Icon}
          loading={isLoading}
          tone="amber"
        />
      </div>
    </Card>
  );
}
