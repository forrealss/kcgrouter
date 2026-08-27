import { DownloadIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";

const DISMISSED_UPDATE_KEY = "kcg:dismissed-update";
const microLabel = "font-mono text-[10px] uppercase tracking-[0.16em]";

function readDismissedUpdate(): string | null {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY);
  } catch {
    return null;
  }
}

/**
 * Navbar affordance for release state: an amber pill when a newer version is
 * published, or a muted one when the registry could not be reached. Silent
 * when the install is current. Dismissals are remembered per version so the
 * pill returns for the next release.
 */
export function UpdateBadge() {
  const {
    current,
    latest,
    updateAvailable,
    checkFailed,
    updateCommand,
    isLoading,
    refresh,
  } = useUpdateCheck();
  const [dismissed, setDismissed] = useState<string | null>(
    readDismissedUpdate,
  );

  if (checkFailed) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Update check failed"
            className={`${microLabel} flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-muted-foreground transition-colors hover:bg-muted`}
          >
            <WifiOffIcon className="size-3 shrink-0" />
            <span className="hidden sm:inline">check failed</span>
            <span className="sr-only">Update check failed</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <p className={`${microLabel} text-muted-foreground`}>
            Update check failed
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Could not reach the npm registry, so the latest version is unknown.
            {current ? ` Running v${current}.` : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void refresh()}
            className="mt-3 h-7 w-full text-xs"
          >
            <RefreshCwIcon className="size-3" />
            {isLoading ? "Checking..." : "Retry now"}
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  if (!updateAvailable || !latest || dismissed === latest) return null;

  function dismiss() {
    setDismissed(latest);
    try {
      if (latest) localStorage.setItem(DISMISSED_UPDATE_KEY, latest);
    } catch {}
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Version ${latest} available`}
          className={`${microLabel} flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-300`}
        >
          <DownloadIcon className="size-3 shrink-0" />
          <span className="hidden tabular-nums sm:inline">v{latest}</span>
          <span className="sr-only">Update available</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className={`${microLabel} text-muted-foreground`}>
          Update available
        </p>
        <p className="mt-1.5 font-mono text-sm tabular-nums">
          <span className="text-muted-foreground">v{current}</span>
          <span className="mx-1.5 text-muted-foreground/50">→</span>
          <span className="text-amber-600 dark:text-amber-300">v{latest}</span>
        </p>
        <div className="mt-3 flex items-center gap-1 rounded-md border bg-muted/40 pl-2">
          <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-[11px] text-foreground/80">
            {updateCommand}
          </code>
          <CopyButton value={updateCommand} label="update command" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Restart the router after upgrading.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="mt-1 h-7 w-full text-xs text-muted-foreground"
        >
          Skip this version
        </Button>
      </PopoverContent>
    </Popover>
  );
}
