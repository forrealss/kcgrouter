import { TrashIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client";
import type { AccountErrorSummary } from "@/lib/provider-errors";
import { formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types/provider";

interface ProviderCardProps {
  provider: Provider;
  onClick?: () => void;
  onDelete?: () => void | Promise<void>;
  lastError?: AccountErrorSummary | null;
}

export function ProviderCard({
  provider,
  onClick,
  onDelete,
  lastError,
}: ProviderCardProps) {
  const meta = transportMeta[provider.transport];
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiClient.delete(
        `/api/providers/${encodeURIComponent(provider.id)}`,
      );
      await onDelete?.();
    } catch {
      // ignore error
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card
      className={cn(
        onClick && "cursor-pointer transition-colors hover:bg-accent/50",
      )}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className="flex size-7 shrink-0 items-center justify-center"
            aria-hidden
          >
            {meta.icon ? (
              <img src={meta.icon} alt="" className="w-full" />
            ) : (
              <meta.fallbackIcon className="size-3.5" />
            )}
          </span>
          <span className="truncate">{provider.name}</span>
        </CardTitle>
        <CardDescription>
          {provider.accountCount} connection
          {provider.accountCount !== 1 ? "s" : ""}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("font-normal", meta.accentClassName)}
            >
              {meta.label}
            </Badge>
            {!provider.isBuiltin && onDelete ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={isDeleting}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isDeleting ? (
                      <Spinner className="size-3" />
                    ) : (
                      <TrashIcon className="size-3" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus {provider.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua koneksi dan kredensial akan dihapus permanen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <p className="break-all text-xs text-muted-foreground">
            {provider.baseUrl}
          </p>
          <p className="text-xs text-muted-foreground">
            Prefix: <code className="font-mono">{provider.prefix}</code>
          </p>
          {lastError ? (
            <p
              className="truncate text-xs font-medium text-red-600 dark:text-red-400"
              title={
                lastError.at
                  ? `${lastError.message} (${formatDate(lastError.at)})`
                  : lastError.message
              }
            >
              ⚠ {lastError.message}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProviderCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-28" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-3.5 w-20" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  );
}
