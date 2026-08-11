import { TerminalIcon } from "lucide-react";
import {
  CLIToolConfigForm,
  CLIToolConfigFormSkeleton,
} from "@/components/cli-tools/CLIToolConfigForm";
import { CLIToolDetailHeader } from "@/components/cli-tools/CLIToolDetailHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCLIToolDetail } from "@/hooks/useCLIToolDetail";

interface CLIToolDetailPageProps {
  toolId: string;
}

export function CLIToolDetailPage({ toolId }: CLIToolDetailPageProps) {
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
  } = useCLIToolDetail(toolId);

  return (
    <section className="flex flex-col gap-6">
      <CLIToolDetailHeader
        toolId={toolId}
        toolMeta={toolMeta}
        status={status}
      />

      {isLoading ? (
        <div role="status" aria-label="Loading CLI tool configuration">
          <CLIToolConfigFormSkeleton />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
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
      )}
    </section>
  );
}
