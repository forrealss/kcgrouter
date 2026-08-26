import {
  CheckCircleIcon,
  DownloadIcon,
  FlaskConicalIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { FetchModelsDialog } from "@/components/providers/FetchModelsDialog";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TestStatusValue } from "@/hooks/useProviderDetail";
import { cn } from "@/lib/utils";
import type {
  ModelCandidate,
  Provider,
  ProviderAccount,
  ProviderModel,
} from "@/types/provider";

type ModelFilter = "all" | "enabled" | "disabled";

interface ProviderDetailModelsProps {
  provider: Provider;
  models: ProviderModel[];
  accounts: ProviderAccount[];
  testingModelId: string | null;
  modelTestStatus: Record<string, TestStatusValue>;
  onToggleModel: (model: ProviderModel) => void;
  onAddModel: (modelId: string, modelName: string) => void;
  onDeleteModel: (modelId: string) => void;
  onTestModel: (model: ProviderModel, accountId: string) => void;
  onFetchModels?: () => void;
  fetchingModels?: boolean;
  modelCandidates?: ModelCandidate[] | null;
  fetchDialogOpen?: boolean;
  importingModels?: boolean;
  onImportModels?: (selected: ModelCandidate[]) => void;
  onCloseFetchDialog?: () => void;
}

function formatContext(contextLength: number): string {
  if (contextLength >= 1_000_000) {
    return `${(contextLength / 1_000_000).toFixed(1).replace(/\.0$/, "")}M context`;
  }
  return `${Math.round(contextLength / 1_000)}K context`;
}

export function ProviderDetailModels({
  provider,
  models,
  accounts,
  testingModelId,
  modelTestStatus,
  onToggleModel,
  onAddModel,
  onDeleteModel,
  onTestModel,
  onFetchModels,
  fetchingModels = false,
  modelCandidates = null,
  fetchDialogOpen = false,
  importingModels = false,
  onImportModels,
  onCloseFetchDialog,
}: ProviderDetailModelsProps) {
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModelFilter>("all");

  const enabledCount = models.filter((m) => m.enabled).length;
  const canFetchModels =
    provider.transport === "openai" ||
    provider.transport === "mimo" ||
    provider.transport === "qoder";
  const hasConnection = accounts.length > 0;

  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models
      .filter((model) => {
        if (filter === "enabled" && !model.enabled) return false;
        if (filter === "disabled" && model.enabled) return false;
        if (!q) return true;
        return (
          model.modelId.toLowerCase().includes(q) ||
          model.modelName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.modelName.localeCompare(b.modelName);
      });
  }, [models, filter, query]);

  async function handleAddModel() {
    if (!newModelId.trim() || !newModelName.trim()) return;
    setIsAddingModel(true);
    try {
      await onAddModel(newModelId.trim(), newModelName.trim());
      setNewModelId("");
      setNewModelName("");
      setIsAddModelOpen(false);
    } finally {
      setIsAddingModel(false);
    }
  }

  function handleTestModel(model: ProviderModel) {
    const firstAccount = accounts[0];
    if (!firstAccount) return;
    onTestModel(model, firstAccount.id);
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          Models
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {models.length}
          </span>
        </CardTitle>
        <CardDescription>
          {models.length === 0
            ? "Register the models this provider should expose."
            : `${enabledCount} enabled and routable right now.`}
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          {canFetchModels && onFetchModels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onFetchModels()}
              disabled={fetchingModels}
            >
              {fetchingModels ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {fetchingModels ? "Fetching" : "Fetch from provider"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={isAddModelOpen ? "secondary" : "outline"}
            onClick={() => setIsAddModelOpen(!isAddModelOpen)}
            aria-expanded={isAddModelOpen}
          >
            {isAddModelOpen ? (
              <XIcon data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            {isAddModelOpen ? "Cancel" : "Add manually"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-5 py-4">
        {isAddModelOpen ? (
          <form
            className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddModel();
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <label
                  htmlFor="new-model-id"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Model ID
                </label>
                <Input
                  id="new-model-id"
                  placeholder="gpt-4o"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="new-model-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Display name
                </label>
                <Input
                  id="new-model-name"
                  placeholder="GPT-4o"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-end"
                disabled={
                  isAddingModel || !newModelId.trim() || !newModelName.trim()
                }
              >
                {isAddingModel ? <Spinner data-icon="inline-start" /> : null}
                Add model
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Requests will route as{" "}
              <code className="font-mono">
                {provider.prefix}/{newModelId.trim() || "model-id"}
              </code>
            </p>
          </form>
        ) : null}

        {models.length === 0 ? (
          <Empty className="gap-4 border border-dashed bg-muted/10 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle className="text-base">
                No models registered
              </EmptyTitle>
              <EmptyDescription>
                {canFetchModels
                  ? "Fetch the provider catalog or add a model ID by hand."
                  : "Add a model ID by hand to expose it through this provider."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:max-w-64">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search models"
                  aria-label="Search models"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <Tabs
                value={filter}
                onValueChange={(value) => setFilter(value as ModelFilter)}
              >
                <TabsList>
                  <TabsTrigger value="all" className="text-xs">
                    All {models.length}
                  </TabsTrigger>
                  <TabsTrigger value="enabled" className="text-xs">
                    Enabled {enabledCount}
                  </TabsTrigger>
                  <TabsTrigger value="disabled" className="text-xs">
                    Disabled {models.length - enabledCount}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {visibleModels.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                No models match “{query}”.
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
                  {visibleModels.map((model) => {
                    const routeId = `${provider.prefix}/${model.modelId}`;
                    const isTesting = testingModelId === model.id;
                    const testStatus = modelTestStatus[model.id];

                    return (
                      <li
                        key={model.id}
                        className={cn(
                          "group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/25",
                          !model.enabled && "bg-muted/10",
                        )}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Switch
                              checked={model.enabled}
                              onCheckedChange={() => onToggleModel(model)}
                              aria-label={`${model.enabled ? "Disable" : "Enable"} ${model.modelName}`}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {model.enabled
                              ? "Enabled — stop routing to this model"
                              : "Disabled — start routing to this model"}
                          </TooltipContent>
                        </Tooltip>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              !model.enabled && "text-muted-foreground",
                            )}
                          >
                            {model.modelName}
                          </p>
                          <div className="flex min-w-0 items-center gap-1">
                            <p
                              className="truncate font-mono text-xs text-muted-foreground"
                              title={routeId}
                            >
                              {routeId}
                            </p>
                            <CopyButton
                              value={routeId}
                              label="model ID"
                              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                            />
                          </div>
                        </div>

                        {model.contextLength ? (
                          <Badge
                            variant="outline"
                            className="hidden shrink-0 text-[11px] font-normal text-muted-foreground sm:inline-flex"
                          >
                            {formatContext(model.contextLength)}
                          </Badge>
                        ) : null}

                        <div className="flex shrink-0 items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleTestModel(model)}
                                disabled={isTesting || !hasConnection}
                              >
                                {isTesting ? (
                                  <Spinner className="size-4" />
                                ) : testStatus?.status === "ok" ? (
                                  <CheckCircleIcon className="size-4 text-emerald-500" />
                                ) : testStatus?.status === "error" ? (
                                  <XCircleIcon className="size-4 text-destructive" />
                                ) : (
                                  <FlaskConicalIcon className="size-4" />
                                )}
                                <span className="sr-only">
                                  Test {model.modelName}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {!hasConnection
                                ? "Add a connection first"
                                : testStatus?.status === "ok"
                                  ? "Last test succeeded"
                                  : testStatus?.status === "error"
                                    ? (testStatus.message ?? "Last test failed")
                                    : "Send a probe request to this model"}
                            </TooltipContent>
                          </Tooltip>

                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    <Trash2Icon className="size-4" />
                                    <span className="sr-only">
                                      Delete {model.modelName}
                                    </span>
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Delete model</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete {model.modelName}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Requests to{" "}
                                  <code className="font-mono">{routeId}</code>{" "}
                                  will stop resolving. You can add it back
                                  later.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep it</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => onDeleteModel(model.id)}
                                >
                                  Delete model
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </TooltipProvider>
            )}
          </>
        )}
      </CardContent>

      {canFetchModels &&
      onFetchModels &&
      onImportModels &&
      onCloseFetchDialog ? (
        <FetchModelsDialog
          open={fetchDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onCloseFetchDialog();
          }}
          provider={provider}
          candidates={modelCandidates ?? []}
          importing={importingModels}
          onImport={(selected) => void onImportModels(selected)}
        />
      ) : null}
    </Card>
  );
}
