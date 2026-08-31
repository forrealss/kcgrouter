/**
 * Password strength scoring for the dashboard credential.
 *
 * Deliberately small and explainable: the UI shows the user exactly which
 * checks passed, so the score has to map to visible reasons rather than an
 * opaque entropy number. `blocking` checks mirror what the server enforces in
 * settings.service.ts — the rest are advisory.
 */

/**
 * Shared password rules for the dashboard credential.
 *
 * These constants live here — not in settings.service.ts or the seeder —
 * because both the browser bundle and the server need them, and this module
 * imports nothing. Reaching into the seeder instead would drag `bun:sqlite`
 * into the client bundle.
 */

/** Minimum length accepted by the server. */
export const MIN_PASSWORD_LENGTH = 8;

/** Length at which a password stops earning "short but legal" warnings. */
const COMFORTABLE_LENGTH = 14;

/** The password seeded on a fresh install; rejected as a new password. */
export const DEFAULT_PASSWORD = "admin";

export type PasswordCheckId =
  | "length"
  | "not-default"
  | "mixed-case"
  | "number-or-symbol"
  | "comfortable-length";

export interface PasswordCheck {
  id: PasswordCheckId;
  /** Short imperative label shown next to the indicator. */
  label: string;
  passed: boolean;
  /** Blocking checks must pass before the password can be submitted. */
  blocking: boolean;
}

export type PasswordStrength = "empty" | "weak" | "fair" | "strong";

export interface PasswordAssessment {
  checks: PasswordCheck[];
  strength: PasswordStrength;
  /** 0-3, for rendering the segmented meter. */
  score: number;
  /** True when every blocking check passes. */
  acceptable: boolean;
}

export function assessPassword(password: string): PasswordAssessment {
  const checks: PasswordCheck[] = [
    {
      id: "length",
      label: `${MIN_PASSWORD_LENGTH}+ characters`,
      passed: password.length >= MIN_PASSWORD_LENGTH,
      blocking: true,
    },
    {
      id: "not-default",
      label: "Not the default password",
      passed: password !== DEFAULT_PASSWORD,
      blocking: true,
    },
    {
      id: "mixed-case",
      label: "Upper and lower case",
      passed: /[a-z]/.test(password) && /[A-Z]/.test(password),
      blocking: false,
    },
    {
      id: "number-or-symbol",
      label: "A number or symbol",
      passed: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password),
      blocking: false,
    },
    {
      id: "comfortable-length",
      label: `${COMFORTABLE_LENGTH}+ characters is better`,
      passed: password.length >= COMFORTABLE_LENGTH,
      blocking: false,
    },
  ];

  const acceptable = checks.every((check) => !check.blocking || check.passed);

  // An empty field is a neutral starting state, not a failure — showing "weak"
  // before the user has typed anything reads as an error they did not cause.
  if (password.length === 0) {
    return { checks, strength: "empty", score: 0, acceptable: false };
  }

  // Below the server's floor there is nothing to grade: it cannot be submitted.
  if (!acceptable) {
    return { checks, strength: "weak", score: 1, acceptable };
  }

  const advisoryPassed = checks.filter(
    (check) => !check.blocking && check.passed,
  ).length;

  // Length is worth more than character-class variety: a long passphrase like
  // "correcthorsebatterystaple" is stronger than a short "PlainPass9", so
  // reaching the comfortable length alone is enough to grade strong. Scoring
  // purely by count of advisory checks would rank them the other way around.
  const isLong = password.length >= COMFORTABLE_LENGTH;
  if (isLong || advisoryPassed >= 2) {
    return { checks, strength: "strong", score: 3, acceptable };
  }
  if (advisoryPassed === 1) {
    return { checks, strength: "fair", score: 2, acceptable };
  }
  return { checks, strength: "weak", score: 1, acceptable };
}
