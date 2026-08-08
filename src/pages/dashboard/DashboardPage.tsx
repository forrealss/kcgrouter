import {
  ActivityIcon,
  BoxesIcon,
  CoinsIcon,
  GaugeIcon,
  Layers3Icon,
  RouterIcon,
  ServerIcon,
  SignalIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { UsageGraph } from "@/components/usage/UsageGraph";
import { useCombos } from "@/hooks/useCombos";
import { useProviders } from "@/hooks/useProviders";
import { useQuota } from "@/hooks/useQuota";
import { useRouter } from "@/hooks/useRouter";
import { useUsage } from "@/hooks/useUsage";
import { apiClient } from "@/lib/api-client";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { AccountStatus } from "@/types/provider";
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

// ─── status LED ──────────────────────────────────────────────────────────────
const statusLed: Record<AccountStatus, { dot: string; label: string }> = {
  active: {
    dot: "bg-emerald-500 shadow-[0_0_6px_var(--tw-shadow-color)] shadow-emerald-500/70",
    label: "Aktif",
  },
  error: {
    dot: "bg-destructive shadow-[0_0_6px_var(--tw-shadow-color)] shadow-destructive/70",
    label: "Error",
  },
  expired: { dot: "bg-muted-foreground/50", label: "Kedaluwarsa" },
};

function StatusLed({ status }: { status: AccountStatus }) {
  const s = statusLed[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("block size-2 rounded-full", s.dot)} />
      <span className="text-xs text-muted-foreground">{s.label}</span>
    </span>
  );
}

// ─── system status strip metric ─────────────────────────────────────────────
function SysMetric({
  label,
  value,
  icon: Icon,
  loading,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-r border-border/60 last:border-0 min-w-0">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          tone === "ok" &&
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          tone === "warn" &&
            "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
          tone === "bad" &&
            "border-destructive/30 bg-destructive/10 text-destructive",
          !tone && "border-border bg-muted/50 text-muted-foreground",
        )}
      >
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

// ─── packet log row (recent activity, terminal style) ───────────────────────
function LogRow({ record }: { record: UsageRecord }) {
  const ok = record.status === "success";
  return (
    <div className="flex items-center gap-2 py-1 font-mono text-[11px] leading-relaxed">
      <span className="text-muted-foreground/70 shrink-0">
        {timeFmt.format(new Date(record.timestamp))}
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold",
          ok ? "text-emerald-500" : "text-destructive",
        )}
      >
        {ok ? "OK " : "ERR"}
      </span>
      <span className="truncate flex-1 text-foreground/90">{record.model}</span>
      <span className="text-muted-foreground/70 shrink-0 tabular-nums">
        {numFmt.format(record.inputTokens + record.outputTokens)}tok
      </span>
      <span className="text-muted-foreground/70 shrink-0 tabular-nums w-14 text-right">
        {record.latencyMs}ms
      </span>
    </div>
  );
}

// ─── main dashboard ──────────────────────────────────────────────────────────
export function DashboardPage() {
  const { navigate } = useRouter();
  const { providers, accounts } = useProviders();
  const { combos } = useCombos();
  const { summary } = useUsage();
  const { accounts: quotaAccounts } = useQuota();

  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<UsageRecord[]>("/api/usage/history?limit=20")
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
          ].slice(0, 20),
        );
      } catch {}
    });
    return () => es.close();
  }, []);

  // ── flattened list of all accounts with provider ref, for the port table ──
  const allAccounts = useMemo(() => {
    if (!providers) return [];
    return providers.flatMap((p) => {
      const list = accounts[p.id]?.accounts ?? [];
      return list.map((a) => ({ account: a, provider: p }));
    });
  }, [providers, accounts]);

  const activeCount = useMemo(
    () => allAccounts.filter((x) => x.account.status === "active").length,
    [allAccounts],
  );
  const errorCount = useMemo(
    () => allAccounts.filter((x) => x.account.status === "error").length,
    [allAccounts],
  );

  const totalRequests = useMemo(() => {
    if (!summary) return 0;
    return summary.byProvider.reduce((a, p) => a + p.requestCount, 0);
  }, [summary]);

  const usageByAccount = useMemo(() => {
    const map = new Map<string, { requestCount: number; tokens: number }>();
    if (summary) {
      for (const p of summary.byProvider) {
        map.set(p.providerAccountId, {
          requestCount: p.requestCount,
          tokens: p.inputTokens + p.outputTokens,
        });
      }
    }
    return map;
  }, [summary]);

  const quotaByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of quotaAccounts ?? []) {
      const limit = a.quotaLimitTokens;
      if (limit === null || limit <= 0) continue;
      map.set(
        a.id,
        Math.min(100, Math.round((a.quotaState.tokensUsed / limit) * 100)),
      );
    }
    return map;
  }, [quotaAccounts]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <RouterIcon className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">
              KCG Router — Status Sistem
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Panel kendali: koneksi provider, jalur combo, dan lalu lintas
            request secara real-time.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
          <span className="block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </Badge>
      </div>

      {/* ── System Status Strip ────────────────────────────────────── */}
      <Card className="!py-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 [&>*:nth-child(2)]:border-r-0 sm:[&>*:nth-child(2)]:border-r sm:[&>*:nth-child(3n)]:border-r-0 lg:[&>*:nth-child(3n)]:border-r lg:[&>*:last-child]:border-r-0">
          <SysMetric
            label="Penyedia Terhubung"
            value={numFmt.format(providers?.length ?? 0)}
            icon={ServerIcon}
            loading={!providers}
            tone="ok"
          />
          <SysMetric
            label="Koneksi Aktif"
            value={`${numFmt.format(activeCount)}/${numFmt.format(allAccounts.length)}`}
            icon={SignalIcon}
            loading={!providers}
            tone={errorCount > 0 ? "warn" : "ok"}
          />
          <SysMetric
            label="Combo Terpasang"
            value={numFmt.format(combos?.length ?? 0)}
            icon={Layers3Icon}
            loading={!combos}
          />
          <SysMetric
            label="Total Request"
            value={numFmt.format(totalRequests)}
            icon={ZapIcon}
            loading={!summary}
          />
          <SysMetric
            label="Estimasi Biaya"
            value={costFmt.format(summary?.totalCost ?? 0)}
            icon={CoinsIcon}
            loading={!summary}
          />
          <SysMetric
            label="Koneksi Error"
            value={numFmt.format(errorCount)}
            icon={GaugeIcon}
            loading={!providers}
            tone={errorCount > 0 ? "bad" : "ok"}
          />
        </div>
      </Card>

      {/* ── Main: Router Graph + Packet Log ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8 !py-0 overflow-hidden">
          <CardHeader className="px-5 pt-4 pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <RouterIcon className="size-4" />
              Topologi Jaringan
            </CardTitle>
            <span className="text-xs text-muted-foreground font-mono">
              hub → transport
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <UsageGraph height={360} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 !py-0 overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ActivityIcon className="size-4" />
              Log Paket
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              tail -f
            </Badge>
          </CardHeader>
          <CardContent className="px-4 pb-4">
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
                records.map((r) => <LogRow key={r.id} record={r} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Port Table: provider account status/load/quota ────────────── */}
      <Card className="!py-0 overflow-hidden">
        <CardHeader className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BoxesIcon className="size-4" />
            Status Koneksi Provider
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/providers")}
          >
            Kelola →
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {allAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Belum ada akun provider yang dikonfigurasi
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Request</TableHead>
                  <TableHead className="text-right">Token Terpakai</TableHead>
                  <TableHead className="w-[160px]">Kuota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allAccounts.map(({ account, provider }) => {
                  const meta = transportMeta[provider.transport];
                  const usage = usageByAccount.get(account.id);
                  const quotaPct = quotaByAccount.get(account.id);
                  return (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{account.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {provider.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("font-normal", meta.accentClassName)}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusLed status={account.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {numFmt.format(usage?.requestCount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {numFmt.format(usage?.tokens ?? 0)}
                      </TableCell>
                      <TableCell>
                        {quotaPct === undefined ? (
                          <span className="text-xs text-muted-foreground">
                            Tidak terbatas
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress value={quotaPct} className="h-1.5" />
                            <span className="text-xs font-mono text-muted-foreground w-9 text-right shrink-0">
                              {quotaPct}%
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Combo Routing Table ─────────────────────────────────────── */}
      <Card className="!py-0 overflow-hidden">
        <CardHeader className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers3Icon className="size-4" />
            Jalur Combo
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/combos")}
          >
            Kelola →
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {!combos || combos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Belum ada combo yang dikonfigurasi
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => (
                <div
                  key={combo.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {combo.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {combo.memberCount} target
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {combo.strategy === "fallback" ? "FALLBACK" : "ROUND-ROBIN"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
