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
import { QuotaCard } from "@/components/quota/QuotaCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

const numberFormatter = new Intl.NumberFormat("en-US");

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  violet: "border-chart-2/30 bg-chart-2/10 text-chart-2",
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
          <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

function QuotaSkeleton() {
  return (
    <Card className="gap-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-40" />
      </div>
    </Card>
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
      const tokenUsage =
        limit && limit > 0 ? account.quotaState.tokensUsed / limit : 0;
      const remoteUsage = usageMap.get(account.id)?.quotas ?? [];
      const remoteAtRisk = remoteUsage.some(
        (quota) =>
          quota.total > 0 &&
          Math.max(0, (quota.total - quota.used) / quota.total) <= 0.2,
      );
      return tokenUsage >= 0.8 || remoteAtRisk;
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 scrollbar-subtle">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Operations / quota
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Quota Tracker
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Token budgets and usage windows per account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isRefreshing
                  ? "animate-pulse bg-amber-400"
                  : "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
              )}
            />
            {isRefreshing ? "SYNCING" : "READY"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshCwIcon
              className={cn("size-3.5", isRefreshing && "animate-spin")}
            />
            {isRefreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
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
            label="Accounts"
            value={numberFormatter.format(accounts?.length ?? 0)}
            icon={ServerIcon}
            loading={isLoading}
            tone="primary"
          />
          <MetricCell
            label="Active"
            value={numberFormatter.format(metrics.active)}
            icon={CheckCircle2Icon}
            loading={isLoading}
            tone="ok"
          />
          <MetricCell
            label="At risk"
            value={numberFormatter.format(metrics.atRisk)}
            icon={AlertTriangleIcon}
            loading={isLoading || isLoadingUsage}
            tone={metrics.atRisk > 0 ? "warn" : "ok"}
          />
          <MetricCell
            label="Tracked"
            value={numberFormatter.format(metrics.tracked)}
            icon={Layers3Icon}
            loading={isLoading || isLoadingUsage}
            tone="violet"
          />
          <MetricCell
            label="Requests"
            value={numberFormatter.format(metrics.requests)}
            icon={ActivityIcon}
            loading={isLoading}
            tone="primary"
          />
        </div>
      </Card>

      {isInitialLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_value, index) => (
            <QuotaSkeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              key={`quota-skeleton-${index}`}
            />
          ))}
        </div>
      ) : null}

      {showEmptyState ? (
        <Empty className="border border-dashed bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No quota accounts configured</EmptyTitle>
            <EmptyDescription>
              Add an account with a token limit or a supported remote quota.
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
        <section
          aria-label="Quota accounts"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {error ? (
            <p className="md:col-span-2 xl:col-span-3 -mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-500">
              Showing last known quota state
            </p>
          ) : null}
          {accounts.map((account) => {
            const usage = usageMap.get(account.id);
            return (
              <QuotaCard
                key={account.id}
                account={account}
                providerQuotas={usage?.quotas}
                plan={usage?.plan}
              />
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
