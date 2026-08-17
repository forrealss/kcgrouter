// Cross-platform postinstall: prepares systray2's native tray binaries and
// registers kcgrouter to start automatically at user login.
// On Unix it makes them executable and creates the platform symlinks that
// systray2 looks for in debug mode. On Windows (where `chmod`/`ln` are not
// available in bun's shell) it copies the binary instead of symlinking,
// because creating symlinks requires admin privileges / Developer Mode.
import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Locate systray2's traybin directory by walking up from the package root.
 * systray2 may be nested (`node_modules/systray2`) for local installs or
 * hoisted (a sibling of the package) for `bun i -g` / `npm i -g` global
 * installs. Walking the `node_modules` dirs explicitly (instead of using
 * require.resolve) keeps this deterministic: bun's resolver can fall back to
 * its global install cache, which would make the postinstall patch a cached
 * copy instead of the actual installation.
 */
function resolveTraybin() {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "node_modules", "systray2", "traybin");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const target = {
  linux: { src: "tray_linux_release", link: "tray_linux" },
  darwin: { src: "tray_darwin_release", link: "tray_darwin" },
  win32: { src: "tray_windows_release.exe", link: "tray_windows.exe" },
}[process.platform];

const traybin = target ? resolveTraybin() : null;
const srcPath = traybin ? join(traybin, target.src) : null;
const linkPath = traybin ? join(traybin, target.link) : null;

if (target && traybin && srcPath && existsSync(srcPath) && linkPath && !existsSync(linkPath)) {
  // Make binaries executable on Unix.
  if (process.platform !== "win32") {
    for (const name of ["tray_linux_release", "tray_darwin_release", target.src]) {
      try { chmodSync(join(traybin, name), 0o755); } catch {}
    }
  }

  try {
    symlinkSync(srcPath, linkPath);
  } catch {
    // Windows without Developer Mode: fall back to a plain copy.
    try { copyFileSync(srcPath, linkPath); } catch {
      console.log("[postinstall] could not link tray binary");
    }
  }
}

// ---------------------------------------------------------------------------
// Startup registration: register kcgrouter to run at user login
// ---------------------------------------------------------------------------

const HOME = homedir();
const KCGRouter_HOME = process.env.KCGRouter_HOME || join(HOME, ".kcgrouter");
const isWin = process.platform === "win32";

function setupWindows() {
  const startupDir = join(
    process.env.APPDATA || join(HOME, "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  mkdirSync(startupDir, { recursive: true });

  const vbsPath = join(KCGRouter_HOME, "scripts", "kcgrouter-startup.vbs");
  const scriptDir = join(KCGRouter_HOME, "scripts");
  mkdirSync(scriptDir, { recursive: true });

  writeFileSync(
    vbsPath,
    `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "bun kcgrouter --daemon", 0, False\n`,
  );

  // Copy VBS to Startup folder (runs silently at login, no admin required)
  const destPath = join(startupDir, "kcgrouter-startup.vbs");
  copyFileSync(vbsPath, destPath);
  console.log("[postinstall] Startup script placed in Windows Startup folder");
}

function setupMacOS() {
  const plistDir = join(HOME, "Library", "LaunchAgents");
  mkdirSync(plistDir, { recursive: true });

  const plistPath = join(plistDir, "com.kcgrouter.plist");
  const kcgrouterPath = findKcgrouterBin();
  const bunPath = findBun();
  if (!kcgrouterPath && !bunPath) {
    console.log("[postinstall] kcgrouter/bun not found, skipping startup setup");
    return;
  }
  // launchd does not run the command through a shell, and `bun kcgrouter`
  // cannot resolve globally installed binaries — use the absolute path.
  const programArgs = kcgrouterPath
    ? [kcgrouterPath, "--daemon"]
    : [bunPath, "kcgrouter", "--daemon"];

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
  console.log("[postinstall] Startup agent registered (macOS LaunchAgent)");
}

function setupLinux() {
  const autostartDir = join(HOME, ".config", "autostart");
  mkdirSync(autostartDir, { recursive: true });

  const desktopPath = join(autostartDir, "kcgrouter.desktop");
  // `bun kcgrouter` cannot resolve globally installed binaries and the
  // autostart environment has no guaranteed PATH — invoke the binary by its
  // absolute path.
  const kcgrouterPath = findKcgrouterBin();
  const cmd = kcgrouterPath
    ? `"${kcgrouterPath}" --daemon`
    : "kcgrouter --daemon";

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
  // XDG autostart entries must be executable, otherwise gnome-session and
  // other desktop environments silently skip them. chmod is explicit because
  // writeFileSync's mode option only applies to newly created files.
  chmodSync(desktopPath, 0o755);
  console.log("[postinstall] Startup entry registered (Linux XDG autostart)");
}

function findKcgrouterBin() {
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

function findBun() {
  try {
    const cmd = isWin ? "where bun" : "which bun";
    const result = execSync(cmd, { stdio: "pipe" }).toString().trim();
    return result.split("\n")[0].trim();
  } catch {
    return null;
  }
}

// Register startup on first install (can be skipped via env var)
if (!process.env.KCGRouter_SKIP_STARTUP) {
  try {
    if (isWin) setupWindows();
    else if (process.platform === "darwin") setupMacOS();
    else if (process.platform === "linux") setupLinux();
  } catch (err) {
    // Non-fatal: startup registration is a convenience, not a requirement
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[postinstall] Could not register startup task: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Removal helpers — exported for CLI use (kcgrouter --remove-startup)
// ---------------------------------------------------------------------------

export function removeStartup() {
  try {
    if (isWin) removeStartupWindows();
    else if (process.platform === "darwin") removeStartupMacOS();
    else if (process.platform === "linux") removeStartupLinux();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not remove startup task: ${msg}`);
  }
}

function removeStartupWindows() {
  const startupDir = join(
    process.env.APPDATA || join(HOME, "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );

  const destPath = join(startupDir, "kcgrouter-startup.vbs");
  if (existsSync(destPath)) {
    unlinkSync(destPath);
    console.log("Startup script removed from Windows Startup folder");
  } else {
    console.log("No startup script found");
  }

  // Clean up source VBS
  try {
    unlinkSync(join(KCGRouter_HOME, "scripts", "kcgrouter-startup.vbs"));
  } catch {}
}

function removeStartupMacOS() {
  const plistPath = join(HOME, "Library", "LaunchAgents", "com.kcgrouter.plist");
  if (!existsSync(plistPath)) {
    console.log("No startup agent found");
    return;
  }
  try {
    execSync("launchctl unload ~/Library/LaunchAgents/com.kcgrouter.plist", {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {}
  unlinkSync(plistPath);
  console.log("Startup agent removed (macOS LaunchAgent)");
}

function removeStartupLinux() {
  const desktopPath = join(HOME, ".config", "autostart", "kcgrouter.desktop");
  if (!existsSync(desktopPath)) {
    console.log("No startup entry found");
    return;
  }
  unlinkSync(desktopPath);
  console.log("Startup entry removed (Linux XDG autostart)");
}

export function setupStartup() {
  try {
    if (isWin) setupWindows();
    else if (process.platform === "darwin") setupMacOS();
    else if (process.platform === "linux") setupLinux();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not register startup task: ${msg}`);
  }
}
