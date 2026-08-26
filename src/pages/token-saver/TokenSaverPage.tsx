import type { LucideIcon } from "lucide-react";
import {
  ActivityIcon,
  BotIcon,
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
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useTokenSaver } from "@/hooks/useTokenSaver";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");

type ModifierPatch = { enabled?: boolean; level?: string };

type ModifierLevel = {
  id: string;
  label: string;
  description: string;
};

const CAVEMAN_LEVELS: ModifierLevel[] = [
  {
    id: "lite",
    label: "Lite",
    description: "No filler/hedging. Keep articles + full sentences.",
  },
  {
    id: "full",
    label: "Full",
    description: "Drop articles, fragments OK. Classic caveman.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "Strip conjunctions. One word when one word enough.",
  },
];

const PONYTAIL_LEVELS: ModifierLevel[] = [
  {
    id: "lite",
    label: "Lite",
    description: "Build what's asked, name the lazier alternative.",
  },
  {
    id: "full",
    label: "Full",
    description: "Ladder enforced. Stdlib/native first. Shortest diff.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "YAGNI extremist. Deletion before addition.",
  },
];

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  violet: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  cyan: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  amber: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  icon: Icon,
  loading,
  tone = "primary",
}: {
  label: string;
  value: string;
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
          <Skeleton className="mt-1 h-5 w-20" />
        ) : (
          <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusLed({
  active,
  label,
  tone = "ok",
}: {
  active: boolean;
  label: string;
  tone?: "ok" | "warn";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide">
      <span
        className={cn(
          "size-1.5 rounded-full",
          active &&
            tone === "ok" &&
            "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
          active &&
            tone === "warn" &&
            "bg-amber-400 shadow-[0_0_6px] shadow-amber-400/60",
          !active && "bg-muted-foreground/50",
        )}
      />
      <span className={active ? "text-emerald-500" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "Updated recently";

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

function SettingsSkeleton() {
  return (
    <>
      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
          {Array.from({ length: 4 }).map((_value, index) => (
            <MetricCell
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              key={`token-metric-${index}`}
              label="Loading"
              value=""
              icon={ActivityIcon}
              loading
            />
          ))}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 overflow-hidden lg:col-span-2">
          <div className="border-b border-border/50 px-5 pb-3 pt-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex flex-col gap-3 px-5 py-5">
            <Skeleton className="h-12 w-full" />
            {Array.from({ length: 6 }).map((_value, index) => (
              <Skeleton
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                key={`filter-skeleton-${index}`}
                className="h-9 w-full"
              />
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_value, index) => (
            <Card
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              key={`modifier-skeleton-${index}`}
              className="gap-0 overflow-hidden"
            >
              <div className="border-b border-border/50 px-5 pb-3 pt-4">
                <Skeleton className="h-5 w-28" />
              </div>
              <div className="flex flex-col gap-3 px-5 pb-5 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

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
  description: React.ReactNode;
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
    <Card
      className="gap-0 overflow-hidden transition-colors duration-200 hover:bg-accent/20"
      aria-busy={isSaving}
    >
      <CardHeader className="px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {description}{" "}
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
                aria-label={`${title} repository`}
              >
                source
              </a>
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <StatusLed active={enabled} label={enabled ? "ON" : "OFF"} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <Field
          orientation="horizontal"
          data-disabled={isSaving || !enabled || undefined}
        >
          <FieldContent>
            <FieldLabel htmlFor={switchId}>
              Enable {title.toLowerCase()}
            </FieldLabel>
            <FieldDescription>
              Apply this modifier to every new request.
            </FieldDescription>
          </FieldContent>
          <Switch
            id={switchId}
            checked={enabled}
            disabled={isSaving}
            onCheckedChange={(checked) => void onPersist({ enabled: checked })}
          />
        </Field>
        <Field
          orientation="horizontal"
          data-disabled={isSaving || !enabled || undefined}
        >
          <FieldContent>
            <FieldLabel>Intensity</FieldLabel>
            <FieldDescription>
              {enabled
                ? (selectedLevel?.description ?? "Select an intensity level.")
                : "Enable the modifier to select an intensity."}
            </FieldDescription>
          </FieldContent>
          <Select
            value={level}
            disabled={!enabled || isSaving}
            onValueChange={(value) => void onPersist({ level: value })}
          >
            <SelectTrigger className="w-24 shrink-0 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {levels.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
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

  const activeFilters =
    settings?.filters.filter((filter) => filter.active).length ?? 0;
  const filterCount = settings?.filters.length ?? 0;
  const isActive = settings?.enabled ?? false;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Optimization / compression
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Token Saver</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compress tool output before it reaches the model context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isLoading || isSaving
                  ? "animate-pulse bg-amber-400"
                  : isActive
                    ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                    : "bg-muted-foreground/50",
              )}
            />
            {isLoading || isSaving
              ? "SYNCING"
              : isActive
                ? "ACTIVE"
                : "BYPASSED"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadSettings()}
            disabled={isLoading || isSaving}
            aria-busy={isLoading || isSaving}
          >
            <RefreshCwIcon
              className={cn(
                "size-3.5",
                (isLoading || isSaving) && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
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

      {isLoading ? <SettingsSkeleton /> : null}

      {!isLoading && (loadError || !settings) ? (
        <Card>
          <CardContent className="py-6">
            <Alert variant="destructive">
              <AlertTitle>Token saver could not be loaded</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>
                  {loadError ?? "No settings returned by the server."}
                </span>
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
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && settings ? (
        <>
          <Card className="!py-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
              <MetricCell
                label="Total saved"
                value={numberFormatter.format(settings.totalTokensSaved)}
                icon={ZapIcon}
                tone="violet"
              />
              <MetricCell
                label="Core filters"
                value={`${numberFormatter.format(activeFilters)}/${numberFormatter.format(filterCount)}`}
                icon={FilterIcon}
                tone={isActive ? "ok" : "primary"}
              />
              <MetricCell
                label="Caveman"
                value={
                  settings.cavemanEnabled
                    ? settings.cavemanLevel.toUpperCase()
                    : "OFF"
                }
                icon={ScissorsIcon}
                tone={settings.cavemanEnabled ? "cyan" : "primary"}
              />
              <MetricCell
                label="Ponytail"
                value={
                  settings.ponytailEnabled
                    ? settings.ponytailLevel.toUpperCase()
                    : "OFF"
                }
                icon={SparklesIcon}
                tone={settings.ponytailEnabled ? "amber" : "primary"}
              />
            </div>
          </Card>

          {saveError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not save your preference</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{saveError}</span>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  Changes were reverted
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="gap-0 overflow-hidden lg:col-span-2">
              <CardHeader className="px-5 pb-3 pt-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                    <FilterIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-medium">
                      Output filters
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      Per-tool compression rules.
                    </CardDescription>
                  </div>
                </div>
                <CardAction>
                  <Badge
                    variant={isActive ? "default" : "outline"}
                    className="font-mono text-[10px]"
                  >
                    {isActive ? "DEFAULT ON" : "DEFAULT OFF"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                <FieldGroup>
                  <Field
                    orientation="horizontal"
                    data-disabled={isSaving || undefined}
                  >
                    <FieldContent>
                      <FieldLabel htmlFor="token-saver-enabled">
                        Enable token saver by default
                      </FieldLabel>
                      <FieldDescription>
                        Apply available output filters to new sessions.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="token-saver-enabled"
                      checked={settings.enabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) =>
                        void persistEnabled(checked)
                      }
                    />
                  </Field>
                </FieldGroup>

                <FieldSet>
                  <FieldLegend
                    variant="label"
                    className="flex items-center gap-2"
                  >
                    Supported filters
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {activeFilters}/{filterCount} ready
                    </span>
                  </FieldLegend>
                  <FieldGroup className="gap-0 overflow-hidden rounded-lg border">
                    {settings.filters.map((filter) => {
                      const detail = filterDetails[filter.name];
                      return (
                        <div
                          key={filter.name}
                          className="flex items-center justify-between gap-4 border-b border-border/50 px-3 py-2.5 last:border-0 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                filter.active
                                  ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                                  : "bg-muted-foreground/50",
                              )}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs text-foreground/90">
                                {detail.label}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {detail.description}
                              </p>
                            </div>
                          </div>
                          <StatusLed
                            active={filter.active}
                            label={filter.active ? "READY" : "SKIP"}
                          />
                        </div>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
              </CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {formatUpdatedAt(settings.updatedAt)}
                </span>
              </div>
            </Card>

            <div className="flex flex-col gap-4">
              <ModifierCard
                title="Caveman"
                description={
                  <>
                    Terse responses, no fluff. Adapted from
                    JuliusBrussee/caveman.
                  </>
                }
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
                description={
                  <>
                    Minimal code, YAGNI-first. Adapted from
                    DietrichGebert/ponytail.
                  </>
                }
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
