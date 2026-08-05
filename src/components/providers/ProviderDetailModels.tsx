import {
  CheckCircleIcon,
  CopyIcon,
  FlaskConicalIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
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
import type { TestStatus } from "@/hooks/useProviderDetail";
import type {
  Provider,
  ProviderAccount,
  ProviderModel,
} from "@/types/provider";

interface ProviderDetailModelsProps {
  provider: Provider;
  models: ProviderModel[];
  accounts: ProviderAccount[];
  testingModelId: string | null;
  modelTestStatus: Record<string, TestStatus>;
  onToggleModel: (model: ProviderModel) => void;
  onAddModel: (modelId: string, modelName: string) => void;
  onDeleteModel: (modelId: string) => void;
  onTestModel: (model: ProviderModel, accountId: string) => void;
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
            testStatus === "ok"
              ? "OK"
              : testStatus === "error"
                ? "Error"
                : "Test model"
          }
        >
          {isTesting ? (
            <Spinner className="size-4" />
          ) : testStatus === "ok" ? (
            <CheckCircleIcon className="size-4 text-green-500" />
          ) : testStatus === "error" ? (
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Available Models</CardTitle>
          <CardDescription>
            Enable models for use via{" "}
            <code className="text-xs">{provider.prefix}/model-id</code>.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsAddModelOpen(!isAddModelOpen)}
        >
          <PlusIcon data-icon="inline-start" />
          Add Model
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isAddModelOpen ? (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex gap-2">
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
            <p className="text-xs font-medium text-muted-foreground">
              Enabled ({enabledModels.length})
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enabledModels.map((model) => {
                return (
                  <div
                    key={model.id}
                    className="flex flex-col gap-2 rounded-lg border border-green-500/20 bg-background p-3 shadow-sm"
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
            <p className="text-xs font-medium text-muted-foreground">
              Disabled ({disabledModels.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {disabledModels.map((model) => {
                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-transparent bg-background px-3 py-2 opacity-70"
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
                    <div className="flex items-center gap-0.5 shrink-0">
                      {renderModelActions(model, false)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No models configured. Click "Add Model" to add one.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
