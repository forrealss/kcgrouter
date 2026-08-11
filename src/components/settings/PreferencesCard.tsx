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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60"
            aria-hidden
          >
            <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
          </span>
          Preferences
        </CardTitle>
        <CardDescription>
          Manage account security and dashboard appearance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel className="items-center gap-2">
                <LockKeyholeIcon className="size-4 text-muted-foreground" />
                Password
              </FieldLabel>
              <FieldDescription>
                Update the password used to sign in to the dashboard.
              </FieldDescription>
            </FieldContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPasswordDialogOpen(true)}
            >
              Change password
            </Button>
          </Field>
          <ThemeToggle />
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
