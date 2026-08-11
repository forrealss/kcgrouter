import { ArrowUpRightIcon, CableIcon, TagIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
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
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiClient } from "@/lib/api-client";
import type { AccountErrorSummary } from "@/lib/provider-errors";
import { formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

interface ProviderCardProps {
  provider: Provider;
  accounts: ProviderAccount[];
  onClick?: () => void;
  onDelete?: () => void | Promise<void>;
  lastError?: AccountErrorSummary | null;
}

export function ProviderCard({
  provider,
  accounts,
  onClick,
  onDelete,
  lastError,
}: ProviderCardProps) {
  const meta = transportMeta[provider.transport];
  const [isDeleting, setIsDeleting] = useState(false);
  const hasError = accounts.some((account) => account.status === "error");
  const hasActive = accounts.some((account) => account.status === "active");
  const hasExpired =
    accounts.length > 0 &&
    accounts.every((account) => account.status === "expired");
  const statusLabel = hasError
    ? "attention required"
    : hasActive
      ? "ready"
      : hasExpired
        ? "expired"
        : "no connections";
  const statusDot = hasError
    ? "bg-destructive shadow-[0_0_6px] shadow-destructive/70"
    : hasActive
      ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
      : "bg-muted-foreground/50";

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiClient.delete(
        `/api/providers/${encodeURIComponent(provider.id)}`,
      );
      await onDelete?.();
    } catch {
      // The parent refresh exposes the error state when available.
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card
      className={cn(
        "group gap-0 overflow-hidden border-border/80 bg-card py-0 shadow-sm transition-[border-color,box-shadow,background-color] duration-150 dark:border-border/80 dark:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)]",
        onClick &&
          "cursor-pointer hover:border-primary/40 hover:bg-accent/30 dark:hover:shadow-[0_0_24px_-18px] dark:hover:shadow-primary",
        hasError && "border-destructive/40",
      )}
      onClick={onClick}
    >
      <CardHeader className="flex min-h-0 flex-row items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-3 dark:bg-muted/40">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm dark:shadow-[0_0_14px_-5px] dark:shadow-current",
            meta.accentClassName,
          )}
          aria-hidden
        >
          {meta.icon ? (
            <img src={meta.icon} alt="" className="size-6" />
          ) : (
            <meta.fallbackIcon className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{provider.name}</CardTitle>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground/90">
            {provider.isBuiltin ? "built-in" : "custom upstream"}
          </p>
        </div>
        {!provider.isBuiltin && onDelete ? (
          <CardAction className="flex items-center gap-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={isDeleting}
                  onClick={(event) => event.stopPropagation()}
                >
                  {isDeleting ? (
                    <Spinner className="size-3" />
                  ) : (
                    <TrashIcon className="size-3" />
                  )}
                  <span className="sr-only">Delete provider</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(event) => event.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {provider.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All connections and credentials will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 px-3 py-3">
        <TooltipProvider>
          <div className="flex items-center gap-4 font-mono">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Connections: ${provider.accountCount}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <CableIcon
                    className="size-4 shrink-0 text-muted-foreground/90"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm tabular-nums text-foreground">
                    {provider.accountCount}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Connections</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Model prefix: ${provider.prefix}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <TagIcon
                    className="size-4 shrink-0 text-muted-foreground/90"
                    aria-hidden="true"
                  />
                  <span className="max-w-32 truncate font-medium text-sm text-foreground">
                    {provider.prefix}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Model prefix: {provider.prefix}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="flex min-w-0 items-center gap-2 border-t border-border/60 pt-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", statusDot)} />
          <span className="truncate font-mono text-[11px] uppercase tracking-wide text-foreground/75">
            {statusLabel}
          </span>
          <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        {lastError ? (
          <p
            className="truncate text-xs font-medium text-destructive"
            title={
              lastError.at
                ? `${lastError.message} (${formatDate(lastError.at)})`
                : lastError.message
            }
          >
            {lastError.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProviderCardSkeleton() {
  return (
    <Card aria-hidden className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex min-h-0 flex-row items-center gap-3 border-b border-border/70 bg-muted/30 px-3 py-3 dark:bg-muted/40">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 px-3 py-3">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-3.5 w-full" />
      </CardContent>
    </Card>
  );
}
