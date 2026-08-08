import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createInterface as createLineInterface } from "node:readline/promises";
import { spawn } from "bun";
import {
  DEFAULT_PORT,
  getConfigPath,
  getConfiguredPort,
  getHome,
  getPort,
  isValidPort,
  saveConfig,
} from "../config";
import { promptPortCentered } from "./cat-prompt";
import {
  getProcessMemory,
  isRunning,
  restartDaemon,
  spawnDaemon,
  spawnTrayDaemon,
  stopDaemon,
} from "./daemon";
import { isTraySupported } from "./tray";
import {
  BORDER_1,
  BORDER_2,
  boxLines,
  CLEAR_LINE,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CYAN,
  DIM,
  GRAY,
  GREEN,
  gradientText,
  HIGHLIGHT_BG,
  MOVE_TO,
  RED,
  RESET,
  TITLE_GRADIENT,
  visibleWidth,
  WHITE,
} from "./tui";

function getVersion(): string {
  try {
    const pkg = readFileSync(
      join(import.meta.dir, "../../../package.json"),
      "utf-8",
    );
    return JSON.parse(pkg).version;
  } catch {
    return "?";
  }
}

function getPidInfo(): { pid: number; startedAt: number } | null {
  try {
    const home = getHome();
    const pidFile = join(home, "server.pid");
    const pid = Number.parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    const startedAt = statSync(pidFile).birthtimeMs;
    return { pid, startedAt };
  } catch {
    return null;
  }
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MenuOption {
  label: string;
  value: string;
  hint?: string;
}

export async function showMenu(packageRoot: string) {
  await ensurePortConfigured();

  if (isRunning() && !(await isServerReachable(getPort()))) {
    // The configured port changed but the running daemon still serves the old
    // one — restart it so the new port takes effect.
    console.log(
      "\n  Server not responding on the configured port — restarting...",
    );
    const pid = await restartDaemon(packageRoot);
    if (pid) await waitForServer(5000);
  }

  if (!isRunning()) {
    process.stdout.write("Starting server...");
    const pid = spawnDaemon(packageRoot);
    if (pid) await waitForServer(5000);
    process.stdout.write(" started\n");
  }

  // Loop so a "Change Port" action can exit the realtime menu, apply the new
  // port, and re-enter the menu.
  while (true) {
    await realtimeMenu(packageRoot);
    if (pendingAction === "port") {
      pendingAction = null;
      await changePortInteractive();
      continue;
    }
    break;
  }
}

/**
 * Plain readline fallback — used when stdin is not a TTY (scripts, pipes).
 * Returns null when there is no usable answer (EOF/invalid), so scripts
 * never hang and nothing is persisted for them.
 */
async function promptWithReadline(message?: string): Promise<number | null> {
  if (process.stdin.readableEnded || process.stdin.destroyed) {
    return null; // stdin already closed — cannot prompt
  }

  const rl = createLineInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    // Resolve with "" when stdin closes (EOF) so scripts never hang.
    const answer = (
      await Promise.race([
        rl.question(
          message ??
            `\n  Port not set yet. Which port should the server use? (default: ${DEFAULT_PORT}) `,
        ),
        new Promise<string>((resolve) => {
          const onClose = () => resolve("");
          rl.once("close", onClose);
          process.stdin.once("end", onClose);
        }),
      ])
    ).trim();

    if (answer === "") return null;
    const port = Number(answer);
    if (isValidPort(port)) return port;
    console.log(`  Invalid port: "${answer}" — using default ${DEFAULT_PORT}.`);
    return null;
  } finally {
    rl.close();
  }
}

/** Ask the user which port to use (cat animation on TTY, readline otherwise). */
async function promptForPort(opts?: {
  skipIntro?: boolean;
  message?: string;
}): Promise<number | null> {
  return process.stdin.isTTY
    ? promptPortCentered({ skipIntro: opts?.skipIntro })
    : promptWithReadline(opts?.message);
}

/**
 * Run the "Change Port" flow after the realtime menu has exited: prompt for a
 * new port, persist it, and restart the daemon so the new port takes effect.
 */
async function changePortInteractive(): Promise<void> {
  const current = getPort();
  const port = await promptForPort({
    skipIntro: true,
    message: `\n  New port for the server (default: ${DEFAULT_PORT}) `,
  });

  if (port === null) {
    messages.push("Port change cancelled.");
    return;
  }
  if (port === current) {
    messages.push(`Port unchanged (${port}).`);
    return;
  }

  saveConfig({ port });
  messages.push(`✅ Port set to ${port} (saved to ${getConfigPath()})`);

  if (isRunning()) {
    messages.push("Restarting server to apply the new port...");
    const pid = await restartDaemon(packageRoot);
    messages.push(
      pid
        ? `Server restarted (PID: ${pid}) on port ${port}`
        : "Failed to restart server",
    );
    if (pid) await waitForServer(5000);
  } else {
    messages.push("Start the server to apply the new port.");
  }
}

/**
 * Ensure a port is persisted in config.json. When none is configured
 * (and no PORT env override), prompt the user and save the result.
 * If the user cancels (or stdin is not usable), the default port is used
 * but nothing is persisted.
 */
export async function ensurePortConfigured(): Promise<void> {
  if (getConfiguredPort() !== undefined) return;

  const envPort = Number(process.env.PORT);
  if (isValidPort(envPort)) return;

  const port = await promptForPort();
  if (port === null) {
    console.log(
      `\n  No port chosen — using default ${DEFAULT_PORT}. Set a custom port later with: kcgrouter --port <port>\n`,
    );
    return;
  }
  saveConfig({ port });
  console.log(`\n  ✅ Port set to ${port} (saved to ${getConfigPath()})\n`);
}

type MenuMode = "menu" | "confirm-stop";

type PendingAction = "port" | null;

let packageRoot: string;
let mode: MenuMode = "menu";
let selected = 0;
let confirmSel = 0;
const messages: string[] = [];
let memoryValue = "";
let exitRequested = false;
let pendingAction: PendingAction = null;
let resolveExit: (() => void) | null = null;

const SCREEN_ROWS = Math.max(16, Math.min(24, (process.stdout.rows ?? 24) - 1));
const screenLines: string[] = new Array<string>(SCREEN_ROWS).fill("");
let menuOptions: MenuOption[] = [];

async function realtimeMenu(root: string) {
  packageRoot = root;
  exitRequested = false;
  mode = "menu";
  screenLines.fill("");
  const out = process.stdout;
  out.write(`${CLEAR_SCREEN}${MOVE_TO(1)}${CURSOR_HIDE}`);

  const rl = createInterface({
    input: process.stdin,
    tabSize: 2,
    prompt: "",
    escapeCodeTimeout: 50,
    terminal: true,
  });
  const rawSupported =
    typeof process.stdin.setRawMode === "function" && process.stdin.isTTY;
  if (rawSupported) process.stdin.setRawMode(true);

  const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
    if (key?.ctrl && key.name === "c") {
      requestExit("Cancelled.");
      return;
    }

    if (mode === "menu") {
      if (key.name === "up") {
        selected = (selected + menuOptions.length - 1) % menuOptions.length;
      } else if (key.name === "down") {
        selected = (selected + 1) % menuOptions.length;
      } else if (key.name === "return" || key.name === "enter") {
        handleAction(menuOptions[selected]?.value ?? "exit");
      } else if (key.name === "q") {
        requestExit("Bye!");
      }
    } else {
      const ch = (str ?? "").toLowerCase();
      if (key.name === "up" || key.name === "down") {
        confirmSel = 1 - confirmSel;
      } else if (key.name === "return" || key.name === "enter" || ch === "y") {
        doStop();
      } else if (ch === "n" || key.name === "escape" || key.name === "q") {
        mode = "menu";
      }
    }
    paint(buildFrame());
  };

  process.stdin.on("keypress", onKeypress);

  const refresh = () => {
    const runningNow = isRunning();
    const pidInfo = getPidInfo();
    if (runningNow && pidInfo) {
      const bytes = getProcessMemory(pidInfo.pid);
      memoryValue = bytes === null ? `${GRAY}?${RESET}` : formatBytes(bytes);
    } else {
      memoryValue = `${GRAY}—${RESET}`;
    }
    if (!exitRequested) paint(buildFrame());
  };

  refresh();
  const timer = setInterval(refresh, 1000);

  await new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  clearInterval(timer);
  process.stdin.off("keypress", onKeypress);
  rl.close();
  if (rawSupported) process.stdin.setRawMode(false);
  out.write(`${CURSOR_SHOW}\n`);
}

const MENU_INNER = 46;

/** Pad a row to the box inner width (visible-width aware). */
function renderRow(raw: string, active: boolean): string {
  const pad = Math.max(0, MENU_INNER - visibleWidth(raw));
  return active
    ? `${HIGHLIGHT_BG}${WHITE}${raw}${" ".repeat(pad)}${RESET}`
    : `${raw}${" ".repeat(pad)}${RESET}`;
}

/** Center a single line horizontally on the current terminal width. */
function centerLine(line: string): string {
  if (line === "") return "";
  const cols = process.stdout.columns || 80;
  const w = visibleWidth(line);
  if (w >= cols) return line;
  const pad = Math.floor((cols - w) / 2);
  return `${" ".repeat(pad)}${line}`;
}

function buildFrame(): string[] {
  const lines: string[] = new Array<string>(SCREEN_ROWS).fill("");
  const port = getPort();
  const runningNow = isRunning();
  const pidInfo = getPidInfo();
  const version = getVersion();

  let row = 0;
  const put = (line: string) => {
    if (row >= SCREEN_ROWS) return; // tiny terminals: drop overflow rows
    lines[row] = centerLine(line);
    row++;
  };

  // Header
  put("");
  for (const l of boxLines(
    [
      `  ${gradientText("KCG Router", ...TITLE_GRADIENT)}  ${DIM}v${version}${RESET}`,
    ],
    BORDER_1,
    MENU_INNER,
  )) {
    put(l);
  }
  put("");

  // Status panel
  const statusRows = [
    ` ${runningNow ? `${GREEN}● Running${RESET}` : `${RED}● Stopped${RESET}`}`,
    ` ${DIM}URL${RESET}     ${runningNow ? CYAN : GRAY}http://localhost:${port}${RESET}`,
    ` ${DIM}PID${RESET}     ${
      runningNow && pidInfo ? String(pidInfo.pid) : `${GRAY}—${RESET}`
    }`,
    ` ${DIM}Memory${RESET}  ${
      runningNow && pidInfo ? memoryValue : `${GRAY}—${RESET}`
    }`,
    ` ${DIM}Uptime${RESET}  ${
      runningNow && pidInfo
        ? formatUptime(Date.now() - pidInfo.startedAt)
        : `${GRAY}—${RESET}`
    }`,
  ];
  for (const l of boxLines(statusRows, BORDER_1, MENU_INNER)) {
    put(l);
  }
  put("");

  // Options panel / confirm dialog
  if (mode === "menu") {
    menuOptions = buildOptions(runningNow);
    selected = Math.min(selected, menuOptions.length - 1);
    const optRows = menuOptions.map((opt, i) => {
      const hint = opt.hint ? `  ${DIM}${opt.hint}` : "";
      return renderRow(
        `${i === selected ? "▶ " : "  "}${opt.label}${hint}`,
        i === selected,
      );
    });
    for (const l of boxLines(optRows, BORDER_2, MENU_INNER)) {
      put(l);
    }
  } else {
    const confirmRows = [
      renderRow(` ${WHITE}Stop the running server?${RESET}`, false),
      renderRow(`${confirmSel === 0 ? "▶ " : "  "}Yes`, confirmSel === 0),
      renderRow(`${confirmSel === 1 ? "▶ " : "  "}No`, confirmSel === 1),
    ];
    for (const l of boxLines(confirmRows, BORDER_2, MENU_INNER)) {
      put(l);
    }
  }
  put("");

  // Hint
  put(`${DIM}↑/↓ navigate · Enter select · q quit${RESET}`);

  // Messages
  const msgStart = row + 1;
  const maxMsgs = SCREEN_ROWS - msgStart;
  if (maxMsgs > 0) {
    messages.slice(-maxMsgs).forEach((m) => {
      put(`  ${m}`);
    });
  }
  while (row < SCREEN_ROWS) {
    put("");
  }

  return lines;
}

function buildOptions(runningNow: boolean): MenuOption[] {
  return [
    {
      label: "Open Web UI",
      value: "web",
      hint: `Opens http://localhost:${getPort()}`,
    },
    runningNow
      ? { label: "Stop Server", value: "stop" }
      : { label: "Start Server", value: "start", hint: "Launch in background" },
    {
      label: "Change Port",
      value: "port",
      hint: `Current: ${getPort()}`,
    },
    isTraySupported()
      ? {
          label: "Minimize",
          value: "tray",
          hint: "Keep running in tray",
        }
      : { label: "System Tray (unsupported)", value: "tray" },
    { label: "Exit", value: "exit" },
  ];
}

function paint(next: string[]): void {
  for (let i = 0; i < SCREEN_ROWS; i++) {
    const a = screenLines[i] ?? "";
    const b = next[i] ?? "";
    if (a !== b) {
      process.stdout.write(`${MOVE_TO(i + 1)}${CLEAR_LINE}${b}`);
      screenLines[i] = b;
    }
  }
}

function pushMessage(msg: string): void {
  messages.push(msg);
  paint(buildFrame());
}

function requestExit(msg: string): void {
  exitRequested = true;
  pushMessage(msg);
  resolveExit?.();
}

/** Leave the realtime menu, asking showMenu to run the port-change flow. */
function exitForPortChange(): void {
  pendingAction = "port";
  requestExit("Changing port...");
}

function handleAction(value: string) {
  const port = getPort();
  switch (value) {
    case "web":
      openBrowser(port);
      pushMessage(`Opened ${CYAN}http://localhost:${port}${RESET} in browser`);
      break;
    case "start": {
      pushMessage("Starting server...");
      const pid = spawnDaemon(packageRoot);
      if (pid) {
        void waitForServer(5000).then(() =>
          pushMessage(`${GREEN}Server started${RESET} (PID: ${pid})`),
        );
      }
      break;
    }
    case "stop":
      mode = "confirm-stop";
      confirmSel = 0;
      paint(buildFrame());
      break;
    case "port":
      exitForPortChange();
      break;
    case "tray": {
      if (!isTraySupported()) {
        pushMessage("System tray not supported on this platform.");
        break;
      }
      void minimizeToTray();
      break;
    }
    case "exit":
      requestExit("Bye!");
      break;
  }
}

function doStop() {
  mode = "menu";
  pushMessage("Stopping server...");
  stopDaemon();
  pushMessage(`${RED}Server stopped${RESET}`);
}

async function minimizeToTray() {
  if (!isRunning()) {
    pushMessage("Starting server...");
    spawnDaemon(packageRoot);
    await waitForServer(5000);
  }
  const pid = spawnTrayDaemon(packageRoot);
  if (!pid) {
    pushMessage("Failed to minimize to system tray.");
    return;
  }
  pushMessage(
    `Minimized to system tray (PID: ${pid}). Right-click the tray icon for the menu.`,
  );
  await new Promise((r) => setTimeout(r, 800));
  exitRequested = true;
  paint(buildFrame());
  resolveExit?.();
}

export function openBrowser(port: number) {
  const url = `http://localhost:${port}`;
  const p = process.platform;
  if (p === "darwin") spawn(["open", url]);
  else if (p === "win32") spawn(["cmd", "/c", "start", url]);
  else spawn(["xdg-open", url]);
}

/** Quick health check — true if something responds on the given port. */
async function isServerReachable(port: number): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(500),
      });
      return true; // any HTTP response means the server is up
    } catch {
      // not reachable yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const port = getPort();
  const url = `http://localhost:${port}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
