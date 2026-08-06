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

export function startDaemon(cwd: string) {
  if (isRunning()) {
    console.log(`\n  Server already running (PID: ${getPid()})\n`);
    return;
  }

  mkdirSync(KCGRouter_HOME, { recursive: true });

  // Use nohup so the child survives when the parent exits
  const child = spawn(["nohup", "bun", "src/index.ts"], {
    cwd,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    env: { ...process.env, NODE_ENV: "production" },
  });

  writeFileSync(PID_FILE, String(child.pid));

  console.log(`\n  Server started in background (PID: ${child.pid})`);
  console.log(`  Log file: ${LOG_FILE}\n`);

  child.unref();
  process.exit(0);
}

export function stopDaemon() {
  if (!isRunning()) {
    console.log("\n  No server running\n");
    return;
  }

  const pid = getPid();

  try {
    process.kill(pid!, "SIGTERM");
    console.log(`\n  Stopped server (PID: ${pid})\n`);
  } catch (e: any) {
    console.log(`\n  Failed to stop: ${e.message}\n`);
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
