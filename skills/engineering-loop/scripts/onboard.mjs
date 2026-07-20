#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "../runtime/contracts.mjs";

export const RUNTIME_VERSION = "1.0.0";
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    await createShell(staging);
    await rename(staging, controlPlane);
    installed = true;
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

/** @param {string} staging */
async function createShell(staging) {
  const directories = ["adrs", "plans", "runs", "specs", "tickets", "runtime", "state", "verification"];
  await Promise.all(directories.map((directory) => mkdir(path.join(staging, directory), { recursive: true })));
  await Promise.all(
    ["adrs", "plans", "runs", "specs", "tickets"].map((directory) =>
      writeFile(path.join(staging, directory, ".gitkeep"), "", "utf8"),
    ),
  );

  const runtimeDirectory = path.join(staging, "runtime");
  await copyFile(path.join(SOURCE_ROOT, "runtime", "engine.mjs"), path.join(runtimeDirectory, "engine.mjs"));
  await copyFile(path.join(SOURCE_ROOT, "runtime", "contracts.mjs"), path.join(runtimeDirectory, "contracts.mjs"));
  await copyFile(path.join(SOURCE_ROOT, "runtime", "methodology.md"), path.join(runtimeDirectory, "methodology.md"));

  await writeTextFiles(staging);
  const methodology = await readFile(path.join(runtimeDirectory, "methodology.md"));
  const adoptionMatrix = {
    schemaVersion: 1,
    entries: [
      {
        name: "matt-pocock-skills-methodology",
        source: "https://github.com/mattpocock/skills",
        revision: "9603c1cc8118d08bc1b3bf34cf714f62178dea3b",
        checksum: sha256(methodology),
        license: "MIT",
        adoption: "ADAPT",
        artifact: ".engineering/runtime/methodology.md",
        localDelta: "Reduced to the bounded preparation and verification contract for issue #18.",
        compatibilityEvidence: "Onboarding contract and Prepared Project smoke suites.",
        upgradeProcedure: "Review the pinned upstream diff, update the local adaptation and checksum, then run npm run verify.",
      },
    ],
  };
  await writeJson(path.join(runtimeDirectory, "upstream-adoption.json"), adoptionMatrix);

  const ownedFiles = [
    "runtime/contracts.mjs",
    "runtime/engine.mjs",
    "runtime/methodology.md",
    "runtime/upstream-adoption.json",
  ];
  const files = [];
  for (const relativePath of ownedFiles) {
    files.push({
      path: `.engineering/${relativePath}`,
      sha256: sha256(await readFile(path.join(staging, ...relativePath.split("/")))),
    });
  }
  await writeJson(path.join(runtimeDirectory, "manifest.json"), {
    schemaVersion: 1,
    runtimeVersion: RUNTIME_VERSION,
    files,
  });
}

/** @param {string} staging */
async function writeTextFiles(staging) {
  await writeFile(
    path.join(staging, "README.md"),
    "# Engineering control plane\n\nProject-owned runtime, state, verification, and durable engineering artifacts.\n",
    "utf8",
  );
  await writeFile(
    path.join(staging, "AGENTS.md"),
    "# Project Runtime\n\nUse the pinned runtime in `runtime/`; do not replace it from a global launcher.\n",
    "utf8",
  );
  await writeFile(
    path.join(staging, "CONTEXT.md"),
    "# Project context\n\nAdd durable domain terminology and repository facts here.\n",
    "utf8",
  );
  await writeJson(path.join(staging, "state", "project.json"), {
    schemaVersion: 1,
    status: "PREPARED_PROJECT",
    runtimeVersion: RUNTIME_VERSION,
  });
  await writeJson(path.join(staging, "verification", "registry.json"), {
    schemaVersion: 1,
    checks: [
      {
        id: "prepared-project-smoke",
        command: "node .engineering/runtime/engine.mjs --smoke",
      },
    ],
  });
}

/** @param {string} candidate */
async function exists(candidate) {
  return Boolean(await stat(candidate).catch(() => null));
}

/**
 * @param {string} file
 * @param {unknown} value
 */
async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
