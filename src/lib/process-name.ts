import { writeFileSync } from "node:fs";

/**
 * Set the process name shown in process managers (`ps`, `htop`, system
 * monitors). Under Bun on Linux, assigning `process.title` does not update
 * the name the OS reports (`/proc/<pid>/comm`), so process managers keep
 * showing the `bun` runtime binary. Writing to `/proc/self/comm` is the
 * reliable way to change it on Linux; on other platforms we fall back to
 * `process.title`.
 */
export function setProcessName(name: string): void {
  // Best-effort: rewrite the process's own argv[0] so `ps`, `pgrep -f`, and
  // `pkill -f bun` no longer match kcgrouter's command line as a "bun" run.
  try {
    process.argv[0] = name;
  } catch {
    // Ignore: argv[0] may be read-only on some platforms/runtimes.
  }

  if (process.platform === "linux") {
    try {
      // /proc/self/comm is truncated to 15 bytes (TASK_COMM_LEN).
      writeFileSync("/proc/self/comm", name.slice(0, 15));
      return;
    } catch {
      // /proc may be unavailable (e.g. some containers) — fall through.
    }
  }

  try {
    process.title = name;
  } catch {
    // Ignore: some platforms keep showing the runtime name regardless.
  }
}
