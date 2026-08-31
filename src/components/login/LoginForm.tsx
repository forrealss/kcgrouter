import {
  ArrowRightIcon,
  ClockIcon,
  InfoIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatCountdown, useLoginLockout } from "@/hooks/useLoginLockout";
import {
  ApiClientError,
  apiClient,
  getApiErrorMessage,
} from "@/lib/api-client";
import { DEFAULT_PASSWORD } from "@/lib/password-strength";

interface LoginFormProps {
  onLogin: (password: string) => Promise<void>;
}

type TraceLine = {
  at: string;
  target: string;
  outcome: "ok" | "limited" | "reroute";
  detail: string;
};

const trace: TraceLine[] = [
  {
    at: "14:02:09",
    target: "openai:acct-02",
    outcome: "ok",
    detail: "200 · 512ms · 842 tokens",
  },
  {
    at: "14:02:10",
    target: "anthropic:acct-01",
    outcome: "ok",
    detail: "200 · 703ms · 1,980 tokens",
  },
  {
    at: "14:02:11",
    target: "openai:acct-02",
    outcome: "limited",
    detail: "429 quota exceeded (5h window)",
  },
  {
    at: "14:02:11",
    target: "anthropic:acct-01",
    outcome: "reroute",
    detail: 'fallback via combo "prod-primary"',
  },
  {
    at: "14:02:12",
    target: "anthropic:acct-01",
    outcome: "ok",
    detail: "200 · 640ms · 1,204 tokens",
  },
  {
    at: "14:02:13",
    target: "gemini:acct-04",
    outcome: "ok",
    detail: "200 · 388ms · 611 tokens",
  },
  {
    at: "14:02:14",
    target: "kiro:acct-03",
    outcome: "limited",
    detail: "429 rate limited (1m window)",
  },
  {
    at: "14:02:14",
    target: "gemini:acct-04",
    outcome: "reroute",
    detail: 'fallback via combo "cheap-bulk"',
  },
  {
    at: "14:02:15",
    target: "gemini:acct-04",
    outcome: "ok",
    detail: "200 · 455ms · 736 tokens",
  },
  {
    at: "14:02:16",
    target: "mimo:acct-07",
    outcome: "ok",
    detail: "200 · 291ms · 402 tokens",
  },
  {
    at: "14:02:17",
    target: "openai:acct-05",
    outcome: "ok",
    detail: "200 · 812ms · 2,310 tokens",
  },
  {
    at: "14:02:18",
    target: "anthropic:acct-01",
    outcome: "ok",
    detail: "200 · 668ms · 1,145 tokens",
  },
  {
    at: "14:02:19",
    target: "command-code:acct-06",
    outcome: "reroute",
    detail: 'fallback via combo "prod-primary"',
  },
  {
    at: "14:02:20",
    target: "anthropic:acct-08",
    outcome: "ok",
    detail: "200 · 574ms · 998 tokens",
  },
];

const outcomeStyles: Record<TraceLine["outcome"], string> = {
  ok: "text-success/70",
  limited: "text-warning/70",
  reroute: "text-primary/70",
};

// 4 copies so the -25% keyframe wraps seamlessly
const loop = [0, 1, 2, 3].flatMap((pass) =>
  trace.map((line, i) => ({ line, key: `${pass}-${i}` })),
);

// ponytail: backdrop is a static seeded loop, not live traffic.
// Swap `trace` for a /v1/logs tail once the login page is allowed to read it unauthenticated (it isn't).
function TraceBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none overflow-hidden [mask-image:radial-gradient(ellipse_46%_38%_at_50%_50%,transparent_35%,black_100%)]"
    >
      <div className="motion-safe:animate-log-scroll flex flex-col px-4 font-mono text-[11px] leading-6 whitespace-nowrap text-muted-foreground/45 sm:px-8 sm:text-xs">
        {loop.map(({ line, key }) => (
          <div key={key} className="flex items-baseline gap-2">
            <span className="opacity-60">{line.at}</span>
            <span className="opacity-80">POST</span>
            <span>/v1/chat/completions</span>
            <span className="opacity-50">→</span>
            <span className="opacity-80">{line.target}</span>
            <span className={outcomeStyles[line.outcome]}>{line.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * First-run credential readout.
 *
 * Structured as a labelled value rather than a sentence with the password
 * inline: the password is data the operator has to read and copy exactly, so it
 * gets its own monospace row instead of being buried mid-paragraph.
 */
function DefaultPasswordHint() {
  return (
    <div className="motion-safe:animate-trace-in mb-5 overflow-hidden rounded-lg border border-warning/25 bg-warning/[0.04]">
      <div className="flex items-center gap-2 border-b border-warning/20 bg-warning/[0.06] px-3 py-2">
        <InfoIcon className="size-3.5 shrink-0 text-warning" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-warning">
          First run
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Password
          </span>
          <code className="flex-1 rounded border border-warning/25 bg-warning/[0.07] px-2 py-1 font-mono text-sm font-medium tracking-wide text-warning">
            {DEFAULT_PASSWORD}
          </code>
          <CopyButton
            value={DEFAULT_PASSWORD}
            label="default password"
            className="hover:bg-warning/10 hover:text-warning"
          />
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          Sign in with this, then set your own password. This notice disappears
          once you do.
        </p>
      </div>
    </div>
  );
}

/**
 * Lockout notice with a live countdown.
 *
 * Uses destructive rather than warning tones: unlike the first-run hint, this
 * reports a request the server is actively refusing.
 */
function LockoutPanel({ seconds }: { seconds: number }) {
  return (
    <div className="motion-safe:animate-trace-in mb-5 overflow-hidden rounded-lg border border-destructive/30 bg-destructive/[0.04]">
      <div className="flex items-center gap-2 border-b border-destructive/25 bg-destructive/[0.06] px-3 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-destructive shadow-none motion-safe:animate-pulse dark:shadow-[0_0_6px] dark:shadow-destructive/70" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-destructive">
          Too many attempts
        </span>
        <span
          className="ml-auto font-mono text-sm font-medium tabular-nums text-destructive"
          role="timer"
          aria-live="off"
        >
          {formatCountdown(seconds)}
        </span>
      </div>
      <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        Sign-in is paused for this device. The lock lifts on its own when the
        countdown ends — no action needed.
      </p>
    </div>
  );
}

/**
 * Remaining-attempt readout, shown only once the user has actually failed.
 *
 * Displaying the budget up front would read as a challenge; showing it after a
 * miss is a warning the operator can act on.
 */
function AttemptBudget({
  remaining,
  max,
  locked,
}: {
  remaining: number | null;
  max: number | null;
  locked: boolean;
}) {
  if (locked || remaining === null || max === null) return null;

  const critical = remaining <= 1;

  return (
    <p
      aria-live="polite"
      className={`flex items-center gap-2 font-mono text-[11px] ${
        critical ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: max }, (_, index) => `slot-${index}`).map(
          (slot, index) => (
            <span
              key={slot}
              className={`h-1 w-3 rounded-full ${
                index < remaining
                  ? critical
                    ? "bg-destructive"
                    : "bg-muted-foreground/50"
                  : "bg-destructive/25"
              }`}
            />
          ),
        )}
      </span>
      {remaining === 0
        ? "No attempts left"
        : `${remaining} of ${max} attempts left`}
    </p>
  );
}

type HintResponse = {
  show: boolean;
  maxAttempts: number;
  retryAfterSeconds: number;
};

/** Shape of the extra fields the login route attaches to its error bodies. */
type LoginErrorData = {
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
};

function loginErrorData(error: unknown): LoginErrorData {
  if (!(error instanceof ApiClientError)) return {};
  const data = error.data;
  if (!data || typeof data !== "object") return {};
  return data as LoginErrorData;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDefaultHint, setShowDefaultHint] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );
  const lockout = useLoginLockout();

  // Only shown when the server confirms the seeded password is still in use
  // and config.json has not disabled the hint. A failure here means no hint,
  // which is the safe direction.
  useEffect(() => {
    let active = true;
    apiClient
      .get<HintResponse>("/api/auth/default-password-hint")
      .then((result) => {
        if (!active) return;
        setShowDefaultHint(result.show);
        setMaxAttempts(result.maxAttempts);
        // Resume the countdown when the page is reloaded mid-lockout.
        if (result.retryAfterSeconds > 0) {
          lockout.start(result.retryAfterSeconds);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [lockout.start]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lockout.locked) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await onLogin(password);
      setAttemptsRemaining(null);
    } catch (requestError) {
      const data = loginErrorData(requestError);

      if (data.retryAfterSeconds !== undefined) {
        lockout.start(data.retryAfterSeconds);
        setAttemptsRemaining(0);
        // The panel states the lockout; a duplicate inline error is noise.
        setError(null);
      } else {
        setError(getApiErrorMessage(requestError));
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || lockout.locked;

  return (
    <main className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background px-4 py-10">
      <TraceBackdrop />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/55 dark:bg-background/65"
      />

      <div className="motion-safe:animate-trace-in relative w-full max-w-sm rounded-xl border bg-card/85 p-6 shadow-2xl shadow-black/10 backdrop-blur-md sm:p-7 dark:shadow-black/40">
        <div className="flex items-center gap-3 border-b pb-5">
          <Logo className="size-8 shrink-0" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold tracking-tight">
              KCG Router
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              /auth/session
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-success">
            <span className="size-1.5 rounded-full bg-success shadow-none dark:shadow-[0_0_6px] dark:shadow-success/70" />
            live
          </span>
        </div>

        <div className="py-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Sign in to the control room
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Traffic keeps routing while you're away. Enter your application
            password to open the dashboard.
          </p>
        </div>

        {showDefaultHint ? <DefaultPasswordHint /> : null}

        {lockout.locked ? (
          <LockoutPanel seconds={lockout.secondsRemaining} />
        ) : null}

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
                disabled={disabled}
                required
                autoFocus
                className="h-11 bg-muted/20 font-mono text-sm font-medium tracking-wide dark:bg-input/20"
              />
              {error ? (
                <FieldError aria-live="polite">{error}</FieldError>
              ) : null}
              <AttemptBudget
                remaining={attemptsRemaining}
                max={maxAttempts}
                locked={lockout.locked}
              />
            </Field>
            <Button
              type="submit"
              className="h-11 w-full font-mono text-xs uppercase tracking-[0.12em] shadow-sm transition-transform active:scale-[0.98] dark:shadow-lg dark:shadow-primary/15"
              disabled={disabled}
            >
              {lockout.locked ? (
                <>
                  <ClockIcon data-icon="inline-start" />
                  {`Locked · ${formatCountdown(lockout.secondsRemaining)}`}
                </>
              ) : isSubmitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Authenticating
                </>
              ) : (
                <>
                  <LockKeyholeIcon data-icon="inline-start" />
                  Open dashboard
                  <ArrowRightIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 flex items-center gap-2 border-t pt-5 font-mono text-[10px] text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 shrink-0 text-success/80" />
          aes-256-gcm at rest · httpOnly session cookie
        </p>
      </div>
    </main>
  );
}
