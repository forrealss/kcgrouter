import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type {
  ModelCandidate,
  Provider,
  ProviderAccount,
  ProviderModel,
  RetryConfig,
} from "@/types/provider";

export interface TestStatus {
  status: "ok" | "error";
  message?: string;
}

export type TestStatusValue = TestStatus | null;

export function useProviderDetail(providerId: string) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  );
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestStatus, setAccountTestStatus] = useState<
    Record<string, TestStatusValue>
  >({});
  const [isReorderingAccounts, setIsReorderingAccounts] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<
    Record<string, TestStatusValue>
  >({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelCandidates, setModelCandidates] = useState<
    ModelCandidate[] | null
  >(null);
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [importingModels, setImportingModels] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [providerData, accountsData, modelsData] = await Promise.all([
        apiClient.get<Provider>(
          `/api/providers/${encodeURIComponent(providerId)}`,
        ),
        apiClient.get<ProviderAccount[]>(
          `/api/providers/${encodeURIComponent(providerId)}/accounts`,
        ),
        apiClient.get<ProviderModel[]>(
          `/api/providers/${encodeURIComponent(providerId)}/models`,
        ),
      ]);

      setProvider(providerData);
      setAccounts(accountsData);
      setModels(modelsData);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleDeleteAccount(account: ProviderAccount) {
    setDeletingAccountId(account.id);
    try {
      await apiClient.delete(
        `/api/providers/accounts/${encodeURIComponent(account.id)}`,
      );
      // Refetch rather than filtering locally: deleting compacts the failover
      // order server-side, so the remaining rows' sortOrder has changed.
      await loadData();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeletingAccountId(null);
    }
  }

  /**
   * Flip a connection's enabled flag, mirroring handleToggleModel: optimistic
   * update, reconcile from the response, roll back and surface the error.
   */
  async function handleToggleAccount(account: ProviderAccount) {
    const optimistic = !account.enabled;
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === account.id ? { ...a, enabled: optimistic } : a,
      ),
    );
    try {
      const updated = await apiClient.patch<ProviderAccount>(
        `/api/providers/accounts/${encodeURIComponent(account.id)}`,
        { enabled: optimistic },
      );
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? updated : a)),
      );
    } catch (err) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, enabled: account.enabled } : a,
        ),
      );
      toast.error(getApiErrorMessage(err));
    }
  }

  /**
   * Persist a new failover order. The caller passes the already-reordered list
   * so the UI can render the drop immediately; on failure the server order is
   * refetched rather than guessed at.
   */
  async function handleReorderAccounts(ordered: ProviderAccount[]) {
    const previous = accounts;
    setAccounts(ordered);
    setIsReorderingAccounts(true);
    try {
      await apiClient.patch<{ ok: true }>(
        `/api/providers/${encodeURIComponent(providerId)}/accounts/reorder`,
        { orderedAccountIds: ordered.map((a) => a.id) },
      );
    } catch (err) {
      setAccounts(previous);
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsReorderingAccounts(false);
    }
  }

  function handleAccountSaved() {
    void loadData();
  }

  async function handleTestConnection(account: ProviderAccount) {
    if (testingAccountId) return;
    setTestingAccountId(account.id);
    setAccountTestStatus((prev) => ({ ...prev, [account.id]: null }));
    try {
      const result = await apiClient.post<{
        status: "ok" | "error";
        latencyMs: number;
        error?: string;
      }>(`/api/providers/accounts/${encodeURIComponent(account.id)}/test`);
      setAccountTestStatus((prev) => ({
        ...prev,
        [account.id]:
          result.status === "ok"
            ? { status: "ok" }
            : {
                status: "error",
                message: result.error ?? "Test connection failed",
              },
      }));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? {
                ...a,
                status: result.status === "ok" ? "active" : "error",
                lastError:
                  result.status === "ok"
                    ? null
                    : (result.error ?? "Test connection failed"),
                lastErrorAt:
                  result.status === "ok" ? null : new Date().toISOString(),
              }
            : a,
        ),
      );
    } catch (err) {
      const message = getApiErrorMessage(err);
      setAccountTestStatus((prev) => ({
        ...prev,
        [account.id]: { status: "error", message },
      }));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? {
                ...a,
                status: "error",
                lastError: message,
                lastErrorAt: new Date().toISOString(),
              }
            : a,
        ),
      );
    } finally {
      setTestingAccountId(null);
    }
  }

  async function handleToggleModel(model: ProviderModel) {
    const optimistic = !model.enabled;
    setModels((prev) =>
      prev.map((m) => (m.id === model.id ? { ...m, enabled: optimistic } : m)),
    );
    try {
      const result = await apiClient.patch<{ enabled: boolean }>(
        `/api/providers/models/${encodeURIComponent(model.id)}/toggle`,
      );
      setModels((prev) =>
        prev.map((m) =>
          m.id === model.id ? { ...m, enabled: result.enabled } : m,
        ),
      );
    } catch (err) {
      setModels((prev) =>
        prev.map((m) =>
          m.id === model.id ? { ...m, enabled: model.enabled } : m,
        ),
      );
      toast.error(getApiErrorMessage(err));
    }
  }

  async function handleAddModel(modelId: string, modelName: string) {
    try {
      await apiClient.post(
        `/api/providers/${encodeURIComponent(providerId)}/models`,
        { modelId, modelName },
      );
      void loadData();
    } catch {
      // ignore
    }
  }

  async function handleDeleteModel(modelId: string) {
    try {
      await apiClient.delete(
        `/api/providers/models/${encodeURIComponent(modelId)}`,
      );
      setModels((prev) => prev.filter((m) => m.id !== modelId));
    } catch {
      // ignore
    }
  }

  async function handleFetchModels() {
    if (fetchingModels) return;
    setFetchingModels(true);
    try {
      const result = await apiClient.post<{ models: ModelCandidate[] }>(
        `/api/providers/${encodeURIComponent(providerId)}/models/fetch`,
      );
      setModelCandidates(result.models);
      setFetchDialogOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleImportModels(selected: ModelCandidate[]) {
    if (importingModels || selected.length === 0) return;
    setImportingModels(true);
    try {
      const result = await apiClient.post<{
        added: number;
        skipped: number;
        models: ProviderModel[];
      }>(`/api/providers/${encodeURIComponent(providerId)}/models/import`, {
        models: selected.map((m) => ({
          modelId: m.modelId,
          modelName: m.modelName,
          contextLength: m.contextLength,
          maxOutputTokens: m.maxOutputTokens,
        })),
      });
      setModels(result.models);
      setFetchDialogOpen(false);
      setModelCandidates(null);
      if (result.added === 0) {
        toast.info("Tidak ada model baru yang diimpor");
      } else {
        toast.success(`${result.added} model berhasil diimpor`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setImportingModels(false);
    }
  }

  function handleCloseFetchDialog() {
    if (importingModels) return;
    setFetchDialogOpen(false);
    setModelCandidates(null);
  }

  async function handleSaveRetryConfig(config: RetryConfig | null) {
    try {
      const updated = await apiClient.put<Provider>(
        `/api/providers/${encodeURIComponent(providerId)}/retry-config`,
        { retryConfig: config },
      );
      setProvider(updated);
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      return false;
    }
  }

  async function handleTestModel(model: ProviderModel, accountId: string) {
    if (testingModelId) return;
    setTestingModelId(model.id);
    setModelTestStatus((prev) => ({ ...prev, [model.id]: null }));
    try {
      const result = await apiClient.post<{
        status: "ok" | "error";
        latencyMs: number;
        error?: string;
      }>(`/api/providers/models/${encodeURIComponent(model.modelId)}/test`, {
        accountId,
      });
      setModelTestStatus((prev) => ({
        ...prev,
        [model.id]:
          result.status === "ok"
            ? { status: "ok" }
            : {
                status: "error",
                message: result.error ?? "Test model failed",
              },
      }));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? {
                ...a,
                status: result.status === "ok" ? "active" : "error",
                lastError:
                  result.status === "ok"
                    ? null
                    : (result.error ?? "Test model failed"),
                lastErrorAt:
                  result.status === "ok" ? null : new Date().toISOString(),
              }
            : a,
        ),
      );
    } catch (err) {
      const message = getApiErrorMessage(err);
      setModelTestStatus((prev) => ({
        ...prev,
        [model.id]: { status: "error", message },
      }));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? {
                ...a,
                status: "error",
                lastError: message,
                lastErrorAt: new Date().toISOString(),
              }
            : a,
        ),
      );
    } finally {
      setTestingModelId(null);
    }
  }

  return {
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
  };
}
