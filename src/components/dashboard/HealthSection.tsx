import {
  ArrowUpRightIcon,
  PlusIcon,
  ServerIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/hooks/useRouter";
import { useTicker } from "@/hooks/useTicker";
import { cooldownRemainingSeconds, formatAgo } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

export interface AccountRow {
  account: ProviderAccount;
  provider: Provider;
}

interface HealthSectionProps {
  accounts: AccountRow[];
  isLoading: boolean;
  error: string | null;
  providerCount: number;
  comboCount: number;
}

type ProblemKind = "benched" | "erroring" | "expired" | "degrading";

function classify(account: ProviderAccount): ProblemKind | null {
  if (account.status === "expired") return "expired";
  if (account.status === "error") {
    return cooldownRemainingSeconds(account.cooldownUntil) > 0
      ? "benched"
      : "erroring";
  }
  if (account.status === "active" && account.backoffLevel > 0) {
    return "degrading";
  }
  return null;
}

const problemMeta: Record<
  ProblemKind,
  { label: string; tone: string; dot: string; severe: boolean }
> = {
  benched: {
    label: "cooling down",
    tone: "border-chart-4/40 bg-chart-4/10 text-chart-4",
    dot: "bg-chart-4",
    severe: false,
  },
  erroring: {
    label: "failing",
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    severe: true,
  },
  expired: {
    label: "expired — needs action",
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    severe: true,
  },
  degrading: {
    label: "repeated failures",
    tone: "border-chart-4/40 bg-chart-4/10 text-chart-4",
    dot: "bg-chart-4",
    severe: false,
  },
};

function ProblemRow({ row }: { row: AccountRow & { kind: ProblemKind } }) {
  const meta = problemMeta[row.kind];
  const seconds = cooldownRemainingSeconds(row.account.cooldownUntil);
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-l-2 px-5 py-4 md:flex-row md:items-start",
        meta.severe ? "border-l-destructive" : "border-l-chart-4",
      )}
    >
      <div className="min-w-0 shrink-0 md:w-56">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
          <Truncated
            text={row.account.label}
            detail={`${row.provider.name} · ${row.provider.transport}`}
            className="font-mono text-sm font-medium"
          />
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {row.provider.name} ·{" "}
          <span className="font-mono">{row.provider.transport}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={cn("font-normal", meta.tone)}>
            {meta.label}
          </Badge>
          {row.account.backoffLevel > 0 ? (
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              backoff L{row.account.backoffLevel}/8
            </span>
          ) : null}
          {seconds > 0 ? (
            <span className="font-mono text-[11px] text-chart-4 tabular-nums">
              recovers in {seconds}s
            </span>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground">
            last error {formatAgo(row.account.lastErrorAt)}
          </span>
        </div>
        {row.account.lastError ? (
          // wraps to at most three lines — the raw upstream message is the
          // most actionable thing here, so it shouldn't be clipped to one line
          <p className="mt-2 line-clamp-3 rounded-md bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed break-words text-foreground/90">
            {row.account.lastError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Health-first headline for the dashboard: surfaces every account that is
 * benched, failing, expired, or repeatedly backing off, with the raw
 * upstream error message. Accounts with no issues collapse into a single
 * quiet strip so a fully healthy system doesn't compete for attention.
 */
export function HealthSection({
  accounts,
  isLoading,
  error,
  providerCount,
  comboCount,
}: HealthSectionProps) {
  const { navigate } = useRouter();

  // single pass: split accounts into problem rows and healthy ones
  const problems: Array<AccountRow & { kind: ProblemKind }> = [];
  const healthy: AccountRow[] = [];
  for (const row of accounts) {
    const kind = classify(row.account);
    if (kind) problems.push({ ...row, kind });
    else healthy.push(row);
  }

  // countdowns in the problem rows need a per-second re-render
  useTicker(problems.some((p) => p.kind === "benched"));

  if (!isLoading && !error && accounts.length === 0) {
    return (
      <Empty className="min-h-56 rounded-xl border border-dashed bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>No providers yet</EmptyTitle>
          <EmptyDescription>
            Add a provider account, then group accounts into a combo so the
            router has somewhere to send requests.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate("/providers")}>
            <PlusIcon data-icon="inline-start" />
            Add a provider
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const ok = problems.length === 0;
  const headline = isLoading
    ? "Checking account health…"
    : error
      ? "Account health unknown"
      : ok
        ? "All accounts healthy"
        : `${problems.length} account${problems.length > 1 ? "s" : ""} need attention`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            error || !ok
              ? "bg-destructive/10 text-destructive"
              : "bg-chart-3/15 text-chart-3",
          )}
        >
          {error || !ok ? (
            <TriangleAlertIcon className="size-5" />
          ) : (
            <ShieldCheckIcon className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          {/* announced so a status change is picked up by screen readers */}
          <h2 className="font-semibold leading-tight" aria-live="polite">
            {headline}
          </h2>
          {isLoading && accounts.length === 0 ? (
            <Skeleton className="mt-1 h-3 w-48" />
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              {healthy.length}/{accounts.length} active · {providerCount}{" "}
              providers · {comboCount} combos
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => navigate("/providers")}
        >
          Providers <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>

      {error ? (
        <p className="border-b border-border px-5 py-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {problems.length > 0 ? (
        <div className="divide-y divide-border">
          {problems.map((row) => (
            <ProblemRow key={row.account.id} row={row} />
          ))}
        </div>
      ) : null}

      {accounts.length > 0 ? (
        <div
          className={cn(
            "px-5 py-3",
            problems.length > 0 && "border-t border-border",
          )}
        >
          <span className="text-xs text-muted-foreground">Healthy</span>
          {healthy.length === 0 ? (
            <span className="ml-2 text-xs text-muted-foreground">none</span>
          ) : (
            // fixed-width grid cells so every chip is the same size regardless
            // of how long the account label is; long names truncate
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
              {healthy.map((row) => (
                <span
                  key={row.account.id}
                  className="flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border px-2.5 font-mono text-xs"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-chart-3" />
                  <Truncated
                    text={row.account.label}
                    detail={`${row.provider.name} · last used ${formatAgo(row.account.lastUsedAt)}`}
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
