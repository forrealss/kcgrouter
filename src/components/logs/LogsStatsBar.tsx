import {
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  ListTreeIcon,
} from "lucide-react";
import { StatCard } from "@/components/logs/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import type { LogsStats } from "@/types/log";

const numberFormatter = new Intl.NumberFormat("en-US");

export function LogsStatsBar({
  totalEntries,
  stats,
}: {
  totalEntries: number;
  stats: LogsStats;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardContent className="grid grid-cols-2 gap-px bg-border/60 p-0 sm:grid-cols-4 [&>*]:bg-card">
        <StatCard
          label="Total entries"
          value={numberFormatter.format(totalEntries)}
          icon={ListTreeIcon}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          label="Successful"
          value={numberFormatter.format(stats.successes)}
          icon={CircleCheckIcon}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Error"
          value={numberFormatter.format(stats.errors)}
          icon={CircleXIcon}
          tone="bg-destructive/10 text-destructive"
        />
        <StatCard
          label="Avg latency"
          value={
            stats.averageLatency == null ? "—" : `${stats.averageLatency} ms`
          }
          icon={Clock3Icon}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
      </CardContent>
    </Card>
  );
}
