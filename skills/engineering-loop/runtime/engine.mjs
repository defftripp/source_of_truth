#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateAdoptionMatrix,
  validateRuntimeManifest,
  verifyFileChecksums,
} from "./contracts.mjs";

const PROJECT_STATE_PATH = ".engineering/state/project.json";

/** @param {string} targetInput */
export async function runEngineeringRun(targetInput) {
  const target = path.resolve(targetInput);
  const runtimeRoot = path.join(target, ".engineering", "runtime");
  const manifest = await readJson(path.join(runtimeRoot, "manifest.json"));
  const manifestResult = validateRuntimeManifest(manifest);
  if (!manifestResult.valid) {
    throw new Error(`Invalid Project Runtime manifest: ${manifestResult.errors.join("; ")}`);
  }
  const checksumResult = await verifyFileChecksums(target, manifest.files);
  if (!checksumResult.valid) {
    throw new Error(`Project Runtime checksum drift: ${checksumResult.errors.join("; ")}`);
  }

  const matrix = await readJson(path.join(runtimeRoot, "upstream-adoption.json"));
  const matrixResult = validateAdoptionMatrix(matrix);
  if (!matrixResult.valid) {
    throw new Error(`Invalid Upstream Adoption Matrix: ${matrixResult.errors.join("; ")}`);
  }
  const upstreamChecksums = await verifyFileChecksums(
    target,
    matrix.entries
      .filter((/** @type {any} */ entry) => entry.adoption !== "EXCLUDE")
      .map((/** @type {any} */ entry) => ({ path: entry.artifact, sha256: entry.checksum })),
  );
  if (!upstreamChecksums.valid) {
    throw new Error(`Adopted upstream checksum drift: ${upstreamChecksums.errors.join("; ")}`);
  }

  const projectState = await readJson(path.join(target, ...PROJECT_STATE_PATH.split("/")));
  const registry = await readJson(
    path.join(target, ".engineering", "verification", "registry.json"),
  );
  if (
    projectState.status !== "PREPARED_PROJECT" ||
    projectState.runtimeVersion !== manifest.runtimeVersion
  ) {
    throw new Error("Project state is not bound to the installed runtime version.");
  }
  if (
    !registry.checks?.some(
      (/** @type {any} */ check) => check.id === "prepared-project-smoke",
    )
  ) {
    throw new Error("Prepared Project smoke verification is not registered.");
  }

  return {
    schemaVersion: 1,
    status: "PREPARED_PROJECT",
    delegated: true,
    runtimeVersion: manifest.runtimeVersion,
    projectState: PROJECT_STATE_PATH,
    project: { status: projectState.status, statePath: PROJECT_STATE_PATH },
    smoke: { status: "PASS", verificationId: "prepared-project-smoke" },
  };
}

/**
 * @param {string} file
 * @returns {Promise<any>}
 */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((argument) => argument !== "--smoke")) {
    throw new Error(`Unknown Project Runtime argument: ${args.join(" ")}`);
  }
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(runtimeDirectory, "..", "..");
  const report = await runEngineeringRun(target);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project Runtime failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
