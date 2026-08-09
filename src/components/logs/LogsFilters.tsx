import { FilterIcon, SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
}

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
}: LogsFiltersProps) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="gap-1 border-b bg-muted/15 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <FilterIcon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Activity filters</CardTitle>
          {hasActiveFilters ? (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              Active
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Narrow the list by status, source, account, or keyword.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 py-4 sm:px-6">
        <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(140px,1fr))_auto]">
          <Field>
            <FieldLabel htmlFor="log-search">Search</FieldLabel>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="log-search"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Model, provider, message..."
                className="pr-9 pl-9"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange("")}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear search"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="log-type">Type</FieldLabel>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                onTypeFilterChange(value as "all" | RequestLogType)
              }
            >
              <SelectTrigger id="log-type" className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="request">Request</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="log-source">Source</FieldLabel>
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
          <Field>
            <FieldLabel htmlFor="log-account">Account</FieldLabel>
            <Select value={accountFilter} onValueChange={onAccountFilterChange}>
              <SelectTrigger id="log-account" className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accountOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onResetFilters}
              disabled={!hasActiveFilters}
              className="w-full sm:w-auto"
            >
              Reset
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
