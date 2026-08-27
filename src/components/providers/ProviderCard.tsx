import { ArrowUpRightIcon, CableIcon, TrashIcon } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDarkMode } from "@/hooks/useDarkMode";
import { apiClient } from "@/lib/api-client";
import type { AccountErrorSummary } from "@/lib/provider-errors";
import { formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import {
  providerHealthMeta,
  resolveProviderHealth,
} from "@/lib/provider-status";
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
  const isDark = useDarkMode();
  const [isDeleting, setIsDeleting] = useState(false);

  // Derived from the shared resolver so a card and the detail page can never
  // describe the same provider differently.
  const healthKey = resolveProviderHealth(accounts);
  const health = providerHealthMeta[healthKey];
  const HealthIcon = health.icon;
  const hasError = healthKey === "error" || healthKey === "degraded";
  const activeCount = accounts.filter((a) => a.status === "active").length;

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
        "group relative gap-0 overflow-hidden border-border/80 py-0 shadow-sm transition-[border-color,box-shadow,background-color] duration-150",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border before:to-transparent",
        onClick &&
          "cursor-pointer hover:border-primary/40 hover:bg-accent/20 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:hover:shadow-[0_0_24px_-18px] dark:hover:shadow-primary",
        healthKey === "error" && "border-destructive/40",
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={
        onClick ? `${provider.name} — ${health.label}, open details` : undefined
      }
    >
      <CardHeader className="flex min-h-0 flex-row items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm dark:shadow-[0_0_14px_-5px] dark:shadow-current",
            meta.accentClassName,
          )}
          aria-hidden
        >
          {meta.icon ? (
            <img
              src={isDark && meta.darkIcon ? meta.darkIcon : meta.icon}
              alt=""
              className="size-6"
            />
          ) : (
            <meta.fallbackIcon className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm font-medium">
            {provider.name}
          </CardTitle>
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={meta.label}
          >
            {meta.label}
          </p>
        </div>
        {!provider.isBuiltin && onDelete ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                disabled={isDeleting}
                onClick={(event) => event.stopPropagation()}
              >
                {isDeleting ? (
                  <Spinner className="size-3" />
                ) : (
                  <TrashIcon className="size-3" />
                )}
                <span className="sr-only">Delete {provider.name}</span>
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
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-0 px-0 py-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", health.dot)}
            aria-hidden
          />
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 text-xs font-medium",
              health.text,
            )}
          >
            <HealthIcon className="size-3.5 shrink-0" />
            <span className="truncate">{health.label}</span>
          </span>
          <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <CableIcon className="size-3.5" aria-hidden />
                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {activeCount}
                    <span className="text-muted-foreground">
                      /{provider.accountCount}
                    </span>
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {provider.accountCount === 0
                  ? "No connections yet"
                  : `${activeCount} of ${provider.accountCount} connections active`}
              </TooltipContent>
            </Tooltip>

            <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />

            <Tooltip>
              <TooltipTrigger asChild>
                <code className="min-w-0 truncate rounded border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {provider.prefix}/
                </code>
              </TooltipTrigger>
              <TooltipContent>
                Call models as{" "}
                <span className="font-mono">{provider.prefix}/model-id</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {lastError && hasError ? (
          <p
            className="truncate border-t border-destructive/25 bg-destructive/10 px-4 py-2 text-xs text-destructive"
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
      <CardHeader className="flex min-h-0 flex-row items-start gap-3 border-b border-border/60 px-4 py-3.5">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 px-0 py-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
