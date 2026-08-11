import { LockKeyholeIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

function PreferencesCard() {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  return (
    <Card className="gap-5 overflow-hidden">
      <CardHeader className="px-5 pb-0">
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"
            aria-hidden
          >
            <SlidersHorizontalIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium">Preferences</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Account security and dashboard appearance.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          LOCAL
        </Badge>
      </CardHeader>
      <CardContent className="px-5">
        <FieldGroup className="gap-0 overflow-hidden rounded-lg border">
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
                Update the dashboard sign-in credential.
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
      <div className="flex items-center gap-2 border-t border-border/50 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
        Session controls ready
      </div>

      <ChangePasswordDialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      />
    </Card>
  );
}

export { PreferencesCard };
export default PreferencesCard;
