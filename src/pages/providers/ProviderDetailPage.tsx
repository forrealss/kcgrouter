import { ProviderDetailConnections } from "@/components/providers/ProviderDetailConnections";
import { ProviderDetailHeader } from "@/components/providers/ProviderDetailHeader";
import { ProviderDetailModels } from "@/components/providers/ProviderDetailModels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useProviderDetail } from "@/hooks/useProviderDetail";
import { getLatestAccountError } from "@/lib/provider-errors";

interface ProviderDetailPageProps {
  providerId: string;
}

export function ProviderDetailPage({ providerId }: ProviderDetailPageProps) {
  const {
    provider,
    accounts,
    models,
    isLoading,
    error,
    deletingAccountId,
    testingAccountId,
    accountTestStatus,
    testingModelId,
    modelTestStatus,
    fetchingModels,
    modelCandidates,
    fetchDialogOpen,
    importingModels,
    handleDeleteAccount,
    handleAccountSaved,
    handleTestConnection,
    handleToggleModel,
    handleAddModel,
    handleDeleteModel,
    handleTestModel,
    handleFetchModels,
    handleImportModels,
    handleCloseFetchDialog,
  } = useProviderDetail(providerId);

  const latestAccountError = getLatestAccountError(accounts);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading provider...
      </div>
    );
  }

  if (error || !provider) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error ?? "Provider not found"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <ProviderDetailHeader
        provider={provider}
        lastError={latestAccountError}
      />
      <ProviderDetailConnections
        provider={provider}
        accounts={accounts}
        deletingAccountId={deletingAccountId}
        testingAccountId={testingAccountId}
        accountTestStatus={accountTestStatus}
        onDeleteAccount={handleDeleteAccount}
        onAccountSaved={handleAccountSaved}
        onTestConnection={handleTestConnection}
      />
      <ProviderDetailModels
        provider={provider}
        models={models}
        accounts={accounts}
        testingModelId={testingModelId}
        modelTestStatus={modelTestStatus}
        onToggleModel={handleToggleModel}
        onAddModel={handleAddModel}
        onDeleteModel={handleDeleteModel}
        onTestModel={handleTestModel}
        onFetchModels={handleFetchModels}
        fetchingModels={fetchingModels}
        modelCandidates={modelCandidates}
        fetchDialogOpen={fetchDialogOpen}
        importingModels={importingModels}
        onImportModels={handleImportModels}
        onCloseFetchDialog={handleCloseFetchDialog}
      />
    </section>
  );
}
