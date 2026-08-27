import { LockKeyholeIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

function PreferencesCard() {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="grid-cols-[auto_1fr] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground"
          aria-hidden
        >
          <SlidersHorizontalIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium">Preferences</CardTitle>
          <CardDescription className="text-xs">
            Sign-in credential and dashboard appearance.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-0 px-5 py-4">
        <FieldGroup className="gap-0 overflow-hidden rounded-lg border border-border/60">
          <Field
            orientation="horizontal"
            className="px-3 py-3 transition-colors hover:bg-muted/30"
          >
            <FieldContent>
              <FieldLabel className="items-center gap-2 text-xs">
                <LockKeyholeIcon className="size-3.5 text-muted-foreground" />
                Password
              </FieldLabel>
              <FieldDescription className="text-[11px]">
                Rotates the credential used to sign in to this dashboard.
              </FieldDescription>
            </FieldContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPasswordDialogOpen(true)}
            >
              Change
            </Button>
          </Field>
          <div className="border-t border-border/60 px-3 py-3">
            <ThemeToggle />
          </div>
        </FieldGroup>
      </CardContent>

      <ChangePasswordDialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      />
    </Card>
  );
}

export { PreferencesCard };
export default PreferencesCard;
