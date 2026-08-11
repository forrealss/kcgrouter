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
            Configure CLI tools to connect to KCG Router.
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
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>CLI tools could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {tools === null ? (
        isLoading ? (
          <div
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-label="Loading CLI tools"
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
            <EmptyTitle>No CLI tools</EmptyTitle>
            <EmptyDescription>
              No CLI tools are available to configure yet.
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
