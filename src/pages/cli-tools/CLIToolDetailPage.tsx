import { ArrowLeftIcon, TerminalIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { Provider, ProviderModel } from "@/types/provider";

interface ToolEntry {
  name: string;
  icon: string;
  description: string;
  installed: boolean;
  configured: boolean;
}

interface ToolDetails {
  installed: boolean;
  configured: boolean;
  configPath: string;
  details?: {
    baseUrl?: string | null;
    models?: string[] | null;
    activeModel?: string | null;
  };
}

interface ModelOption {
  value: string;
  label: string;
  description?: string;
}

interface ApiKeyEntry {
  id: string;
  label: string;
  has_key: boolean;
}

interface CLIToolDetailProps {
  toolId: string;
  onBack: () => void;
}

export function CLIToolDetailPage({ toolId, onBack }: CLIToolDetailProps) {
  const defaultEndpoint = useMemo(() => `${window.location.origin}/v1`, []);

  const [status, setStatus] = useState<ToolDetails | null>(null);
  const [toolMeta, setToolMeta] = useState<ToolEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");

  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [subagentModel, setSubagentModel] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [toolStatus, toolsList, providersList, keysList] =
        await Promise.all([
          apiClient.get<ToolDetails>(`/api/cli-tools/${toolId}`),
          apiClient.get<Record<string, ToolEntry>>("/api/cli-tools"),
          apiClient.get<Provider[]>("/api/providers"),
          apiClient.get<ApiKeyEntry[]>("/api/settings/api-keys"),
        ]);
      setStatus(toolStatus);
      setToolMeta(toolsList[toolId] ?? null);
      setApiKeys(keysList.filter((k) => k.has_key));

      const details = toolStatus.details;
      setSelectedEndpoint(details?.baseUrl ?? defaultEndpoint);
      setSelectedModels(details?.models ?? []);
      setActiveModel(details?.activeModel ?? "");

      const modelLists = await Promise.all(
        providersList.map((p) =>
          apiClient
            .get<ProviderModel[]>(`/api/providers/${p.id}/models`)
            .catch(() => [] as ProviderModel[]),
        ),
      );

      const options: ModelOption[] = [];
      const seen = new Set<string>();
      providersList.forEach((provider, index) => {
        for (const model of modelLists[index] ?? []) {
          if (!model.enabled) continue;
          const value = `${provider.prefix}/${model.modelId}`;
          if (seen.has(value)) continue;
          seen.add(value);
          options.push({
            value,
            label: value,
            description: model.modelName,
          });
        }
      });
      setModelOptions(options);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [toolId, defaultEndpoint]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleApply = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await apiClient.post(`/api/cli-tools/${toolId}`, {
        baseUrl: selectedEndpoint.trim(),
        apiKey: selectedApiKey,
        models: selectedModels,
        activeModel,
        subagentModel: subagentModel || undefined,
      });
      setMessage({ type: "success", text: "Config applied" });
      await loadAll();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await apiClient.delete(`/api/cli-tools/${toolId}`);
      setMessage({ type: "success", text: "Provider removed from config" });
      setSelectedModels([]);
      setActiveModel("");
      setSubagentModel("");
      await loadAll();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelsChange = (next: string[]) => {
    setSelectedModels(next);
    if (activeModel && !next.includes(activeModel)) {
      setActiveModel(next[0] ?? "");
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={onBack}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to CLI Tools
      </Button>

      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {toolMeta?.icon ? (
            <img
              src={toolMeta.icon}
              alt=""
              className="size-8 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <TerminalIcon className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {toolMeta?.name ?? toolId}
            </h1>
            {!isLoading && status ? (
              <>
                {status.installed ? (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400"
                  >
                    Installed
                  </Badge>
                ) : (
                  <Badge variant="outline">Not detected</Badge>
                )}
                {status.configured ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                  >
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </>
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {toolMeta?.description}
            {status?.configPath ? (
              <>
                {" "}
                · Config:{" "}
                <code className="font-mono text-xs">{status.configPath}</code>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading...
          </CardContent>
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Point this CLI tool to KCG Router. All requests are routed through
              the <code className="font-mono">/v1</code> endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="endpoint">Endpoint</FieldLabel>
                  <FieldDescription>
                    Base URL of the router. Defaults to{" "}
                    <code className="font-mono text-xs">{defaultEndpoint}</code>
                    .
                  </FieldDescription>
                </FieldContent>
                <Input
                  id="endpoint"
                  value={selectedEndpoint}
                  onChange={(e) => setSelectedEndpoint(e.target.value)}
                  placeholder={defaultEndpoint}
                  className="max-w-md font-mono text-sm"
                />
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="apikey">API Key</FieldLabel>
                  <FieldDescription>
                    Select an existing key or enter manually.
                  </FieldDescription>
                </FieldContent>
                <div className="flex max-w-md flex-1 items-center gap-2">
                  {apiKeys.length > 0 ? (
                    <Select
                      value={selectedApiKeyId}
                      onValueChange={async (id) => {
                        setSelectedApiKeyId(id);
                        try {
                          const res = await apiClient.get<{ key: string }>(
                            `/api/settings/api-keys/${id}/key`,
                          );
                          setSelectedApiKey(res.key);
                        } catch {
                          // ignore — user can type manually
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select API key..." />
                      </SelectTrigger>
                      <SelectContent>
                        {apiKeys.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
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
                      className="flex-1 font-mono text-sm"
                    />
                  ) : null}
                </div>
              </Field>

              <Field orientation="vertical">
                <FieldContent>
                  <FieldLabel>Models</FieldLabel>
                  <FieldDescription>
                    {activeModel ? (
                      <>
                        Active:{" "}
                        <code className="font-mono text-xs">{activeModel}</code>
                      </>
                    ) : (
                      "Enabled models from all providers. Star one to set it active."
                    )}
                  </FieldDescription>
                </FieldContent>
                <MultiCombobox
                  className="max-w-2xl"
                  options={modelOptions}
                  value={selectedModels}
                  onValueChange={handleModelsChange}
                  activeValue={activeModel}
                  onActiveChange={setActiveModel}
                  emptyLabel="No models selected"
                  searchPlaceholder="Search models..."
                  addLabel="Add model"
                />
                {modelOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No enabled models found. Enable models in the Providers page
                    first.
                  </p>
                ) : null}
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="subagent-model">
                    Subagent Model
                  </FieldLabel>
                  <FieldDescription>
                    Model used for subagent tasks. Leave empty to skip.
                  </FieldDescription>
                </FieldContent>
                <div className="flex max-w-md flex-1 items-center gap-2">
                  <Combobox
                    className="flex-1"
                    options={modelOptions}
                    value={subagentModel}
                    onValueChange={setSubagentModel}
                    placeholder="Select model..."
                    searchPlaceholder="Search models..."
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
              </Field>
            </FieldGroup>
          </CardContent>

          {message ? (
            <CardContent>
              <Alert
                variant={message.type === "error" ? "destructive" : "default"}
              >
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            </CardContent>
          ) : null}

          <CardFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleReset()}
              disabled={isSaving || !status?.configured}
            >
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => void handleApply()}
              disabled={isSaving || !selectedEndpoint.trim()}
            >
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Apply
            </Button>
          </CardFooter>
        </Card>
      )}
    </section>
  );
}
