#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CANONICAL_PROJECT_SHELL_PATHS,
  materializeCanonicalShellEntry,
  RUNTIME_VERSION,
} from "./shell.mjs";

export { RUNTIME_VERSION };

/** @param {string[]} args */
export function parseOnboardingArguments(args) {
  let target = process.cwd();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--target" || !args[index + 1]) {
      throw new Error(`Unknown or incomplete onboarding argument: ${args[index] ?? ""}`);
    }
    target = args[index + 1];
    index += 1;
  }
  return { target };
}

/** @param {string} targetInput */
export async function onboardProject(targetInput) {
  const target = path.resolve(targetInput);
  const targetStats = await stat(target).catch(() => null);
  if (!targetStats?.isDirectory()) {
    throw new Error("Target Project must be an existing directory.");
  }
  const controlPlane = path.join(target, ".engineering");
  if (await exists(controlPlane)) {
    throw new Error("Target Project already has an .engineering control plane.");
  }

  const staging = path.join(target, `.engineering-onboarding-${randomUUID()}`);
  let installed = false;
  try {
    await mkdir(staging);
    for (const projectPath of CANONICAL_PROJECT_SHELL_PATHS) {
      await materializeCanonicalShellEntry(staging, projectPath);
    }
    await rename(path.join(staging, ".engineering"), controlPlane);
    installed = true;
    await rm(staging, { recursive: true, force: true });
    const installedEngine = path.join(controlPlane, "runtime", "engine.mjs");
    const runtime = await import(pathToFileURL(installedEngine).href);
    return await runtime.runEngineeringRun(target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (installed) {
      await rm(controlPlane, { recursive: true, force: true });
    }
    throw error;
  }
}

/** @param {string} candidate */
async function exists(candidate) {
  return Boolean(await stat(candidate).catch(() => null));
}

export async function main(args = process.argv.slice(2)) {
  const { target } = parseOnboardingArguments(args);
  const report = await onboardProject(target);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onboarding failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
