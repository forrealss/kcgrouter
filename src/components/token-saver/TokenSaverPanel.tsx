"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type FilterName =
  | "git-diff"
  | "git-status"
  | "grep"
  | "find"
  | "ls"
  | "tree"
  | "dedup-log"
  | "smart-truncate";

type TokenSaverFilter = {
  name: FilterName;
  active: boolean;
};

type TokenSaverSettings = {
  enabled: boolean;
  filters: TokenSaverFilter[];
  totalTokensSaved: number;
  updatedAt: string;
};

const filterDetails: Record<
  FilterName,
  { label: string; description: string }
> = {
  "git-diff": {
    label: "Git diff",
    description: "Reduces repeated diff output.",
  },
  "git-status": {
    label: "Git status",
    description: "Condenses repository status output.",
  },
  grep: {
    label: "Grep",
    description: "Trims repeated search results.",
  },
  find: {
    label: "Find",
    description: "Limits redundant file matches.",
  },
  ls: {
    label: "List files",
    description: "Condenses directory listings.",
  },
  tree: {
    label: "Directory tree",
    description: "Truncates large tree output.",
  },
  "dedup-log": {
    label: "Deduplicate logs",
    description: "Removes duplicate log lines.",
  },
  "smart-truncate": {
    label: "Smart truncation",
    description: "Keeps the most useful portion of long output.",
  },
};

function isFilterName(value: unknown): value is FilterName {
  return typeof value === "string" && value in filterDetails;
}

function isTokenSaverSettings(value: unknown): value is TokenSaverSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Record<string, unknown>;

  return (
    typeof settings.enabled === "boolean" &&
    Array.isArray(settings.filters) &&
    settings.filters.every(
      (filter) =>
        !!filter &&
        typeof filter === "object" &&
        isFilterName((filter as Record<string, unknown>).name) &&
        typeof (filter as Record<string, unknown>).active === "boolean",
    ) &&
    typeof settings.totalTokensSaved === "number" &&
    typeof settings.updatedAt === "string"
  );
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

function TokenSaverPanel() {
  const [settings, setSettings] = useState<TokenSaverSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await apiClient.get<unknown>("/api/settings/token-saver", {
        signal,
      });

      if (!isTokenSaverSettings(data)) {
        throw new Error("Token saver settings returned an invalid response.");
      }

      setSettings(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setLoadError(getApiErrorMessage(error));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);

    return () => controller.abort();
  }, [loadSettings]);

  const persistEnabled = useCallback(
    async (enabled: boolean) => {
      if (!settings || isSaving) {
        return;
      }

      const previousSettings = settings;
      setSettings({ ...previousSettings, enabled });
      setIsSaving(true);
      setSaveError(null);

      try {
        const data = await apiClient.patch<unknown>(
          "/api/settings/token-saver-default",
          { enabled },
        );

        if (
          !data ||
          typeof data !== "object" ||
          (data as Record<string, unknown>).ok !== true
        ) {
          throw new Error("Token saver setting was not saved.");
        }
      } catch (error) {
        setSettings(previousSettings);
        setSaveError(getApiErrorMessage(error));
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, settings],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token saver</CardTitle>
          <CardDescription>
            Reduce the amount of tool output included in your context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading token saver settings…
          </div>
        </CardContent>
        <CardFooter>
          <span className="text-sm text-muted-foreground">
            Usage statistics will appear when settings load.
          </span>
        </CardFooter>
      </Card>
    );
  }

  if (loadError || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token saver</CardTitle>
          <CardDescription>
            Reduce the amount of tool output included in your context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Could not load token saver</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={() => void loadSettings()}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token saver</CardTitle>
        <CardDescription>
          Reduce the amount of tool output included in your context.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal" data-disabled={isSaving || undefined}>
            <FieldContent>
              <FieldLabel htmlFor="token-saver-enabled">
                Enable token saver by default
              </FieldLabel>
              <FieldDescription>
                Apply available output filters to new sessions.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="token-saver-enabled"
              checked={settings.enabled}
              disabled={isSaving}
              onCheckedChange={(checked) => void persistEnabled(checked)}
            />
          </Field>
        </FieldGroup>

        {saveError && (
          <Alert variant="destructive">
            <AlertTitle>Could not save your preference</AlertTitle>
            <AlertDescription>
              <p>{saveError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void persistEnabled(!settings.enabled)}
              >
                Retry save
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <FieldSet>
          <FieldLegend variant="label">Supported filters</FieldLegend>
          <FieldGroup>
            {settings.filters.map((filter) => {
              const detail = filterDetails[filter.name];

              return (
                <Field key={filter.name} orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>{detail.label}</FieldLabel>
                    <FieldDescription>{detail.description}</FieldDescription>
                  </FieldContent>
                  <Badge variant={filter.active ? "secondary" : "outline"}>
                    {filter.active ? "Active" : "Inactive"}
                  </Badge>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      </CardContent>
      <CardFooter className="justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            Total tokens saved
          </span>
          <span className="text-2xl font-semibold">
            {new Intl.NumberFormat().format(settings.totalTokensSaved)}
          </span>
        </div>
        {isSaving ? (
          <Badge variant="secondary">
            <Spinner data-icon="inline-start" />
            Saving…
          </Badge>
        ) : (
          <Badge variant={settings.enabled ? "default" : "outline"}>
            {settings.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {formatUpdatedAt(settings.updatedAt)}
        </span>
      </CardFooter>
    </Card>
  );
}

export { TokenSaverPanel };
export default TokenSaverPanel;
