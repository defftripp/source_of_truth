#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateAdoptionMatrix,
  validateRuntimeManifest,
  sha256,
  verifyFileChecksums,
} from "./contracts.mjs";
import { classifyTaskProfile } from "./mode-policy.mjs";
import {
  deepAdvisorEvidence,
  validateDeepPlanContract,
  validateDeepResearchContract,
} from "./deep-contracts.mjs";
import { evaluateDeepParallelEligibility } from "./parallel-eligibility.mjs";
import {
  createCorrectiveTickets,
  validateImmutableReviewArtifacts,
  validateIndependentReview,
  validateReviewReleaseEvidence,
} from "./review-contracts.mjs";

const PROJECT_STATE_PATH = ".engineering/state/project.json";
const REGISTRY_PATH = ".engineering/verification/registry.json";
const OUTPUT_LIMIT = 1024 * 1024;
const INSTRUMENTAL_ROLES = Object.freeze(["test", "typecheck", "build", "observed-behavior"]);
const RUN_ARTIFACT_FILES = new Set([
  "advisor.json",
  "context-packet.json",
  "corrective-work.json",
  "domain-decisions.json",
  "domain-model.json",
  "human-gate.json",
  "manifest-approval.json",
  "migration-contract.json",
  "migration-manifest.json",
  "parallel-execution.json",
  "quality-review.json",
  "remote-sync.json",
  "research.json",
  "rollback-plan.json",
  "result.json",
  "spec-lite.json",
  "spec-review.json",
  "state.json",
  "task-profile.json",
  "ticket.json",
  "ticket-graph.json",
  "verification.json",
]);
const STANDARD_CHECKPOINT_ARTIFACT_FILES = Object.freeze([
  "advisor.json",
  "context-packet.json",
  "research.json",
  "spec-lite.json",
  "state.json",
  "task-profile.json",
  "ticket-graph.json",
  "ticket.json",
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
/**
 * @param {string} targetInput
 * @param {{ requestPath?: string, humanAnswers?: Record<string, string> }} [options]
 */
export async function runEngineeringRun(targetInput, options = {}) {
  const target = path.resolve(targetInput);
  const prepared = await validatePreparedRuntime(target);
  if (!options.requestPath) {
    return prepared.report;
  }
  const request = await readRunRequest(target, options.requestPath, options.humanAnswers);
  if (request.classification.selectedMode === "FAST") {
    return runFastTask(target, prepared, request);
  }
  if (
    request.classification.selectedMode === "STANDARD" &&
    "standard" in request &&
    request.standard
  ) {
    return runStandardTask(target, prepared, request);
  }
  if (
    request.classification.selectedMode === "DEEP" &&
    "deep" in request &&
    request.deep
  ) {
    return runStandardTask(target, prepared, request);
  }
  return reportModeSelection(target, prepared, request);
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

/** @param {string} target @param {string} requestPath @param {Record<string, string> | undefined} humanAnswers */
async function readRunRequest(target, requestPath, humanAnswers) {
  if (typeof requestPath !== "string" || requestPath.trim().length === 0) {
    throw new Error("Run request path must be a non-empty Target Project path.");
  }
  const absolute = path.resolve(target, requestPath);
  const relative = path.relative(target, absolute);
  if (path.isAbsolute(requestPath) || relative === "" || relative.startsWith(`..${path.sep}`) || relative === "..") {
    throw new Error("Run request must stay within the Target Project.");
  }
  const request = await readJson(absolute);
  return validateRunRequest(humanAnswers === undefined ? request : { ...request, humanAnswers });
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
  const classification = classifyTaskProfile(request.task, request.rootEscalation);
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
  validateRemoteCheckpointSyncSetting(request.settings);
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
  const plannedExecution =
    (classification.selectedMode === "STANDARD" && request.standard) ||
    (classification.selectedMode === "DEEP" && request.deep);
  const commandFields =
    plannedExecution
      ? [
          "research",
          "planner",
          "advisor",
          "worker",
          "ticketVerification",
          "specReview",
          "qualityReview",
        ]
      : ["implementation", "focusedCheck", "qualityReview"];
  for (const field of commandFields) {
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
  if (classification.selectedMode === "STANDARD" && request.standard) {
    validateStandardRequest(request);
  }
  if (classification.selectedMode === "DEEP" && request.deep) {
    validateStandardRequest({ ...request, humanAnswers: undefined, standard: request.deep });
    if (
      !Array.isArray(request.deep.requiredEvidenceIds) ||
      request.deep.requiredEvidenceIds.length === 0
    ) {
      throw new Error("DEEP request requires high-risk evidence before planning.");
    }
    validateDeepManifestAnswer(request.humanAnswers);
  }
  return { ...request, classification };
}

/** @param {Record<string, any>} request */
function validateStandardRequest(request) {
  const standard = request.standard;
  if (!standard || typeof standard !== "object") {
    throw new Error("STANDARD request must include its spec-lite contract.");
  }
  if (
    !Array.isArray(standard.acceptanceCriteria) ||
    standard.acceptanceCriteria.length === 0 ||
    !Array.isArray(standard.testingSeams) ||
    standard.testingSeams.length === 0 ||
    !Array.isArray(standard.contextPaths) ||
    standard.contextPaths.length === 0
  ) {
    throw new Error("STANDARD spec-lite requires acceptance criteria, testing seams, and context paths.");
  }
  const acceptanceIds = new Set();
  for (const criterion of standard.acceptanceCriteria) {
    if (
      !criterion ||
      !isSafeEvidenceId(criterion.id) ||
      !isNonEmptyString(criterion.statement) ||
      !Array.isArray(criterion.verificationIds) ||
      criterion.verificationIds.length === 0 ||
      !criterion.verificationIds.every(isSafeEvidenceId) ||
      acceptanceIds.has(criterion.id)
    ) {
      throw new Error("STANDARD acceptance criteria must be unique, falsifiable, and verification-mapped.");
    }
    acceptanceIds.add(criterion.id);
  }
  const seamIds = new Set();
  for (const seam of standard.testingSeams) {
    if (
      !seam ||
      !isSafeEvidenceId(seam.id) ||
      !isNonEmptyString(seam.interface) ||
      !Array.isArray(seam.verificationIds) ||
      seam.verificationIds.length === 0 ||
      !seam.verificationIds.every(isSafeEvidenceId) ||
      seamIds.has(seam.id)
    ) {
      throw new Error("STANDARD testing seams must identify unique public verification boundaries.");
    }
    seamIds.add(seam.id);
  }
  if (
    !standard.contextPaths.every(isSafeLeasedPath) ||
    new Set(standard.contextPaths).size !== standard.contextPaths.length
  ) {
    throw new Error("STANDARD context paths must be unique canonical Application Core paths.");
  }
  validateStandardDecision(request.standard.decision, request.humanAnswers);
}

/** @param {unknown} decisionValue @param {unknown} humanAnswersValue */
function validateStandardDecision(decisionValue, humanAnswersValue) {
  if (decisionValue === undefined) {
    if (humanAnswersValue !== undefined) {
      throw new Error("humanAnswers require a STANDARD decision contract.");
    }
    return;
  }
  if (!decisionValue || typeof decisionValue !== "object" || Array.isArray(decisionValue)) {
    throw new Error("STANDARD decision must be an object.");
  }
  const decision = /** @type {Record<string, any>} */ (decisionValue);
  const allowedKeys = [
    "alternatives",
    "context",
    "id",
    "question",
    "recommendation",
    "reversibility",
    "surprising",
  ];
  if (Object.keys(decision).some((key) => !allowedKeys.includes(key))) {
    throw new Error("STANDARD decision contains an unsupported field.");
  }
  const recommendation = decision.recommendation;
  const alternatives = decision.alternatives;
  if (
    !isSafeEvidenceId(decision.id) ||
    !isSingleLineText(decision.question, 240) ||
    !isDecisionOption(recommendation) ||
    !Array.isArray(alternatives) ||
    alternatives.length === 0 ||
    !alternatives.every(isDecisionOption) ||
    !["EASY", "HARD"].includes(decision.reversibility) ||
    typeof decision.surprising !== "boolean"
  ) {
    throw new Error("STANDARD decision requires one question, a recommendation, consequences, and reversibility evidence.");
  }
  const answers = [recommendation.answer, ...alternatives.map((option) => option.answer)];
  if (new Set(answers).size !== answers.length) {
    throw new Error("STANDARD decision answers must be unique.");
  }
  if (
    !decision.context ||
    typeof decision.context !== "object" ||
    Array.isArray(decision.context) ||
    !isSingleLineText(decision.context.term, 120) ||
    !decision.context.definitions ||
    typeof decision.context.definitions !== "object" ||
    Array.isArray(decision.context.definitions) ||
    JSON.stringify(Object.keys(decision.context.definitions).sort()) !== JSON.stringify([...answers].sort()) ||
    !Object.values(decision.context.definitions).every((definition) => isSingleLineText(definition, 240))
  ) {
    throw new Error("STANDARD decision must map every answer to one durable context definition.");
  }
  if (humanAnswersValue === undefined) {
    return;
  }
  if (!humanAnswersValue || typeof humanAnswersValue !== "object" || Array.isArray(humanAnswersValue)) {
    throw new Error("humanAnswers must be an object when provided.");
  }
  const humanAnswers = /** @type {Record<string, any>} */ (humanAnswersValue);
  if (
    JSON.stringify(Object.keys(humanAnswers)) !== JSON.stringify([decision.id]) ||
    !answers.includes(humanAnswers[decision.id])
  ) {
    throw new Error("humanAnswers must answer the active STANDARD decision with an offered answer.");
  }
}

/** @param {unknown} value */
function isDecisionOption(value) {
  const option = /** @type {Record<string, any>} */ (value);
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(option).sort()) === JSON.stringify(["answer", "consequence"]) &&
    isSingleLineText(option.answer, 120) &&
    isSingleLineText(option.consequence, 240),
  );
}

/** @param {unknown} value @param {number} maximum */
function isSingleLineText(value, maximum) {
  return isNonEmptyString(value) && value.length <= maximum && !/[\r\n]/u.test(value);
}

/** @param {Record<string, any>} request */
export function standardRequestBindingHash(request) {
  const { classification: _classification, humanAnswers: _humanAnswers, ...immutableRequest } = request;
  return sha256(JSON.stringify(immutableRequest));
}

/** @param {string} target @param {{ registry: any, report: any }} prepared @param {Record<string, any>} request */
async function runFastTask(target, prepared, request) {
  const integrationBranch = request.repository.integrationBranch;
  const stableBranch = request.repository.stableBranch;
  const repository = await inspectRepository(target, integrationBranch, stableBranch);
  const commands = resolveRunCommands(prepared.registry, request.commands);
  const taskProfile = buildTaskProfile(prepared, request, repository);
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
    requestWriteLease: request.writeLease,
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

/** @param {string} target @param {{ registry: any, report: any }} prepared @param {Record<string, any>} request */
async function runStandardTask(target, prepared, request) {
  const mode = request.classification.selectedMode;
  const plannedRequest = mode === "DEEP" ? request.deep : request.standard;
  const branchMode = mode.toLowerCase();
  const repository = await inspectRepository(
    target,
    request.repository.integrationBranch,
    request.repository.stableBranch,
  );
  const commands = resolveStandardCommands(prepared.registry, request.commands);
  const taskProfile = buildTaskProfile(prepared, request, repository);
  const worktreeRoot = `${target}.engineering-worktrees`;
  const requestHash = standardRequestBindingHash(request);
  let resumable = await findResumableStandardRun(
    worktreeRoot,
    requestHash,
    repository.integrationHead,
    mode,
  );
  let restoredFromRemote = false;
  if (mode === "STANDARD" && !resumable && request.settings?.remoteCheckpointSync?.enabled === true) {
    restoredFromRemote = await restoreRemoteStandardRun(
      target,
      worktreeRoot,
      requestHash,
      repository.integrationHead,
      request.settings.remoteCheckpointSync.remote,
      request.writeLease,
    );
    if (restoredFromRemote) {
      resumable = await findResumableStandardRun(
        worktreeRoot,
        requestHash,
        repository.integrationHead,
        mode,
      );
      if (!resumable) {
        throw new Error("Fetched STANDARD Run Branch could not be restored from durable state.");
      }
    }
  }
  const runId = resumable?.runId ?? createRunId();
  const branch = resumable?.branch ?? `run/${branchMode}/${runId}`;
  const worktree = path.join(worktreeRoot, runId);
  const artifactPath = `.engineering/runs/${runId}`;
  const artifactRoot = path.join(worktree, ...artifactPath.split("/"));
  /** @type {{ sequence: number, state: string, status: string }[]} */
  const stateHistory = resumable?.state.history ?? [];
  /** @type {Record<string, any>} */
  const verification = resumable?.verification ?? { schemaVersion: 1, checks: [] };
  const artifacts = /** @type {Record<string, any>} */ (resumable?.artifacts ?? {});
  const checkpointCommits = resumable?.graph ? checkpointCommitsInExecutionOrder(resumable.graph) : [];
  const resumeDecisionGate = resumable?.phase === "DECISION_GATE";
  const resumeManifestGate = resumable?.phase === "MANIFEST_GATE";
  const resumeApprovalCheckpoint = resumable?.phase === "APPROVAL_CHECKPOINT";
  let research;
  let specLite;
  let planned;
  let deepPlan;
  /** @type {Record<string, any>} */
  let ticketGraph;
  let advisor;
  await mkdir(worktreeRoot, { recursive: true });
  const commandGuard = await createGitCommandGuard(worktreeRoot, runId, target);
  const context = /** @type {Record<string, any>} */ ({
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
    requestWriteLease: request.writeLease,
    commandGuard,
    artifacts,
    mode,
    workerCount: resumable?.graph?.tickets.reduce(
      (/** @type {number} */ total, /** @type {any} */ ticket) => total + ticket.attempts,
      0,
    ) ?? 0,
    checkpointCommits,
    blocker: blockStandardRun,
    requestHash,
    parallelWorkerRoots: [],
    remoteSync: mode === "STANDARD"
      ? resumeRemoteSyncState(request, branch, resumable, checkpointCommits)
      : { schemaVersion: 1, enabled: false, branch },
  });
  if (restoredFromRemote && context.remoteSync.enabled) {
    context.remoteSync.status = "PASS";
    context.remoteSync.restoredFromRemote = true;
    context.remoteSync.resume = {
      status: "PASS",
      remoteHead: await remoteBranchHead(worktree, context.remoteSync.remote, branch),
    };
    artifacts["remote-sync.json"] = context.remoteSync;
  }

  try {
    if (resumeDecisionGate || resumeManifestGate) {
      await git(worktree, ["reset", "--hard", "HEAD"]);
      await git(worktree, ["clean", "-fd"]);
      await initializeCommandGuard(commandGuard, worktree, repository, branch);
      await mkdir(artifactRoot, { recursive: true });
      transitionState(stateHistory, "RESUMED");
      if (resumeDecisionGate) {
        research = artifacts["research.json"];
        const answeredGate = await recordStandardDecision(context, request, artifacts["human-gate.json"]);
        artifacts["human-gate.json"] = answeredGate;
      }
    }
    if (!resumable) {
    transitionState(stateHistory, "CLASSIFIED");
    await git(target, ["worktree", "add", "-b", branch, worktree, repository.integrationHead]);
    await initializeCommandGuard(commandGuard, worktree, repository, branch);
    transitionState(stateHistory, "ISOLATED");
    await mkdir(artifactRoot, { recursive: true });
    await writeJson(path.join(artifactRoot, "task-profile.json"), taskProfile);
    await writeRunState(
      artifactRoot,
      runId,
      branch,
      repository.integrationHead,
      stateHistory,
      false,
      mode,
    );

    transitionState(stateHistory, "REPOSITORY_RESEARCH");
    const researchExecution = await executeReadOnlyRunCommand(context, commands.research);
    if (researchExecution.blocked) {
      return researchExecution.blocked;
    }
    if (researchExecution.result.exitCode !== 0) {
      return blockStandardAfterCommand(context, "REPOSITORY_RESEARCH", commands.research, researchExecution.result);
    }
    try {
      research = parseResearch(researchExecution.result.stdout);
    } catch {
      return blockStandardSchema(context, "REPOSITORY_RESEARCH", commands.research.id);
    }
    artifacts["research.json"] = research;
    await writeJson(path.join(artifactRoot, "research.json"), research);

    if (mode === "DEEP") {
      transitionState(stateHistory, "DOMAIN_MODELING");
      const deepResearch = validateDeepResearchContract(research, plannedRequest);
      if (!deepResearch.valid) {
        return blockStandardSchema(context, "DOMAIN_MODELING", "high-risk-evidence");
      }
      artifacts["domain-model.json"] = {
        schemaVersion: 1,
        boundaries: research.domainModel.boundaries,
      };
      await writeJson(path.join(artifactRoot, "domain-model.json"), artifacts["domain-model.json"]);
      transitionState(stateHistory, "DECISION_RECORDING");
      const deepDecisionPaths = await recordDeepDomainDecisions(
        worktree,
        research.domainModel.decisions,
      );
      artifacts["domain-decisions.json"] = {
        schemaVersion: 1,
        decisions: research.domainModel.decisions,
        contextPaths: deepDecisionPaths,
      };
      await writeJson(
        path.join(artifactRoot, "domain-decisions.json"),
        artifacts["domain-decisions.json"],
      );
    }

    if (mode === "STANDARD" && plannedRequest.decision) {
      if (researchAnswersDecision(research, plannedRequest.decision)) {
        return blockStandardSchema(context, "DECISION_GATE", "question-audit");
      }
      const humanGate = createDecisionHumanGate(
        plannedRequest.decision,
        requestHash,
        research.facts.map((/** @type {any} */ fact) => fact.id),
      );
      artifacts["human-gate.json"] = humanGate;
      return persistStandardHumanGate(context, humanGate, {}, true);
    }
    }

    if (!resumable || resumeDecisionGate) {
    transitionState(stateHistory, mode === "DEEP" ? "SPECIFICATION" : "SPEC_LITE");
    specLite = {
      schemaVersion: 1,
      taskSummary: request.task.summary,
      evidenceBackedFacts: research.facts.map((/** @type {any} */ fact) => fact.id),
      acceptanceCriteria: plannedRequest.acceptanceCriteria,
      testingSeams: plannedRequest.testingSeams,
    };
    artifacts["spec-lite.json"] = specLite;
    await writeJson(path.join(artifactRoot, "spec-lite.json"), specLite);

    transitionState(stateHistory, "TICKET_PLANNING");
    const plannerExecution = await executeReadOnlyRunCommand(context, commands.planner);
    if (plannerExecution.blocked) {
      return plannerExecution.blocked;
    }
    if (plannerExecution.result.exitCode !== 0) {
      return blockStandardAfterCommand(context, "TICKET_PLANNING", commands.planner, plannerExecution.result);
    }
    try {
      planned = parseExecutionPlan(
        plannerExecution.result.stdout,
        mode === "DEEP" ? { ...request, standard: plannedRequest } : request,
        commands,
      );
    } catch {
      return blockStandardSchema(context, "TICKET_PLANNING", "acceptance-coverage");
    }
    ticketGraph = /** @type {Record<string, any>} */ ({
      schemaVersion: 1,
      runId,
      branch,
      baseCommit: repository.integrationHead,
      requestHash,
      decisionCommit: context.decisionCommit ?? null,
      executionOrder: [],
      reviewRounds: [],
      tickets: planned.tickets.map((ticket) => ({
        ...ticket,
        status: "OPEN",
        attempts: 0,
        verification: null,
        checkpointCommit: null,
        checkpointedAt: null,
      })),
    });
    artifacts["ticket-graph.json"] = ticketGraph;
    await writeJson(path.join(artifactRoot, "ticket-graph.json"), ticketGraph);

    if (mode === "DEEP") {
      try {
        deepPlan = parseJsonOutput(plannerExecution.result.stdout, "DEEP Planner");
      } catch {
        return blockStandardSchema(context, "TICKET_PLANNING", "deep-plan-contract");
      }
      transitionState(stateHistory, "MIGRATION_CONTRACT");
      transitionState(stateHistory, "ROLLBACK_PLAN");
      transitionState(stateHistory, "MANIFEST_APPROVAL");
      const proposedApproval = {
        schemaVersion: 1,
        manifestHash: deepPlan.migrationManifest?.hash,
        approved: true,
      };
      const deepPlanResult = validateDeepPlanContract(
        deepPlan,
        proposedApproval,
        {
          writeLease: request.writeLease,
          domainBoundaryIds: research.domainModel.boundaries.map(
            (/** @type {any} */ boundary) => boundary.id,
          ),
        },
      );
      if (!deepPlanResult.valid) {
        artifacts["advisor.json"] = {
          schemaVersion: 1,
          status: "REVISE",
          ticketIds: planned.tickets.map((ticket) => ticket.id),
          evidence: [],
          concerns: deepPlanResult.errors,
        };
        return blockStandardSchema(context, "MANIFEST_APPROVAL", "manifest-approval");
      }
      artifacts["migration-contract.json"] = deepPlan.migrationContract;
      artifacts["rollback-plan.json"] = deepPlan.rollbackPlan;
      artifacts["migration-manifest.json"] = deepPlan.migrationManifest;
      await Promise.all([
        writeJson(path.join(artifactRoot, "migration-contract.json"), deepPlan.migrationContract),
        writeJson(path.join(artifactRoot, "rollback-plan.json"), deepPlan.rollbackPlan),
        writeJson(path.join(artifactRoot, "migration-manifest.json"), deepPlan.migrationManifest),
      ]);
      const manifestGate = createMigrationManifestHumanGate(
        requestHash,
        plannedRequest.requiredEvidenceIds,
        deepPlan.migrationManifest,
      );
      artifacts["human-gate.json"] = manifestGate;
      return persistStandardHumanGate(context, manifestGate, { migrationManifest: deepPlan.migrationManifest }, true);
    }

    transitionState(stateHistory, "ADVISOR_GATE");
    const expectedAdvisorEvidence = [
      ...advisorEvidence(planned),
      ...(mode === "DEEP"
        ? deepAdvisorEvidence(
            /** @type {Record<string, any>} */ (/** @type {unknown} */ (deepPlan)),
            artifacts["manifest-approval.json"].manifestHash,
          )
        : []),
    ].sort();
    const advisorExecution = await executeReadOnlyRunCommand(context, commands.advisor, {
      ENGINEERING_ADVISOR_EVIDENCE: JSON.stringify(expectedAdvisorEvidence),
      ENGINEERING_ADVISOR_TICKETS: JSON.stringify(planned.tickets.map((ticket) => ticket.id)),
    });
    if (advisorExecution.blocked) {
      return advisorExecution.blocked;
    }
    if (advisorExecution.result.exitCode !== 0) {
      return blockStandardAfterCommand(context, "ADVISOR_GATE", commands.advisor, advisorExecution.result);
    }
    try {
      advisor = parseAdvisor(
        advisorExecution.result.stdout,
        planned.tickets.map((ticket) => ticket.id),
        expectedAdvisorEvidence,
      );
    } catch {
      return blockStandardSchema(context, "ADVISOR_GATE", "advisor-approval");
    }
    artifacts["advisor.json"] = advisor;
    await writeJson(path.join(artifactRoot, "advisor.json"), advisor);
    } else {
      await git(worktree, ["reset", "--hard", "HEAD"]);
      await git(worktree, ["clean", "-fd"]);
      await initializeCommandGuard(commandGuard, worktree, repository, branch);
      if (!resumeManifestGate) {
        transitionState(stateHistory, "RESUMED");
      }
      ticketGraph = resumable.graph;
      for (const ticket of ticketGraph.tickets) {
        if (ticket.status === "IN_PROGRESS") {
          ticket.status = "OPEN";
        }
      }
      specLite = artifacts["spec-lite.json"];
      ticketGraph.reviewRounds ??= [];
      const plannedTickets = ticketGraph.tickets.filter(
        (/** @type {any} */ ticket) => !ticket.sourceFinding,
      );
      planned = parseExecutionPlan(
        JSON.stringify({
          schemaVersion: 1,
          tickets: plannedTickets.map(ticketContract),
        }),
        mode === "DEEP" ? { ...request, standard: plannedRequest } : request,
        commands,
      );
      if (mode === "DEEP") {
        deepPlan = {
          schemaVersion: 1,
          domainBoundaryIds: artifacts["domain-model.json"].boundaries.map(
            (/** @type {any} */ boundary) => boundary.id,
          ),
          tickets: plannedTickets.map(ticketContract),
          migrationContract: artifacts["migration-contract.json"],
          rollbackPlan: artifacts["rollback-plan.json"],
          migrationManifest: artifacts["migration-manifest.json"],
        };
        if (resumeManifestGate) {
          artifacts["manifest-approval.json"] = await recordDeepManifestApproval(
            context,
            request,
            artifacts["human-gate.json"],
            deepPlan.migrationManifest,
          );
          ticketGraph.decisionCommit = context.decisionCommit;
          artifacts["ticket-graph.json"] = ticketGraph;
        }
        const deepPlanResult = validateDeepPlanContract(
          deepPlan,
          artifacts["manifest-approval.json"],
          {
            writeLease: request.writeLease,
            domainBoundaryIds: artifacts["domain-model.json"].boundaries.map(
              (/** @type {any} */ boundary) => boundary.id,
            ),
          },
        );
        if (!deepPlanResult.valid) {
          return blockStandardSchema(context, "RESUMED", "deep-plan-contract");
        }
      }
      validateDurableExecutionOrder(ticketGraph);
      const expectedAdvisorEvidence = [
        ...advisorEvidence(planned),
        ...(mode === "DEEP"
          ? deepAdvisorEvidence(
              /** @type {Record<string, any>} */ (deepPlan),
              artifacts["manifest-approval.json"].manifestHash,
            )
          : []),
      ].sort();
      if (resumeManifestGate || resumeApprovalCheckpoint) {
        transitionState(stateHistory, "ADVISOR_GATE");
        const advisorExecution = await executeReadOnlyRunCommand(context, commands.advisor, {
          ENGINEERING_ADVISOR_EVIDENCE: JSON.stringify(expectedAdvisorEvidence),
          ENGINEERING_ADVISOR_TICKETS: JSON.stringify(planned.tickets.map((ticket) => ticket.id)),
        });
        if (advisorExecution.blocked) {
          return advisorExecution.blocked;
        }
        if (advisorExecution.result.exitCode !== 0) {
          return blockStandardAfterCommand(context, "ADVISOR_GATE", commands.advisor, advisorExecution.result);
        }
        try {
          advisor = parseAdvisor(
            advisorExecution.result.stdout,
            planned.tickets.map((ticket) => ticket.id),
            expectedAdvisorEvidence,
          );
        } catch {
          return blockStandardSchema(context, "ADVISOR_GATE", "advisor-approval");
        }
        artifacts["advisor.json"] = advisor;
      } else {
        advisor = parseAdvisor(
          JSON.stringify(artifacts["advisor.json"]),
          planned.tickets.map((ticket) => ticket.id),
          expectedAdvisorEvidence,
        );
      }
      artifacts["ticket-graph.json"] = ticketGraph;
      await mkdir(artifactRoot, { recursive: true });
      await Promise.all([
        ...Object.entries(artifacts).map(([name, value]) =>
          writeJson(path.join(artifactRoot, name), value),
        ),
        writeJson(path.join(artifactRoot, "task-profile.json"), taskProfile),
        writeJson(path.join(artifactRoot, "verification.json"), verification),
        writeRunState(
          artifactRoot,
          runId,
          branch,
          repository.integrationHead,
          stateHistory,
          false,
          mode,
        ),
      ]);
    }

    if (resumable && context.remoteSync.enabled && context.checkpointCommits.length > 0) {
      const resumedCheckpointSync = await synchronizeRunHead(
        context,
        context.checkpointCommits.at(-1),
        "CHECKPOINT",
      );
      if ("humanGate" in resumedCheckpointSync) {
        return resumedCheckpointSync.humanGate;
      }
    }

    const parallelExecution = mode === "DEEP"
      ? artifacts["parallel-execution.json"] ?? { schemaVersion: 1, batches: [] }
      : null;
    if (parallelExecution) {
      artifacts["parallel-execution.json"] = parallelExecution;
    }
    /** @type {Map<string, Record<string, any>>} */
    const pendingParallelResults = new Map();
    /** @type {Record<string, any> | null} */
    let activeExecutionBatch = null;
    let specReview;
    let qualityReview;

    reviewLifecycle:
    while (true) {
    while (ticketGraph.tickets.some((/** @type {any} */ ticket) => ticket.status !== "COMPLETE")) {
      const frontier = selectDeterministicFrontier(
        ticketGraph.tickets,
        new Set(
          ticketGraph.tickets
            .filter((/** @type {any} */ ticket) => ticket.status === "COMPLETE")
            .map((/** @type {any} */ ticket) => ticket.id),
        ),
      );
      if (frontier.length === 0) {
        return blockStandardSchema(context, "IMPLEMENTING", "ticket-frontier");
      }
      if (mode === "DEEP" && pendingParallelResults.size === 0) {
        const candidateClaims = frontier.map((candidate) => ({
          ticketId: candidate.id,
          writeLease: candidate.writeLease,
          contractIds: candidate.contractIds ?? [],
          worktree: path.join(worktreeRoot, `${runId}-workers`, candidate.id),
        }));
        const eligibility = evaluateDeepParallelEligibility(candidateClaims);
        activeExecutionBatch = {
          id: `BATCH-${parallelExecution.batches.length + 1}`,
          execution: eligibility.execution,
          candidateTicketIds: frontier.map((candidate) => candidate.id),
          ticketIds: eligibility.eligible
            ? frontier.map((candidate) => candidate.id)
            : [frontier[0].id],
          reasons: eligibility.reasons,
          workers: [],
          integrations: [],
        };
        parallelExecution.batches.push(activeExecutionBatch);
        if (eligibility.eligible) {
          for (const candidate of frontier) {
            candidate.status = "IN_PROGRESS";
            candidate.attempts += 1;
          }
          context.workerCount += frontier.length;
          const parallelBatch = await executeParallelWorkerBatch(
            context,
            commands,
            frontier,
            request,
            specLite,
            restoredFromRemote,
            candidateClaims,
            activeExecutionBatch,
          );
          if (parallelBatch.failure) {
            return blockCorrectiveWorkerResult(
              context,
              frontier.map((candidate) => candidate.id),
              parallelBatch.failure.checkId,
              parallelBatch.failure.detail,
            );
          }
          const batchPreflight = await validateParallelResultsAgainstAcceptedState(
            context,
            parallelBatch.results,
          );
          if (!batchPreflight.valid) {
            for (const workerResult of parallelBatch.results) {
              await restorePathsToCommit(
                worktree,
                workerResult.baseCommit,
                workerResult.ticket.writeLease,
              );
            }
            return blockCorrectiveWorkerResult(
              context,
              frontier.map((candidate) => candidate.id),
              batchPreflight.checkId ?? "worker-result-divergence",
              batchPreflight.detail ?? "Parallel batch diverged before Root acceptance.",
            );
          }
          for (const result of parallelBatch.results) {
            if (!result) {
              return blockCorrectiveWorkerResult(
                context,
                frontier.map((candidate) => candidate.id),
                "worker-result-conflict",
                "Parallel Worker batch omitted a declared result.",
              );
            }
            pendingParallelResults.set(result.ticket.id, result);
          }
        }
      }
      const ticket = frontier[0];
      const parallelResult = pendingParallelResults.get(ticket.id);
      if (!parallelResult) {
        ticket.status = "IN_PROGRESS";
        ticket.attempts += 1;
        context.workerCount += 1;
      }
      context.writeLease = ticket.writeLease;
      const ticketArtifact = {
        schemaVersion: 1,
        id: ticket.id,
        objective: ticket.objective,
        acceptanceCriteria: ticket.acceptanceCriteria,
        verificationIds: ticket.verificationIds,
        dependencies: ticket.dependencies,
        writeLease: ticket.writeLease,
        ...(ticket.contractIds ? { contractIds: ticket.contractIds } : {}),
        ...(ticket.sourceFinding ? { sourceFinding: ticket.sourceFinding } : {}),
        contextPaths: ticket.contextPaths,
      };
      artifacts["ticket.json"] = ticketArtifact;
      const contextPacket = createWorkerContextPacket(
        ticket,
        request,
        specLite,
        restoredFromRemote,
        parallelResult?.worktree ?? worktree,
      );
      artifacts["context-packet.json"] = contextPacket;
      const contextPacketPath = path.join(artifactRoot, "context-packet.json");
      await Promise.all([
        writeJson(path.join(artifactRoot, "ticket.json"), ticketArtifact),
        writeJson(path.join(artifactRoot, "ticket-graph.json"), ticketGraph),
        writeJson(contextPacketPath, contextPacket),
        writeRunState(
          artifactRoot,
          runId,
          branch,
          repository.integrationHead,
          stateHistory,
          false,
          mode,
        ),
      ]);

      transitionState(stateHistory, "IMPLEMENTING");
      const ticketBase = await git(worktree, ["rev-parse", "HEAD"]);
      const preWorkerChanges = new Map(
        (await workingTreeFingerprint(worktree, ticketBase)).map((entry) => [entry.path, entry.hash]),
      );
      let workerExecution;
      if (parallelResult) {
        const integration = await integrateIsolatedWorkerResult(context, parallelResult);
        if (!integration.valid) {
          await restorePathsToCommit(worktree, ticketBase, ticket.writeLease);
          return blockCorrectiveWorkerResult(
            context,
            [ticket.id],
            integration.checkId ?? "worker-result-conflict",
            integration.detail ?? `Worker result ${ticket.id} could not be accepted.`,
          );
        }
        workerExecution = { result: parallelResult.commandResult, blocked: null };
      } else {
        const startedAtEpochMs = Date.now();
        workerExecution = await executeRunCommand(context, commands.worker, undefined, {
          ENGINEERING_CONTEXT_PACKET: contextPacketPath,
          ENGINEERING_TICKET_VERIFICATION: JSON.stringify(commands.ticketVerification.command),
          ENGINEERING_WORKER_MAY_COMMIT: "0",
          ENGINEERING_WORKER_MAY_SPAWN_SUBAGENTS: "0",
        });
        const endedAtEpochMs = Date.now();
        if (activeExecutionBatch) {
          activeExecutionBatch.workers.push({
            ticketId: ticket.id,
            worktree,
            startedAtEpochMs,
            endedAtEpochMs,
            status: workerExecution.blocked || workerExecution.result.exitCode !== 0
              ? "BLOCKED"
              : "COMPLETE",
          });
        }
      }
      if (workerExecution.blocked) {
        if (mode === "DEEP") {
          await restorePathsToCommit(worktree, ticketBase, ticket.writeLease);
          return blockCorrectiveWorkerResult(
            context,
            [ticket.id],
            workerExecution.blocked.failure?.checkId ?? "worker-authority",
            "Worker attempted a forbidden commit or integration action.",
          );
        }
        return workerExecution.blocked;
      }
      if (workerExecution.result.exitCode !== 0) {
        return blockStandardAfterCommand(
          context,
          "IMPLEMENTING",
          commands.worker,
          workerExecution.result,
        );
      }
      let workerVerification;
      try {
        workerVerification = parseWorkerVerification(
          workerExecution.result.stdout,
          commands.ticketVerification.id,
        );
      } catch {
        return blockStandardSchema(context, "IMPLEMENTING", "worker-contract");
      }
      verification.checks.push({
        ...workerVerification,
        ticketId: ticket.id,
        attempt: ticket.attempts,
        phase: "WORKER_SELF_CHECK",
        sequence: verification.checks.length + 1,
      });
      const workerChanges = (await workingTreeFingerprint(worktree, ticketBase))
        .filter((entry) => preWorkerChanges.get(entry.path) !== entry.hash)
        .map((entry) => entry.path);
      const workerScopeLeak = workerChanges.find(
        (changedPath) =>
          !ticket.writeLease.includes(changedPath) && !changedPath.startsWith(`${artifactPath}/`),
      );
      if (workerScopeLeak) {
        if (mode === "DEEP") {
          await restorePathsToCommit(
            worktree,
            ticketBase,
            workerChanges.filter((changedPath) => !changedPath.startsWith(`${artifactPath}/`)),
          );
          return blockCorrectiveWorkerResult(
            context,
            [ticket.id],
            "worker-result-conflict",
            `Worker result escaped its Write Lease at ${workerScopeLeak}.`,
          );
        }
        return blockStandardSchema(context, "IMPLEMENTING", "write-lease");
      }
      if (!workerChanges.some((changedPath) => ticket.writeLease.includes(changedPath))) {
        return blockStandardSchema(context, "IMPLEMENTING", "vertical-ticket-change");
      }

      transitionState(stateHistory, "TICKET_VERIFICATION");
      const ticketExecution = await executeRunCommand(
        context,
        commands.ticketVerification,
        undefined,
        { ENGINEERING_CONTEXT_PACKET: contextPacketPath },
      );
      if (ticketExecution.blocked) {
        return ticketExecution.blocked;
      }
      const pendingPreflight = await validateParallelResultsAgainstAcceptedState(
        context,
        [...pendingParallelResults.values()].filter(
          (result) => result.ticket.id !== ticket.id,
        ),
      );
      if (!pendingPreflight.valid) {
        await restorePathsToCommit(worktree, ticketBase, ticket.writeLease);
        for (const pendingResult of pendingParallelResults.values()) {
          if (pendingResult.ticket.id !== ticket.id) {
            await restorePathsToCommit(
              worktree,
              pendingResult.baseCommit,
              pendingResult.ticket.writeLease,
            );
          }
        }
        return blockCorrectiveWorkerResult(
          context,
          [...pendingParallelResults.keys()],
          pendingPreflight.checkId ?? "worker-result-divergence",
          pendingPreflight.detail ?? "Pending Worker result diverged before checkpoint.",
        );
      }
      const ticketEvidence = {
        ...commandEvidence(commands.ticketVerification, ticketExecution.result),
        ticketId: ticket.id,
        attempt: ticket.attempts,
        phase: "TARGETED_VERIFICATION",
        sequence: verification.checks.length + 1,
        verifiedAtEpochSeconds: Math.floor(Date.now() / 1000),
        observedLease: await leaseFingerprint(worktree, ticket.writeLease),
      };
      verification.checks.push(ticketEvidence);
      ticket.verification = ticketEvidence;
      await writeJson(path.join(artifactRoot, "verification.json"), verification);
      if (ticketExecution.result.exitCode !== 0) {
        return blockStandardAfterCommand(
          context,
          "TICKET_VERIFICATION",
          commands.ticketVerification,
          ticketExecution.result,
        );
      }
      if (
        JSON.stringify(ticketEvidence.observedLease) !==
        JSON.stringify(await leaseFingerprint(worktree, ticket.writeLease))
      ) {
        return blockStandardSchema(context, "TICKET_VERIFICATION", "verification-freshness");
      }

      transitionState(stateHistory, "CHECKPOINT");
      const checkpointIntegration = activeExecutionBatch
        ? {
            sequence: ticketGraph.executionOrder.length + 1,
            ticketId: ticket.id,
            targetedVerificationId: commands.ticketVerification.id,
            targetedVerificationStatus: ticketEvidence.status,
            checkpointCommit: null,
            state: "CHECKPOINT_PENDING",
          }
        : null;
      if (activeExecutionBatch && checkpointIntegration) {
        activeExecutionBatch.integrations.push(checkpointIntegration);
      }
      const checkpointArtifacts = {
        ...artifacts,
        "state.json": runStateArtifact(
          runId,
          branch,
          repository.integrationHead,
          stateHistory,
          false,
          mode,
        ),
        "task-profile.json": taskProfile,
        "ticket-graph.json": ticketGraph,
        "verification.json": verification,
      };
      await Promise.all(
        Object.entries(checkpointArtifacts).map(([name, value]) =>
          writeJson(path.join(artifactRoot, name), value),
        ),
      );
      await validateRunArtifacts(artifactRoot, checkpointArtifacts);
      await git(worktree, ["add", "--all"]);
      await validateGitArtifacts(worktree, "index", artifactPath, checkpointArtifacts);
      await validateLeasedIndex(worktree, ticket.writeLease);
      const checkpointTree = await git(worktree, ["write-tree"]);
      if (
        process.env.NODE_ENV === "test" &&
        process.env.ENGINEERING_TEST_FAIL_BEFORE_CHECKPOINT_COMMIT === ticket.id
      ) {
        throw new Error(`Test fault before checkpoint commit for ${ticket.id}.`);
      }
      await git(worktree, [
        "-c",
        `core.hooksPath=${commandGuard.emptyHooks}`,
        "commit",
        "-m",
        `feat: complete ${mode} ticket ${ticket.id} (${runId})`,
      ]);
      const checkpointCommit = await git(worktree, ["rev-parse", "HEAD"]);
      await validateCommittedTree(worktree, checkpointCommit, checkpointTree);
      await validateGitArtifacts(worktree, checkpointCommit, artifactPath, checkpointArtifacts);
      if (
        process.env.NODE_ENV === "test" &&
        process.env.ENGINEERING_TEST_FAIL_AFTER_CHECKPOINT_COMMIT === ticket.id
      ) {
        throw new Error(`Test fault after checkpoint commit for ${ticket.id}.`);
      }
      ticket.status = "COMPLETE";
      ticket.checkpointCommit = checkpointCommit;
      ticket.checkpointedAt = await git(worktree, ["show", "-s", "--format=%cI", checkpointCommit]);
      ticketGraph.executionOrder.push(ticket.id);
      context.checkpointCommits.push(checkpointCommit);
      if (activeExecutionBatch && checkpointIntegration) {
        checkpointIntegration.checkpointCommit = checkpointCommit;
        checkpointIntegration.state = "CHECKPOINTED";
        pendingParallelResults.delete(ticket.id);
        if (pendingParallelResults.size === 0) {
          await cleanupParallelWorkerRoots(context);
          activeExecutionBatch = null;
        }
      }
      artifacts["ticket-graph.json"] = ticketGraph;
      await Promise.all([
        writeJson(path.join(artifactRoot, "ticket-graph.json"), ticketGraph),
        ...(parallelExecution
          ? [writeJson(path.join(artifactRoot, "parallel-execution.json"), parallelExecution)]
          : []),
        writeRunState(
          artifactRoot,
          runId,
          branch,
          repository.integrationHead,
          stateHistory,
          false,
          mode,
        ),
      ]);
      const checkpointSync = await synchronizeRunHead(context, checkpointCommit, "CHECKPOINT");
      if ("humanGate" in checkpointSync) {
        return checkpointSync.humanGate;
      }
    }

    const immutableReviews = await reviewArtifactIntegrity(context, ticketGraph.reviewRounds);
    if (!immutableReviews.valid) {
      return blockStandardSchema(context, "SPEC_REVIEW", "review-artifact-immutability");
    }
    const reviewRound = ticketGraph.reviewRounds.length + 1;
    transitionState(stateHistory, "SPEC_REVIEW");
    const specRequirements = plannedRequest.acceptanceCriteria.map(
      (/** @type {any} */ criterion) => criterion.id,
    );
    const specReviewPacket = await createReviewPacket(
      context,
      "SPEC_REVIEWER",
      specRequirements,
      reviewRound,
    );
    const specReviewExecution = await executeReadOnlyRunCommand(context, commands.specReview, {
      ENGINEERING_REVIEW_PACKET: specReviewPacket.path,
    });
    if (specReviewExecution.blocked) {
      return specReviewExecution.blocked;
    }
    if (specReviewExecution.result.exitCode !== 0) {
      return blockStandardAfterCommand(context, "SPEC_REVIEW", commands.specReview, specReviewExecution.result);
    }
    try {
      specReview = parseIndependentReview(
        specReviewExecution.result.stdout,
        {
          role: "SPEC_REVIEWER",
          packetHash: specReviewPacket.hash,
          requirements: specRequirements,
          writeLease: request.writeLease,
          contextPaths: plannedRequest.contextPaths,
          verificationIds: [
            commands.ticketVerification.id,
            ...commands.relevantChecks.map((command) => command.id),
          ],
          ticketVerificationId: commands.ticketVerification.id,
          codeFingerprint: specReviewPacket.codeFingerprint,
          reviewRound,
        },
      );
    } catch {
      return blockStandardSchema(context, "SPEC_REVIEW", "spec-review-schema");
    }
    const specReviewArtifact = reviewArtifactName("spec", reviewRound);
    artifacts[specReviewArtifact] = specReview;
    await writeJson(path.join(artifactRoot, specReviewArtifact), specReview);

    transitionState(stateHistory, "QUALITY_REVIEW");
    const qualityRequirements = [
      "write-lease",
      "worker-contract",
      "verification-freshness",
      ...(mode === "DEEP" ? ["parallel-eligibility", "root-integration"] : []),
    ];
    const qualityReviewPacket = await createReviewPacket(
      context,
      "QUALITY_REVIEWER",
      qualityRequirements,
      reviewRound,
    );
    const qualityReviewExecution = await executeReadOnlyRunCommand(context, commands.qualityReview, {
      ENGINEERING_REVIEW_PACKET: qualityReviewPacket.path,
    });
    if (qualityReviewExecution.blocked) {
      return qualityReviewExecution.blocked;
    }
    if (qualityReviewExecution.result.exitCode !== 0) {
      return blockStandardAfterCommand(
        context,
        "QUALITY_REVIEW",
        commands.qualityReview,
        qualityReviewExecution.result,
      );
    }
    try {
      qualityReview = parseIndependentReview(
        qualityReviewExecution.result.stdout,
        {
          role: "QUALITY_REVIEWER",
          packetHash: qualityReviewPacket.hash,
          requirements: qualityRequirements,
          writeLease: request.writeLease,
          contextPaths: plannedRequest.contextPaths,
          verificationIds: [
            commands.ticketVerification.id,
            ...commands.relevantChecks.map((command) => command.id),
          ],
          ticketVerificationId: commands.ticketVerification.id,
          codeFingerprint: qualityReviewPacket.codeFingerprint,
          reviewRound,
        },
      );
    } catch {
      return blockStandardSchema(context, "QUALITY_REVIEW", "quality-review-schema");
    }
    const qualityReviewArtifact = reviewArtifactName("quality", reviewRound);
    artifacts[qualityReviewArtifact] = qualityReview;
    await writeJson(path.join(artifactRoot, qualityReviewArtifact), qualityReview);

    let corrections;
    try {
      corrections = createCorrectiveTickets({
        round: reviewRound,
        reviews: [
          { artifact: specReviewArtifact, review: specReview },
          { artifact: qualityReviewArtifact, review: qualityReview },
        ],
        existingTicketIds: ticketGraph.tickets.map((/** @type {any} */ ticket) => ticket.id),
      });
    } catch {
      return blockStandardSchema(context, "QUALITY_REVIEW", "review-finding-contract");
    }
    const reviewArtifacts = await Promise.all(
      [specReviewArtifact, qualityReviewArtifact].map(async (name) => ({
        name,
        sha256: sha256(await readFile(path.join(artifactRoot, name))),
      })),
    );
    ticketGraph.reviewRounds.push({
      round: reviewRound,
      codeFingerprint: specReview.context.codeFingerprint,
      artifacts: reviewArtifacts,
      reviews: {
        spec: {
          status: specReview.status,
          codeFingerprint: specReview.context.codeFingerprint,
        },
        quality: {
          status: qualityReview.status,
          codeFingerprint: qualityReview.context.codeFingerprint,
        },
      },
      findings: corrections.links,
    });
    if (corrections.tickets.length > 0) {
      ticketGraph.tickets.push(...corrections.tickets);
      const correctiveWork = artifacts["corrective-work.json"] ?? {
        schemaVersion: 1,
        kind: "REVIEW_CORRECTIONS",
        status: "ACTIVE",
        rounds: [],
      };
      correctiveWork.status = "ACTIVE";
      correctiveWork.rounds.push({
        reviewRound,
        sourceArtifacts: [specReviewArtifact, qualityReviewArtifact],
        links: corrections.links,
      });
      artifacts["corrective-work.json"] = correctiveWork;
      artifacts["ticket-graph.json"] = ticketGraph;
      await Promise.all([
        writeJson(path.join(artifactRoot, "corrective-work.json"), correctiveWork),
        writeJson(path.join(artifactRoot, "ticket-graph.json"), ticketGraph),
      ]);
      continue reviewLifecycle;
    }
    if (artifacts["corrective-work.json"]?.kind === "REVIEW_CORRECTIONS") {
      artifacts["corrective-work.json"].status = "COMPLETE";
      artifacts["corrective-work.json"].completedAfterReviewRound = reviewRound;
      await writeJson(
        path.join(artifactRoot, "corrective-work.json"),
        artifacts["corrective-work.json"],
      );
    }
    artifacts["ticket-graph.json"] = ticketGraph;
    await writeJson(path.join(artifactRoot, "ticket-graph.json"), ticketGraph);
    break reviewLifecycle;
    }

    transitionState(stateHistory, "FULL_VERIFICATION");
    const verificationCodeFingerprint = await applicationCodeFingerprint(context);
    verification.fullRelevant = {
      status: "RUNNING",
      codeFingerprint: verificationCodeFingerprint,
      afterExecutionCount: ticketGraph.executionOrder.length,
      startedAtEpochMs: Date.now(),
      checkIds: commands.relevantChecks.map((command) => command.id),
    };
    if (parallelExecution) {
      parallelExecution.fullVerification = {
        afterIntegrationCount: ticketGraph.executionOrder.length,
        startedAtEpochMs: Date.now(),
        checkIds: commands.relevantChecks.map((command) => command.id),
        status: "RUNNING",
      };
    }
    for (const command of commands.relevantChecks) {
      const execution = await executeRunCommand(context, command, qualityReview);
      if (execution.blocked) {
        return execution.blocked;
      }
      verification.checks.push({
        ...commandEvidence(command, execution.result),
        phase: "FULL_VERIFICATION",
        sequence: verification.checks.length + 1,
      });
      await writeJson(path.join(artifactRoot, "verification.json"), verification);
      if (execution.result.exitCode !== 0) {
        return blockStandardAfterCommand(context, "FULL_VERIFICATION", command, execution.result);
      }
    }
    const currentCodeFingerprint = await applicationCodeFingerprint(context);
    if (currentCodeFingerprint !== verificationCodeFingerprint) {
      verification.fullRelevant.status = "STALE";
      verification.fullRelevant.endedAtEpochMs = Date.now();
      await writeJson(path.join(artifactRoot, "verification.json"), verification);
      return blockStandardSchema(
        context,
        "FULL_VERIFICATION",
        "full-verification-freshness",
      );
    }
    verification.fullRelevant.status = "PASS";
    verification.fullRelevant.endedAtEpochMs = Date.now();
    await writeJson(path.join(artifactRoot, "verification.json"), verification);
    if (parallelExecution) {
      parallelExecution.fullVerification.status = "PASS";
      parallelExecution.fullVerification.endedAtEpochMs = Date.now();
    }
    for (const ticket of ticketGraph.tickets) {
      const executionIndex = ticketGraph.executionOrder.indexOf(ticket.id);
      const supersededPaths = new Set(
        ticketGraph.executionOrder
          .slice(executionIndex + 1)
          .flatMap((/** @type {string} */ ticketId) =>
            ticketGraph.tickets.find((/** @type {any} */ candidate) => candidate.id === ticketId)
              ?.writeLease ?? []
          ),
      );
      const observedLease = (ticket.verification?.observedLease ?? []).filter(
        (/** @type {{ path: string }} */ entry) => !supersededPaths.has(entry.path),
      );
      const currentLease = (await leaseFingerprint(worktree, ticket.writeLease)).filter(
        (entry) => !supersededPaths.has(entry.path),
      );
      if (
        JSON.stringify(observedLease) !== JSON.stringify(currentLease)
      ) {
        return blockStandardSchema(context, "FULL_VERIFICATION", "verification-freshness");
      }
    }
    const immutableFinalReviews = await reviewArtifactIntegrity(context, ticketGraph.reviewRounds);
    if (!immutableFinalReviews.valid) {
      return blockStandardSchema(
        context,
        "FULL_VERIFICATION",
        "review-artifact-immutability",
      );
    }
    const releaseEvidence = validateReviewReleaseEvidence({
      reviewRounds: ticketGraph.reviewRounds,
      tickets: ticketGraph.tickets,
      currentCodeFingerprint,
      fullVerification: verification.fullRelevant,
      executionCount: ticketGraph.executionOrder.length,
    });
    if (!releaseEvidence.valid) {
      const checkId = releaseEvidence.errors.some((error) => /Review|review/u.test(error))
        ? "review-freshness"
        : "full-verification-freshness";
      return blockStandardSchema(context, "FULL_VERIFICATION", checkId);
    }

    const implementationChanges = await changedPaths(worktree, repository.integrationHead);
    const decisionPaths = new Set([
      ...decisionControlledPaths(artifacts["human-gate.json"]),
      ...deepDecisionControlledPaths(artifacts["domain-decisions.json"]),
    ]);
    const unauthorizedPath = implementationChanges.find(
      (changedPath) =>
        !request.writeLease.includes(changedPath) &&
        !decisionPaths.has(changedPath) &&
        !changedPath.startsWith(`${artifactPath}/`),
    );
    if (unauthorizedPath) {
      return blockStandardSchema(context, "ARTIFACT_VALIDATION", "write-lease");
    }
    if (!implementationChanges.some((changedPath) => request.writeLease.includes(changedPath))) {
      throw new Error(`${mode} Worker produced no Application Core change.`);
    }

    const checkpointArtifacts = {
      ...artifacts,
      "state.json": runStateArtifact(
        runId,
        branch,
        repository.integrationHead,
        stateHistory,
        false,
        mode,
      ),
      "task-profile.json": taskProfile,
      "verification.json": verification,
    };
    const checkpointCommit = context.checkpointCommits.at(-1);
    if (!checkpointCommit) {
      throw new Error(`${mode} graph completed without a checkpoint commit.`);
    }

    const readyStateHistory = [...stateHistory];
    transitionState(readyStateHistory, "READY_FOR_HUMAN");
    const resultArtifact = {
      schemaVersion: 1,
      status: "READY_FOR_HUMAN",
      terminal: true,
      accepted: false,
      releaseStateReached: true,
      mode,
      branch,
      baseCommit: repository.integrationHead,
      checkpointCommit,
      checkpointCommits: context.checkpointCommits,
      aggregateDiff: durableAggregateDiff(
        await aggregateDiff(worktree, repository.integrationHead, checkpointCommit),
      ),
    };
    const terminalArtifacts = {
      ...checkpointArtifacts,
      "state.json": runStateArtifact(
        runId,
        branch,
        repository.integrationHead,
        readyStateHistory,
        true,
        mode,
      ),
      "result.json": resultArtifact,
    };
    await Promise.all(
      Object.entries(terminalArtifacts).map(([name, value]) =>
        writeJson(path.join(artifactRoot, name), value),
      ),
    );
    await validateRunArtifacts(artifactRoot, terminalArtifacts);
    await git(worktree, ["add", "--all"]);
    await validateGitArtifacts(worktree, "index", artifactPath, terminalArtifacts);
    await validateLeasedIndex(worktree, request.writeLease);
    const terminalTree = await git(worktree, ["write-tree"]);
    await git(worktree, [
      "-c",
      `core.hooksPath=${commandGuard.emptyHooks}`,
      "commit",
      "-m",
      `chore: record ${mode} run readiness (${runId})`,
    ]);
    const head = await git(worktree, ["rev-parse", "HEAD"]);
    await validateCommittedTree(worktree, head, terminalTree);
    await validateGitArtifacts(worktree, head, artifactPath, terminalArtifacts);
    const terminalSync = await synchronizeRunHead(context, head, "READY_FOR_HUMAN");
    if ("humanGate" in terminalSync) {
      return terminalSync.humanGate;
    }
    transitionState(stateHistory, "READY_FOR_HUMAN");
    await assertProtectedBranches(target, repository);
    return {
      schemaVersion: 1,
      status: "READY_FOR_HUMAN",
      terminal: true,
      accepted: false,
      releaseStateReached: true,
      taskProfile,
      stateHistory,
      coverage: planned.coverage,
      executionOrder: ticketGraph.executionOrder,
      advisor,
      specReview,
      qualityReview,
      verification,
      ...(mode === "DEEP" ? { migrationManifest: artifacts["migration-manifest.json"] } : {}),
      ...(context.remoteSync.enabled ? { remoteSync: context.remoteSync } : {}),
      run: runEvidence(
        runId,
        branch,
        worktree,
        artifactPath,
        repository.integrationHead,
        checkpointCommit,
        head,
        context.workerCount,
        context.checkpointCommits,
      ),
      aggregateDiff: await aggregateDiff(worktree, repository.integrationHead, head),
    };
  } finally {
    try {
      await cleanupParallelWorkerRoots(context);
    } finally {
      await cleanupCommandGuard(commandGuard);
    }
  }
}

/**
 * @param {Record<string, any>} ticket
 * @param {Record<string, any>} request
 * @param {Record<string, any>} specLite
 * @param {boolean} restoredFromRemote
 * @param {string} workerWorktree
 */
function createWorkerContextPacket(ticket, request, specLite, restoredFromRemote, workerWorktree) {
  return {
    schemaVersion: 1,
    ticketId: ticket.id,
    attempt: ticket.attempts,
    taskSummary: request.task.summary,
    factIds: specLite.evidenceBackedFacts,
    acceptanceCriteria: ticket.acceptanceCriteria,
    verificationIds: ticket.verificationIds,
    contextPaths: ticket.contextPaths,
    writeLease: ticket.writeLease,
    ...(ticket.contractIds ? { contractIds: ticket.contractIds } : {}),
    ...(ticket.sourceFinding ? { sourceFinding: ticket.sourceFinding } : {}),
    workerWorktree,
    resumedFromRemote: restoredFromRemote,
    rootWriter: false,
    workerMayCommit: false,
    workerMaySpawnSubagents: false,
  };
}

/**
 * @param {Record<string, any>} context
 * @param {Record<string, any>} commands
 * @param {Record<string, any>[]} tickets
 * @param {Record<string, any>} request
 * @param {Record<string, any>} specLite
 * @param {boolean} restoredFromRemote
 * @param {Record<string, any>[]} claims
 * @param {Record<string, any>} batch
 * @returns {Promise<any>}
 */
async function executeParallelWorkerBatch(
  context,
  commands,
  tickets,
  request,
  specLite,
  restoredFromRemote,
  claims,
  batch,
) {
  const ticketBase = await git(context.worktree, ["rev-parse", "HEAD"]);
  const executions = [];
  for (const ticket of tickets) {
    const claim = claims.find((candidate) => candidate.ticketId === ticket.id);
    if (!claim) {
      return {
        results: [],
        failure: { checkId: "parallel-eligibility", detail: `Missing Worker claim for ${ticket.id}.` },
      };
    }
    await mkdir(path.dirname(claim.worktree), { recursive: true });
    await removeWorkerWorktree(context.target, claim.worktree);
    await git(context.target, ["worktree", "add", "--detach", claim.worktree, ticketBase]);
    context.parallelWorkerRoots.push(claim.worktree);
    const guard = await createGitCommandGuard(
      path.dirname(path.dirname(claim.worktree)),
      `w-${context.runId.slice(-8)}-${ticket.id}`,
      context.target,
    );
    await initializeCommandGuard(guard, claim.worktree, context.repository, context.branch);
    const packet = createWorkerContextPacket(
      ticket,
      request,
      specLite,
      restoredFromRemote,
      claim.worktree,
    );
    const packetPath = path.join(guard.root, "context-packet.json");
    await writeJson(packetPath, packet);
    const baseLease = await leaseFingerprint(claim.worktree, ticket.writeLease);
    executions.push((async () => {
      const startedAtEpochMs = Date.now();
      try {
        const workerContext = {
          ...context,
          worktree: claim.worktree,
          commandGuard: guard,
          blocker: async (/** @type {Record<string, any>} */ blockedContext) => ({
            failure: blockedContext.failure,
          }),
        };
        const execution = await executeRunCommand(workerContext, commands.worker, undefined, {
          ENGINEERING_CONTEXT_PACKET: packetPath,
          ENGINEERING_TICKET_VERIFICATION: JSON.stringify(commands.ticketVerification.command),
          ENGINEERING_WORKER_MAY_COMMIT: "0",
          ENGINEERING_WORKER_MAY_SPAWN_SUBAGENTS: "0",
        });
        const endedAtEpochMs = Date.now();
        const timeline = {
          ticketId: ticket.id,
          worktree: claim.worktree,
          startedAtEpochMs,
          endedAtEpochMs,
          status: "COMPLETE",
        };
        if (execution.blocked) {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: execution.blocked.failure?.checkId ?? "worker-authority",
              detail: `Worker ${ticket.id} attempted a forbidden commit or integration action.`,
            },
          };
        }
        if (execution.result.exitCode !== 0) {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: commands.worker.id,
              detail: `Worker ${ticket.id} exited with ${execution.result.exitCode}.`,
            },
          };
        }
        try {
          parseWorkerVerification(execution.result.stdout, commands.ticketVerification.id);
        } catch {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: "worker-contract",
              detail: `Worker ${ticket.id} returned an invalid result contract.`,
            },
          };
        }
        const workerHead = await git(claim.worktree, ["rev-parse", "HEAD"]);
        if (workerHead !== ticketBase) {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: "worker-authority",
              detail: `Worker ${ticket.id} changed its Git HEAD.`,
            },
          };
        }
        const changedPaths = (await workingTreeFingerprint(claim.worktree, ticketBase))
          .map((entry) => entry.path);
        const escapedPath = changedPaths.find(
          (changedPath) => !ticket.writeLease.includes(changedPath),
        );
        if (escapedPath) {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: "worker-result-conflict",
              detail: `Worker ${ticket.id} escaped its Write Lease at ${escapedPath}.`,
            },
          };
        }
        if (!changedPaths.some((changedPath) => ticket.writeLease.includes(changedPath))) {
          timeline.status = "BLOCKED";
          return {
            timeline,
            failure: {
              checkId: "vertical-ticket-change",
              detail: `Worker ${ticket.id} produced no leased change.`,
            },
          };
        }
        return {
          timeline,
          result: {
            ticket,
            worktree: claim.worktree,
            baseCommit: ticketBase,
            baseLease,
            changedPaths,
            resultLease: await leaseFingerprint(claim.worktree, ticket.writeLease),
            commandResult: execution.result,
          },
        };
      } finally {
        await cleanupCommandGuard(guard);
      }
    })());
  }
  const settled = await Promise.all(executions);
  batch.workers = settled.map((entry) => entry.timeline).sort(
    (left, right) => compareEvidenceIds(left.ticketId, right.ticketId),
  );
  const failed = settled.find((entry) => entry.failure);
  if (failed) {
    return { results: [], failure: failed.failure };
  }
  /** @type {Record<string, any>[]} */
  const results = [];
  for (const entry of settled) {
    if (entry.result) {
      results.push(entry.result);
    }
  }
  results.sort((left, right) => compareEvidenceIds(left.ticket.id, right.ticket.id));
  return { results, failure: null };
}

/** @param {Record<string, any>} context @param {Record<string, any>[]} workerResults */
async function validateParallelResultsAgainstAcceptedState(context, workerResults) {
  for (const workerResult of workerResults) {
    const acceptedLease = await leaseFingerprint(
      context.worktree,
      workerResult.ticket.writeLease,
    );
    if (JSON.stringify(acceptedLease) !== JSON.stringify(workerResult.baseLease)) {
      return {
        valid: false,
        checkId: "worker-result-divergence",
        detail: `Accepted integration state diverged before batch acceptance of ${workerResult.ticket.id}.`,
      };
    }
  }
  return { valid: true, checkId: null, detail: null };
}

/** @param {Record<string, any>} context @param {Record<string, any>} workerResult */
async function integrateIsolatedWorkerResult(context, workerResult) {
  const acceptedLease = await leaseFingerprint(context.worktree, workerResult.ticket.writeLease);
  if (JSON.stringify(acceptedLease) !== JSON.stringify(workerResult.baseLease)) {
    return {
      valid: false,
      checkId: "worker-result-divergence",
      detail: `Accepted integration state diverged before ${workerResult.ticket.id}.`,
    };
  }
  try {
    for (const projectPath of workerResult.changedPaths) {
      const source = path.join(workerResult.worktree, ...projectPath.split("/"));
      const destination = path.join(context.worktree, ...projectPath.split("/"));
      const content = await tryReadBuffer(source);
      if (content === null) {
        await rm(destination, { force: true });
      } else {
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
    }
  } catch {
    await restorePathsToCommit(
      context.worktree,
      workerResult.baseCommit,
      workerResult.changedPaths,
    );
    return {
      valid: false,
      checkId: "worker-result-conflict",
      detail: `Worker result ${workerResult.ticket.id} could not be integrated exactly.`,
    };
  }
  const integratedLease = await leaseFingerprint(context.worktree, workerResult.ticket.writeLease);
  if (JSON.stringify(integratedLease) !== JSON.stringify(workerResult.resultLease)) {
    await restorePathsToCommit(
      context.worktree,
      workerResult.baseCommit,
      workerResult.changedPaths,
    );
    return {
      valid: false,
      checkId: "worker-result-conflict",
      detail: `Worker result ${workerResult.ticket.id} changed during Root integration.`,
    };
  }
  return { valid: true, checkId: null, detail: null };
}

/**
 * @param {Record<string, any>} context
 * @param {string[]} ticketIds
 * @param {string} checkId
 * @param {string} detail
 */
async function blockCorrectiveWorkerResult(context, ticketIds, checkId, detail) {
  const acceptedHead = await git(context.worktree, ["rev-parse", "HEAD"]);
  context.artifacts["corrective-work.json"] = {
    schemaVersion: 1,
    kind: "CORRECTIVE_WORK",
    status: "BLOCKED",
    sourceTicketIds: [...ticketIds].sort(compareEvidenceIds),
    reason: { checkId, detail },
    silentMerge: false,
    acceptedIntegration: {
      head: acceptedHead,
      changed: false,
    },
  };
  return blockStandardSchema(context, "IMPLEMENTING", checkId);
}

/** @param {string} worktree @param {string} commit @param {string[]} projectPaths */
async function restorePathsToCommit(worktree, commit, projectPaths) {
  if (projectPaths.length === 0) {
    return;
  }
  for (const projectPath of projectPaths) {
    const destination = resolveSafeProjectPath(worktree, projectPath);
    const trackedAtBaseline =
      await tryGit(worktree, ["cat-file", "-e", `${commit}:${projectPath}`]) !== null;
    if (trackedAtBaseline) {
      await git(
        worktree,
        ["restore", "--source", commit, "--staged", "--worktree", "--", projectPath],
      );
    } else {
      await tryGit(worktree, ["rm", "--cached", "--ignore-unmatch", "--", projectPath]);
      await rm(destination, { recursive: true, force: true });
    }
  }
}

/** @param {Record<string, any>} context */
async function cleanupParallelWorkerRoots(context) {
  const roots = Array.isArray(context?.parallelWorkerRoots)
    ? [...context.parallelWorkerRoots].reverse()
    : [];
  for (const workerRoot of roots) {
    await removeWorkerWorktree(context.target, workerRoot);
  }
  if (Array.isArray(context?.parallelWorkerRoots)) {
    context.parallelWorkerRoots.length = 0;
  }
}

/** @param {string} target @param {string} workerRoot */
async function removeWorkerWorktree(target, workerRoot) {
  assertWorkerRoot(target, workerRoot);
  await tryGit(target, ["worktree", "remove", "--force", workerRoot]);
  if (await pathExists(workerRoot)) {
    await rm(workerRoot, { recursive: true, force: true });
    await tryGit(target, ["worktree", "remove", "--force", workerRoot]);
  }
  const normalized = normalizedFilesystemPath(workerRoot);
  const registered = (await git(target, ["worktree", "list", "--porcelain"]))
    .split(/\r?\n/u)
    .filter((/** @type {string} */ line) => line.startsWith("worktree "))
    .map((/** @type {string} */ line) =>
      normalizedFilesystemPath(line.slice("worktree ".length))
    );
  if (registered.includes(normalized)) {
    throw new Error(`Isolated Worker worktree could not be removed: ${workerRoot}.`);
  }
}

/** @param {string} target @param {string} workerRoot */
function assertWorkerRoot(target, workerRoot) {
  const worktreeRoot = path.resolve(`${target}.engineering-worktrees`);
  const resolved = path.resolve(workerRoot);
  const relative = path.relative(worktreeRoot, resolved);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refused unsafe Worker worktree cleanup outside ${worktreeRoot}.`);
  }
}

/** @param {string} worktree @param {string} projectPath */
function resolveSafeProjectPath(worktree, projectPath) {
  if (!isSafeLeasedPath(projectPath)) {
    throw new Error(`Refused unsafe project path recovery: ${projectPath}.`);
  }
  const resolved = path.resolve(worktree, ...projectPath.split("/"));
  const relative = path.relative(path.resolve(worktree), resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Refused project path recovery outside the worktree: ${projectPath}.`);
  }
  return resolved;
}

/** @param {string} value */
function normalizedFilesystemPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** @param {string} value */
async function pathExists(value) {
  try {
    await lstat(value);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** @param {string} file */
async function tryReadBuffer(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** @param {string} target @param {{ registry: any, report: any }} prepared @param {Record<string, any>} request */
async function reportModeSelection(target, prepared, request) {
  const repository = await inspectRepository(
    target,
    request.repository.integrationBranch,
    request.repository.stableBranch,
  );
  return {
    schemaVersion: 1,
    status: "MODE_SELECTED",
    terminal: false,
    accepted: false,
    taskProfile: buildTaskProfile(prepared, request, repository),
  };
}

/** @param {{ report: any }} prepared @param {Record<string, any>} request @param {Record<string, any>} repository */
function buildTaskProfile(prepared, request, repository) {
  const integrationBranch = request.repository.integrationBranch;
  const stableBranch = request.repository.stableBranch;
  const evidence = request.classification.taskEvidence;
  return {
    ...request.classification,
    rationale: request.classification.rootEscalation
      ? request.classification.rationale
      : `Prepared clean repository evidence and a ${evidence.risk.toLowerCase()}-risk ${evidence.scope.toLowerCase()} Task Profile select ${request.classification.selectedMode}.`,
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

/** @param {Record<string, any>} context @param {string} stage @param {Record<string, any>} command @param {{ exitCode: number }} result */
async function blockStandardAfterCommand(context, stage, command, result) {
  return blockStandardRun({ ...context, failure: commandFailure(stage, command, result) });
}

/** @param {Record<string, any>} context @param {string} stage @param {string} checkId */
async function blockStandardSchema(context, stage, checkId) {
  return blockStandardRun({
    ...context,
    failure: { stage, checkId, role: "schema", exitCode: 1 },
  });
}

/** @param {Record<string, any>} context */
async function blockStandardRun(context) {
  const mode = context.mode ?? "STANDARD";
  transitionState(context.stateHistory, "BLOCKED");
  const stateArtifact = runStateArtifact(
    context.runId,
    context.branch,
    context.repository.integrationHead,
    context.stateHistory,
    true,
    mode,
  );
  const resultArtifact = {
    schemaVersion: 1,
    status: "BLOCKED",
    terminal: true,
    accepted: false,
    releaseStateReached: false,
    mode,
    branch: context.branch,
    baseCommit: context.repository.integrationHead,
    failure: context.failure,
  };
  const expectedArtifacts = {
    ...context.artifacts,
    "result.json": resultArtifact,
    "state.json": stateArtifact,
    "task-profile.json": context.taskProfile,
    "verification.json": context.verification,
  };
  await removeUnexpectedRunArtifacts(context.artifactRoot, new Set(Object.keys(expectedArtifacts)));
  await Promise.all(
    Object.entries(expectedArtifacts).map(([name, value]) =>
      writeJson(path.join(context.artifactRoot, name), value),
    ),
  );
  await validateRunArtifacts(context.artifactRoot, expectedArtifacts);
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
    verification: context.verification,
    failure: context.failure,
    run: runEvidence(
      context.runId,
      context.branch,
      context.worktree,
      context.artifactPath,
      context.repository.integrationHead,
      context.checkpointCommits?.at(-1) ?? null,
      head,
      context.workerCount ?? 0,
      context.checkpointCommits ?? [],
    ),
  };
}

/** @param {Record<string, any>} research @param {Record<string, any>} decision */
function researchAnswersDecision(research, decision) {
  const normalizedQuestion = normalizeAuditText(decision.question);
  return research.facts.some(
    (/** @type {any} */ fact) =>
      fact.answersDecisionQuestions?.includes(decision.id) ||
      normalizeAuditText(fact.statement) === normalizedQuestion,
  );
}

/** @param {unknown} value */
function normalizeAuditText(value) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim()
    : "";
}

/** @param {Record<string, any>} decision @param {string} requestHash @param {string[]} researchFactIds */
function createDecisionHumanGate(decision, requestHash, researchFactIds) {
  return createStandardHumanGate({
    id: decision.id,
    kind: "DECISION",
    requestHash,
    createdFromState: "REPOSITORY_RESEARCH",
    researchFactIds,
    question: {
      prompt: decision.question,
      recommendation: decision.recommendation,
      alternatives: decision.alternatives,
    },
  });
}

/** @param {{ id: string, kind: string, requestHash: string, createdFromState: string, researchFactIds: string[], question: Record<string, any>, extra?: Record<string, any> }} input */
function createStandardHumanGate(input) {
  return {
    schemaVersion: 1,
    id: input.id,
    kind: input.kind,
    status: "WAITING",
    requestHash: input.requestHash,
    createdFromState: input.createdFromState,
    researchFactIds: input.researchFactIds,
    question: input.question,
    answer: null,
    contextPaths: [],
    ...(input.extra ?? {}),
  };
}

/** @param {Record<string, any>} context @param {Record<string, any>} humanGate @param {Record<string, any>} [reportExtras] @param {boolean} [checkpoint] @returns {Promise<any>} */
async function persistStandardHumanGate(context, humanGate, reportExtras = {}, checkpoint = false) {
  transitionState(context.stateHistory, "HUMAN_GATE");
  const stateArtifact = runStateArtifact(
    context.runId,
    context.branch,
    context.repository.integrationHead,
    context.stateHistory,
    false,
    context.mode,
  );
  const resultArtifact = {
    schemaVersion: 1,
    status: "HUMAN_GATE",
    terminal: false,
    accepted: false,
    releaseStateReached: false,
    mode: context.mode,
    branch: context.branch,
    baseCommit: context.repository.integrationHead,
    humanGate,
    ...reportExtras,
  };
  const expectedArtifacts = {
    ...context.artifacts,
    "human-gate.json": humanGate,
    "result.json": resultArtifact,
    "state.json": stateArtifact,
    "task-profile.json": context.taskProfile,
    "verification.json": context.verification,
  };
  await removeUnexpectedRunArtifacts(context.artifactRoot, new Set(Object.keys(expectedArtifacts)));
  await Promise.all(
    Object.entries(expectedArtifacts).map(([name, value]) =>
      writeJson(path.join(context.artifactRoot, name), value),
    ),
  );
  await validateRunArtifacts(context.artifactRoot, expectedArtifacts);
  let head = await git(context.worktree, ["rev-parse", "HEAD"]);
  if (checkpoint) {
    const controlledPaths = context.mode === "DEEP"
      ? deepDecisionControlledPaths(context.artifacts["domain-decisions.json"])
      : [];
    await git(context.worktree, ["add", "--", ...controlledPaths, context.artifactPath]);
    await validateGitArtifacts(context.worktree, "index", context.artifactPath, expectedArtifacts);
    const gateTree = await git(context.worktree, ["write-tree"]);
    await git(context.worktree, [
      "-c",
      `core.hooksPath=${context.commandGuard.emptyHooks}`,
      "commit",
      "-m",
      `chore: record ${context.mode} Human Gate ${humanGate.id} (${context.runId})`,
    ]);
    head = await git(context.worktree, ["rev-parse", "HEAD"]);
    await validateCommittedTree(context.worktree, head, gateTree);
    await validateGitArtifacts(context.worktree, head, context.artifactPath, expectedArtifacts);
    const gateSync = /** @type {any} */ (await synchronizeRunHead(context, head, "HUMAN_GATE"));
    if ("humanGate" in gateSync) {
      return gateSync.humanGate;
    }
  }
  await assertProtectedBranches(context.target, context.repository);
  return {
    schemaVersion: 1,
    status: "HUMAN_GATE",
    terminal: false,
    accepted: false,
    releaseStateReached: false,
    taskProfile: context.taskProfile,
    stateHistory: context.stateHistory,
    verification: context.verification,
    humanGate,
    ...reportExtras,
    run: runEvidence(
      context.runId,
      context.branch,
      context.worktree,
      context.artifactPath,
      context.repository.integrationHead,
      context.checkpointCommits?.at(-1) ?? null,
      head,
      context.workerCount ?? 0,
      context.checkpointCommits ?? [],
    ),
  };
}

/** @param {Record<string, any>} context @param {Record<string, any>} request @param {Record<string, any>} gate */
async function recordStandardDecision(context, request, gate) {
  const decision = request.standard.decision;
  const answer = request.humanAnswers?.[decision.id];
  if (
    gate?.kind !== "DECISION" ||
    gate.id !== decision.id ||
    gate.status !== "WAITING" ||
    gate.requestHash !== standardRequestBindingHash(request) ||
    !isNonEmptyString(answer)
  ) {
    throw new Error("Durable STANDARD decision gate does not match its human answer or request binding.");
  }
  const contextPath = ".engineering/CONTEXT.md";
  const absoluteContextPath = path.join(context.worktree, ...contextPath.split("/"));
  const marker = `<!-- engineering-loop:decision:${decision.id} -->`;
  let contextSource = await readFile(absoluteContextPath, "utf8");
  if (!contextSource.includes(marker)) {
    const separator = contextSource.endsWith("\n") ? "" : "\n";
    contextSource += `${separator}\n${marker}\n- ${decision.context.term}: ${decision.context.definitions[answer]}\n`;
    await writeFile(absoluteContextPath, contextSource, "utf8");
  }
  const contextPaths = [contextPath];
  if (decision.reversibility === "HARD" && decision.surprising === true) {
    const adrPath = `.engineering/adrs/ADR-${decision.id}.md`;
    const absoluteAdrPath = path.join(context.worktree, ...adrPath.split("/"));
    await writeFile(
      absoluteAdrPath,
      `# ${decision.id}\n\n## Decision\n\n${decision.question}\n\nSelected: ${answer}.\n\n## Consequence\n\n${decision.context.definitions[answer]}\n`,
      "utf8",
    );
    contextPaths.push(adrPath);
  }
  const answeredGate = {
    ...gate,
    status: "ANSWERED",
    answer: { value: answer },
    contextPaths,
  };
  context.artifacts["human-gate.json"] = answeredGate;
  delete context.artifacts["result.json"];
  transitionState(context.stateHistory, "DECISION_RECORDED");
  const expectedArtifacts = {
    ...context.artifacts,
    "human-gate.json": answeredGate,
    "state.json": runStateArtifact(
      context.runId,
      context.branch,
      context.repository.integrationHead,
      context.stateHistory,
      false,
      "STANDARD",
    ),
    "task-profile.json": context.taskProfile,
    "verification.json": context.verification,
  };
  await removeUnexpectedRunArtifacts(context.artifactRoot, new Set(Object.keys(expectedArtifacts)));
  await Promise.all(
    Object.entries(expectedArtifacts).map(([name, value]) =>
      writeJson(path.join(context.artifactRoot, name), value),
    ),
  );
  await validateRunArtifacts(context.artifactRoot, expectedArtifacts);
  await git(context.worktree, ["add", "--", ...contextPaths, context.artifactPath]);
  const staged = await gitNullPaths(context.worktree, ["diff", "--cached", "--name-only", "-z"]);
  const allowed = new Set([
    ...contextPaths,
    `${context.artifactPath}/result.json`,
    ...Object.keys(expectedArtifacts).map((name) => `${context.artifactPath}/${name}`),
  ]);
  if (staged.some((/** @type {string} */ projectPath) => !allowed.has(projectPath))) {
    throw new Error("STANDARD decision checkpoint escaped its durable context scope.");
  }
  await git(context.worktree, [
    "-c",
    `core.hooksPath=${context.commandGuard.emptyHooks}`,
    "commit",
    "-m",
    `docs: record STANDARD decision ${decision.id} (${context.runId})`,
  ]);
  context.decisionCommit = await git(context.worktree, ["rev-parse", "HEAD"]);
  return answeredGate;
}

/** @param {unknown} humanAnswersValue */
function validateDeepManifestAnswer(humanAnswersValue) {
  if (humanAnswersValue === undefined) {
    return;
  }
  const humanAnswers = /** @type {Record<string, any>} */ (humanAnswersValue);
  if (
    !humanAnswersValue ||
    typeof humanAnswersValue !== "object" ||
    Array.isArray(humanAnswersValue) ||
    JSON.stringify(Object.keys(humanAnswers)) !== JSON.stringify(["migration-manifest"]) ||
    typeof humanAnswers["migration-manifest"] !== "string" ||
    !/^[a-f0-9]{64}$/u.test(humanAnswers["migration-manifest"])
  ) {
    throw new Error("humanAnswers must contain only the exact DEEP Migration Manifest hash.");
  }
}

/** @param {Record<string, any>} context @param {Record<string, any>} request @param {Record<string, any>} gate @param {Record<string, any>} manifest */
async function recordDeepManifestApproval(context, request, gate, manifest) {
  const answer = request.humanAnswers?.["migration-manifest"];
  if (
    gate?.kind !== "MIGRATION_MANIFEST" ||
    gate.id !== "migration-manifest" ||
    gate.status !== "WAITING" ||
    gate.requestHash !== standardRequestBindingHash(request) ||
    gate.manifestHash !== manifest.hash ||
    answer !== manifest.hash
  ) {
    throw new Error("Durable DEEP Migration Manifest gate does not match its exact human approval or request binding.");
  }
  const approval = {
    schemaVersion: 1,
    manifestHash: manifest.hash,
    approved: true,
  };
  const answeredGate = {
    ...gate,
    status: "ANSWERED",
    answer: { value: answer },
  };
  context.artifacts["human-gate.json"] = answeredGate;
  context.artifacts["manifest-approval.json"] = approval;
  delete context.artifacts["result.json"];
  transitionState(context.stateHistory, "MANIFEST_APPROVED");
  const expectedArtifacts = {
    ...context.artifacts,
    "state.json": runStateArtifact(
      context.runId,
      context.branch,
      context.repository.integrationHead,
      context.stateHistory,
      false,
      "DEEP",
    ),
    "task-profile.json": context.taskProfile,
    "verification.json": context.verification,
  };
  await removeUnexpectedRunArtifacts(context.artifactRoot, new Set(Object.keys(expectedArtifacts)));
  await Promise.all(
    Object.entries(expectedArtifacts).map(([name, value]) =>
      writeJson(path.join(context.artifactRoot, name), value),
    ),
  );
  await validateRunArtifacts(context.artifactRoot, expectedArtifacts);
  await git(context.worktree, ["add", "--", context.artifactPath]);
  await validateGitArtifacts(context.worktree, "index", context.artifactPath, expectedArtifacts);
  await git(context.worktree, [
    "-c",
    `core.hooksPath=${context.commandGuard.emptyHooks}`,
    "commit",
    "-m",
    `chore: record DEEP Migration Manifest approval (${context.runId})`,
  ]);
  context.decisionCommit = await git(context.worktree, ["rev-parse", "HEAD"]);
  return approval;
}

/** @param {string} requestHash @param {string[]} researchFactIds @param {Record<string, any>} manifest @returns {Record<string, any>} */
export function createMigrationManifestHumanGate(requestHash, researchFactIds, manifest) {
  const destructivePaths = manifest.actions.flatMap((/** @type {any} */ action) =>
    action.action === "MOVE" ? [action.path, action.destination] : [action.path],
  ).sort();
  return createStandardHumanGate({
    id: "migration-manifest",
    kind: "MIGRATION_MANIFEST",
    requestHash,
    createdFromState: "MANIFEST_APPROVAL",
    researchFactIds,
    question: {
      prompt: `Approve destructive Migration Manifest ${manifest.hash}?`,
      recommendation: {
        answer: manifest.hash,
        consequence: "Advisor and Worker may proceed only for this exact reviewed scope.",
      },
      alternatives: [],
    },
    extra: { manifestHash: manifest.hash, destructivePaths },
  });
}

/** @param {string} worktree @param {Record<string, any>[]} decisions */
async function recordDeepDomainDecisions(worktree, decisions) {
  const contextPath = ".engineering/CONTEXT.md";
  const absoluteContextPath = path.join(worktree, ...contextPath.split("/"));
  let contextSource = await readFile(absoluteContextPath, "utf8");
  /** @type {string[]} */
  const contextPaths = [];
  for (const decision of decisions) {
    if (decision.record === "CONTEXT") {
      const marker = `<!-- engineering-loop:deep-decision:${decision.id} -->`;
      if (!contextSource.includes(marker)) {
        const separator = contextSource.endsWith("\n") ? "" : "\n";
        contextSource += `${separator}\n${marker}\n- ${decision.statement}\n`;
      }
      if (!contextPaths.includes(contextPath)) {
        contextPaths.push(contextPath);
      }
      continue;
    }
    const adrPath = `.engineering/adrs/ADR-${decision.id}.md`;
    const absoluteAdrPath = path.join(worktree, ...adrPath.split("/"));
    const source = `# ${decision.id}\n\n## Decision\n\n${decision.statement}\n\n## Domain boundaries\n\n${decision.boundaryIds.map((/** @type {string} */ id) => `- ${id}`).join("\n")}\n\n## Evidence\n\n${decision.evidenceIds.map((/** @type {string} */ id) => `- ${id}`).join("\n")}\n`;
    try {
      if (await readFile(absoluteAdrPath, "utf8") !== source) {
        throw new Error(`DEEP ADR path already contains a different decision: ${adrPath}`);
      }
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      await writeFile(absoluteAdrPath, source, "utf8");
    }
    contextPaths.push(adrPath);
  }
  if (contextPaths.includes(contextPath)) {
    await writeFile(absoluteContextPath, contextSource, "utf8");
  }
  return contextPaths.sort();
}

/** @param {unknown} humanGate */
function decisionControlledPaths(humanGate) {
  const gate = /** @type {Record<string, any> | null} */ (humanGate && typeof humanGate === "object" ? humanGate : null);
  return gate?.kind === "DECISION" && gate.status === "ANSWERED" && Array.isArray(gate.contextPaths)
    ? gate.contextPaths
    : [];
}

/** @param {unknown} value */
function deepDecisionControlledPaths(value) {
  const artifact = /** @type {Record<string, any> | null} */ (
    value && typeof value === "object" && !Array.isArray(value) ? value : null
  );
  return artifact?.schemaVersion === 1 && Array.isArray(artifact.contextPaths)
    ? artifact.contextPaths
    : [];
}

/** @param {unknown} settingsValue */
function validateRemoteCheckpointSyncSetting(settingsValue) {
  if (settingsValue === undefined) {
    return;
  }
  if (!settingsValue || typeof settingsValue !== "object" || Array.isArray(settingsValue)) {
    throw new Error("settings must be an object when provided.");
  }
  const settings = /** @type {Record<string, any>} */ (settingsValue);
  if (Object.keys(settings).some((key) => key !== "remoteCheckpointSync")) {
    throw new Error("settings contains an unsupported run setting.");
  }
  const sync = settings.remoteCheckpointSync;
  if (!sync || typeof sync !== "object" || Array.isArray(sync)) {
    throw new Error("settings.remoteCheckpointSync must be an object.");
  }
  if (Object.keys(sync).some((key) => !["enabled", "remote"].includes(key))) {
    throw new Error("settings.remoteCheckpointSync contains an unsupported field.");
  }
  if (typeof sync.enabled !== "boolean") {
    throw new Error("settings.remoteCheckpointSync.enabled must be boolean.");
  }
  if (sync.enabled && !isSafeRemoteName(sync.remote)) {
    throw new Error("Enabled Remote Checkpoint Sync requires a safe remote name.");
  }
  if (sync.remote !== undefined && !isSafeRemoteName(sync.remote)) {
    throw new Error("Remote Checkpoint Sync remote must be a safe remote name.");
  }
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
  const byId = indexVerificationRegistry(registry);
  const relevantChecks = resolveRelevantChecks(byId, references.relevantChecks);
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
    implementation: resolveRegisteredCommand(byId, references.implementation, "implementation"),
    focusedCheck: resolveRegisteredCommand(byId, references.focusedCheck, "focused-test"),
    qualityReview: resolveRegisteredCommand(byId, references.qualityReview, "quality-review"),
    relevantChecks,
  };
}

/** @param {any} registry @param {Record<string, any>} references */
function resolveStandardCommands(registry, references) {
  const byId = indexVerificationRegistry(registry);
  const relevantChecks = resolveRelevantChecks(byId, references.relevantChecks);
  return {
    research: resolveRegisteredCommand(byId, references.research, "research"),
    planner: resolveRegisteredCommand(byId, references.planner, "planner"),
    advisor: resolveRegisteredCommand(byId, references.advisor, "advisor"),
    worker: resolveRegisteredCommand(byId, references.worker, "worker"),
    ticketVerification: resolveRegisteredCommand(
      byId,
      references.ticketVerification,
      "ticket-verification",
    ),
    specReview: resolveRegisteredCommand(byId, references.specReview, "spec-review"),
    qualityReview: resolveRegisteredCommand(byId, references.qualityReview, "quality-review"),
    relevantChecks,
  };
}

/** @param {any} registry */
function indexVerificationRegistry(registry) {
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
  return byId;
}

/** @param {Map<string, any>} byId @param {string} id @param {string} role */
function resolveRegisteredCommand(byId, id, role) {
  const entry = byId.get(id);
  if (!entry || entry.role !== role) {
    throw new Error(`Registered command ${id} must have role ${role}.`);
  }
  return entry;
}

/** @param {Map<string, any>} byId @param {string[]} ids */
function resolveRelevantChecks(byId, ids) {
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry || !INSTRUMENTAL_ROLES.includes(entry.role)) {
      throw new Error(`Relevant command ${id} must be an instrumental check.`);
    }
    return entry;
  });
}

/** @param {Record<string, any>} context @param {{ id: string, command: string[] }} entry @param {any} [qualityReview] @param {NodeJS.ProcessEnv} [environmentAdditions] */
async function executeRunCommand(context, entry, qualityReview, environmentAdditions = {}) {
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
    { ...commandEnvironment(context.commandGuard), ...environmentAdditions },
  );
  const deniedGitCommand = await tryReadText(context.commandGuard.deniedFile);
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
    protectedRepositoryChanged ||
    shadowProtectedChanged ||
    result.exitCode === 87 ||
    deniedGitCommand?.startsWith("87\t") === true;
  const rootWrite =
    realRunChanged ||
    shadowRunChanged ||
    result.exitCode === 86 ||
    deniedGitCommand?.startsWith("86\t") === true;
  if (repositoryWrite || rootWrite) {
    return {
      result,
      blocked: await (context.blocker ?? blockRun)({
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

/** @param {Record<string, any>} context @param {{ id: string, command: string[] }} entry @param {NodeJS.ProcessEnv} [environmentAdditions] */
async function executeReadOnlyRunCommand(context, entry, environmentAdditions = {}) {
  const before = await workingTreeFingerprint(context.worktree, context.repository.integrationHead);
  const execution = await executeRunCommand(context, entry, undefined, environmentAdditions);
  if (execution.blocked) {
    return execution;
  }
  const after = await workingTreeFingerprint(context.worktree, context.repository.integrationHead);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    return {
      result: execution.result,
      blocked: await blockStandardSchema(context, "ARTIFACT_VALIDATION", "read-only-role"),
    };
  }
  return execution;
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
  const deniedFile = path.join(root, "denied-git-command.txt");
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
  const wrapperSource = `import { appendFileSync } from "node:fs";\nimport { spawnSync } from "node:child_process";\nconst args = process.argv.slice(2);\nconst command = args[0] ?? "";\nconst readOnly = new Set(["diff", "for-each-ref", "log", "ls-files", "rev-parse", "show", "status"]);\nconst allowed = readOnly.has(command) || (command === "reflog" && (args.length === 1 || args[1] === "show")) || (command === "worktree" && args[1] === "list");\nif (!allowed) {\n  const code = command === "update-ref" || command === "branch" || command === "checkout" || command === "switch" || command === "merge" ? 87 : 86;\n  appendFileSync(${JSON.stringify(deniedFile)}, \`\${code}\\t\${args.join(" ")}\\n\`, "utf8");\n  process.exitCode = code;\n} else {\n  const child = spawnSync(${JSON.stringify(realGit)}, args, { env: process.env, shell: false, stdio: "inherit", windowsHide: true });\n  process.exitCode = child.status ?? 1;\n}\n`;
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
    deniedFile,
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
  await rm(guard.deniedFile, { force: true });
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

/** @param {string} worktreeRoot @param {string} requestHash @param {string} baseCommit @param {"STANDARD" | "DEEP"} [mode] */
async function findResumableStandardRun(worktreeRoot, requestHash, baseCommit, mode = "STANDARD") {
  let entries;
  try {
    entries = await readdir(worktreeRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeEvidenceId(entry.name)) {
      continue;
    }
    const runId = entry.name;
    const worktree = path.join(worktreeRoot, runId);
    const artifactRoot = path.join(worktree, ".engineering", "runs", runId);
    try {
      let [state, verification] = await Promise.all([
        readJson(path.join(artifactRoot, "state.json")),
        readJson(path.join(artifactRoot, "verification.json")),
      ]);
      let [graph, humanGate] = await Promise.all([
        tryReadJson(path.join(artifactRoot, "ticket-graph.json")),
        tryReadJson(path.join(artifactRoot, "human-gate.json")),
      ]);
      if (
        !graph &&
        mode === "STANDARD" &&
        state.mode === mode &&
        state.terminal === false &&
        state.runId === runId &&
        state.baseCommit === baseCommit &&
        humanGate?.kind === "DECISION" &&
        humanGate.status === "WAITING" &&
        humanGate.requestHash === requestHash
      ) {
        const [head, currentBranch, research] = await Promise.all([
          git(worktree, ["rev-parse", "HEAD"]),
          git(worktree, ["branch", "--show-current"]),
          readJson(path.join(artifactRoot, "research.json")),
        ]);
        const [parents, subject] = await Promise.all([
          git(worktree, ["show", "-s", "--format=%P", head]),
          git(worktree, ["show", "-s", "--format=%s", head]),
        ]);
        if (
          currentBranch !== state.branch ||
          parents !== baseCommit ||
          !subject.includes(`record STANDARD Human Gate ${humanGate.id}`)
        ) {
          throw new Error(`Resumable STANDARD decision gate ${runId} does not match its durable base.`);
        }
        candidates.push({
          phase: "DECISION_GATE",
          runId,
          branch: state.branch,
          graph: null,
          state,
          verification,
          artifacts: { "human-gate.json": humanGate, "research.json": research },
        });
        continue;
      }
      if (
        graph &&
        mode === "DEEP" &&
        state.mode === mode &&
        state.terminal === false &&
        state.runId === runId &&
        state.baseCommit === baseCommit &&
        graph.runId === runId &&
        graph.requestHash === requestHash &&
        graph.decisionCommit === null &&
        graph.executionOrder.length === 0 &&
        humanGate?.kind === "MIGRATION_MANIFEST" &&
        humanGate.status === "ANSWERED" &&
        humanGate.requestHash === requestHash
      ) {
        const [head, currentBranch, status] = await Promise.all([
          git(worktree, ["rev-parse", "HEAD"]),
          git(worktree, ["branch", "--show-current"]),
          git(worktree, ["status", "--porcelain"]),
        ]);
        const [parent, subject] = await Promise.all([
          git(worktree, ["show", "-s", "--format=%P", head]),
          git(worktree, ["show", "-s", "--format=%s", head]),
        ]);
        const [parentSubject, parentParents, waitingGate, approval] = await Promise.all([
          git(worktree, ["show", "-s", "--format=%s", parent]),
          git(worktree, ["show", "-s", "--format=%P", parent]),
          readGitJson(worktree, parent, `.engineering/runs/${runId}/human-gate.json`),
          readJson(path.join(artifactRoot, "manifest-approval.json")),
        ]);
        if (
          status !== "" ||
          currentBranch !== state.branch ||
          !subject.includes(`record DEEP Migration Manifest approval (${runId})`) ||
          !parentSubject.includes(`record DEEP Human Gate ${humanGate.id}`) ||
          parentParents !== baseCommit ||
          waitingGate?.kind !== "MIGRATION_MANIFEST" ||
          waitingGate.status !== "WAITING" ||
          waitingGate.requestHash !== requestHash ||
          waitingGate.manifestHash !== humanGate.manifestHash ||
          approval?.approved !== true ||
          approval.manifestHash !== humanGate.manifestHash ||
          humanGate.answer?.value !== humanGate.manifestHash
        ) {
          throw new Error(`Resumable DEEP manifest approval ${runId} does not match its durable gate.`);
        }
        graph.decisionCommit = head;
        const artifacts = /** @type {Record<string, any>} */ ({
          "human-gate.json": humanGate,
          "manifest-approval.json": approval,
          "ticket-graph.json": graph,
        });
        for (const name of [
          "domain-decisions.json",
          "domain-model.json",
          "migration-contract.json",
          "migration-manifest.json",
          "research.json",
          "rollback-plan.json",
          "spec-lite.json",
        ]) {
          artifacts[name] = await readJson(path.join(artifactRoot, name));
        }
        candidates.push({
          phase: "APPROVAL_CHECKPOINT",
          runId,
          branch: state.branch,
          graph,
          state,
          verification,
          artifacts,
        });
        continue;
      }
      if (
        graph &&
        mode === "DEEP" &&
        state.mode === mode &&
        state.terminal === false &&
        state.runId === runId &&
        state.baseCommit === baseCommit &&
        graph.runId === runId &&
        graph.requestHash === requestHash &&
        humanGate?.kind === "MIGRATION_MANIFEST" &&
        humanGate.status === "WAITING" &&
        humanGate.requestHash === requestHash
      ) {
        const [head, currentBranch, status] = await Promise.all([
          git(worktree, ["rev-parse", "HEAD"]),
          git(worktree, ["branch", "--show-current"]),
          git(worktree, ["status", "--porcelain"]),
        ]);
        const [parents, subject] = await Promise.all([
          git(worktree, ["show", "-s", "--format=%P", head]),
          git(worktree, ["show", "-s", "--format=%s", head]),
        ]);
        if (
          status !== "" ||
          currentBranch !== state.branch ||
          parents !== baseCommit ||
          !subject.includes(`record DEEP Human Gate ${humanGate.id}`)
        ) {
          throw new Error(`Resumable DEEP manifest gate ${runId} has drift or does not match its durable base.`);
        }
        const artifacts = /** @type {Record<string, any>} */ ({ "human-gate.json": humanGate });
        for (const name of [
          "domain-decisions.json",
          "domain-model.json",
          "migration-contract.json",
          "migration-manifest.json",
          "research.json",
          "rollback-plan.json",
          "spec-lite.json",
          "ticket-graph.json",
        ]) {
          artifacts[name] = await readJson(path.join(artifactRoot, name));
        }
        candidates.push({
          phase: "MANIFEST_GATE",
          runId,
          branch: state.branch,
          graph,
          state,
          verification,
          artifacts,
        });
        continue;
      }
      if (
        state.mode !== mode ||
        state.terminal !== false ||
        !graph ||
        graph.schemaVersion !== 1 ||
        graph.runId !== runId ||
        graph.requestHash !== requestHash ||
        graph.baseCommit !== baseCommit ||
        !isSafeBranchName(graph.branch) ||
        !Array.isArray(graph.tickets) ||
        !Array.isArray(graph.executionOrder)
      ) {
        continue;
      }
      const [head, currentBranch] = await Promise.all([
        git(worktree, ["rev-parse", "HEAD"]),
        git(worktree, ["branch", "--show-current"]),
      ]);
      if (currentBranch !== graph.branch) {
        throw new Error(`Resumable ${mode} worktree ${runId} is on an unexpected branch.`);
      }
      if (
        mode === "DEEP" &&
        await restoreInterruptedDeepCheckpointIndex(graph, head, worktree, artifactRoot)
      ) {
        [state, verification, graph, humanGate] = await Promise.all([
          readJson(path.join(artifactRoot, "state.json")),
          readJson(path.join(artifactRoot, "verification.json")),
          readJson(path.join(artifactRoot, "ticket-graph.json")),
          tryReadJson(path.join(artifactRoot, "human-gate.json")),
        ]);
        if (graph.decisionCommit === null) {
          return findResumableStandardRun(worktreeRoot, requestHash, baseCommit, mode);
        }
      }
      await reconcileCheckpointFromHead(
        graph,
        head,
        graph.decisionCommit ?? baseCommit,
        worktree,
        artifactRoot,
        mode,
      );
      const completedCommits = checkpointCommitsInExecutionOrder(graph);
      if ((completedCommits.at(-1) ?? graph.decisionCommit ?? baseCommit) !== head) {
        throw new Error(`Resumable ${mode} worktree ${runId} does not match its durable checkpoint.`);
      }
      const artifacts = /** @type {Record<string, any>} */ ({});
      const requiredArtifactNames = [
        "advisor.json",
        "context-packet.json",
        "research.json",
        "spec-lite.json",
        "ticket-graph.json",
        "ticket.json",
        ...(mode === "DEEP"
          ? [
              "domain-decisions.json",
              "domain-model.json",
              "manifest-approval.json",
              "migration-contract.json",
              "migration-manifest.json",
              "parallel-execution.json",
              "rollback-plan.json",
            ]
          : []),
      ];
      const artifactEntries = await readdir(artifactRoot, { withFileTypes: true });
      const artifactNames = artifactEntries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      if (requiredArtifactNames.some((name) => !artifactNames.includes(name))) {
        throw new Error(`Resumable ${mode} checkpoint is missing a required Run Artifact.`);
      }
      const expectedReviewArtifacts = reviewArtifactHashes(graph.reviewRounds ?? []);
      const actualReviewArtifactNames = artifactNames
        .filter((name) => name === "spec-review.json" || name === "quality-review.json" ||
          isVersionedReviewArtifactName(name))
        .sort();
      if (
        JSON.stringify(actualReviewArtifactNames) !==
        JSON.stringify([...expectedReviewArtifacts.keys()].sort())
      ) {
        throw new Error(`Resumable ${mode} checkpoint review artifact set does not match graph history.`);
      }
      for (const [name, expectedHash] of expectedReviewArtifacts) {
        if (sha256(await readFile(path.join(artifactRoot, name))) !== expectedHash) {
          throw new Error(`Resumable ${mode} checkpoint review artifact changed: ${name}.`);
        }
      }
      const expectsCorrectiveWork = graphHasCorrectiveReviewLinks(graph);
      if (artifactNames.includes("corrective-work.json") !== expectsCorrectiveWork) {
        throw new Error(`Resumable ${mode} corrective work does not match graph history.`);
      }
      const allowedArtifactNames = new Set([
        ...requiredArtifactNames,
        ...expectedReviewArtifacts.keys(),
        ...(expectsCorrectiveWork ? ["corrective-work.json"] : []),
        "human-gate.json",
        "remote-sync.json",
      ]);
      for (const name of artifactNames) {
        if (
          ["result.json", "state.json", "task-profile.json", "verification.json"].includes(name)
        ) {
          continue;
        }
        if (!allowedArtifactNames.has(name)) {
          throw new Error(`Resumable ${mode} checkpoint contains an unknown Run Artifact.`);
        }
        artifacts[name] = await readJson(path.join(artifactRoot, name));
      }
      if (
        expectsCorrectiveWork &&
        !correctiveWorkMatchesGraph(graph, artifacts["corrective-work.json"])
      ) {
        throw new Error(`Resumable ${mode} corrective work changed after publication.`);
      }
      const remoteSync = await tryReadJson(path.join(artifactRoot, "remote-sync.json"));
      if (remoteSync) {
        artifacts["remote-sync.json"] = remoteSync;
      }
      if (humanGate) {
        artifacts["human-gate.json"] = humanGate;
      }
      candidates.push({ runId, branch: graph.branch, graph, state, verification, artifacts });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  if (candidates.length > 1) {
    throw new Error(`Multiple resumable ${mode} runs match the same request.`);
  }
  return candidates[0] ?? null;
}

/** @param {string} target @param {string} worktreeRoot @param {string} requestHash @param {string} baseCommit @param {string} remote @param {string[]} writeLease */
async function restoreRemoteStandardRun(target, worktreeRoot, requestHash, baseCommit, remote, writeLease) {
  if (!isSafeRemoteName(remote)) {
    throw new Error("Remote STANDARD resume requires a safe remote name.");
  }
  await git(target, ["fetch", remote, "--prune"]);
  const remoteNamespace = `refs/remotes/${remote}/run/standard`;
  const output = await git(target, ["for-each-ref", "--format=%(refname)", remoteNamespace]);
  const refs = output === "" ? [] : output.split(/\r?\n/u);
  const candidates = [];
  for (const remoteRef of refs) {
    const branchPrefix = `refs/remotes/${remote}/`;
    if (!remoteRef.startsWith(branchPrefix)) {
      continue;
    }
    const branch = remoteRef.slice(branchPrefix.length);
    const runId = branch.split("/").at(-1);
    if (!isSafeBranchName(branch) || !isSafeEvidenceId(runId)) {
      continue;
    }
    const artifactPath = `.engineering/runs/${runId}`;
    let matchedRequest = false;
    try {
      const [graph, state, humanGate] = await Promise.all([
        tryReadGitJson(target, remoteRef, `${artifactPath}/ticket-graph.json`),
        readGitJson(target, remoteRef, `${artifactPath}/state.json`),
        tryReadGitJson(target, remoteRef, `${artifactPath}/human-gate.json`),
      ]);
      const baseStateMatches =
        state.schemaVersion === 1 &&
        state.runId === runId &&
        state.branch === branch &&
        state.baseCommit === baseCommit &&
        state.mode === "STANDARD" &&
        state.terminal === false;
      if (
        !graph &&
        baseStateMatches &&
        humanGate?.kind === "DECISION" &&
        humanGate.status === "WAITING" &&
        humanGate.requestHash === requestHash
      ) {
        matchedRequest = true;
        const [parents, subject] = await Promise.all([
          git(target, ["show", "-s", "--format=%P", remoteRef]),
          git(target, ["show", "-s", "--format=%s", remoteRef]),
        ]);
        const gateChanged = await git(target, ["diff", "--name-only", `${baseCommit}..${remoteRef}`]);
        const gateChangedPaths = gateChanged === "" ? [] : gateChanged.split(/\r?\n/u);
        if (
          parents !== baseCommit ||
          !subject.includes(`record STANDARD Human Gate ${humanGate.id}`) ||
          gateChangedPaths.some((/** @type {string} */ changedPath) => !changedPath.startsWith(`${artifactPath}/`))
        ) {
          throw new Error("Remote STANDARD decision gate does not match its durable base.");
        }
        await validateRemoteDecisionGateArtifacts(
          target,
          remoteRef,
          artifactPath,
          humanGate,
          state,
        );
        candidates.push({ branch, remoteRef, runId });
        continue;
      }
      if (
        graph &&
        graph.schemaVersion === 1 &&
        graph.runId === runId &&
        graph.branch === branch &&
        graph.requestHash === requestHash &&
        graph.baseCommit === baseCommit &&
        baseStateMatches
      ) {
        matchedRequest = true;
        const ancestor = await tryGit(target, ["merge-base", "--is-ancestor", baseCommit, remoteRef]);
        const changed = await git(target, ["diff", "--name-only", `${baseCommit}..${remoteRef}`]);
        const changedPaths = changed === "" ? [] : changed.split(/\r?\n/u);
        const controlledDecisionPaths = new Set(decisionControlledPaths(humanGate));
        const outsideDurableScope = changedPaths.find(
          (/** @type {string} */ changedPath) =>
            !writeLease.includes(changedPath) &&
            !controlledDecisionPaths.has(changedPath) &&
            !changedPath.startsWith(`${artifactPath}/`),
        );
        if (ancestor === null || outsideDurableScope) {
          throw new Error("Remote STANDARD checkpoint escaped its base or Write Lease.");
        }
        await validateRemoteCheckpointArtifacts(
          target,
          remoteRef,
          artifactPath,
          graph,
          state,
          remote,
          branch,
        );
        candidates.push({ branch, remoteRef, runId });
      }
    } catch (error) {
      if (matchedRequest) {
        throw error;
      }
      continue;
    }
  }
  if (candidates.length > 1) {
    throw new Error("Multiple remote STANDARD runs match the same request.");
  }
  const candidate = candidates[0];
  if (!candidate) {
    return false;
  }
  await mkdir(worktreeRoot, { recursive: true });
  const worktree = path.join(worktreeRoot, candidate.runId);
  const localRef = await tryGit(target, ["rev-parse", "--verify", `refs/heads/${candidate.branch}`]);
  if (localRef) {
    const remoteHead = await git(target, ["rev-parse", candidate.remoteRef]);
    if (localRef !== remoteHead) {
      throw new Error("Local Run Branch diverges from the resumable remote checkpoint.");
    }
    await git(target, ["worktree", "add", worktree, candidate.branch]);
  } else {
    await git(target, ["worktree", "add", "-b", candidate.branch, worktree, candidate.remoteRef]);
  }
  return true;
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
async function readGitJson(cwd, revision, projectPath) {
  return JSON.parse(await git(cwd, ["show", `${revision}:${projectPath}`]));
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
async function readGitBlob(cwd, revision, projectPath) {
  const result = await runProcess("git", ["show", `${revision}:${projectPath}`], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Git blob read failed for ${projectPath}.`);
  }
  return result.stdout;
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
async function tryReadGitJson(cwd, revision, projectPath) {
  const source = await tryGit(cwd, ["show", `${revision}:${projectPath}`]);
  return source === null ? null : JSON.parse(source);
}

/** @param {Record<string, any>} request @param {string} branch */
function createRemoteSyncState(request, branch) {
  const setting = request.settings?.remoteCheckpointSync;
  if (setting?.enabled !== true) {
    return { enabled: false };
  }
  return {
    schemaVersion: 1,
    enabled: true,
    status: "PENDING",
    remote: setting.remote,
    branch,
    checkpoints: [],
  };
}

/** @param {Record<string, any>} request @param {string} branch @param {Record<string, any> | null} resumable @param {string[]} checkpointCommits */
function resumeRemoteSyncState(request, branch, resumable, checkpointCommits) {
  const state = /** @type {Record<string, any>} */ (createRemoteSyncState(request, branch));
  if (!state.enabled || !resumable) {
    return state;
  }
  const durable = resumable.artifacts?.["remote-sync.json"];
  if (durable !== undefined) {
    validateRemoteSyncArtifact(durable, state.remote, branch, checkpointCommits);
    Object.assign(state, durable);
  }
  return state;
}

/** @param {unknown} value @param {string} remote @param {string} branch @param {string[]} checkpointCommits */
function validateRemoteSyncArtifact(value, remote, branch, checkpointCommits) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Durable Remote Checkpoint Sync evidence must be an object.");
  }
  const artifact = /** @type {Record<string, any>} */ (value);
  if (
    artifact.schemaVersion !== 1 ||
    artifact.enabled !== true ||
    artifact.remote !== remote ||
    artifact.branch !== branch ||
    !Array.isArray(artifact.checkpoints) ||
    !artifact.checkpoints.every(
      (/** @type {any} */ entry) =>
        entry?.stage === "CHECKPOINT" &&
        entry.status === "PASS" &&
        /^[a-f0-9]{40}$/u.test(entry.localHead) &&
        entry.remoteHead === entry.localHead,
    )
  ) {
    throw new Error("Durable Remote Checkpoint Sync evidence is invalid or request-unbound.");
  }
  const evidenceHeads = artifact.checkpoints.map(
    (/** @type {any} */ entry) => entry.localHead,
  );
  if (
    JSON.stringify(evidenceHeads) !==
    JSON.stringify(checkpointCommits.slice(0, evidenceHeads.length))
  ) {
    throw new Error("Durable Remote Checkpoint Sync evidence is not graph-ordered.");
  }
}

/** @param {string} target @param {string} revision @param {string} artifactPath */
async function remoteRunArtifactNames(target, revision, artifactPath) {
  const tree = await git(target, [
    "ls-tree",
    "-r",
    "--format=%(objectmode) %(objecttype) %(path)",
    revision,
    "--",
    artifactPath,
  ]);
  const entries = tree === "" ? [] : tree.split(/\r?\n/u).map((/** @type {string} */ line) => {
    const match = /^(\d+) (\S+) (.+)$/u.exec(line);
    return match ? { mode: match[1], type: match[2], path: match[3] } : null;
  });
  if (entries.some((/** @type {any} */ entry) => !entry || entry.mode !== "100644" || entry.type !== "blob")) {
    throw new Error("Remote STANDARD checkpoint contains a non-regular Run Artifact.");
  }
  return entries
    .map((/** @type {any} */ entry) => entry.path.slice(`${artifactPath}/`.length))
    .sort();
}

/** @param {string} target @param {string} revision @param {string} artifactPath @param {Record<string, any>} humanGate @param {Record<string, any>} state */
async function validateRemoteDecisionGateArtifacts(target, revision, artifactPath, humanGate, state) {
  const actualNames = await remoteRunArtifactNames(target, revision, artifactPath);
  const expected = [
    "human-gate.json",
    "research.json",
    "result.json",
    "state.json",
    "task-profile.json",
    "verification.json",
  ].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expected)) {
    throw new Error("Remote STANDARD decision gate Run Artifact set is not allowlisted.");
  }
  for (const name of actualNames) {
    const artifact = await readGitJson(target, revision, `${artifactPath}/${name}`);
    validateArtifactValue(artifact, name);
    if (name === "human-gate.json" && JSON.stringify(artifact) !== JSON.stringify(humanGate)) {
      throw new Error("Remote STANDARD decision gate changed during validation.");
    }
    if (name === "state.json" && JSON.stringify(artifact) !== JSON.stringify(state)) {
      throw new Error("Remote STANDARD decision gate state changed during validation.");
    }
  }
}

/** @param {string} target @param {string} revision @param {string} artifactPath @param {Record<string, any>} graph @param {Record<string, any>} state @param {string} remote @param {string} branch */
async function validateRemoteCheckpointArtifacts(
  target,
  revision,
  artifactPath,
  graph,
  state,
  remote,
  branch,
) {
  const actualNames = await remoteRunArtifactNames(target, revision, artifactPath);
  const requiredNames = new Set(STANDARD_CHECKPOINT_ARTIFACT_FILES);
  const expectedReviewArtifacts = reviewArtifactHashes(graph.reviewRounds ?? []);
  const expectsCorrectiveWork = graphHasCorrectiveReviewLinks(graph);
  const allowedNames = new Set([
    ...requiredNames,
    ...expectedReviewArtifacts.keys(),
    ...(expectsCorrectiveWork ? ["corrective-work.json"] : []),
    "human-gate.json",
    "remote-sync.json",
  ]);
  if (
    [...requiredNames].some((name) => !actualNames.includes(name)) ||
    [...expectedReviewArtifacts.keys()].some((name) => !actualNames.includes(name)) ||
    actualNames.some((/** @type {string} */ name) => !allowedNames.has(name)) ||
    actualNames.includes("corrective-work.json") !== expectsCorrectiveWork
  ) {
    throw new Error("Remote STANDARD checkpoint Run Artifact set is not allowlisted.");
  }
  for (const name of actualNames) {
    const artifact = await readGitJson(target, revision, `${artifactPath}/${name}`);
    validateArtifactValue(artifact, name);
    const expectedReviewHash = expectedReviewArtifacts.get(name);
    if (
      expectedReviewHash &&
      sha256(await readGitBlob(target, revision, `${artifactPath}/${name}`)) !== expectedReviewHash
    ) {
      throw new Error(`Remote STANDARD checkpoint review artifact changed: ${name}.`);
    }
    if (name === "ticket-graph.json" && JSON.stringify(artifact) !== JSON.stringify(graph)) {
      throw new Error("Remote STANDARD checkpoint graph changed during validation.");
    }
    if (name === "state.json" && JSON.stringify(artifact) !== JSON.stringify(state)) {
      throw new Error("Remote STANDARD checkpoint state changed during validation.");
    }
    if (name === "remote-sync.json") {
      validateRemoteSyncArtifact(
        artifact,
        remote,
        branch,
        checkpointCommitsInExecutionOrder(graph),
      );
    }
    if (
      name === "corrective-work.json" &&
      !correctiveWorkMatchesGraph(graph, artifact)
    ) {
      throw new Error("Remote STANDARD checkpoint corrective work changed during validation.");
    }
  }
}

/**
 * @param {{ action: string, force: boolean, remote: string, runBranch: string, currentBranch: string, integrationBranch: string, stableBranch: string }} policy
 */
export function assertRemoteSyncPolicy(policy) {
  if (policy.action !== "push") {
    throw new Error("Remote Checkpoint Sync permits only the push action.");
  }
  if (policy.force !== false) {
    throw new Error("Remote Checkpoint Sync forbids force-push.");
  }
  if (!isSafeRemoteName(policy.remote) || !isSafeBranchName(policy.runBranch)) {
    throw new Error("Remote Checkpoint Sync requires safe remote and branch names.");
  }
  if (
    policy.runBranch === policy.integrationBranch ||
    policy.runBranch === policy.stableBranch
  ) {
    throw new Error("Remote Checkpoint Sync cannot target a protected branch.");
  }
  if (!policy.runBranch.startsWith("run/standard/") || policy.currentBranch !== policy.runBranch) {
    throw new Error("Remote Checkpoint Sync can target only the current STANDARD Run Branch.");
  }
}

/** @param {Record<string, any>} context @param {string} localHead @param {string} stage @returns {Promise<any>} */
async function synchronizeRunHead(context, localHead, stage) {
  if (!context.remoteSync.enabled) {
    return {};
  }
  const policy = {
    action: "push",
    force: false,
    remote: context.remoteSync.remote,
    runBranch: context.branch,
    currentBranch: await git(context.worktree, ["branch", "--show-current"]),
    integrationBranch: context.repository.integrationBranch,
    stableBranch: context.repository.stableBranch,
  };
  assertRemoteSyncPolicy(policy);
  const remoteTrackingRef = `refs/remotes/${policy.remote}/${policy.runBranch}`;
  await git(context.worktree, ["fetch", policy.remote, "--prune"]);
  const remoteHead = await tryGit(context.worktree, ["rev-parse", "--verify", remoteTrackingRef]);
  if (remoteHead) {
    const fastForward = await tryGit(context.worktree, ["merge-base", "--is-ancestor", remoteHead, localHead]);
    if (fastForward === null) {
      return remoteSyncHumanGate(context, localHead, remoteHead, "REMOTE_DIVERGENCE");
    }
  }
  const refspec = `refs/heads/${policy.runBranch}:refs/heads/${policy.runBranch}`;
  const pushed = await runProcess(
    "git",
    ["push", "--porcelain", policy.remote, refspec],
    context.worktree,
    commandEnvironment(),
  );
  if (pushed.exitCode !== 0) {
    await git(context.worktree, ["fetch", policy.remote, "--prune"]);
    const observedRemoteHead = await tryGit(
      context.worktree,
      ["rev-parse", "--verify", remoteTrackingRef],
    );
    return remoteSyncHumanGate(
      context,
      localHead,
      observedRemoteHead,
      observedRemoteHead ? "REMOTE_DIVERGENCE" : "REMOTE_SYNC_REJECTED",
    );
  }
  const synchronizedRemoteHead = await remoteBranchHead(
    context.worktree,
    policy.remote,
    policy.runBranch,
  );
  if (synchronizedRemoteHead !== localHead) {
    return remoteSyncHumanGate(
      context,
      localHead,
      synchronizedRemoteHead,
      "REMOTE_HEAD_MISMATCH",
    );
  }
  const evidence = { stage, status: "PASS", localHead, remoteHead: synchronizedRemoteHead };
  if (stage === "CHECKPOINT") {
    for (const checkpoint of context.checkpointCommits) {
      if (
        !context.remoteSync.checkpoints.some(
          (/** @type {any} */ entry) => entry.localHead === checkpoint,
        )
      ) {
        context.remoteSync.checkpoints.push({
          stage: "CHECKPOINT",
          status: "PASS",
          localHead: checkpoint,
          remoteHead: checkpoint,
          ...(checkpoint === localHead ? {} : { recovered: true }),
        });
      }
    }
  } else if (stage === "HUMAN_GATE") {
    context.remoteSync.humanGate = evidence;
  } else {
    context.remoteSync.readyForHuman = evidence;
  }
  context.remoteSync.status = "PASS";
  delete context.remoteSync.blocker;
  context.artifacts["remote-sync.json"] = context.remoteSync;
  await writeJson(path.join(context.artifactRoot, "remote-sync.json"), context.remoteSync);
  return { evidence };
}

/** @param {Record<string, any>} context @param {string} localHead @param {string | null} remoteHead @param {string} reason @returns {Promise<any>} */
async function remoteSyncHumanGate(context, localHead, remoteHead, reason) {
  context.remoteSync.status = "HUMAN_GATE";
  context.remoteSync.blocker = {
    reason,
    remote: context.remoteSync.remote,
    branch: context.branch,
    localHead,
    remoteHead,
  };
  const humanGate = createStandardHumanGate({
    id: `REMOTE-SYNC-${reason}`,
    kind: "REMOTE_SYNC",
    requestHash: context.requestHash,
    createdFromState: context.stateHistory.at(-1)?.state ?? "CHECKPOINT",
    researchFactIds: [],
    question: {
      prompt: "How should the divergent Remote Checkpoint Sync histories be reconciled?",
      recommendation: {
        answer: "inspect-and-reconcile",
        consequence: "Preserves both local and remote histories for an explicit human reconciliation.",
      },
      alternatives: [
        {
          answer: "stop-sync",
          consequence: "Leaves the run paused locally without overwriting the remote branch.",
        },
      ],
    },
    extra: { blocker: context.remoteSync.blocker },
  });
  context.artifacts["human-gate.json"] = humanGate;
  context.artifacts["remote-sync.json"] = context.remoteSync;
  return {
    humanGate: await persistStandardHumanGate(context, humanGate, {
      blocker: context.remoteSync.blocker,
      remoteSync: context.remoteSync,
    }),
  };
}

/** @param {string} worktree @param {string} remote @param {string} branch */
async function remoteBranchHead(worktree, remote, branch) {
  const output = await git(worktree, ["ls-remote", "--heads", remote, `refs/heads/${branch}`]);
  return output === "" ? null : output.split(/\s/u)[0];
}

/** @param {Record<string, any>} ticket */
function ticketContract(ticket) {
  return {
    id: ticket.id,
    objective: ticket.objective,
    acceptanceCriteria: ticket.acceptanceCriteria,
    verificationIds: ticket.verificationIds,
    dependencies: ticket.dependencies,
    writeLease: ticket.writeLease,
    ...(ticket.contractIds ? { contractIds: ticket.contractIds } : {}),
    contextPaths: ticket.contextPaths,
  };
}

/** @param {string} left @param {string} right */
function compareEvidenceIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {Record<string, any>[]} tickets
 * @param {Set<string>} completed
 */
export function selectDeterministicFrontier(tickets, completed) {
  return tickets
    .filter(
      (ticket) =>
        !completed.has(ticket.id) &&
        ticket.dependencies.every((/** @type {string} */ blocker) => completed.has(blocker)),
    )
    .sort((left, right) => compareEvidenceIds(left.id, right.id));
}

/** @param {Record<string, any>} graph */
export function checkpointCommitsInExecutionOrder(graph) {
  return graph.executionOrder.map((/** @type {string} */ ticketId) => {
    const checkpoint = graph.tickets.find(
      (/** @type {any} */ ticket) => ticket.id === ticketId,
    )?.checkpointCommit;
    if (!isNonEmptyString(checkpoint)) {
      throw new Error(`Durable STANDARD checkpoint is missing for ${ticketId}.`);
    }
    return checkpoint;
  });
}

/** @param {Record<string, any>} graph @param {string} head @param {string} worktree @param {string} artifactRoot */
async function restoreInterruptedDeepCheckpointIndex(graph, head, worktree, artifactRoot) {
  const completedCommits = checkpointCommitsInExecutionOrder(graph);
  const durableHead = completedCommits.at(-1) ?? graph.decisionCommit ?? graph.baseCommit;
  if (durableHead !== head) {
    return false;
  }
  const candidates = graph.tickets.filter(
    (/** @type {any} */ ticket) =>
      ticket.status === "IN_PROGRESS" &&
      ticket.verification?.status === "PASS" &&
      !ticket.checkpointCommit,
  );
  if (candidates.length === 0) {
    return false;
  }
  if (candidates.length !== 1) {
    throw new Error(`Resumable DEEP worktree ${graph.runId} has ambiguous uncommitted checkpoints.`);
  }
  const ticket = candidates[0];
  const artifactPath = path.relative(worktree, artifactRoot).replaceAll("\\", "/");
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  const expectedArtifacts = /** @type {Record<string, any>} */ ({});
  for (const entry of entries) {
    if (!entry.isFile() || !isAllowedRunArtifactName(entry.name)) {
      throw new Error(`Resumable DEEP pre-commit artifact is not allowlisted: ${entry.name}.`);
    }
    expectedArtifacts[entry.name] = await readJson(path.join(artifactRoot, entry.name));
  }
  const [stagedPaths, unstagedPaths, untrackedPaths] = await Promise.all([
    gitNullPaths(worktree, ["diff", "--cached", "--name-only", "-z", head]),
    gitNullPaths(worktree, ["diff", "--name-only", "-z"]),
    gitNullPaths(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const escapedPath = stagedPaths.find(
    (/** @type {string} */ projectPath) =>
      !ticket.writeLease.includes(projectPath) && !projectPath.startsWith(`${artifactPath}/`),
  );
  if (
    stagedPaths.length === 0 ||
    unstagedPaths.length > 0 ||
    untrackedPaths.length > 0 ||
    escapedPath
  ) {
    throw new Error(`Resumable DEEP pre-commit checkpoint ${ticket.id} is not a bounded staged result.`);
  }
  await validateRunArtifacts(artifactRoot, expectedArtifacts);
  await validateGitArtifacts(worktree, "index", artifactPath, expectedArtifacts);
  await validateLeasedIndex(worktree, ticket.writeLease);
  await git(worktree, ["reset", "--hard", "HEAD"]);
  await git(worktree, ["clean", "-fd"]);
  return true;
}

/** @param {Record<string, any>} graph @param {string} head @param {string} baseCommit @param {string} worktree @param {string} artifactRoot @param {"STANDARD" | "DEEP"} [mode] */
async function reconcileCheckpointFromHead(
  graph,
  head,
  baseCommit,
  worktree,
  artifactRoot,
  mode = "STANDARD",
) {
  const completedCommits = checkpointCommitsInExecutionOrder(graph);
  const previous = completedCommits.at(-1) ?? baseCommit;
  if (previous === head) {
    if (mode === "DEEP" && completedCommits.length > 0) {
      const ticketId = graph.executionOrder.at(-1);
      const ticket = graph.tickets.find(
        (/** @type {any} */ candidate) => candidate.id === ticketId,
      );
      await reconcileDeepParallelIntegrationFromHead(
        ticket,
        graph.executionOrder.length,
        head,
        worktree,
        artifactRoot,
      );
    }
    return;
  }
  const parents = (await git(worktree, ["show", "-s", "--format=%P", head])).split(" ");
  const candidates = graph.tickets.filter(
    (/** @type {any} */ ticket) =>
      ticket.status === "IN_PROGRESS" &&
      ticket.verification?.status === "PASS" &&
      !ticket.checkpointCommit,
  );
  if (parents.length !== 1 || parents[0] !== previous || candidates.length !== 1) {
    throw new Error(`Resumable ${mode} worktree ${graph.runId} does not match its durable checkpoint.`);
  }
  const ticket = candidates[0];
  const subject = await git(worktree, ["show", "-s", "--format=%s", head]);
  const committedGraph = JSON.parse(
    await git(
      worktree,
      ["show", `${head}:${path.relative(worktree, path.join(artifactRoot, "ticket-graph.json")).replaceAll("\\", "/")}`],
    ),
  );
  const committedTicket = committedGraph.tickets.find(
    (/** @type {any} */ candidate) => candidate.id === ticket.id,
  );
  if (
    !subject.includes(`complete ${mode} ticket ${ticket.id}`) ||
    committedTicket?.status !== "IN_PROGRESS" ||
    committedTicket?.verification?.status !== "PASS" ||
    JSON.stringify(committedGraph.executionOrder) !== JSON.stringify(graph.executionOrder)
  ) {
    throw new Error(`Resumable ${mode} checkpoint ${head} cannot be reconciled safely.`);
  }
  ticket.status = "COMPLETE";
  ticket.checkpointCommit = head;
  ticket.checkpointedAt = await git(worktree, ["show", "-s", "--format=%cI", head]);
  if (mode === "DEEP") {
    await reconcileDeepParallelIntegrationFromHead(
      ticket,
      graph.executionOrder.length + 1,
      head,
      worktree,
      artifactRoot,
    );
  }
  graph.executionOrder.push(ticket.id);
}

/** @param {Record<string, any> | undefined} ticket @param {number} sequence @param {string} head @param {string} worktree @param {string} artifactRoot */
async function reconcileDeepParallelIntegrationFromHead(
  ticket,
  sequence,
  head,
  worktree,
  artifactRoot,
) {
  if (!ticket || ticket.checkpointCommit !== head) {
    throw new Error(`Resumable DEEP checkpoint ${head} is missing its completed ticket.`);
  }
  const parallelPath = path.relative(
    worktree,
    path.join(artifactRoot, "parallel-execution.json"),
  ).replaceAll("\\", "/");
  const [parallel, committedParallel] = await Promise.all([
    readJson(path.join(artifactRoot, "parallel-execution.json")),
    readGitJson(worktree, head, parallelPath),
  ]);
  const integrationsForTicket = (/** @type {Record<string, any>} */ value) =>
    value?.batches
      ?.flatMap((/** @type {any} */ batch) => batch.integrations ?? [])
      .filter((/** @type {any} */ integration) => integration.ticketId === ticket.id) ?? [];
  const committedIntegrations = integrationsForTicket(committedParallel);
  const committedIntegration = committedIntegrations[0];
  if (
    committedIntegrations.length !== 1 ||
    committedIntegration.sequence !== sequence ||
    committedIntegration.targetedVerificationStatus !== "PASS" ||
    committedIntegration.state !== "CHECKPOINT_PENDING" ||
    committedIntegration.checkpointCommit !== null
  ) {
    throw new Error(`Resumable DEEP checkpoint ${head} is missing its pending integration evidence.`);
  }
  const expectedParallel = JSON.parse(JSON.stringify(committedParallel));
  const expectedIntegration = integrationsForTicket(expectedParallel)[0];
  expectedIntegration.checkpointCommit = head;
  expectedIntegration.state = "CHECKPOINTED";
  const currentSource = JSON.stringify(parallel);
  const committedSource = JSON.stringify(committedParallel);
  const expectedSource = JSON.stringify(expectedParallel);
  if (currentSource !== committedSource && currentSource !== expectedSource) {
    throw new Error(`Resumable DEEP checkpoint ${head} contains parallel evidence drift.`);
  }
  if (currentSource === committedSource) {
    await writeJson(path.join(artifactRoot, "parallel-execution.json"), expectedParallel);
  }
}

/** @param {Record<string, any>} graph */
function validateDurableExecutionOrder(graph) {
  const completed = new Set();
  for (const ticketId of graph.executionOrder) {
    const frontier = selectDeterministicFrontier(graph.tickets, completed);
    if (frontier[0]?.id !== ticketId) {
      throw new Error("Durable STANDARD execution order does not match the deterministic frontier.");
    }
    const ticket = frontier[0];
    if (ticket.status !== "COMPLETE" || !isNonEmptyString(ticket.checkpointCommit)) {
      throw new Error("Durable STANDARD checkpoint is incomplete.");
    }
    completed.add(ticketId);
  }
  for (const ticket of graph.tickets) {
    if (ticket.status === "COMPLETE" && !completed.has(ticket.id)) {
      throw new Error("Durable STANDARD graph contains an unrecorded completed ticket.");
    }
  }
}

/** @param {string} source */
function parseResearch(source) {
  const research = parseJsonOutput(source, "Repository research");
  if (
    research.schemaVersion !== 1 ||
    !Array.isArray(research.facts) ||
    research.facts.length === 0 ||
    !research.facts.every(
      (/** @type {any} */ fact) =>
        fact &&
        isSafeEvidenceId(fact.id) &&
        isNonEmptyString(fact.statement) &&
        Array.isArray(fact.evidence) &&
        fact.evidence.length > 0 &&
        fact.evidence.every(isSafeLeasedPath) &&
        Array.isArray(fact.answersDecisionQuestions) &&
        new Set(fact.answersDecisionQuestions).size === fact.answersDecisionQuestions.length &&
        fact.answersDecisionQuestions.every(isSafeEvidenceId),
    )
  ) {
    throw new Error("Repository research requires evidence-backed facts.");
  }
  return research;
}

/** @param {string} source @param {Record<string, any>} request @param {Record<string, any>} commands */
function parseExecutionPlan(source, request, commands) {
  const plan = parseJsonOutput(source, "Planner");
  if (plan.schemaVersion !== 1 || !Array.isArray(plan.tickets) || plan.tickets.length === 0) {
    throw new Error("STANDARD Planner must emit one or more vertical Execution Tickets.");
  }
  const selectedVerification = new Set([
    commands.ticketVerification.id,
    ...commands.relevantChecks.map((/** @type {any} */ command) => command.id),
  ]);
  const requestLease = new Set(request.writeLease);
  const requestContext = new Set(request.standard.contextPaths);
  const allowOverlappingLeases = request.classification?.selectedMode === "DEEP";
  const ticketIds = new Set();
  const leasedPaths = new Set();
  for (const ticket of plan.tickets) {
    if (
      !ticket ||
      !isSafeEvidenceId(ticket.id) ||
      ticketIds.has(ticket.id) ||
      !isNonEmptyString(ticket.objective) ||
      !Array.isArray(ticket.acceptanceCriteria) ||
      ticket.acceptanceCriteria.length === 0 ||
      new Set(ticket.acceptanceCriteria).size !== ticket.acceptanceCriteria.length ||
      !ticket.acceptanceCriteria.every(isSafeEvidenceId) ||
      !Array.isArray(ticket.verificationIds) ||
      ticket.verificationIds.length === 0 ||
      new Set(ticket.verificationIds).size !== ticket.verificationIds.length ||
      !ticket.verificationIds.every(
        (/** @type {string} */ id) => isSafeEvidenceId(id) && selectedVerification.has(id),
      ) ||
      !Array.isArray(ticket.dependencies) ||
      new Set(ticket.dependencies).size !== ticket.dependencies.length ||
      !ticket.dependencies.every(isSafeEvidenceId) ||
      !Array.isArray(ticket.writeLease) ||
      ticket.writeLease.length === 0 ||
      !ticket.writeLease.every((/** @type {string} */ leasedPath) => requestLease.has(leasedPath)) ||
      (
        ticket.contractIds !== undefined &&
        (
          !Array.isArray(ticket.contractIds) ||
          ticket.contractIds.length === 0 ||
          new Set(ticket.contractIds).size !== ticket.contractIds.length ||
          !ticket.contractIds.every(isSafeEvidenceId)
        )
      ) ||
      !Array.isArray(ticket.contextPaths) ||
      ticket.contextPaths.length === 0 ||
      !ticket.contextPaths.every((/** @type {string} */ contextPath) => requestContext.has(contextPath))
    ) {
      throw new Error("STANDARD Execution Ticket is not a bounded vertical slice.");
    }
    ticketIds.add(ticket.id);
    for (const leasedPath of ticket.writeLease) {
      if (!allowOverlappingLeases && leasedPaths.has(leasedPath)) {
        throw new Error("STANDARD Execution Ticket Write Leases must not overlap.");
      }
      leasedPaths.add(leasedPath);
    }
  }
  if (
    JSON.stringify([...leasedPaths].sort()) !== JSON.stringify([...requestLease].sort()) ||
    plan.tickets.some(
      (/** @type {any} */ ticket) =>
        ticket.dependencies.includes(ticket.id) ||
        ticket.dependencies.some((/** @type {string} */ dependency) => !ticketIds.has(dependency)),
    )
  ) {
    throw new Error("STANDARD dependency graph has incomplete lease coverage or invalid blockers.");
  }
  assertAcyclicTicketGraph(plan.tickets);
  const coverage = request.standard.acceptanceCriteria.map((/** @type {any} */ criterion) => {
    const matchingTickets = plan.tickets.filter((/** @type {any} */ ticket) =>
      ticket.acceptanceCriteria.includes(criterion.id),
    );
    if (matchingTickets.length !== 1) {
      throw new Error(`Acceptance criterion ${criterion.id} is not fully covered.`);
    }
    const ticket = matchingTickets[0];
    if (
      criterion.verificationIds.some(
        (/** @type {string} */ verificationId) => !ticket.verificationIds.includes(verificationId),
      )
    ) {
      throw new Error(`Acceptance criterion ${criterion.id} is not fully covered.`);
    }
    return {
      acceptanceCriterion: criterion.id,
      ticket: ticket.id,
      verificationIds: criterion.verificationIds,
    };
  });
  if (
    plan.tickets.some((/** @type {any} */ ticket) =>
      ticket.acceptanceCriteria.some(
        (/** @type {string} */ criterionId) =>
          !request.standard.acceptanceCriteria.some(
            (/** @type {any} */ criterion) => criterion.id === criterionId,
          ),
      ),
    )
  ) {
    throw new Error("Execution Ticket includes unmapped scope.");
  }
  return {
    tickets: [...plan.tickets]
      .map((/** @type {any} */ ticket) => ({
        ...ticket,
        dependencies: [...ticket.dependencies].sort(compareEvidenceIds),
      }))
      .sort((left, right) => compareEvidenceIds(left.id, right.id)),
    coverage,
  };
}

/** @param {any[]} tickets */
function assertAcyclicTicketGraph(tickets) {
  const completed = new Set();
  while (completed.size < tickets.length) {
    const frontier = selectDeterministicFrontier(tickets, completed);
    if (frontier.length === 0) {
      throw new Error("STANDARD dependency graph must be acyclic.");
    }
    completed.add(frontier[0].id);
  }
}

/** @param {{ tickets: any[], coverage: any[] }} planned */
function advisorEvidence(planned) {
  return [
    ...planned.coverage.map(
      (coverage) => `coverage-${coverage.acceptanceCriterion}-${coverage.ticket}`,
    ),
    ...planned.tickets.flatMap((ticket) => [
      ...ticket.dependencies.map(
        (/** @type {string} */ blocker) => `blocking-edge-${blocker}-${ticket.id}`,
      ),
      ...ticket.writeLease.map(
        (/** @type {string} */ leasedPath) => `write-lease-${ticket.id}-${leasedPath}`,
      ),
      ...(ticket.contractIds ?? []).map(
        (/** @type {string} */ contractId) => `parallel-contract-${ticket.id}-${contractId}`,
      ),
      ...ticket.verificationIds.map(
        (/** @type {string} */ verificationId) => `verification-${ticket.id}-${verificationId}`,
      ),
    ]),
  ].sort();
}

/** @param {string} source @param {string[]} ticketIds @param {string[]} expectedEvidence */
function parseAdvisor(source, ticketIds, expectedEvidence) {
  const advisor = parseJsonOutput(source, "Advisor");
  if (
    JSON.stringify(Object.keys(advisor).sort()) !==
      JSON.stringify(["concerns", "evidence", "schemaVersion", "status", "ticketIds"]) ||
    advisor.schemaVersion !== 1 ||
    advisor.status !== "APPROVED" ||
    JSON.stringify(advisor.ticketIds) !== JSON.stringify(ticketIds) ||
    !Array.isArray(advisor.evidence) ||
    advisor.evidence.length === 0 ||
    !advisor.evidence.every(isSafeEvidenceId) ||
    JSON.stringify([...advisor.evidence].sort()) !== JSON.stringify(expectedEvidence) ||
    !Array.isArray(advisor.concerns) ||
    advisor.concerns.length !== 0
  ) {
    throw new Error("Advisor must emit a strict evidence-bearing APPROVED result.");
  }
  return advisor;
}

/** @param {string} source @param {string} verificationId */
function parseWorkerVerification(source, verificationId) {
  const report = parseJsonOutput(source, "Worker");
  if (
    JSON.stringify(Object.keys(report).sort()) !==
      JSON.stringify(["schemaVersion", "ticketVerification"]) ||
    report.schemaVersion !== 1 ||
    !report.ticketVerification ||
    JSON.stringify(Object.keys(report.ticketVerification).sort()) !==
      JSON.stringify(["id", "status"]) ||
    report.ticketVerification.id !== verificationId ||
    report.ticketVerification.status !== "PASS"
  ) {
    throw new Error("Worker must report its mapped ticket verification PASS.");
  }
  return {
    id: verificationId,
    role: "worker-ticket-verification",
    status: "PASS",
    exitCode: 0,
  };
}

/** @param {Record<string, any>} context @param {string} role @param {string[]} requirements @param {number} reviewRound */
async function createReviewPacket(context, role, requirements, reviewRound) {
  const artifactNames = [
    ...(
    role === "SPEC_REVIEWER"
      ? [
          "advisor.json",
          "research.json",
          "spec-lite.json",
          "ticket-graph.json",
          "ticket.json",
          "verification.json",
        ]
      : [
          "context-packet.json",
          "task-profile.json",
          "ticket-graph.json",
          "ticket.json",
          "verification.json",
        ]),
    ...(context.mode === "DEEP"
      ? [
          "domain-decisions.json",
          "domain-model.json",
          "manifest-approval.json",
          "migration-contract.json",
          "migration-manifest.json",
          "parallel-execution.json",
          "rollback-plan.json",
        ]
      : []),
  ];
  const artifactHashes = [];
  for (const name of artifactNames) {
    const projectPath = `${context.artifactPath}/${name}`;
    artifactHashes.push({
      path: projectPath,
      sha256: sha256(await readFile(path.join(context.artifactRoot, name))),
    });
  }
  const codeFingerprint = await applicationCodeFingerprint(context);
  const packet = {
    schemaVersion: 1,
    role,
    readOnly: true,
    reviewRound,
    codeFingerprint,
    fixedPoint: context.repository.integrationHead,
    requirements,
    diffFiles: (await changedPaths(context.worktree, context.repository.integrationHead)).filter(
      (changedPath) => !changedPath.startsWith(`${context.artifactPath}/`),
    ),
    artifactHashes,
  };
  const packetPath = path.join(context.commandGuard.root, `${role.toLowerCase()}-packet.json`);
  await writeJson(packetPath, packet);
  return {
    path: packetPath,
    hash: sha256(await readFile(packetPath)),
    codeFingerprint,
  };
}

/**
 * @param {string} source
 * @param {{
 *   role: string,
 *   packetHash: string,
 *   requirements: string[],
 *   writeLease: string[],
 *   contextPaths: string[],
 *   verificationIds: string[],
 *   ticketVerificationId: string,
 *   codeFingerprint: string,
 *   reviewRound: number,
 * }} contract
 */
function parseIndependentReview(source, contract) {
  return validateIndependentReview(parseJsonOutput(source, contract.role), contract);
}

/** @param {"spec" | "quality"} kind @param {number} reviewRound */
function reviewArtifactName(kind, reviewRound) {
  return reviewRound === 1
    ? `${kind}-review.json`
    : `${kind}-review-${reviewRound}.json`;
}

/** @param {Record<string, any>} context */
async function applicationCodeFingerprint(context) {
  return sha256(JSON.stringify(await leaseFingerprint(context.worktree, context.requestWriteLease)));
}

/** @param {Record<string, any>} context @param {Record<string, any>[]} reviewRounds */
async function reviewArtifactIntegrity(context, reviewRounds) {
  let expectedHashes;
  try {
    expectedHashes = reviewArtifactHashes(reviewRounds);
  } catch {
    return { valid: false, errors: ["review artifact history is invalid"] };
  }
  const actualHashes = /** @type {Record<string, string>} */ ({});
  for (const name of expectedHashes.keys()) {
    try {
      actualHashes[name] = sha256(
        await readFile(path.join(context.artifactRoot, name)),
      );
    } catch {
      actualHashes[name] = "";
    }
  }
  return validateImmutableReviewArtifacts(reviewRounds, actualHashes);
}

/** @param {Record<string, any>[]} reviewRounds */
function reviewArtifactHashes(reviewRounds) {
  const hashes = new Map();
  for (const [index, round] of reviewRounds.entries()) {
    const expectedRound = index + 1;
    const expectedNames = [
      reviewArtifactName("quality", expectedRound),
      reviewArtifactName("spec", expectedRound),
    ].sort();
    const artifacts = Array.isArray(round?.artifacts) ? round.artifacts : [];
    const actualNames = artifacts.map((artifact) => artifact?.name).sort();
    if (
      round?.round !== expectedRound ||
      !Array.isArray(round.findings) ||
      JSON.stringify(actualNames) !== JSON.stringify(expectedNames)
    ) {
      throw new Error("Review artifact history is not canonical.");
    }
    for (const artifact of artifacts) {
      if (
        typeof artifact.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
        hashes.has(artifact.name)
      ) {
        throw new Error("Review artifact history contains an invalid hash.");
      }
      hashes.set(artifact.name, artifact.sha256);
    }
  }
  return hashes;
}

/** @param {Record<string, any>} graph */
function graphHasCorrectiveReviewLinks(graph) {
  return (graph.reviewRounds ?? []).some(
    (/** @type {any} */ round) => Array.isArray(round.findings) && round.findings.length > 0,
  );
}

/** @param {Record<string, any>} graph @param {unknown} value */
function correctiveWorkMatchesGraph(graph, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const correctiveWork = /** @type {Record<string, any>} */ (value);
  const expectedRounds = (graph.reviewRounds ?? [])
    .filter((/** @type {any} */ round) => round.findings.length > 0)
    .map((/** @type {any} */ round) => ({
      reviewRound: round.round,
      sourceArtifacts: round.artifacts.map((/** @type {any} */ artifact) => artifact.name),
      links: round.findings,
    }));
  if (
    correctiveWork.schemaVersion !== 1 ||
    correctiveWork.kind !== "REVIEW_CORRECTIONS" ||
    !["ACTIVE", "COMPLETE"].includes(correctiveWork.status) ||
    JSON.stringify(correctiveWork.rounds) !== JSON.stringify(expectedRounds)
  ) {
    return false;
  }
  if (correctiveWork.status === "ACTIVE") {
    return correctiveWork.completedAfterReviewRound === undefined;
  }
  const latestRound = graph.reviewRounds?.at(-1);
  return latestRound?.findings?.length === 0 &&
    correctiveWork.completedAfterReviewRound === latestRound.round;
}

/** @param {string} source @param {string} label */
function parseJsonOutput(source, label) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} must emit one structured JSON result.`);
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

/** @param {string} worktree @param {string} baseCommit */
async function workingTreeFingerprint(worktree, baseCommit) {
  const paths = await changedPaths(worktree, baseCommit);
  return Promise.all(
    paths.map(async (projectPath) => ({
      path: projectPath,
      hash: await tryGit(worktree, ["hash-object", "--no-filters", "--", projectPath]),
    })),
  );
}

/** @param {string} worktree @param {string[]} writeLease */
async function leaseFingerprint(worktree, writeLease) {
  return Promise.all(
    writeLease.map(async (projectPath) => ({
      path: projectPath,
      hash: await tryGit(worktree, ["hash-object", "--no-filters", "--", projectPath]),
    })),
  );
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
    if (!entry.isFile() || !isAllowedRunArtifactName(entry.name)) {
      throw new Error(`Run Artifact allowlist rejected ${entry.name}.`);
    }
    const artifact = await readJson(path.join(artifactRoot, entry.name));
    if (JSON.stringify(artifact) !== JSON.stringify(expectedArtifacts[entry.name])) {
      throw new Error(`Run Artifact schema or content mismatch: ${entry.name}.`);
    }
    validateArtifactValue(artifact, entry.name);
  }
}

/** @param {string} name */
function isAllowedRunArtifactName(name) {
  return RUN_ARTIFACT_FILES.has(name) || isVersionedReviewArtifactName(name);
}

/** @param {string} name */
function isVersionedReviewArtifactName(name) {
  return /^(?:spec|quality)-review-(?:[2-9]|[1-9][0-9]+)\.json$/u.test(name);
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

/** @param {string} artifactRoot @param {string} runId @param {string} branch @param {string} baseCommit @param {any[]} history @param {boolean} terminal @param {string} [mode] */
async function writeRunState(artifactRoot, runId, branch, baseCommit, history, terminal, mode = "FAST") {
  const artifact = runStateArtifact(runId, branch, baseCommit, history, terminal, mode);
  await writeJson(path.join(artifactRoot, "state.json"), artifact);
  return artifact;
}

/** @param {string} runId @param {string} branch @param {string} baseCommit @param {any[]} history @param {boolean} terminal @param {string} [mode] */
function runStateArtifact(runId, branch, baseCommit, history, terminal, mode = "FAST") {
  return {
    schemaVersion: 1,
    runId,
    mode,
    branch,
    baseCommit,
    currentState: history.at(-1)?.state,
    terminal,
    history,
  };
}

/** @param {string} file @param {unknown} value */
async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
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

/** @param {string} runId @param {string} branch @param {string} worktree @param {string} artifactPath @param {string} baseCommit @param {string | null} checkpointCommit @param {string} head @param {number} [workerCount] @param {string[]} [checkpointCommits] */
function runEvidence(
  runId,
  branch,
  worktree,
  artifactPath,
  baseCommit,
  checkpointCommit,
  head,
  workerCount = 0,
  checkpointCommits = checkpointCommit ? [checkpointCommit] : [],
) {
  return {
    id: runId,
    branch,
    worktree,
    artifactPath,
    rootWriter: true,
    workerCount,
    baseCommit,
    checkpointCommit,
    checkpointCommits,
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

/** @param {unknown} value */
function isSafeRemoteName(value) {
  return isNonEmptyString(value) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
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

/** @param {string} file */
async function tryReadText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** @param {string} file */
async function tryReadJson(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  let requestPath;
  /** @type {Record<string, string> | undefined} */
  let humanAnswers;
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
    if (argument === "--human-answer" && !smoke && !humanAnswers && args[index + 1]) {
      const separator = args[index + 1].indexOf("=");
      const id = separator > 0 ? args[index + 1].slice(0, separator) : "";
      const answer = separator > 0 ? args[index + 1].slice(separator + 1) : "";
      if (!isSafeEvidenceId(id) || !isSingleLineText(answer, 120)) {
        throw new Error("--human-answer must use DECISION-ID=answer with safe single-line values.");
      }
      humanAnswers = { [id]: answer };
      index += 1;
      continue;
    }
    throw new Error(`Unknown Project Runtime argument: ${args.slice(index).join(" ")}`);
  }
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(runtimeDirectory, "..", "..");
  const report = await runEngineeringRun(
    target,
    requestPath ? { requestPath, ...(humanAnswers ? { humanAnswers } : {}) } : undefined,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "BLOCKED" || report.status === "HUMAN_GATE" ? 1 : 0;
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
