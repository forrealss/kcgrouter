import { AlertCircleIcon, LockKeyholeIcon } from "lucide-react";
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
import { getApiErrorMessage } from "@/lib/api-client";

interface LoginFormProps {
  onLogin: (password: string) => Promise<void>;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onLogin(password);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Masuk ke KCG Router</CardTitle>
        <CardDescription>
          Gunakan password aplikasi untuk membuka dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                disabled={isSubmitting}
                required
                autoFocus
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Login gagal</AlertTitle>
                <AlertDescription>
                  Periksa password Anda lalu coba lagi.
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LockKeyholeIcon data-icon="inline-start" />
              )}
              Masuk
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Sesi dashboard dikelola melalui cookie aman.
      </CardFooter>
    </Card>
  );
}
