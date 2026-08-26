import { RadioIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { LogBadge, typeLabels } from "@/components/logs/LogBadge";
import { LogIdentity } from "@/components/logs/LogIdentity";
import { LogMessage } from "@/components/logs/LogMessage";
import { Badge } from "@/components/ui/badge";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RequestLog } from "@/types/log";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const numberFormatter = new Intl.NumberFormat("en-US");

const sourceLabels: Record<string, string> = {
  router: "Router",
  test: "Test",
  admin: "Admin",
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : timeFormatter.format(date);
}

export function LogsTable({
  filteredLogs,
  totalLogs,
  lastUpdated,
  liveAnnouncement,
  onOpenLog,
  onLogKeyDown,
}: {
  filteredLogs: RequestLog[];
  totalLogs: number;
  lastUpdated: Date | null;
  liveAnnouncement: string;
  onOpenLog: (log: RequestLog) => void;
  onLogKeyDown: (event: KeyboardEvent, log: RequestLog) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/15 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <RadioIcon className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-mono text-sm font-medium">
              Latest entries
            </CardTitle>
            <CardDescription className="truncate">
              Showing {numberFormatter.format(filteredLogs.length)} of{" "}
              {numberFormatter.format(totalLogs)} latest entries.
            </CardDescription>
          </div>
        </div>
        <Badge
          variant="outline"
          className="hidden shrink-0 font-mono text-[10px] sm:inline-flex"
        >
          LIMIT 200
        </Badge>
      </CardHeader>
      <CardContent className="scrollbar-subtle min-h-0 flex-1 overflow-auto p-0">
        <div aria-live="polite" className="sr-only">
          {liveAnnouncement}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/20 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted/20 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/95">
                <TableHead className="pl-5">Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Provider / account</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="pr-5 text-right">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow
                  key={log.id}
                  onClick={() => void onOpenLog(log)}
                  onKeyDown={(event) => onLogKeyDown(event, log)}
                  tabIndex={
                    log.type === "request" || log.type === "success"
                      ? 0
                      : undefined
                  }
                  role={
                    log.type === "request" || log.type === "success"
                      ? "button"
                      : undefined
                  }
                  aria-label={
                    log.type === "request" || log.type === "success"
                      ? `Open ${typeLabels[log.type]} details ${log.model ?? ""}`
                      : undefined
                  }
                  className={`motion-safe:animate-trace-in border-b border-border/50 font-mono text-[11px] transition-colors hover:bg-muted/30 ${log.type === "error" ? "bg-destructive/[0.025]" : ""} ${log.type === "request" || log.type === "success" ? "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""}`}
                >
                  <TableCell className="whitespace-nowrap pl-5 align-top">
                    <time
                      dateTime={log.timestamp}
                      title={formatTimestamp(log.timestamp)}
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                    >
                      {formatTime(log.timestamp)}
                    </time>
                  </TableCell>
                  <TableCell className="align-top">
                    <LogBadge type={log.type} />
                  </TableCell>
                  <TableCell className="align-top font-mono text-xs text-muted-foreground">
                    {sourceLabels[log.source]}
                  </TableCell>
                  <TableCell className="max-w-44 align-top">
                    <LogIdentity log={log} />
                  </TableCell>
                  <TableCell className="max-w-40 align-top">
                    {log.model ? (
                      <code
                        className="block truncate rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 text-xs"
                        title={log.model}
                      >
                        {log.model}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-72 align-top">
                    <LogMessage log={log} />
                  </TableCell>
                  <TableCell className="pr-5 text-right align-top">
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                      {log.latencyMs == null ? "—" : `${log.latencyMs} ms`}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y md:hidden">
          {filteredLogs.map((log) => (
            <article
              key={log.id}
              onClick={
                log.type === "request" || log.type === "success"
                  ? () => void onOpenLog(log)
                  : undefined
              }
              onKeyDown={
                log.type === "request" || log.type === "success"
                  ? (event) => onLogKeyDown(event, log)
                  : undefined
              }
              tabIndex={
                log.type === "request" || log.type === "success" ? 0 : undefined
              }
              role={
                log.type === "request" || log.type === "success"
                  ? "button"
                  : undefined
              }
              aria-label={
                log.type === "request" || log.type === "success"
                  ? `Open ${typeLabels[log.type]} details ${log.model ?? ""}`
                  : undefined
              }
              className={`motion-safe:animate-trace-in space-y-3 p-4 transition-colors ${log.type === "error" ? "bg-destructive/[0.025]" : ""} ${log.type === "request" || log.type === "success" ? "cursor-pointer hover:bg-muted/20 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <time
                  dateTime={log.timestamp}
                  className="pt-1 font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {formatTimestamp(log.timestamp)}
                </time>
                <LogBadge type={log.type} />
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                  <RadioIcon className="size-3.5" />
                </span>
                <LogIdentity log={log} />
              </div>
              {log.model ? (
                <code
                  className="block truncate rounded-md bg-muted/60 px-2 py-1.5 text-xs"
                  title={log.model}
                >
                  {log.model}
                </code>
              ) : null}
              <div className="rounded-lg border bg-muted/15 px-3 py-2">
                <LogMessage log={log} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{sourceLabels[log.source]}</span>
                <span aria-hidden>·</span>
                <span className="font-mono tabular-nums">
                  {log.latencyMs == null ? "—" : `${log.latencyMs} ms`}
                </span>
                {log.stream ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>streaming</span>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-t bg-muted/10 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        <span className="truncate">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString("en-US")}`
            : "Waiting for updates..."}
        </span>
      </CardFooter>
    </div>
  );
}
