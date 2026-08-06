import { showMenu } from "./menu";
import { startDaemon, stopDaemon, showStatus } from "./daemon";

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

  // No flags — interactive menu
  await showMenu(packageRoot);
}

function showHelp() {
  console.log(`
  KCG Router — AI Proxy Gateway

  Usage: kcgrouter [options]

  Options:
    (no args)      Interactive menu
    --daemon, -d   Run in background
    --stop         Stop background process
    --status, -s   Check if running
    --help, -h     Show this help
  `);
}
