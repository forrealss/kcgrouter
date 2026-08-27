import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  CheckIcon,
  Clock3Icon,
  CoinsIcon,
  HashIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  HistoryFilters,
  HistorySort,
  UsageAccountOption,
  UsageRecord,
} from "@/types/usage";
import { UsageDetailModal } from "./UsageDetailModal";

interface UsageTableProps {
  accounts: readonly UsageAccountOption[];
  accountsLoading: boolean;
  accountsError: string | null;
  onRetryAccounts: () => void;
}

const initialFilters: HistoryFilters = {
  providerAccountId: "all",
  model: "",
  from: "",
  to: "",
  limit: 50,
  sort: "newest",
};

const ROW_LIMITS = [50, 100, 250] as const;

/** `YYYY-MM-DD` for a date N days before today, in the user's local timezone. */
function localDateInput(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

interface DatePreset {
  key: string;
  label: string;
  /** Days back from today; 0 means today only. */
  days: number;
}

const DATE_PRESETS: readonly DatePreset[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 6 },
  { key: "30d", label: "30 days", days: 29 },
] as const;

interface SortOption {
  key: HistorySort;
  label: string;
  icon: LucideIcon;
}

/**
 * Sort keys must match HISTORY_SORTS in usage-recorder.service.ts — the server
 * builds the ORDER BY, so an unknown key is rejected with a 400 rather than
 * silently falling back.
 */
const SORT_OPTIONS: readonly SortOption[] = [
  { key: "newest", label: "Newest first", icon: ArrowDownIcon },
  { key: "oldest", label: "Oldest first", icon: ArrowUpIcon },
  { key: "slowest", label: "Slowest first", icon: Clock3Icon },
  { key: "fastest", label: "Fastest first", icon: ZapIcon },
  { key: "costliest", label: "Highest cost", icon: CoinsIcon },
  { key: "most-tokens", label: "Most tokens", icon: HashIcon },
] as const;

const DEFAULT_SORT: SortOption = {
  key: "newest",
  label: "Newest first",
  icon: ArrowDownIcon,
};

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTokens(tokens: number): string {
  return numberFormatter.format(tokens);
}

function formatCost(cost: number): string {
  return currencyFormatter.format(cost);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

function toApiDate(date: string, endOfDay: boolean): string {
  const boundary = new Date(
    `${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}`,
  );
  return boundary.toISOString();
}

function buildHistoryPath(filters: HistoryFilters): string {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    sort: filters.sort,
  });

  if (filters.providerAccountId !== "all") {
    params.set("providerAccountId", filters.providerAccountId);
  }
  if (filters.model.trim()) params.set("model", filters.model.trim());
  if (filters.from) params.set("from", toApiDate(filters.from, false));
  if (filters.to) params.set("to", toApiDate(filters.to, true));

  return `/api/usage/history?${params.toString()}`;
}

export function UsageTable({
  accounts,
  accountsLoading,
  accountsError,
  onRetryAccounts,
}: UsageTableProps) {
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<UsageRecord | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  /** Models seen in loaded rows, so the picker offers real values to match. */
  const [knownModels, setKnownModels] = useState<string[]>([]);

  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts],
  );

  /**
   * An inverted range would silently return zero rows, so it is reported
   * instead of being sent. Filters otherwise apply as soon as they change.
   */
  const rangeError =
    filters.from && filters.to && filters.from > filters.to
      ? "The start date is after the end date, so no rows can match."
      : null;

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.get<UsageRecord[]>(
          buildHistoryPath(filters),
        );
        if (cancelled) return;
        setRecords(response);
        // Keep a union so switching filters never shrinks the model options
        // down to whatever the current page happens to contain.
        setKnownModels((current) => {
          const merged = new Set(current);
          for (const record of response) merged.add(record.model);
          return [...merged].sort((left, right) => left.localeCompare(right));
        });
      } catch (requestError) {
        if (!cancelled) setError(getApiErrorMessage(requestError));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [filters, rangeError]);

  function updateFilter<Key extends keyof HistoryFilters>(
    key: Key,
    value: HistoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(preset: DatePreset) {
    setFilters((current) => ({
      ...current,
      from: localDateInput(preset.days),
      to: localDateInput(0),
    }));
  }

  function handleClearFilters() {
    setFilters(initialFilters);
  }

  /**
   * Payloads are not part of the history page — each row only carries a
   * `hasPayload` flag, so the bodies are fetched here when a row is opened.
   */
  async function openRecord(record: UsageRecord) {
    setSelectedRecord(record);
    setIsModalOpen(true);
    if (record.requestBody !== undefined || record.responseBody !== undefined)
      return;

    setPayloadLoading(true);
    try {
      const payloads = await apiClient.get<{
        requestBody: string | null;
        responseBody: string | null;
      }>(`/api/usage/history/${encodeURIComponent(record.id)}/payloads`);
      setSelectedRecord((current) =>
        current?.id === record.id ? { ...current, ...payloads } : current,
      );
    } catch {
      // Keep the modal open; the payload sections will show N/A.
    } finally {
      setPayloadLoading(false);
    }
  }

  function handleRowClick(record: UsageRecord) {
    if (!record.hasPayload && !record.requestBody && !record.responseBody)
      return;
    void openRecord(record);
  }

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.providerAccountId !== "all") {
      chips.push({
        key: "account",
        label:
          accountLabels.get(filters.providerAccountId) ??
          filters.providerAccountId,
        clear: () =>
          setFilters((current) => ({ ...current, providerAccountId: "all" })),
      });
    }
    if (filters.model) {
      chips.push({
        key: "model",
        label: filters.model,
        clear: () => setFilters((current) => ({ ...current, model: "" })),
      });
    }
    if (filters.from || filters.to) {
      chips.push({
        key: "range",
        label:
          filters.from && filters.to
            ? `${filters.from} → ${filters.to}`
            : filters.from
              ? `from ${filters.from}`
              : `until ${filters.to}`,
        clear: () =>
          setFilters((current) => ({ ...current, from: "", to: "" })),
      });
    }
    return chips;
  }, [accountLabels, filters]);

  const hasActiveFilters = activeFilters.length > 0;

  /** Which preset, if any, the current range corresponds to. */
  const activePresetKey = DATE_PRESETS.find(
    (preset) =>
      filters.from === localDateInput(preset.days) &&
      filters.to === localDateInput(0),
  )?.key;

  const modelOptions = useMemo(() => {
    const merged = new Set(knownModels);
    if (filters.model) merged.add(filters.model);
    return [...merged].sort((left, right) => left.localeCompare(right));
  }, [knownModels, filters.model]);

  const activeSort =
    SORT_OPTIONS.find((option) => option.key === filters.sort) ?? DEFAULT_SORT;
  const isDefaultSort = filters.sort === DEFAULT_SORT.key;

  return (
    <Card className="gap-0 !py-0 overflow-hidden">
      <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-4 py-3.5 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          Request history
          {hasActiveFilters ? (
            <Badge variant="secondary" className="text-[10px]">
              filtered
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription className="text-xs">
          The 50 most recent requests. Click a row to inspect its payload.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-0 px-0 py-0">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={hasActiveFilters ? "secondary" : "outline"}
                  size="sm"
                >
                  <SlidersHorizontalIcon data-icon="inline-start" />
                  Filter
                  {hasActiveFilters ? (
                    <span className="ml-0.5 rounded bg-primary/15 px-1.5 font-mono text-[10px] tabular-nums text-primary">
                      {activeFilters.length}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium">Filter requests</p>
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleClearFilters}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Reset
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4 px-3 py-3">
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="usage-provider" className="text-xs">
                      Connection
                    </FieldLabel>
                    <Select
                      value={filters.providerAccountId}
                      onValueChange={(value) =>
                        updateFilter("providerAccountId", value)
                      }
                    >
                      <SelectTrigger id="usage-provider" className="w-full">
                        <SelectValue placeholder="All connections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">All connections</SelectItem>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="usage-model" className="text-xs">
                      Model
                    </FieldLabel>
                    <Combobox
                      id="usage-model"
                      options={modelOptions.map((model) => ({
                        value: model,
                        label: model,
                      }))}
                      value={filters.model}
                      onValueChange={(value) => updateFilter("model", value)}
                      placeholder="All models"
                      searchPlaceholder="Search models..."
                      dialogTitle="Filter by model"
                      allowCustom
                      customLabel="Match"
                      noResultsLabel="No models in the loaded rows"
                    />
                  </Field>

                  <Field className="gap-1.5">
                    <FieldLabel className="text-xs">Date range</FieldLabel>
                    <div className="flex gap-1.5">
                      {DATE_PRESETS.map((preset) => (
                        <Button
                          key={preset.key}
                          type="button"
                          variant={
                            activePresetKey === preset.key
                              ? "secondary"
                              : "outline"
                          }
                          size="xs"
                          className="flex-1"
                          onClick={() => applyPreset(preset)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={filters.from}
                        onChange={(event) =>
                          updateFilter("from", event.target.value)
                        }
                        aria-invalid={Boolean(rangeError)}
                        aria-label="From date"
                        className="h-8 min-w-0 flex-1 text-xs"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        to
                      </span>
                      <Input
                        type="date"
                        value={filters.to}
                        onChange={(event) =>
                          updateFilter("to", event.target.value)
                        }
                        aria-invalid={Boolean(rangeError)}
                        aria-label="To date"
                        className="h-8 min-w-0 flex-1 text-xs"
                      />
                    </div>
                    {rangeError ? (
                      <p className="text-xs text-destructive">{rangeError}</p>
                    ) : null}
                  </Field>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={isDefaultSort ? "outline" : "secondary"}
                  size="sm"
                >
                  <ArrowUpDownIcon data-icon="inline-start" />
                  {activeSort.label}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1">
                {SORT_OPTIONS.map((option) => {
                  const isSelected = option.key === filters.sort;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => updateFilter("sort", option.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <option.icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <CheckIcon className="size-3.5 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>

            {activeFilters.map((chip) => (
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

            {isLoading ? (
              <Spinner className="ml-auto size-3.5 text-muted-foreground" />
            ) : null}
          </div>
        </div>

        {rangeError || accountsError ? (
          <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
            {rangeError ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Invalid date range</AlertTitle>
                <AlertDescription>{rangeError}</AlertDescription>
              </Alert>
            ) : null}
            {accountsError ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Provider accounts could not be loaded</AlertTitle>
                <AlertDescription className="gap-3">
                  <p>{accountsError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetryAccounts}
                    disabled={accountsLoading}
                  >
                    {accountsLoading ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    Retry accounts
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {!rangeError && isLoading ? (
          <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
            {["a", "b", "c", "d", "e"].map((key) => (
              <Skeleton key={key} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {!rangeError && !isLoading && error ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Request history could not be loaded</AlertTitle>
              <AlertDescription className="gap-3">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters({ ...filters })}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {!rangeError && !isLoading && !error && records.length === 0 ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3Icon />
              </EmptyMedia>
              <EmptyTitle>No usage records found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "No requests match the active filters."
                  : "Records appear once traffic is routed through the gateway."}
              </EmptyDescription>
            </EmptyHeader>
            {hasActiveFilters ? (
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                >
                  Clear filters
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : null}

        {!rangeError && !isLoading && !error && records.length > 0 ? (
          <div className="scrollbar-subtle overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 whitespace-nowrap">
                    Timestamp
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap">
                    Connection
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap">
                    Model
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap text-right">
                    In
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap text-right">
                    Out
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap text-right">
                    Latency
                  </TableHead>
                  <TableHead className="h-10 whitespace-nowrap text-right">
                    Cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const hasPayload = Boolean(
                    record.hasPayload ??
                      record.requestBody ??
                      record.responseBody,
                  );
                  const isError = record.status === "error";
                  return (
                    <TableRow
                      key={record.id}
                      onClick={() => handleRowClick(record)}
                      onKeyDown={(event) => {
                        if (
                          !hasPayload ||
                          (event.key !== "Enter" && event.key !== " ")
                        ) {
                          return;
                        }
                        event.preventDefault();
                        handleRowClick(record);
                      }}
                      role={hasPayload ? "button" : undefined}
                      tabIndex={hasPayload ? 0 : undefined}
                      aria-label={
                        hasPayload
                          ? `Inspect ${record.model} request payload`
                          : undefined
                      }
                      className={cn(
                        hasPayload &&
                          "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      )}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              isError
                                ? "bg-destructive shadow-[0_0_6px] shadow-destructive/70"
                                : "bg-success shadow-[0_0_6px] shadow-success/70",
                            )}
                            title={record.status}
                          />
                          {formatTimestamp(record.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">
                        {accountLabels.get(record.providerAccountId) ??
                          record.providerAccountId}
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {record.model}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {formatTokens(record.inputTokens)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {formatTokens(record.outputTokens)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {record.latencyMs > 0
                          ? `${formatTokens(record.latencyMs)}ms`
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {formatCost(record.estimatedCost)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {!rangeError && !isLoading && !error && records.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:px-5">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {records.length} row{records.length === 1 ? "" : "s"}
              {records.length === filters.limit ? " · limit reached" : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Show</span>
              {ROW_LIMITS.map((limit) => (
                <Button
                  key={limit}
                  type="button"
                  variant={filters.limit === limit ? "secondary" : "ghost"}
                  size="xs"
                  className="font-mono tabular-nums"
                  onClick={() => updateFilter("limit", limit)}
                >
                  {limit}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      <UsageDetailModal
        record={selectedRecord}
        open={isModalOpen}
        loading={payloadLoading}
        onOpenChange={setIsModalOpen}
        accountLabel={
          selectedRecord
            ? accountLabels.get(selectedRecord.providerAccountId)
            : undefined
        }
      />
    </Card>
  );
}
