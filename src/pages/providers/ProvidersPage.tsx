import { BoxesIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import {
  ProviderCard,
  ProviderCardSkeleton,
} from "@/components/providers/ProviderCard";
import { ProviderFormDialog } from "@/components/providers/ProviderFormDialog";
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
import { useProviders } from "@/hooks/useProviders";
import { useRouter } from "@/hooks/useRouter";

export function ProvidersPage() {
  const { providers, isLoading, error, refreshProviders } = useProviders();
  const { navigate } = useRouter();
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  const builtinProviders = providers?.filter((p) => p.isBuiltin) ?? [];
  const customProviders = providers?.filter((p) => !p.isBuiltin) ?? [];

  function handleProviderClick(providerId: string) {
    navigate(`/providers/${providerId}`);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            Kelola koneksi penyedia AI Anda.
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
            Tambah penyedia
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <BoxesIcon />
          <AlertTitle>Penyedia tidak dapat dimuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {providers === null ? (
        isLoading ? (
          <div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-label="Memuat penyedia"
          >
            <ProviderCardSkeleton />
            <ProviderCardSkeleton />
            <ProviderCardSkeleton />
          </div>
        ) : null
      ) : providers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>Belum ada penyedia</EmptyTitle>
            <EmptyDescription>
              Tambahkan penyedia untuk mulai meneruskan permintaan.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setIsProviderDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Tambah penyedia
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {/* Built-in Providers */}
          {builtinProviders.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Penyedia Bawaan
              </h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {builtinProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    onClick={() => handleProviderClick(provider.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Custom Providers */}
          {customProviders.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Penyedia Kustom
              </h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {customProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    onClick={() => handleProviderClick(provider.id)}
                    onDelete={refreshProviders}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      <ProviderFormDialog
        open={isProviderDialogOpen}
        onOpenChange={setIsProviderDialogOpen}
        onSaved={() => refreshProviders()}
      />
    </section>
  );
}
