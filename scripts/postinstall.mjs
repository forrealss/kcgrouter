// Cross-platform postinstall: prepares systray2's native tray binaries.
// On Unix it makes them executable and creates the platform symlinks that
// systray2 looks for in debug mode. On Windows (where `chmod`/`ln` are not
// available in bun's shell) it copies the binary instead of symlinking,
// because creating symlinks requires admin privileges / Developer Mode.
import { chmodSync, copyFileSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const target = {
  linux: { src: "tray_linux_release", link: "tray_linux" },
  darwin: { src: "tray_darwin_release", link: "tray_darwin" },
  win32: { src: "tray_windows_release.exe", link: "tray_windows.exe" },
}[process.platform];

if (!target) {
  process.exit(0);
}

const traybin = join(process.cwd(), "node_modules", "systray2", "traybin");
const srcPath = join(traybin, target.src);
const linkPath = join(traybin, target.link);

if (!existsSync(srcPath)) {
  console.log("[postinstall] systray2 traybin not found, skipping");
  process.exit(0);
}

// Make binaries executable on Unix.
if (process.platform !== "win32") {
  for (const name of [
    "tray_linux_release",
    "tray_darwin_release",
    target.src,
  ]) {
    try {
      chmodSync(join(traybin, name), 0o755);
    } catch {}
  }
}

if (existsSync(linkPath)) {
  process.exit(0);
}

try {
  symlinkSync(srcPath, linkPath);
} catch {
  // Windows without Developer Mode: fall back to a plain copy.
  try {
    copyFileSync(srcPath, linkPath);
  } catch {
    console.log("[postinstall] could not link tray binary");
  }
}
