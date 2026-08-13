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
    return result.split("\n")[0].trim();
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

// ---------------------------------------------------------------------------
// Windows — Startup folder (no admin required)
// ---------------------------------------------------------------------------

function setupWindows(): void {
  const startupDir = getStartupDir();
  mkdirSync(startupDir, { recursive: true });

  const scriptDir = join(KCGRouter_HOME, "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const vbsPath = join(scriptDir, "kcgrouter-startup.vbs");
  writeFileSync(
    vbsPath,
    `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "bun kcgrouter --daemon", 0, False\n`,
  );

  const destPath = join(startupDir, "kcgrouter-startup.vbs");
  copyFileSync(vbsPath, destPath);
  console.log("Startup script placed in Windows Startup folder");
}

function removeStartupWindows(): void {
  const destPath = join(getStartupDir(), "kcgrouter-startup.vbs");
  if (existsSync(destPath)) {
    unlinkSync(destPath);
    console.log("Startup script removed from Windows Startup folder");
  } else {
    console.log("No startup script found");
  }
  try {
    unlinkSync(join(KCGRouter_HOME, "scripts", "kcgrouter-startup.vbs"));
  } catch {}
}

// ---------------------------------------------------------------------------
// macOS — LaunchAgent
// ---------------------------------------------------------------------------

function setupMacOS(): void {
  const plistDir = join(HOME, "Library", "LaunchAgents");
  mkdirSync(plistDir, { recursive: true });

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
  mkdirSync(autostartDir, { recursive: true });

  const desktopPath = join(autostartDir, "kcgrouter.desktop");
  const bunPath = findBun();
  const cmd = bunPath ? `${bunPath} kcgrouter --daemon` : "kcgrouter --daemon";

  writeFileSync(
    desktopPath,
    `[Desktop Entry]
Type=Application
Name=KCG Router
Exec=${cmd}
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
    return;
  }
  unlinkSync(desktopPath);
  console.log("Startup entry removed (Linux XDG autostart)");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
