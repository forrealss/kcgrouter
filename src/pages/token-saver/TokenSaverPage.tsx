import { filterDetails } from "@/components/token-saver/filter-details";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTokenSaver } from "@/hooks/useTokenSaver";

const CAVEMAN_LEVELS = [
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

const PONYTAIL_LEVELS = [
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

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
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

  if (isLoading) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Token Saver</h2>
          <p className="text-sm text-muted-foreground">
            Reduce the amount of tool output included in your context.
          </p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading token saver settings...
          </CardContent>
        </Card>
      </section>
    );
  }

  if (loadError || !settings) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Token Saver</h2>
          <p className="text-sm text-muted-foreground">
            Reduce the amount of tool output included in your context.
          </p>
        </div>
        <Card>
          <CardContent className="py-6">
            <Alert variant="destructive">
              <AlertTitle>Token saver could not be loaded</AlertTitle>
              <AlertDescription className="gap-3">
                <p>{loadError}</p>
                <Button
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
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Token Saver</h2>
        <p className="text-sm text-muted-foreground">
          Reduce the amount of tool output included in your context.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Token saver</CardTitle>
          <CardDescription>
            Reduce the amount of tool output included in your context.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
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
                onCheckedChange={(checked) => void persistEnabled(checked)}
              />
            </Field>
          </FieldGroup>

          {saveError && (
            <Alert variant="destructive">
              <AlertTitle>Could not save your preference</AlertTitle>
              <AlertDescription>
                <p>{saveError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void persistEnabled(!settings.enabled)}
                >
                  Retry save
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <FieldSet>
            <FieldLegend variant="label">Supported filters</FieldLegend>
            <FieldGroup>
              {settings.filters.map((filter) => {
                const detail = filterDetails[filter.name];

                return (
                  <Field key={filter.name} orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>{detail.label}</FieldLabel>
                      <FieldDescription>{detail.description}</FieldDescription>
                    </FieldContent>
                    <Badge variant={filter.active ? "secondary" : "outline"}>
                      {filter.active ? "Active" : "Inactive"}
                    </Badge>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        </CardContent>
        <CardFooter className="justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Total tokens saved
            </span>
            <span className="text-2xl font-semibold">
              {new Intl.NumberFormat().format(settings.totalTokensSaved)}
            </span>
          </div>
          {isSaving ? (
            <Badge variant="secondary">
              <Spinner data-icon="inline-start" />
              Saving…
            </Badge>
          ) : (
            <Badge variant={settings.enabled ? "default" : "outline"}>
              {settings.enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {formatUpdatedAt(settings.updatedAt)}
          </span>
        </CardFooter>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Caveman</CardTitle>
            <CardDescription>
              Compress agent output style — terse responses, no fluff, keep
              substance. Adapted from{" "}
              <a
                href="https://github.com/JuliusBrussee/caveman"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                JuliusBrussee/caveman
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              orientation="horizontal"
              data-disabled={isSaving || undefined}
            >
              <FieldContent>
                <FieldLabel htmlFor="caveman-enabled">
                  Enable caveman
                </FieldLabel>
                <FieldDescription>
                  Inject terse response style into every request.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="caveman-enabled"
                checked={settings.cavemanEnabled}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  void persistCaveman({ enabled: checked })
                }
              />
            </Field>
            {settings.cavemanEnabled && (
              <Field
                orientation="horizontal"
                data-disabled={isSaving || undefined}
              >
                <FieldContent>
                  <FieldLabel>Caveman level</FieldLabel>
                  <FieldDescription>
                    {CAVEMAN_LEVELS.find((l) => l.id === settings.cavemanLevel)
                      ?.description ?? "Intensity level"}
                  </FieldDescription>
                </FieldContent>
                <Select
                  value={settings.cavemanLevel}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    void persistCaveman({ level: value })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAVEMAN_LEVELS.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ponytail</CardTitle>
            <CardDescription>
              Inject "lazy senior dev" prompt — minimal code, YAGNI-first,
              deletion over addition. Adapted from{" "}
              <a
                href="https://github.com/DietrichGebert/ponytail"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                DietrichGebert/ponytail
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              orientation="horizontal"
              data-disabled={isSaving || undefined}
            >
              <FieldContent>
                <FieldLabel htmlFor="ponytail-enabled">
                  Enable ponytail
                </FieldLabel>
                <FieldDescription>
                  Bias LLM toward minimal, YAGNI-first code.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="ponytail-enabled"
                checked={settings.ponytailEnabled}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  void persistPonytail({ enabled: checked })
                }
              />
            </Field>
            {settings.ponytailEnabled && (
              <Field
                orientation="horizontal"
                data-disabled={isSaving || undefined}
              >
                <FieldContent>
                  <FieldLabel>Ponytail level</FieldLabel>
                  <FieldDescription>
                    {PONYTAIL_LEVELS.find(
                      (l) => l.id === settings.ponytailLevel,
                    )?.description ?? "Intensity level"}
                  </FieldDescription>
                </FieldContent>
                <Select
                  value={settings.ponytailLevel}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    void persistPonytail({ level: value })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PONYTAIL_LEVELS.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
