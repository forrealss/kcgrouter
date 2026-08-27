import type { LucideIcon } from "lucide-react";
import {
  BotIcon,
  ExternalLinkIcon,
  FilterIcon,
  RefreshCwIcon,
  ScissorsIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { filterDetails } from "@/components/token-saver/filter-details";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTokenSaver } from "@/hooks/useTokenSaver";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");

/** Compact big token counts so the metric strip stays readable. */
function formatCompact(value: number): string {
  const units = [
    { limit: 999_500_000, divisor: 1_000_000_000, suffix: "B" },
    { limit: 999_500, divisor: 1_000_000, suffix: "M" },
    { limit: 10_000, divisor: 1_000, suffix: "K" },
  ];
  for (const { limit, divisor, suffix } of units) {
    if (value < limit) continue;
    const scaled = value / divisor;
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  }
  return numberFormatter.format(value);
}

type ModifierPatch = { enabled?: boolean; level?: string };

interface ModifierLevel {
  id: string;
  label: string;
  description: string;
}

const CAVEMAN_LEVELS: ModifierLevel[] = [
  {
    id: "lite",
    label: "Lite",
    description: "No filler or hedging. Keeps articles and full sentences.",
  },
  {
    id: "full",
    label: "Full",
    description: "Drops articles, allows fragments. Classic caveman.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "Strips conjunctions. One word when one word is enough.",
  },
];

const PONYTAIL_LEVELS: ModifierLevel[] = [
  {
    id: "lite",
    label: "Lite",
    description: "Builds what was asked, names the lazier alternative.",
  },
  {
    id: "full",
    label: "Full",
    description: "Ladder enforced. Stdlib first, shortest diff wins.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "YAGNI extremist. Deletion before addition.",
  },
];

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  chart2: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  chart3: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  chart4: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  muted: "border-border bg-muted/50 text-muted-foreground",
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  loading?: boolean;
  tone?: MetricTone;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          metricTone[tone],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-16" />
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-base font-semibold tracking-tight tabular-nums">
              {value}
            </span>
            {hint ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * One modifier (Caveman / Ponytail). Intensity is a segmented control rather
 * than a Select: there are only three values and their differences matter, so
 * hiding them behind a dropdown costs a click to read the options.
 */
function ModifierCard({
  title,
  description,
  icon: Icon,
  link,
  switchId,
  enabled,
  level,
  levels,
  onPersist,
  isSaving,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  link: string;
  switchId: string;
  enabled: boolean;
  level: string;
  levels: ModifierLevel[];
  onPersist: (patch: ModifierPatch) => Promise<void>;
  isSaving: boolean;
}) {
  const selectedLevel = levels.find((item) => item.id === level);

  return (
    <Card className="gap-0 overflow-hidden py-0" aria-busy={isSaving}>
      <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border",
            enabled
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70 bg-card text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        <Switch
          id={switchId}
          checked={enabled}
          disabled={isSaving}
          onCheckedChange={(checked) => void onPersist({ enabled: checked })}
          aria-label={`${enabled ? "Disable" : "Enable"} ${title}`}
        />
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Intensity</p>
          <fieldset
            className="grid grid-cols-3 gap-1.5"
            aria-label={`${title} intensity`}
          >
            {levels.map((item) => {
              const isSelected = item.id === level;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={isSelected ? "secondary" : "outline"}
                  size="sm"
                  disabled={!enabled || isSaving}
                  aria-pressed={isSelected}
                  onClick={() => void onPersist({ level: item.id })}
                  className={cn(
                    isSelected && "border-primary/50 text-foreground",
                  )}
                >
                  {item.label}
                </Button>
              );
            })}
          </fieldset>
          <p className="min-h-8 text-xs text-muted-foreground">
            {enabled
              ? (selectedLevel?.description ?? "Pick an intensity level.")
              : `Turn ${title} on to choose an intensity.`}
          </p>
        </div>

        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ExternalLinkIcon className="size-3" aria-hidden />
          Source repository
        </a>
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <>
      <Card aria-hidden className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
          {["a", "b", "c", "d"].map((key) => (
            <div
              key={key}
              className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4"
            >
              <Skeleton className="size-8 rounded-md" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card aria-hidden className="gap-0 overflow-hidden py-0 lg:col-span-2">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-3.5">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <Skeleton className="h-12 w-full" />
            {["a", "b", "c", "d", "e", "f"].map((key) => (
              <Skeleton key={key} className="h-9 w-full" />
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          {["a", "b"].map((key) => (
            <Card key={key} aria-hidden className="gap-0 overflow-hidden py-0">
              <div className="border-b border-border/60 bg-muted/20 px-5 py-3.5">
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

export function TokenSaverPage() {
  const {
    settings,
    isLoading,
    loadError,
    saveError,
    isSaving,
    loadSettings,
    persistEnabled,
    persistCaveman,
    persistPonytail,
  } = useTokenSaver();

  const filterCount = settings?.filters.length ?? 0;
  const activeModifiers =
    (settings?.cavemanEnabled ? 1 : 0) + (settings?.ponytailEnabled ? 1 : 0);

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Shrink tool output and model prompts before they reach the context
          window.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadSettings()}
          disabled={isLoading || isSaving}
          aria-busy={isLoading || isSaving}
          className="w-fit"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={cn((isLoading || isSaving) && "animate-spin")}
          />
          {isSaving ? "Saving" : isLoading ? "Refreshing" : "Refresh"}
        </Button>
      </header>

      {loadError && settings ? (
        <Alert variant="destructive">
          <AlertTitle>Latest settings could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSettings()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save your change</AlertTitle>
          <AlertDescription>
            {saveError} The previous value was restored.
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? <PageSkeleton /> : null}

      {!isLoading && (loadError || !settings) ? (
        <Alert variant="destructive">
          <AlertTitle>Token saver could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{loadError ?? "No settings returned by the server."}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSettings()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!isLoading && settings ? (
        <>
          <Card className="!py-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
              <MetricCell
                label="Tokens saved"
                value={formatCompact(settings.totalTokensSaved)}
                hint="all time"
                icon={ZapIcon}
                tone="chart2"
              />
              <MetricCell
                label="Output filters"
                value={String(filterCount)}
                hint={settings.enabled ? "applied" : "on standby"}
                icon={FilterIcon}
                tone={settings.enabled ? "primary" : "muted"}
              />
              <MetricCell
                label="Caveman"
                value={
                  settings.cavemanEnabled
                    ? settings.cavemanLevel.toUpperCase()
                    : "OFF"
                }
                icon={ScissorsIcon}
                tone={settings.cavemanEnabled ? "chart3" : "muted"}
              />
              <MetricCell
                label="Ponytail"
                value={
                  settings.ponytailEnabled
                    ? settings.ponytailLevel.toUpperCase()
                    : "OFF"
                }
                icon={SparklesIcon}
                tone={settings.ponytailEnabled ? "chart4" : "muted"}
              />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <Card className="gap-0 overflow-hidden py-0 lg:col-span-2">
              <CardHeader className="grid-cols-[auto_1fr] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md border",
                    settings.enabled
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/70 bg-card text-muted-foreground",
                  )}
                >
                  <FilterIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-medium">
                    Output filters
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Compress tool results before they enter the context.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 px-5 py-4">
                <Field
                  orientation="horizontal"
                  data-disabled={isSaving || undefined}
                  className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3"
                >
                  <FieldContent>
                    <FieldLabel
                      htmlFor="token-saver-enabled"
                      className="text-sm"
                    >
                      Enable by default
                    </FieldLabel>
                    <FieldDescription className="text-xs">
                      Applies to new requests. A client can still override this
                      per request.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="token-saver-enabled"
                    checked={settings.enabled}
                    disabled={isSaving}
                    onCheckedChange={(checked) => void persistEnabled(checked)}
                  />
                </Field>

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Filters applied
                    </p>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {filterCount}
                    </span>
                  </div>
                  {/*
                    Every supported filter runs whenever token saver is on — the
                    API reports them all as active and there is no per-filter
                    toggle. The old READY/SKIP badges implied a state that could
                    never differ, so the list documents behaviour instead.
                  */}
                  <TooltipProvider delayDuration={200}>
                    <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
                      {settings.filters.map((filter) => {
                        const detail = filterDetails[filter.name];
                        return (
                          <li
                            key={filter.name}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 transition-colors",
                              settings.enabled
                                ? "hover:bg-accent/30"
                                : "bg-muted/20",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate text-xs font-medium",
                                  !settings.enabled && "text-muted-foreground",
                                )}
                              >
                                {detail.label}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {detail.description}
                              </span>
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <code className="hidden shrink-0 truncate rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block sm:max-w-40">
                                  {detail.example}
                                </code>
                              </TooltipTrigger>
                              <TooltipContent>
                                Removes: {detail.example}
                              </TooltipContent>
                            </Tooltip>
                          </li>
                        );
                      })}
                    </ul>
                  </TooltipProvider>
                  {!settings.enabled ? (
                    <p className="text-xs text-muted-foreground">
                      These run only when token saver is enabled, or when a
                      request opts in explicitly.
                    </p>
                  ) : null}
                </div>
              </CardContent>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-5 py-2.5">
                <span className="text-[11px] text-muted-foreground">
                  Updated {formatUpdatedAt(settings.updatedAt)}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal text-muted-foreground"
                >
                  {activeModifiers === 0
                    ? "No prompt modifiers"
                    : `${activeModifiers} prompt modifier${activeModifiers === 1 ? "" : "s"} on`}
                </Badge>
              </div>
            </Card>

            <div className="flex flex-col gap-4">
              <ModifierCard
                title="Caveman"
                description="Terse replies, no filler."
                icon={BotIcon}
                link="https://github.com/JuliusBrussee/caveman"
                switchId="caveman-enabled"
                enabled={settings.cavemanEnabled}
                level={settings.cavemanLevel}
                levels={CAVEMAN_LEVELS}
                onPersist={persistCaveman}
                isSaving={isSaving}
              />
              <ModifierCard
                title="Ponytail"
                description="Minimal code, YAGNI first."
                icon={SparklesIcon}
                link="https://github.com/DietrichGebert/ponytail"
                switchId="ponytail-enabled"
                enabled={settings.ponytailEnabled}
                level={settings.ponytailLevel}
                levels={PONYTAIL_LEVELS}
                onPersist={persistPonytail}
                isSaving={isSaving}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
