import { RefreshCwIcon, TerminalIcon } from "lucide-react";
import {
  CLIToolConfigForm,
  CLIToolConfigFormSkeleton,
} from "@/components/cli-tools/CLIToolConfigForm";
import { CLIToolDetailHeader } from "@/components/cli-tools/CLIToolDetailHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCLIToolDetail } from "@/hooks/useCLIToolDetail";
import { cn } from "@/lib/utils";

export function CLIToolDetailPage({ toolId }: { toolId: string }) {
  const {
    status,
    toolMeta,
    modelOptions,
    modelGroupMeta,
    apiKeys,
    isLoading,
    error,
    isSaving,
    defaultEndpoint,
    applyConfig,
    resetConfig,
    refreshDetails,
  } = useCLIToolDetail(toolId);

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <CLIToolDetailHeader
        toolId={toolId}
        toolMeta={toolMeta}
        status={status}
        isLoading={isLoading}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {modelOptions.length === 0
            ? "No routable models yet — enable some under Providers, or build a combo."
            : `${modelOptions.length} routable ${modelOptions.length === 1 ? "target" : "targets"} available to this client.`}
        </p>
        <div className="flex items-center gap-2">
          {isSaving ? (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <Spinner className="size-3" />
              Writing config
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshDetails()}
            disabled={isLoading || isSaving}
            aria-busy={isLoading}
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={cn(isLoading && "animate-spin")}
            />
            {isLoading ? "Reloading" : "Reload"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading CLI tool configuration">
          <CLIToolConfigFormSkeleton />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>CLI tool state unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshDetails()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section aria-label="CLI tool configuration" className="min-w-0">
          <CLIToolConfigForm
            status={status}
            modelOptions={modelOptions}
            modelGroupMeta={modelGroupMeta}
            apiKeys={apiKeys}
            defaultEndpoint={defaultEndpoint}
            isSaving={isSaving}
            onApply={applyConfig}
            onReset={resetConfig}
          />
        </section>
      )}
    </div>
  );
}
