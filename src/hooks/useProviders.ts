import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { Provider, ProviderAccount } from "@/types/provider";

export interface AccountsState {
  accounts?: ProviderAccount[];
  error?: string;
  isLoading: boolean;
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(
    null,
  );
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  );

  const refreshAccounts = useCallback(async (providerId: string) => {
    setAccounts((current) => ({
      ...current,
      [providerId]: {
        accounts: current[providerId]?.accounts,
        isLoading: true,
      },
    }));

    try {
      const providerAccounts = await apiClient.get<ProviderAccount[]>(
        `/api/providers/${encodeURIComponent(providerId)}/accounts`,
      );
      setAccounts((current) => ({
        ...current,
        [providerId]: { accounts: providerAccounts, isLoading: false },
      }));
    } catch (requestError) {
      setAccounts((current) => ({
        ...current,
        [providerId]: {
          accounts: current[providerId]?.accounts,
          error: getApiErrorMessage(requestError),
          isLoading: false,
        },
      }));
    }
  }, []);

  const refreshProviderSummary = useCallback(async () => {
    const nextProviders = await apiClient.get<Provider[]>("/api/providers");
    setProviders(nextProviders);
    return nextProviders;
  }, []);

  const refreshProviders = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    try {
      const nextProviders = await refreshProviderSummary();
      await Promise.all(
        nextProviders.map((provider) => refreshAccounts(provider.id)),
      );
    } catch (requestError) {
      setListError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [refreshAccounts, refreshProviderSummary]);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const handleAccountsChanged = useCallback(
    async (providerId: string) => {
      setActionError(null);
      try {
        await Promise.all([
          refreshAccounts(providerId),
          refreshProviderSummary(),
        ]);
      } catch (requestError) {
        setActionError(getApiErrorMessage(requestError));
      }
    },
    [refreshAccounts, refreshProviderSummary],
  );

  async function handleDeleteProvider(provider: Provider) {
    setActionError(null);
    setDeletingProviderId(provider.id);

    try {
      await apiClient.delete(
        `/api/providers/${encodeURIComponent(provider.id)}`,
      );
      await refreshProviders();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError));
    } finally {
      setDeletingProviderId(null);
    }
  }

  async function handleDeleteAccount(account: ProviderAccount) {
    setActionError(null);
    setDeletingAccountId(account.id);

    try {
      await apiClient.delete(
        `/api/providers/accounts/${encodeURIComponent(account.id)}`,
      );
      await handleAccountsChanged(account.providerId);
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError));
    } finally {
      setDeletingAccountId(null);
    }
  }

  return {
    providers,
    accounts,
    isLoading,
    error: actionError ?? listError,
    deletingProviderId,
    deletingAccountId,
    refreshProviders,
    handleDeleteProvider,
    handleDeleteAccount,
    handleAccountsChanged,
  };
}
