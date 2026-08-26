import { ListTreeIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import type { ConnectionStatus } from "@/types/log";

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
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="mb-1 flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Telemetry / activity
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <ListTreeIcon className="size-4" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">Activity Log</h2>
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
                  ? "animate-pulse bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                  : connectionStatus === "connecting"
                    ? "animate-pulse bg-amber-500 shadow-[0_0_6px] shadow-amber-500/60"
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
        <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm">
          Requests, provider results, and admin events.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
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
              size="sm"
              disabled={isClearing || logsCount === 0}
            >
              <Trash2Icon data-icon="inline-start" />
              Clear logs
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
              <AlertDialogDescription>
                All entries will be permanently deleted.
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
