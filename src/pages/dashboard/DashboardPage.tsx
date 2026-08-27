import {
  BoxesIcon,
  KeyRoundIcon,
  Layers3Icon,
  ScissorsIcon,
  ScrollTextIcon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { HealthSection } from "@/components/dashboard/HealthSection";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { UsageTrendCard } from "@/components/dashboard/UsageTrendCard";
import { Badge } from "@/components/ui/badge";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useCLITools } from "@/hooks/useCLITools";
import { useCombos } from "@/hooks/useCombos";
import { useDashboardActivity } from "@/hooks/useDashboardActivity";
import { useEncryptionHealth } from "@/hooks/useEncryptionHealth";
import { useProviders } from "@/hooks/useProviders";
import { useRouter } from "@/hooks/useRouter";
import { useTokenSaver } from "@/hooks/useTokenSaver";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useUsageSummary } from "@/hooks/useUsageSummary";
import { useUsageTimeseries } from "@/hooks/useUsageTimeseries";
import { countCLIToolStates } from "@/lib/cli-tool-status";
import { compactNumber, formatAgo, numFmt } from "@/lib/dashboard-format";
import { type SseStatus, useSseStatus } from "@/lib/sse-bus";
import { cn } from "@/lib/utils";

const sseMeta: Record<SseStatus, { label: string; dot: string }> = {
  live: { label: "LIVE", dot: "bg-live animate-pulse" },
  connecting: { label: "CONNECTING", dot: "bg-warning animate-pulse" },
  offline: { label: "OFFLINE", dot: "bg-destructive" },
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Dashboard landing page — a summary, not a duplicate of every other page.
 * Detail already lives on /providers, /combos, /usage, /quota, /logs; this
 * page answers three questions: is anything broken, what are the headline
 * numbers, and where's the traffic trending. Ordered:
 *   1. Critical alerts + account problems (hidden entirely when healthy)
 *   2. Headline stat cards (providers, combos, tokens, requests)
 *   3. Status + shortcut cards (token saver, CLI tools, logs, API keys)
 *   4. Usage trend chart with a date-range filter
 */
export function DashboardPage() {
  const {
    providers,
    accounts,
    isLoading: providersLoading,
    error: providersError,
  } = useProviders();
  const { combos, membersByCombo, isLoading: combosLoading } = useCombos();
  const {
    summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useUsageSummary();
  const { health: encryptionHealth } = useEncryptionHealth();
  const {
    settings: tokenSaverSettings,
    isLoading: tokenSaverLoading,
    loadError: tokenSaverError,
  } = useTokenSaver();
  const { tools: cliTools, isLoading: cliToolsLoading } = useCLITools();
  const { keys: apiKeys, isLoading: apiKeysLoading } = useApiKeys();
  const update = useUpdateCheck();
  const activity = useDashboardActivity();
  const sseStatus = useSseStatus();
  const { navigate } = useRouter();

  const [range, setRange] = useState(() => ({
    from: startOfDay(daysAgo(29)),
    to: endOfDay(new Date()),
  }));
  const {
    buckets,
    isLoading: trendLoading,
    error: trendError,
  } = useUsageTimeseries({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });

  const allAccounts = useMemo(() => {
    if (!providers) return [];
    return providers.flatMap((p) => {
      const list = accounts[p.id]?.accounts ?? [];
      return list.map((a) => ({ account: a, provider: p }));
    });
  }, [providers, accounts]);

  const activeAccountCount = useMemo(
    () => allAccounts.filter((row) => row.account.status === "active").length,
    [allAccounts],
  );

  const totalRequests = useMemo(
    () => summary?.byProvider.reduce((a, p) => a + p.requestCount, 0) ?? 0,
    [summary],
  );
  const totalTokens =
    (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0);

  const comboMemberCount = useMemo(
    () =>
      Object.values(membersByCombo).reduce(
        (sum, members) => sum + members.length,
        0,
      ),
    [membersByCombo],
  );

  const cliCounts = useMemo(
    () => countCLIToolStates(Object.values(cliTools ?? {})),
    [cliTools],
  );
  const cliNeedsAttention = cliCounts.needsSetup + cliCounts.orphaned;

  const recentErrorCount = useMemo(
    () => activity.logs.filter((l) => l.type === "error").length,
    [activity.logs],
  );
  const lastActivityAt = activity.logs[0]?.timestamp ?? null;

  // Revoked keys are deleted outright (see revokeApiKey), so every key this
  // list returns is active.
  const activeApiKeyCount = apiKeys?.length ?? 0;
  const lastKeyUsedAt = useMemo(() => {
    const timestamps = (apiKeys ?? [])
      .map((k) => k.last_used_at)
      .filter((v): v is string => v != null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return timestamps[0] ?? null;
  }, [apiKeys]);

  function goToApiKeys() {
    navigate("/settings");
    // Settings mounts synchronously; wait one frame so the anchor exists
    // before scrolling and flashing the highlight ring.
    requestAnimationFrame(() => {
      const el = document.getElementById("api-keys");
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-primary/60");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/60"), 1600);
    });
  }

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

      {/* ── Critical alerts + account problems ─────────────────────── */}
      <AlertsSection
        encryptionHealth={encryptionHealth}
        version={{
          current: update.current,
          latest: update.latest,
          updateAvailable: update.updateAvailable,
          updateCommand: update.updateCommand,
        }}
      />
      <HealthSection
        accounts={allAccounts}
        isLoading={providersLoading}
        error={providersError}
      />

      {/* ── Headline numbers ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {providersLoading && providers === null ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Providers"
              value={String(providers?.length ?? 0)}
              hint={`${activeAccountCount}/${allAccounts.length} connections active`}
              icon={BoxesIcon}
              tone="ok"
              onClick={() => navigate("/providers")}
            />
            <StatCard
              label="Combos"
              value={String(combosLoading ? "…" : combos.length)}
              hint={`${comboMemberCount} member${comboMemberCount === 1 ? "" : "s"}`}
              icon={Layers3Icon}
              onClick={() => navigate("/combos")}
            />
            <StatCard
              label="Tokens"
              value={compactNumber(totalTokens)}
              hint={`in ${compactNumber(summary?.totalInputTokens ?? 0)} · out ${compactNumber(summary?.totalOutputTokens ?? 0)}`}
              icon={ZapIcon}
              loading={summaryLoading}
              error={summaryError}
              onClick={() => navigate("/usage")}
            />
            <StatCard
              label="Requests"
              value={numFmt.format(totalRequests)}
              hint={
                activity.sampleSize > 0
                  ? `err ${activity.errorRatePct.toFixed(1)}% · p95 ${activity.latencyP95}ms`
                  : "no samples yet"
              }
              icon={ScrollTextIcon}
              tone={activity.errorRatePct > 5 ? "warn" : "neutral"}
              loading={summaryLoading}
              onClick={() => navigate("/usage")}
            />
          </>
        )}
      </div>

      {/* ── Status + shortcuts ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Token Saver"
          value={tokenSaverSettings?.enabled ? "on" : "off"}
          hint={
            tokenSaverSettings
              ? `${compactNumber(tokenSaverSettings.totalTokensSaved)} saved`
              : undefined
          }
          icon={ScissorsIcon}
          tone={tokenSaverSettings?.enabled ? "ok" : "neutral"}
          loading={tokenSaverLoading}
          error={tokenSaverError}
          onClick={() => navigate("/token-saver")}
        />
        <StatCard
          label="CLI Tools"
          value={`${cliCounts.connected}/${cliCounts.total}`}
          hint={
            cliCounts.total === 0
              ? "no clients registered"
              : cliNeedsAttention > 0
                ? `${cliNeedsAttention} need setup`
                : "all configured"
          }
          icon={TerminalIcon}
          tone={
            cliCounts.total === 0
              ? "neutral"
              : cliNeedsAttention > 0
                ? "warn"
                : "ok"
          }
          loading={cliToolsLoading}
          onClick={() => navigate("/cli-tools")}
        />
        <StatCard
          label="Logs"
          value={String(recentErrorCount)}
          hint={
            lastActivityAt
              ? `last activity ${formatAgo(lastActivityAt)}`
              : "no recent activity"
          }
          icon={ScrollTextIcon}
          tone={recentErrorCount > 0 ? "bad" : "neutral"}
          loading={activity.isLoading}
          onClick={() => navigate("/logs")}
        />
        <StatCard
          label="API Keys"
          value={String(activeApiKeyCount)}
          hint={
            lastKeyUsedAt ? `used ${formatAgo(lastKeyUsedAt)}` : "never used"
          }
          icon={KeyRoundIcon}
          loading={apiKeysLoading}
          onClick={goToApiKeys}
        />
      </div>

      {/* ── Usage trend ─────────────────────────────────────────────── */}
      <UsageTrendCard
        buckets={buckets}
        isLoading={trendLoading}
        error={trendError}
        range={range}
        onRangeChange={setRange}
      />
    </div>
  );
}
