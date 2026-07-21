#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateAdoptionMatrix,
  validateRuntimeManifest,
  verifyFileChecksums,
} from "./contracts.mjs";

const PROJECT_STATE_PATH = ".engineering/state/project.json";
const REGISTRY_PATH = ".engineering/verification/registry.json";
const OUTPUT_LIMIT = 1024 * 1024;
const INSTRUMENTAL_ROLES = Object.freeze(["test", "typecheck", "build", "observed-behavior"]);
const RUN_ARTIFACT_FILES = new Set([
  "quality-review.json",
  "result.json",
  "state.json",
  "task-profile.json",
  "verification.json",
]);
const DENIED_ARTIFACT_KEYS = new Set([
  "chattranscripts",
  "content",
  "environment",
  "rawlogs",
  "secrets",
  "sourcecopies",
  "stderr",
  "stdout",
]);
const FAST_TASK_EVIDENCE = Object.freeze({
  scope: "LOCAL",
  risk: "LOW",
  ambiguity: "NONE",
  reversibility: "EASY",
});

/**
 * @param {string} targetInput
 * @param {{ requestPath?: string }} [options]
 */
export async function runEngineeringRun(targetInput, options = {}) {
  const target = path.resolve(targetInput);
  const prepared = await validatePreparedRuntime(target);
  if (!options.requestPath) {
    return prepared.report;
  }
  const request = await readRunRequest(target, options.requestPath);
  return runFastTask(target, prepared, request);
}

/** @param {string} target */
async function validatePreparedRuntime(target) {
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
  const registry = await readJson(path.join(target, ...REGISTRY_PATH.split("/")));
  if (
    projectState.status !== "PREPARED_PROJECT" ||
    projectState.runtimeVersion !== manifest.runtimeVersion
  ) {
    throw new Error("Project state is not bound to the installed runtime version.");
  }
  if (!registry.checks?.some((/** @type {any} */ check) => check.id === "prepared-project-smoke")) {
    throw new Error("Prepared Project smoke verification is not registered.");
  }

  return {
    registry,
    report: {
      schemaVersion: 1,
      status: "PREPARED_PROJECT",
      delegated: true,
      runtimeVersion: manifest.runtimeVersion,
      projectState: PROJECT_STATE_PATH,
      project: { status: projectState.status, statePath: PROJECT_STATE_PATH },
      smoke: { status: "PASS", verificationId: "prepared-project-smoke" },
    },
  };
}

/** @param {string} target @param {string} requestPath */
async function readRunRequest(target, requestPath) {
  if (typeof requestPath !== "string" || requestPath.trim().length === 0) {
    throw new Error("Run request path must be a non-empty Target Project path.");
  }
  const absolute = path.resolve(target, requestPath);
  const relative = path.relative(target, absolute);
  if (path.isAbsolute(requestPath) || relative === "" || relative.startsWith(`..${path.sep}`) || relative === "..") {
    throw new Error("Run request must stay within the Target Project.");
  }
  return validateRunRequest(await readJson(absolute));
}

/** @param {unknown} value */
function validateRunRequest(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Run request must be an object.");
  }
  const request = /** @type {Record<string, any>} */ (value);
  if (request.schemaVersion !== 1) {
    throw new Error("Run request schemaVersion must equal 1.");
  }
  if (!request.task || typeof request.task !== "object") {
    throw new Error("Run request must include task evidence.");
  }
  if (
    typeof request.task.summary !== "string" ||
    request.task.summary.trim().length === 0 ||
    request.task.summary.length > 160 ||
    /[\r\n]/u.test(request.task.summary)
  ) {
    throw new Error("Task summary must be a single non-empty line of at most 160 characters.");
  }
  for (const [field, expected] of Object.entries(FAST_TASK_EVIDENCE)) {
    if (request.task[field] !== expected) {
      throw new Error(`Issue #21 supports FAST only: task.${field} must equal ${expected}.`);
    }
  }
  if (!request.repository || typeof request.repository !== "object") {
    throw new Error("Run request must identify integration and stable branches.");
  }
  for (const field of ["integrationBranch", "stableBranch"]) {
    if (!isSafeBranchName(request.repository[field])) {
      throw new Error(`repository.${field} must be a safe branch name.`);
    }
  }
  if (request.repository.integrationBranch === request.repository.stableBranch) {
    throw new Error("Integration and stable branches must be distinct.");
  }
  if (
    !Array.isArray(request.writeLease) ||
    request.writeLease.length === 0 ||
    !request.writeLease.every(isSafeLeasedPath) ||
    new Set(request.writeLease).size !== request.writeLease.length
  ) {
    throw new Error("writeLease must contain unique canonical project-relative Application Core paths.");
  }
  if (!request.commands || typeof request.commands !== "object") {
    throw new Error("Run request must reference registered commands.");
  }
  for (const field of ["implementation", "focusedCheck", "qualityReview"]) {
    if (!isNonEmptyString(request.commands[field])) {
      throw new Error(`commands.${field} must reference a registered command ID.`);
    }
  }
  if (
    !Array.isArray(request.commands.relevantChecks) ||
    request.commands.relevantChecks.length === 0 ||
    !request.commands.relevantChecks.every(isNonEmptyString) ||
    new Set(request.commands.relevantChecks).size !== request.commands.relevantChecks.length
  ) {
    throw new Error("commands.relevantChecks must contain unique registered command IDs.");
  }
  return request;
}

/** @param {string} target @param {{ registry: any, report: any }} prepared @param {Record<string, any>} request */
async function runFastTask(target, prepared, request) {
  const integrationBranch = request.repository.integrationBranch;
  const stableBranch = request.repository.stableBranch;
  const repository = await inspectRepository(target, integrationBranch, stableBranch);
  const commands = resolveRunCommands(prepared.registry, request.commands);
  const taskProfile = {
    schemaVersion: 1,
    selectedMode: "FAST",
    rationale: "Prepared clean repository with registered commands and a low-risk local task selects FAST.",
    taskEvidence: { ...FAST_TASK_EVIDENCE },
    writeLease: request.writeLease,
    repositoryEvidence: {
      preparedProject: prepared.report.status === "PREPARED_PROJECT",
      gitRepository: repository.isGitRepository,
      cleanWorktree: repository.clean,
      integrationBranch,
      stableBranch,
      registeredCommands: true,
    },
  };
  const runId = createRunId();
  const branch = `run/fast/${runId}`;
  const worktreeRoot = `${target}.engineering-worktrees`;
  const worktree = path.join(worktreeRoot, runId);
  const artifactPath = `.engineering/runs/${runId}`;
  const artifactRoot = path.join(worktree, ...artifactPath.split("/"));
  /** @type {{ sequence: number, state: string, status: string }[]} */
  const stateHistory = [];
  /** @type {{ schemaVersion: number, checks: { id: string, role: string, status: string, exitCode: number }[] }} */
  const verification = { schemaVersion: 1, checks: [] };
  /** @type {any} */
  let qualityReview;
  await mkdir(worktreeRoot, { recursive: true });
  const commandGuard = await createGitCommandGuard(worktreeRoot, runId, target);
  const runContext = {
    target,
    taskProfile,
    repository,
    runId,
    branch,
    worktree,
    artifactPath,
    artifactRoot,
    stateHistory,
    verification,
    writeLease: request.writeLease,
    commandGuard,
  };

  try {
  transitionState(stateHistory, "CLASSIFIED");
  await git(target, ["worktree", "add", "-b", branch, worktree, repository.integrationHead]);
  await initializeCommandGuard(commandGuard, worktree, repository, branch);
  transitionState(stateHistory, "ISOLATED");
  await mkdir(artifactRoot, { recursive: true });
  await writeJson(path.join(artifactRoot, "task-profile.json"), taskProfile);
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, stateHistory, false);

  transitionState(stateHistory, "IMPLEMENTING");
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, stateHistory, false);
  const implementationExecution = await executeRunCommand(runContext, commands.implementation);
  if (implementationExecution.blocked) {
    return implementationExecution.blocked;
  }
  const implementationResult = implementationExecution.result;
  if (implementationResult.exitCode !== 0) {
    return blockAfterCommand(
      runContext,
      "IMPLEMENTING",
      commands.implementation,
      implementationResult,
    );
  }

  transitionState(stateHistory, "FOCUSED_VERIFICATION");
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, stateHistory, false);
  const focusedExecution = await executeRunCommand(runContext, commands.focusedCheck);
  if (focusedExecution.blocked) {
    return focusedExecution.blocked;
  }
  const focusedResult = focusedExecution.result;
  verification.checks.push(commandEvidence(commands.focusedCheck, focusedResult));
  await writeJson(path.join(artifactRoot, "verification.json"), verification);
  if (focusedResult.exitCode !== 0) {
    return blockAfterCommand(
      runContext,
      "FOCUSED_VERIFICATION",
      commands.focusedCheck,
      focusedResult,
    );
  }

  transitionState(stateHistory, "QUALITY_REVIEW");
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, stateHistory, false);
  const qualityExecution = await executeRunCommand(runContext, commands.qualityReview);
  if (qualityExecution.blocked) {
    return qualityExecution.blocked;
  }
  const qualityResult = qualityExecution.result;
  if (qualityResult.exitCode !== 0) {
    return blockAfterCommand(
      runContext,
      "QUALITY_REVIEW",
      commands.qualityReview,
      qualityResult,
    );
  }
  try {
    qualityReview = parseQualityReview(qualityResult.stdout);
  } catch {
    return blockAfterCommand(
      runContext,
      "QUALITY_REVIEW",
      commands.qualityReview,
      { exitCode: 1 },
    );
  }
  await writeJson(path.join(artifactRoot, "quality-review.json"), qualityReview);

  transitionState(stateHistory, "FULL_VERIFICATION");
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, stateHistory, false);
  for (const command of commands.relevantChecks) {
    const checkExecution = await executeRunCommand(runContext, command, qualityReview);
    if (checkExecution.blocked) {
      return checkExecution.blocked;
    }
    const checkResult = checkExecution.result;
    verification.checks.push(commandEvidence(command, checkResult));
    await writeJson(path.join(artifactRoot, "verification.json"), verification);
    if (checkResult.exitCode !== 0) {
      return blockAfterCommand(
        runContext,
        "FULL_VERIFICATION",
        command,
        checkResult,
        qualityReview,
      );
    }
  }

  const implementationChanges = await changedPaths(worktree, repository.integrationHead);
  const unauthorizedPath = implementationChanges.find(
    (changedPath) =>
      !request.writeLease.includes(changedPath) &&
      !changedPath.startsWith(`${artifactPath}/`),
  );
  if (unauthorizedPath) {
    return blockRun({
      ...runContext,
      qualityReview,
      failure: {
        stage: "ARTIFACT_VALIDATION",
        checkId: "write-lease",
        role: "scope",
        exitCode: 1,
      },
    });
  }
  if (!implementationChanges.some((changedPath) => request.writeLease.includes(changedPath))) {
    throw new Error("FAST implementation produced no change outside Run Artifacts.");
  }
  const checkpointArtifacts = {
    "quality-review.json": qualityReview,
    "state.json": runStateArtifact(
      runId,
      branch,
      repository.integrationHead,
      stateHistory,
      false,
    ),
    "task-profile.json": taskProfile,
    "verification.json": verification,
  };
  try {
    await validateRunArtifacts(artifactRoot, checkpointArtifacts);
  } catch {
    await writeJson(path.join(artifactRoot, "task-profile.json"), taskProfile);
    await writeJson(path.join(artifactRoot, "quality-review.json"), qualityReview);
    await writeJson(path.join(artifactRoot, "verification.json"), verification);
    return blockRun({
      ...runContext,
      qualityReview,
      failure: {
        stage: "ARTIFACT_VALIDATION",
        checkId: "run-artifacts",
        role: "schema",
        exitCode: 1,
      },
    });
  }

  await git(worktree, ["add", "--all"]);
  try {
    await validateGitArtifacts(worktree, "index", artifactPath, checkpointArtifacts);
    await validateLeasedIndex(worktree, request.writeLease);
  } catch {
    return blockRun({
      ...runContext,
      qualityReview,
      failure: {
        stage: "ARTIFACT_VALIDATION",
        checkId: "index-artifacts",
        role: "schema",
        exitCode: 1,
      },
    });
  }
  const checkpointTree = await git(worktree, ["write-tree"]);
  await git(worktree, [
    "-c",
    `core.hooksPath=${commandGuard.emptyHooks}`,
    "commit",
    "-m",
    `feat: complete FAST task (${runId})`,
  ]);
  const checkpointCommit = await git(worktree, ["rev-parse", "HEAD"]);
  await validateCommittedTree(worktree, checkpointCommit, checkpointTree);
  await validateGitArtifacts(worktree, checkpointCommit, artifactPath, checkpointArtifacts);
  const checkpointDiff = await aggregateDiff(worktree, repository.integrationHead, checkpointCommit);

  const readyStateHistory = [...stateHistory];
  transitionState(readyStateHistory, "READY_FOR_HUMAN");
  await writeRunState(artifactRoot, runId, branch, repository.integrationHead, readyStateHistory, true);
  const resultArtifact = {
    schemaVersion: 1,
    status: "READY_FOR_HUMAN",
    terminal: true,
    accepted: false,
    releaseStateReached: true,
    mode: "FAST",
    branch,
    baseCommit: repository.integrationHead,
    checkpointCommit,
    aggregateDiff: durableAggregateDiff(checkpointDiff),
  };
  await writeJson(path.join(artifactRoot, "result.json"), resultArtifact);
  const terminalArtifacts = {
    ...checkpointArtifacts,
    "state.json": runStateArtifact(
      runId,
      branch,
      repository.integrationHead,
      readyStateHistory,
      true,
    ),
    "result.json": resultArtifact,
  };
  await validateRunArtifacts(artifactRoot, terminalArtifacts);
  await git(worktree, ["add", "--all"]);
  try {
    await validateGitArtifacts(worktree, "index", artifactPath, terminalArtifacts);
    await validateLeasedIndex(worktree, request.writeLease);
  } catch {
    return blockRun({
      ...runContext,
      qualityReview,
      failure: {
        stage: "ARTIFACT_VALIDATION",
        checkId: "index-artifacts",
        role: "schema",
        exitCode: 1,
      },
    });
  }
  const terminalTree = await git(worktree, ["write-tree"]);
  await git(worktree, [
    "-c",
    `core.hooksPath=${commandGuard.emptyHooks}`,
    "commit",
    "-m",
    `chore: record FAST run readiness (${runId})`,
  ]);
  const head = await git(worktree, ["rev-parse", "HEAD"]);
  await validateCommittedTree(worktree, head, terminalTree);
  await validateGitArtifacts(worktree, head, artifactPath, terminalArtifacts);
  transitionState(stateHistory, "READY_FOR_HUMAN");
  const finalDiff = await aggregateDiff(worktree, repository.integrationHead, head);
  await assertProtectedBranches(target, repository);

  return {
    schemaVersion: 1,
    status: "READY_FOR_HUMAN",
    terminal: true,
    accepted: false,
    releaseStateReached: true,
    taskProfile,
    stateHistory,
    qualityReview,
    verification,
    run: runEvidence(runId, branch, worktree, artifactPath, repository.integrationHead, checkpointCommit, head),
    aggregateDiff: finalDiff,
  };
  } finally {
    await cleanupCommandGuard(commandGuard);
  }
}

/** @param {Record<string, any>} context @param {string} stage @param {Record<string, any>} command @param {{ exitCode: number }} result @param {any} [qualityReview] */
async function blockAfterCommand(context, stage, command, result, qualityReview) {
  return blockRun({
    ...context,
    ...(qualityReview ? { qualityReview } : {}),
    failure: commandFailure(stage, command, result),
  });
}

/** @param {Record<string, any>} context */
async function blockRun(context) {
  transitionState(context.stateHistory, "BLOCKED");
  const expectedArtifactNames = new Set([
    ...(context.qualityReview ? ["quality-review.json"] : []),
    "result.json",
    "state.json",
    "task-profile.json",
    "verification.json",
  ]);
  await removeUnexpectedRunArtifacts(context.artifactRoot, expectedArtifactNames);
  await writeJson(path.join(context.artifactRoot, "task-profile.json"), context.taskProfile);
  const stateArtifact = await writeRunState(
    context.artifactRoot,
    context.runId,
    context.branch,
    context.repository.integrationHead,
    context.stateHistory,
    true,
  );
  await writeJson(path.join(context.artifactRoot, "verification.json"), context.verification);
  if (context.qualityReview) {
    await writeJson(path.join(context.artifactRoot, "quality-review.json"), context.qualityReview);
  }
  const resultArtifact = {
    schemaVersion: 1,
    status: "BLOCKED",
    terminal: true,
    accepted: false,
    releaseStateReached: false,
    mode: "FAST",
    branch: context.branch,
    baseCommit: context.repository.integrationHead,
    failure: context.failure,
  };
  await writeJson(path.join(context.artifactRoot, "result.json"), resultArtifact);
  await validateRunArtifacts(context.artifactRoot, {
    ...(context.qualityReview ? { "quality-review.json": context.qualityReview } : {}),
    "result.json": resultArtifact,
    "state.json": stateArtifact,
    "task-profile.json": context.taskProfile,
    "verification.json": context.verification,
  });
  await assertProtectedBranches(context.target, context.repository);
  const head = await git(context.worktree, ["rev-parse", "HEAD"]);
  return {
    schemaVersion: 1,
    status: "BLOCKED",
    terminal: true,
    accepted: false,
    releaseStateReached: false,
    taskProfile: context.taskProfile,
    stateHistory: context.stateHistory,
    qualityReview: context.qualityReview,
    verification: context.verification,
    failure: context.failure,
    run: runEvidence(
      context.runId,
      context.branch,
      context.worktree,
      context.artifactPath,
      context.repository.integrationHead,
      null,
      head,
    ),
  };
}

/** @param {string} target @param {string} integrationBranch @param {string} stableBranch */
async function inspectRepository(target, integrationBranch, stableBranch) {
  const isGitRepository = (await git(target, ["rev-parse", "--is-inside-work-tree"])) === "true";
  const currentBranch = await git(target, ["branch", "--show-current"]);
  if (currentBranch !== integrationBranch) {
    throw new Error(`FAST run must start from the integration branch ${integrationBranch}.`);
  }
  const status = await git(target, ["status", "--porcelain"]);
  if (status !== "") {
    throw new Error("FAST run requires a clean integration worktree.");
  }
  return {
    isGitRepository,
    clean: true,
    integrationBranch,
    stableBranch,
    integrationHead: await git(target, ["rev-parse", integrationBranch]),
    stableHead: await git(target, ["rev-parse", stableBranch]),
  };
}

/** @param {string} target @param {Record<string, any>} repository */
async function assertProtectedBranches(target, repository) {
  const integrationHead = await git(target, ["rev-parse", repository.integrationBranch]);
  const stableHead = await git(target, ["rev-parse", repository.stableBranch]);
  const currentBranch = await git(target, ["branch", "--show-current"]);
  const status = await git(target, ["status", "--porcelain"]);
  if (
    integrationHead !== repository.integrationHead ||
    stableHead !== repository.stableHead ||
    currentBranch !== repository.integrationBranch ||
    status !== ""
  ) {
    throw new Error("FAST run changed an Integration or Stable branch.");
  }
}

/** @param {string} target @param {Record<string, any>} repository */
async function repositoryIsolationViolated(target, repository) {
  const [integrationHead, stableHead, currentBranch, status] = await Promise.all([
    tryGit(target, ["rev-parse", "--verify", `refs/heads/${repository.integrationBranch}`]),
    tryGit(target, ["rev-parse", "--verify", `refs/heads/${repository.stableBranch}`]),
    git(target, ["branch", "--show-current"]),
    git(target, ["status", "--porcelain"]),
  ]);
  return (
    integrationHead !== repository.integrationHead ||
    stableHead !== repository.stableHead ||
    currentBranch !== repository.integrationBranch ||
    status !== ""
  );
}

/** @param {string} target @param {Record<string, any>} repository */
async function restoreProtectedRepository(target, repository) {
  await restoreProtectedRef(target, repository.integrationBranch, repository.integrationHead);
  await restoreProtectedRef(target, repository.stableBranch, repository.stableHead);
  const untracked = await gitNullPaths(target, ["ls-files", "--others", "--exclude-standard", "-z"]);
  for (const relativePath of untracked) {
    const absolutePath = path.resolve(target, relativePath);
    const relative = path.relative(target, absolutePath);
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("Refused to restore an untracked path outside the Integration worktree.");
    }
    await rm(absolutePath, { recursive: true, force: true });
  }
  await git(target, ["switch", "--discard-changes", repository.integrationBranch]);
  await git(target, [
    "restore",
    `--source=${repository.integrationHead}`,
    "--staged",
    "--worktree",
    "--",
    ".",
  ]);
  await assertProtectedBranches(target, repository);
}

/** @param {string} target @param {string} branch @param {string} expectedHead */
async function restoreProtectedRef(target, branch, expectedHead) {
  const actualHead = await tryGit(target, ["rev-parse", "--verify", `refs/heads/${branch}`]);
  if (actualHead !== expectedHead) {
    await git(target, [
      "update-ref",
      `refs/heads/${branch}`,
      expectedHead,
      ...(actualHead ? [actualHead] : []),
    ]);
  }
}

/** @param {any} registry @param {Record<string, any>} references */
function resolveRunCommands(registry, references) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.checks)) {
    throw new Error("Verification registry must use schemaVersion 1 and contain checks.");
  }
  const byId = new Map();
  for (const [index, entry] of registry.checks.entries()) {
    if (
      !entry ||
      !isSafeEvidenceId(entry.id) ||
      !isNonEmptyString(entry.role) ||
      !Array.isArray(entry.command) ||
      entry.command.length === 0 ||
      !entry.command.every(isNonEmptyString)
    ) {
      throw new Error(`Verification registry entry ${index} is invalid.`);
    }
    if (byId.has(entry.id)) {
      throw new Error(`Verification registry command IDs must be unique: ${entry.id}.`);
    }
    if (INSTRUMENTAL_ROLES.includes(entry.role) && typeof entry.requiredForFast !== "boolean") {
      throw new Error(`Instrumental registry command ${entry.id} must declare requiredForFast.`);
    }
    byId.set(entry.id, entry);
  }
  /** @param {string} id @param {string} expectedRole */
  const resolve = (id, expectedRole) => {
    const entry = byId.get(id);
    if (!entry || entry.role !== expectedRole) {
      throw new Error(`Registered command ${id} must have role ${expectedRole}.`);
    }
    return entry;
  };
  const relevantChecks = references.relevantChecks.map((/** @type {string} */ id) => {
    const entry = byId.get(id);
    if (!entry || !INSTRUMENTAL_ROLES.includes(entry.role)) {
      throw new Error(`Relevant command ${id} must be an instrumental check.`);
    }
    return entry;
  });
  const selectedIds = new Set(references.relevantChecks);
  for (const role of INSTRUMENTAL_ROLES) {
    const requiredForRole = registry.checks.filter(
      (/** @type {any} */ entry) => entry?.role === role && entry.requiredForFast === true,
    );
    if (requiredForRole.length === 0) {
      throw new Error(`Verification registry must require at least one FAST ${role} check.`);
    }
    for (const entry of requiredForRole) {
      if (!selectedIds.has(entry.id)) {
        throw new Error(`Required FAST check ${entry.id} is missing from the run request.`);
      }
    }
  }
  return {
    implementation: resolve(references.implementation, "implementation"),
    focusedCheck: resolve(references.focusedCheck, "focused-test"),
    qualityReview: resolve(references.qualityReview, "quality-review"),
    relevantChecks,
  };
}

/** @param {Record<string, any>} context @param {{ id: string, command: string[] }} entry @param {any} [qualityReview] */
async function executeRunCommand(context, entry, qualityReview) {
  await resetCommandGuard(context.commandGuard, context.repository, context.branch);
  const realRunBefore = await captureBranchState(
    context.worktree,
    context.branch,
    rootGitEnvironment(context.commandGuard),
  );
  const shadowBefore = await captureGuardState(context);
  const result = await runProcess(
    entry.command[0],
    entry.command.slice(1),
    context.worktree,
    commandEnvironment(context.commandGuard),
  );
  const realRunAfter = await captureBranchState(
    context.worktree,
    context.branch,
    rootGitEnvironment(context.commandGuard),
  );
  const shadowAfter = await captureGuardState(context);
  const protectedRepositoryChanged = await repositoryIsolationViolated(
    context.target,
    context.repository,
  );
  if (protectedRepositoryChanged) {
    await restoreProtectedRepository(context.target, context.repository);
  }
  const realRunChanged = !sameBranchState(realRunBefore, realRunAfter);
  if (realRunChanged) {
    await restoreBranchState(
      context.worktree,
      context.branch,
      realRunBefore,
      rootGitEnvironment(context.commandGuard),
    );
  }
  const shadowProtectedChanged =
    shadowAfter.integrationHead !== shadowBefore.integrationHead ||
    shadowAfter.stableHead !== shadowBefore.stableHead;
  const shadowRunChanged = !sameBranchState(shadowBefore.run, shadowAfter.run);
  const repositoryWrite =
    protectedRepositoryChanged || shadowProtectedChanged || result.exitCode === 87;
  const rootWrite = realRunChanged || shadowRunChanged || result.exitCode === 86;
  if (repositoryWrite || rootWrite) {
    return {
      result,
      blocked: await blockRun({
        ...context,
        ...(qualityReview ? { qualityReview } : {}),
        failure: {
          stage: "ARTIFACT_VALIDATION",
          checkId: repositoryWrite ? "repository-isolation" : "root-writer",
          role: "scope",
          exitCode: 1,
        },
      }),
    };
  }
  return { result, blocked: null };
}

/** @param {Record<string, any>} context */
async function captureGuardState(context) {
  const environment = shadowGitEnvironment(context.commandGuard);
  return {
    run: await captureBranchState(context.worktree, context.branch, environment),
    integrationHead: await tryGitWithEnvironment(
      context.worktree,
      ["rev-parse", "--verify", `refs/heads/${context.repository.integrationBranch}`],
      environment,
    ),
    stableHead: await tryGitWithEnvironment(
      context.worktree,
      ["rev-parse", "--verify", `refs/heads/${context.repository.stableBranch}`],
      environment,
    ),
  };
}

/** @param {string} cwd @param {string} branch @param {NodeJS.ProcessEnv} environment */
async function captureBranchState(cwd, branch, environment) {
  const reflogPath = path.resolve(
    cwd,
    await gitWithEnvironment(
      cwd,
      ["rev-parse", "--git-path", `logs/refs/heads/${branch}`],
      environment,
    ),
  );
  let reflog = null;
  try {
    reflog = await readFile(reflogPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return {
    head: await tryGitWithEnvironment(
      cwd,
      ["rev-parse", "--verify", `refs/heads/${branch}`],
      environment,
    ),
    reflog,
    reflogPath,
  };
}

/** @param {{ head: string | null, reflog: string | null }} left @param {{ head: string | null, reflog: string | null }} right */
function sameBranchState(left, right) {
  return left.head === right.head && left.reflog === right.reflog;
}

/** @param {string} cwd @param {string} branch @param {{ head: string | null, reflog: string | null, reflogPath: string }} expected @param {NodeJS.ProcessEnv} environment */
async function restoreBranchState(cwd, branch, expected, environment) {
  if (!expected.head) {
    throw new Error("Run Branch baseline is missing during unauthorized Git recovery.");
  }
  await gitWithEnvironment(cwd, ["update-ref", `refs/heads/${branch}`, expected.head], environment);
  if (expected.reflog === null) {
    await rm(expected.reflogPath, { force: true });
  } else {
    await mkdir(path.dirname(expected.reflogPath), { recursive: true });
    await writeFile(expected.reflogPath, expected.reflog, "utf8");
  }
  const restored = await captureBranchState(cwd, branch, environment);
  if (!sameBranchState(expected, restored)) {
    throw new Error("Run Branch could not be restored after an unauthorized Git write.");
  }
}

/** @param {string} executable @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} [environment] */
function runProcess(executable, args, cwd, environment = commandEnvironment()) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: environment,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let exceeded = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    /** @param {string} target @param {string} chunk */
    const collect = (target, chunk) => {
      const combined = target + chunk;
      if (combined.length > OUTPUT_LIMIT) {
        exceeded = true;
        child.kill();
        return combined.slice(0, OUTPUT_LIMIT);
      }
      return combined;
    };
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: exceeded ? 1 : (code ?? 1), stdout, stderr });
    });
  });
}

/** @param {Record<string, any> | undefined} [guard] */
function commandEnvironment(guard) {
  const allowed = [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "LANG",
  ];
  /** @type {NodeJS.ProcessEnv} */
  const environment = { CI: "true" };
  for (const name of allowed) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  if (guard) {
    const inheritedPath = environment.PATH ?? environment.Path ?? "";
    delete environment.Path;
    environment.PATH = `${guard.bin}${path.delimiter}${inheritedPath}`;
    environment.ENGINEERING_INTEGRATION_WORKTREE = guard.integrationWorktree;
    environment.GIT_DIR = guard.gitDirectory;
    environment.GIT_WORK_TREE = guard.worktree;
    environment.GIT_OBJECT_DIRECTORY = guard.objectDirectory;
    environment.GIT_ALTERNATE_OBJECT_DIRECTORIES = guard.realObjectDirectory;
    environment.GIT_INDEX_FILE = guard.indexFile;
  }
  return environment;
}

/** @param {Record<string, any>} guard */
function shadowGitEnvironment(guard) {
  const environment = commandEnvironment();
  environment.GIT_DIR = guard.gitDirectory;
  environment.GIT_WORK_TREE = guard.worktree;
  environment.GIT_OBJECT_DIRECTORY = guard.objectDirectory;
  environment.GIT_ALTERNATE_OBJECT_DIRECTORIES = guard.realObjectDirectory;
  environment.GIT_INDEX_FILE = guard.indexFile;
  return environment;
}

/** @param {Record<string, any>} guard */
function rootGitEnvironment(guard) {
  const environment = commandEnvironment();
  environment.GIT_ALTERNATE_OBJECT_DIRECTORIES = guard.objectDirectory;
  return environment;
}

/** @param {string} worktreeRoot @param {string} runId @param {string} target */
async function createGitCommandGuard(worktreeRoot, runId, target) {
  const root = path.join(worktreeRoot, `.command-guard-${runId}`);
  const bin = path.join(root, "bin");
  const emptyHooks = path.join(root, "empty-hooks");
  const objectDirectory = path.join(root, "objects");
  const gitDirectory = path.join(root, "git-dir");
  const indexFile = path.join(root, "external-command.index");
  await mkdir(bin, { recursive: true });
  await mkdir(emptyHooks, { recursive: true });
  await mkdir(objectDirectory, { recursive: true });
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const located = await runProcess(locator, ["git"], process.cwd());
  if (located.exitCode !== 0) {
    throw new Error("Git executable cannot be resolved for the command guard.");
  }
  const candidates = located.stdout.split(/\r?\n/u).filter(Boolean);
  const realGit =
    candidates.find((/** @type {string} */ candidate) => /git(?:\.exe)?$/iu.test(candidate)) ?? candidates[0];
  const gitObjectPath = await git(target, ["rev-parse", "--git-path", "objects"]);
  const realObjectDirectory = path.resolve(target, gitObjectPath);
  const wrapperPath = path.join(bin, "git-guard.mjs");
  const wrapperSource = `import { spawnSync } from "node:child_process";\nconst args = process.argv.slice(2);\nconst command = args[0] ?? "";\nconst readOnly = new Set(["diff", "for-each-ref", "log", "ls-files", "rev-parse", "show", "status"]);\nconst allowed = readOnly.has(command) || (command === "reflog" && (args.length === 1 || args[1] === "show")) || (command === "worktree" && args[1] === "list");\nif (!allowed) {\n  process.exitCode = command === "update-ref" || command === "branch" || command === "checkout" || command === "switch" ? 87 : 86;\n} else {\n  const child = spawnSync(${JSON.stringify(realGit)}, args, { env: process.env, shell: false, stdio: "inherit", windowsHide: true });\n  process.exitCode = child.status ?? 1;\n}\n`;
  await writeFile(wrapperPath, wrapperSource, "utf8");
  if (process.platform === "win32") {
    await writeFile(
      path.join(bin, "git.cmd"),
      `@"${process.execPath}" "${wrapperPath}" %*\r\n`,
      "utf8",
    );
  } else {
    await writeFile(
      path.join(bin, "git"),
      `#!/usr/bin/env node\n${wrapperSource}`,
      { encoding: "utf8", mode: 0o755 },
    );
  }
  return {
    root,
    integrationWorktree: target,
    bin,
    emptyHooks,
    realGit,
    gitDirectory,
    objectDirectory,
    realObjectDirectory,
    indexFile,
  };
}

/** @param {Record<string, any>} guard @param {string} worktree @param {Record<string, any>} repository @param {string} branch */
async function initializeCommandGuard(guard, worktree, repository, branch) {
  guard.worktree = worktree;
  await resetCommandGuard(guard, repository, branch);
}

/** @param {Record<string, any>} guard @param {Record<string, any>} repository @param {string} branch */
async function resetCommandGuard(guard, repository, branch) {
  await rm(guard.gitDirectory, { recursive: true, force: true });
  await rm(guard.objectDirectory, { recursive: true, force: true });
  await rm(guard.indexFile, { force: true });
  await mkdir(guard.objectDirectory, { recursive: true });
  await gitWithEnvironment(guard.worktree, ["init", "--bare", guard.gitDirectory], commandEnvironment());
  const environment = shadowGitEnvironment(guard);
  await gitWithEnvironment(guard.worktree, ["config", "core.logAllRefUpdates", "true"], environment);
  await gitWithEnvironment(
    guard.worktree,
    ["symbolic-ref", "HEAD", `refs/heads/${branch}`],
    environment,
  );
  for (const [name, head] of [
    [branch, repository.integrationHead],
    [repository.integrationBranch, repository.integrationHead],
    [repository.stableBranch, repository.stableHead],
  ]) {
    await gitWithEnvironment(guard.worktree, ["update-ref", `refs/heads/${name}`, head], environment);
  }
  await gitWithEnvironment(guard.worktree, ["read-tree", repository.integrationHead], environment);
}

/** @param {{ root: string } | undefined} guard */
async function cleanupCommandGuard(guard) {
  if (guard) {
    await rm(guard.root, { recursive: true, force: true });
  }
}

/** @param {string} source */
function parseQualityReview(source) {
  let review;
  try {
    review = JSON.parse(source);
  } catch {
    throw new Error("Quality Review must emit one structured JSON result.");
  }
  if (
    !review ||
    review.status !== "PASS" ||
    !Array.isArray(review.coverage) ||
    review.coverage.length === 0 ||
    !review.coverage.every(isSafeEvidenceId) ||
    !Array.isArray(review.evidence) ||
    review.evidence.length === 0 ||
    !review.evidence.every(isSafeEvidenceId) ||
    !Array.isArray(review.unverified) ||
    !review.unverified.every(isSafeEvidenceId)
  ) {
    throw new Error("Quality Review PASS requires coverage, evidence, and unverified arrays.");
  }
  return {
    schemaVersion: 1,
    status: "PASS",
    coverage: review.coverage,
    evidence: review.evidence,
    unverified: review.unverified,
  };
}

/** @param {string} worktree @param {string} baseCommit */
async function changedPaths(worktree, baseCommit) {
  const groups = await Promise.all([
    gitNullPaths(worktree, ["diff", "--name-only", "-z", baseCommit]),
    gitNullPaths(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return [...new Set(groups.flat().map((candidate) => candidate.replaceAll("\\", "/")))].sort();
}

/** @param {string} artifactRoot @param {Record<string, unknown>} expectedArtifacts */
async function validateRunArtifacts(artifactRoot, expectedArtifacts) {
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  const expectedNames = Object.keys(expectedArtifacts).sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Run Artifact set does not match the current state contract.");
  }
  for (const entry of entries) {
    if (!entry.isFile() || !RUN_ARTIFACT_FILES.has(entry.name)) {
      throw new Error(`Run Artifact allowlist rejected ${entry.name}.`);
    }
    const artifact = await readJson(path.join(artifactRoot, entry.name));
    if (JSON.stringify(artifact) !== JSON.stringify(expectedArtifacts[entry.name])) {
      throw new Error(`Run Artifact schema or content mismatch: ${entry.name}.`);
    }
    validateArtifactValue(artifact, entry.name);
  }
}

/** @param {string} worktree @param {string} revision @param {string} artifactPath @param {Record<string, unknown>} expectedArtifacts */
async function validateGitArtifacts(worktree, revision, artifactPath, expectedArtifacts) {
  const expectedPaths = Object.keys(expectedArtifacts)
    .map((name) => `${artifactPath}/${name}`)
    .sort();
  const actualPaths =
    revision === "index"
      ? await gitNullPaths(worktree, ["ls-files", "--cached", "-z", "--", artifactPath])
      : await gitNullPaths(worktree, [
          "ls-tree",
          "-r",
          "--name-only",
          "-z",
          revision,
          "--",
          artifactPath,
        ]);
  if (JSON.stringify(actualPaths.sort()) !== JSON.stringify(expectedPaths)) {
    throw new Error("Staged or committed Run Artifact set is incomplete.");
  }
  for (const [name, expected] of Object.entries(expectedArtifacts)) {
    const projectPath = `${artifactPath}/${name}`;
    const source =
      revision === "index"
        ? await git(worktree, ["show", `:${projectPath}`])
        : await git(worktree, ["show", `${revision}:${projectPath}`]);
    const actual = JSON.parse(source);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Staged or committed Run Artifact mismatch: ${name}.`);
    }
    validateArtifactValue(actual, name);
  }
}

/** @param {string} worktree @param {string[]} writeLease */
async function validateLeasedIndex(worktree, writeLease) {
  for (const leasedPath of writeLease) {
    const [worktreeHash, indexHash] = await Promise.all([
      tryGit(worktree, ["hash-object", "--no-filters", "--", leasedPath]),
      tryGit(worktree, ["rev-parse", "--verify", `:${leasedPath}`]),
    ]);
    if (worktreeHash !== indexHash) {
      throw new Error(`Staged Application Core content differs from verified worktree content: ${leasedPath}.`);
    }
  }
}

/** @param {string} worktree @param {string} commit @param {string} expectedTree */
async function validateCommittedTree(worktree, commit, expectedTree) {
  const committedTree = await git(worktree, ["rev-parse", `${commit}^{tree}`]);
  if (committedTree !== expectedTree) {
    throw new Error("Root commit tree differs from the validated Git index.");
  }
}

/** @param {string} artifactRoot @param {Set<string>} expectedNames */
async function removeUnexpectedRunArtifacts(artifactRoot, expectedNames) {
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      await rm(path.join(artifactRoot, entry.name), { recursive: true, force: true });
    }
  }
}

/** @param {unknown} value @param {string} location */
function validateArtifactValue(value, location) {
  if (typeof value === "string") {
    if (/-----BEGIN |\b(?:api[_-]?key|password|secret|token)\s*[:=]/iu.test(value)) {
      throw new Error(`Run Artifact deny scan rejected ${location}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateArtifactValue(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (DENIED_ARTIFACT_KEYS.has(key.toLowerCase())) {
      throw new Error(`Run Artifact deny scan rejected key ${location}.${key}.`);
    }
    validateArtifactValue(entry, `${location}.${key}`);
  }
}

/** @param {string} worktree @param {string} base @param {string} head */
async function aggregateDiff(worktree, base, head) {
  const nameOutput = await git(worktree, ["diff", "--name-only", `${base}..${head}`]);
  return {
    base,
    head,
    files: nameOutput === "" ? [] : nameOutput.split(/\r?\n/u),
    stat: await git(worktree, ["diff", "--stat", `${base}..${head}`]),
  };
}

/** @param {{ base: string, head: string, files: string[] }} aggregate */
function durableAggregateDiff(aggregate) {
  return { base: aggregate.base, head: aggregate.head, files: aggregate.files };
}

/** @param {string} cwd @param {string[]} args */
async function git(cwd, args) {
  return gitWithEnvironment(cwd, args, commandEnvironment());
}

/** @param {string} cwd @param {string[]} args @param {NodeJS.ProcessEnv} environment */
async function gitWithEnvironment(cwd, args, environment) {
  const result = await runProcess("git", args, cwd, environment);
  if (result.exitCode !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/** @param {string} cwd @param {string[]} args */
async function tryGit(cwd, args) {
  return tryGitWithEnvironment(cwd, args, commandEnvironment());
}

/** @param {string} cwd @param {string[]} args @param {NodeJS.ProcessEnv} environment */
async function tryGitWithEnvironment(cwd, args, environment) {
  const result = await runProcess("git", args, cwd, environment);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/** @param {string} cwd @param {string[]} args */
async function gitNullPaths(cwd, args) {
  const result = await runProcess("git", args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

/** @param {any[]} history @param {string} state */
function transitionState(history, state) {
  history.push({ sequence: history.length + 1, state, status: "COMPLETE" });
}

/** @param {string} artifactRoot @param {string} runId @param {string} branch @param {string} baseCommit @param {any[]} history @param {boolean} terminal */
async function writeRunState(artifactRoot, runId, branch, baseCommit, history, terminal) {
  const artifact = runStateArtifact(runId, branch, baseCommit, history, terminal);
  await writeJson(path.join(artifactRoot, "state.json"), artifact);
  return artifact;
}

/** @param {string} runId @param {string} branch @param {string} baseCommit @param {any[]} history @param {boolean} terminal */
function runStateArtifact(runId, branch, baseCommit, history, terminal) {
  return {
    schemaVersion: 1,
    runId,
    mode: "FAST",
    branch,
    baseCommit,
    currentState: history.at(-1)?.state,
    terminal,
    history,
  };
}

/** @param {string} file @param {unknown} value */
async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** @param {Record<string, any>} command @param {{ exitCode: number }} result */
function commandEvidence(command, result) {
  return {
    id: command.id,
    role: command.role,
    status: result.exitCode === 0 ? "PASS" : "FAIL",
    exitCode: result.exitCode,
  };
}

/** @param {string} stage @param {Record<string, any>} command @param {{ exitCode: number }} result */
function commandFailure(stage, command, result) {
  return { stage, checkId: command.id, role: command.role, exitCode: result.exitCode };
}

/** @param {string} runId @param {string} branch @param {string} worktree @param {string} artifactPath @param {string} baseCommit @param {string | null} checkpointCommit @param {string} head */
function runEvidence(runId, branch, worktree, artifactPath, baseCommit, checkpointCommit, head) {
  return {
    id: runId,
    branch,
    worktree,
    artifactPath,
    rootWriter: true,
    workerCount: 0,
    baseCommit,
    checkpointCommit,
    head,
  };
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value */
function isSafeBranchName(value) {
  return isNonEmptyString(value) && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) && !value.includes("..");
}

/** @param {unknown} value @returns {value is string} */
function isSafeLeasedPath(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const segments = value.split("/");
  return (
    value === value.replaceAll("\\", "/") &&
    !path.posix.isAbsolute(value) &&
    !/^[A-Za-z]:/u.test(value) &&
    value !== "." &&
    path.posix.normalize(value) === value &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    segments[0] !== ".engineering" &&
    segments[0] !== ".git" &&
    !/[\u0000-\u001f]/u.test(value)
  );
}

/** @param {unknown} value @returns {value is string} */
function isSafeEvidenceId(value) {
  return (
    isNonEmptyString(value) &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/u.test(value) &&
    !/(?:api[_-]?key|password|secret|token)/iu.test(value)
  );
}

/**
 * @param {string} file
 * @returns {Promise<any>}
 */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function main(args = process.argv.slice(2)) {
  let requestPath;
  let smoke = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--smoke" && !smoke && !requestPath) {
      smoke = true;
      continue;
    }
    if (argument === "--run-request" && !smoke && !requestPath && args[index + 1]) {
      requestPath = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown Project Runtime argument: ${args.slice(index).join(" ")}`);
  }
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(runtimeDirectory, "..", "..");
  const report = await runEngineeringRun(target, requestPath ? { requestPath } : undefined);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "BLOCKED" ? 1 : 0;
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
