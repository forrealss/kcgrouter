import { ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

interface ToolEntry {
  name: string;
  icon: string;
  description: string;
  installed: boolean;
  configured: boolean;
}

interface CLIToolsListProps {
  onSelect: (toolId: string) => void;
}

const LOADING_SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export function CLIToolsListPage({ onSelect }: CLIToolsListProps) {
  const [tools, setTools] = useState<Record<string, ToolEntry> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Record<string, ToolEntry>>(
        "/api/cli-tools",
        { signal },
      );
      setTools(data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(getApiErrorMessage(err));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void loadTools(ctrl.signal);
    return () => ctrl.abort();
  }, [loadTools]);

  if (isLoading) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">CLI Tools</h2>
          <p className="text-sm text-muted-foreground">
            Konfigurasi CLI tools untuk terhubung ke KCG Router.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {LOADING_SKELETON_KEYS.map((k) => (
            <Card key={k}>
              <CardContent className="flex items-center gap-3 py-5 px-4">
                <div className="size-10 shrink-0 rounded-lg bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-32 animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">CLI Tools</h2>
          <p className="text-sm text-muted-foreground">
            Konfigurasi CLI tools untuk terhubung ke KCG Router.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </section>
    );
  }

  const entries = tools ? Object.entries(tools) : [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">CLI Tools</h2>
        <p className="text-sm text-muted-foreground">
          Konfigurasi CLI tools untuk terhubung ke KCG Router.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {entries.map(([id, tool]) => (
          <Button
            key={id}
            variant="ghost"
            className="h-auto w-full justify-start rounded-lg border p-0"
            onClick={() => onSelect(id)}
          >
            <Card className="h-full w-full border-0 shadow-none">
              <CardContent className="flex items-center gap-3 py-5 px-4">
                <div className="size-10 shrink-0 flex items-center justify-center rounded-lg bg-muted overflow-hidden">
                  <img
                    src={tool.icon}
                    alt={tool.name}
                    className="size-8 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {tool.name}
                    </span>
                    {tool.configured ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 shrink-0"
                      >
                        Connected
                      </Badge>
                    ) : tool.installed ? (
                      <Badge variant="outline" className="shrink-0">
                        Not configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        Not installed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {tool.description}
                  </p>
                </div>
                <ChevronRightIcon className="size-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Button>
        ))}
      </div>
    </section>
  );
}
