import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/icons/Logo";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import {
  assessPassword,
  DEFAULT_PASSWORD,
  type PasswordAssessment,
  type PasswordStrength,
} from "@/lib/password-strength";

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

const strengthMeta: Record<
  PasswordStrength,
  { label: string; text: string; bar: string }
> = {
  empty: {
    label: "—",
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/30",
  },
  weak: { label: "weak", text: "text-destructive", bar: "bg-destructive" },
  fair: { label: "fair", text: "text-warning", bar: "bg-warning" },
  strong: { label: "strong", text: "text-success", bar: "bg-success" },
};

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Forced mode: the dashboard is still on the default password. Renders as a
   * full-screen gate instead of a dialog, and cannot be dismissed.
   */
  forced?: boolean;
  /** Called after a successful change so the caller can refresh session state. */
  onSuccess?: () => void;
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  forced = false,
  onSuccess,
}: ChangePasswordDialogProps) {
  const form = usePasswordChangeForm({ forced, onOpenChange, onSuccess });

  if (forced) {
    return open ? <ForcedPasswordGate form={form} /> : null;
  }

  return (
    <Dialog open={open} onOpenChange={form.handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">Change password</DialogTitle>
              <DialogDescription className="mt-1.5 text-xs leading-relaxed">
                Rotates the dashboard sign-in credential. Existing sessions stay
                signed in.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit} className="flex min-h-0 flex-col">
          <FieldGroup className="min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain px-6 py-5 scrollbar-subtle">
            <PasswordFields form={form} />
          </FieldGroup>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.handleOpenChange(false)}
              disabled={form.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.isSubmitting}>
              {form.isSubmitting ? (
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

/**
 * Full-screen takeover for the forced change.
 *
 * Mirrors the login screen's card-on-backdrop composition so the first thing a
 * new operator sees after signing in still reads as the same control room,
 * rather than a modal bolted onto an empty dashboard.
 */
function ForcedPasswordGate({ form }: { form: PasswordChangeForm }) {
  return (
    <main className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,var(--color-warning)/8%,transparent_70%)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forced-password-title"
        className="motion-safe:animate-trace-in relative w-full max-w-md rounded-xl border bg-card/90 shadow-2xl shadow-black/10 backdrop-blur-md dark:shadow-black/40"
      >
        <div className="flex items-center gap-3 border-b px-6 py-5">
          <Logo className="size-8 shrink-0" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold tracking-tight">
              KCG Router
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              /auth/change-password
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
            <span className="size-1.5 rounded-full bg-warning shadow-none dark:shadow-[0_0_6px] dark:shadow-warning/70" />
            locked
          </span>
        </div>

        <div className="px-6 py-6">
          <h1
            id="forced-password-title"
            className="text-xl font-semibold tracking-tight"
          >
            Set a password before you route traffic
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This gateway still uses the default password and listens on every
            network interface. Anyone who can reach this port can sign in and
            spend your provider credentials.
          </p>

          <p className="mt-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-warning">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            Providers, combos, and API keys stay locked until this is done.
          </p>
        </div>

        <form onSubmit={form.handleSubmit}>
          <FieldGroup className="gap-5 px-6 pb-6">
            <PasswordFields form={form} />
            <Button
              type="submit"
              className="h-11 w-full font-mono text-xs uppercase tracking-[0.12em] shadow-sm transition-transform active:scale-[0.98] dark:shadow-lg dark:shadow-primary/15"
              disabled={form.isSubmitting}
            >
              {form.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LockKeyholeIcon data-icon="inline-start" />
              )}
              {form.isSubmitting ? "Saving" : "Save and unlock"}
              {form.isSubmitting ? null : (
                <ArrowRightIcon data-icon="inline-end" />
              )}
            </Button>
          </FieldGroup>
        </form>

        <p className="flex items-center gap-2 border-t px-6 py-4 font-mono text-[10px] text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 shrink-0 text-success/80" />
          aes-256-gcm at rest · httpOnly session cookie
        </p>
      </div>
    </main>
  );
}

/** The three inputs plus the strength readout, shared by both presentations. */
function PasswordFields({ form }: { form: PasswordChangeForm }) {
  const {
    forced,
    values,
    fieldErrors,
    visibility,
    isSubmitting,
    assessment,
    updateValue,
    toggleVisibility,
    requestError,
  } = form;

  const confirmMatches =
    values.confirmPassword.length > 0 &&
    values.newPassword === values.confirmPassword;

  return (
    <>
      {forced ? null : (
        <PasswordInput
          id="current-password"
          label="Current password"
          icon={<LockKeyholeIcon className="size-3.5" />}
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(value) => updateValue("currentPassword", value)}
          visible={visibility.current}
          onToggleVisibility={() => toggleVisibility("current")}
          disabled={isSubmitting}
          error={fieldErrors.currentPassword}
          autoFocus
          required
        />
      )}

      <PasswordInput
        id="new-password"
        label="New password"
        icon={<KeyRoundIcon className="size-3.5" />}
        autoComplete="new-password"
        value={values.newPassword}
        onChange={(value) => updateValue("newPassword", value)}
        visible={visibility.next}
        onToggleVisibility={() => toggleVisibility("next")}
        disabled={isSubmitting}
        error={fieldErrors.newPassword}
        autoFocus={forced}
        required
        below={<StrengthReadout assessment={assessment} />}
      />

      <PasswordInput
        id="confirm-password"
        label="Confirm new password"
        icon={<KeyRoundIcon className="size-3.5" />}
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(value) => updateValue("confirmPassword", value)}
        visible={visibility.confirm}
        onToggleVisibility={() => toggleVisibility("confirm")}
        disabled={isSubmitting}
        error={fieldErrors.confirmPassword}
        required
        below={
          confirmMatches ? (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-success">
              <CheckIcon className="size-3" />
              Both entries match
            </p>
          ) : null
        }
      />

      {requestError ? (
        <p
          role="alert"
          className="motion-safe:animate-trace-in flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-destructive"
        >
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
          {requestError}
        </p>
      ) : null}
    </>
  );
}

/**
 * Segmented strength meter plus the checklist behind it.
 *
 * The checklist is the point: a bare meter tells the user they failed without
 * saying how to pass. Blocking rules render as destructive when unmet, advisory
 * ones stay muted so they read as suggestions rather than errors.
 */
function StrengthReadout({ assessment }: { assessment: PasswordAssessment }) {
  const meta = strengthMeta[assessment.strength];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3].map((segment) => (
            <span
              key={segment}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                assessment.score >= segment ? meta.bar : "bg-border"
              }`}
            />
          ))}
        </div>
        <span
          aria-live="polite"
          className={`font-mono text-[10px] uppercase tracking-[0.12em] ${meta.text}`}
        >
          {meta.label}
        </span>
      </div>

      <ul className="grid gap-1.5">
        {assessment.checks.map((check) => {
          const tone = check.passed
            ? "text-success"
            : check.blocking
              ? "text-destructive"
              : "text-muted-foreground";

          return (
            <li
              key={check.id}
              className={`flex items-center gap-2 font-mono text-[11px] ${tone}`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  check.passed
                    ? "bg-success shadow-none dark:shadow-[0_0_6px] dark:shadow-success/70"
                    : check.blocking
                      ? "bg-destructive/70"
                      : "bg-muted-foreground/40"
                }`}
              />
              {check.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  label: string;
  icon: ReactNode;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  disabled: boolean;
  error?: string;
  autoFocus?: boolean;
  required?: boolean;
  below?: ReactNode;
}

function PasswordInput({
  id,
  label,
  icon,
  autoComplete,
  value,
  onChange,
  visible,
  onToggleVisibility,
  disabled,
  error,
  autoFocus,
  required,
  below,
}: PasswordInputProps) {
  const errorId = `${id}-error`;
  const Icon = visible ? EyeOffIcon : EyeIcon;

  return (
    <Field data-invalid={Boolean(error)} className="gap-2">
      <FieldLabel
        htmlFor={id}
        className="items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/80"
      >
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="h-11 bg-muted/20 pr-10 font-mono text-sm tracking-wide dark:bg-input/20"
          autoFocus={autoFocus}
          required={required}
        />
        <button
          type="button"
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          onClick={onToggleVisibility}
          disabled={disabled}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          <Icon className="size-3.5" />
        </button>
      </div>
      {below}
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

interface PasswordChangeForm {
  forced: boolean;
  values: PasswordValues;
  fieldErrors: Partial<Record<PasswordField, string>>;
  requestError: string | null;
  visibility: PasswordVisibility;
  isSubmitting: boolean;
  assessment: PasswordAssessment;
  updateValue: (field: PasswordField, value: string) => void;
  toggleVisibility: (field: keyof PasswordVisibility) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleOpenChange: (nextOpen: boolean) => void;
}

function usePasswordChangeForm({
  forced,
  onOpenChange,
  onSuccess,
}: {
  forced: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}): PasswordChangeForm {
  const [values, setValues] = useState<PasswordValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<PasswordField, string>>
  >({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<PasswordVisibility>(initialVisibility);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assessment = assessPassword(values.newPassword);

  function updateValue(field: PasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
  }

  function validate(): Partial<Record<PasswordField, string>> {
    const nextErrors: Partial<Record<PasswordField, string>> = {};

    // In forced mode the current password is known to be the default, so the
    // field is hidden and supplied automatically.
    if (!forced && !values.currentPassword) {
      nextErrors.currentPassword = "Enter your current password.";
    }

    // The checklist already spells out which rule failed, so this only has to
    // stop the submit.
    if (!assessment.acceptable) {
      nextErrors.newPassword = "This password does not meet the requirements.";
    }

    if (values.newPassword !== values.confirmPassword) {
      nextErrors.confirmPassword = "Both entries must match.";
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
    // In forced mode the only way out is a successful submit.
    if (forced && !nextOpen) return;
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
        currentPassword: forced ? DEFAULT_PASSWORD : values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password updated");
      onOpenChange(false);
      resetState();
      onSuccess?.();
    } catch (error) {
      setRequestError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    forced,
    values,
    fieldErrors,
    requestError,
    visibility,
    isSubmitting,
    assessment,
    updateValue,
    toggleVisibility,
    handleSubmit,
    handleOpenChange,
  };
}

export { ChangePasswordDialog };
export default ChangePasswordDialog;
