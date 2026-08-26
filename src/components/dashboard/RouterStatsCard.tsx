import { ArrowUpRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardRetryStats } from "@/hooks/useDashboardActivity";
import { useRouter } from "@/hooks/useRouter";
import { numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";

interface RouterStatsCardProps {
  stats: DashboardRetryStats | null;
  statsError: string | null;
  errorRatePct: number;
  latencyP50: number;
  latencyP95: number;
  /** Completed requests the derived stats were computed from. */
  sampleSize: number;
  isLoading: boolean;
}

/**
 * Router-level behaviour. Retries come from all-time counters in the request
 * log table; error rate and latency percentiles are computed client-side over
 * the completed requests in the fetched window, and the sample size is stated
 * so the numbers aren't mistaken for all-time figures.
 */
export function RouterStatsCard({
  stats,
  statsError,
  errorRatePct,
  latencyP50,
  latencyP95,
  sampleSize,
  isLoading,
}: RouterStatsCardProps) {
  const { navigate } = useRouter();
  const hasSample = sampleSize > 0;

  const rows: Array<{ label: string; value: string; tone?: string }> = [
    {
      label: "Retries",
      value: statsError
        ? "unavailable"
        : `${numFmt.format(stats?.totalRetries ?? 0)} across ${numFmt.format(stats?.retriedRequests ?? 0)} requests`,
      tone: statsError ? "text-muted-foreground" : undefined,
    },
    {
      label: "Cooling down",
      value: statsError
        ? "unavailable"
        : `${stats?.coolingDown ?? 0} account${stats?.coolingDown === 1 ? "" : "s"}`,
      tone: statsError
        ? "text-muted-foreground"
        : (stats?.coolingDown ?? 0) > 0
          ? "text-chart-4"
          : undefined,
    },
    {
      label: "Error rate",
      value: hasSample ? `${errorRatePct.toFixed(1)}%` : "no data",
      tone: !hasSample
        ? "text-muted-foreground"
        : errorRatePct > 10
          ? "text-destructive"
          : undefined,
    },
    {
      label: "Latency p50 / p95",
      value: hasSample
        ? `${numFmt.format(latencyP50)} / ${numFmt.format(latencyP95)} ms`
        : "no data",
      tone: hasSample ? undefined : "text-muted-foreground",
    },
  ];

  return (
    // flex-1 so this card absorbs the leftover height in its column,
    // keeping the column flush with the taller one beside it
    <div className="flex flex-1 flex-col rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Router behaviour</h2>
          <p className="text-xs text-muted-foreground">
            Retries since start ·{" "}
            {hasSample
              ? `latency & error rate over last ${numFmt.format(sampleSize)} completed requests`
              : "no completed requests in the recent log window"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate("/logs")}
        >
          Logs <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>

      {statsError ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Router stats unavailable — {statsError}
        </p>
      ) : null}

      <dl className="mt-4 flex flex-1 flex-col justify-center divide-y divide-border text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            {isLoading && !stats ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <dd className={cn("font-mono font-medium", row.tone)}>
                {row.value}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
