import { ArrowUpRightIcon, ScissorsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/hooks/useRouter";
import { compactNumber, numFmt } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import type { TokenSaverSettings } from "@/types/token-saver";

interface TokenSaverCardProps {
  settings: TokenSaverSettings | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Cumulative, all-time token savings from active filters. A quiet card —
 * this number only grows, so there's no health signal to surface here.
 */
export function TokenSaverCard({
  settings,
  isLoading,
  error,
}: TokenSaverCardProps) {
  const { navigate } = useRouter();

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <ScissorsIcon className="size-4 text-chart-2" />
            Token Saver
          </h2>
          <p className="text-xs text-muted-foreground">Cumulative, all-time</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-5 w-10 rounded-full" />
          ) : error ? null : (
            <Badge
              variant={settings?.enabled ? "outline" : "secondary"}
              className={
                settings?.enabled
                  ? "border-chart-3/40 bg-chart-3/10 text-chart-3"
                  : "text-muted-foreground"
              }
            >
              {settings?.enabled ? "on" : "off"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/token-saver")}
          >
            Configure <ArrowUpRightIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Token saver settings unavailable — {error}
        </p>
      ) : (
        <>
          {isLoading ? (
            <>
              <Skeleton className="mt-4 h-9 w-32" />
              <Skeleton className="mt-1.5 h-3 w-40" />
            </>
          ) : (
            <>
              <div className="mt-4 font-mono text-3xl font-semibold">
                {compactNumber(settings?.totalTokensSaved ?? 0)}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {numFmt.format(settings?.totalTokensSaved ?? 0)} tokens saved
              </div>
            </>
          )}

          {settings ? (
            <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
              {settings.filters.map((f) => (
                <span
                  key={f.name}
                  className={cn(
                    "rounded-full border border-border px-2 py-0.5 font-mono",
                    !f.active && "opacity-50",
                  )}
                >
                  {f.name}
                </span>
              ))}
              {settings.ponytailEnabled ? (
                <span className="rounded-full border border-border px-2 py-0.5 font-mono">
                  ponytail: {settings.ponytailLevel}
                </span>
              ) : null}
              {settings.cavemanEnabled ? (
                <span className="rounded-full border border-border px-2 py-0.5 font-mono">
                  caveman
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
