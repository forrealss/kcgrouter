import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MultiCombobox,
  type MultiComboboxOption,
} from "@/components/ui/multi-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ModelGroupMeta } from "@/hooks/useCLIToolDetail";
import { apiClient } from "@/lib/api-client";
import type {
  ApiKeySummary,
  CLIToolApplyPayload,
  CLIToolDetails,
} from "@/types/cli-tool";

interface CLIToolConfigFormProps {
  status: CLIToolDetails | null;
  modelOptions: MultiComboboxOption[];
  modelGroupMeta: Record<string, ModelGroupMeta>;
  apiKeys: ApiKeySummary[];
  defaultEndpoint: string;
  isSaving: boolean;
  onApply: (payload: CLIToolApplyPayload) => Promise<void>;
  onReset: () => Promise<void>;
}

export function CLIToolConfigForm({
  status,
  modelOptions,
  modelGroupMeta,
  apiKeys,
  defaultEndpoint,
  isSaving,
  onApply,
  onReset,
}: CLIToolConfigFormProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [subagentModel, setSubagentModel] = useState("");

  // Sync fields from the loaded config whenever status changes
  // (initial load, after apply, after reset).
  useEffect(() => {
    const toolDetails = status?.details;
    setSelectedEndpoint(toolDetails?.baseUrl ?? defaultEndpoint);
    setSelectedModels(toolDetails?.models ?? []);
    setActiveModel(toolDetails?.activeModel ?? "");
  }, [status, defaultEndpoint]);

  async function handleApiKeySelect(id: string) {
    setSelectedApiKeyId(id);
    try {
      const res = await apiClient.get<{ key: string }>(
        `/api/settings/api-keys/${encodeURIComponent(id)}/key`,
      );
      setSelectedApiKey(res.key);
    } catch {
      // ignore — user can type manually
    }
  }

  function handleModelsChange(next: string[]) {
    setSelectedModels(next);
    if (activeModel && !next.includes(activeModel)) {
      setActiveModel(next[0] ?? "");
    }
  }

  function handleSubmit() {
    void onApply({
      baseUrl: selectedEndpoint.trim(),
      apiKey: selectedApiKey,
      models: selectedModels,
      activeModel,
      subagentModel: subagentModel || undefined,
    });
  }

  function handleReset() {
    setSubagentModel("");
    void onReset();
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>
          Point this CLI tool to KCG Router. All requests are routed through the{" "}
          <code className="font-mono">/v1</code> endpoint.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-[200px_minmax(0,1fr)]">
          {/* Endpoint */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="endpoint">Endpoint</Label>
            <p className="text-sm text-muted-foreground">
              Base URL of the router. Defaults to{" "}
              <code className="font-mono text-xs">{defaultEndpoint}</code>.
            </p>
          </div>
          <div>
            <Input
              id="endpoint"
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              placeholder={defaultEndpoint}
              className="w-full font-mono text-sm"
            />
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="apikey">API Key</Label>
            <p className="text-sm text-muted-foreground">
              Select an existing key or enter manually.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            {apiKeys.length > 0 ? (
              <Select
                value={selectedApiKeyId}
                onValueChange={(id) => void handleApiKeySelect(id)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select API key..." />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {selectedApiKeyId === "__custom" || apiKeys.length === 0 ? (
              <Input
                id="apikey"
                type="password"
                value={selectedApiKey}
                onChange={(e) => setSelectedApiKey(e.target.value)}
                placeholder="sk_kcgrouter"
                className="w-full font-mono text-sm"
              />
            ) : null}
          </div>

          {/* Models */}
          <div className="flex flex-col gap-1">
            <Label>Models</Label>
            <p className="text-sm text-muted-foreground">
              Models this tool can use. Star one to set it as the default.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <MultiCombobox
              className="w-full"
              options={modelOptions}
              value={selectedModels}
              onValueChange={handleModelsChange}
              activeValue={activeModel}
              onActiveChange={setActiveModel}
              emptyLabel="No models selected"
              emptyHint="Pick models from your enabled providers, then star one to make it the default."
              searchPlaceholder="Search models..."
              addLabel="Add model"
              dialogTitle="Select models"
              doneLabel="Done"
              noResultsLabel="No models found"
              groupMeta={modelGroupMeta}
            />
            {modelOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No enabled models found. Enable models in the Providers page
                first.
              </p>
            ) : null}
          </div>

          {/* Subagent Model */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="subagent-model">Subagent Model</Label>
            <p className="text-sm text-muted-foreground">
              Model used for subagent tasks. Leave empty to skip.
            </p>
          </div>
          <div className="flex w-full items-center gap-2">
            <Combobox
              className="flex-1"
              options={modelOptions}
              value={subagentModel}
              onValueChange={setSubagentModel}
              placeholder="Select model..."
              searchPlaceholder="Search models..."
              dialogTitle="Select subagent model"
              closeLabel="Close"
              noResultsLabel="No models found"
              customLabel="Use"
              groupMeta={modelGroupMeta}
            />
            {subagentModel ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSubagentModel("")}
                aria-label="Clear subagent model"
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-between border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isSaving || !status?.configured}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving || !selectedEndpoint.trim()}
        >
          {isSaving ? <Spinner data-icon="inline-start" /> : null}
          Apply
        </Button>
      </CardFooter>
    </Card>
  );
}

export function CLIToolConfigFormSkeleton() {
  return (
    <Card aria-hidden className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-5 w-32" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
          </div>
          <Skeleton className="h-9 w-full" />

          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-48 max-w-full" />
          </div>
          <Skeleton className="h-9 w-full" />

          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-56 max-w-full" />
          </div>
          <Skeleton className="h-9 w-full" />

          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-44 max-w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      </CardContent>
      <CardFooter className="justify-between border-t">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-24" />
      </CardFooter>
    </Card>
  );
}
