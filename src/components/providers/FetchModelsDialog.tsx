import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ModelCandidate, Provider } from "@/types/provider";

interface FetchModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider;
  candidates: ModelCandidate[];
  importing: boolean;
  onImport: (selected: ModelCandidate[]) => void;
}

export function FetchModelsDialog({
  open,
  onOpenChange,
  provider,
  candidates,
  importing,
  onImport,
}: FetchModelsDialogProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

  // Reset selection when the dialog opens with a fresh candidate list:
  // pre-check every model that is not already imported.
  useEffect(() => {
    if (open) {
      setSelected(
        new Set(candidates.filter((c) => !c.exists).map((c) => c.modelId)),
      );
      setQuery("");
    }
  }, [open, candidates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.modelId.toLowerCase().includes(q) ||
        c.modelName.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const importable = candidates.filter((c) => !c.exists);
  const selectedCount = importable.filter((c) =>
    selected.has(c.modelId),
  ).length;

  function toggle(modelId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedCount === importable.length && importable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map((c) => c.modelId)));
    }
  }

  function handleImport() {
    const chosen = candidates.filter((c) => selected.has(c.modelId));
    if (chosen.length === 0) return;
    onImport(chosen);
  }

  const newCount = candidates.filter((c) => !c.exists).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Models</DialogTitle>
          <DialogDescription>
            {newCount} new models from {provider.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon
                data-icon="inline-start"
                className="pointer-events-none text-muted-foreground"
              />
              <Input
                placeholder="Search models..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
              disabled={importing}
            >
              {selectedCount === importable.length && importable.length > 0
                ? "Deselect all"
                : "Select all"}
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border">
            {candidates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                The provider returned no models.
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No models match your search.
              </p>
            ) : (
              <ul className="flex flex-col">
                {" "}
                {filtered.map((candidate) => {
                  const alreadyImported = candidate.exists;
                  const checked = selected.has(candidate.modelId);
                  return (
                    <li
                      key={candidate.modelId}
                      className="border-b last:border-b-0"
                    >
                      <label
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          alreadyImported
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-accent/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={alreadyImported || checked}
                          disabled={alreadyImported || importing}
                          onChange={() => toggle(candidate.modelId)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {candidate.modelName}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {candidate.modelId}
                          </span>
                        </span>
                        {candidate.contextLength ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 bg-muted/50"
                          >
                            {(candidate.contextLength / 1_000).toFixed(0)}K
                          </Badge>
                        ) : null}
                        {alreadyImported ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                          >
                            IMPORTED
                          </Badge>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
          >
            {importing ? <Spinner data-icon="inline-start" /> : null}
            Import {selectedCount} models
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
