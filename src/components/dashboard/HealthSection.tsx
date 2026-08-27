import {
  ArrowUpRightIcon,
  PlusIcon,
  ServerIcon,
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
 * Dashboard alert strip: surfaces only accounts that are benched, failing,
 * expired, or repeatedly backing off, with the raw upstream error message.
 * Renders nothing when the system is healthy — provider/combo counts and
 * a fully-healthy state already live in the summary stat cards, so this
 * section exists purely to demand attention when something is wrong.
 */
export function HealthSection({
  accounts,
  isLoading,
  error,
}: HealthSectionProps) {
  const { navigate } = useRouter();

  // single pass: split accounts into problem rows and healthy ones
  const problems: Array<AccountRow & { kind: ProblemKind }> = [];
  for (const row of accounts) {
    const kind = classify(row.account);
    if (kind) problems.push({ ...row, kind });
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

  if (!error && problems.length === 0) return null;

  const headline = error
    ? "Account health unknown"
    : `${problems.length} account${problems.length > 1 ? "s" : ""} need attention`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-5" />
        </span>
        <div className="min-w-0">
          {/* announced so a status change is picked up by screen readers */}
          <h2 className="font-semibold leading-tight" aria-live="polite">
            {headline}
          </h2>
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
    </div>
  );
}
