import { AlertCircleIcon, LockKeyholeIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

type TraceLine = {
  at: string;
  method: "POST";
  path: string;
  target: string;
  outcome: "ok" | "limited" | "reroute";
  detail: string;
};

// A representative fallback trace: the router's actual job in three lines.
const trace: TraceLine[] = [
  {
    at: "14:02:11",
    method: "POST",
    path: "/v1/chat/completions",
    target: "openai:acct-02",
    outcome: "limited",
    detail: "429 quota exceeded (5h window)",
  },
  {
    at: "14:02:11",
    method: "POST",
    path: "/v1/chat/completions",
    target: "anthropic:acct-01",
    outcome: "reroute",
    detail: "fallback via combo \"prod-primary\"",
  },
  {
    at: "14:02:12",
    method: "POST",
    path: "/v1/chat/completions",
    target: "anthropic:acct-01",
    outcome: "ok",
    detail: "200 in 640ms · 1,204 tokens",
  },
];

const outcomeStyles: Record<TraceLine["outcome"], string> = {
  ok: "text-emerald-400",
  limited: "text-amber-400",
  reroute: "text-sky-400",
};

function TraceLog() {
  return (
    <div
      className="rounded-lg border border-sidebar-border bg-black/30 p-4 font-mono text-[13px] leading-relaxed"
      role="img"
      aria-label="Contoh log routing: request ke OpenAI kena limit kuota, KCG Router otomatis mengalihkan ke Anthropic, permintaan berhasil."
    >
      {trace.map((line, i) => (
        <div
          key={`${line.at}-${line.target}-${line.path}`}
          className="motion-safe:animate-trace-in flex flex-wrap items-baseline gap-x-2 py-0.5 opacity-0"
          style={{ animationDelay: `${i * 550}ms` }}
        >
          <span className="text-sidebar-foreground/40">{line.at}</span>
          <span className="text-sidebar-foreground/70">{line.method}</span>
          <span className="text-sidebar-foreground/90">{line.path}</span>
          <span className="text-sidebar-foreground/40">→</span>
          <span className="text-sidebar-foreground/70">{line.target}</span>
          <span className={outcomeStyles[line.outcome]}>{line.detail}</span>
        </div>
      ))}
      <span
        aria-hidden
        className="motion-safe:animate-trace-blink inline-block h-3.5 w-1.5 translate-y-0.5 bg-sidebar-foreground/60"
        style={{ animationDelay: `${trace.length * 550}ms` }}
      />
    </div>
  );
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
    <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-xl lg:grid-cols-[1.1fr_1fr]">
      {/* Signature panel: a live-looking routing trace */}
      <div className="hidden flex-col justify-between gap-8 bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7 shrink-0" />
            <span className="text-sm font-semibold">KCG Router</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>3 provider tersambung</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="max-w-sm text-xl leading-snug font-semibold tracking-tight text-balance">
            Saat satu provider kena limit, KCG Router mengalihkannya sendiri.
          </h2>
          <TraceLog />
        </div>

        <p className="text-xs text-sidebar-foreground/40">
          Kredensial provider disimpan terenkripsi (AES-256-GCM).
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center gap-8 p-8 sm:p-10">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            KCG Router
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Masuk ke dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Gunakan password aplikasi untuk membuka dashboard.
          </p>
        </div>

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

        <p className="text-center text-xs text-muted-foreground">
          Sesi dashboard dikelola melalui cookie aman.
        </p>
      </div>
    </div>
  );
}
