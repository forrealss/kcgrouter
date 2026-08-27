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
import { formatContextLabel } from "@/lib/model-format";
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

  /**
   * Sorted by name only — never by `enabled`. Sorting on the toggled field
   * would reorder the list mid-click, making it look like a different row
   * flipped than the one the user pressed.
   */
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
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
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
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {models.length}
          </span>
        </CardTitle>
        <CardDescription>
          {models.length === 0
            ? "Register the models this provider should expose."
            : `${enabledCount} of ${models.length} routable right now.`}
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

      {isAddModelOpen ? (
        <form
          className="flex flex-col gap-3 border-b border-primary/20 bg-primary/5 px-5 py-4"
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
        <CardContent className="px-5 py-4">
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
        </CardContent>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b border-border/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-64 sm:flex-1">
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
                <TabsTrigger value="all" className="gap-1.5 text-xs">
                  All
                  <span className="font-mono tabular-nums opacity-70">
                    {models.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="enabled" className="gap-1.5 text-xs">
                  On
                  <span className="font-mono tabular-nums opacity-70">
                    {enabledCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="disabled" className="gap-1.5 text-xs">
                  Off
                  <span className="font-mono tabular-nums opacity-70">
                    {models.length - enabledCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {visibleModels.length === 0 ? (
            <CardContent className="px-5 py-4">
              <p className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? `No models match “${query.trim()}”.`
                  : filter === "enabled"
                    ? "No models are enabled yet."
                    : "Every model is enabled."}
              </p>
            </CardContent>
          ) : (
            <TooltipProvider delayDuration={200}>
              <ul className="scrollbar-subtle flex max-h-[34rem] flex-col divide-y divide-border/60 overflow-y-auto">
                {visibleModels.map((model) => {
                  const routeId = `${provider.prefix}/${model.modelId}`;
                  const isTesting = testingModelId === model.id;
                  const testStatus = modelTestStatus[model.id];

                  return (
                    <li
                      key={model.id}
                      className={cn(
                        "group relative flex items-center gap-3 py-2.5 pl-5 pr-3 transition-colors",
                        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors",
                        model.enabled
                          ? "before:bg-success/80 hover:bg-success/[0.04] dark:before:shadow-[0_0_8px] dark:before:shadow-success/60"
                          : "bg-muted/30 before:bg-transparent hover:bg-muted/50",
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label
                            htmlFor={`model-toggle-${model.id}`}
                            className={cn(
                              "flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                              model.enabled
                                ? "border-success/40 bg-success/10 hover:bg-success/15"
                                : "border-border bg-muted/60 hover:bg-muted",
                            )}
                          >
                            <Switch
                              id={`model-toggle-${model.id}`}
                              checked={model.enabled}
                              onCheckedChange={() => onToggleModel(model)}
                              aria-label={`${model.enabled ? "Disable" : "Enable"} ${model.modelName}`}
                              className="data-[state=checked]:border-success data-[state=checked]:bg-success"
                            />
                            <span
                              aria-hidden
                              className={cn(
                                "w-6 font-mono text-[11px] font-semibold tracking-wide",
                                model.enabled
                                  ? "text-success"
                                  : "text-muted-foreground",
                              )}
                            >
                              {model.enabled ? "ON" : "OFF"}
                            </span>
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>
                          {model.enabled
                            ? "Routable — click to stop routing this model"
                            : "Not routable — click to start routing this model"}
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
                          className="hidden shrink-0 font-mono text-[11px] font-normal tabular-nums text-muted-foreground sm:inline-flex"
                        >
                          {formatContextLabel(model.contextLength)}
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
                                <CheckCircleIcon className="size-4 text-success" />
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
                                will stop resolving. You can add it back later.
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
              {visibleModels.length !== models.length ? (
                <div className="border-t border-border/60 bg-muted/20 px-5 py-2">
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {visibleModels.length} of {models.length} shown
                  </p>
                </div>
              ) : null}
            </TooltipProvider>
          )}
        </>
      )}

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
