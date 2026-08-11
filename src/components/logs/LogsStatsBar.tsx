import type { LucideIcon } from "lucide-react";
import {
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  ListTreeIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LogsStats } from "@/types/log";

const numberFormatter = new Intl.NumberFormat("en-US");

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  icon: Icon,
  tone,
  loading = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: MetricTone;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${metricTone[tone]}`}
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
          <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
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
          label="Total entries"
          value={isLoading ? "" : numberFormatter.format(totalEntries)}
          loading={isLoading}
          icon={ListTreeIcon}
          tone="primary"
        />
        <MetricCell
          label="Successful"
          value={isLoading ? "" : numberFormatter.format(stats.successes)}
          icon={CircleCheckIcon}
          loading={isLoading}
          tone="ok"
        />
        <MetricCell
          label="Errors"
          value={isLoading ? "" : numberFormatter.format(stats.errors)}
          icon={CircleXIcon}
          loading={isLoading}
          tone="error"
        />
        <MetricCell
          label="Avg latency"
          value={
            isLoading
              ? ""
              : stats.averageLatency == null
                ? "—"
                : `${stats.averageLatency}ms`
          }
          icon={Clock3Icon}
          loading={isLoading}
          tone="amber"
        />
      </div>
    </Card>
  );
}
