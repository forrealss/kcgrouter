import { spawn } from "bun";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const KCGRouter_HOME = process.env.KCGRouter_HOME || join(homedir(), ".kcgrouter");
const PID_FILE = join(KCGRouter_HOME, "server.pid");
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

  try { unlinkSync(PID_FILE); } catch { /* already gone */ }
}

export function showStatus() {
  if (isRunning()) {
    console.log(`\n  Server is running (PID: ${getPid()})`);
    console.log(`  Log file: ${LOG_FILE}\n`);
  } else {
    console.log("\n  Server is not running\n");
  }
}

export { KCGRouter_HOME, LOG_FILE };
