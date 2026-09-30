import { createInterface } from "node:readline";
import { createInterface as createLineInterface } from "node:readline/promises";
import {
  assessPassword,
  MIN_PASSWORD_LENGTH,
  type PasswordStrength,
} from "../lib/password-strength";
import { catLines, renderCentered } from "./cat-prompt";
import {
  BORDER_1,
  boxLines,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CYAN,
  DIM,
  GRAY,
  GREEN,
  gradientText,
  MOVE_TO,
  ORANGE,
  RED,
  RESET,
  TITLE_GRADIENT,
} from "./tui";

const FRAME_MS = 500; // cat blink cadence, same as the port prompt
const INPUT_INNER = 34;
/** Visible mask cap so a long password never overflows the input box. */
const MASK_MAX = 20;

type Step = "new" | "confirm";

interface KeyEvent {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  empty: "",
  weak: `${RED}weak${RESET}`,
  fair: `${ORANGE}fair${RESET}`,
  strong: `${GREEN}strong${RESET}`,
};

function strengthMeter(password: string): string {
  const { score, strength } = assessPassword(password);
  const color = score >= 3 ? GREEN : score === 2 ? ORANGE : RED;
  const bar = [0, 1, 2]
    .map((i) => (i < score ? `${color}━━━━${RESET}` : `${GRAY}━━━━${RESET}`))
    .join(" ");
  return `${bar}  ${STRENGTH_LABEL[strength] || `${GRAY}—${RESET}`}`;
}

function mask(input: string): string {
  if (input.length <= MASK_MAX) return "•".repeat(input.length);
  return `${GRAY}…${RESET}${"•".repeat(MASK_MAX - 1)}`;
}

function buildScreen(
  frame: number,
  step: Step,
  input: string,
  error: string | null,
): string[] {
  const title = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  `],
    BORDER_1,
  );
  const label = step === "new" ? "New password:" : "Confirm:     ";
  const inputRow = ` ${GREEN}${label}${RESET} ${mask(input)}${CYAN}▌${RESET}`;
  const inputBox = boxLines([inputRow], BORDER_1, INPUT_INNER);

  const lines = [
    "",
    ...title,
    "",
    ...catLines(frame, Math.floor(frame / 2)),
    "",
    `${WHITE_BOLD}Reset dashboard password${RESET}`,
    `${DIM}${
      step === "new"
        ? `At least ${MIN_PASSWORD_LENGTH} characters, not the default password`
        : "Type the password again to confirm"
    }${RESET}`,
    "",
    ...inputBox,
    "",
    step === "new" ? strengthMeter(input) : `${GRAY}Step 2 of 2${RESET}`,
    "",
  ];
  if (error) lines.push(`${RED}⚠ ${error}${RESET}`, "");
  lines.push(`${GRAY}Enter = continue · Esc = cancel${RESET}`, "");
  return lines;
}

const WHITE_BOLD = "\x1b[1m\x1b[38;2;240;245;255m";

/**
 * Full-screen, centered password prompt (title, cat, masked input) matching
 * the port prompt. Asks for the new password, then a confirmation. Resolves
 * with the password, or null when cancelled. TTY only.
 */
function promptPasswordCentered(): Promise<string | null> {
  return new Promise((resolve) => {
    let step: Step = "new";
    let first = "";
    let input = "";
    let error: string | null = null;
    let frame = 0;
    let settled = false;

    const rl = createInterface({
      input: process.stdin,
      terminal: true,
      escapeCodeTimeout: 50,
    });
    const rawSupported = typeof process.stdin.setRawMode === "function";
    if (rawSupported) process.stdin.setRawMode(true);
    process.stdout.write(`${CURSOR_HIDE}${CLEAR_SCREEN}${MOVE_TO(1)}`);

    const redraw = () => {
      if (!settled) renderCentered(buildScreen(frame, step, input, error));
    };

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearInterval(blink);
      process.stdin.off("keypress", onKeypress);
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      rl.close();
      if (rawSupported) process.stdin.setRawMode(false);
      process.stdout.write(`${CURSOR_SHOW}${CLEAR_SCREEN}${MOVE_TO(1)}`);
      resolve(value);
    };

    const onSignal = () => finish(null);

    const submit = () => {
      if (step === "new") {
        const assessment = assessPassword(input);
        if (!assessment.acceptable) {
          error =
            input.length === 0
              ? "Password cannot be empty."
              : `Password rejected: needs ${assessment.checks
                  .filter((c) => c.blocking && !c.passed)
                  .map((c) => c.label)
                  .join(", ")}.`;
          return;
        }
        first = input;
        input = "";
        error = null;
        step = "confirm";
        return;
      }
      if (input !== first) {
        // Start over: a mismatch means the user may not know which one they
        // mistyped, so re-asking only the confirmation would be a guess.
        error = "Passwords do not match. Start over.";
        first = "";
        input = "";
        step = "new";
        return;
      }
      finish(first);
    };

    const onKeypress = (str: string | undefined, key: KeyEvent) => {
      if (
        (key?.ctrl && (key.name === "c" || key.name === "d")) ||
        key?.name === "escape"
      ) {
        finish(null);
        return;
      }
      if (key?.name === "return" || key?.name === "enter") {
        submit();
      } else if (key?.name === "backspace") {
        input = input.slice(0, -1);
        error = null;
      } else if (
        str &&
        !key?.ctrl &&
        !key?.meta &&
        str.length === 1 &&
        str >= " " &&
        str !== "\x7f"
      ) {
        input += str;
        error = null;
      } else {
        return; // arrows, tab, etc. — nothing to redraw
      }
      redraw();
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    process.stdin.on("keypress", onKeypress);

    redraw();
    const blink = setInterval(() => {
      frame++;
      redraw();
    }, FRAME_MS);
  });
}

/** Piped (non-TTY) fallback: two lines from stdin, new password + confirm. */
async function promptPasswordPiped(): Promise<string | null> {
  const rl = createLineInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  try {
    const first = await lines.next();
    const second = await lines.next();
    if (first.done || second.done) return null;
    if (first.value !== second.value) {
      throw new Error("Passwords do not match. Nothing was changed.");
    }
    const assessment = assessPassword(first.value);
    if (!assessment.acceptable) {
      throw new Error(
        `Password rejected: needs ${assessment.checks
          .filter((c) => c.blocking && !c.passed)
          .map((c) => c.label)
          .join(", ")}.`,
      );
    }
    return first.value;
  } finally {
    rl.close();
  }
}

export interface ResetResult {
  ok: boolean;
  message: string;
}

/**
 * Interactive dashboard password reset. Never prints the password. The caller
 * decides how to show the result (console for the flag, message log for the
 * menu).
 */
export async function resetPasswordInteractive(): Promise<ResetResult> {
  const tty = process.stdin.isTTY && process.stdout.isTTY;

  let password: string | null;
  try {
    password = tty
      ? await promptPasswordCentered()
      : await promptPasswordPiped();
  } catch (err) {
    return {
      ok: false,
      message: `❌ ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (password === null) {
    return { ok: false, message: "Password reset cancelled." };
  }

  // Loaded lazily so plain CLI commands (--status, --help) never open the DB.
  const { runMigrations } = await import("../db/migrations");
  const { resetPassword } = await import("../server/services/settings.service");
  const { setDefaultPasswordHintEnabled } = await import("../config");

  try {
    runMigrations();
    await resetPassword(password);
    setDefaultPasswordHintEnabled(false);
  } catch (err) {
    return {
      ok: false,
      message: `❌ ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    message: "✅ Dashboard password reset. Log in with the new password.",
  };
}
