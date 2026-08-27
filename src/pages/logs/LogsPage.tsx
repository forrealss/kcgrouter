import { AlertCircleIcon, ListTreeIcon, SearchIcon, XIcon } from "lucide-react";
import { LogsDetailModal } from "@/components/logs/LogsDetailModal";
import { LogsFilters } from "@/components/logs/LogsFilters";
import { LogsHeader } from "@/components/logs/LogsHeader";
import { LogsSkeleton } from "@/components/logs/LogsSkeleton";
import { LogsStatsBar } from "@/components/logs/LogsStatsBar";
import { LogsTable } from "@/components/logs/LogsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    typeCounts,
    hasActiveFilters,
    loadLogs,
    handleOpenLog,
    handleLogKeyDown,
    handleClearLogs,
    closeLog,
    resetFilters,
  } = useLogs();

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <LogsHeader
        connectionStatus={connectionStatus}
        isLoading={isLoading}
        isClearing={isClearing}
        logsCount={logs.length}
        onRefresh={() => void loadLogs()}
        onClearLogs={() => void handleClearLogs()}
      />

      <LogsStatsBar
        totalEntries={logs.length}
        stats={stats}
        isLoading={isLoading && logs.length === 0}
      />

      <Card className="flex min-w-0 flex-col gap-0 overflow-hidden border-border/70 p-0 shadow-sm">
        <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-4 py-3.5 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            Activity stream
            {hasActiveFilters ? (
              <Badge variant="secondary" className="text-[10px]">
                filtered
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs">
            The 200 most recent entries. Click a row to inspect it.
          </CardDescription>
        </CardHeader>

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
          typeCounts={typeCounts}
        />

        {error ? (
          <div className="p-4 sm:p-5">
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
          </div>
        ) : null}

        {isLoading ? <LogsSkeleton /> : null}

        {error && logs.length > 0 ? (
          <p className="border-b border-warning/20 bg-warning/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-warning sm:px-5">
            Showing last known activity state
          </p>
        ) : null}

        {!isLoading &&
        filteredLogs.length === 0 &&
        (!error || logs.length > 0) ? (
          <Empty className="min-h-64 border-0 bg-transparent shadow-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {hasActiveFilters ? <SearchIcon /> : <ListTreeIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {hasActiveFilters ? "No matching results" : "No activity yet"}
              </EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "Try changing the keyword or resetting the filters."
                  : "Entries appear as requests and admin activity occur."}
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

        {!isLoading && filteredLogs.length > 0 ? (
          <LogsTable
            filteredLogs={filteredLogs}
            totalLogs={logs.length}
            lastUpdated={lastUpdated}
            liveAnnouncement={liveAnnouncement}
            onOpenLog={handleOpenLog}
            onLogKeyDown={handleLogKeyDown}
          />
        ) : null}
      </Card>

      <LogsDetailModal
        selectedLog={selectedLog}
        payloads={payloads}
        isPayloadLoading={isPayloadLoading}
        payloadError={payloadError}
        payloadPending={payloadPending}
        onClose={closeLog}
      />
    </div>
  );
}
