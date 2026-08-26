import { ArrowUpRightIcon, RefreshCwIcon } from "lucide-react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/hooks/useRouter";
import { compactNumber, numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { ProviderUsageData, QuotaAccount } from "@/types/quota";

interface QuotaTrackerCardProps {
  accounts: QuotaAccount[] | null;
  usageByAccount: Map<string, ProviderUsageData>;
  isLoading: boolean;
  error: string | null;
  /** True while the live upstream fan-out is in flight. */
  isFetchingUpstream: boolean;
  /** Whether upstream quota has been requested at least once this session. */
  hasFetchedUpstream: boolean;
  onFetchUpstream: () => void;
}

/**
 * Upstream quota windows for the transports that report them (kiro,
 * command-code, qoder). `quotaState.tokensUsed` is a lifetime-cumulative
 * router-side counter, labelled as such and distinct from the provider's own
 * reset windows.
 *
 * The live windows come from a sequential fan-out to every upstream provider,
 * which is slow and can partially fail — so it sits behind an explicit action
 * rather than firing on every dashboard visit.
 */
export function QuotaTrackerCard({
  accounts,
  usageByAccount,
  isLoading,
  error,
  isFetchingUpstream,
  hasFetchedUpstream,
  onFetchUpstream,
}: QuotaTrackerCardProps) {
  const { navigate } = useRouter();
  const list = accounts ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Upstream quota</h2>
          <p className="text-xs text-muted-foreground">
            Only kiro, command-code and qoder report quota
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onFetchUpstream}
            disabled={isFetchingUpstream}
            aria-busy={isFetchingUpstream}
          >
            <RefreshCwIcon
              className={cn("size-3.5", isFetchingUpstream && "animate-spin")}
            />
            {isFetchingUpstream
              ? "Fetching…"
              : hasFetchedUpstream
                ? "Refresh"
                : "Fetch live quota"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/quota")}
          >
            Quota tracker <ArrowUpRightIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mx-5 mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Quota state unavailable — {error}
        </p>
      ) : null}

      {isLoading && list.length === 0 ? (
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_v, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={`q-skeleton-${i}`} className="bg-card p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-48" />
              <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No quota-reporting accounts configured.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
          {list.map((account) => {
            const usage = usageByAccount.get(account.id);
            const windows = usage?.quotas ?? [];
            return (
              <div
                key={account.id}
                className="flex min-w-0 flex-col bg-card p-5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Truncated
                    text={account.label}
                    detail={`${account.providerName} · ${account.transport}`}
                    className="font-mono text-sm font-medium"
                  />
                  {usage?.plan ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 font-mono text-[11px]"
                    >
                      {usage.plan}
                    </Badge>
                  ) : null}
                  {!account.available ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      unavailable
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {account.providerName} · {account.transport} ·{" "}
                  {compactNumber(account.quotaState.tokensUsed)} tokens lifetime
                  · {numFmt.format(account.quotaState.requestCount)} req
                </div>
                <div className="mt-4 flex-1 space-y-3">
                  {isFetchingUpstream && windows.length === 0 ? (
                    <>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </>
                  ) : windows.length === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {hasFetchedUpstream
                        ? "No remote quota reported"
                        : "Fetch live quota to see reset windows"}
                    </p>
                  ) : (
                    windows.map((w) => {
                      const pct =
                        w.total > 0
                          ? Math.min(100, (w.used / w.total) * 100)
                          : 0;
                      const tone =
                        pct >= 90
                          ? "bg-destructive"
                          : pct >= 70
                            ? "bg-chart-4"
                            : "bg-chart-1";
                      return (
                        <div key={w.name} className="min-w-0">
                          <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
                            <span className="truncate font-mono">{w.name}</span>
                            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                              {numFmt.format(w.used)} / {numFmt.format(w.total)}
                              {w.resetAt ? ` · resets ${w.resetAt}` : ""}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", tone)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
