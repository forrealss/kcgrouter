import { CLIToolConfigForm } from "@/components/cli-tools/CLIToolConfigForm";
import { CLIToolDetailHeader } from "@/components/cli-tools/CLIToolDetailHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCLIToolDetail } from "@/hooks/useCLIToolDetail";

interface CLIToolDetailPageProps {
  toolId: string;
}

export function CLIToolDetailPage({ toolId }: CLIToolDetailPageProps) {
  const {
    status,
    toolMeta,
    modelOptions,
    apiKeys,
    isLoading,
    error,
    isSaving,
    message,
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
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading...
          </CardContent>
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <CLIToolConfigForm
          status={status}
          modelOptions={modelOptions}
          apiKeys={apiKeys}
          defaultEndpoint={defaultEndpoint}
          isSaving={isSaving}
          message={message}
          onApply={applyConfig}
          onReset={resetConfig}
        />
      )}
    </section>
  );
}
