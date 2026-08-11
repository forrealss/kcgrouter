import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  LinkIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "@/hooks/useRouter";
import { type AccountErrorSummary, formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

interface ProviderDetailHeaderProps {
  provider: Provider;
  accounts: ProviderAccount[];
  lastError?: AccountErrorSummary | null;
}

export function ProviderDetailHeader({
  provider,
  accounts,
  lastError,
}: ProviderDetailHeaderProps) {
  const { navigate } = useRouter();
  const meta = transportMeta[provider.transport];
  const hasError = accounts.some((account) => account.status === "error");
  const hasActive = accounts.some((account) => account.status === "active");
  const hasExpired =
    accounts.length > 0 &&
    accounts.every((account) => account.status === "expired");
  const statusLabel = hasError
    ? "error"
    : hasActive
      ? "online"
      : hasExpired
        ? "expired"
        : "no connections";
  const statusClass = hasError
    ? "text-destructive"
    : hasActive
      ? "text-emerald-500"
      : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit -ml-2 text-muted-foreground hover:text-foreground"
        onClick={() => navigate("/providers")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to providers
      </Button>

      <Card className="overflow-hidden border-border/70">
        <CardContent className="p-0">
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl border",
                  meta.accentClassName,
                  "dark:shadow-[0_0_24px_-12px] dark:shadow-current",
                )}
                aria-hidden
              >
                {meta.icon ? (
                  <img src={meta.icon} alt="" className="size-6" />
                ) : (
                  <meta.fallbackIcon className="size-6" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight">
                    {provider.name}
                  </h1>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-mono text-[10px]",
                      meta.accentClassName,
                    )}
                  >
                    {meta.label}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  provider/{provider.id}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <LinkIcon className="size-3.5" />
                    <span className="text-foreground">{provider.prefix}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        hasError
                          ? "bg-destructive shadow-[0_0_6px] shadow-destructive/70"
                          : hasActive
                            ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                            : "bg-muted-foreground/50",
                      )}
                    />
                    {statusLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 md:min-w-64">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Connections
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                  {provider.accountCount}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Type
                </p>
                <p className="mt-1 font-mono text-sm font-medium">
                  {provider.isBuiltin ? "built-in" : "custom"}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border bg-muted/30 px-3 py-2 sm:col-span-1">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  State
                </p>
                <p
                  className={cn(
                    "mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-medium",
                    statusClass,
                  )}
                >
                  {hasError ? (
                    <TriangleAlertIcon className="size-3.5" />
                  ) : hasActive ? (
                    <CheckCircle2Icon className="size-3.5" />
                  ) : null}
                  {statusLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="border-t bg-muted/15 px-5 py-3">
            <p
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={provider.baseUrl}
            >
              endpoint{" "}
              <span className="text-foreground/80">{provider.baseUrl}</span>
            </p>
            {lastError ? (
              <p
                className="mt-1 truncate text-xs font-medium text-destructive"
                title={
                  lastError.at
                    ? `${lastError.message} (${formatDate(lastError.at)})`
                    : lastError.message
                }
              >
                {lastError.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
