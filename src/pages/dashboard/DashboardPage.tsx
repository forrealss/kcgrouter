import {
  BoxesIcon,
  ClockIcon,
  CoinsIcon,
  GaugeIcon,
  Layers3Icon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCombos } from "@/hooks/useCombos";
import { useProviders } from "@/hooks/useProviders";
import { useQuota } from "@/hooks/useQuota";
import { useRouter } from "@/hooks/useRouter";
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
const timeAgoFmt = (ts: string) => {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}d lalu`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m lalu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}j lalu`;
  return `${Math.floor(diff / 86_400_000)}h lalu`;
};

// ─── mini stat card ──────────────────────────────────────────────────────────
function StatCard({
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
    <Card className="!py-4">
      <CardContent className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <span className="text-xl font-semibold tracking-tight">{value}</span>
        )}
      </CardContent>
    </Card>
  );
}

// ─── activity item ───────────────────────────────────────────────────────────
function ActivityItem({ record }: { record: UsageRecord }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="mt-0.5">
        {record.status === "success" ? (
          <span className="block size-2 rounded-full bg-emerald-500" />
        ) : (
          <span className="block size-2 rounded-full bg-destructive" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block">
          {record.model}
        </span>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
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

// ─── main dashboard ──────────────────────────────────────────────────────────
export function DashboardPage() {
  const { navigate } = useRouter();
  const { providers } = useProviders();
  const { combos } = useCombos();
  const { summary } = useUsage();
  const { accounts } = useQuota();

  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  // fetch recent activity
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<UsageRecord[]>("/api/usage/history?limit=15")
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // realtime SSE
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("request:complete", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          providerAccountId: string;
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
              comboId: null,
              model: data.model,
              inputTokens: 0,
              outputTokens: 0,
              status: "success",
              latencyMs: data.latencyMs,
              estimatedCost: 0,
            },
            ...prev,
          ].slice(0, 15),
        );
      } catch {}
    });
    return () => es.close();
  }, []);

  // ── computed stats ────────────────────────────────────────────────────────
  const totalAccounts = useMemo(() => {
    if (!providers) return 0;
    let count = 0;
    for (const p of providers) {
      count += p.accountCount ?? 0;
    }
    return count;
  }, [providers]);

  const totalRequests = useMemo(() => {
    if (!summary) return 0;
    return summary.byProvider.reduce((a, p) => a + p.requestCount, 0);
  }, [summary]);

  // ── area chart: requests per day (simulated from history) ──────────────────
  const areaData = useMemo(() => {
    const byDate = new Map<string, number>();
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
      });
      byDate.set(key, 0);
    }
    for (const r of records) {
      const d = new Date(r.timestamp);
      if (now - d.getTime() > 7 * 86400_000) continue;
      const key = d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
      });
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }
    return Array.from(byDate.entries()).map(([name, requests]) => ({
      name,
      requests,
    }));
  }, [records]);

  // ── bar chart: top providers ──────────────────────────────────────────────
  const providerData = useMemo(() => {
    if (!summary) return [];
    return summary.byProvider
      .map((p) => ({
        name: p.providerAccountId.slice(0, 10),
        tokens: p.inputTokens + p.outputTokens,
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);
  }, [summary]);

  // ── radial chart: quota status ────────────────────────────────────────────
  const quotaData = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    return accounts.slice(0, 5).map((a) => {
      const used = a.quotaState.tokensUsed;
      const limit = a.quotaLimitTokens ?? 1_000_000;
      const pct = Math.min(100, Math.round((used / limit) * 100));
      const remaining = Math.max(0, 100 - pct);
      return {
        name: a.label,
        value: remaining,
        fill:
          remaining > 60
            ? "var(--chart-3)"
            : remaining > 30
              ? "var(--chart-4)"
              : "var(--chart-5)",
      };
    });
  }, [accounts]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Ringkasan sistem, analitik penggunaan, dan status layanan.
        </p>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Penyedia"
          value={numFmt.format(providers?.length ?? 0)}
          icon={BoxesIcon}
          loading={!providers}
        />
        <StatCard
          label="Akun Aktif"
          value={numFmt.format(totalAccounts)}
          icon={BoxesIcon}
          loading={!providers}
        />
        <StatCard
          label="Combo"
          value={numFmt.format(combos?.length ?? 0)}
          icon={Layers3Icon}
          loading={!combos}
        />
        <StatCard
          label="Total Request"
          value={numFmt.format(totalRequests)}
          icon={ZapIcon}
          loading={!summary}
        />
        <StatCard
          label="Total Biaya"
          value={costFmt.format(summary?.totalCost ?? 0)}
          icon={CoinsIcon}
          loading={!summary}
        />
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Area Chart: Usage */}
        <Card className="lg:col-span-8 !py-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-base">Penggunaan 7 Hari</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-4 !py-0 overflow-hidden">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Aktivitas Terkini</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                <ClockIcon className="size-3 mr-1" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div
              className="max-h-[200px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "var(--border) transparent",
              }}
            >
              {recordsLoading ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 py-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16 ml-auto" />
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14 ml-auto" />
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </div>
                </div>
              ) : records.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Belum ada aktivitas
                </p>
              ) : (
                records
                  .slice(0, 15)
                  .map((r) => <ActivityItem key={r.id} record={r} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Bar Chart + Radial + Shortcuts ──────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Bar Chart: Top Providers */}
        <Card className="lg:col-span-5 !py-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-base">Top Provider</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {providerData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={providerData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="tokens"
                    fill="var(--chart-2)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada data
              </p>
            )}
          </CardContent>
        </Card>

        {/* Radial: Quota Status */}
        <Card className="lg:col-span-4 !py-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-base">Status Kuota</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 flex items-center justify-center">
            {quotaData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="30%"
                  outerRadius="100%"
                  data={quotaData}
                  startAngle={180}
                  endAngle={0}
                >
                  <RadialBar
                    background={{ fill: "var(--muted)" }}
                    dataKey="value"
                    cornerRadius={10}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada kuota
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Shortcuts */}
        <Card className="lg:col-span-3 !py-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-base">Aksi Cepat</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/providers")}
            >
              <BoxesIcon className="size-4" />
              Kelola Provider
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/combos")}
            >
              <Layers3Icon className="size-4" />
              Buat Combo
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/usage")}
            >
              <ZapIcon className="size-4" />
              Lihat Usage
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/quota")}
            >
              <GaugeIcon className="size-4" />
              Cek Kuota
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/token-saver")}
            >
              <CoinsIcon className="size-4" />
              Token Saver
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
