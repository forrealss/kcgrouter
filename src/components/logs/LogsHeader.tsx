import { RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/types/log";

const connectionMeta: Record<
  ConnectionStatus,
  { label: string; dot: string; text: string }
> = {
  live: {
    label: "Live",
    dot: "animate-pulse bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  connecting: {
    label: "Connecting",
    dot: "animate-pulse bg-amber-500 shadow-[0_0_6px] shadow-amber-500/60",
    text: "text-amber-600 dark:text-amber-400",
  },
  offline: {
    label: "Offline",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

export function LogsHeader({
  connectionStatus,
  isLoading,
  isClearing,
  logsCount,
  onRefresh,
  onClearLogs,
}: {
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  isClearing: boolean;
  logsCount: number;
  onRefresh: () => void;
  onClearLogs: () => void;
}) {
  const connection = connectionMeta[connectionStatus];

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">
          Requests, provider results, and admin events.
        </p>
        {/*
          The stream is push-based, so whether the SSE connection is up decides
          if this page is telling the truth. Kept inline with the description
          rather than as a metric — it is a connection state, not a count.
        */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
            connection.text,
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", connection.dot)}
            aria-hidden
          />
          {connection.label}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {isLoading ? "Refreshing" : "Refresh"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={isClearing || logsCount === 0}
              className="text-muted-foreground hover:text-destructive"
            >
              {isClearing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              Clear logs
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
              <AlertDialogDescription>
                All {logsCount} retained entries will be permanently deleted.
                This does not affect usage history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={onClearLogs}
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
  );
}
