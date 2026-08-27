import { ArrowLeftIcon, FileCodeIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useRouter } from "@/hooks/useRouter";
import { cliToolStateMeta, resolveCLIToolState } from "@/lib/cli-tool-status";
import { cn } from "@/lib/utils";
import type { CLIToolDetails, CLIToolSummary } from "@/types/cli-tool";

interface CLIToolDetailHeaderProps {
  toolId: string;
  toolMeta: CLIToolSummary | null;
  status: CLIToolDetails | null;
  isLoading?: boolean;
}

function ToolHeaderIcon({ toolMeta }: { toolMeta: CLIToolSummary | null }) {
  const [isBroken, setIsBroken] = useState(false);
  const isDark = useDarkMode();

  if (!toolMeta?.icon || isBroken) {
    return <TerminalIcon className="size-5 text-muted-foreground" />;
  }

  return (
    <img
      src={isDark && toolMeta.darkIcon ? toolMeta.darkIcon : toolMeta.icon}
      alt=""
      className="size-6 object-contain"
      onError={() => setIsBroken(true)}
    />
  );
}

export function CLIToolDetailHeader({
  toolId,
  toolMeta,
  status,
  isLoading = false,
}: CLIToolDetailHeaderProps) {
  const { navigate } = useRouter();
  const state = status
    ? resolveCLIToolState({
        installed: status.installed,
        configured: status.configured,
      })
    : null;
  const meta = state ? cliToolStateMeta[state] : null;
  const StateIcon = meta?.icon;

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
        onClick={() => navigate("/cli-tools")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        All CLI tools
      </Button>

      <Card className="gap-0 overflow-hidden border-border/70 py-0">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
              state === "connected"
                ? "border-success/30 bg-success/10"
                : "border-border/70 bg-muted/40",
            )}
          >
            <ToolHeaderIcon toolMeta={toolMeta} />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {toolMeta?.name ?? toolId}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {toolMeta?.description ?? "Point this client at the router."}
            </p>
          </div>

          {isLoading || !meta || !StateIcon ? (
            <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
          ) : (
            <div className="flex shrink-0 flex-col items-start gap-0.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 sm:items-end">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-medium",
                  meta.text,
                )}
              >
                <span
                  className={cn("size-2 rounded-full", meta.dot)}
                  aria-hidden
                />
                <StateIcon className="size-3.5" />
                {meta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {meta.hint}
              </span>
            </div>
          )}
        </CardContent>

        {status?.configPath ? (
          <div className="flex min-w-0 items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-2.5">
            <FileCodeIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              Config
            </span>
            <code
              className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
              title={status.configPath}
            >
              {status.configPath}
            </code>
            <CopyButton
              value={status.configPath}
              label="config path"
              className="-my-1 shrink-0"
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
