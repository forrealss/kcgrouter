import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  GaugeIcon,
  Layers3Icon,
  RefreshCwIcon,
  ServerIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { QuotaCard, QuotaCardSkeleton } from "@/components/quota/QuotaCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useQuota } from "@/hooks/useQuota";
import { cn } from "@/lib/utils";
import type { ProviderQuotaItem } from "@/types/quota";

const numberFormatter = new Intl.NumberFormat("en-US");

/** Headroom below this fraction counts as "at risk" on the metric strip. */
const AT_RISK_THRESHOLD = 0.2;

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  chart2: "border-chart-2/30 bg-chart-2/10 text-chart-2",
} as const;

type MetricTone = keyof typeof metricTone;

/**
 * Whether a quota row is close to running out. Only `window` rows have a cap to
 * measure headroom against; a `balance` row is at risk once it hits zero.
 */
function isQuotaAtRisk(quota: ProviderQuotaItem): boolean {
  if ((quota.kind ?? "window") === "balance") return quota.total <= 0;
  if (quota.total <= 0) return false;
  const remaining = Math.max(0, quota.total - quota.used);
  return remaining / quota.total <= AT_RISK_THRESHOLD;
}

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
  icon: typeof GaugeIcon;
  loading?: boolean;
  tone?: MetricTone;
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
          <Skeleton className="mt-1 h-5 w-16" />
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

export function QuotaPage() {
  const {
    accounts,
    providerUsage,
    error,
    isLoading,
    isLoadingUsage,
    loadQuota,
    loadProviderUsage,
  } = useQuota();

  useEffect(() => {
    void loadProviderUsage();
  }, [loadProviderUsage]);

  const usageMap = useMemo(
    () =>
      new Map((providerUsage ?? []).map((usage) => [usage.accountId, usage])),
    [providerUsage],
  );

  const metrics = useMemo(() => {
    const list = accounts ?? [];
    const active = list.filter((account) => account.status === "active").length;
    const atRisk = list.filter((account) => {
      const limit = account.quotaLimitTokens;
      const budgetAtRisk =
        limit !== null && limit > 0
          ? account.quotaState.tokensUsed / limit >= 1 - AT_RISK_THRESHOLD
          : false;
      const remoteAtRisk = (usageMap.get(account.id)?.quotas ?? []).some(
        isQuotaAtRisk,
      );
      return budgetAtRisk || remoteAtRisk;
    }).length;
    const tracked = list.filter(
      (account) =>
        account.quotaLimitTokens !== null ||
        (usageMap.get(account.id)?.quotas.length ?? 0) > 0,
    ).length;
    const requests = list.reduce(
      (total, account) => total + account.quotaState.requestCount,
      0,
    );

    return { active, atRisk, tracked, requests };
  }, [accounts, usageMap]);

  const isInitialLoading = isLoading && accounts === null;
  const showEmptyState = !isLoading && !error && accounts?.length === 0;
  const showGrid = accounts !== null && accounts.length > 0;
  const isRefreshing = isLoading || isLoadingUsage;

  const refreshAll = () => {
    void loadQuota();
    void loadProviderUsage();
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Remaining quota for providers that report it, plus the router's own
          token budget.
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

      {error ? (
        <Alert variant="destructive">
          <GaugeIcon />
          <AlertTitle>Quota state is unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQuota()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Retry state
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-card">
          <MetricCell
            label="Connections"
            value={numberFormatter.format(accounts?.length ?? 0)}
            hint="tracked"
            icon={ServerIcon}
            loading={isInitialLoading}
            tone="primary"
          />
          <MetricCell
            label="Active"
            value={numberFormatter.format(metrics.active)}
            icon={CheckCircle2Icon}
            loading={isInitialLoading}
            tone="ok"
          />
          <MetricCell
            label="At risk"
            value={numberFormatter.format(metrics.atRisk)}
            hint={metrics.atRisk > 0 ? "under 20% left" : "all clear"}
            icon={AlertTriangleIcon}
            loading={isInitialLoading || isLoadingUsage}
            tone={metrics.atRisk > 0 ? "warn" : "ok"}
          />
          <MetricCell
            label="Reporting"
            value={numberFormatter.format(metrics.tracked)}
            hint="with quota data"
            icon={Layers3Icon}
            loading={isInitialLoading || isLoadingUsage}
            tone="chart2"
          />
          <MetricCell
            label="Requests"
            value={numberFormatter.format(metrics.requests)}
            icon={ActivityIcon}
            loading={isInitialLoading}
            tone="primary"
          />
        </div>
      </Card>

      {isInitialLoading ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading quota"
        >
          <QuotaCardSkeleton />
          <QuotaCardSkeleton />
          <QuotaCardSkeleton />
        </div>
      ) : null}

      {showEmptyState ? (
        <Empty className="min-h-72 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No quota-reporting connections</EmptyTitle>
            <EmptyDescription>
              Only Kiro, Command Code, and Qoder report remaining quota. Add a
              connection for one of them, or set a token cap on any connection.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={refreshAll}>
              <RefreshCwIcon data-icon="inline-start" />
              Refresh quota
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {showGrid ? (
        <section aria-label="Quota accounts" className="flex flex-col gap-3">
          {error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
              Showing last known quota state
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const usage = usageMap.get(account.id);
              return (
                <QuotaCard
                  key={account.id}
                  account={account}
                  providerQuotas={usage?.quotas}
                  plan={usage?.plan}
                  isLoadingRemote={isLoadingUsage && providerUsage === null}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
