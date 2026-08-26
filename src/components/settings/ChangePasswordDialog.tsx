import {
  AlertCircleIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type PasswordField = keyof PasswordValues;

type PasswordVisibility = {
  current: boolean;
  next: boolean;
  confirm: boolean;
};

const initialValues: PasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const initialVisibility: PasswordVisibility = {
  current: false,
  next: false,
  confirm: false,
};

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const [values, setValues] = useState<PasswordValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<PasswordField, string>>
  >({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<PasswordVisibility>(initialVisibility);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateValue(field: PasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
  }

  function validate(): Partial<Record<PasswordField, string>> {
    const nextErrors: Partial<Record<PasswordField, string>> = {};

    if (!values.currentPassword) {
      nextErrors.currentPassword = "Enter your current password.";
    }

    if (values.newPassword.length < 8) {
      nextErrors.newPassword =
        "The new password must be at least 8 characters.";
    }

    if (values.newPassword !== values.confirmPassword) {
      nextErrors.confirmPassword = "Password confirmation does not match.";
    }

    return nextErrors;
  }

  function resetState() {
    setValues(initialValues);
    setFieldErrors({});
    setRequestError(null);
    setVisibility(initialVisibility);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) resetState();
  }

  function toggleVisibility(field: keyof PasswordVisibility) {
    setVisibility((current) => ({ ...current, [field]: !current[field] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    setIsSubmitting(true);

    try {
      await apiClient.post<{ ok: true }>("/api/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password updated");
      onOpenChange(false);
      resetState();
    } catch (error) {
      setRequestError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const passwordMeetsMinimum = values.newPassword.length >= 8;
  const passwordsMatch =
    values.newPassword.length > 0 &&
    values.newPassword === values.confirmPassword;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base">Change password</DialogTitle>
              </div>
              <DialogDescription className="mt-1.5 text-xs leading-relaxed">
                Rotates the dashboard sign-in credential.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <FieldGroup className="min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain px-6 py-5 scrollbar-subtle">
            <Field
              data-invalid={Boolean(fieldErrors.currentPassword)}
              className="gap-2"
            >
              <FieldLabel
                htmlFor="current-password"
                className="items-center gap-2 text-xs"
              >
                <LockKeyholeIcon className="size-3.5 text-muted-foreground" />
                Current password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="current-password"
                  type={visibility.current ? "text" : "password"}
                  autoComplete="current-password"
                  value={values.currentPassword}
                  onChange={(event) =>
                    updateValue("currentPassword", event.target.value)
                  }
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.currentPassword)}
                  aria-describedby={`current-password-description${
                    fieldErrors.currentPassword ? " current-password-error" : ""
                  }`}
                  className="pr-10"
                  autoFocus
                  required
                />
                <PasswordVisibilityButton
                  visible={visibility.current}
                  onClick={() => toggleVisibility("current")}
                  label="current password"
                  disabled={isSubmitting}
                />
              </div>
              <FieldDescription
                id="current-password-description"
                className="text-[11px]"
              >
                Used only to verify this change.
              </FieldDescription>
              <FieldError id="current-password-error">
                {fieldErrors.currentPassword}
              </FieldError>
            </Field>

            <div className="border-t border-border/60" />

            <Field
              data-invalid={Boolean(fieldErrors.newPassword)}
              className="gap-2"
            >
              <FieldLabel
                htmlFor="new-password"
                className="items-center gap-2 text-xs"
              >
                <KeyRoundIcon className="size-3.5 text-muted-foreground" />
                New password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="new-password"
                  type={visibility.next ? "text" : "password"}
                  autoComplete="new-password"
                  value={values.newPassword}
                  onChange={(event) =>
                    updateValue("newPassword", event.target.value)
                  }
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.newPassword)}
                  aria-describedby={`new-password-description${
                    fieldErrors.newPassword ? " new-password-error" : ""
                  }`}
                  className="pr-10"
                  minLength={8}
                  required
                />
                <PasswordVisibilityButton
                  visible={visibility.next}
                  onClick={() => toggleVisibility("next")}
                  label="new password"
                  disabled={isSubmitting}
                />
              </div>
              <FieldDescription
                id="new-password-description"
                aria-live="polite"
                className="flex items-center gap-1.5 text-[11px]"
              >
                <CheckIcon
                  className={`size-3 ${
                    passwordMeetsMinimum
                      ? "text-emerald-500"
                      : "text-muted-foreground/50"
                  }`}
                />
                {passwordMeetsMinimum
                  ? "Minimum 8 characters — met"
                  : "Minimum 8 characters"}
              </FieldDescription>
              <FieldError id="new-password-error">
                {fieldErrors.newPassword}
              </FieldError>
            </Field>

            <Field
              data-invalid={Boolean(fieldErrors.confirmPassword)}
              className="gap-2"
            >
              <FieldLabel
                htmlFor="confirm-password"
                className="items-center gap-2 text-xs"
              >
                <KeyRoundIcon className="size-3.5 text-muted-foreground" />
                Confirm new password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={visibility.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={values.confirmPassword}
                  onChange={(event) =>
                    updateValue("confirmPassword", event.target.value)
                  }
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  aria-describedby={`confirm-password-description${
                    fieldErrors.confirmPassword ? " confirm-password-error" : ""
                  }`}
                  className="pr-10"
                  minLength={8}
                  required
                />
                <PasswordVisibilityButton
                  visible={visibility.confirm}
                  onClick={() => toggleVisibility("confirm")}
                  label="password confirmation"
                  disabled={isSubmitting}
                />
              </div>
              <FieldDescription
                id="confirm-password-description"
                aria-live="polite"
                className="flex items-center gap-1.5 text-[11px]"
              >
                <CheckIcon
                  className={`size-3 ${
                    passwordsMatch
                      ? "text-emerald-500"
                      : "text-muted-foreground/50"
                  }`}
                />
                {passwordsMatch
                  ? "Must match the new password — matches"
                  : "Must match the new password"}
              </FieldDescription>
              <FieldError id="confirm-password-error">
                {fieldErrors.confirmPassword}
              </FieldError>
            </Field>

            {requestError ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Password could not be updated</AlertTitle>
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              Save password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordVisibilityButton({
  visible,
  onClick,
  label,
  disabled,
}: {
  visible: boolean;
  onClick: () => void;
  label: string;
  disabled: boolean;
}) {
  const Icon = visible ? EyeOffIcon : EyeIcon;
  const action = visible ? "Hide" : "Show";

  return (
    <button
      type="button"
      className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${action} ${label}`}
      aria-pressed={visible}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

export { ChangePasswordDialog };
export default ChangePasswordDialog;
