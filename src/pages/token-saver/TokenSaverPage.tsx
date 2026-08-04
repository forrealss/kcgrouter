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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTokenSaver } from "@/hooks/useTokenSaver";

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
  } = useTokenSaver();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token saver</CardTitle>
          <CardDescription>
            Reduce the amount of tool output included in your context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading token saver settings…
          </div>
        </CardContent>
        <CardFooter>
          <span className="text-sm text-muted-foreground">
            Usage statistics will appear when settings load.
          </span>
        </CardFooter>
      </Card>
    );
  }

  if (loadError || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token saver</CardTitle>
          <CardDescription>
            Reduce the amount of tool output included in your context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Could not load token saver</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={() => void loadSettings()}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token saver</CardTitle>
        <CardDescription>
          Reduce the amount of tool output included in your context.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal" data-disabled={isSaving || undefined}>
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
  );
}
