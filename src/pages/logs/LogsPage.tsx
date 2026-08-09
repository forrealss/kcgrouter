import {
  ActivityIcon,
  AlertCircleIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  CopyIcon,
  FilterIcon,
  ListTreeIcon,
  RadioIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { RequestLog, RequestLogSource, RequestLogType } from "@/types/log";

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
const skeletonColumns = [
  "column-1",
  "column-2",
  "column-3",
  "column-4",
  "column-5",
  "column-6",
  "column-7",
];
const skeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

function formatPayload(payload: string | null | undefined): string {
  if (!payload) return "Payload is not available for this entry.";
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

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

const typeLabels: Record<RequestLogType, string> = {
  request: "Request",
  success: "Success",
  error: "Error",
  admin: "Admin",
};

const sourceLabels: Record<RequestLogSource, string> = {
  router: "Router",
  test: "Test",
  admin: "Admin",
};

function typeBadgeClass(type: RequestLogType): string {
  switch (type) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "error":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "admin":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function TypeIcon({ type }: { type: RequestLogType }) {
  if (type === "success") return <CircleCheckIcon className="size-3" />;
  if (type === "error") return <CircleXIcon className="size-3" />;
  return <ActivityIcon className="size-3" />;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof ActivityIcon;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums tracking-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

function LogBadge({ type }: { type: RequestLogType }) {
  return (
    <Badge variant="outline" className={`gap-1 ${typeBadgeClass(type)}`}>
      <TypeIcon type={type} />
      {typeLabels[type]}
    </Badge>
  );
}

function LogIdentity({ log }: { log: RequestLog }) {
  return (
    <div className="min-w-0">
      {log.providerName ? (
        <p className="truncate font-medium">{log.providerName}</p>
      ) : null}
      {log.accountLabel ? (
        <p className="truncate text-xs text-muted-foreground">
          {log.accountLabel}
        </p>
      ) : !log.providerName ? (
        <span className="text-muted-foreground">—</span>
      ) : null}
    </div>
  );
}

function LogMessage({ log }: { log: RequestLog }) {
  return log.message ? (
    <span
      className="block line-clamp-2 text-sm leading-relaxed"
      title={log.message}
    >
      {log.message}
    </span>
  ) : (
    <span className="text-muted-foreground">No message</span>
  );
}

function CopyPayloadButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => void handleCopy()}
      aria-label="Copy payload"
      title="Copy payload"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

function LogsSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      role="status"
      aria-label="Loading logs"
    >
      <div className="hidden gap-4 border-b bg-muted/30 px-4 py-3 md:grid md:grid-cols-[1.25fr_0.7fr_0.7fr_1.4fr_1.2fr_1.8fr_0.65fr]">
        {skeletonColumns.map((column) => (
          <Skeleton key={column} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y">
        {skeletonRows.map((row) => (
          <div
            key={row}
            className="grid gap-3 p-4 md:grid-cols-[1.25fr_0.7fr_0.7fr_1.4fr_1.2fr_1.8fr_0.65fr] md:items-center"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="ml-auto h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "offline"
  >("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const loadRequestId = useRef(0);
  const [typeFilter, setTypeFilter] = useState<"all" | RequestLogType>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RequestLogSource>(
    "all",
  );
  const [accountFilter, setAccountFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);
  const [payloads, setPayloads] = useState<{
    requestBody: string | null;
    responseBody: string | null;
  } | null>(null);
  const [isPayloadLoading, setIsPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [payloadPending, setPayloadPending] = useState(false);
  const payloadRequestId = useRef(0);

  const loadLogs = useCallback(async (showLoading = true) => {
    const requestId = ++loadRequestId.current;
    if (showLoading) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const response = await apiClient.get<RequestLog[]>("/api/logs?limit=200");
      if (requestId !== loadRequestId.current) return;
      setLogs(response);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (requestId === loadRequestId.current && showLoading) {
        setError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === loadRequestId.current && showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");
    const onLogNew = () => {
      setLiveAnnouncement(
        `New log entry received at ${new Date().toLocaleTimeString("en-US")}.`,
      );
      void loadLogs(false);
    };

    setConnectionStatus("connecting");
    eventSource.addEventListener("log:new", onLogNew);
    eventSource.onopen = () => setConnectionStatus("live");
    eventSource.onerror = () => setConnectionStatus("offline");

    return () => {
      eventSource.close();
    };
  }, [loadLogs]);

  async function handleOpenLog(log: RequestLog) {
    if (log.type !== "request" && log.type !== "success") return;

    const requestId = ++payloadRequestId.current;
    setSelectedLog(log);
    setPayloads(null);
    setPayloadError(null);
    setPayloadPending(false);
    setIsPayloadLoading(true);
    try {
      const response = await apiClient.get<{
        requestBody: string | null;
        responseBody: string | null;
      }>(`/api/logs/${encodeURIComponent(log.id)}/payloads`);
      if (requestId === payloadRequestId.current) {
        setPayloads(response);
        setPayloadPending(!response.requestBody && !response.responseBody);
      }
    } catch (requestError) {
      if (requestId === payloadRequestId.current) {
        setPayloadError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === payloadRequestId.current) setIsPayloadLoading(false);
    }
  }

  function handleLogKeyDown(event: KeyboardEvent, log: RequestLog) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void handleOpenLog(log);
    }
  }

  async function handleClearLogs() {
    setIsClearing(true);
    try {
      await apiClient.delete("/api/logs");
      setLogs([]);
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsClearing(false);
    }
  }

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const log of logs) {
      if (log.providerAccountId && log.accountLabel) {
        seen.set(log.providerAccountId, log.accountLabel);
      }
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (typeFilter !== "all" && log.type !== typeFilter) return false;
      if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
      if (accountFilter !== "all" && log.providerAccountId !== accountFilter)
        return false;
      if (
        query &&
        ![
          log.message,
          log.model,
          log.providerName,
          log.accountLabel,
          sourceLabels[log.source],
          typeLabels[log.type],
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [logs, typeFilter, sourceFilter, accountFilter, searchQuery]);

  const stats = useMemo(() => {
    const latencyValues = logs.flatMap((log) =>
      log.latencyMs == null ? [] : [log.latencyMs],
    );
    return {
      errors: logs.filter((log) => log.type === "error").length,
      successes: logs.filter((log) => log.type === "success").length,
      averageLatency: latencyValues.length
        ? Math.round(
            latencyValues.reduce((sum, value) => sum + value, 0) /
              latencyValues.length,
          )
        : null,
    };
  }, [logs]);

  const hasActiveFilters =
    typeFilter !== "all" ||
    sourceFilter !== "all" ||
    accountFilter !== "all" ||
    searchQuery.trim() !== "";

  function handleResetFilters() {
    setTypeFilter("all");
    setSourceFilter("all");
    setAccountFilter("all");
    setSearchQuery("");
  }

  return (
    <section className="flex flex-col gap-5 pb-4">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl border bg-card text-primary shadow-xs">
              <ListTreeIcon className="size-4" />
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">
              Activity log
            </h2>
            <Badge
              variant="outline"
              className={`gap-1.5 font-mono text-[10px] uppercase tracking-wider ${
                connectionStatus === "live"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : connectionStatus === "connecting"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  connectionStatus === "live"
                    ? "animate-pulse bg-emerald-500"
                    : connectionStatus === "connecting"
                      ? "animate-pulse bg-amber-500"
                      : "bg-muted-foreground/50"
                }`}
              />
              {connectionStatus === "live"
                ? "Live"
                : connectionStatus === "connecting"
                  ? "Connecting"
                  : "Offline"}
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Monitor requests, provider results, connection tests, and admin
            activity in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadLogs()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isClearing || logs.length === 0}
              >
                <Trash2Icon data-icon="inline-start" />
                Clear logs
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  All log entries will be permanently deleted from the database
                  and cannot be recovered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void handleClearLogs()}
                  disabled={isClearing}
                >
                  {isClearing ? <Spinner data-icon="inline-start" /> : null}
                  Clear logs
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardContent className="grid gap-px bg-border/60 p-0 sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card">
          <StatCard
            label="Total entries"
            value={numberFormatter.format(logs.length)}
            icon={ListTreeIcon}
            tone="bg-primary/10 text-primary"
          />
          <StatCard
            label="Successful"
            value={numberFormatter.format(stats.successes)}
            icon={CircleCheckIcon}
            tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label="Error"
            value={numberFormatter.format(stats.errors)}
            icon={CircleXIcon}
            tone="bg-destructive/10 text-destructive"
          />
          <StatCard
            label="Average latency"
            value={
              stats.averageLatency == null ? "—" : `${stats.averageLatency} ms`
            }
            icon={Clock3Icon}
            tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="gap-1 border-b bg-muted/15 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <FilterIcon className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Activity filters</CardTitle>
            {hasActiveFilters ? (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                Active
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Narrow the list by status, source, account, or keyword.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-4 sm:px-6">
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(140px,1fr))_auto]">
            <Field>
              <FieldLabel htmlFor="log-search">Search</FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="log-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Model, provider, message..."
                  className="pr-9 pl-9"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-type">Type</FieldLabel>
              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as "all" | RequestLogType)
                }
              >
                <SelectTrigger id="log-type" className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="request">Request</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-source">Source</FieldLabel>
              <Select
                value={sourceFilter}
                onValueChange={(value) =>
                  setSourceFilter(value as "all" | RequestLogSource)
                }
              >
                <SelectTrigger id="log-source" className="w-full">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="router">Router</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-account">Account</FieldLabel>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger id="log-account" className="w-full">
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accountOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                className="w-full sm:w-auto"
              >
                Reset
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Logs could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadLogs()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? <LogsSkeleton /> : null}

      {!isLoading && !error && filteredLogs.length === 0 ? (
        <Empty className="min-h-64 border border-dashed bg-card shadow-sm">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasActiveFilters ? <SearchIcon /> : <ListTreeIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {hasActiveFilters ? "No matching results" : "No activity yet"}
            </EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try changing the keyword or resetting the filters to see other entries."
                : "Logs will appear automatically when requests, tests, or admin activity occur."}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters ? (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetFilters}
              >
                <XIcon data-icon="inline-start" />
                Reset all filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {!isLoading && !error && filteredLogs.length > 0 ? (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/15 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <RadioIcon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <CardTitle className="text-base">Latest entries</CardTitle>
                <CardDescription className="truncate">
                  Showing {numberFormatter.format(filteredLogs.length)} of{" "}
                  {numberFormatter.format(logs.length)} latest entries.
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
          <CardContent className="p-0">
            <div aria-live="polite" className="sr-only">
              {liveAnnouncement}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
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
                      onClick={() => void handleOpenLog(log)}
                      onKeyDown={(event) => handleLogKeyDown(event, log)}
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
                      className={`motion-safe:animate-trace-in ${log.type === "error" ? "bg-destructive/[0.025]" : ""} ${log.type === "request" || log.type === "success" ? "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""}`}
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
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {sourceLabels[log.source]}
                      </TableCell>
                      <TableCell className="max-w-44 align-top">
                        <LogIdentity log={log} />
                      </TableCell>
                      <TableCell className="max-w-40 align-top">
                        {log.model ? (
                          <code
                            className="block truncate rounded bg-muted/60 px-1.5 py-0.5 text-xs"
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

            <div className="divide-y md:hidden">
              {filteredLogs.map((log) => (
                <article
                  key={log.id}
                  onClick={() => void handleOpenLog(log)}
                  onKeyDown={(event) => handleLogKeyDown(event, log)}
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
                  className={`motion-safe:animate-trace-in space-y-3 p-4 transition-colors hover:bg-muted/20 ${log.type === "error" ? "bg-destructive/[0.025]" : ""} ${log.type === "request" || log.type === "success" ? "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""}`}
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
                      <ServerIcon className="size-3.5" />
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
            <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <span
                className={`size-1.5 rounded-full ${
                  connectionStatus === "live"
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/50"
                }`}
              />
              {connectionStatus === "live"
                ? "Live sync active"
                : connectionStatus === "connecting"
                  ? "Connecting to live logs"
                  : "Sync disconnected"}
            </span>
          </CardFooter>
        </Card>
      ) : null}

      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) {
            payloadRequestId.current += 1;
            setSelectedLog(null);
            setPayloadPending(false);
            setIsPayloadLoading(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog ? typeLabels[selectedLog.type] : "Log"} detail
              {selectedLog ? <LogBadge type={selectedLog.type} /> : null}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>
                {selectedLog ? formatTimestamp(selectedLog.timestamp) : ""}
              </span>
              <span aria-hidden>·</span>
              <span>{selectedLog ? sourceLabels[selectedLog.source] : ""}</span>
              {selectedLog?.model ? (
                <>
                  <span aria-hidden>·</span>
                  <code>{selectedLog.model}</code>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Payloads may contain prompts, code, or sensitive data. Only view
            them from a trusted dashboard.
          </p>

          {isPayloadLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading payload...
            </div>
          ) : payloadError ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Payload details could not be loaded</AlertTitle>
              <AlertDescription>{payloadError}</AlertDescription>
            </Alert>
          ) : (
            <>
              {payloadPending ? (
                <Alert>
                  <Clock3Icon />
                  <AlertTitle>Payload not available yet</AlertTitle>
                  <AlertDescription>
                    This request log was just created. The payload will be
                    available after processing finishes. Older logs may not have
                    payloads because they were created before this feature was
                    enabled.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Tabs defaultValue="request" className="min-h-0 flex-1">
                <TabsList className="w-full sm:w-fit">
                  <TabsTrigger value="request" className="flex-1 sm:flex-none">
                    Request payload
                  </TabsTrigger>
                  <TabsTrigger value="response" className="flex-1 sm:flex-none">
                    Response
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="request" className="mt-3 min-h-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Payload received by the router
                    </span>
                    <CopyPayloadButton
                      value={formatPayload(payloads?.requestBody)}
                    />
                  </div>
                  <pre className="mt-2 max-h-[55vh] overflow-auto rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                    {formatPayload(payloads?.requestBody)}
                  </pre>
                </TabsContent>
                <TabsContent value="response" className="mt-3 min-h-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Returned response
                    </span>
                    <CopyPayloadButton
                      value={formatPayload(payloads?.responseBody)}
                    />
                  </div>
                  <pre className="mt-2 max-h-[55vh] overflow-auto rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                    {formatPayload(payloads?.responseBody)}
                  </pre>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
