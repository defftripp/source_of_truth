#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTROL_PLANE_PATH = ".engineering";
const RUNTIME_MANIFEST_PATH = ".engineering/runtime/manifest.json";

/**
 * @typedef {{ id: string, status: "PASS" | "MISSING" | "INVALID" | "BLOCKED", evidence: string, path?: string }} ReadinessCheck
 */

/**
 * @param {string[]} args
 * @returns {{ explicit: boolean, target: string, operation: "readiness" | "onboard" | "normalize" | "apply" | "rollback" | "run" | "doctor" | "repair", dryRun: boolean, manifestPath?: string, approvedHash?: string, overridesPath?: string, rollbackToken?: string }}
 */
export function parseArguments(args) {
  let explicit = false;
  let target = process.cwd();
  /** @type {"readiness" | "onboard" | "normalize" | "apply" | "rollback" | "run" | "doctor" | "repair"} */
  let operation = "readiness";
  let dryRun = false;
  let manifestPath;
  let approvedHash;
  let overridesPath;
  let rollbackToken;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--explicit") {
      explicit = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--apply-manifest") {
      if (operation !== "readiness" || !args[index + 1]) {
        throw new Error("--apply-manifest requires a path and cannot be combined with another operation");
      }
      operation = "apply";
      manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--rollback") {
      if (operation !== "readiness" || !args[index + 1]) {
        throw new Error("--rollback requires a token and cannot be combined with another operation");
      }
      operation = "rollback";
      rollbackToken = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--approve-hash") {
      if (!args[index + 1]) {
        throw new Error("--approve-hash requires a SHA-256 hash");
      }
      approvedHash = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--overrides") {
      if (!args[index + 1]) {
        throw new Error("--overrides requires a path");
      }
      overridesPath = args[index + 1];
      index += 1;
      continue;
    }
    if (
      argument === "--onboard" ||
      argument === "--normalize" ||
      argument === "--run" ||
      argument === "--doctor" ||
      argument === "--repair"
    ) {
      if (operation !== "readiness") {
        throw new Error("Choose only one launcher operation.");
      }
      operation =
        argument === "--onboard"
          ? "onboard"
          : argument === "--normalize"
            ? "normalize"
            : argument === "--run"
              ? "run"
              : argument === "--doctor"
                ? "doctor"
                : "repair";
      continue;
    }
    if (argument === "--target") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--target requires a path");
      }
      target = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (operation === "apply" && (!manifestPath || !approvedHash)) {
    throw new Error("Apply requires --apply-manifest and --approve-hash");
  }
  if (dryRun && operation !== "repair") {
    throw new Error("--dry-run is valid only with --repair");
  }
  return {
    explicit,
    target,
    operation,
    dryRun,
    manifestPath,
    approvedHash,
    overridesPath,
    rollbackToken,
  };
}

/** @param {string} candidate */
async function inspectPath(candidate) {
  try {
    return { value: await stat(candidate), error: null };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return { value: null, error: null };
    }
    return { value: null, error };
  }
}

/**
 * @param {string} targetInput
 */
export async function probeReadiness(targetInput) {
  const targetPath = path.resolve(targetInput);
  /** @type {ReadinessCheck[]} */
  const checks = [];
  const targetInspection = await inspectPath(targetPath);

  if (targetInspection.error) {
    return blockedReport(targetPath, checks, "Target Project cannot be inspected.");
  }
  if (!targetInspection.value?.isDirectory()) {
    checks.push({
      id: "target-directory",
      status: targetInspection.value ? "INVALID" : "MISSING",
      evidence: targetInspection.value
        ? "Target path exists but is not a directory."
        : "Target directory does not exist.",
    });
    return blockedReport(targetPath, checks, "Target Project is not an accessible directory.");
  }

  checks.push({
    id: "target-directory",
    status: "PASS",
    evidence: "Target directory is accessible for read-only inspection.",
  });

  const controlPlane = await inspectPath(path.join(targetPath, CONTROL_PLANE_PATH));
  if (controlPlane.error) {
    checks.push({
      id: "engineering-control-plane",
      status: "BLOCKED",
      path: CONTROL_PLANE_PATH,
      evidence: "Engineering control plane cannot be inspected.",
    });
    return blockedReport(targetPath, checks, "Runtime evidence cannot be inspected safely.");
  }

  const hasControlPlane = Boolean(controlPlane.value?.isDirectory());
  checks.push({
    id: "engineering-control-plane",
    status: hasControlPlane ? "PASS" : controlPlane.value ? "INVALID" : "MISSING",
    path: CONTROL_PLANE_PATH,
    evidence: hasControlPlane
      ? "Hidden engineering control plane is present."
      : "Hidden engineering control plane is absent or not a directory.",
  });

  const manifestPath = path.join(targetPath, ...RUNTIME_MANIFEST_PATH.split("/"));
  const manifestInspection = await inspectPath(manifestPath);
  if (manifestInspection.error) {
    checks.push({
      id: "project-runtime-manifest",
      status: "BLOCKED",
      path: RUNTIME_MANIFEST_PATH,
      evidence: "Project Runtime manifest cannot be inspected.",
    });
    return blockedReport(targetPath, checks, "Runtime evidence cannot be inspected safely.");
  }

  if (!manifestInspection.value?.isFile()) {
    checks.push({
      id: "project-runtime-manifest",
      status: manifestInspection.value ? "INVALID" : "MISSING",
      path: RUNTIME_MANIFEST_PATH,
      evidence: "Pinned Project Runtime manifest is absent or not a file.",
    });
    return onboardingReport(targetPath, checks);
  }

  let manifestSource;
  try {
    manifestSource = await readFile(manifestPath, "utf8");
  } catch {
    checks.push({
      id: "project-runtime-manifest",
      status: "BLOCKED",
      path: RUNTIME_MANIFEST_PATH,
      evidence: "Project Runtime manifest exists but cannot be read.",
    });
    return blockedReport(targetPath, checks, "Runtime evidence cannot be inspected safely.");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch {
    checks.push({
      id: "project-runtime-manifest",
      status: "INVALID",
      path: RUNTIME_MANIFEST_PATH,
      evidence: "Project Runtime manifest is not valid JSON.",
    });
    return onboardingReport(targetPath, checks);
  }

  const hasPinnedRuntime =
    manifest !== null &&
    typeof manifest === "object" &&
    [1, 2].includes(manifest.schemaVersion) &&
    typeof manifest.runtimeVersion === "string" &&
    manifest.runtimeVersion.trim().length > 0;

  checks.push({
    id: "project-runtime-manifest",
    status: hasPinnedRuntime ? "PASS" : "INVALID",
    path: RUNTIME_MANIFEST_PATH,
    evidence: hasPinnedRuntime
      ? `Pinned Project Runtime ${manifest.runtimeVersion} is declared with schema ${manifest.schemaVersion}.`
      : "Manifest must declare schemaVersion 1 or 2 and a non-empty runtimeVersion.",
  });

  if (!hasControlPlane || !hasPinnedRuntime) {
    return onboardingReport(targetPath, checks);
  }

  return createReadinessReport(
    "READY",
    targetPath,
    checks,
    "Minimal pinned Project Runtime evidence is present.",
    "Invoke the Global Launcher with --run to delegate to the project-local Runtime.",
  );
}

/** @param {string} target */
export async function validatePreparedProject(target) {
  const readiness = await probeReadiness(target);
  if (readiness.status !== "READY") {
    throw new Error("Applied manifest did not produce a ready Project Runtime.");
  }
  const runtimePath = path.join(path.resolve(target), ".engineering", "runtime", "engine.mjs");
  const runtime = await import(pathToFileURL(runtimePath).href);
  const prepared = await runtime.runEngineeringRun(target);
  if (prepared.status !== "PREPARED_PROJECT" || prepared.smoke?.status !== "PASS") {
    throw new Error("Applied manifest failed Project Runtime smoke validation.");
  }
  return { readiness, prepared };
}

/**
 * @param {string} targetPath
 * @param {ReadinessCheck[]} checks
 */
function onboardingReport(targetPath, checks) {
  return createReadinessReport(
    "ONBOARDING_REQUIRED",
    targetPath,
    checks,
    "Required Project Runtime evidence is missing or invalid.",
    "Stop and request a separate explicit onboarding invocation; no onboarding was started.",
  );
}

/**
 * @param {string} targetPath
 * @param {ReadinessCheck[]} checks
 * @param {string} summary
 */
function blockedReport(targetPath, checks, summary) {
  return createReadinessReport(
    "BLOCKED",
    targetPath,
    checks,
    summary,
    "Make the Target Project readable and invoke $engineering-loop explicitly again.",
    "unknown",
  );
}

/**
 * @param {"READY" | "ONBOARDING_REQUIRED" | "BLOCKED"} status
 * @param {string} targetPath
 * @param {ReadinessCheck[]} checks
 * @param {string} summary
 * @param {string} nextAction
 * @param {"directory" | "unknown"} [targetKind]
 */
function createReadinessReport(
  status,
  targetPath,
  checks,
  summary,
  nextAction,
  targetKind = "directory",
) {
  return {
    schemaVersion: 1,
    status,
    terminal: true,
    probeExecuted: true,
    mutated: false,
    target: { path: targetPath, kind: targetKind },
    checks,
    summary,
    nextAction,
  };
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid launcher arguments.";
    process.stdout.write(`${JSON.stringify(explicitInvocationRequiredReport(message), null, 2)}\n`);
    return 64;
  }

  if (!options.explicit) {
    const report = explicitInvocationRequiredReport(
      "Readiness did not run because explicit invocation evidence was absent.",
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 64;
  }

  const readiness = await probeReadiness(options.target);
  if (options.operation === "doctor" || options.operation === "repair") {
    const doctor = await import(
      new URL("../runtime/doctor-contracts.mjs", import.meta.url).href
    );
    const report =
      options.operation === "doctor"
        ? await doctor.diagnoseRuntime(options.target)
        : await doctor.repairRuntime(options.target, { dryRun: options.dryRun });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "BLOCKED" ? 1 : 0;
  }
  if (options.operation === "rollback") {
    const applyModule = await import(new URL("./apply.mjs", import.meta.url).href);
    const report = await applyModule.rollbackMigration(
      options.target,
      options.rollbackToken ?? "",
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (options.operation === "apply") {
    if (readiness.status === "BLOCKED") {
      process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
      return 1;
    }
    const source = await readFile(path.resolve(options.manifestPath ?? ""), "utf8");
    const manifest = JSON.parse(source);
    const overrides = options.overridesPath
      ? JSON.parse(await readFile(path.resolve(options.overridesPath), "utf8"))
      : undefined;
    const applyModule = await import(new URL("./apply.mjs", import.meta.url).href);
    const report = await applyModule.applyMigrationManifest(
      options.target,
      manifest,
      options.approvedHash,
      validatePreparedProject,
      overrides,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (options.operation === "normalize") {
    if (readiness.status === "BLOCKED") {
      process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
      return 1;
    }
    const normalizer = await import(new URL("./normalize.mjs", import.meta.url).href);
    const report = await normalizer.proposeNormalization(options.target);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (options.operation === "onboard") {
    if (readiness.status !== "ONBOARDING_REQUIRED") {
      process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
      return readiness.status === "BLOCKED" ? 1 : 0;
    }
    const onboardingModule = await import(new URL("./onboard.mjs", import.meta.url).href);
    const report = await onboardingModule.onboardProject(options.target);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (options.operation === "run") {
    if (readiness.status !== "READY") {
      process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
      return readiness.status === "BLOCKED" ? 1 : 0;
    }
    const runtimePath = path.join(
      path.resolve(options.target),
      ".engineering",
      "runtime",
      "engine.mjs",
    );
    const runtime = await import(pathToFileURL(runtimePath).href);
    const report = await runtime.runEngineeringRun(options.target);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  const report = readiness;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "BLOCKED" ? 1 : 0;
}

/** @param {string} summary */
function explicitInvocationRequiredReport(summary) {
  return {
    schemaVersion: 1,
    status: "EXPLICIT_INVOCATION_REQUIRED",
    terminal: true,
    probeExecuted: false,
    mutated: false,
    summary,
    nextAction: "Invoke $engineering-loop explicitly before running readiness.",
  };
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Global Launcher failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
