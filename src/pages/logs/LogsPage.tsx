import { AlertCircleIcon, ListTreeIcon, SearchIcon, XIcon } from "lucide-react";
import { LogsDetailModal } from "@/components/logs/LogsDetailModal";
import { LogsFilters } from "@/components/logs/LogsFilters";
import { LogsHeader } from "@/components/logs/LogsHeader";
import { LogsSkeleton } from "@/components/logs/LogsSkeleton";
import { LogsStatsBar } from "@/components/logs/LogsStatsBar";
import { LogsTable } from "@/components/logs/LogsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useLogs } from "@/hooks/useLogs";

export function LogsPage() {
  const {
    logs,
    isLoading,
    error,
    isClearing,
    connectionStatus,
    lastUpdated,
    liveAnnouncement,
    typeFilter,
    setTypeFilter,
    sourceFilter,
    setSourceFilter,
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    selectedLog,
    payloads,
    isPayloadLoading,
    payloadError,
    payloadPending,
    accountOptions,
    filteredLogs,
    stats,
    hasActiveFilters,
    loadLogs,
    handleOpenLog,
    handleLogKeyDown,
    handleClearLogs,
    closeLog,
    resetFilters,
  } = useLogs();

  return (
    <section className="flex flex-col gap-5 pb-4">
      <LogsHeader
        connectionStatus={connectionStatus}
        isLoading={isLoading}
        isClearing={isClearing}
        logsCount={logs.length}
        onRefresh={() => void loadLogs()}
        onClearLogs={() => void handleClearLogs()}
      />

      <LogsStatsBar totalEntries={logs.length} stats={stats} />

      <LogsFilters
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        accountFilter={accountFilter}
        onAccountFilterChange={setAccountFilter}
        accountOptions={accountOptions}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Logs could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadLogs()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? <LogsSkeleton /> : null}

      {!isLoading && !error && filteredLogs.length === 0 ? (
        <Empty className="min-h-64 border border-dashed bg-card shadow-sm">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasActiveFilters ? <SearchIcon /> : <ListTreeIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {hasActiveFilters ? "No matching results" : "No activity yet"}
            </EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try changing the keyword or resetting the filters to see other entries."
                : "Logs will appear automatically when requests, tests, or admin activity occur."}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters ? (
            <EmptyContent>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <XIcon data-icon="inline-start" />
                Reset all filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {!isLoading && !error && filteredLogs.length > 0 ? (
        <LogsTable
          filteredLogs={filteredLogs}
          totalLogs={logs.length}
          lastUpdated={lastUpdated}
          connectionStatus={connectionStatus}
          liveAnnouncement={liveAnnouncement}
          onOpenLog={handleOpenLog}
          onLogKeyDown={handleLogKeyDown}
        />
      ) : null}

      <LogsDetailModal
        selectedLog={selectedLog}
        payloads={payloads}
        isPayloadLoading={isPayloadLoading}
        payloadError={payloadError}
        payloadPending={payloadPending}
        onClose={closeLog}
      />
    </section>
  );
}
