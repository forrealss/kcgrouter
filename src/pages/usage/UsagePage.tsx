import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  CoinsIcon,
  GaugeIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProviders } from "@/hooks/useProviders";
import { useUsage } from "@/hooks/useUsage";
import { apiClient } from "@/lib/api-client";
import type { UsageRecord } from "@/types/usage";

// ─── formatters ──────────────────────────────────────────────────────────────
const numFmt = new Intl.NumberFormat("id-ID");
const costFmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// ─── stats strip metric ──────────────────────────────────────────────────────
function StatMetric({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-w-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </span>
        {loading ? (
          <Skeleton className="h-5 w-16 mt-0.5" />
        ) : (
          <span className="text-base font-mono font-semibold tracking-tight tabular-nums">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export function UsagePage() {
  const { summary, isSummaryLoading } = useUsage();
  const { providers, accounts } = useProviders();

  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const data = await apiClient.get<UsageRecord[]>(
        "/api/usage/history?limit=50",
      );
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // realtime SSE
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("request:complete", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          providerAccountId: string;
          comboId: string | null;
          model: string;
          transport: string;
          latencyMs: number;
          timestamp: number;
        };
        setRecords((prev) =>
          [
            {
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
            },
            ...prev,
          ].slice(0, 50),
        );
      } catch {}
    });
    return () => es.close();
  }, []);

  // ── computed stats ────────────────────────────────────────────────────────
  const totalReqs = useMemo(() => {
    if (!summary) return 0;
    return summary.byProvider.reduce((a, p) => a + p.requestCount, 0);
  }, [summary]);

  const avgLatency = useMemo(() => {
    if (records.length === 0) return 0;
    const sum = records.reduce((a, r) => a + r.latencyMs, 0);
    return Math.round(sum / records.length);
  }, [records]);

  // ── accountId → providerId reverse map ────────────────────────────────────
  const accountToProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const [providerId, state] of Object.entries(accounts)) {
      for (const acct of state.accounts ?? []) {
        map.set(acct.id, providerId);
      }
    }
    return map;
  }, [accounts]);

  // ── token chart: aggregated per provider ──────────────────────────────────
  const providerTokenChartData = useMemo(() => {
    const tokenMap = new Map<string, number>();
    if (summary) {
      for (const p of summary.byProvider) {
        const pid = accountToProvider.get(p.providerAccountId);
        if (!pid) continue;
        tokenMap.set(
          pid,
          (tokenMap.get(pid) ?? 0) + p.inputTokens + p.outputTokens,
        );
      }
    }
    if (!providers) return [];
    return providers
      .map((p) => ({
        name: p.name,
        tokens: tokenMap.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [providers, summary, accountToProvider]);

  // ── latency chart from records ────────────────────────────────────────────
  const modelLatencyChartData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of records) {
      const existing = map.get(r.model);
      if (existing) {
        existing.total += r.latencyMs;
        existing.count += 1;
      } else {
        map.set(r.model, { total: r.latencyMs, count: 1 });
      }
    }
    return Array.from(map.entries())
      .map(([model, data]) => ({
        model: model.length > 28 ? `${model.slice(0, 25)}...` : model,
        avgLatency: Math.round(data.total / data.count),
      }))
      .sort((a, b) => a.avgLatency - b.avgLatency)
      .slice(0, 10);
  }, [records]);

  // ── provider table: tokens ────────────────────────────────────────────────
  const providerTokenRanking = useMemo(() => {
    const tokenMap = new Map<string, number>();
    const reqMap = new Map<string, number>();
    if (summary) {
      for (const p of summary.byProvider) {
        const pid = accountToProvider.get(p.providerAccountId);
        if (!pid) continue;
        tokenMap.set(
          pid,
          (tokenMap.get(pid) ?? 0) + p.inputTokens + p.outputTokens,
        );
        reqMap.set(pid, (reqMap.get(pid) ?? 0) + p.requestCount);
      }
    }
    if (!providers) return [];
    const maxTokens = Math.max(...tokenMap.values(), 1);
    return providers
      .map((p) => ({
        id: p.id,
        label: p.name,
        tokens: tokenMap.get(p.id) ?? 0,
        pct: Math.round(((tokenMap.get(p.id) ?? 0) / maxTokens) * 100),
        requests: reqMap.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [providers, summary, accountToProvider]);

  // ── provider table: cost ──────────────────────────────────────────────────
  const providerCostRanking = useMemo(() => {
    const costMap = new Map<string, number>();
    if (summary) {
      for (const p of summary.byProvider) {
        const pid = accountToProvider.get(p.providerAccountId);
        if (!pid) continue;
        costMap.set(pid, (costMap.get(pid) ?? 0) + p.cost);
      }
    }
    if (!providers) return [];
    const maxCost = Math.max(...costMap.values(), 0.0001);
    return providers
      .map((p) => ({
        id: p.id,
        label: p.name,
        cost: costMap.get(p.id) ?? 0,
        pct: Math.round(((costMap.get(p.id) ?? 0) / maxCost) * 100),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [providers, summary, accountToProvider]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Analitik Penggunaan</h2>
          <p className="text-sm text-muted-foreground">
            Peringkat penggunaan token, biaya, dan performa model.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
          <span className="block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </Badge>
      </div>

      {/* ── Stats Strip ─────────────────────────────────────────────── */}
      <Card className="!py-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-border/60 [&>*]:bg-card">
          <StatMetric
            label="Total Request"
            value={numFmt.format(totalReqs)}
            icon={ActivityIcon}
            loading={isSummaryLoading}
          />
          <StatMetric
            label="Token Masuk"
            value={numFmt.format(summary?.totalInputTokens ?? 0)}
            icon={ArrowDownIcon}
            loading={isSummaryLoading}
          />
          <StatMetric
            label="Token Keluar"
            value={numFmt.format(summary?.totalOutputTokens ?? 0)}
            icon={ArrowUpIcon}
            loading={isSummaryLoading}
          />
          <StatMetric
            label="Estimasi Biaya"
            value={costFmt.format(summary?.totalCost ?? 0)}
            icon={CoinsIcon}
            loading={isSummaryLoading}
          />
          <StatMetric
            label="Rata-rata Latensi"
            value={`${avgLatency}ms`}
            icon={ClockIcon}
            loading={recordsLoading}
          />
        </div>
      </Card>

      {/* ── Charts: Token + Latency ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Token Chart */}
        <Card className="!py-0 overflow-hidden">
          <CardHeader className="px-5 pt-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ZapIcon className="size-4 text-muted-foreground" />
              Peringkat Provider berdasarkan Token
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {providerTokenChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada akun provider
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, providerTokenChartData.length * 36)}
              >
                <BarChart
                  data={providerTokenChartData}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={180}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [
                      numFmt.format(value),
                      "Token",
                    ]}
                  />
                  <Bar
                    dataKey="tokens"
                    fill="var(--chart-1)"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Latency Chart */}
        <Card className="!py-0 overflow-hidden">
          <CardHeader className="px-5 pt-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GaugeIcon className="size-4 text-muted-foreground" />
              Peringkat Model berdasarkan Latensi
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {modelLatencyChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada data latensi — muncul setelah ada request
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, modelLatencyChartData.length * 36)}
              >
                <BarChart
                  data={modelLatencyChartData}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={180}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value}ms`, "Latensi"]}
                  />
                  <Bar
                    dataKey="avgLatency"
                    fill="var(--chart-3)"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tabel: Penggunaan Token Provider ─────────────────────────── */}
      <Card className="!py-0 overflow-hidden">
        <CardHeader className="px-5 pt-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpIcon className="size-4 text-muted-foreground" />
            Penggunaan Token per Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {providerTokenRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Belum ada data penggunaan provider
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%] text-center">#</TableHead>
                  <TableHead className="w-[32%]">Provider</TableHead>
                  <TableHead className="w-[30%]">Penggunaan</TableHead>
                  <TableHead className="w-[15%] text-right">Token</TableHead>
                  <TableHead className="w-[15%] text-right">Request</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerTokenRanking.map((p, i) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium truncate">
                      {p.label}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={p.pct} className="h-1.5 flex-1" />
                        <span className="text-xs font-mono text-muted-foreground w-9 text-right shrink-0">
                          {p.pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {numFmt.format(p.tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {numFmt.format(p.requests)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Tabel: Biaya per Provider ────────────────────────────────── */}
      <Card className="!py-0 overflow-hidden">
        <CardHeader className="px-5 pt-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CoinsIcon className="size-4 text-muted-foreground" />
            Biaya per Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {providerCostRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Belum ada data biaya
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%] text-center">#</TableHead>
                  <TableHead className="w-[40%]">Provider</TableHead>
                  <TableHead className="w-[32%]">Porsi Biaya</TableHead>
                  <TableHead className="w-[20%] text-right">
                    Biaya (USD)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerCostRanking.map((p, i) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium truncate">
                      {p.label}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={p.pct} className="h-1.5 flex-1" />
                        <span className="text-xs font-mono text-muted-foreground w-9 text-right shrink-0">
                          {p.pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {costFmt.format(p.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Log Request ─────────────────────────────────────────────── */}
      <Card className="!py-0 overflow-hidden">
        <CardHeader className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="size-4 text-muted-foreground" />
            Log Request
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            tail -f
          </Badge>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div
            className="max-h-[320px] overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "var(--border) transparent",
            }}
          >
            {recordsLoading ? (
              <div className="flex flex-col gap-2 py-1">
                {Array.from({ length: 6 }).map((_v, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                  <Skeleton key={`log-${i}`} className="h-3.5 w-full" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada aktivitas
              </p>
            ) : (
              records.map((r) => {
                const ok = r.status === "success";
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 py-1 font-mono text-[11px] leading-relaxed"
                  >
                    <span className="text-muted-foreground/70 shrink-0">
                      {timeFmt.format(new Date(r.timestamp))}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${ok ? "text-emerald-500" : "text-destructive"}`}
                    >
                      {ok ? "OK " : "ERR"}
                    </span>
                    <span className="truncate flex-1 text-foreground/90">
                      {r.model}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0 tabular-nums">
                      {numFmt.format(r.inputTokens + r.outputTokens)}tok
                    </span>
                    <span className="text-muted-foreground/70 shrink-0 tabular-nums w-14 text-right">
                      {r.latencyMs}ms
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
