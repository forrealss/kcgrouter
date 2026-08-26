import { ActivityIcon, ArrowUpRightIcon } from "lucide-react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Button } from "@/components/ui/button";
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
import { numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { RequestLog } from "@/types/log";

interface LiveActivityCardProps {
  logs: RequestLog[];
  isLoading: boolean;
  error: string | null;
  /** Ids that arrived since the last refresh, animated on entry. */
  freshIds: ReadonlySet<string>;
  /** Fixed height in px so it lines up with the network graph beside it. */
  height: number;
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function LogRow({ log, isFresh }: { log: RequestLog; isFresh: boolean }) {
  const isError = log.type === "error";
  return (
    <TableRow
      className={cn(
        isError && "bg-destructive/5",
        isFresh && "motion-safe:animate-trace-in",
      )}
    >
      <TableCell className="whitespace-nowrap font-mono text-xs align-top">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isError ? "bg-destructive" : "bg-chart-3",
            )}
          />
          {timeFmt.format(new Date(log.timestamp))}
        </span>
      </TableCell>
      <TableCell className="max-w-0 font-mono text-xs align-top">
        <Truncated text={log.model ?? "—"} />
        {isError && log.message ? (
          // errors are the actionable rows, so let the message wrap to a
          // couple of lines instead of clipping it to a single ellipsis
          <div className="mt-1 line-clamp-2 rounded-md bg-destructive/10 px-2 py-1 font-mono text-[11px] leading-relaxed break-words text-destructive">
            {log.message}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="hidden max-w-0 font-mono text-xs text-muted-foreground align-top md:table-cell">
        <Truncated text={log.accountLabel ?? "—"} />
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-mono text-xs align-top tabular-nums",
          (log.latencyMs ?? 0) > 5000 && "text-chart-4",
        )}
      >
        {log.latencyMs != null ? `${numFmt.format(log.latencyMs)}ms` : "—"}
      </TableCell>
      <TableCell
        className={cn(
          "hidden text-right font-mono text-xs align-top tabular-nums sm:table-cell",
          log.retries ? "text-chart-4" : "text-muted-foreground",
        )}
      >
        {log.retries || "—"}
      </TableCell>
    </TableRow>
  );
}

/**
 * Recent activity feed sourced from the request log rather than usage
 * history, so errors and retry counts are visible alongside successes.
 * Retention is bounded to roughly the last 2000 rows on the server.
 */
export function LiveActivityCard({
  logs,
  isLoading,
  error,
  freshIds,
  height,
}: LiveActivityCardProps) {
  const { navigate } = useRouter();

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
      style={{ height }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <ActivityIcon className="size-4 shrink-0" />
            Live activity
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-chart-3" />
          </h2>
          <p className="text-xs text-muted-foreground">
            Completed requests · last ~2000 log rows retained
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate("/logs")}
        >
          Logs <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
        {error && logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-destructive">
            Activity feed unavailable — {error}
          </p>
        ) : isLoading && logs.length === 0 ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 6 }).map((_v, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <Skeleton key={`la-skeleton-${i}`} className="h-4 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No requests yet. Point a client at the gateway to see traffic here.
          </p>
        ) : (
          <>
            {error ? (
              <p className="border-b border-chart-4/20 bg-chart-4/5 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-chart-4">
                Showing last known activity — refresh failed
              </p>
            ) : null}
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-[22%]">Time</TableHead>
                  <TableHead className="w-[34%]">Model</TableHead>
                  <TableHead className="hidden w-[24%] md:table-cell">
                    Account
                  </TableHead>
                  <TableHead className="w-[12%] text-right">Latency</TableHead>
                  <TableHead className="hidden w-[8%] text-right sm:table-cell">
                    Retries
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isFresh={freshIds.has(log.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
