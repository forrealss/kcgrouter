import { createInterface } from "node:readline";
import { DEFAULT_PORT, isValidPort } from "../config";
import {
  BORDER_1,
  BORDER_2,
  boxLines,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CYAN,
  DIM,
  EYE,
  GRAY,
  GREEN,
  gradientText,
  MOVE_TO,
  ORANGE,
  ORANGE_DARK,
  PINK,
  RED,
  RESET,
  TITLE_GRADIENT,
  visibleWidth,
} from "./tui";

const FRAME_MS = 500; // prompt blink cadence
const INTRO_TICK_MS = 120;
const INTRO_TICKS = 20; // ~2.4s intro
const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TAILS = ["", "~", "~~", "~~~"];

interface CatFace {
  eyes: string; // eye characters
}

/** Cat faces: open, blink, happy, sleepy. */
const CAT_FACES: CatFace[] = [
  { eyes: `${EYE}o${RESET}${ORANGE}.${EYE}o${RESET}` },
  { eyes: `${PINK}-${RESET}${ORANGE}.${PINK}-${RESET}` },
  { eyes: `${EYE}^${RESET}${ORANGE}.${EYE}^${RESET}` },
  { eyes: `${PINK}u${RESET}${ORANGE}.${PINK}u${RESET}` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getSize(): { rows: number; cols: number } {
  return {
    // PTYs may report 0 rows/columns (e.g. under `script`), so fall back
    // to defaults with `||` rather than `??`.
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

/** Render a block of lines vertically and horizontally centered on screen. */
function renderCentered(lines: string[]): void {
  const { rows, cols } = getSize();
  const startRow = Math.max(1, Math.floor((rows - lines.length) / 2));
  const centered = lines.map((line) => {
    const w = visibleWidth(line);
    if (w >= cols) return line;
    const pad = Math.floor((cols - w) / 2);
    return `${" ".repeat(pad)}${line}`;
  });
  process.stdout.write(
    `${MOVE_TO(startRow)}${CLEAR_SCREEN}${centered.join("\n")}\n`,
  );
}

/** Ginger cat art (3 lines, equal visible width, colors baked in). */
function catLines(faceIdx: number, tailIdx: number): string[] {
  const face = CAT_FACES[faceIdx % CAT_FACES.length];
  const tail = TAILS[tailIdx % TAILS.length];
  const raw = [
    `${ORANGE}/\\${PINK}_${ORANGE}/\\${RESET}`,
    `${ORANGE}(${RESET} ${face.eyes} ${ORANGE})${RESET} ${PINK}${tail}${RESET}`,
    `${ORANGE}>${RESET} ${ORANGE_DARK}^${RESET} ${ORANGE}<${RESET}`,
  ];
  const max = Math.max(...raw.map(visibleWidth));
  return raw.map((l) => {
    const pad = Math.floor((max - visibleWidth(l)) / 2);
    return `${" ".repeat(pad)}${l}${" ".repeat(max - visibleWidth(l) - pad)}`;
  });
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return `${GREEN}${"█".repeat(filled)}${GRAY}${"░".repeat(Math.max(0, width - filled))}${RESET}`;
}

function buildIntro(tick: number): string[] {
  const faceIdx = Math.floor(tick / 3);
  const tailIdx = Math.floor(tick / 2);
  const spinner = SPINNERS[Math.floor(tick / 2) % SPINNERS.length];
  const pct = Math.min(100, Math.round((tick / INTRO_TICKS) * 100));
  const border = tick % 4 < 2 ? BORDER_1 : BORDER_2; // gentle pulse
  const boxed = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  `],
    border,
  );
  return [
    "",
    ...boxed,
    "",
    ...catLines(faceIdx, tailIdx),
    "",
    `${DIM}${spinner} Menyiapkan konfigurasi pertama${RESET}`,
    `  ${progressBar(pct, 22)}  ${GRAY}${String(pct).padStart(3)}%${RESET}`,
    "",
  ];
}

const INPUT_INNER = 26;

function buildPrompt(
  frameIdx: number,
  input: string,
  error: string | null,
): string[] {
  const boxed = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  `],
    BORDER_1,
  );
  const inputRow = ` ${GREEN}Port:${RESET}  ${input}${CYAN}▌${RESET} `;
  const inputBox = boxLines([inputRow], BORDER_1, INPUT_INNER);
  const lines = [
    "",
    ...boxed,
    "",
    ...catLines(frameIdx, Math.floor(frameIdx / 2)),
    "",
    `${DIM}Masukkan port — kosongkan untuk default ${DEFAULT_PORT}${RESET}`,
    "",
    ...inputBox,
    "",
  ];
  if (error) {
    lines.push(`${RED}⚠ ${error}${RESET}`, "");
  }
  lines.push(
    `${GRAY}Enter = simpan · Esc = batal · hanya angka 1–65535${RESET}`,
  );
  lines.push("");
  return lines;
}

interface KeyEvent {
  name?: string;
  ctrl?: boolean;
}

/**
 * Full-screen centered port prompt with a modern cat animation.
 *
 * Plays a short intro animation (colored ginger cat, gradient title, spinner
 * + progress bar), then reads a port from a centered input line (digits
 * only, backspace/Enter/Esc). Resolves with the chosen port (empty input →
 * DEFAULT_PORT) or null when cancelled.
 *
 * Only meant for TTY sessions — callers should fall back to a plain prompt
 * when stdin/stdout are not TTYs.
 */
export function promptPortCentered(): Promise<number | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    process.stdout.write(`${CURSOR_HIDE}${CLEAR_SCREEN}`);

    let input = "";
    let error: string | null = null;
    let frame = 0;
    let settled = false;
    let rl: ReturnType<typeof createInterface> | null = null;
    let blink: ReturnType<typeof setInterval> | null = null;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      if (blink) clearInterval(blink);
      if (rl) {
        process.stdin.off("keypress", onKeypress);
        rl.close();
        if (typeof process.stdin.setRawMode === "function") {
          process.stdin.setRawMode(false);
        }
      }
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      process.stdout.write(`${CURSOR_SHOW}${CLEAR_SCREEN}`);
      resolve(value);
    };

    // Graceful cancellation during intro or input (Ctrl+C/Ctrl+D/Esc/SIGINT/
    // SIGTERM all funnel here) so the terminal is always restored.
    const onSignal = () => finish(null);

    const onKeypress = (str: string, key: KeyEvent) => {
      if (
        (key?.ctrl && (key.name === "c" || key.name === "d")) ||
        key?.name === "escape"
      ) {
        finish(null);
        return;
      }
      if (key?.name === "return" || key?.name === "enter") {
        const trimmed = input.trim();
        const port = trimmed === "" ? DEFAULT_PORT : Number(trimmed);
        if (trimmed !== "" && !isValidPort(port)) {
          error = `"${trimmed}" bukan port valid — gunakan angka 1–65535.`;
          renderCentered(buildPrompt(frame, input, error));
          return;
        }
        finish(port);
        return;
      }
      if (key?.name === "backspace") {
        input = input.slice(0, -1);
        error = null;
        renderCentered(buildPrompt(frame, input, error));
        return;
      }
      if (str && /^[0-9]$/.test(str) && input.length < 5) {
        input += str;
        error = null;
        renderCentered(buildPrompt(frame, input, error));
      }
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    void (async () => {
      // Phase 1: intro animation
      for (let tick = 0; tick <= INTRO_TICKS && !settled; tick++) {
        renderCentered(buildIntro(tick));
        await sleep(INTRO_TICK_MS);
      }
      if (settled) return;

      // Phase 2: centered input
      rl = createInterface({
        input: process.stdin,
        terminal: true,
        escapeCodeTimeout: 50,
      });
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(true);
      }

      const redraw = () => renderCentered(buildPrompt(frame, input, error));
      redraw();
      blink = setInterval(() => {
        frame++;
        redraw();
      }, FRAME_MS);

      process.stdin.on("keypress", onKeypress);
    })();
  });
}
