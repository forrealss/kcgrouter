import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "bun";
import { getHome, getPort } from "../config";

const KCGRouter_HOME = getHome();
const PID_FILE = join(KCGRouter_HOME, "server.pid");
const TRAY_PID_FILE = join(KCGRouter_HOME, "tray.pid");
const LOG_FILE = join(KCGRouter_HOME, "server.log");

export function isRunning(): boolean {
  const pid = getPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getPid(): number | null {
  try {
    return Number.parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

export function isTrayRunning(): boolean {
  const pid = getTrayPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getTrayPid(): number | null {
  try {
    return Number.parseInt(readFileSync(TRAY_PID_FILE, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

/** Spawn daemon without exiting — used by menu auto-start */
export function spawnDaemon(cwd: string): number | null {
  if (isRunning()) return getPid();

  mkdirSync(KCGRouter_HOME, { recursive: true });

  const isWin = process.platform === "win32";
  const cmd = isWin ? "bun" : "nohup";
  const args = isWin ? ["src/index.ts"] : ["bun", "src/index.ts"];

  const child = spawn([cmd, ...args], {
    cwd,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" },
  });

  writeFileSync(PID_FILE, String(child.pid));
  child.unref();
  return child.pid;
}

/** Spawn tray daemon without exiting — used by menu "Minimize" */
export function spawnTrayDaemon(cwd: string): number | null {
  if (isTrayRunning()) return getTrayPid();

  mkdirSync(KCGRouter_HOME, { recursive: true });

  const isWin = process.platform === "win32";
  const cmd = isWin ? "bun" : "nohup";
  const args = isWin
    ? ["bin/kcgrouter.ts", "--tray"]
    : ["bun", "bin/kcgrouter.ts", "--tray"];

  const child = spawn([cmd, ...args], {
    cwd,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" },
  });

  writeFileSync(TRAY_PID_FILE, String(child.pid));
  child.unref();
  return child.pid;
}

/** Spawn daemon and exit — used by `kcgrouter --daemon` CLI flag */
export function startDaemon(cwd: string) {
  const pid = spawnDaemon(cwd);
  if (pid && !isRunning()) {
    console.log(`\n  Server failed to start. Check ${LOG_FILE}\n`);
    return;
  }
  console.log(`\n  Server started in background (PID: ${pid})`);
  console.log(`  Log file: ${LOG_FILE}\n`);
  process.exit(0);
}

/** Resident set size (memory) of a process in bytes, or null if unavailable. */
export function getProcessMemory(pid: number): number | null {
  try {
    const res =
      process.platform === "win32"
        ? Bun.spawnSync({
            cmd: [
              "powershell",
              "-NoProfile",
              "-Command",
              `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`,
            ],
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
            windowsHide: true,
          })
        : Bun.spawnSync({
            cmd: ["ps", "-o", "rss=", "-p", String(pid)],
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
          });
    const out = res.stdout.toString().trim();
    if (!out) return null;
    const value = Number.parseInt(out, 10);
    if (Number.isNaN(value)) return null;
    return process.platform === "win32" ? value : value * 1024;
  } catch {
    return null;
  }
}

/**
 * Stop the running daemon and start a fresh one. Waits briefly first so the
 * old process can release its socket (avoids EADDRINUSE on same-port restarts).
 */
export async function restartDaemon(
  cwd: string,
  waitMs = 400,
): Promise<number | null> {
  stopDaemon();
  await new Promise((r) => setTimeout(r, waitMs));
  return spawnDaemon(cwd);
}

export function stopDaemon() {
  if (!isRunning()) {
    console.log("\n  No server running\n");
    return;
  }

  const pid = getPid();
  if (!pid) return;

  try {
    process.kill(pid, "SIGTERM");
    console.log(`\n  Stopped server (PID: ${pid})\n`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`\n  Failed to stop: ${msg}\n`);
  }

  try {
    unlinkSync(PID_FILE);
  } catch {
    /* already gone */
  }
}

export function showStatus() {
  if (isRunning()) {
    console.log(`\n  Server is running (PID: ${getPid()})`);
    console.log(`  URL: http://localhost:${getPort()}`);
    console.log(`  Log file: ${LOG_FILE}\n`);
  } else {
    console.log("\n  Server is not running\n");
  }
}

export { KCGRouter_HOME, LOG_FILE };
