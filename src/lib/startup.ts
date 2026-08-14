import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
  writeFileSync(
    vbsPath,
    `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "bun kcgrouter --daemon", 0, False\n`,
  );

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
  const bunPath = findBun();
  if (!bunPath) {
    console.log("bun not found in PATH, skipping startup setup");
    return;
  }

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
        <string>${bunPath}</string>
        <string>kcgrouter</string>
        <string>--daemon</string>
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
  const bunPath = findBun();
  const cmd = bunPath ? `${bunPath} kcgrouter --daemon` : "kcgrouter --daemon";

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
