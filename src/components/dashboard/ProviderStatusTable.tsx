import { ArrowUpRightIcon, BoxesIcon } from "lucide-react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useRouter } from "@/hooks/useRouter";
import { useTicker } from "@/hooks/useTicker";
import { cooldownRemainingSeconds, numFmt } from "@/lib/dashboard-format";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type {
  AccountStatus,
  Provider,
  ProviderAccount,
} from "@/types/provider";

interface ProviderStatusTableProps {
  rows: Array<{ account: ProviderAccount; provider: Provider }>;
  usageByAccount: Map<string, { requestCount: number; tokens: number }>;
  /** Percent of the router-side token budget used, per account id. */
  quotaByAccount: Map<string, number>;
  isLoading: boolean;
  error: string | null;
}

const statusLed: Record<AccountStatus, { dot: string; label: string }> = {
  active: {
    dot: "bg-chart-3 shadow-[0_0_6px_var(--tw-shadow-color)] shadow-chart-3/70",
    label: "Active",
  },
  error: {
    dot: "bg-destructive shadow-[0_0_6px_var(--tw-shadow-color)] shadow-destructive/70",
    label: "Error",
  },
  expired: { dot: "bg-muted-foreground/50", label: "Expired" },
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

/**
 * Router-side token budget for an account. Three distinct states matter and
 * were previously collapsed into one: no limit configured, a limit that the
 * router can't currently measure against (only kiro / command-code / qoder
 * report usage), and a limit with a known consumption figure.
 */
function QuotaCell({
  limit,
  pct,
}: {
  limit: number | null;
  pct: number | undefined;
}) {
  if (limit === null || limit <= 0) {
    return <span className="text-xs text-muted-foreground">Unlimited</span>;
  }
  if (pct === undefined) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={`Limit of ${numFmt.format(limit)} tokens is set, but this transport does not report usage`}
      >
        {compact(limit)} cap · usage n/a
      </span>
    );
  }
  const tone =
    pct >= 90
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : pct >= 70
        ? "[&_[data-slot=progress-indicator]]:bg-chart-4"
        : "[&_[data-slot=progress-indicator]]:bg-primary";
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className={cn("h-1.5 flex-1", tone)} />
      <span
        className={cn(
          "w-9 shrink-0 text-right font-mono text-xs",
          pct >= 90
            ? "text-destructive"
            : pct >= 70
              ? "text-chart-4"
              : "text-muted-foreground",
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_v, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
        <TableRow key={`ps-skeleton-${i}`}>
          <TableCell>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-10" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-14" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Per-account status, throughput, and quota, across every transport. */
export function ProviderStatusTable({
  rows,
  usageByAccount,
  quotaByAccount,
  isLoading,
  error,
}: ProviderStatusTableProps) {
  const { navigate } = useRouter();

  // keep COOLDOWN countdowns ticking while any account is benched
  const anyCooling = rows.some(
    (r) => cooldownRemainingSeconds(r.account.cooldownUntil) > 0,
  );
  useTicker(anyCooling);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 font-semibold">
          <BoxesIcon className="size-4 shrink-0 text-muted-foreground" />
          Provider Connection Status
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate("/providers")}
        >
          Providers <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>

      {error ? (
        <p className="mx-5 mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Provider accounts could not be loaded — {error}
        </p>
      ) : null}

      {!isLoading && rows.length === 0 && !error ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No provider accounts configured yet
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Account</TableHead>
              <TableHead className="w-[18%]">Transport</TableHead>
              <TableHead className="w-[12%]">Status</TableHead>
              <TableHead className="w-[12%] text-right">Requests</TableHead>
              <TableHead className="w-[15%] text-right">Tokens Used</TableHead>
              <TableHead className="w-[15%]">Quota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="font-mono">
            {isLoading && rows.length === 0 ? (
              <SkeletonRows />
            ) : (
              rows.map(({ account, provider }) => {
                const meta = transportMeta[provider.transport];
                const usage = usageByAccount.get(account.id);
                const quotaPct = quotaByAccount.get(account.id);
                const seconds = cooldownRemainingSeconds(account.cooldownUntil);
                return (
                  <TableRow key={account.id}>
                    <TableCell className="max-w-0 font-mono text-[13px]">
                      <div className="flex min-w-0 flex-col">
                        <Truncated
                          text={account.label}
                          detail={provider.name}
                        />
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {provider.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "max-w-full font-normal",
                          meta.accentClassName,
                        )}
                      >
                        <span className="truncate">{meta.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusLed status={account.status} />
                        {seconds > 0 ? (
                          <span className="rounded bg-chart-4/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-chart-4">
                            COOLDOWN · {seconds}s
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {numFmt.format(usage?.requestCount ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {numFmt.format(usage?.tokens ?? 0)}
                    </TableCell>
                    <TableCell>
                      <QuotaCell
                        limit={account.quotaLimitTokens}
                        pct={quotaPct}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
