import {
  ActivityIcon,
  Clock3Icon,
  CoinsIcon,
  GaugeIcon,
  TimerResetIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { ProviderQuotaItem, QuotaAccount } from "@/types/quota";

interface QuotaCardProps {
  account: QuotaAccount;
  providerQuotas?: ProviderQuotaItem[];
  plan?: string;
  /** Remote quota fetch still in flight for this account. */
  isLoadingRemote?: boolean;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusMeta: Record<
  QuotaAccount["status"],
  { label: string; dot: string; text: string }
> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "Failing",
    dot: "bg-destructive shadow-[0_0_6px] shadow-destructive/70",
    text: "text-destructive",
  },
  expired: {
    label: "Expired",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

function formatTokens(tokens: number): string {
  return numberFormatter.format(tokens);
}

/** Quota amounts can be fractional credits, so avoid forcing 2 decimals. */
function formatAmount(value: number): string {
  return Number.isInteger(value)
    ? numberFormatter.format(value)
    : decimalFormatter.format(value);
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never used";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : dateFormatter.format(date);
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "resets soon";

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Colour by headroom left: plenty → emerald, tight → amber, gone → red. */
function remainingTone(percentage: number): { text: string; bar: string } {
  if (percentage > 50) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bar: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
    };
  }
  if (percentage > 20) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bar: "[&_[data-slot=progress-indicator]]:bg-amber-500",
    };
  }
  return {
    text: "text-destructive",
    bar: "[&_[data-slot=progress-indicator]]:bg-destructive",
  };
}

/** Live countdown to `resetAt`, or null when the row never resets. */
function useResetCountdown(resetAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resetAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [resetAt]);

  if (!resetAt) return null;
  const target = new Date(resetAt).getTime();
  return Number.isNaN(target) ? null : target - now;
}

/**
 * A quota row with a real cap: shows how much headroom is left, with a bar.
 */
function QuotaWindowRow({ quota }: { quota: ProviderQuotaItem }) {
  const resetMs = useResetCountdown(quota.resetAt);
  const remaining = Math.max(0, quota.total - quota.used);
  const remainingPercentage = Math.round((remaining / quota.total) * 100);
  const usedPercentage = Math.min(100, Math.max(0, 100 - remainingPercentage));
  const tone = remainingTone(remainingPercentage);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="min-w-0 truncate text-xs font-medium"
          title={quota.name}
        >
          {quota.name}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-xs font-semibold tabular-nums",
            tone.text,
          )}
        >
          {remainingPercentage}%
          <span className="ml-1 font-normal text-muted-foreground">left</span>
        </span>
      </div>
      <Progress
        value={usedPercentage}
        aria-label={`${quota.name}: ${formatAmount(quota.used)} of ${formatAmount(quota.total)} used`}
        className={cn("h-1.5", tone.bar)}
      />
      <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>
          {formatAmount(quota.used)} / {formatAmount(quota.total)} used
        </span>
        {resetMs !== null ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <TimerResetIcon className="size-3" aria-hidden />
            {formatCountdown(resetMs)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A quota row with no cap (a credit balance). There is nothing to fill, so the
 * amount on hand is shown as a figure — deliberately no progress bar.
 */
function QuotaBalanceRow({ quota }: { quota: ProviderQuotaItem }) {
  const resetMs = useResetCountdown(quota.resetAt);
  const isEmpty = quota.total <= 0;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground"
        aria-hidden
      >
        <WalletIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={quota.name}>
          {quota.name}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          balance remaining
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            isEmpty ? "text-destructive" : "text-foreground",
          )}
        >
          {formatAmount(quota.total)}
        </p>
        {resetMs !== null ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            {formatCountdown(resetMs)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function QuotaRow({ quota }: { quota: ProviderQuotaItem }) {
  // A window with no usable cap carries no headroom information, so it falls
  // back to the balance presentation instead of rendering an empty bar.
  const isWindow = (quota.kind ?? "window") === "window" && quota.total > 0;
  return isWindow ? (
    <QuotaWindowRow quota={quota} />
  ) : (
    <QuotaBalanceRow quota={quota} />
  );
}

function SectionLabel({
  icon: Icon,
  children,
  aside,
}: {
  icon: typeof GaugeIcon;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
      {aside ? <span className="ml-auto shrink-0">{aside}</span> : null}
    </div>
  );
}

export function QuotaCard({
  account,
  providerQuotas,
  plan,
  isLoadingRemote = false,
}: QuotaCardProps) {
  const { quotaState } = account;
  const quotaLimitTokens = account.quotaLimitTokens;
  const provider = transportMeta[account.transport];
  const status = statusMeta[account.status];
  const hasRemoteQuotas = Boolean(providerQuotas?.length);

  const usedPercentage =
    quotaLimitTokens && quotaLimitTokens > 0
      ? Math.min(
          100,
          Math.max(0, (quotaState.tokensUsed / quotaLimitTokens) * 100),
        )
      : null;
  const budgetTone =
    usedPercentage === null
      ? null
      : remainingTone(Math.round(100 - usedPercentage));

  return (
    <Card className="flex flex-col gap-0 overflow-hidden border-border/80 py-0">
      <div className="flex min-w-0 items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            provider.accentClassName,
          )}
          aria-hidden
        >
          {provider.icon ? (
            <img src={provider.icon} alt="" className="size-4.5" />
          ) : (
            <provider.fallbackIcon className="size-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={account.label}>
            {account.label}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{account.providerName}</span>
            {plan ? (
              <>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span className="truncate font-mono text-[11px]">{plan}</span>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium",
            status.text,
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", status.dot)}
            aria-hidden
          />
          {status.label}
        </span>
      </div>

      <CardContent className="flex flex-1 flex-col gap-4 px-4 py-4">
        <section className="flex flex-col gap-2.5" aria-label="Provider quota">
          <SectionLabel
            icon={GaugeIcon}
            aside={
              hasRemoteQuotas ? (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {providerQuotas?.length}
                </span>
              ) : null
            }
          >
            Provider quota
          </SectionLabel>

          {isLoadingRemote && !hasRemoteQuotas ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-2.5 w-32" />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-1.5 w-full" />
              </div>
            </div>
          ) : hasRemoteQuotas ? (
            <div className="flex flex-col gap-3">
              {providerQuotas?.map((quota) => (
                <QuotaRow key={quota.name} quota={quota} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
              {account.status === "active"
                ? "This provider returned no quota data."
                : "Quota is only fetched for active connections."}
            </p>
          )}
        </section>

        <section
          className="flex flex-col gap-2 border-t border-border/50 pt-3.5"
          aria-label="Router token budget"
        >
          <SectionLabel
            icon={CoinsIcon}
            aside={
              quotaLimitTokens === null ? (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal text-muted-foreground"
                >
                  No cap
                </Badge>
              ) : (
                <span
                  className={cn(
                    "font-mono text-[11px] font-semibold tabular-nums",
                    budgetTone?.text,
                  )}
                >
                  {Math.round(usedPercentage ?? 0)}% used
                </span>
              )
            }
          >
            Router budget
          </SectionLabel>

          {quotaLimitTokens === null ? (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatTokens(quotaState.tokensUsed)} tokens used
            </p>
          ) : (
            <>
              <Progress
                value={usedPercentage ?? 0}
                aria-label={`${formatTokens(quotaState.tokensUsed)} of ${formatTokens(quotaLimitTokens)} tokens used`}
                className={cn("h-1.5", budgetTone?.bar)}
              />
              <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatTokens(quotaState.tokensUsed)} /{" "}
                {formatTokens(quotaLimitTokens)} tokens
              </p>
            </>
          )}
        </section>
      </CardContent>

      <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60">
        <div className="flex items-center gap-2 bg-card px-4 py-2.5">
          <ActivityIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Requests
            </p>
            <p className="font-mono text-xs font-medium tabular-nums">
              {formatTokens(quotaState.requestCount)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2.5">
          <Clock3Icon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Last used
            </p>
            <p
              className="truncate font-mono text-xs font-medium"
              title={formatTimestamp(account.lastUsedAt)}
            >
              {formatTimestamp(account.lastUsedAt)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function QuotaCardSkeleton() {
  return (
    <Card
      aria-hidden
      className="flex flex-col gap-0 overflow-hidden border-border/80 py-0"
    >
      <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-36" />
        </div>
        <Skeleton className="h-3 w-14" />
      </div>
      <CardContent className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-2.5 w-24" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </CardContent>
      <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60">
        {["requests", "last-used"].map((key) => (
          <div
            key={key}
            className="flex items-center gap-2 bg-card px-4 py-2.5"
          >
            <Skeleton className="size-3.5 rounded" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-2 w-14" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
