#!/usr/bin/env bun

import { dirname } from "node:path";
import { isRunning, restartDaemon } from "../src/cli/daemon";
import { runCli } from "../src/cli/index";
import { playUpgradeAnimation } from "../src/cli/upgrade-cat";
import {
  getAppVersion,
  getRecordedVersion,
  recordVersion,
} from "../src/config";
import { ensureSecrets } from "../src/env";
import { setProcessName } from "../src/lib/process-name";

// Show up as "kcgrouter" (not "bun") in process managers.
setProcessName("kcgrouter");

// Package root = parent of bin/.
const packageRoot = dirname(import.meta.dir);

// Make sure secrets exist before any daemon is spawned (so the spawned
// server inherits them) or any encryption happens.
ensureSecrets();

// After an upgrade the running version differs from the one recorded in
// config.json — play the upgrade cat animation ("upgrading kcgrouter..."),
// restart the server so the new version takes effect, then record the new
// version so this only happens once per release.
const appVersion = getAppVersion();
const previousVersion = getRecordedVersion();
if (previousVersion !== appVersion) {
  const serverWasRunning = isRunning();
  await playUpgradeAnimation(appVersion, {
    previousVersion,
    restartServer: serverWasRunning
      ? async () => {
          // Best-effort: never block the upgrade flow on a restart failure.
          try {
            await restartDaemon(packageRoot);
          } catch {
            // ignore — the new version is already installed on disk
          }
        }
      : undefined,
  });
  recordVersion(appVersion);
}

await runCli(packageRoot);
