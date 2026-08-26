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
import { Badge } from "@/components/ui/badge";
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
const metricTone = {
  primary: {
    icon: "border-primary/30 bg-primary/10 text-primary",
    value: "glow-primary",
  },
  cyan: {
    icon: "border-chart-3/30 bg-chart-3/10 text-chart-3",
    value: "",
  },
  violet: {
    icon: "border-chart-2/30 bg-chart-2/10 text-chart-2",
    value: "",
  },
  amber: {
    icon: "border-chart-4/30 bg-chart-4/10 text-chart-4",
    value: "",
  },
  ok: {
    icon: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    value: "",
  },
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  icon: Icon,
  loading,
  tone = "primary",
}: {
  label: string;
  value: string;
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
          <p
            className={cn(
              "font-mono text-base font-semibold tracking-tight tabular-nums",
              colors.value,
            )}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <CardHeader className="flex-row items-center gap-2 px-4 pb-3 pt-4 sm:px-5">
      <Icon className="size-4 text-muted-foreground" />
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
    </CardHeader>
  );
}

function RankingRow({
  label,
  value,
  detail,
  percentage,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  percentage: number;
  tone: "primary" | "cyan" | "amber";
}) {
  const barClass = {
    primary: "bg-primary",
    cyan: "bg-chart-3",
    amber: "bg-chart-4",
  }[tone];

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/40 py-2.5 first:pt-0 last:border-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <span className="min-w-0 truncate font-mono text-xs text-foreground/90">
          {label}
        </span>
        <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-foreground/80">
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
  const averageLatency = useMemo(() => {
    if (records.length === 0) return 0;
    return Math.round(
      records.reduce((total, record) => total + record.latencyMs, 0) /
        records.length,
    );
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

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Telemetry / usage
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Usage</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Throughput, latency, and cost per provider.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
            ANALYTICS
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void loadSummary();
              void loadAccounts();
              void loadRecords();
            }}
            disabled={isSummaryLoading || isAccountsLoading || recordsLoading}
            aria-busy={isSummaryLoading || isAccountsLoading || recordsLoading}
          >
            <RefreshCwIcon
              className={cn(
                "size-3.5",
                (isSummaryLoading || isAccountsLoading || recordsLoading) &&
                  "animate-spin",
              )}
            />
            {isSummaryLoading || isAccountsLoading || recordsLoading
              ? "Refreshing"
              : "Refresh"}
          </Button>
        </div>
      </header>

      {summaryError || recordsError || accountsError ? (
        <Alert variant="destructive">
          <GaugeIcon />
          <AlertTitle>Telemetry data is incomplete</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{summaryError ?? recordsError ?? accountsError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadSummary();
                void loadAccounts();
                void loadRecords();
              }}
            >
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
            value={numFmt.format(totalTokens)}
            icon={ZapIcon}
            loading={isSummaryLoading}
            tone="violet"
          />
          <MetricCell
            label="Input tokens"
            value={numFmt.format(summary?.totalInputTokens ?? 0)}
            icon={ArrowDownIcon}
            loading={isSummaryLoading}
            tone="cyan"
          />
          <MetricCell
            label="Output tokens"
            value={numFmt.format(summary?.totalOutputTokens ?? 0)}
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
            value={`${averageLatency}ms`}
            icon={Clock3Icon}
            loading={recordsLoading}
            tone="ok"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="h-fit !py-0 overflow-hidden">
          <SectionHeading icon={ServerIcon} title="Provider throughput" />
          <CardContent className="px-4 pb-4 sm:px-5">
            {isSummaryLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_value, index) => (
                  <Skeleton
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                    key={`provider-${index}`}
                    className="h-10 w-full"
                  />
                ))}
              </div>
            ) : providerRanking.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No provider usage recorded yet.
              </p>
            ) : (
              providerRanking.map((row) => (
                <RankingRow
                  key={row.label}
                  label={row.label}
                  value={numFmt.format(row.tokens)}
                  detail={`${numFmt.format(row.requests)} req · ${costFmt.format(row.cost)}`}
                  percentage={row.percentage}
                  tone="primary"
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-fit !py-0 overflow-hidden">
          <SectionHeading icon={Clock3Icon} title="Model latency" />
          <CardContent className="px-4 pb-4 sm:px-5">
            {recordsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_value, index) => (
                  <Skeleton
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                    key={`latency-${index}`}
                    className="h-10 w-full"
                  />
                ))}
              </div>
            ) : modelRanking.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Latency data appears after the first request.
              </p>
            ) : (
              modelRanking.map((row) => (
                <RankingRow
                  key={row.model}
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
