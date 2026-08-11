import {
  ActivityIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react";
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
    detail: 'fallback via combo "prod-primary"',
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
      className="overflow-hidden rounded-lg border border-black/80 bg-[#101114] font-mono text-xs font-medium leading-relaxed shadow-2xl shadow-black/20"
      role="img"
      aria-label="Routing log example: a request to OpenAI hits a quota limit, KCG Router automatically reroutes it to Anthropic, and the request succeeds."
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-none dark:shadow-[0_0_6px] dark:shadow-emerald-400/70" />
          route.log
        </span>
        <span>tail -f</span>
      </div>
      <div className="min-h-32 p-3 sm:p-4">
        {trace.map((line, i) => (
          <div
            key={`${line.at}-${line.target}-${line.path}`}
            aria-hidden="true"
            className="motion-safe:animate-trace-in flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5 motion-safe:opacity-0"
            style={{ animationDelay: `${i * 550}ms` }}
          >
            <span className="text-zinc-500">{line.at}</span>
            <span className="text-zinc-300">{line.method}</span>
            <span className="break-all text-zinc-100">{line.path}</span>
            <span className="text-zinc-600">→</span>
            <span className="text-zinc-300">{line.target}</span>
            <span className={outcomeStyles[line.outcome]}>{line.detail}</span>
          </div>
        ))}
        <span
          aria-hidden="true"
          className="motion-safe:animate-trace-blink mt-1 inline-block h-3.5 w-1.5 translate-y-0.5 bg-zinc-300"
          style={{ animationDelay: `${trace.length * 550}ms` }}
        />
      </div>
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
    <main className="grid min-h-svh w-full bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]">
      <section className="relative flex min-h-0 flex-col overflow-hidden bg-sidebar px-6 py-7 text-sidebar-foreground sm:px-10 lg:min-h-svh lg:px-12 lg:py-10 xl:px-20">
        <div className="pointer-events-none absolute inset-0 opacity-0 dark:opacity-40 [background-image:linear-gradient(oklch(1_0_0_/_2%)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0_/_2%)_1px,transparent_1px)] [background-size:40px_40px]" />
        <header className="relative flex items-center justify-between gap-4 border-b border-sidebar-border/70 pb-5">
          <div className="flex items-center gap-3">
            <Logo className="size-8 shrink-0" />
            <div>
              <p className="font-mono text-sm font-semibold tracking-tight">
                KCG Router
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">
                infrastructure gateway
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/60 sm:flex">
            <span className="size-2 rounded-full bg-emerald-400 shadow-none dark:shadow-[0_0_6px] dark:shadow-emerald-400/70" />
            system live
          </div>
        </header>

        <div className="relative flex flex-col py-16 lg:flex-1 lg:justify-start lg:py-20">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              <ActivityIcon className="size-3.5" />
              request routing / active
            </p>
            <h1 className="max-w-xl text-3xl leading-[1.08] font-semibold tracking-tight text-sidebar-foreground text-balance sm:text-4xl">
              Keep traffic moving when providers hit their limits.
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-sidebar-foreground/75">
              KCG Router observes provider health, applies your combo strategy,
              and reroutes requests without interrupting your clients.
            </p>
            <div className="mt-8 sm:mt-10">
              <TraceLog />
            </div>
          </div>
        </div>

        <footer className="relative flex items-center gap-2 border-t border-sidebar-border/70 pt-5 font-mono text-[10px] text-sidebar-foreground/45">
          <ShieldCheckIcon className="size-3.5 text-emerald-400/80" />
          credentials encrypted at rest · aes-256-gcm
        </footer>
      </section>

      <section className="flex min-h-0 items-center justify-center border-t bg-card px-6 py-12 sm:px-10 lg:min-h-svh lg:border-t-0 lg:border-l lg:px-12 lg:py-20 xl:px-20">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between border-b pb-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                secure console
              </p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                /auth/session
              </p>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-none dark:shadow-[0_0_6px] dark:shadow-emerald-500/70" />
              ready
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              Sign in to the dashboard
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/70">
              Enter your application password to access the routing control
              room.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <FieldGroup className="gap-5">
              <Field data-invalid={Boolean(error)}>
                <FieldLabel
                  htmlFor="password"
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/80"
                >
                  Application password
                </FieldLabel>
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
                  className="h-11 bg-muted/20 font-mono text-sm font-medium tracking-wide text-foreground dark:bg-input/20"
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              {error ? (
                <Alert
                  variant="destructive"
                  aria-live="polite"
                  className="font-mono text-xs"
                >
                  <AlertCircleIcon />
                  <AlertTitle className="font-sans text-sm">
                    Sign-in failed
                  </AlertTitle>
                  <AlertDescription className="font-sans text-xs">
                    Check your password and try again.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="submit"
                className="h-11 w-full font-mono text-xs uppercase tracking-[0.12em] shadow-sm transition-transform active:scale-[0.98] dark:shadow-lg dark:shadow-primary/15"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <LockKeyholeIcon data-icon="inline-start" />
                )}
                {isSubmitting ? "Authenticating" : "Open dashboard"}
                {!isSubmitting ? (
                  <ArrowRightIcon data-icon="inline-end" />
                ) : null}
              </Button>
            </FieldGroup>
          </form>

          <p className="mt-8 border-t pt-5 font-mono text-[11px] leading-relaxed text-muted-foreground/90">
            Session access is protected by a secure, httpOnly cookie. This
            console is intended for local infrastructure operations.
          </p>
        </div>
      </section>
    </main>
  );
}
