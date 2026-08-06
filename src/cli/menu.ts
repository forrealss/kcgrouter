import { stdin, stdout } from "node:process";
import { spawn } from "bun";
import { spawnDaemon, stopDaemon, isRunning } from "./daemon";

interface MenuItem {
  label: string;
  value: string;
}

function getItems(): MenuItem[] {
  const running = isRunning();
  return [
    { label: "Web UI (Open in Browser)", value: "web" },
    { label: "Run in Background", value: "background" },
    { label: running ? "Stop Server" : "Start Server", value: running ? "stop" : "start" },
    { label: "Check Status", value: "status" },
    { label: "Exit", value: "exit" },
  ];
}

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const INVERT = "\x1b[7m";
const CLEAR = "\x1b[2J\x1b[H";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

export async function showMenu(packageRoot: string) {
  // Auto-start daemon if not running
  if (!isRunning()) {
    stdout.write(`${DIM}  Starting server...${RESET}\n`);
    const pid = spawnDaemon(packageRoot);
    if (pid) await waitForServer(5000);
  }

  while (true) {
    const choice = await getMenuChoice();

    switch (choice) {
      case "web":
        openBrowser();
        break;
      case "background":
        await showBackgroundMsg();
        break;
      case "start":
        spawnDaemon(packageRoot);
        await waitForServer(5000);
        break;
      case "stop":
        stopDaemon();
        break;
      case "status":
        showStatusMsg();
        break;
      case "exit":
        return;
    }
  }
}

function getMenuChoice(): Promise<string> {
  let selected = 0;
  const items = getItems();

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");

  render(items, selected);

  return new Promise((resolve) => {
    const onData = (key: string) => {
      switch (key) {
        case "\x1b[A":
          selected = (selected - 1 + items.length) % items.length;
          render(items, selected);
          break;
        case "\x1b[B":
          selected = (selected + 1) % items.length;
          render(items, selected);
          break;
        case "\r":
          cleanup();
          resolve(items[selected].value);
          break;
        case "\x1b":
        case "q":
        case "\x03":
          cleanup();
          resolve("exit");
          break;
      }
    };

    stdin.on("data", onData);

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
  });
}

function render(items: MenuItem[], selected: number) {
  const port = process.env.PORT || "3000";
  const running = isRunning();
  const dot = running ? `${GREEN}●${RESET}` : `${RED}●${RESET}`;
  const info = running ? `Server: http://localhost:${port}` : "Server: not running";

  stdout.write(CLEAR);
  stdout.write(`\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n`);
  stdout.write(`  ${BOLD}🚀  KCG Router${RESET}  ${dot} ${DIM}${info}${RESET}\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n\n`);

  for (let i = 0; i < items.length; i++) {
    const isSelected = i === selected;
    const marker = isSelected ? `  ${INVERT} ` : "    ";
    const label = isSelected ? `${BOLD}${items[i].label}${RESET}` : `${DIM}${items[i].label}${RESET}`;
    stdout.write(`${marker}${label}${isSelected ? ` ${RESET}` : ""}\n`);
  }

  stdout.write(`\n  ${DIM}↑↓ Navigate  ↵ Select  q/ESC Quit${RESET}\n\n`);
}

function openBrowser() {
  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}`;
  const p = process.platform;
  if (p === "darwin") spawn(["open", url]);
  else if (p === "win32") spawn(["cmd", "/c", "start", url]);
  else spawn(["xdg-open", url]);
}

function showStatusMsg() {
  const running = isRunning();
  const port = process.env.PORT || "3000";

  stdout.write(CLEAR);
  stdout.write(`\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n`);
  stdout.write(`  ${BOLD}🚀  KCG Router${RESET}\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n\n`);

  if (running) {
    stdout.write(`  ${GREEN}● Running${RESET}\n`);
    stdout.write(`  URL:      http://localhost:${port}\n`);
    stdout.write(`  Stop:     ${DIM}kcgrouter --stop${RESET}\n`);
  } else {
    stdout.write(`  ${RED}● Not running${RESET}\n`);
    stdout.write(`  Start:    ${DIM}kcgrouter --daemon${RESET}\n`);
  }

  stdout.write(`\n  Press any key to return...`);
}

function showBackgroundMsg(): Promise<void> {
  stdout.write(CLEAR);
  stdout.write(`\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n`);
  stdout.write(`  ${BOLD}🚀  KCG Router${RESET}\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n\n`);
  stdout.write(`  ${GREEN}✓ Server is running in background${RESET}\n\n`);
  stdout.write(`  You can safely close this terminal.\n`);
  stdout.write(`  The server will keep running.\n\n`);
  stdout.write(`  To stop later:\n`);
  stdout.write(`    ${DIM}kcgrouter --stop${RESET}\n\n`);
  stdout.write(`  Press any key to exit...`);

  return new Promise((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");
    const onData = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.exit(0);
    };
    stdin.on("data", onData);
  });
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
