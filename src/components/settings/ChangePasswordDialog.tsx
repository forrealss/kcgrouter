import { SaveIcon } from "lucide-react";
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

const initialValues: PasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateValue(field: PasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
  }

  function validate(): Partial<Record<PasswordField, string>> {
    const nextErrors: Partial<Record<PasswordField, string>> = {};

    if (!values.currentPassword) {
      nextErrors.currentPassword = "Masukkan password saat ini.";
    }

    if (values.newPassword.length < 8) {
      nextErrors.newPassword = "Password baru minimal 8 karakter.";
    }

    if (values.newPassword !== values.confirmPassword) {
      nextErrors.confirmPassword = "Konfirmasi password tidak sama.";
    }

    return nextErrors;
  }

  function resetState() {
    setValues(initialValues);
    setFieldErrors({});
    setRequestError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) resetState();
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
      toast.success("Password diperbarui");
      onOpenChange(false);
      resetState();
    } catch (error) {
      setRequestError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ganti password</DialogTitle>
          <DialogDescription>
            Perbarui password yang digunakan untuk masuk ke dashboard.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.currentPassword)}>
              <FieldLabel htmlFor="current-password">
                Password saat ini
              </FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={(event) =>
                  updateValue("currentPassword", event.target.value)
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.currentPassword)}
                autoFocus
                required
              />
              <FieldError>{fieldErrors.currentPassword}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.newPassword)}>
              <FieldLabel htmlFor="new-password">Password baru</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={values.newPassword}
                onChange={(event) =>
                  updateValue("newPassword", event.target.value)
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                minLength={8}
                required
              />
              <FieldError>{fieldErrors.newPassword}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.confirmPassword)}>
              <FieldLabel htmlFor="confirm-password">
                Konfirmasi password baru
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(event) =>
                  updateValue("confirmPassword", event.target.value)
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                minLength={8}
                required
              />
              <FieldError>{fieldErrors.confirmPassword}</FieldError>
            </Field>
            {requestError ? (
              <Alert variant="destructive">
                <AlertTitle>Password tidak dapat diperbarui</AlertTitle>
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Simpan password
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ChangePasswordDialog };
export default ChangePasswordDialog;
