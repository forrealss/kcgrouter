import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { spawn } from "bun";
import {
  getProcessMemory,
  isRunning,
  spawnDaemon,
  spawnTrayDaemon,
  stopDaemon,
} from "./daemon";
import { isTraySupported } from "./tray";

const B = "\x1b[1m";
const DIM = "\x1b[2m";
const R = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const LINE = `${GRAY}${"─".repeat(48)}${R}`;

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const CLEAR_SCREEN = "\x1b[2J";
const CLEAR_LINE = "\x1b[2K";
const MOVE_TO = (row: number) => `\x1b[${row};1H`;

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
    const home = process.env.KCGRouter_HOME || join(homedir(), ".kcgrouter");
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
  if (!isRunning()) {
    process.stdout.write("Starting server...");
    const pid = spawnDaemon(packageRoot);
    if (pid) await waitForServer(5000);
    process.stdout.write(" started\n");
  }

  await realtimeMenu(packageRoot);
}

type MenuMode = "menu" | "confirm-stop";

let packageRoot: string;
let mode: MenuMode = "menu";
let selected = 0;
let confirmSel = 0;
const messages: string[] = [];
let memoryValue = "";
let exitRequested = false;
let resolveExit: (() => void) | null = null;

const SCREEN_ROWS = Math.max(16, Math.min(24, (process.stdout.rows ?? 24) - 1));
const screenLines: string[] = new Array<string>(SCREEN_ROWS).fill("");
let menuOptions: MenuOption[] = [];

async function realtimeMenu(root: string) {
  packageRoot = root;
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
      memoryValue = bytes === null ? `${GRAY}?${R}` : formatBytes(bytes);
    } else {
      memoryValue = `${GRAY}—${R}`;
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

function buildFrame(): string[] {
  const lines: string[] = new Array<string>(SCREEN_ROWS).fill("");
  const port = process.env.PORT || "3000";
  const runningNow = isRunning();
  const pidInfo = getPidInfo();
  const version = getVersion();

  lines[0] = "";
  lines[1] = `  ${B}🐱  KCG Router${R}  ${DIM}v${version}${R}`;
  lines[2] = `  ${LINE}`;
  lines[3] = `    Status    ${
    runningNow ? `${GREEN}● Running${R}` : `${RED}● Stopped${R}`
  }`;
  lines[4] = `    URL       ${runningNow ? CYAN : GRAY}http://localhost:${port}${R}`;
  lines[5] = `    PID       ${
    runningNow && pidInfo ? pidInfo.pid : `${GRAY}—${R}`
  }`;
  lines[6] = `    Memory    ${runningNow && pidInfo ? memoryValue : `${GRAY}—${R}`}`;
  lines[7] = `    Uptime    ${
    runningNow && pidInfo
      ? formatUptime(Date.now() - pidInfo.startedAt)
      : `${GRAY}—${R}`
  }`;
  lines[8] = `  ${LINE}`;
  lines[10] = `  ${DIM}↑/↓ navigate · Enter select · q quit${R}`;

  if (mode === "menu") {
    menuOptions = buildOptions(runningNow);
    selected = Math.min(selected, menuOptions.length - 1);
    menuOptions.forEach((opt, i) => {
      const mark = i === selected ? `${CYAN}▶${R}` : " ";
      const hint = opt.hint ? `  ${DIM}${opt.hint}${R}` : "";
      lines[11 + i] = `  ${mark} ${opt.label}${hint}`;
    });
  } else {
    lines[10] = `  ${B}Stop the running server?${R}`;
    lines[11] = `  ${confirmSel === 0 ? `${CYAN}▶${R}` : " "} Yes`;
    lines[12] = `  ${confirmSel === 1 ? `${CYAN}▶${R}` : " "} No`;
  }

  const msgStart = 16;
  const maxMsgs = SCREEN_ROWS - msgStart;
  messages.slice(-maxMsgs).forEach((m, i) => {
    lines[msgStart + i] = `  ${m}`;
  });

  return lines;
}

function buildOptions(runningNow: boolean): MenuOption[] {
  return [
    {
      label: "Open Web UI",
      value: "web",
      hint: `Opens http://localhost:${process.env.PORT || "3000"}`,
    },
    runningNow
      ? { label: "Stop Server", value: "stop" }
      : { label: "Start Server", value: "start", hint: "Launch in background" },
    isTraySupported()
      ? {
          label: "Minimize to System Tray",
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

function handleAction(value: string) {
  const port = process.env.PORT || "3000";
  switch (value) {
    case "web":
      openBrowser(port);
      pushMessage(`Opened ${CYAN}http://localhost:${port}${R} in browser`);
      break;
    case "start": {
      pushMessage("Starting server...");
      const pid = spawnDaemon(packageRoot);
      if (pid) {
        void waitForServer(5000).then(() =>
          pushMessage(`${GREEN}Server started${R} (PID: ${pid})`),
        );
      }
      break;
    }
    case "stop":
      mode = "confirm-stop";
      confirmSel = 0;
      paint(buildFrame());
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
  pushMessage(`${RED}Server stopped${R}`);
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

export function openBrowser(port: string) {
  const url = `http://localhost:${port}`;
  const p = process.platform;
  if (p === "darwin") spawn(["open", url]);
  else if (p === "win32") spawn(["cmd", "/c", "start", url]);
  else spawn(["xdg-open", url]);
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const port = process.env.PORT || "3000";
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
