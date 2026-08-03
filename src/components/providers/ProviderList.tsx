import {
  AlertCircleIcon,
  BoxesIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { AccountFormDialog } from "./AccountFormDialog";
import { ProviderFormDialog } from "./ProviderFormDialog";
import type {
  AccountStatus,
  Provider,
  ProviderAccount,
  ProviderTransport,
} from "./types";

type AccountsState = {
  accounts?: ProviderAccount[];
  error?: string;
  isLoading: boolean;
};

type AccountDialogState = {
  providerId: string;
  account?: ProviderAccount;
};

const transportLabels: Record<ProviderTransport, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

const statusLabels: Record<AccountStatus, string> = {
  active: "Aktif",
  error: "Error",
  expired: "Kedaluwarsa",
};

const quotaResetLabels: Record<ProviderAccount["quotaResetType"], string> = {
  "5h": "Reset 5 jam",
  daily: "Reset harian",
  weekly: "Reset mingguan",
  none: "Tanpa reset",
};

function getStatusBadgeVariant(
  status: AccountStatus,
): "default" | "secondary" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "error":
      return "destructive";
    case "expired":
      return "secondary";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak diketahui";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatQuotaLimit(tokens: number | null): string {
  if (tokens === null) return "Tidak dibatasi";
  return `${new Intl.NumberFormat("id-ID").format(tokens)} token`;
}

interface ProviderAccountsProps {
  provider: Provider;
  state?: AccountsState;
  deletingAccountId: string | null;
  onAddAccount: (providerId: string) => void;
  onEditAccount: (providerId: string, account: ProviderAccount) => void;
  onDeleteAccount: (account: ProviderAccount) => Promise<void>;
  onRetry: (providerId: string) => Promise<void>;
}

function ProviderAccounts({
  provider,
  state,
  deletingAccountId,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onRetry,
}: ProviderAccountsProps) {
  if (state?.isLoading || !state) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Spinner />
        Memuat akun...
      </div>
    );
  }

  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Akun tidak dapat dimuat</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{state.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRetry(provider.id)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!state.accounts?.length) {
    return (
      <Empty className="border p-6 md:p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Belum ada akun</EmptyTitle>
          <EmptyDescription>
            Tambahkan kredensial untuk mulai menggunakan provider ini.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            size="sm"
            onClick={() => onAddAccount(provider.id)}
          >
            <PlusIcon data-icon="inline-start" />
            Tambah akun
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label={`Akun ${provider.name}`}>
      {state.accounts.map((account) => {
        const isDeleting = deletingAccountId === account.id;

        return (
          <li
            key={account.id}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{account.label}</p>
                <p className="text-sm text-muted-foreground">
                  {quotaResetLabels[account.quotaResetType]} ·{" "}
                  {formatQuotaLimit(account.quotaLimitTokens)}
                </p>
              </div>
              <Badge variant={getStatusBadgeVariant(account.status)}>
                {statusLabels[account.status]}
              </Badge>
            </div>
            <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-x-1">
                <dt>Terakhir digunakan:</dt>
                <dd>
                  {account.lastUsedAt
                    ? formatDate(account.lastUsedAt)
                    : "Belum pernah"}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-1">
                <dt>Dibuat:</dt>
                <dd>{formatDate(account.createdAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditAccount(provider.id, account)}
                disabled={isDeleting}
              >
                <PencilIcon data-icon="inline-start" />
                Ubah
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Trash2Icon data-icon="inline-start" />
                    )}
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Hapus akun {account.label}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Kredensial akun ini akan dihapus dan tidak dapat
                      dipulihkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Batal
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={isDeleting}
                      onClick={() => void onDeleteAccount(account)}
                    >
                      {isDeleting ? <Spinner data-icon="inline-start" /> : null}
                      Hapus akun
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProviderList() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  const [accountDialog, setAccountDialog] = useState<AccountDialogState | null>(
    null,
  );
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

  const handleProviderSaved = useCallback(async () => {
    setActionError(null);
    await refreshProviders();
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

  const pageError = actionError ?? listError;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="text-muted-foreground">
            Kelola endpoint upstream dan kredensial akun.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshProviders()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Muat ulang
          </Button>
          <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Tambah provider
          </Button>
        </div>
      </div>

      {pageError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Data provider tidak dapat diperbarui</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {providers === null ? (
        isLoading ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>Memuat provider</EmptyTitle>
              <EmptyDescription>
                Mengambil konfigurasi provider dan akun upstream.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null
      ) : providers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>Belum ada provider</EmptyTitle>
            <EmptyDescription>
              Tambahkan provider pertama untuk mulai mengarahkan request.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Tambah provider
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const isDeleting = deletingProviderId === provider.id;

            return (
              <Card key={provider.id}>
                <CardHeader>
                  <CardTitle>{provider.name}</CardTitle>
                  <CardDescription>
                    {provider.accountCount} akun · dibuat{" "}
                    {formatDate(provider.createdAt)}
                  </CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      {transportLabels[provider.transport]}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">Base URL</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {provider.baseUrl}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Akun</p>
                      <Badge variant="secondary">{provider.accountCount}</Badge>
                    </div>
                    <ProviderAccounts
                      provider={provider}
                      state={accounts[provider.id]}
                      deletingAccountId={deletingAccountId}
                      onAddAccount={(providerId) =>
                        setAccountDialog({ providerId })
                      }
                      onEditAccount={(providerId, account) =>
                        setAccountDialog({ providerId, account })
                      }
                      onDeleteAccount={handleDeleteAccount}
                      onRetry={refreshAccounts}
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAccountDialog({ providerId: provider.id })
                    }
                    disabled={isDeleting}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Tambah akun
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Trash2Icon data-icon="inline-start" />
                        )}
                        Hapus provider
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Hapus provider {provider.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Semua akun dan kredensial yang terkait akan ikut
                          dihapus. Tindakan ini tidak dapat dipulihkan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                          Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={isDeleting}
                          onClick={() => void handleDeleteProvider(provider)}
                        >
                          {isDeleting ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Hapus provider
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <ProviderFormDialog
        open={isProviderDialogOpen}
        onOpenChange={setIsProviderDialogOpen}
        onSaved={handleProviderSaved}
      />
      {accountDialog ? (
        <AccountFormDialog
          providerId={accountDialog.providerId}
          account={accountDialog.account}
          open
          onOpenChange={(open) => {
            if (!open) setAccountDialog(null);
          }}
          onSaved={() => handleAccountsChanged(accountDialog.providerId)}
        />
      ) : null}
    </section>
  );
}
