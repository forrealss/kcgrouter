import * as p from "@clack/prompts";
import { spawn } from "bun";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnDaemon, stopDaemon, isRunning } from "./daemon";

const B = "\x1b[1m";
const DIM = "\x1b[2m";
const R = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const LINE = `${GRAY}${"─".repeat(48)}${R}`;

function getVersion(): string {
  try {
    const pkg = readFileSync(join(import.meta.dir, "../../../package.json"), "utf-8");
    return JSON.parse(pkg).version;
  } catch {
    return "?";
  }
}

function getPidInfo(): { pid: number; uptime: string } | null {
  try {
    const home = process.env.KCGRouter_HOME || join(homedir(), ".kcgrouter");
    const pidFile = join(home, "server.pid");
    const pid = Number.parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    const stat = statSync(pidFile);
    const uptimeMs = Date.now() - stat.birthtimeMs;
    return { pid, uptime: formatUptime(uptimeMs) };
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

function renderDashboard(): string {
  const running = isRunning();
  const port = process.env.PORT || "3000";
  const version = getVersion();
  const pidInfo = getPidInfo();

  const lines: string[] = [];

  lines.push(``);
  lines.push(`  ${B}🚀  KCG Router${R}  ${DIM}v${version}${R}`);
  lines.push(`  ${LINE}`);
  lines.push(``);

  if (running && pidInfo) {
    lines.push(`    Status    ${GREEN}● Running${R}`);
    lines.push(`    URL       ${CYAN}http://localhost:${port}${R}`);
    lines.push(`    PID       ${pidInfo.pid}`);
    lines.push(`    Uptime    ${pidInfo.uptime}`);
  } else {
    lines.push(`    Status    ${RED}● Stopped${R}`);
    lines.push(`    URL       ${GRAY}http://localhost:${port}${R}`);
  }

  lines.push(``);
  lines.push(`  ${LINE}`);

  return lines.join("\n");
}

export async function showMenu(packageRoot: string) {
  // Auto-start daemon if not running
  if (!isRunning()) {
    const s = p.spinner();
    s.start("Starting server...");
    const pid = spawnDaemon(packageRoot);
    if (pid) await waitForServer(5000);
    s.stop("Server started");
  }

  while (true) {
    const dashboard = renderDashboard();
    const port = process.env.PORT || "3000";
    const running = isRunning();
    const pidInfo = getPidInfo();

    const choice = await p.select({
      message: dashboard,
      options: [
        { label: "Open Web UI", value: "web", hint: `Opens http://localhost:${port}` },
        { label: "Run in Background", value: "background", hint: "Safe to close terminal" },
        running
          ? { label: "Stop Server", value: "stop", hint: `PID ${pidInfo?.pid ?? "?"}` }
          : { label: "Start Server", value: "start", hint: "Launch in background" },
        { label: "Check Status", value: "status" },
        { label: "Exit", value: "exit" },
      ],
    });

    if (p.isCancel(choice)) break;

    switch (choice) {
      case "web":
        openBrowser(port);
        p.log.info(`Opened ${CYAN}http://localhost:${port}${R} in browser`);
        break;
      case "background":
        await showBackgroundMsg();
        break;
      case "start": {
        const s = p.spinner();
        s.start("Starting server...");
        const pid = spawnDaemon(packageRoot);
        if (pid) await waitForServer(5000);
        s.stop("Server started");
        break;
      }
      case "stop": {
        const confirmed = await p.confirm({ message: "Stop the running server?" });
        if (p.isCancel(confirmed) || !confirmed) break;
        const s = p.spinner();
        s.start("Stopping server...");
        stopDaemon();
        s.stop("Server stopped");
        break;
      }
      case "status": {
        const info = getPidInfo();
        if (running && info) {
          p.note(
            `Status:   ${GREEN}Running${R}\nPID:      ${info.pid}\nUptime:   ${info.uptime}\nURL:      http://localhost:${port}\nLog:      ~/.kcgrouter/server.log`,
            "Server Status"
          );
        } else {
          p.note(`Status: ${RED}Not running${R}`, "Server Status");
        }
        break;
      }
      case "exit":
        return;
    }
  }

  p.outro("Bye!");
}

function openBrowser(port: string) {
  const url = `http://localhost:${port}`;
  const p = process.platform;
  if (p === "darwin") spawn(["open", url]);
  else if (p === "win32") spawn(["cmd", "/c", "start", url]);
  else spawn(["xdg-open", url]);
}

async function showBackgroundMsg() {
  p.note(
    `Server is running in background.\nYou can safely close this terminal.\n\nTo stop later: ${CYAN}kcgrouter --stop${R}`,
    "Background Mode"
  );
  await p.confirm({ message: "Press Enter to exit CLI..." });
  process.exit(0);
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
