import {
  CheckCircleIcon,
  CopyIcon,
  DownloadIcon,
  FlaskConicalIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { FetchModelsDialog } from "@/components/providers/FetchModelsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { TestStatusValue } from "@/hooks/useProviderDetail";
import type {
  ModelCandidate,
  Provider,
  ProviderAccount,
  ProviderModel,
} from "@/types/provider";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  async function handleCopyModelId(modelId: string) {
    await navigator.clipboard.writeText(modelId);
    setCopiedId(modelId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const canFetchModels =
    provider.transport === "openai" ||
    provider.transport === "mimo" ||
    provider.transport === "qoder";

  const enabledModels = models.filter((m) => m.enabled);
  const disabledModels = models.filter((m) => !m.enabled);

  function renderModelActions(model: ProviderModel, isEnabled: boolean) {
    const isTesting = testingModelId === model.id;
    const testStatus = modelTestStatus[model.id];
    const isDisabled = isTesting || accounts.length === 0;

    return (
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => handleTestModel(model)}
          disabled={isDisabled}
          title={
            testStatus?.status === "ok"
              ? "OK"
              : testStatus?.status === "error"
                ? (testStatus.message ?? "Error")
                : "Test model"
          }
        >
          {isTesting ? (
            <Spinner className="size-4" />
          ) : testStatus?.status === "ok" ? (
            <CheckCircleIcon className="size-4 text-green-500" />
          ) : testStatus?.status === "error" ? (
            <XCircleIcon className="size-4 text-red-500" />
          ) : (
            <FlaskConicalIcon className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onToggleModel(model)}
          title={isEnabled ? "Disable" : "Enable"}
        >
          {isEnabled ? (
            <PowerOffIcon className="size-4" />
          ) : (
            <PowerIcon className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDeleteModel(model.id)}
          title="Delete"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/15 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/70" />
            <CardTitle className="text-base">Available models</CardTitle>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {models.length.toString().padStart(2, "0")}
            </span>
          </div>
          <CardDescription className="mt-1">
            Enable models via{" "}
            <code className="font-mono text-xs">
              {provider.prefix}/model-id
            </code>
            .
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {canFetchModels && onFetchModels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onFetchModels()}
              disabled={fetchingModels}
              title="Pull the live model list from this provider"
            >
              {fetchingModels ? (
                <Spinner className="size-4" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Fetch Models
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsAddModelOpen(!isAddModelOpen)}
          >
            <PlusIcon data-icon="inline-start" />
            Add Model
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-4 md:p-5">
        {isAddModelOpen ? (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Model ID (e.g. gpt-4o)"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Display name (e.g. GPT-4o)"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddModel}
                disabled={
                  isAddingModel || !newModelId.trim() || !newModelName.trim()
                }
              >
                {isAddingModel ? <Spinner className="size-4" /> : "Add"}
              </Button>
            </div>
          </div>
        ) : null}

        {enabledModels.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Enabled
              </p>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {enabledModels.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enabledModels.map((model) => {
                return (
                  <div
                    key={model.id}
                    className="flex flex-col gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.07]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {model.modelName}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {provider.prefix}/{model.modelId}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              handleCopyModelId(
                                `${provider.prefix}/${model.modelId}`,
                              )
                            }
                            title="Copy model ID"
                          >
                            {copiedId ===
                            `${provider.prefix}/${model.modelId}` ? (
                              <CheckCircleIcon className="size-3.5 text-green-500" />
                            ) : (
                              <CopyIcon className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {model.contextLength ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                        >
                          {(model.contextLength / 1_000).toFixed(0)}K
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between border-t border-green-500/10 pt-2">
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <PowerIcon className="size-3.5" />
                        <span className="font-medium">Active</span>
                      </div>
                      {renderModelActions(model, true)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {disabledModels.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                Disabled
              </p>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {disabledModels.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {disabledModels.map((model) => {
                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 opacity-70 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-muted-foreground">
                        {model.modelName}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-mono text-xs text-muted-foreground/70">
                          {provider.prefix}/{model.modelId}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            handleCopyModelId(
                              `${provider.prefix}/${model.modelId}`,
                            )
                          }
                          title="Copy model ID"
                        >
                          {copiedId ===
                          `${provider.prefix}/${model.modelId}` ? (
                            <CheckCircleIcon className="size-3.5 text-green-500" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {renderModelActions(model, false)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {models.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <PowerIcon className="size-5" />
            </span>
            <div>
              <p className="font-mono text-sm text-foreground">
                NO MODELS REGISTERED
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a model manually or fetch the upstream catalog.
              </p>
            </div>
          </div>
        ) : null}
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
