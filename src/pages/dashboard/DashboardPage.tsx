import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { CombosTopologyCard } from "@/components/dashboard/CombosTopologyCard";
import { HealthSection } from "@/components/dashboard/HealthSection";
import { LiveActivityCard } from "@/components/dashboard/LiveActivityCard";
import { ProviderStatusTable } from "@/components/dashboard/ProviderStatusTable";
import { QuotaTrackerCard } from "@/components/dashboard/QuotaTrackerCard";
import { RouterStatsCard } from "@/components/dashboard/RouterStatsCard";
import { TokenSaverCard } from "@/components/dashboard/TokenSaverCard";
import { VolumeSpendCard } from "@/components/dashboard/VolumeSpendCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UsageGraph } from "@/components/usage/UsageGraph";
import { useCombos } from "@/hooks/useCombos";
import { useDashboardActivity } from "@/hooks/useDashboardActivity";
import { useEncryptionHealth } from "@/hooks/useEncryptionHealth";
import { useProviders } from "@/hooks/useProviders";
import { useQuota } from "@/hooks/useQuota";
import { useTokenSaver } from "@/hooks/useTokenSaver";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useUsageSummary } from "@/hooks/useUsageSummary";
import { type SseStatus, useSseStatus } from "@/lib/sse-bus";
import { cn } from "@/lib/utils";
import type { ProviderUsageData } from "@/types/quota";

const sseMeta: Record<SseStatus, { label: string; dot: string }> = {
  live: { label: "LIVE", dot: "bg-chart-3 animate-pulse" },
  connecting: { label: "CONNECTING", dot: "bg-chart-4 animate-pulse" },
  offline: { label: "OFFLINE", dot: "bg-destructive" },
};

/**
 * Dashboard landing page. Ordered to answer "is my gateway healthy right
 * now, and what has it been doing?" top to bottom:
 *   1. Critical alerts (encryption mismatch, pending update)
 *   2. Account health (benched / failing / expired accounts, or a quiet
 *      "all healthy" strip)
 *   3. Network graph + live activity feed
 *   4. Volume & spend, alongside token saver + router behaviour
 *   5. Provider connection table, combo topology, upstream quota
 */
export function DashboardPage() {
  const {
    providers,
    accounts,
    isLoading: providersLoading,
    error: providersError,
  } = useProviders();
  const {
    combos,
    membersByCombo,
    isLoading: combosLoading,
    error: combosError,
  } = useCombos();
  const {
    summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useUsageSummary();
  const {
    accounts: quotaAccounts,
    providerUsage,
    isLoading: quotaLoading,
    isLoadingUsage,
    error: quotaError,
    loadProviderUsage,
  } = useQuota();
  const { health: encryptionHealth } = useEncryptionHealth();
  const {
    settings: tokenSaverSettings,
    isLoading: tokenSaverLoading,
    loadError: tokenSaverError,
  } = useTokenSaver();
  const update = useUpdateCheck();
  const activity = useDashboardActivity();
  const sseStatus = useSseStatus();

  const mainRowRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(360);
  const [hasFetchedUpstream, setHasFetchedUpstream] = useState(false);

  // `/api/quota/usage` fans out sequential calls to every upstream provider,
  // so it stays behind an explicit action instead of firing on every visit.
  const handleFetchUpstream = useCallback(() => {
    setHasFetchedUpstream(true);
    void loadProviderUsage();
  }, [loadProviderUsage]);

  // Responsive height shared by the network graph and live activity feed.
  useEffect(() => {
    const el = mainRowRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      setRowH(
        w < 640
          ? Math.floor(w * 0.62)
          : w < 1024
            ? Math.floor(w * 0.44)
            : Math.floor(w * 0.38),
      );
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allAccounts = useMemo(() => {
    if (!providers) return [];
    return providers.flatMap((p) => {
      const list = accounts[p.id]?.accounts ?? [];
      return list.map((a) => ({ account: a, provider: p }));
    });
  }, [providers, accounts]);

  const accountById = useMemo(() => {
    const map = new Map(
      allAccounts.map((row) => [row.account.id, row.account]),
    );
    return (id: string) => map.get(id);
  }, [allAccounts]);

  // Display labels come from the already-loaded provider/account data rather
  // than re-fetching the whole provider tree just to build a lookup.
  const accountLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const { account, provider } of allAccounts) {
      map.set(account.id, `${provider.name} — ${account.label}`);
    }
    return map;
  }, [allAccounts]);

  const accountLabel = useCallback(
    (accountId: string) => accountLabels.get(accountId) ?? accountId,
    [accountLabels],
  );

  const usageByAccount = useMemo(() => {
    const map = new Map<string, { requestCount: number; tokens: number }>();
    for (const p of summary?.byProvider ?? []) {
      map.set(p.providerAccountId, {
        requestCount: p.requestCount,
        tokens: p.inputTokens + p.outputTokens,
      });
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

  const quotaUsageByAccount = useMemo(() => {
    const map = new Map<string, ProviderUsageData>();
    for (const u of providerUsage ?? []) map.set(u.accountId, u);
    return map;
  }, [providerUsage]);

  const recentTimestamps = useMemo(
    () => activity.logs.map((l) => l.timestamp),
    [activity.logs],
  );

  const status = sseMeta[sseStatus];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* ── Live status ─────────────────────────────────────────────
          The app shell already renders the page title, so this row only
          carries the connection indicator. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Provider connections, combo routes, and real-time request traffic.
        </p>
        <Badge
          variant="outline"
          className="gap-1.5 font-mono text-[11px]"
          title={
            sseStatus === "offline"
              ? "Event stream disconnected — figures may be stale"
              : undefined
          }
        >
          <span
            className={cn("block size-1.5 rounded-full", status.dot)}
            aria-hidden
          />
          <span aria-live="polite">{status.label}</span>
        </Badge>
      </div>

      {/* ── Critical alerts ───────────────────────────────────────── */}
      <AlertsSection
        encryptionHealth={encryptionHealth}
        version={{
          current: update.current,
          latest: update.latest,
          updateAvailable: update.updateAvailable,
          updateCommand: update.updateCommand,
        }}
      />

      {/* ── Health headline ───────────────────────────────────────── */}
      <HealthSection
        accounts={allAccounts}
        isLoading={providersLoading}
        error={providersError}
        providerCount={providers?.length ?? 0}
        comboCount={combos.length}
      />

      {/* ── Network graph + live activity ─────────────────────────── */}
      <div ref={mainRowRef} className="grid min-w-0 gap-4 lg:grid-cols-5">
        <Card
          className="min-w-0 overflow-hidden !py-0 lg:col-span-3"
          style={{ height: rowH }}
        >
          <CardContent className="h-full p-0">
            <UsageGraph height={rowH} />
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <LiveActivityCard
            logs={activity.logs}
            isLoading={activity.isLoading}
            error={activity.error}
            freshIds={activity.freshIds}
            height={rowH}
          />
        </div>
      </div>

      {/* ── Volume & spend, token saver, router behaviour ───────────
          items-stretch keeps both columns the same height, so neither side
          leaves an empty gap below it. */}
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <VolumeSpendCard
            summary={summary}
            isLoading={summaryLoading}
            error={summaryError}
            recentTimestamps={recentTimestamps}
            accountLabel={accountLabel}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TokenSaverCard
            settings={tokenSaverSettings}
            isLoading={tokenSaverLoading}
            error={tokenSaverError}
          />
          <RouterStatsCard
            stats={activity.stats}
            statsError={activity.statsError}
            errorRatePct={activity.errorRatePct}
            latencyP50={activity.latencyP50}
            latencyP95={activity.latencyP95}
            sampleSize={activity.sampleSize}
            isLoading={activity.isLoading}
          />
        </div>
      </div>

      {/* ── Provider connection status ─────────────────────────────── */}
      <ProviderStatusTable
        rows={allAccounts}
        usageByAccount={usageByAccount}
        quotaByAccount={quotaByAccount}
        isLoading={providersLoading}
        error={providersError}
      />

      {/* ── Combo routing topology ────────────────────────────────── */}
      <CombosTopologyCard
        combos={combos}
        membersByCombo={membersByCombo}
        accountById={accountById}
        isLoading={combosLoading}
        error={combosError}
      />

      {/* ── Upstream quota ─────────────────────────────────────────── */}
      <QuotaTrackerCard
        accounts={quotaAccounts}
        usageByAccount={quotaUsageByAccount}
        isLoading={quotaLoading}
        error={quotaError}
        isFetchingUpstream={isLoadingUsage}
        hasFetchedUpstream={hasFetchedUpstream}
        onFetchUpstream={handleFetchUpstream}
      />
    </div>
  );
}
