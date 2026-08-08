import {
  AlertCircleIcon,
  ListTreeIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { RequestLog, RequestLogSource, RequestLogType } from "@/types/log";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
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
      return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "error":
      return "";
    case "admin":
      return "";
    default:
      return "border-border text-muted-foreground";
  }
}

export function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | RequestLogType>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RequestLogSource>(
    "all",
  );
  const [accountFilter, setAccountFilter] = useState("all");

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<RequestLog[]>("/api/logs?limit=200");
      setLogs(response);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Live updates: refetch whenever the server records a new log entry.
  useEffect(() => {
    const es = new EventSource("/api/events");
    const onLogNew = () => {
      void loadLogs();
    };
    es.addEventListener("log:new", onLogNew);
    return () => {
      es.close();
    };
  }, [loadLogs]);

  async function handleClearLogs() {
    setIsClearing(true);
    try {
      await apiClient.delete("/api/logs");
      setLogs([]);
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
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (typeFilter !== "all" && log.type !== typeFilter) return false;
      if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
      if (accountFilter !== "all" && log.providerAccountId !== accountFilter)
        return false;
      return true;
    });
  }, [logs, typeFilter, sourceFilter, accountFilter]);

  const hasActiveFilters =
    typeFilter !== "all" || sourceFilter !== "all" || accountFilter !== "all";

  function handleResetFilters() {
    setTypeFilter("all");
    setSourceFilter("all");
    setAccountFilter("all");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Incoming requests, provider success/error results, test results, and
            admin actions.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
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
                Clear log
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  All log entries will be permanently deleted from the database.
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
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field>
            <FieldLabel htmlFor="log-type">Type</FieldLabel>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as "all" | RequestLogType)
              }
            >
              <SelectTrigger id="log-type" className="w-full sm:w-44">
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
              <SelectTrigger id="log-source" className="w-full sm:w-44">
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
              <SelectTrigger id="log-account" className="w-full sm:w-56">
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
          <Field>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
            >
              Reset filters
            </Button>
          </Field>
        </FieldGroup>

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

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading logs…
          </div>
        ) : null}

        {!isLoading && !error && filteredLogs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTreeIcon />
              </EmptyMedia>
              <EmptyTitle>No logs yet</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "No entries match the active filters."
                  : "Logs will appear here when requests, tests, or admin actions occur."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!isLoading && !error && filteredLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Provider / Account</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.type === "error" ? "destructive" : "secondary"
                      }
                      className={typeBadgeClass(log.type)}
                    >
                      {typeLabels[log.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sourceLabels[log.source]}
                  </TableCell>
                  <TableCell className="max-w-56">
                    {log.providerName || log.accountLabel ? (
                      <span className="block truncate font-medium">
                        {[log.providerName, log.accountLabel]
                          .filter(Boolean)
                          .join(" — ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.model ? (
                      <code className="text-xs">{log.model}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {log.message ? (
                      <span className="block truncate" title={log.message}>
                        {log.message}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {log.latencyMs != null ? `${log.latencyMs} ms` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {isLoading
          ? "Loading the latest entries…"
          : `Showing ${filteredLogs.length} of ${logs.length} entries (200 latest).`}
      </CardFooter>
    </Card>
  );
}
