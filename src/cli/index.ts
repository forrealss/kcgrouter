import { getConfigPath, getPort, isValidPort, saveConfig } from "../config";
import {
  isRunning,
  restartDaemon,
  showStatus,
  startDaemon,
  stopDaemon,
} from "./daemon";
import { showMenu } from "./menu";
import { initTray, isTraySupported } from "./tray";

export async function runCli(packageRoot: string) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  if (args.includes("--port")) {
    await setPortFlag(args, packageRoot);
    return;
  }

  if (args.includes("--daemon") || args.includes("-d")) {
    startDaemon(packageRoot);
    return;
  }

  if (args.includes("--stop")) {
    stopDaemon();
    return;
  }

  if (args.includes("--status") || args.includes("-s")) {
    showStatus();
    return;
  }

  if (args.includes("--tray") || args.includes("-t")) {
    await startTray(packageRoot);
    return;
  }

  // No flags — interactive menu
  await showMenu(packageRoot);
}

async function startTray(packageRoot: string) {
  if (!isTraySupported()) {
    console.log("\n  System tray not supported on this platform/display\n");
    console.log(
      "  Supported: Windows, macOS, Linux with DISPLAY/WAYLAND_DISPLAY\n",
    );
    process.exit(1);
  }

  const port = getPort();

  // Start daemon if not running
  const { isRunning, spawnDaemon } = await import("./daemon");
  if (!isRunning()) {
    console.log("[tray] Starting server daemon...");
    spawnDaemon(packageRoot);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("[tray] Initializing system tray...");

  const tray = await initTray({
    port,
    onQuit: () => {
      console.log("[tray] Quitting...");
      stopDaemon();
      tray?.destroy();
      process.exit(0);
    },
  });

  if (!tray) {
    console.log("[tray] Failed to create tray icon");
    process.exit(1);
  }

  console.log("[tray] KCG Router is running in system tray");
  console.log(`[tray] Dashboard: http://localhost:${port}`);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n[tray] Shutting down...");
    stopDaemon();
    tray.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    stopDaemon();
    tray.destroy();
    process.exit(0);
  });
}

/** Persist a custom port to config.json via `kcgrouter --port <port>`. */
async function setPortFlag(args: string[], packageRoot: string) {
  const idx = args.indexOf("--port");
  const raw = idx >= 0 ? args[idx + 1] : undefined;
  const port = Number(raw);

  if (!raw || !isValidPort(port)) {
    console.log(
      `\n  Invalid port: "${raw}". Use a number between 1 and 65535.\n`,
    );
    process.exit(1);
  }

  saveConfig({ port });
  console.log(`\n  ✅ Port set to ${port}`);
  console.log(`  Saved to ${getConfigPath()}`);

  // Apply immediately: restart the daemon so it binds the new port.
  if (isRunning()) {
    console.log("  Restarting server to apply the new port...");
    const pid = await restartDaemon(packageRoot);
    console.log(
      pid
        ? `  Server restarted (PID: ${pid}) on port ${port}\n`
        : "  Failed to restart server\n",
    );
  } else {
    console.log("  Start the server (kcgrouter) to apply the new port.\n");
  }
  process.exit(0);
}

function showHelp() {
  console.log(`
  KCG Router — AI Proxy Gateway

  Usage: kcgrouter [options]

  Options:
    (no args)      Interactive menu
    --daemon, -d   Run in background
    --tray, -t     Run in system tray
    --stop         Stop background process
    --status, -s   Check if running
    --port <port>  Set a custom port (saved to ~/.kcgrouter/config.json)
    --help, -h     Show this help
  `);
}
