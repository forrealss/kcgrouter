import { execSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HOME = homedir();
const KCGRouter_HOME = process.env.KCGRouter_HOME || join(HOME, ".kcgrouter");
const isWin = process.platform === "win32";

function findBun(): string | null {
  try {
    const cmd = isWin ? "where bun" : "which bun";
    const result = execSync(cmd, { stdio: "pipe" }).toString().trim();
    return result.split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the kcgrouter executable path on Windows. `bun kcgrouter` does NOT
 * work for globally installed binaries (bun only looks in cwd/node_modules),
 * so the startup script must invoke the shim/binary directly.
 */
function findKcgrouterExe(): string | null {
  try {
    const result = execSync("where kcgrouter", { stdio: "pipe" })
      .toString()
      .trim();
    const exe = result
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith(".exe"));
    if (exe) return exe;
  } catch {
    // not on PATH — fall through to the bun bin dir
  }
  const bunPath = findBun();
  if (bunPath) {
    const candidate = join(bunPath, "..", "kcgrouter.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the kcgrouter executable path on Unix. `bun kcgrouter` does NOT
 * work for globally installed binaries (bun only looks in cwd/node_modules),
 * and the autostart environment does not guarantee kcgrouter on PATH, so
 * the desktop entry must invoke the binary by its absolute path.
 */
function findKcgrouterBin(): string | null {
  try {
    const result = execSync("which kcgrouter", { stdio: "pipe" })
      .toString()
      .trim();
    const bin = result
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (bin) return bin;
  } catch {
    // not on PATH — fall through to the bun bin dir
  }
  const bunPath = findBun();
  if (bunPath) {
    const candidate = join(dirname(bunPath), "kcgrouter");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function getStartupDir(): string {
  return join(
    process.env.APPDATA || join(HOME, "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
}

/**
 * mkdir with { recursive: true } throws EEXIST on Windows when the directory
 * already exists (Bun bug). Guard with existsSync instead.
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Windows — Startup folder (no admin required)
// ---------------------------------------------------------------------------

function setupWindows(): void {
  const startupDir = getStartupDir();
  ensureDir(startupDir);

  const scriptDir = join(KCGRouter_HOME, "scripts");
  ensureDir(scriptDir);

  const vbsPath = join(scriptDir, "kcgrouter-startup.vbs");
  const kcgrouterExe = findKcgrouterExe();
  // Quote the command — user paths often contain spaces. Tray mode also
  // starts the server daemon if it isn't running yet (see cli/index.ts).
  const runCmd = kcgrouterExe
    ? `"${kcgrouterExe}" --tray`
    : "bunx kcgrouter --tray";
  writeFileSync(
    vbsPath,
    `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "${runCmd.replace(/"/g, '""')}", 0, False\n`,
  );

  // Old versions dropped a plain .vbs directly in the Startup folder — remove
  // it so only the .lnk entry remains.
  const staleVbs = join(startupDir, "kcgrouter-startup.vbs");
  if (existsSync(staleVbs)) {
    try {
      unlinkSync(staleVbs);
    } catch {}
  }

  // Copy the app icon next to the scripts so the shortcut can use it (and it
  // survives package updates/reinstalls).
  const iconSrc = join(import.meta.dir, "..", "..", "assets", "icon.ico");
  const iconPath = join(KCGRouter_HOME, "icon.ico");
  if (existsSync(iconSrc)) {
    copyFileSync(iconSrc, iconPath);
  }

  // Create a .lnk shortcut in the Startup folder — plain .vbs files always
  // show a generic icon, shortcuts can carry a custom icon.
  const lnkPath = join(startupDir, "kcgrouter.lnk");
  const genVbsPath = join(scriptDir, "create-shortcut.vbs");
  writeFileSync(
    genVbsPath,
    `Set WshShell = CreateObject("WScript.Shell")\n` +
      `Set lnk = WshShell.CreateShortcut("${lnkPath}")\n` +
      `lnk.TargetPath = "${vbsPath}"\n` +
      `lnk.IconLocation = "${iconPath},0"\n` +
      `lnk.Description = "KCG Router"\n` +
      `lnk.WorkingDirectory = "${KCGRouter_HOME}"\n` +
      `lnk.Save\n`,
  );
  try {
    execSync(`wscript "${genVbsPath}"`, { stdio: "pipe" });
  } finally {
    try {
      unlinkSync(genVbsPath);
    } catch {}
  }
  console.log("Startup shortcut placed in Windows Startup folder");
}

function removeStartupWindows(): void {
  // New installs use kcgrouter.lnk; older ones used kcgrouter-startup.vbs.
  const startupDir = getStartupDir();
  let removed = false;
  for (const file of ["kcgrouter.lnk", "kcgrouter-startup.vbs"]) {
    const path = join(startupDir, file);
    if (existsSync(path)) {
      unlinkSync(path);
      removed = true;
    }
  }
  if (removed) {
    console.log("Startup shortcut removed from Windows Startup folder");
  } else {
    console.log("No startup shortcut found");
  }
  try {
    unlinkSync(join(KCGRouter_HOME, "scripts", "kcgrouter-startup.vbs"));
  } catch {}
  try {
    unlinkSync(join(KCGRouter_HOME, "icon.ico"));
  } catch {}
}

// ---------------------------------------------------------------------------
// macOS — LaunchAgent
// ---------------------------------------------------------------------------

function setupMacOS(): void {
  const plistDir = join(HOME, "Library", "LaunchAgents");
  ensureDir(plistDir);

  const plistPath = join(plistDir, "com.kcgrouter.plist");
  const kcgrouterPath = findKcgrouterBin();
  const bunPath = findBun();
  if (!kcgrouterPath && !bunPath) {
    console.log("kcgrouter/bun not found, skipping startup setup");
    return;
  }
  // launchd does not run the command through a shell, and `bun kcgrouter`
  // cannot resolve globally installed binaries — use the absolute path.
  const programArgs = kcgrouterPath
    ? [kcgrouterPath, "--daemon"]
    : [bunPath as string, "kcgrouter", "--daemon"];

  writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kcgrouter</string>
    <key>ProgramArguments</key>
    <array>
        ${programArgs.map((a) => `<string>${a}</string>`).join("\n        ")}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${KCGRouter_HOME}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${KCGRouter_HOME}/server.log</string>
</dict>
</plist>`,
  );
  console.log("Startup agent registered (macOS LaunchAgent)");
}

function removeStartupMacOS(): void {
  const plistPath = join(
    HOME,
    "Library",
    "LaunchAgents",
    "com.kcgrouter.plist",
  );
  if (!existsSync(plistPath)) {
    console.log("No startup agent found");
    return;
  }
  try {
    execSync("launchctl unload ~/Library/LaunchAgents/com.kcgrouter.plist", {
      stdio: "pipe",
    });
  } catch {}
  unlinkSync(plistPath);
  console.log("Startup agent removed (macOS LaunchAgent)");
}

// ---------------------------------------------------------------------------
// Linux — XDG Autostart
// ---------------------------------------------------------------------------

function setupLinux(): void {
  const autostartDir = join(HOME, ".config", "autostart");
  ensureDir(autostartDir);

  const desktopPath = join(autostartDir, "kcgrouter.desktop");
  // `bun kcgrouter` cannot resolve globally installed binaries and the
  // autostart environment has no guaranteed PATH — invoke the binary by its
  // absolute path.
  const kcgrouterPath = findKcgrouterBin();
  const cmd = kcgrouterPath
    ? `"${kcgrouterPath}" --daemon`
    : "kcgrouter --daemon";

  // Copy the app icon so the autostart entry shows the KCG Router logo.
  const iconSrc = join(import.meta.dir, "..", "..", "assets", "icon.png");
  const iconPath = join(KCGRouter_HOME, "icon.png");
  if (existsSync(iconSrc)) {
    copyFileSync(iconSrc, iconPath);
  }

  writeFileSync(
    desktopPath,
    `[Desktop Entry]
Type=Application
Name=KCG Router
Exec=${cmd}
Icon=${iconPath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`,
  );
  // XDG autostart entries must be executable, otherwise gnome-session and
  // other desktop environments silently skip them. chmod is explicit because
  // writeFileSync's mode option only applies to newly created files.
  chmodSync(desktopPath, 0o755);
  console.log("Startup entry registered (Linux XDG autostart)");
}

function removeStartupLinux(): void {
  const desktopPath = join(HOME, ".config", "autostart", "kcgrouter.desktop");
  if (!existsSync(desktopPath)) {
    console.log("No startup entry found");
  } else {
    unlinkSync(desktopPath);
    console.log("Startup entry removed (Linux XDG autostart)");
  }
  try {
    unlinkSync(join(KCGRouter_HOME, "icon.png"));
  } catch {}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isStartupEnabled(): boolean {
  try {
    if (isWin) {
      const startupDir = getStartupDir();
      return (
        existsSync(join(startupDir, "kcgrouter.lnk")) ||
        existsSync(join(startupDir, "kcgrouter-startup.vbs"))
      );
    }
    if (process.platform === "darwin") {
      return existsSync(
        join(HOME, "Library", "LaunchAgents", "com.kcgrouter.plist"),
      );
    }
    if (process.platform === "linux") {
      return existsSync(
        join(HOME, ".config", "autostart", "kcgrouter.desktop"),
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function setupStartup(): void {
  try {
    if (isWin) setupWindows();
    else if (process.platform === "darwin") setupMacOS();
    else if (process.platform === "linux") setupLinux();
    else console.log(`Unsupported platform: ${process.platform}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not register startup task: ${msg}`);
  }
}

export function removeStartup(): void {
  try {
    if (isWin) removeStartupWindows();
    else if (process.platform === "darwin") removeStartupMacOS();
    else if (process.platform === "linux") removeStartupLinux();
    else console.log(`Unsupported platform: ${process.platform}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not remove startup task: ${msg}`);
  }
}
