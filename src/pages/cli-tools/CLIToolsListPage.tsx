import { RefreshCwIcon, TerminalIcon } from "lucide-react";
import {
  CLIToolCard,
  CLIToolCardSkeleton,
} from "@/components/cli-tools/CLIToolCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useCLITools } from "@/hooks/useCLITools";
import { useRouter } from "@/hooks/useRouter";

export function CLIToolsListPage() {
  const { tools, isLoading, error, refreshTools } = useCLITools();
  const { navigate } = useRouter();

  const entries = tools ? Object.entries(tools) : [];

  function handleToolClick(toolId: string) {
    navigate(`/cli-tools/${toolId}`);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">CLI Tools</h2>
          <p className="text-sm text-muted-foreground">
            Konfigurasi CLI tools untuk terhubung ke KCG Router.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshTools()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Muat ulang
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>CLI tools tidak dapat dimuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {tools === null ? (
        isLoading ? (
          <div
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-label="Memuat CLI tools"
          >
            <CLIToolCardSkeleton />
            <CLIToolCardSkeleton />
            <CLIToolCardSkeleton />
          </div>
        ) : null
      ) : entries.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalIcon />
            </EmptyMedia>
            <EmptyTitle>Tidak ada CLI tool</EmptyTitle>
            <EmptyDescription>
              Belum ada CLI tool yang tersedia untuk dikonfigurasi.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map(([id, tool]) => (
            <CLIToolCard
              key={id}
              tool={tool}
              onClick={() => handleToolClick(id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
