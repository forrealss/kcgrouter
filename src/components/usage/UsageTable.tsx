"use client";

import { AlertCircleIcon, BarChart3Icon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export interface UsageAccountOption {
  id: string;
  label: string;
}

interface UsageRecord {
  id: string;
  timestamp: string;
  providerAccountId: string;
  comboId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "error";
  latencyMs: number;
  estimatedCost: number;
}

interface HistoryFilters {
  providerAccountId: string;
  model: string;
  from: string;
  to: string;
}

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
  const params = new URLSearchParams({ limit: "50" });

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
  const [draftFilters, setDraftFilters] =
    useState<HistoryFilters>(initialFilters);
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.get<UsageRecord[]>(
          buildHistoryPath(filters),
        );
        if (!cancelled) setRecords(response);
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
  }, [filters]);

  function updateDraftFilter<Key extends keyof HistoryFilters>(
    key: Key,
    value: HistoryFilters[Key],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      draftFilters.from &&
      draftFilters.to &&
      draftFilters.from > draftFilters.to
    ) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }

    setFilterError(null);
    setFilters(draftFilters);
  }

  function handleClearFilters() {
    setFilterError(null);
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
  }

  const hasActiveFilters =
    filters.providerAccountId !== "all" ||
    Boolean(filters.model) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request history</CardTitle>
        <CardDescription>
          Review the latest 50 requests and narrow the results by account,
          model, or date.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={handleSubmit}>
          <FieldGroup className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <Field className="lg:flex-1">
              <FieldLabel htmlFor="usage-provider">Provider account</FieldLabel>
              <Select
                value={draftFilters.providerAccountId}
                onValueChange={(value) =>
                  updateDraftFilter("providerAccountId", value)
                }
              >
                <SelectTrigger id="usage-provider" className="w-full">
                  <SelectValue placeholder="All provider accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All provider accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="lg:flex-1">
              <FieldLabel htmlFor="usage-model">Model</FieldLabel>
              <Input
                id="usage-model"
                value={draftFilters.model}
                onChange={(event) =>
                  updateDraftFilter("model", event.target.value)
                }
                placeholder="e.g. gpt-4.1"
              />
            </Field>
            <Field data-invalid={Boolean(filterError)} className="lg:flex-1">
              <FieldLabel htmlFor="usage-from">From</FieldLabel>
              <Input
                id="usage-from"
                type="date"
                value={draftFilters.from}
                max={draftFilters.to || undefined}
                onChange={(event) =>
                  updateDraftFilter("from", event.target.value)
                }
                aria-invalid={Boolean(filterError)}
              />
            </Field>
            <Field data-invalid={Boolean(filterError)} className="lg:flex-1">
              <FieldLabel htmlFor="usage-to">To</FieldLabel>
              <Input
                id="usage-to"
                type="date"
                value={draftFilters.to}
                min={draftFilters.from || undefined}
                onChange={(event) =>
                  updateDraftFilter("to", event.target.value)
                }
                aria-invalid={Boolean(filterError)}
              />
            </Field>
            <Field className="lg:w-auto">
              <Button type="submit" disabled={isLoading}>
                Apply filters
              </Button>
            </Field>
            <Field className="lg:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={isLoading && !hasActiveFilters}
                onClick={handleClearFilters}
              >
                Clear
              </Button>
            </Field>
          </FieldGroup>
        </form>

        {filterError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Invalid date range</AlertTitle>
            <AlertDescription>{filterError}</AlertDescription>
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
                {accountsLoading ? <Spinner data-icon="inline-start" /> : null}
                Retry accounts
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading request history…
          </div>
        ) : null}

        {!isLoading && error ? (
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
        ) : null}

        {!isLoading && !error && records.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3Icon />
              </EmptyMedia>
              <EmptyTitle>No usage records found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "Try adjusting or clearing the active filters."
                  : "Requests will appear here after traffic is routed through KCG Router."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!isLoading && !error && records.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Provider account</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Estimated cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{formatTimestamp(record.timestamp)}</TableCell>
                  <TableCell className="font-medium">
                    {accountLabels.get(record.providerAccountId) ??
                      record.providerAccountId}
                  </TableCell>
                  <TableCell>{record.model}</TableCell>
                  <TableCell className="text-right">
                    {formatTokens(record.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(record.outputTokens)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        record.status === "success"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTokens(record.latencyMs)} ms
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCost(record.estimatedCost)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {isLoading
          ? "Loading the latest records…"
          : `Showing ${records.length} of up to 50 latest records.`}
      </CardFooter>
    </Card>
  );
}
