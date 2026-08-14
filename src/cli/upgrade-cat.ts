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
  RESET,
  TITLE_GRADIENT,
  visibleWidth,
} from "./tui";

const FRAME_MS = 120;
const TOTAL_TICKS = 20; // ~2.4s
const RESTART_FRAME_MS = 120;
const RESTART_TICKS = 10; // ~1.2s restart phase
const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TAILS = ["", "~", "~~", "~~~"];

interface CatFace {
  eyes: string; // eye characters
}

/** Cat faces: open, blink, happy, sleepy. */
const OPEN_FACE: CatFace = { eyes: `${EYE}o${RESET}${ORANGE}.${EYE}o${RESET}` };
const CAT_FACES: CatFace[] = [
  OPEN_FACE,
  { eyes: `${PINK}-${RESET}${ORANGE}.${PINK}-${RESET}` },
  { eyes: `${EYE}^${RESET}${ORANGE}.${EYE}^${RESET}` },
  { eyes: `${PINK}u${RESET}${ORANGE}.${PINK}u${RESET}` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ginger cat art (3 lines, equal visible width, colors baked in). */
function catLines(faceIdx: number, tailIdx: number): string[] {
  // Modulo index is always in-bounds; fall back to the open face for types.
  const face = CAT_FACES[faceIdx % CAT_FACES.length] ?? OPEN_FACE;
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

/**
 * One upgrade frame: boxed title with the version change, blinking cat,
 * spinner + progress bar.
 */
function buildUpgradeFrame(
  tick: number,
  version: string,
  previousVersion?: string,
): string[] {
  const faceIdx = Math.floor(tick / 3);
  const tailIdx = Math.floor(tick / 2);
  const spinner = SPINNERS[Math.floor(tick / 2) % SPINNERS.length];
  const pct = Math.min(100, Math.round((tick / TOTAL_TICKS) * 100));
  const border = tick % 4 < 2 ? BORDER_1 : BORDER_2; // gentle pulse
  const versionText = previousVersion
    ? `  ${DIM}v${previousVersion}${RESET} ${GRAY}→${RESET} ${CYAN}v${version}${RESET}`
    : `  ${DIM}v${version}${RESET}`;
  const boxed = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}${versionText}  `],
    border,
  );
  return [
    "",
    ...boxed,
    "",
    ...catLines(faceIdx, tailIdx),
    "",
    `${DIM}${spinner} upgrading kcgrouter...${RESET}`,
    `  ${progressBar(pct, 22)}  ${GRAY}${String(pct).padStart(3)}%${RESET}`,
    "",
  ];
}

/** One restart frame: cat + "Restarting server..." spinner. */
function buildRestartFrame(tick: number): string[] {
  const faceIdx = Math.floor(tick / 3);
  const tailIdx = Math.floor(tick / 2);
  const spinner = SPINNERS[Math.floor(tick / 2) % SPINNERS.length];
  const boxed = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  `],
    BORDER_1,
  );
  return [
    "",
    ...boxed,
    "",
    ...catLines(faceIdx, tailIdx),
    "",
    `${DIM}${spinner} Restarting server...${RESET}`,
    "",
  ];
}

/** Final frame confirming the server was restarted. */
function buildDoneFrame(): string[] {
  const boxed = boxLines(
    [`  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  `],
    BORDER_2,
  );
  return [
    "",
    ...boxed,
    "",
    ...catLines(0, 0),
    "",
    `${GREEN}✅ Server restarted${RESET}`,
    "",
  ];
}

/** Render a block of lines vertically and horizontally centered on screen. */
function renderCentered(lines: string[]): void {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
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

export interface UpgradeAnimationOptions {
  /** Version the app is being upgraded from (shown as `vX → vY`). */
  previousVersion?: string;
  /**
   * Optional callback to restart the running server daemon mid-animation so
   * the upgraded code takes effect immediately. Shown as a short
   * "Restarting server..." phase, ending with "✅ Server restarted".
   */
  restartServer?: () => Promise<unknown>;
}

/**
 * Play the upgrade animation: a blinking ginger cat with the text
 * "upgrading kcgrouter...", optionally followed by a server restart phase.
 * Full-screen on TTYs, plain lines otherwise (daemons, scripts). Always
 * resolves; never throws on its own.
 */
export async function playUpgradeAnimation(
  version: string,
  options: UpgradeAnimationOptions = {},
): Promise<void> {
  const restart = options.restartServer;
  const previousVersion = options.previousVersion;

  if (!process.stdout.isTTY) {
    console.log(
      previousVersion
        ? `  🐱 upgrading kcgrouter... (v${previousVersion} → v${version})`
        : "  🐱 upgrading kcgrouter...",
    );
    if (restart) {
      await restart();
      console.log("  ✅ Server restarted");
    }
    return;
  }

  process.stdout.write(`${CURSOR_HIDE}${CLEAR_SCREEN}`);

  let cancelled = false;
  const onSignal = () => {
    cancelled = true;
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    // Phase 1: "upgrading kcgrouter..." intro
    for (let tick = 0; tick <= TOTAL_TICKS && !cancelled; tick++) {
      renderCentered(buildUpgradeFrame(tick, version, previousVersion));
      await sleep(FRAME_MS);
    }

    // Phase 2: restart the server while the cat keeps the screen alive
    if (restart && !cancelled) {
      const done = restart();
      for (let tick = 0; tick < RESTART_TICKS && !cancelled; tick++) {
        renderCentered(buildRestartFrame(tick));
        await sleep(RESTART_FRAME_MS);
      }
      await done;
      if (!cancelled) {
        renderCentered(buildDoneFrame());
        await sleep(400);
      }
    }
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.stdout.write(`${CURSOR_SHOW}${CLEAR_SCREEN}`);
  }
}
