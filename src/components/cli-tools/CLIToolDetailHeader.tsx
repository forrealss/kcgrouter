import {
  ArrowLeftIcon,
  CheckIcon,
  Settings2Icon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/hooks/useRouter";
import type { CLIToolDetails, CLIToolSummary } from "@/types/cli-tool";

interface CLIToolDetailHeaderProps {
  toolId: string;
  toolMeta: CLIToolSummary | null;
  status: CLIToolDetails | null;
}

function ToolHeaderIcon({ toolMeta }: { toolMeta: CLIToolSummary | null }) {
  const [isBroken, setIsBroken] = useState(false);

  if (!toolMeta?.icon || isBroken) {
    return <TerminalIcon className="size-5" />;
  }

  return (
    <img
      src={toolMeta.icon}
      alt=""
      className="size-8 object-contain"
      onError={() => setIsBroken(true)}
    />
  );
}

export function CLIToolDetailHeader({
  toolId,
  toolMeta,
  status,
}: CLIToolDetailHeaderProps) {
  const { navigate } = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/cli-tools")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to CLI Tools
      </Button>

      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          <ToolHeaderIcon toolMeta={toolMeta} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {toolMeta?.name ?? toolId}
            </h1>
            {status ? (
              <>
                {status.installed ? (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400"
                  >
                    <CheckIcon />
                    Installed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <XIcon />
                    Not detected
                  </Badge>
                )}
                {status.configured ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                  >
                    <Settings2Icon />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Settings2Icon />
                    Not configured
                  </Badge>
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
    </div>
  );
}
