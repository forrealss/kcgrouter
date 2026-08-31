import { ArrowLeftIcon, ServerCrashIcon } from "lucide-react";
import { ProviderDetailConnections } from "@/components/providers/ProviderDetailConnections";
import { ProviderDetailHeader } from "@/components/providers/ProviderDetailHeader";
import { ProviderDetailModels } from "@/components/providers/ProviderDetailModels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderDetail } from "@/hooks/useProviderDetail";
import { useRouter } from "@/hooks/useRouter";
import { getLatestAccountError } from "@/lib/provider-errors";

interface ProviderDetailPageProps {
  providerId: string;
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card aria-hidden className="gap-0 py-0">
      <CardHeader className="gap-2 border-b border-border/60 bg-muted/20 px-5 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-5 py-4">
        {Array.from({ length: rows }, (_, index) => `row-${index}`).map(
          (key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ),
        )}
      </CardContent>
    </Card>
  );
}

export function ProviderDetailPage({ providerId }: ProviderDetailPageProps) {
  const { navigate } = useRouter();
  const {
    provider,
    accounts,
    models,
    isLoading,
    error,
    deletingAccountId,
    testingAccountId,
    accountTestStatus,
    isReorderingAccounts,
    testingModelId,
    modelTestStatus,
    fetchingModels,
    modelCandidates,
    fetchDialogOpen,
    importingModels,
    handleDeleteAccount,
    handleAccountSaved,
    handleTestConnection,
    handleToggleAccount,
    handleReorderAccounts,
    handleToggleModel,
    handleAddModel,
    handleDeleteModel,
    handleTestModel,
    handleFetchModels,
    handleImportModels,
    handleCloseFetchDialog,
    handleSaveRetryConfig,
  } = useProviderDetail(providerId);

  if (isLoading) {
    return (
      <section
        className="flex min-w-0 flex-col gap-5"
        role="status"
        aria-label="Loading provider"
      >
        <Card aria-hidden className="gap-0 py-0">
          <CardContent className="flex items-center gap-4 p-5">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </CardContent>
          <div className="grid gap-px border-t border-border/60 bg-border/60 sm:grid-cols-3">
            {["connections", "models", "retry"].map((key) => (
              <div
                key={key}
                className="flex items-center gap-3 bg-card px-5 py-3"
              >
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        {/* Mirrors the real layout: full-width connections, then models. */}
        <SectionSkeleton rows={2} />
        <SectionSkeleton rows={6} />
      </section>
    );
  }

  if (error || !provider) {
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <Alert variant="destructive">
          <ServerCrashIcon />
          <AlertTitle>This provider could not be loaded</AlertTitle>
          <AlertDescription>
            {error ?? "No provider matches this ID. It may have been deleted."}
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => navigate("/providers")}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to providers
        </Button>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <ProviderDetailHeader
        provider={provider}
        accounts={accounts}
        models={models}
        lastError={getLatestAccountError(accounts)}
        onSaveRetryConfig={handleSaveRetryConfig}
      />
      {/*
        Connections leads at full width. Its rows are the widest content on the
        page — position controls, label, status, quota, last used, and three
        actions — and the failover order they express is the first thing an
        operator checks here.
      */}
      <ProviderDetailConnections
        provider={provider}
        accounts={accounts}
        deletingAccountId={deletingAccountId}
        testingAccountId={testingAccountId}
        accountTestStatus={accountTestStatus}
        isReorderingAccounts={isReorderingAccounts}
        onDeleteAccount={handleDeleteAccount}
        onAccountSaved={handleAccountSaved}
        onTestConnection={handleTestConnection}
        onToggleAccount={handleToggleAccount}
        onReorderAccounts={handleReorderAccounts}
      />

      {/*
        Models takes the full width. Retry Policy no longer has its own card —
        its Configure button lives on the header's stat row instead — so
        Models is the only thing left below Connections.
      */}
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
