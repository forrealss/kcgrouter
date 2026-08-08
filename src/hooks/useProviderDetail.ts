import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type {
  Provider,
  ProviderAccount,
  ProviderModel,
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
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestStatus, setModelTestStatus] = useState<
    Record<string, TestStatusValue>
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
                    : result.error ?? "Test connection failed",
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
                    : result.error ?? "Test model failed",
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
