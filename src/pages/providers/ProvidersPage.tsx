import {
  ActivityIcon,
  BoxesIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useProviders } from "@/hooks/useProviders";
import { useRouter } from "@/hooks/useRouter";
import { getLatestAccountError } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

function InventoryMetric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof ServerIcon;
  tone?: "neutral" | "ok" | "bad";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card px-4 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          tone === "ok" && "border-success/30 bg-success/10 text-success",
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
        <p className="flex items-baseline gap-1.5">
          <span className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
          </span>
          {hint ? (
            <span className="truncate text-xs text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function ProviderGroup({
  title,
  providers,
  accountsFor,
  onOpen,
  onDelete,
}: {
  title: string;
  providers: Provider[];
  accountsFor: (providerId: string) => ProviderAccount[];
  onOpen: (providerId: string) => void;
  onDelete?: () => void;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
        <Badge
          variant="secondary"
          className="font-mono text-[10px] tabular-nums"
        >
          {providers.length}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => {
          const providerAccounts = accountsFor(provider.id);
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              accounts={providerAccounts}
              onClick={() => onOpen(provider.id)}
              onDelete={onDelete}
              lastError={getLatestAccountError(providerAccounts)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ProvidersPage() {
  const { providers, accounts, isLoading, error, refreshProviders } =
    useProviders();
  const { navigate } = useRouter();
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    if (!providers) return null;
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (provider) =>
        provider.name.toLowerCase().includes(q) ||
        provider.prefix.toLowerCase().includes(q) ||
        provider.baseUrl.toLowerCase().includes(q) ||
        transportMeta[provider.transport].label.toLowerCase().includes(q),
    );
  }, [providers, query]);

  const builtinProviders = filtered?.filter((p) => p.isBuiltin) ?? [];
  const customProviders = filtered?.filter((p) => !p.isBuiltin) ?? [];
  const accountsFor = (providerId: string) =>
    accounts[providerId]?.accounts ?? [];

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-72 sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search providers"
            aria-label="Search providers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
            disabled={!providers || providers.length === 0}
          />
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
        <div className="grid gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card">
          <InventoryMetric
            label="Providers"
            value={String(providers?.length ?? 0)}
            hint="upstreams"
            icon={ServerIcon}
          />
          <InventoryMetric
            label="Connections"
            value={String(inventory.connections)}
            hint="credentials"
            icon={KeyRoundIcon}
          />
          <InventoryMetric
            label="Active"
            value={`${inventory.active}/${inventory.connections}`}
            hint="serving traffic"
            icon={ActivityIcon}
            tone={
              inventory.connections > 0 &&
              inventory.active === inventory.connections
                ? "ok"
                : "neutral"
            }
          />
          <InventoryMetric
            label="Errors"
            value={String(inventory.errors)}
            hint={inventory.errors > 0 ? "need attention" : "all clear"}
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
              Add one to start forwarding requests.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Add provider
            </Button>
          </EmptyContent>
        </Empty>
      ) : filtered && filtered.length === 0 ? (
        <Empty className="min-h-48 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No providers match “{query.trim()}”</EmptyTitle>
            <EmptyDescription>
              Searches cover name, prefix, base URL, and transport.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <ProviderGroup
            title="Built-in transports"
            providers={builtinProviders}
            accountsFor={accountsFor}
            onOpen={(id) => navigate(`/providers/${id}`)}
          />
          <ProviderGroup
            title="Custom upstreams"
            providers={customProviders}
            accountsFor={accountsFor}
            onOpen={(id) => navigate(`/providers/${id}`)}
            onDelete={refreshProviders}
          />
        </div>
      )}

      <ProviderFormDialog
        open={isProviderDialogOpen}
        onOpenChange={setIsProviderDialogOpen}
        onSaved={() => refreshProviders()}
        existingProviders={providers ?? []}
      />
    </section>
  );
}
