import { Settings2Icon } from "lucide-react";
import { useState } from "react";
import { RetryConfigDialog } from "@/components/providers/RetryConfigDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Provider, RetryConfig } from "@/types/provider";

/** Status codes the global retry policy handles — shown as reference rows. */
const STATUS_ROWS = [429, 502, 503, 504] as const;

const DEFAULT_LABELS: Record<number, string> = {
  429: "no retry",
  502: "3× @ 3s",
  503: "3× @ 2s",
  504: "2× @ 3s",
};

interface ProviderDetailRetryProps {
  provider: Provider;
  onSave: (config: RetryConfig | null) => Promise<boolean>;
}

export function ProviderDetailRetry({
  provider,
  onSave,
}: ProviderDetailRetryProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const overrideCount = provider.retryConfig
    ? Object.keys(provider.retryConfig).length
    : 0;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/15 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-chart-3 shadow-[0_0_6px] shadow-chart-3/70" />
              <CardTitle className="text-base">Retry Policy</CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                {overrideCount > 0
                  ? `${overrideCount} OVERRIDE${overrideCount === 1 ? "" : "S"}`
                  : "GLOBAL DEFAULTS"}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              How retryable failures are retried before failing over.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsDialogOpen(true)}
          >
            <Settings2Icon data-icon="inline-start" />
            Configure
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4">
          {STATUS_ROWS.map((status) => {
            const rule = provider.retryConfig?.[status];
            return (
              <div
                key={status}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/15 px-3 py-2"
              >
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground/80">
                  HTTP {status}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {rule
                    ? `${rule.attempts}× @ ${(rule.delayMs / 1000).toFixed(rule.delayMs % 1000 === 0 ? 0 : 1)}s`
                    : DEFAULT_LABELS[status]}
                </span>
              </div>
            );
          })}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Empty rows fall back to the global default. Delays are jittered ±25%
            and Retry-After headers are honored.
          </p>
        </CardContent>
      </Card>

      {isDialogOpen ? (
        <RetryConfigDialog
          open
          onOpenChange={setIsDialogOpen}
          providerName={provider.name}
          config={provider.retryConfig}
          onSave={onSave}
        />
      ) : null}
    </>
  );
}
