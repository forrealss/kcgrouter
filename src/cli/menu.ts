import { stdin, stdout } from "node:process";
import { spawn } from "bun";
import { startDaemon, stopDaemon, showStatus, isRunning } from "./daemon";

interface MenuItem {
  label: string;
  value: string;
}

const ITEMS: MenuItem[] = [
  { label: "Web UI (Open in Browser)", value: "web" },
  { label: "Run in Background", value: "daemon" },
  { label: "Stop Background Process", value: "stop" },
  { label: "Check Status", value: "status" },
  { label: "Exit", value: "exit" },
];

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const INVERT = "\x1b[7m";
const CLEAR = "\x1b[2J\x1b[H";

export async function showMenu(packageRoot: string) {
  let selected = 0;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");

  render(selected);

  return new Promise<void>((resolve) => {
    const onData = async (key: string) => {
      switch (key) {
        case "\x1b[A": // Up
          selected = (selected - 1 + ITEMS.length) % ITEMS.length;
          render(selected);
          break;
        case "\x1b[B": // Down
          selected = (selected + 1) % ITEMS.length;
          render(selected);
          break;
        case "\r": // Enter
          cleanup();
          await handleChoice(ITEMS[selected].value, packageRoot);
          resolve();
          break;
        case "\x1b": // Escape
        case "q":
        case "\x03": // Ctrl+C
          cleanup();
          resolve();
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

function render(selected: number) {
  stdout.write(CLEAR);
  stdout.write(`\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n`);
  stdout.write(`  ${BOLD}🚀  KCG Router${RESET}\n`);
  stdout.write(`  ${BOLD}═══════════════════════════════════════${RESET}\n\n`);

  for (let i = 0; i < ITEMS.length; i++) {
    const isSelected = i === selected;
    const marker = isSelected ? `  ${INVERT} ` : "    ";
    const label = isSelected ? `${BOLD}${ITEMS[i].label}${RESET}` : `${DIM}${ITEMS[i].label}${RESET}`;
    stdout.write(`${marker}${label}${isSelected ? ` ${RESET}` : ""}\n`);
  }

  stdout.write(`\n  ${DIM}↑↓ Navigate  ↵ Select  q/ESC Quit${RESET}\n\n`);
}

async function handleChoice(choice: string, packageRoot: string) {
  switch (choice) {
    case "web":
      await openBrowser(packageRoot);
      break;
    case "daemon":
      startDaemon(packageRoot);
      break;
    case "stop":
      stopDaemon();
      break;
    case "status":
      showStatus();
      break;
    case "exit":
      break;
  }
}

async function openBrowser(cwd: string) {
  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}`;

  // Open browser (non-blocking)
  const platform = process.platform;
  if (platform === "darwin") spawn(["open", url]);
  else if (platform === "win32") spawn(["cmd", "/c", "start", url]);
  else spawn(["xdg-open", url]);

  console.log(`\n  🌐 Opening ${url}...\n`);

  // Run server in foreground
  const child = spawn(["bun", "src/index.ts"], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, NODE_ENV: "production" },
  });

  const onSignal = () => { child.kill(); process.exit(0); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  await child.exited;
}
