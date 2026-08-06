import { showMenu } from "./menu";
import { startDaemon, stopDaemon, showStatus } from "./daemon";
import { initTray, isTraySupported } from "./tray";

export async function runCli(packageRoot: string) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
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
    console.log("  Supported: Windows, macOS, Linux with DISPLAY/WAYLAND_DISPLAY\n");
    process.exit(1);
  }

  const port = Number(process.env.PORT) || 3000;

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
    --help, -h     Show this help
  `);
}
