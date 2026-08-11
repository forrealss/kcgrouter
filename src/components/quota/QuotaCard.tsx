import { ActivityIcon, Clock3Icon, GaugeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { ProviderQuotaItem, QuotaAccount } from "@/types/quota";

interface QuotaCardProps {
  account: QuotaAccount;
  providerQuotas?: ProviderQuotaItem[];
  plan?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusMeta: Record<
  QuotaAccount["status"],
  { label: string; dot: string }
> = {
  active: {
    label: "ACTIVE",
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
  },
  error: {
    label: "ERROR",
    dot: "bg-destructive shadow-[0_0_6px] shadow-destructive/70",
  },
  expired: {
    label: "EXPIRED",
    dot: "bg-muted-foreground/50",
  },
};

function formatTokens(tokens: number): string {
  return numberFormatter.format(tokens);
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never used";

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : dateFormatter.format(date);
}

function getProgressValue(
  tokensUsed: number,
  quotaLimitTokens: number,
): number {
  if (quotaLimitTokens <= 0) return tokensUsed > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (tokensUsed / quotaLimitTokens) * 100));
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Reset soon";

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getRemainingTone(
  percentage: number,
  isAvailable = true,
): {
  text: string;
  bar: string;
} {
  if (!isAvailable) {
    return {
      text: "text-muted-foreground",
      bar: "[&_[data-slot=progress-indicator]]:bg-muted-foreground/40",
    };
  }
  if (percentage > 70) {
    return {
      text: "text-emerald-500",
      bar: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
    };
  }
  if (percentage >= 30) {
    return {
      text: "text-amber-500",
      bar: "[&_[data-slot=progress-indicator]]:bg-amber-500",
    };
  }
  return {
    text: "text-destructive",
    bar: "[&_[data-slot=progress-indicator]]:bg-destructive",
  };
}

function ProviderQuotaBar({ quota }: { quota: ProviderQuotaItem }) {
  const [now, setNow] = useState(() => Date.now());
  const isCredit = quota.name === "credit";
  const hasCapacity = quota.total > 0;
  const remaining = Math.max(0, quota.total - quota.used);
  const remainingPercentage = hasCapacity
    ? Math.round((remaining / quota.total) * 100)
    : 0;
  const usedPercentage = hasCapacity
    ? Math.min(100, Math.max(0, 100 - remainingPercentage))
    : 0;
  const tone = getRemainingTone(remainingPercentage, hasCapacity);

  useEffect(() => {
    if (!quota.resetAt) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [quota.resetAt]);

  const resetMs = quota.resetAt
    ? new Date(quota.resetAt).getTime() - now
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-xs text-foreground/90">
          {quota.name}
        </span>
        {isCredit ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {remaining.toFixed(2)} / {quota.total.toFixed(2)}
          </span>
        ) : (
          <span
            className={cn("shrink-0 font-mono text-xs tabular-nums", tone.text)}
          >
            {remainingPercentage}% left
          </span>
        )}
      </div>
      <Progress
        value={usedPercentage}
        aria-label={`${quota.used} of ${quota.total} used`}
        className={cn("h-1.5", tone.bar)}
      />
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground">
        <span
          className={cn(
            !hasCapacity
              ? "text-muted-foreground"
              : remaining > 0
                ? "text-emerald-500"
                : "text-destructive",
          )}
        >
          {!hasCapacity
            ? "UNAVAILABLE"
            : remaining > 0
              ? "AVAILABLE"
              : "DEPLETED"}
        </span>
        <span className="tabular-nums">
          {!hasCapacity
            ? "capacity unknown"
            : isCredit
              ? `${quota.used.toFixed(2)} used`
              : `${quota.used.toLocaleString()} / ${quota.total.toLocaleString()}`}
        </span>
        {resetMs !== null ? (
          <span className="shrink-0">
            {resetMs > 0 ? `reset ${formatCountdown(resetMs)}` : "reset soon"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: QuotaAccount["status"] }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export function QuotaCard({ account, providerQuotas, plan }: QuotaCardProps) {
  const { quotaState } = account;
  const quotaLimitTokens = account.quotaLimitTokens;
  const progressValue =
    quotaLimitTokens === null
      ? null
      : getProgressValue(quotaState.tokensUsed, quotaLimitTokens);
  const provider = transportMeta[account.transport];
  const hasProviderQuotas = Boolean(providerQuotas?.length);
  const isNearLimit =
    progressValue !== null && progressValue >= 80 && progressValue < 100;
  const isOverLimit = progressValue !== null && progressValue >= 100;

  return (
    <Card className="gap-5 overflow-hidden border-l-2 border-l-primary/50 transition-colors duration-200 hover:bg-accent/20">
      <CardHeader className="px-5 pb-0">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md border",
              provider.accentClassName,
            )}
          >
            {provider.icon ? (
              <img src={provider.icon} alt="" className="size-4" />
            ) : (
              <provider.fallbackIcon className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-medium">
              {account.label}
            </CardTitle>
            <CardDescription className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs">
              <span className="truncate">{account.providerName}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-mono uppercase text-[10px]">
                {account.transport}
              </span>
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-2">
          <StatusIndicator status={account.status} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 px-5">
        {plan ? (
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Provider plan
            </span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {plan.toUpperCase()}
            </Badge>
          </div>
        ) : null}

        {hasProviderQuotas ? (
          <section className="flex flex-col gap-3" aria-label="Provider quotas">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <GaugeIcon className="size-3.5" />
                Remote quota
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {providerQuotas.length} window
                {providerQuotas.length === 1 ? "" : "s"}
              </span>
            </div>
            {providerQuotas?.map((quota) => (
              <ProviderQuotaBar key={quota.name} quota={quota} />
            ))}
          </section>
        ) : null}

        <section
          className="flex flex-col gap-2"
          aria-label="Internal token quota"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <GaugeIcon className="size-3.5" />
              Router token budget
            </span>
            {quotaLimitTokens === null ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                UNLIMITED
              </Badge>
            ) : (
              <span
                className={cn(
                  "font-mono text-xs font-medium tabular-nums",
                  isOverLimit
                    ? "text-destructive"
                    : isNearLimit
                      ? "text-amber-500"
                      : "text-foreground/80",
                )}
              >
                {Math.round(progressValue ?? 0)}% used
              </span>
            )}
          </div>
          {quotaLimitTokens === null ? (
            <p className="font-mono text-xs text-muted-foreground">
              {formatTokens(quotaState.tokensUsed)} tokens used
            </p>
          ) : (
            <>
              <Progress
                value={progressValue ?? 0}
                aria-label={`${formatTokens(quotaState.tokensUsed)} of ${formatTokens(quotaLimitTokens)} tokens used`}
                className={cn(
                  "h-1.5",
                  isOverLimit
                    ? "[&_[data-slot=progress-indicator]]:bg-destructive"
                    : isNearLimit
                      ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
                      : "[&_[data-slot=progress-indicator]]:bg-primary",
                )}
              />
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground">
                <span className="tabular-nums">
                  {formatTokens(quotaState.tokensUsed)} used
                </span>
                <span className="tabular-nums">
                  limit {formatTokens(quotaLimitTokens)}
                </span>
              </div>
            </>
          )}
        </section>

        <dl className="grid grid-cols-2 gap-3 border-t border-border/50 pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <ActivityIcon className="size-3" /> Requests
            </dt>
            <dd className="font-mono text-sm font-medium tabular-nums">
              {formatTokens(quotaState.requestCount)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <Clock3Icon className="size-3" /> Last used
            </dt>
            <dd
              className="truncate font-mono text-[11px] font-medium"
              title={formatTimestamp(account.lastUsedAt)}
            >
              {formatTimestamp(account.lastUsedAt)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
