import { ArrowUpRightIcon, TrendingUpIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/dashboard/DateRangePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/hooks/useRouter";
import { compactNumber, numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { UsageBucket } from "@/types/usage";

type Metric = "requests" | "tokens" | "cost";

const METRIC_META: Record<
  Metric,
  { label: string; format: (n: number) => string; configLabel: string }
> = {
  requests: {
    label: "Requests",
    format: (n) => numFmt.format(n),
    configLabel: "Requests",
  },
  tokens: {
    label: "Tokens",
    format: compactNumber,
    configLabel: "Tokens",
  },
  cost: {
    label: "Cost",
    format: (n) => `$${n.toFixed(4)}`,
    configLabel: "Est. cost",
  },
};

const chartConfig: ChartConfig = {
  value: {
    label: "Value",
    color: "var(--color-chart-1)",
  },
};

/** `YYYY-MM-DD` in local time, matching the server's day-bucket format. */
function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const dayLabelFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

/**
 * Fill every day between `from` and `to` with zero, then overlay the buckets
 * the server returned. The server omits days with no requests entirely —
 * rendering that gap as a line segment would read as a dip in real data
 * instead of "nothing happened".
 */
function toChartData(
  buckets: UsageBucket[],
  range: DateRangeValue,
  metric: Metric,
): { day: string; label: string; value: number }[] {
  const byDay = new Map(buckets.map((b) => [b.bucket, b]));
  const result: { day: string; label: string; value: number }[] = [];

  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setHours(0, 0, 0, 0);

  // Cap iteration so a malformed range can't spin the loop forever.
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    const key = toDayKey(cursor);
    const bucket = byDay.get(key);
    const value = bucket
      ? metric === "requests"
        ? bucket.requests
        : metric === "cost"
          ? bucket.cost
          : bucket.inputTokens + bucket.outputTokens
      : 0;
    result.push({ day: key, label: dayLabelFmt.format(cursor), value });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return result;
}

interface UsageTrendCardProps {
  buckets: UsageBucket[];
  isLoading: boolean;
  error: string | null;
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
}

/**
 * Full-width usage trend chart. Metric is switchable (Requests / Tokens /
 * Cost) rather than plotted together — token counts and request counts
 * differ by orders of magnitude, so a shared axis would flatten one of them.
 */
export function UsageTrendCard({
  buckets,
  isLoading,
  error,
  range,
  onRangeChange,
}: UsageTrendCardProps) {
  const { navigate } = useRouter();
  const [metric, setMetric] = useState<Metric>("requests");

  const data = useMemo(
    () => toChartData(buckets, range, metric),
    [buckets, range, metric],
  );
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const meta = METRIC_META[metric];

  return (
    <Card className="gap-0 overflow-hidden border-border/80 py-0 shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <TrendingUpIcon className="size-4" />
          </span>
          <div>
            <CardTitle className="text-sm font-medium">Usage trend</CardTitle>
            <p className="text-xs text-muted-foreground">
              {meta.label} per day · {isLoading ? "…" : meta.format(total)}{" "}
              total
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              <TabsTrigger value="requests">Requests</TabsTrigger>
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
              <TabsTrigger value="cost">Cost</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateRangePicker value={range} onChange={onRangeChange} />
          <button
            type="button"
            onClick={() => navigate("/usage")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Usage <ArrowUpRightIcon className="size-3" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-4 sm:px-5">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Trend data unavailable — {error}
          </p>
        ) : isLoading && data.length === 0 ? (
          <Skeleton className="h-[220px] w-full" />
        ) : data.every((d) => d.value === 0) ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No usage recorded in this range.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className={cn("aspect-auto h-[220px] w-full")}
          >
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="usageTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-chart-1)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-chart-1)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => meta.format(Number(value))}
                  />
                }
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-chart-1)"
                fill="url(#usageTrendFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
