import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { UsageAccountOption, UsageSummary } from "@/types/usage";

interface Provider {
  id: string;
  name: string;
}

interface ProviderAccount {
  id: string;
  label: string;
}

export function useUsage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [accounts, setAccounts] = useState<UsageAccountOption[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const response = await apiClient.get<UsageSummary>("/api/usage/summary");
      setSummary(response);
    } catch (requestError) {
      setSummaryError(getApiErrorMessage(requestError));
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setIsAccountsLoading(true);
    setAccountsError(null);

    try {
      const providers = await apiClient.get<Provider[]>("/api/providers");
      const accountGroups = await Promise.all(
        providers.map(async (provider) => {
          const providerAccounts = await apiClient.get<ProviderAccount[]>(
            `/api/providers/${encodeURIComponent(provider.id)}/accounts`,
          );

          return providerAccounts.map((account) => ({
            id: account.id,
            label: `${provider.name} — ${account.label}`,
          }));
        }),
      );

      setAccounts(accountGroups.flat());
    } catch (requestError) {
      setAccountsError(getApiErrorMessage(requestError));
    } finally {
      setIsAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadAccounts();
  }, [loadAccounts, loadSummary]);

  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts],
  );

  return {
    summary,
    summaryError,
    isSummaryLoading,
    accounts,
    accountsError,
    isAccountsLoading,
    accountLabels,
    loadSummary,
    loadAccounts,
  };
}
