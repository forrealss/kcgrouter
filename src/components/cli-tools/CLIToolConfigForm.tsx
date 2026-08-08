import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import type { CLIToolMessage } from "@/hooks/useCLIToolDetail";
import { apiClient } from "@/lib/api-client";
import type {
  ApiKeySummary,
  CLIToolApplyPayload,
  CLIToolDetails,
} from "@/types/cli-tool";

interface CLIToolConfigFormProps {
  status: CLIToolDetails | null;
  modelOptions: MultiComboboxOption[];
  apiKeys: ApiKeySummary[];
  defaultEndpoint: string;
  isSaving: boolean;
  message: CLIToolMessage | null;
  onApply: (payload: CLIToolApplyPayload) => Promise<void>;
  onReset: () => Promise<void>;
}

export function CLIToolConfigForm({
  status,
  modelOptions,
  apiKeys,
  defaultEndpoint,
  isSaving,
  message,
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
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>
          Point this CLI tool to KCG Router. All requests are routed through the{" "}
          <code className="font-mono">/v1</code> endpoint.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="endpoint">Endpoint</FieldLabel>
              <FieldDescription>
                Base URL of the router. Defaults to{" "}
                <code className="font-mono text-xs">{defaultEndpoint}</code>.
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
                  onValueChange={(id) => void handleApiKeySelect(id)}
                >
                  <SelectTrigger className="flex-1">
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
              <FieldLabel htmlFor="subagent-model">Subagent Model</FieldLabel>
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
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}

      <CardFooter className="justify-between">
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
