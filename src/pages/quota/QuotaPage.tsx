import { GaugeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { QuotaCard } from "@/components/quota/QuotaCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useQuota } from "@/hooks/useQuota";

export function QuotaPage() {
  const {
    accounts,
    providerUsage,
    error,
    isLoading,
    isLoadingUsage,
    loadQuota,
    loadProviderUsage,
  } = useQuota();

  useEffect(() => {
    void loadProviderUsage();
  }, [loadProviderUsage]);

  const isInitialLoading = isLoading && accounts === null;
  const showEmptyState = !isLoading && !error && accounts?.length === 0;
  const showGrid = accounts !== null && accounts.length > 0;

  const usageMap = new Map((providerUsage ?? []).map((u) => [u.accountId, u]));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Quota Tracker</h2>
          <p className="text-sm text-muted-foreground">
            Pantau penggunaan token dan jendela reset untuk setiap akun
            penyedia.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void loadQuota();
            void loadProviderUsage();
          }}
          disabled={isLoading || isLoadingUsage}
        >
          {isLoading || isLoadingUsage ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          Muat ulang
        </Button>
      </div>

      {isInitialLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Memuat quota…
        </div>
      ) : null}

      {!isInitialLoading && error ? (
        <Alert variant="destructive">
          <GaugeIcon />
          <AlertTitle>Quota tidak dapat dimuat</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQuota()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {showEmptyState ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>Belum ada akun quota</EmptyTitle>
            <EmptyDescription>
              Detail quota akan muncul setelah akun penyedia dikonfigurasi.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadQuota()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Muat ulang quota
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {showGrid ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const usage = usageMap.get(account.id);
            return (
              <QuotaCard
                key={account.id}
                account={account}
                providerQuotas={usage?.quotas}
                plan={usage?.plan}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
