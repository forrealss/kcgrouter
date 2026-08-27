import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  AccountOption,
  RequestLogSource,
  RequestLogType,
} from "@/types/log";

interface LogsFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  typeFilter: "all" | RequestLogType;
  onTypeFilterChange: (value: "all" | RequestLogType) => void;
  sourceFilter: "all" | RequestLogSource;
  onSourceFilterChange: (value: "all" | RequestLogSource) => void;
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  accountOptions: AccountOption[];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Per-type counts across the unfiltered stream, shown on the quick tabs. */
  typeCounts: Record<"all" | RequestLogType, number>;
}

const TYPE_TABS: Array<{ value: "all" | RequestLogType; label: string }> = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "success", label: "Success" },
  { value: "request", label: "Requests" },
  { value: "admin", label: "Admin" },
];

const sourceLabels: Record<RequestLogSource, string> = {
  router: "Router",
  test: "Test",
  admin: "Admin",
};

export function LogsFilters({
  searchQuery,
  onSearchQueryChange,
  typeFilter,
  onTypeFilterChange,
  sourceFilter,
  onSourceFilterChange,
  accountFilter,
  onAccountFilterChange,
  accountOptions,
  hasActiveFilters,
  onResetFilters,
  typeCounts,
}: LogsFiltersProps) {
  /**
   * Only the filters that are *not* already visible as a control get a chip —
   * type lives on the always-visible tabs and search in its own box, so
   * chipping them too would just duplicate what is on screen.
   */
  const chips = useMemo(() => {
    const list: Array<{ key: string; label: string; clear: () => void }> = [];
    if (sourceFilter !== "all") {
      list.push({
        key: "source",
        label: `source: ${sourceLabels[sourceFilter]}`,
        clear: () => onSourceFilterChange("all"),
      });
    }
    if (accountFilter !== "all") {
      const match = accountOptions.find((a) => a.id === accountFilter);
      list.push({
        key: "account",
        label: match?.label ?? accountFilter,
        clear: () => onAccountFilterChange("all"),
      });
    }
    return list;
  }, [
    sourceFilter,
    accountFilter,
    accountOptions,
    onSourceFilterChange,
    onAccountFilterChange,
  ]);

  const advancedCount = chips.length;

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={typeFilter}
          onValueChange={(value) =>
            onTypeFilterChange(value as "all" | RequestLogType)
          }
        >
          <TabsList>
            {TYPE_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1.5 text-xs"
              >
                {tab.label}
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    tab.value === "error" && typeCounts.error > 0
                      ? "text-destructive"
                      : "opacity-70",
                  )}
                >
                  {typeCounts[tab.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="log-search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search messages, models…"
              aria-label="Search logs"
              className="pl-8 pr-8"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onSearchQueryChange("")}
                aria-label="Clear search"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={advancedCount > 0 ? "secondary" : "outline"}
                className="shrink-0"
              >
                <SlidersHorizontalIcon data-icon="inline-start" />
                Filter
                {advancedCount > 0 ? (
                  <span className="ml-0.5 rounded bg-primary/15 px-1.5 font-mono text-[10px] tabular-nums text-primary">
                    {advancedCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs font-medium">Narrow the stream</p>
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onResetFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Reset all
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col gap-4 px-3 py-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="log-source" className="text-xs">
                    Source
                  </FieldLabel>
                  <Select
                    value={sourceFilter}
                    onValueChange={(value) =>
                      onSourceFilterChange(value as "all" | RequestLogSource)
                    }
                  >
                    <SelectTrigger id="log-source" className="w-full">
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All sources</SelectItem>
                        <SelectItem value="router">Router</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="log-account" className="text-xs">
                    Connection
                  </FieldLabel>
                  <Select
                    value={accountFilter}
                    onValueChange={onAccountFilterChange}
                    disabled={accountOptions.length === 0}
                  >
                    <SelectTrigger id="log-account" className="w-full">
                      <SelectValue placeholder="All connections" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All connections</SelectItem>
                        {accountOptions.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {accountOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No connection appears in the loaded entries yet.
                    </p>
                  ) : null}
                </Field>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 font-mono text-[11px] transition-colors hover:border-destructive/40 hover:bg-destructive/10"
            >
              <span className="truncate">{chip.label}</span>
              <XIcon className="size-3 shrink-0 text-muted-foreground group-hover:text-destructive" />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
