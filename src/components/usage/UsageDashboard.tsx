/**
 * UsageDashboard - premium SaaS analytics dashboard
 *
 * Layout:
 * - Header: time filter
 * - Stats cards row (requests, tokens, cost, etc.)
 * - Main: graph canvas (left) + recent activity (right)
 * - Analytics: Tokens/Cost bar charts
 * - Provider breakdown table
 */

import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  CoinsIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsageGraph } from "@/components/usage/UsageGraph";
import { useUsage } from "@/hooks/useUsage";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { UsageRecord } from "@/types/usage";

// ─── formatters ──────────────────────────────────────────────────────────────
const numFmt = new Intl.NumberFormat("en-US");
const costFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const timeAgoFmt = (ts: string) => {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

// ─── stat card data ──────────────────────────────────────────────────────────
function useStatCards(summary: ReturnType<typeof useUsage>["summary"]) {
  return useMemo(() => {
    if (!summary) return [];
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    const totalReqs = summary.byProvider.reduce(
      (a, p) => a + p.requestCount,
      0,
    );
    return [
      {
        label: "Total Requests",
        value: numFmt.format(totalReqs),
        icon: ActivityIcon,
        description: "Last 30 days",
      },
      {
        label: "Input Tokens",
        value: numFmt.format(summary.totalInputTokens),
        icon: ArrowDownIcon,
        description: "Sent to providers",
      },
      {
        label: "Output Tokens",
        value: numFmt.format(summary.totalOutputTokens),
        icon: ArrowUpIcon,
        description: "Returned by models",
      },
      {
        label: "Total Tokens",
        value: numFmt.format(totalTokens),
        icon: ZapIcon,
        description: "Input + output",
      },
      {
        label: "Estimated Cost",
        value: costFmt.format(summary.totalCost),
        icon: CoinsIcon,
        description: "Based on recorded usage",
      },
    ];
  }, [summary]);
}

// ─── mini bar chart (SVG) ────────────────────────────────────────────────────
function MiniBarChart({
  data,
  label,
  color = "currentColor",
}: {
  data: { label: string; value: number }[];
  label: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div
              className="w-full rounded-t-sm transition-all duration-300"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 2 : 0,
                backgroundColor: color,
                opacity: 0.7,
              }}
            />
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── recent activity item ────────────────────────────────────────────────────
function ActivityItem({ record }: { record: UsageRecord }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className="mt-0.5">
        {record.status === "success" ? (
          <CheckCircleIcon className="size-4 text-emerald-500" />
        ) : (
          <XCircleIcon className="size-4 text-destructive" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{record.model}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {record.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>
            {numFmt.format(record.inputTokens + record.outputTokens)} tok
          </span>
          <span>·</span>
          <span>{record.latencyMs}ms</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {timeAgoFmt(record.timestamp)}
      </span>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export function UsageDashboard() {
  const {
    summary,
    summaryError,
    isSummaryLoading,
    accountLabels,
    loadSummary,
  } = useUsage();

  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [graphHeight, setGraphHeight] = useState(480);
  const graphContainerRef = useRef<HTMLDivElement>(null);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const data = await apiClient.get<UsageRecord[]>(
        "/api/usage/history?limit=50",
      );
      setRecords(data);
    } catch (err) {
      setRecordsError(getApiErrorMessage(err));
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 200) setGraphHeight(Math.floor(w * 0.55));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const statCards = useStatCards(summary);

  // provider breakdown for chart
  const providerChartData = useMemo(() => {
    if (!summary) return [];
    return summary.byProvider
      .map((p) => ({
        label:
          accountLabels.get(p.providerAccountId)?.split(" — ")[1] ??
          p.providerAccountId.slice(0, 8),
        value: p.inputTokens + p.outputTokens,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [summary, accountLabels]);

  const costChartData = useMemo(() => {
    if (!summary) return [];
    return summary.byProvider
      .map((p) => ({
        label:
          accountLabels.get(p.providerAccountId)?.split(" — ")[1] ??
          p.providerAccountId.slice(0, 8),
        value: p.cost,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [summary, accountLabels]);

  return (
    <div className="flex flex-col gap-4 max-w-[1700px] mx-auto w-full">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClockIcon className="size-4" />
        <span>Last 30 days</span>
      </div>

      {/* ── Stats Cards Row ────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {isSummaryLoading
          ? Array.from({ length: 5 }).map((_val, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <Card key={`stat-${i}`} className="!py-0">
                <CardContent className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))
          : statCards.map((card) => (
              <Card key={card.label} className="!py-0">
                <CardContent className="flex flex-col gap-1.5 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <card.icon className="size-3.5" />
                    <span className="text-xs font-medium">{card.label}</span>
                  </div>
                  <span className="text-xl font-semibold tracking-tight">
                    {card.value}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {card.description}
                  </span>
                </CardContent>
              </Card>
            ))}
      </div>

      {summaryError ? (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">
            {summaryError}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-7"
              onClick={() => void loadSummary()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Main Content Area ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 min-h-0">
        {/* Left: Workflow Canvas */}
        <Card className="flex flex-col overflow-hidden col-span-8 min-h-[300px]">
          <CardContent className="p-0 relative">
            <div ref={graphContainerRef} className="w-full">
              <UsageGraph height={graphHeight} />
            </div>
          </CardContent>
        </Card>

        {/* Right: Recent Activity */}
        <Card className="flex flex-col col-span-4">
          <CardContent className="flex-1 overflow-y-auto px-5 pb-5">
            {recordsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_val, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                    key={`act-${i}`}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <Skeleton className="size-4 rounded-full mt-0.5" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : recordsError ? (
              <p className="text-sm text-destructive">{recordsError}</p>
            ) : records.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No requests yet
              </p>
            ) : (
              <div className="flex flex-col">
                {records.slice(0, 20).map((r) => (
                  <ActivityItem key={r.id} record={r} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Analytics Charts ────────────────────────────────────────── */}
      {!isSummaryLoading && summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              {providerChartData.length > 0 ? (
                <MiniBarChart
                  data={providerChartData}
                  label="Total tokens (input + output)"
                  color="oklch(0.68 0.19 264)"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No token data yet
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {costChartData.length > 0 ? (
                <MiniBarChart
                  data={costChartData}
                  label="Estimated cost (USD)"
                  color="oklch(0.78 0.17 60)"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No cost data yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Provider Breakdown Table ────────────────────────────────── */}
      {!isSummaryLoading && summary && (
        <Card>
          <CardContent>
            {summary.byProvider.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No provider usage data yet
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider Account</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Input Tokens</TableHead>
                    <TableHead className="text-right">Output Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byProvider.map((p) => (
                    <TableRow key={p.providerAccountId}>
                      <TableCell className="font-medium">
                        {accountLabels.get(p.providerAccountId) ??
                          p.providerAccountId}
                      </TableCell>
                      <TableCell className="text-right">
                        {numFmt.format(p.requestCount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {numFmt.format(p.inputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {numFmt.format(p.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {costFmt.format(p.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
