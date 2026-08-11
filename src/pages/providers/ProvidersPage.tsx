import {
  ActivityIcon,
  BoxesIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  ProviderCard,
  ProviderCardSkeleton,
} from "@/components/providers/ProviderCard";
import { ProviderFormDialog } from "@/components/providers/ProviderFormDialog";
import { EncryptionMismatchAlert } from "@/components/settings/EncryptionMismatchAlert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useProviders } from "@/hooks/useProviders";
import { useRouter } from "@/hooks/useRouter";
import { getLatestAccountError } from "@/lib/provider-errors";
import { cn } from "@/lib/utils";

function InventoryMetric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: typeof ServerIcon;
  tone?: "neutral" | "ok" | "bad";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card px-4 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          tone === "ok" &&
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
          tone === "bad" &&
            "border-destructive/30 bg-destructive/10 text-destructive",
          tone === "neutral" &&
            "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

export function ProvidersPage() {
  const { providers, accounts, isLoading, error, refreshProviders } =
    useProviders();
  const { navigate } = useRouter();
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  const builtinProviders = providers?.filter((p) => p.isBuiltin) ?? [];
  const customProviders = providers?.filter((p) => !p.isBuiltin) ?? [];
  const inventory = useMemo(() => {
    const allAccounts = Object.values(accounts).flatMap(
      (state) => state.accounts ?? [],
    );
    return {
      connections: allAccounts.length,
      active: allAccounts.filter((account) => account.status === "active")
        .length,
      errors: allAccounts.filter((account) => account.status === "error")
        .length,
    };
  }, [accounts]);

  function handleProviderClick(providerId: string) {
    navigate(`/providers/${providerId}`);
  }

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Manage the upstream endpoints and connections used by the router.
        </p>
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
            Refresh
          </Button>
          <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add provider
          </Button>
        </div>
      </header>

      <EncryptionMismatchAlert />

      <Card className="!py-0 overflow-hidden">
        <div className="grid gap-px bg-border/60 sm:grid-cols-3 [&>*]:bg-card">
          <InventoryMetric
            label="Providers"
            value={String(providers?.length ?? 0)}
            icon={ServerIcon}
          />
          <InventoryMetric
            label="Active connections"
            value={`${inventory.active}/${inventory.connections}`}
            icon={ActivityIcon}
            tone="ok"
          />
          <InventoryMetric
            label="Attention required"
            value={String(inventory.errors)}
            icon={TriangleAlertIcon}
            tone={inventory.errors > 0 ? "bad" : "neutral"}
          />
        </div>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <BoxesIcon />
          <AlertTitle>Providers could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {providers === null ? (
        isLoading ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            role="status"
            aria-label="Loading providers"
          >
            <ProviderCardSkeleton />
            <ProviderCardSkeleton />
            <ProviderCardSkeleton />
          </div>
        ) : null
      ) : providers.length === 0 ? (
        <Empty className="min-h-72 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>No providers configured</EmptyTitle>
            <EmptyDescription>
              Add a provider to start forwarding requests upstream.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Add provider
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {builtinProviders.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Built-in transports
                </h3>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {builtinProviders.length} registered
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {builtinProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    accounts={accounts[provider.id]?.accounts ?? []}
                    onClick={() => handleProviderClick(provider.id)}
                    lastError={getLatestAccountError(
                      accounts[provider.id]?.accounts ?? [],
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {customProviders.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Custom upstreams
                </h3>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {customProviders.length} registered
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {customProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    accounts={accounts[provider.id]?.accounts ?? []}
                    onClick={() => handleProviderClick(provider.id)}
                    onDelete={refreshProviders}
                    lastError={getLatestAccountError(
                      accounts[provider.id]?.accounts ?? [],
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ProviderFormDialog
        open={isProviderDialogOpen}
        onOpenChange={setIsProviderDialogOpen}
        onSaved={() => refreshProviders()}
      />
    </section>
  );
}
