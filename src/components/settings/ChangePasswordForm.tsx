import { CheckCircle2Icon, SaveIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

function ChangePasswordForm() {
  const [values, setValues] = useState<PasswordValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<PasswordField, string>>
  >({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  function updateValue(field: PasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
    setIsSuccess(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    setIsSuccess(false);
    setIsSubmitting(true);

    try {
      await apiClient.post<{ ok: true }>("/api/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setValues(initialValues);
      setIsSuccess(true);
    } catch (error) {
      setRequestError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganti password</CardTitle>
        <CardDescription>
          Perbarui password yang digunakan untuk masuk ke dashboard.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
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
            {isSuccess ? (
              <Alert>
                <CheckCircle2Icon />
                <AlertTitle>Password diperbarui</AlertTitle>
                <AlertDescription>
                  Gunakan password baru pada sesi login berikutnya.
                </AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            Simpan password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export { ChangePasswordForm };
export default ChangePasswordForm;
