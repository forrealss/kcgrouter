import { ArrowUpRightIcon } from "lucide-react";
import { useMemo } from "react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/hooks/useRouter";
import { useTicker } from "@/hooks/useTicker";
import { bucketRecent, compactNumber, numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { UsageSummary } from "@/types/usage";

interface VolumeSpendCardProps {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  /** Timestamps of recent completed requests, used to bucket the sparkline. */
  recentTimestamps: string[];
  accountLabel: (accountId: string) => string;
}

const CHART_BG_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

const BUCKET_COUNT = 12;
const BUCKET_MINUTES = 5;
/** Fixed drawing box; kept 1:1 with the rendered height to avoid distortion. */
const CHART_H = 80;
const CHART_W = 240;
const BAR_GAP = 4;

/**
 * Volume & spend: token/request/cost totals for the summary range, a small
 * activity sparkline bucketed client-side from the recent log window (there's
 * no time-series endpoint), and a token-share breakdown per account. Cost is
 * only presented as a number when at least one combo member has pricing
 * configured — otherwise a stray "$0.0000" would read as real data.
 */
export function VolumeSpendCard({
  summary,
  isLoading,
  error,
  recentTimestamps,
  accountLabel,
}: VolumeSpendCardProps) {
  const { navigate } = useRouter();

  // re-bucket every 30s so bars age out of the window even when idle
  useTicker(recentTimestamps.length > 0, 30_000);

  const totalRequests = useMemo(
    () => summary?.byProvider.reduce((a, p) => a + p.requestCount, 0) ?? 0,
    [summary],
  );
  const hasPricing = useMemo(
    () => (summary?.byProvider ?? []).some((p) => p.cost > 0),
    [summary],
  );

  const buckets = bucketRecent(
    recentTimestamps,
    BUCKET_MINUTES,
    BUCKET_MINUTES * BUCKET_COUNT,
  );
  const maxBucket = Math.max(1, ...buckets);
  const bucketTotal = buckets.reduce((a, b) => a + b, 0);

  const shareRows = useMemo(() => {
    const rows = (summary?.byProvider ?? []).filter(
      (p) => p.inputTokens + p.outputTokens > 0,
    );
    const total = rows.reduce((s, p) => s + p.inputTokens + p.outputTokens, 0);
    return rows
      .map((p) => ({
        ...p,
        tokens: p.inputTokens + p.outputTokens,
        pct: total > 0 ? ((p.inputTokens + p.outputTokens) / total) * 100 : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [summary]);

  const barW = CHART_W / BUCKET_COUNT - BAR_GAP;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Volume &amp; spend</h2>
          <p className="text-xs text-muted-foreground">
            Last 30 days · totals from the usage store
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate("/usage")}
        >
          Usage <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Usage totals unavailable — {error}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Input tokens"
            value={compactNumber(summary?.totalInputTokens ?? 0)}
            sub={numFmt.format(summary?.totalInputTokens ?? 0)}
            loading={isLoading}
          />
          <Stat
            label="Output tokens"
            value={compactNumber(summary?.totalOutputTokens ?? 0)}
            sub={numFmt.format(summary?.totalOutputTokens ?? 0)}
            loading={isLoading}
          />
          <Stat
            label="Requests"
            value={numFmt.format(totalRequests)}
            sub="last 30 days"
            loading={isLoading}
          />
          <Stat
            label="Cost"
            value={
              hasPricing ? `$${(summary?.totalCost ?? 0).toFixed(4)}` : "—"
            }
            sub={hasPricing ? "priced members only" : "no pricing configured"}
            highlight={hasPricing}
            loading={isLoading}
          />
        </div>
      )}

      {/* grows to absorb leftover height so the card matches the column
          beside it instead of leaving a gap underneath */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col justify-end">
        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Requests per 5 min</span>
          <span className="font-mono">
            {bucketTotal > 0
              ? `${numFmt.format(bucketTotal)} in last hour · peak ${numFmt.format(maxBucket)}`
              : "no traffic in the last hour"}
          </span>
        </div>
        {/* fixed viewBox height matched to the rendered height keeps the bar
            corner radius circular instead of stretching into ellipses */}
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="mt-2 w-full"
          height={CHART_H}
          role="img"
          aria-label={`Requests bucketed into ${BUCKET_MINUTES}-minute windows over the last hour. ${numFmt.format(bucketTotal)} total, peak ${numFmt.format(maxBucket)} in a single bucket.`}
        >
          {buckets.map((v, i) => {
            const usable = CHART_H - 8;
            const h = v === 0 ? 2 : Math.max(3, (v / maxBucket) * usable);
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size time buckets, order is the data
                key={i}
                x={i * (CHART_W / BUCKET_COUNT) + BAR_GAP / 2}
                y={CHART_H - 4 - h}
                width={barW}
                height={h}
                rx={2}
                className={
                  v === 0
                    ? "fill-border"
                    : i === buckets.length - 1
                      ? "fill-primary"
                      : "fill-primary/60"
                }
              />
            );
          })}
          <line
            x1={0}
            y1={CHART_H - 3}
            x2={CHART_W}
            y2={CHART_H - 3}
            className="stroke-border"
            strokeWidth={1}
          />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>60m ago</span>
          <span>now</span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs text-muted-foreground">
          Token share by account
        </div>
        {isLoading && shareRows.length === 0 ? (
          <>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          </>
        ) : shareRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No usage recorded yet.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {shareRows.map((row, i) => (
                <div
                  key={row.providerAccountId}
                  className={CHART_BG_COLORS[i % CHART_BG_COLORS.length]}
                  style={{ width: `${row.pct}%` }}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              {shareRows.map((row, i) => (
                <div
                  key={row.providerAccountId}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      CHART_BG_COLORS[i % CHART_BG_COLORS.length],
                    )}
                  />
                  <Truncated
                    text={accountLabel(row.providerAccountId)}
                    className="font-mono"
                  />
                  <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                    {numFmt.format(row.requestCount)} req · {row.pct.toFixed(1)}
                    %
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
  loading,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-1 h-8 w-20" />
          <Skeleton className="mt-1 h-3 w-16" />
        </>
      ) : (
        <>
          <div
            className={cn(
              "mt-0.5 font-mono text-2xl font-semibold",
              highlight && "text-primary",
            )}
          >
            {value}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {sub}
          </div>
        </>
      )}
    </div>
  );
}
