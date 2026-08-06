#!/usr/bin/env bun

import { dirname } from "node:path";
import { runCli } from "../src/cli/index";

// Package root = parent of bin/.
const packageRoot = dirname(import.meta.dir);

await runCli(packageRoot);
