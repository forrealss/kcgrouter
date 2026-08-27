import {
  ArrowUpFromLineIcon,
  CheckIcon,
  DownloadIcon,
  PackageOpenIcon,
  SearchIcon,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTokenWindow } from "@/lib/model-format";
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

type CandidateFilter = "new" | "all";

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
  const [filter, setFilter] = useState<CandidateFilter>("new");

  const importable = useMemo(
    () => candidates.filter((candidate) => !candidate.exists),
    [candidates],
  );
  const existingCount = candidates.length - importable.length;

  /**
   * Opening with a fresh catalog starts from nothing selected. Pre-checking
   * every new model (the old behaviour) meant one careless click imported the
   * provider's entire catalog — often dozens of models the user will never
   * route to, each of which then has to be deleted by hand.
   */
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
    // Nothing new to review means the "new" tab would open empty.
    setFilter(
      candidates.some((candidate) => !candidate.exists) ? "new" : "all",
    );
  }, [open, candidates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = filter === "new" ? importable : candidates;
    if (!q) return pool;
    return pool.filter(
      (candidate) =>
        candidate.modelId.toLowerCase().includes(q) ||
        candidate.modelName.toLowerCase().includes(q),
    );
  }, [candidates, importable, filter, query]);

  /** Rows the user can actually act on right now. */
  const selectableVisible = visible.filter((candidate) => !candidate.exists);
  const selectedVisibleCount = selectableVisible.filter((candidate) =>
    selected.has(candidate.modelId),
  ).length;
  const allVisibleSelected =
    selectableVisible.length > 0 &&
    selectedVisibleCount === selectableVisible.length;
  const selectedCount = selected.size;

  function toggle(modelId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  /**
   * Acts on the rows currently in view, not the whole catalog — with a search
   * active, "select all" that reached past the filter would silently queue
   * models the user cannot see.
   */
  function toggleVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const candidate of selectableVisible)
          next.delete(candidate.modelId);
      } else {
        for (const candidate of selectableVisible) next.add(candidate.modelId);
      }
      return next;
    });
  }

  function handleImport() {
    const chosen = candidates.filter((candidate) =>
      selected.has(candidate.modelId),
    );
    if (chosen.length === 0) return;
    onImport(chosen);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (importing) return;
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-0 border-b border-border/60 bg-muted/20 px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <DownloadIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">Import models</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                {candidates.length === 0
                  ? `${provider.name} returned no models.`
                  : `${provider.name} offers ${candidates.length} model${candidates.length === 1 ? "" : "s"}. Pick the ones to expose through this provider.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-muted-foreground">
              <PackageOpenIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">No models returned</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              The provider's catalog endpoint responded but listed nothing.
              Check that the connection has access to any models.
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-5 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative sm:max-w-64 sm:flex-1">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search models"
                    aria-label="Search models"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-8"
                    disabled={importing}
                  />
                </div>
                <Tabs
                  value={filter}
                  onValueChange={(value) => setFilter(value as CandidateFilter)}
                >
                  <TabsList>
                    <TabsTrigger
                      value="new"
                      className="gap-1.5 text-xs"
                      disabled={importing}
                    >
                      New
                      <span className="font-mono tabular-nums opacity-70">
                        {importable.length}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="all"
                      className="gap-1.5 text-xs"
                      disabled={importing}
                    >
                      All
                      <span className="font-mono tabular-nums opacity-70">
                        {candidates.length}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {selectedCount} selected
                  {existingCount > 0
                    ? ` · ${existingCount} already imported`
                    : ""}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={toggleVisible}
                  disabled={importing || selectableVisible.length === 0}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {allVisibleSelected
                    ? "Clear these"
                    : `Select these ${selectableVisible.length}`}
                </Button>
              </div>
            </div>

            <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? `No models match “${query.trim()}”.`
                    : "Every model from this provider is already imported."}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {visible.map((candidate) => {
                    const alreadyImported = candidate.exists;
                    const checked = selected.has(candidate.modelId);
                    return (
                      <li key={candidate.modelId}>
                        <label
                          className={cn(
                            "flex w-full items-center gap-3 px-5 py-2.5 transition-colors",
                            alreadyImported
                              ? "cursor-default bg-muted/20"
                              : checked
                                ? "cursor-pointer bg-primary/[0.04] hover:bg-primary/[0.07]"
                                : "cursor-pointer hover:bg-accent/40",
                            importing && "pointer-events-none opacity-60",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={alreadyImported || checked}
                            disabled={alreadyImported || importing}
                            onChange={() => toggle(candidate.modelId)}
                            className="size-4 shrink-0 accent-primary"
                            aria-label={
                              alreadyImported
                                ? `${candidate.modelName} is already imported`
                                : `Import ${candidate.modelName}`
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-sm font-medium",
                                alreadyImported && "text-muted-foreground",
                              )}
                            >
                              {candidate.modelName}
                            </span>
                            <span
                              className="block truncate font-mono text-xs text-muted-foreground"
                              title={`${provider.prefix}/${candidate.modelId}`}
                            >
                              {provider.prefix}/{candidate.modelId}
                            </span>
                          </span>

                          {candidate.contextLength ? (
                            <Badge
                              variant="outline"
                              className="hidden shrink-0 font-mono text-[11px] font-normal tabular-nums text-muted-foreground sm:inline-flex"
                              title={`${candidate.contextLength.toLocaleString()} token context window`}
                            >
                              {formatTokenWindow(candidate.contextLength)}
                            </Badge>
                          ) : null}
                          {candidate.maxOutputTokens ? (
                            <Badge
                              variant="outline"
                              className="hidden shrink-0 gap-1 font-mono text-[11px] font-normal tabular-nums text-muted-foreground lg:inline-flex"
                              title={`${candidate.maxOutputTokens.toLocaleString()} max output tokens`}
                            >
                              <ArrowUpFromLineIcon className="size-3" />
                              {formatTokenWindow(candidate.maxOutputTokens)}
                            </Badge>
                          ) : null}

                          {alreadyImported ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 gap-1 text-[10px] font-normal"
                            >
                              <CheckIcon className="size-3" />
                              Imported
                            </Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-4 sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block">
            Imported models start disabled — enable the ones you want to route.
          </p>
          <div className="flex gap-2">
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
              {importing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {importing
                ? "Importing"
                : selectedCount === 0
                  ? "Import"
                  : `Import ${selectedCount}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
