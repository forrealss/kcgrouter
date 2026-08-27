import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Clock3Icon,
  CoinsIcon,
  GaugeIcon,
  RefreshCwIcon,
  ServerIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageTable } from "@/components/usage/UsageTable";
import { useUsage } from "@/hooks/useUsage";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { useSseEvent } from "@/lib/sse-bus";
import { cn } from "@/lib/utils";
import type { UsageRecord } from "@/types/usage";

const numFmt = new Intl.NumberFormat("en-US");
const costFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

/**
 * Compact token counts so the 6-up strip stays readable. Each unit rolls over
 * just below the next one (999.5K, 999.5M) so rounding can never produce a
 * nonsense label like "1000K".
 */
function formatCompact(value: number): string {
  const units = [
    { limit: 999_500_000, divisor: 1_000_000_000, suffix: "B" },
    { limit: 999_500, divisor: 1_000_000, suffix: "M" },
    { limit: 10_000, divisor: 1_000, suffix: "K" },
  ];
  for (const { limit, divisor, suffix } of units) {
    if (value < limit) continue;
    const scaled = value / divisor;
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  }
  return numFmt.format(value);
}

const metricTone = {
  primary: {
    icon: "border-primary/30 bg-primary/10 text-primary",
    value: "glow-primary",
  },
  cyan: { icon: "border-chart-3/30 bg-chart-3/10 text-chart-3", value: "" },
  violet: { icon: "border-chart-2/30 bg-chart-2/10 text-chart-2", value: "" },
  amber: { icon: "border-chart-4/30 bg-chart-4/10 text-chart-4", value: "" },
  ok: {
    icon: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    value: "",
  },
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  tone?: MetricTone;
}) {
  const colors = metricTone[tone];

  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          colors.icon,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-20" />
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-mono text-base font-semibold tracking-tight tabular-nums",
                colors.value,
              )}
            >
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

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  hint?: string;
}) {
  return (
    <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <CardTitle className="truncate text-sm font-medium">{title}</CardTitle>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {hint ? (
        <span className="shrink-0 rounded border border-border/60 bg-card px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </CardHeader>
  );
}

function RankingRow({
  rank,
  label,
  value,
  detail,
  percentage,
  tone,
}: {
  rank: number;
  label: string;
  value: string;
  detail: string;
  percentage: number;
  tone: "primary" | "cyan";
}) {
  const barClass = tone === "primary" ? "bg-primary" : "bg-chart-3";

  return (
    <div className="flex items-center gap-3 border-b border-border/40 py-2.5 first:pt-0 last:border-0 last:pb-0">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] tabular-nums text-muted-foreground"
        aria-hidden
      >
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <span
            className="min-w-0 truncate font-mono text-xs text-foreground/90"
            title={label}
          >
            {label}
          </span>
          <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
            {value}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              barClass,
            )}
            style={{
              width: `${Math.max(percentage, percentage > 0 ? 2 : 0)}%`,
            }}
          />
        </div>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {detail}
        </span>
      </div>
    </div>
  );
}

function RankingEmpty({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2.5 py-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1">
      {["a", "b", "c"].map((key) => (
        <div key={key} className="flex items-center gap-3">
          <Skeleton className="size-5 shrink-0 rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-2 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsagePage() {
  const {
    summary,
    summaryError,
    isSummaryLoading,
    accounts,
    accountsError,
    isAccountsLoading,
    accountLabels,
    loadSummary,
    loadAccounts,
  } = useUsage();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const data = await apiClient.get<UsageRecord[]>(
        "/api/usage/history?limit=50",
      );
      setRecords(data);
    } catch (error) {
      setRecordsError(getApiErrorMessage(error));
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const onRequestComplete = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as {
        providerAccountId: string;
        comboId: string | null;
        model: string;
        latencyMs: number;
        timestamp: number;
      };
      const realtimeRecord: UsageRecord = {
        id: `rt-${data.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(data.timestamp).toISOString(),
        providerAccountId: data.providerAccountId,
        comboId: data.comboId,
        model: data.model,
        inputTokens: 0,
        outputTokens: 0,
        status: "success",
        latencyMs: data.latencyMs,
        estimatedCost: 0,
      };
      setRecords((current) => [realtimeRecord, ...current].slice(0, 50));
    } catch {
      // Ignore malformed realtime events.
    }
  }, []);

  useSseEvent("request:complete", onRequestComplete);

  const isRefreshing = isSummaryLoading || isAccountsLoading || recordsLoading;

  function refreshAll() {
    void loadSummary();
    void loadAccounts();
    void loadRecords();
  }

  const totalRequests = useMemo(
    () =>
      summary?.byProvider.reduce(
        (total, provider) => total + provider.requestCount,
        0,
      ) ?? 0,
    [summary],
  );
  const totalTokens =
    (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0);

  /**
   * Latency is derived from the loaded history page, not the summary endpoint —
   * so it describes the recent sample rather than the whole 30-day window.
   */
  const latency = useMemo(() => {
    const timed = records.filter((record) => record.latencyMs > 0);
    if (timed.length === 0) return { average: 0, sampleSize: 0 };
    const total = timed.reduce((sum, record) => sum + record.latencyMs, 0);
    return {
      average: Math.round(total / timed.length),
      sampleSize: timed.length,
    };
  }, [records]);

  const providerRanking = useMemo(() => {
    const rows = (summary?.byProvider ?? [])
      .map((provider) => ({
        label:
          accountLabels.get(provider.providerAccountId) ??
          provider.providerAccountId,
        tokens: provider.inputTokens + provider.outputTokens,
        requests: provider.requestCount,
        cost: provider.cost,
      }))
      .sort((left, right) => right.tokens - left.tokens);
    const maxTokens = Math.max(...rows.map((row) => row.tokens), 1);
    return rows.slice(0, 6).map((row) => ({
      ...row,
      percentage: Math.round((row.tokens / maxTokens) * 100),
    }));
  }, [accountLabels, summary]);

  const modelRanking = useMemo(() => {
    const modelMap = new Map<string, { total: number; count: number }>();
    for (const record of records) {
      if (record.latencyMs <= 0) continue;
      const current = modelMap.get(record.model) ?? { total: 0, count: 0 };
      current.total += record.latencyMs;
      current.count += 1;
      modelMap.set(record.model, current);
    }
    const rows = [...modelMap.entries()]
      .map(([model, data]) => ({
        model,
        latency: Math.round(data.total / data.count),
        count: data.count,
      }))
      .sort((left, right) => left.latency - right.latency)
      .slice(0, 6);
    const maxLatency = Math.max(...rows.map((row) => row.latency), 1);
    return rows.map((row) => ({
      ...row,
      percentage: Math.round((row.latency / maxLatency) * 100),
    }));
  }, [records]);

  const loadError = summaryError ?? recordsError ?? accountsError;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Throughput, latency, and cost over the last 30 days.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={refreshAll}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
          className="w-fit"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={cn(isRefreshing && "animate-spin")}
          />
          {isRefreshing ? "Refreshing" : "Refresh"}
        </Button>
      </header>

      {loadError ? (
        <Alert variant="destructive">
          <GaugeIcon />
          <AlertTitle>Telemetry data is incomplete</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={refreshAll}>
              Retry all
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-6 [&>*]:bg-card">
          <MetricCell
            label="Requests"
            value={numFmt.format(totalRequests)}
            icon={ActivityIcon}
            loading={isSummaryLoading}
            tone="primary"
          />
          <MetricCell
            label="Total tokens"
            value={formatCompact(totalTokens)}
            icon={ZapIcon}
            loading={isSummaryLoading}
            tone="violet"
          />
          <MetricCell
            label="Input"
            value={formatCompact(summary?.totalInputTokens ?? 0)}
            icon={ArrowDownIcon}
            loading={isSummaryLoading}
            tone="cyan"
          />
          <MetricCell
            label="Output"
            value={formatCompact(summary?.totalOutputTokens ?? 0)}
            icon={ArrowUpIcon}
            loading={isSummaryLoading}
            tone="violet"
          />
          <MetricCell
            label="Est. cost"
            value={costFmt.format(summary?.totalCost ?? 0)}
            icon={CoinsIcon}
            loading={isSummaryLoading}
            tone="amber"
          />
          <MetricCell
            label="Avg latency"
            value={latency.sampleSize > 0 ? `${latency.average}ms` : "—"}
            hint={
              latency.sampleSize > 0 ? `n=${latency.sampleSize}` : "no samples"
            }
            icon={Clock3Icon}
            loading={recordsLoading}
            tone="ok"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="h-fit gap-0 !py-0 overflow-hidden">
          <SectionHeading
            icon={ServerIcon}
            title="Provider throughput"
            subtitle="Busiest connections by token volume"
            hint="30d"
          />
          <CardContent className="px-4 py-3 sm:px-5">
            {isSummaryLoading ? (
              <RankingSkeleton />
            ) : providerRanking.length === 0 ? (
              <RankingEmpty
                icon={ServerIcon}
                message="No provider usage in this window yet."
              />
            ) : (
              providerRanking.map((row, index) => (
                <RankingRow
                  key={row.label}
                  rank={index + 1}
                  label={row.label}
                  value={formatCompact(row.tokens)}
                  detail={`${numFmt.format(row.requests)} req · ${costFmt.format(row.cost)}`}
                  percentage={row.percentage}
                  tone="primary"
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-fit gap-0 !py-0 overflow-hidden">
          <SectionHeading
            icon={Clock3Icon}
            title="Model latency"
            subtitle="Average response time, fastest first"
            hint={`n=${records.length}`}
          />
          <CardContent className="px-4 py-3 sm:px-5">
            {recordsLoading ? (
              <RankingSkeleton />
            ) : modelRanking.length === 0 ? (
              <RankingEmpty
                icon={Clock3Icon}
                message="Latency appears once requests are recorded."
              />
            ) : (
              modelRanking.map((row, index) => (
                <RankingRow
                  key={row.model}
                  rank={index + 1}
                  label={row.model}
                  value={`${row.latency}ms`}
                  detail={`${numFmt.format(row.count)} sample${row.count === 1 ? "" : "s"}`}
                  percentage={row.percentage}
                  tone="cyan"
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <UsageTable
        accounts={accounts}
        accountsLoading={isAccountsLoading}
        accountsError={accountsError}
        onRetryAccounts={() => void loadAccounts()}
      />
    </div>
  );
}
