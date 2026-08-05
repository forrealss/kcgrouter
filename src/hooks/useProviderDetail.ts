import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type {
  Provider,
  ProviderAccount,
  ProviderModel,
} from "@/types/provider";

export type TestStatus = "ok" | "error" | null;

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
    Record<string, TestStatus>
  >({});
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<
    Record<string, TestStatus>
  >({});

  const loadData = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [providerData, accountsData, modelsData] = await Promise.all([
        apiClient.get<Provider[]>("/api/providers"),
        apiClient.get<ProviderAccount[]>(
          `/api/providers/${encodeURIComponent(providerId)}/accounts`,
        ),
        apiClient.get<ProviderModel[]>(
          `/api/providers/${encodeURIComponent(providerId)}/models`,
        ),
      ]);

      const foundProvider = providerData.find((p) => p.id === providerId);
      if (!foundProvider) {
        setError("Provider not found");
        return;
      }

      setProvider(foundProvider);
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
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    } catch {
      // ignore
    } finally {
      setDeletingAccountId(null);
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
      }>(`/api/providers/accounts/${encodeURIComponent(account.id)}/test`);
      setAccountTestStatus((prev) => ({
        ...prev,
        [account.id]: result.status,
      }));
    } catch {
      setAccountTestStatus((prev) => ({ ...prev, [account.id]: "error" }));
    } finally {
      setTestingAccountId(null);
    }
  }

  async function handleToggleModel(model: ProviderModel) {
    try {
      const result = await apiClient.patch<{ enabled: boolean }>(
        `/api/providers/models/${encodeURIComponent(model.id)}/toggle`,
      );
      setModels((prev) =>
        prev.map((m) =>
          m.id === model.id ? { ...m, enabled: result.enabled } : m,
        ),
      );
    } catch {
      // ignore
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

  async function handleTestModel(model: ProviderModel, accountId: string) {
    if (testingModelId) return;
    setTestingModelId(model.id);
    setModelTestStatus((prev) => ({ ...prev, [model.id]: null }));
    try {
      const result = await apiClient.post<{
        status: "ok" | "error";
        latencyMs: number;
      }>(`/api/providers/models/${encodeURIComponent(model.modelId)}/test`, {
        accountId,
      });
      setModelTestStatus((prev) => ({
        ...prev,
        [model.id]: result.status,
      }));
    } catch {
      setModelTestStatus((prev) => ({ ...prev, [model.id]: "error" }));
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
    testingModelId,
    modelTestStatus,
    handleDeleteAccount,
    handleAccountSaved,
    handleTestConnection,
    handleToggleModel,
    handleAddModel,
    handleDeleteModel,
    handleTestModel,
  };
}
