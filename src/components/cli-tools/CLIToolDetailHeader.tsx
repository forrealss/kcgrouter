import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleSlash2Icon,
  TerminalIcon,
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
    return <TerminalIcon className="size-5 text-muted-foreground" />;
  }

  return (
    <img
      src={toolMeta.icon}
      alt=""
      className="size-7 object-contain"
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
  const isReady = Boolean(status?.installed && status.configured);

  return (
    <header className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit px-2 text-muted-foreground hover:text-foreground"
        onClick={() => navigate("/cli-tools")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        CLI Tools
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/30 bg-primary/10">
            <ToolHeaderIcon toolMeta={toolMeta} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                Client / configuration
              </p>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {toolMeta?.name ?? toolId}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {toolMeta?.description ?? "Configure this client for KCG Router."}
            </p>
            {status?.configPath ? (
              <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                CONFIG <span className="text-muted-foreground/50">·</span>{" "}
                {status.configPath}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
            <span
              className={
                status?.installed
                  ? "size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                  : "size-1.5 rounded-full bg-muted-foreground/50"
              }
            />
            {status?.installed ? "INSTALLED" : "NOT DETECTED"}
          </Badge>
          <Badge
            variant={isReady ? "default" : "outline"}
            className="gap-1.5 font-mono text-[10px]"
          >
            {isReady ? <CheckCircle2Icon /> : <CircleSlash2Icon />}
            {isReady ? "CONNECTED" : "NOT CONFIGURED"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
