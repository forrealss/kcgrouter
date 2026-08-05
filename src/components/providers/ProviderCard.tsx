import {
  BotIcon,
  BrainCircuitIcon,
  CpuIcon,
  SparklesIcon,
  TerminalIcon,
  TrashIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Provider, ProviderTransport } from "@/types/provider";

export const transportMeta: Record<
  ProviderTransport,
  {
    label: string;
    icon?: string;
    fallbackIcon: typeof BotIcon;
    accentClassName: string;
  }
> = {
  openai: {
    label: "OpenAI-compatible",
    icon: "/images/providers/openai.svg",
    fallbackIcon: BotIcon,
    accentClassName: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  },
  anthropic: {
    label: "Anthropic",
    icon: "/images/providers/anthropic.svg",
    fallbackIcon: BrainCircuitIcon,
    accentClassName: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  },
  gemini: {
    label: "Google Gemini",
    fallbackIcon: SparklesIcon,
    accentClassName: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  },
  kiro: {
    label: "Kiro (AWS CodeWhisperer)",
    icon: "/images/providers/kiro.svg",
    fallbackIcon: CpuIcon,
    accentClassName: "border-orange-400/40 bg-orange-400/10 text-orange-400",
  },
  "command-code": {
    label: "Command Code",
    icon: "/images/providers/command-code.svg",
    fallbackIcon: TerminalIcon,
    accentClassName: "border-gray-400/40 bg-gray-400/10 text-gray-400",
  },
};

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

interface ProviderCardProps {
  provider: Provider;
  onClick?: () => void;
  onDelete?: () => void | Promise<void>;
}

export function ProviderCard({
  provider,
  onClick,
  onDelete,
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
                    <AlertDialogTitle>Delete {provider.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All connections and credentials will be permanently
                      deleted.
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
