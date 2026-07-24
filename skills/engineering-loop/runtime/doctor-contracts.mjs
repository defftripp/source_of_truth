import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  computeMigrationManifestHash,
  isSafeProjectPath,
  sha256,
  validateAdoptionMatrix,
  validateRuntimeManifest,
  verifyFileChecksums,
} from "./contracts.mjs";
import { validateDeepPlanContract } from "./deep-contracts.mjs";

const MANIFEST_PATH = ".engineering/runtime/manifest.json";
const ADOPTION_PATH = ".engineering/runtime/upstream-adoption.json";
const PROJECT_STATE_PATH = ".engineering/state/project.json";
const REGISTRY_PATH = ".engineering/verification/registry.json";
const RUNS_PATH = ".engineering/runs";
const WINDOWS_POWERSHELL_PATH =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

/**
 * @param {{
 *   runId: string,
 *   repairAction: string,
 *   frontier: Array<string>,
 *   checkpointCommits: Array<string>,
 *   evidenceIds: Array<string>,
 *   gateKind?: string,
 *   gateId?: string,
 * }} input
 */
function unfinishedRunDiagnosis(input) {
  return {
    kind: "UNFINISHED_RUN",
    runId: input.runId,
    ownership: "PROJECT_RUNTIME",
    repairAction: input.repairAction,
    resumable: true,
    frontier: input.frontier,
    checkpointCommits: input.checkpointCommits,
    ...(input.gateKind ? { gateKind: input.gateKind, gateId: input.gateId } : {}),
    evidenceIds: input.evidenceIds,
  };
}

/** @param {string} targetInput */
export async function diagnoseRuntime(targetInput) {
  const target = path.resolve(targetInput);
  /** @type {Array<Record<string, unknown>>} */
  const evidence = [];
  /** @type {Array<Record<string, unknown>>} */
  const diagnoses = [];
  const seenRunIds = new Set();

  const manifest = await readRequiredJson(target, MANIFEST_PATH, evidence, "runtime-manifest");
  const manifestValidation = validateRuntimeManifest(manifest);
  evidence.push({
    id: "runtime-manifest-contract",
    status: manifestValidation.valid ? "PASS" : "INVALID",
    path: MANIFEST_PATH,
    details: manifestValidation.errors,
  });

  if (!manifestValidation.valid) {
    diagnoses.push({
      kind: "MISSING_EVIDENCE",
      ownership: "UNKNOWN",
      repairAction: "NONE",
      evidenceIds: evidence.map((entry) => entry.id),
    });
    return doctorReport("BLOCKED", evidence, diagnoses);
  }

  let manifestCommitConfirmed = false;
  let manifestOwnershipConfirmed = false;
  const committedManifestSource = await readGitBlob(target, "HEAD", MANIFEST_PATH);
  if (committedManifestSource) {
    let committedManifest = null;
    try {
      committedManifest = JSON.parse(committedManifestSource.toString("utf8"));
    } catch {
      // The evidence record below reports the invalid committed contract.
    }
    const committedValidation = validateRuntimeManifest(committedManifest);
    manifestCommitConfirmed =
      committedValidation.valid &&
      JSON.stringify(runtimeOwnershipContract(committedManifest)) ===
        JSON.stringify(runtimeOwnershipContract(manifest));
    manifestOwnershipConfirmed = manifest.schemaVersion === 2 && manifestCommitConfirmed;
    evidence.push({
      id: "runtime-manifest-ownership",
      status: manifestCommitConfirmed ? "PASS" : "INVALID",
      path: MANIFEST_PATH,
      revision: "HEAD",
      details: committedValidation.errors,
    });
  } else {
    evidence.push({
      id: "runtime-manifest-ownership",
      status: "MISSING",
      path: MANIFEST_PATH,
      revision: "HEAD",
      details: ["committed runtime ownership manifest is missing"],
    });
  }

  await inspectRuntimeFiles(
    target,
    manifest.files,
    evidence,
    diagnoses,
    manifestOwnershipConfirmed,
  );

  const matrix = await readRequiredJson(target, ADOPTION_PATH, evidence, "upstream-adoption");
  const matrixValidation = validateAdoptionMatrix(matrix);
  evidence.push({
    id: "upstream-adoption-contract",
    status: matrixValidation.valid ? "PASS" : "INVALID",
    path: ADOPTION_PATH,
    details: matrixValidation.errors,
  });
  if (matrixValidation.valid) {
    const upstreamChecksums = await verifyFileChecksums(
      target,
      matrix.entries
        .filter((/** @type {any} */ entry) => entry.adoption !== "EXCLUDE")
        .map((/** @type {any} */ entry) => ({ path: entry.artifact, sha256: entry.checksum })),
    );
    evidence.push({
      id: "upstream-adoption-checksums",
      status: upstreamChecksums.valid ? "PASS" : "INVALID",
      details: upstreamChecksums.errors,
    });
  }

  const projectState = await readRequiredJson(target, PROJECT_STATE_PATH, evidence, "project-state");
  const projectStateValid =
    projectState?.schemaVersion === 1 &&
    projectState.status === "PREPARED_PROJECT" &&
    projectState.runtimeVersion === manifest.runtimeVersion;
  evidence.push({
    id: "prepared-project-state",
    status: projectStateValid ? "PASS" : "INVALID",
    path: PROJECT_STATE_PATH,
  });

  const registry = await readRequiredJson(target, REGISTRY_PATH, evidence, "verification-registry");
  const smokeContract =
    registry?.checks?.find(
      (/** @type {any} */ check) => check.id === "prepared-project-smoke",
    ) ?? null;
  const smokeRegistered =
    registry?.schemaVersion === 1 &&
    Array.isArray(registry.checks) &&
    registry.checks.filter(
      (/** @type {any} */ check) => check.id === "prepared-project-smoke",
    ).length === 1 &&
    isPreparedProjectSmokeCommand(smokeContract?.command);
  const smokeExecutableEntries = manifest.files.filter(
    (/** @type {any} */ entry) =>
      entry.path === ".engineering/runtime/engine.mjs",
  );
  const smokeExecutableContractPinned =
    smokeExecutableEntries.length === 1 &&
    (manifest.schemaVersion === 1 ||
      (smokeExecutableEntries[0].ownership === "PROJECT_RUNTIME" &&
        smokeExecutableEntries[0].generated === true &&
        smokeExecutableEntries[0].protected === false));
  const smokeExecutableEvidencePinned =
    smokeExecutableContractPinned &&
    evidence.some(
      (entry) =>
        entry.id === "runtime-file:.engineering/runtime/engine.mjs" &&
        entry.status === "PASS",
    );
  const smokeDeferredForRepair =
    smokeRegistered &&
    manifestCommitConfirmed &&
    smokeExecutableContractPinned &&
    diagnoses.some((entry) => entry.repairAction === "AUTOMATIC_REPAIR");
  const smokeResult =
    smokeRegistered &&
    manifestCommitConfirmed &&
    smokeExecutableEvidencePinned &&
    evidence.every((entry) => entry.status === "PASS")
      ? await runPreparedProjectSmoke(target, smokeContract.command)
      : {
          status: smokeDeferredForRepair ? "DEFERRED" : "INVALID",
          details: [
            smokeDeferredForRepair
              ? "registered smoke is deferred until validated automatic repair completes"
              : !smokeExecutableContractPinned
              ? "prepared-project-smoke executable is not pinned by the runtime manifest"
              : smokeRegistered
              ? "registered smoke was not executed because pinned runtime evidence is incomplete"
              : "prepared-project-smoke command contract is invalid",
          ],
        };
  evidence.push({
    id: "prepared-project-verification",
    status: smokeResult.status,
    path: REGISTRY_PATH,
    verificationId: "prepared-project-smoke",
    command: smokeContract?.command ?? null,
    details: smokeResult.details,
  });

  let runEntries;
  try {
    runEntries = await readdir(path.join(target, ...RUNS_PATH.split("/")), {
      withFileTypes: true,
    });
    evidence.push({
      id: "run-state-store",
      status: "PASS",
      path: RUNS_PATH,
      entries: runEntries.length,
    });
    for (const entry of runEntries.sort((left, right) =>
      compareEvidenceIds(left.name, right.name),
    )) {
      if (entry.isDirectory()) {
        await inspectRun(
          path.join(target, ...RUNS_PATH.split("/"), entry.name),
          entry.name,
          evidence,
          diagnoses,
          seenRunIds,
        );
      } else if (entry.name !== ".gitkeep" || !entry.isFile()) {
        evidence.push({
          id: `run-entry:${entry.name}`,
          status: "INVALID",
          path: `${RUNS_PATH}/${entry.name}`,
          details: ["Run State Store entries must be real directories"],
        });
      }
    }
    await inspectRegisteredRunWorktrees(target, evidence, diagnoses, seenRunIds);
  } catch {
    evidence.push({ id: "run-state-store", status: "MISSING", path: RUNS_PATH });
  }

  const completeEvidence = evidence.every((entry) => entry.status === "PASS");
  if (completeEvidence && diagnoses.length === 0) {
    diagnoses.push({
      kind: "HEALTHY_PREPARED_PROJECT",
      ownership: "PROJECT_RUNTIME",
      repairAction: "NONE",
      evidenceIds: evidence.map((entry) => entry.id),
    });
    return doctorReport("READY", evidence, diagnoses);
  }
  const unexplainedEvidenceFailure = evidence.some(
    (entry) =>
      entry.status !== "PASS" &&
      !String(entry.id).startsWith("runtime-file:") &&
      !String(entry.id).startsWith("repair-source:") &&
      !(
        entry.id === "prepared-project-verification" &&
        entry.status === "DEFERRED" &&
        diagnoses.some((diagnosis) => diagnosis.repairAction === "AUTOMATIC_REPAIR")
      ),
  );
  const requiresHumanGate = diagnoses.some(
    (diagnosis) =>
      diagnosis.repairAction === "HUMAN_GATE" &&
      diagnosis.kind !== "UNFINISHED_RUN",
  );
  if (diagnoses.length === 0 || unexplainedEvidenceFailure) {
    diagnoses.push({
      kind: "MISSING_EVIDENCE",
      ownership: "UNKNOWN",
      repairAction: "NONE",
      evidenceIds: evidence.filter((entry) => entry.status !== "PASS").map((entry) => entry.id),
    });
  }
  return doctorReport(
    unexplainedEvidenceFailure || requiresHumanGate ? "BLOCKED" : "DEGRADED",
    evidence,
    diagnoses,
  );
}

/** @param {unknown} command */
function isPreparedProjectSmokeCommand(command) {
  if (command === "node .engineering/runtime/engine.mjs --smoke") {
    return true;
  }
  return (
    Array.isArray(command) &&
    command.length === 3 &&
    command[0] === "node" &&
    command[1] === ".engineering/runtime/engine.mjs" &&
    command[2] === "--smoke"
  );
}

/** @param {string} target @param {unknown} command */
function runPreparedProjectSmoke(target, command) {
  const invocation =
    typeof command === "string"
      ? ["node", ".engineering/runtime/engine.mjs", "--smoke"]
      : /** @type {Array<string>} */ (command);
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(process.execPath, invocation.slice(1), {
      cwd: target,
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    /** @param {{ status: string, details: string[] }} result */
    const finish = (result) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        status: "INVALID",
        details: ["registered smoke timed out after 30 seconds"],
      });
    }, 30_000);
    child.once("error", (error) => {
      finish({
        status: "INVALID",
        details: [
          `registered smoke could not start: ${
            error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "UNKNOWN"
          }`,
        ],
      });
    });
    child.once("close", (code, signal) => {
      finish(
        code === 0
          ? { status: "PASS", details: [] }
          : {
              status: "INVALID",
              details: [
                signal
                  ? `registered smoke terminated by signal ${signal}`
                  : `registered smoke exited with code ${code ?? "UNKNOWN"}`,
              ],
            },
      );
    });
  });
}

/**
 * @param {string} runRoot
 * @param {string} runId
 * @param {Array<Record<string, unknown>>} evidence
 * @param {Array<Record<string, unknown>>} diagnoses
 * @param {Set<string>} seenRunIds
 */
async function inspectRun(runRoot, runId, evidence, diagnoses, seenRunIds) {
  if (seenRunIds.has(runId)) {
    const evidenceId = `run-duplicate:${runId}`;
    evidence.push({
      id: evidenceId,
      status: "INVALID",
      path: `${RUNS_PATH}/${runId}`,
    });
    diagnoses.push({
      kind: "DUPLICATE_RUN_EVIDENCE",
      runId,
      path: `${RUNS_PATH}/${runId}`,
      ownership: "PROJECT_RUNTIME",
      repairAction: "HUMAN_GATE",
      evidenceIds: [evidenceId],
    });
    return;
  }
  seenRunIds.add(runId);
  const state = await tryReadJson(path.join(runRoot, "state.json"));
  const stateValid =
    state?.schemaVersion === 1 &&
    state.runId === runId &&
    ["STANDARD", "DEEP"].includes(state.mode) &&
    typeof state.branch === "string" &&
    /^[a-f0-9]{40}$/u.test(state.baseCommit) &&
    typeof state.currentState === "string" &&
    typeof state.terminal === "boolean" &&
    Array.isArray(state.history) &&
    state.history.every(
      (/** @type {any} */ entry, index) =>
        entry?.sequence === index + 1 &&
        typeof entry.state === "string" &&
        entry.state.length > 0 &&
        entry.status === "COMPLETE",
    );
  evidence.push({
    id: `run-state:${runId}`,
    status: stateValid ? "PASS" : state ? "INVALID" : "MISSING",
    path: `${RUNS_PATH}/${runId}/state.json`,
  });
  if (!stateValid) {
    return;
  }

  const graph = await tryReadJson(path.join(runRoot, "ticket-graph.json"));
  if (state.terminal) {
    const terminalValidation = await validateTerminalRun(runRoot, state, graph);
    evidence.push({
      id: `run-terminal:${runId}`,
      status: terminalValidation.valid ? "PASS" : "INVALID",
      path: `${RUNS_PATH}/${runId}/result.json`,
      details: terminalValidation.errors,
    });
    await inspectRemoteSync(
      runRoot,
      runId,
      state.branch,
      terminalValidation.checkpointCommits,
      terminalValidation.durableHead,
      "READY_FOR_HUMAN",
      evidence,
      diagnoses,
      terminalValidation.remoteSyncRequired,
    );
    return;
  }
  if (graph === null) {
    const humanGate = await tryReadJson(path.join(runRoot, "human-gate.json"));
    if (humanGate?.kind === "REMOTE_SYNC" && humanGate.status === "WAITING") {
      const remoteGateValidation = await validateRemoteSyncDurableHumanGate(
        runRoot,
        state,
        null,
        humanGate,
      );
      evidence.push({
        id: `run-human-gate:${runId}`,
        status: remoteGateValidation.valid ? "PASS" : "INVALID",
        path: `${RUNS_PATH}/${runId}/human-gate.json`,
        details: remoteGateValidation.errors,
      });
      if (remoteGateValidation.valid) {
        diagnoses.push(unfinishedRunDiagnosis({
          runId,
          repairAction: "HUMAN_GATE",
          frontier: [`HUMAN_GATE:${humanGate.id}`],
          checkpointCommits: [],
          gateKind: "REMOTE_SYNC",
          gateId: humanGate.id,
          evidenceIds: [`run-state:${runId}`, `run-human-gate:${runId}`],
        }));
      }
      await inspectRemoteSync(
        runRoot,
        runId,
        state.branch,
        [],
        remoteGateValidation.durableHead,
        "HUMAN_GATE",
        evidence,
        diagnoses,
        true,
      );
      return;
    }
    const gateValidation = await validateGraphlessHumanGate(runRoot, state, humanGate);
    evidence.push({
      id: `run-human-gate:${runId}`,
      status: gateValidation.valid ? "PASS" : humanGate ? "INVALID" : "MISSING",
      path: `${RUNS_PATH}/${runId}/human-gate.json`,
      details: gateValidation.errors,
    });
    if (gateValidation.valid && humanGate) {
      diagnoses.push(unfinishedRunDiagnosis({
        runId,
        repairAction: "HUMAN_GATE",
        frontier: [`HUMAN_GATE:${humanGate.id}`],
        checkpointCommits: [],
        gateKind: humanGate.kind,
        gateId: humanGate.id,
        evidenceIds: [`run-state:${runId}`, `run-human-gate:${runId}`],
      }));
    }
    await inspectRemoteSync(
      runRoot,
      runId,
      state.branch,
      [],
      gateValidation.valid ? (gateValidation.durableHead ?? null) : null,
      "HUMAN_GATE",
      evidence,
      diagnoses,
      gateValidation.remoteSyncRequired,
    );
    return;
  }
  const humanGate = await tryReadJson(path.join(runRoot, "human-gate.json"));
  if (humanGate?.kind === "REMOTE_SYNC" && humanGate.status === "WAITING") {
    const gateValidation = await validateRemoteSyncGate(runRoot, state, graph, humanGate);
    evidence.push({
      id: `run-human-gate:${runId}`,
      status: gateValidation.valid ? "PASS" : "INVALID",
      path: `${RUNS_PATH}/${runId}/human-gate.json`,
      details: gateValidation.errors,
    });
    if (gateValidation.valid) {
      diagnoses.push(unfinishedRunDiagnosis({
        runId,
        repairAction: "HUMAN_GATE",
        frontier: [`HUMAN_GATE:${humanGate.id}`],
        checkpointCommits: gateValidation.checkpointCommits,
        gateKind: "REMOTE_SYNC",
        gateId: humanGate.id,
        evidenceIds: [`run-state:${runId}`, `run-human-gate:${runId}`],
      }));
    }
    await inspectRemoteSync(
      runRoot,
      runId,
      state.branch,
      gateValidation.checkpointCommits,
      gateValidation.durableHead,
      "READY_FOR_HUMAN",
      evidence,
      diagnoses,
      true,
    );
    return;
  }
  if (
    state.mode === "DEEP" &&
    humanGate?.kind === "MIGRATION_MANIFEST" &&
    ["WAITING", "ANSWERED"].includes(humanGate.status)
  ) {
    const gateValidation = await validateDeepManifestGate(runRoot, state, graph, humanGate);
    evidence.push({
      id: `run-human-gate:${runId}`,
      status: gateValidation.valid ? "PASS" : "INVALID",
      path: `${RUNS_PATH}/${runId}/human-gate.json`,
      details: gateValidation.errors,
    });
    if (gateValidation.valid) {
      diagnoses.push(unfinishedRunDiagnosis({
        runId,
        repairAction: gateValidation.repairAction,
        frontier: gateValidation.frontier,
        checkpointCommits: [],
        ...(gateValidation.repairAction === "HUMAN_GATE"
          ? { gateKind: humanGate.kind, gateId: humanGate.id }
          : {}),
        evidenceIds: [`run-state:${runId}`, `run-human-gate:${runId}`],
      }));
    }
    await inspectRemoteSync(
      runRoot,
      runId,
      state.branch,
      [],
      gateValidation.valid
        ? (gateValidation.remoteSyncHead ?? gateValidation.durableHead)
        : null,
      "HUMAN_GATE",
      evidence,
      diagnoses,
      gateValidation.remoteSyncRequired,
    );
    return;
  }
  const graphValidation = await validateRunFrontier(runRoot, state, graph);
  evidence.push({
    id: `run-frontier:${runId}`,
    status: graphValidation.valid ? "PASS" : graph ? "INVALID" : "MISSING",
    path: `${RUNS_PATH}/${runId}/ticket-graph.json`,
    details: graphValidation.errors,
  });
  if (graphValidation.valid) {
    diagnoses.push(unfinishedRunDiagnosis({
      runId,
      repairAction: "RESUME",
      frontier: graphValidation.frontier,
      checkpointCommits: graphValidation.checkpointCommits,
      evidenceIds: [`run-state:${runId}`, `run-frontier:${runId}`],
    }));
  }

  await inspectRemoteSync(
    runRoot,
    runId,
    state.branch,
    graphValidation.checkpointCommits,
    graphValidation.durableHead,
    null,
    evidence,
    diagnoses,
    graphValidation.remoteSyncRequired,
  );
}

/**
 * @param {string} runRoot
 * @param {string} runId
 * @param {string} branch
 * @param {string[]} checkpointCommits
 * @param {string | null} durableHead
 * @param {"HUMAN_GATE" | "READY_FOR_HUMAN" | null} requiredStage
 * @param {Array<Record<string, unknown>>} evidence
 * @param {Array<Record<string, unknown>>} diagnoses
 * @param {boolean} [required]
 */
async function inspectRemoteSync(
  runRoot,
  runId,
  branch,
  checkpointCommits,
  durableHead,
  requiredStage,
  evidence,
  diagnoses,
  required = false,
) {
  const remoteSync = await tryReadJson(path.join(runRoot, "remote-sync.json"));
  if (remoteSync === null && required) {
    evidence.push({
      id: `remote-sync:${runId}`,
      status: "MISSING",
      path: `${RUNS_PATH}/${runId}/remote-sync.json`,
      details: ["required Remote Checkpoint Sync evidence is missing"],
    });
    diagnoses.push({
      kind: "REMOTE_SYNC_PROBLEM",
      runId,
      ownership: "PROJECT_RUNTIME",
      repairAction: "HUMAN_GATE",
      remote: null,
      branch,
      reason: "REMOTE_SYNC_EVIDENCE_MISSING",
      localHead: durableHead,
      remoteHead: null,
      evidenceIds: [`remote-sync:${runId}`],
    });
    return;
  }
  if (remoteSync !== null) {
    const remoteValidation = validateRemoteSyncEvidence(
      remoteSync,
      branch,
      checkpointCommits,
      durableHead,
      requiredStage,
    );
    evidence.push({
      id: `remote-sync:${runId}`,
      status: remoteValidation.valid ? "PASS" : "INVALID",
      path: `${RUNS_PATH}/${runId}/remote-sync.json`,
      observedStatus: remoteSync.status,
      details: remoteValidation.errors,
    });
    if (!remoteValidation.valid || remoteSync.status !== "PASS") {
      diagnoses.push({
        kind: "REMOTE_SYNC_PROBLEM",
        runId,
        ownership: "PROJECT_RUNTIME",
        repairAction: "HUMAN_GATE",
        remote: remoteSync.remote ?? null,
        branch: remoteSync.branch ?? branch,
        reason: remoteValidation.valid
          ? remoteSync.blocker.reason
          : "REMOTE_SYNC_EVIDENCE_INVALID",
        localHead: remoteSync.blocker?.localHead ?? null,
        remoteHead: remoteSync.blocker?.remoteHead ?? null,
        evidenceIds: [`remote-sync:${runId}`],
      });
    }
  }
}

/** @param {string} runRoot @param {Record<string, any>} state @param {Record<string, any> | null} humanGate */
async function validateGraphlessHumanGate(runRoot, state, humanGate) {
  /** @type {string[]} */
  const errors = [];
  if (
    !humanGate ||
    humanGate.schemaVersion !== 1 ||
    state.mode !== "STANDARD" ||
    humanGate.kind !== "DECISION" ||
    humanGate.status !== "WAITING" ||
    typeof humanGate.id !== "string" ||
    humanGate.id.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(humanGate.requestHash) ||
    state.currentState !== "HUMAN_GATE"
  ) {
    return { valid: false, errors: ["durable Human Gate contract is incomplete"] };
  }
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  const [branch, head, parents, subject] = await Promise.all([
    runGitText(worktree, ["branch", "--show-current"]),
    runGitText(worktree, ["rev-parse", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%P", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%s", "HEAD"]),
  ]);
  if (
    branch !== state.branch ||
    !head ||
    parents !== state.baseCommit ||
    !subject?.includes(`record ${state.mode} Human Gate ${humanGate.id}`)
  ) {
    errors.push("durable Human Gate Git checkpoint does not match run state");
  }
  errors.push(
    ...(await validateRequiredJsonArtifacts(
      runRoot,
      [
        "human-gate.json",
        "research.json",
        "state.json",
        "task-profile.json",
        "verification.json",
      ],
      { state, humanGate },
    )),
  );
  if (head) {
    errors.push(
      ...(await validateCommittedArtifactProof(runRoot, head, [
        "human-gate.json",
        "research.json",
        "state.json",
        "task-profile.json",
        "verification.json",
      ])),
    );
  }
  const committedRemoteSync = head
    ? await readGitJson(worktree, head, `${artifactPath}/remote-sync.json`)
    : null;
  return {
    valid: errors.length === 0,
    errors,
    durableHead: head && /^[a-f0-9]{40}$/u.test(head) ? head : null,
    remoteSyncRequired: committedRemoteSync?.enabled === true,
  };
}

/**
 * @param {string} runRoot
 * @param {Record<string, any>} state
 * @param {Record<string, any>} graph
 * @param {Record<string, any>} humanGate
 */
async function validateDeepManifestGate(runRoot, state, graph, humanGate) {
  /** @type {string[]} */
  const errors = [];
  if (
    humanGate.schemaVersion !== 1 ||
    !["WAITING", "ANSWERED"].includes(humanGate.status) ||
    typeof humanGate.id !== "string" ||
    humanGate.id.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(humanGate.requestHash) ||
    !/^[a-f0-9]{64}$/u.test(humanGate.manifestHash) ||
    graph.schemaVersion !== 1 ||
    graph.runId !== state.runId ||
    graph.branch !== state.branch ||
    graph.baseCommit !== state.baseCommit ||
    graph.requestHash !== humanGate.requestHash ||
    graph.decisionCommit !== null ||
    !Array.isArray(graph.executionOrder) ||
    graph.executionOrder.length !== 0 ||
    !Array.isArray(graph.tickets)
  ) {
    errors.push("durable DEEP Migration Manifest gate contract is incomplete");
  }
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  const remoteSyncProjectPath = `${artifactPath}/remote-sync.json`;
  const [branch, head, parents, subject, status] = await Promise.all([
    runGitText(worktree, ["branch", "--show-current"]),
    runGitText(worktree, ["rev-parse", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%P", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%s", "HEAD"]),
    runGitText(worktree, ["status", "--porcelain"]),
  ]);
  if (humanGate.status === "WAITING") {
    const statusSafe = gitStatusContainsOnly(status, [remoteSyncProjectPath]);
    if (
      state.currentState !== "HUMAN_GATE" ||
      branch !== state.branch ||
      !head ||
      parents !== state.baseCommit ||
      !statusSafe ||
      !subject?.includes(`record DEEP Human Gate ${humanGate.id}`)
    ) {
      errors.push(
        "durable DEEP Migration Manifest Git checkpoint does not match run state" +
          (statusSafe ? "" : `; unexpected Git status: ${status}`),
      );
    }
  } else {
    const [parentSubject, parentParents, waitingGate, approval] = await Promise.all([
      parents ? runGitText(worktree, ["show", "-s", "--format=%s", parents]) : null,
      parents ? runGitText(worktree, ["show", "-s", "--format=%P", parents]) : null,
      parents
        ? readGitJson(
            worktree,
            parents,
            `${RUNS_PATH}/${state.runId}/human-gate.json`,
          )
        : null,
      tryReadJson(path.join(runRoot, "manifest-approval.json")),
    ]);
    if (
      state.currentState !== "MANIFEST_APPROVED" ||
      branch !== state.branch ||
      !head ||
      status !== "" ||
      !subject?.includes(`record DEEP Migration Manifest approval (${state.runId})`) ||
      !parentSubject?.includes(`record DEEP Human Gate ${humanGate.id}`) ||
      parentParents !== state.baseCommit ||
      waitingGate?.status !== "WAITING" ||
      waitingGate.requestHash !== humanGate.requestHash ||
      waitingGate.manifestHash !== humanGate.manifestHash ||
      humanGate.answer?.value !== humanGate.manifestHash ||
      approval?.schemaVersion !== 1 ||
      approval.approved !== true ||
      approval.manifestHash !== humanGate.manifestHash
    ) {
      errors.push("durable DEEP Migration Manifest approval checkpoint is invalid");
    }
  }
  errors.push(
    ...(await validateRequiredJsonArtifacts(
      runRoot,
      [
        "domain-decisions.json",
        "domain-model.json",
        "human-gate.json",
        "migration-contract.json",
        "migration-manifest.json",
        ...(humanGate.status === "ANSWERED" ? ["manifest-approval.json"] : []),
        "research.json",
        "rollback-plan.json",
        "spec-lite.json",
        "state.json",
        "task-profile.json",
        "ticket-graph.json",
        "verification.json",
      ],
      { state, graph, humanGate },
    )),
  );
  if (head) {
    errors.push(
      ...(await validateCommittedArtifactProof(runRoot, head, [
        "domain-decisions.json",
        "domain-model.json",
        "human-gate.json",
        "migration-contract.json",
        "migration-manifest.json",
        ...(humanGate.status === "ANSWERED" ? ["manifest-approval.json"] : []),
        "research.json",
        "rollback-plan.json",
        "spec-lite.json",
        "state.json",
        "task-profile.json",
        "ticket-graph.json",
        "verification.json",
      ])),
    );
  }
  const committedRemoteSync = head
    ? await readGitJson(worktree, head, `${artifactPath}/remote-sync.json`)
    : null;
  return {
    valid: errors.length === 0,
    errors,
    durableHead: head && /^[a-f0-9]{40}$/u.test(head) ? head : null,
    repairAction: humanGate.status === "WAITING" ? "HUMAN_GATE" : "RESUME",
    frontier:
      humanGate.status === "WAITING"
        ? [`HUMAN_GATE:${humanGate.id}`]
        : ["APPROVAL_CHECKPOINT"],
    remoteSyncRequired: committedRemoteSync?.enabled === true,
    remoteSyncHead: humanGate.status === "ANSWERED" ? parents : head,
  };
}

/** @param {string} runRoot @param {Record<string, any>} state @param {Record<string, any> | null} graph */
async function validateTerminalRun(runRoot, state, graph) {
  /** @type {string[]} */
  const errors = [];
  if (
    !graph ||
    state.currentState !== "READY_FOR_HUMAN" ||
    state.history.at(-1)?.state !== "READY_FOR_HUMAN"
  ) {
    errors.push("terminal run state is not a durable READY_FOR_HUMAN state");
  }
  const graphValidation = await validateRunFrontier(runRoot, state, graph, {
    readinessCommit: true,
  });
  errors.push(...graphValidation.errors);
  const result = await tryReadJson(path.join(runRoot, "result.json"));
  if (
    !result ||
    result.schemaVersion !== 1 ||
    result.status !== "READY_FOR_HUMAN" ||
    result.terminal !== true ||
    result.accepted !== false ||
    result.releaseStateReached !== true ||
    result.mode !== state.mode ||
    result.branch !== state.branch ||
    result.baseCommit !== state.baseCommit ||
    result.checkpointCommit !== graphValidation.checkpointCommits.at(-1) ||
    JSON.stringify(result.checkpointCommits) !==
      JSON.stringify(graphValidation.checkpointCommits)
  ) {
    errors.push("terminal result does not match the durable ticket frontier");
  }
  if (graphValidation.durableHead) {
    errors.push(
      ...(await validateCommittedArtifactProof(runRoot, graphValidation.durableHead, [
        "result.json",
        "state.json",
        "ticket-graph.json",
      ])),
    );
  }
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  const committedRemoteSync = graphValidation.durableHead
    ? await readGitJson(
        worktree,
        graphValidation.durableHead,
        `${artifactPath}/remote-sync.json`,
      )
    : null;
  return {
    valid: errors.length === 0,
    errors,
    checkpointCommits: graphValidation.checkpointCommits,
    durableHead: errors.length === 0 ? graphValidation.durableHead : null,
    remoteSyncRequired: committedRemoteSync?.enabled === true,
  };
}

/**
 * @param {string} runRoot
 * @param {Record<string, any>} state
 * @param {Record<string, any> | null} graph
 * @param {Record<string, any>} humanGate
 */
async function validateRemoteSyncDurableHumanGate(
  runRoot,
  state,
  graph,
  humanGate,
) {
  /** @type {string[]} */
  const errors = [];
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  const [branch, head, parents, subject, status] = await Promise.all([
    runGitText(worktree, ["branch", "--show-current"]),
    runGitText(worktree, ["rev-parse", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%P", "HEAD"]),
    runGitText(worktree, ["show", "-s", "--format=%s", "HEAD"]),
    runGitText(worktree, ["status", "--porcelain"]),
  ]);
  const [committedGate, committedState] = head
    ? await Promise.all([
        readGitJson(worktree, head, `${artifactPath}/human-gate.json`),
        readGitJson(worktree, head, `${artifactPath}/state.json`),
      ])
    : [null, null];
  const expectedGateKind = state.mode === "STANDARD" ? "DECISION" : "MIGRATION_MANIFEST";
  if (
    branch !== state.branch ||
    !head ||
    parents !== state.baseCommit ||
    !committedGate ||
    committedGate.kind !== expectedGateKind ||
    committedGate.status !== "WAITING" ||
    committedGate.requestHash !== humanGate.requestHash ||
    committedState?.currentState !== "HUMAN_GATE" ||
    committedState.terminal !== false ||
    !subject?.includes(`record ${state.mode} Human Gate ${committedGate.id}`) ||
    !gitStatusContainsOnly(status, [
      `${artifactPath}/human-gate.json`,
      `${artifactPath}/remote-sync.json`,
      `${artifactPath}/result.json`,
      `${artifactPath}/state.json`,
    ])
  ) {
    errors.push(
      "Remote Sync gate is not bound to a durable Human Gate commit" +
        `; branch=${branch}; parents=${parents}; subject=${subject}; status=${status}`,
    );
  }
  errors.push(
    ...(await validateRequiredJsonArtifacts(
      runRoot,
      ["human-gate.json", "result.json", "state.json"],
      { state, graph: graph ?? undefined, humanGate },
    )),
  );
  const immutableNames =
    state.mode === "DEEP"
      ? [
          "domain-decisions.json",
          "domain-model.json",
          "migration-contract.json",
          "migration-manifest.json",
          "research.json",
          "rollback-plan.json",
          "spec-lite.json",
          "task-profile.json",
          "ticket-graph.json",
          "verification.json",
        ]
      : ["research.json", "task-profile.json", "verification.json"];
  errors.push(
    ...(await validateRequiredJsonArtifacts(
      runRoot,
      immutableNames,
      { state, graph: graph ?? undefined },
    )),
  );
  if (head) {
    errors.push(...(await validateCommittedArtifactProof(runRoot, head, immutableNames)));
  }
  if (state.mode === "DEEP") {
    const manifest = await tryReadJson(path.join(runRoot, "migration-manifest.json"));
    if (
      !graph ||
      graph.executionOrder?.length !== 0 ||
      !manifest ||
      !validateDeepMigrationManifest(manifest) ||
      manifest.hash !== committedGate?.manifestHash
    ) {
      errors.push("Remote Sync gate changed the durable DEEP manifest scope");
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    checkpointCommits: [],
    durableHead:
      errors.length === 0 && head && /^[a-f0-9]{40}$/u.test(head) ? head : null,
    remoteSyncRequired: true,
  };
}

/**
 * @param {string} runRoot
 * @param {Record<string, any>} state
 * @param {Record<string, any>} graph
 * @param {Record<string, any>} humanGate
 */
async function validateRemoteSyncGate(runRoot, state, graph, humanGate) {
  /** @type {string[]} */
  const errors = [];
  if (
    state.currentState !== "HUMAN_GATE" ||
    humanGate.schemaVersion !== 1 ||
    humanGate.kind !== "REMOTE_SYNC" ||
    humanGate.status !== "WAITING" ||
    !isEvidenceId(humanGate.id) ||
    humanGate.requestHash !== graph?.requestHash
  ) {
    errors.push("Remote Sync Human Gate contract is incomplete");
  }
  const checkpointValidation = await validateRunFrontier(runRoot, state, graph);
  const readinessValidation = checkpointValidation.valid
    ? null
    : await validateRunFrontier(runRoot, state, graph, {
        readinessCommit: true,
      });
  const durableHumanGateValidation =
    !checkpointValidation.valid && !readinessValidation?.valid
      ? await validateRemoteSyncDurableHumanGate(
          runRoot,
          state,
          graph,
          humanGate,
        )
      : null;
  if (durableHumanGateValidation?.valid) {
    return {
      ...durableHumanGateValidation,
      valid: errors.length === 0,
      errors,
    };
  }
  const graphValidation =
    checkpointValidation.valid ? checkpointValidation : readinessValidation;
  if (!graphValidation?.valid) {
    errors.push(
      ...(durableHumanGateValidation?.errors ??
        readinessValidation?.errors ??
        checkpointValidation.errors),
    );
  }
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  const committedState = graphValidation?.durableHead
    ? await readGitJson(
        worktree,
        graphValidation.durableHead,
        `${artifactPath}/state.json`,
      )
    : null;
  const committedResult = graphValidation?.durableHead
    ? await readGitJson(
        worktree,
        graphValidation.durableHead,
        `${artifactPath}/result.json`,
      )
    : null;
  if (readinessValidation?.valid) {
    if (
      committedState?.terminal !== true ||
      committedState.currentState !== "READY_FOR_HUMAN" ||
      committedResult?.status !== "READY_FOR_HUMAN" ||
      committedResult.terminal !== true
    ) {
      errors.push("Remote Sync Human Gate lacks its durable readiness commit");
    }
  } else if (
    !checkpointValidation.valid ||
    humanGate.createdFromState === "READY_FOR_HUMAN"
  ) {
    errors.push("Remote Sync Human Gate does not match its checkpoint stage");
  }
  errors.push(
    ...(await validateRequiredJsonArtifacts(
      runRoot,
      ["human-gate.json", "result.json", "state.json", "ticket-graph.json"],
      { state, graph, humanGate },
    )),
  );
  return {
    valid: errors.length === 0,
    errors,
    checkpointCommits: graphValidation?.checkpointCommits ?? [],
    durableHead: errors.length === 0 ? (graphValidation?.durableHead ?? null) : null,
  };
}

/**
 * @param {Record<string, any>} value
 * @param {string} branch
 * @param {string[]} checkpointCommits
 * @param {string | null} durableHead
 * @param {"HUMAN_GATE" | "READY_FOR_HUMAN" | null} requiredStage
 */
function validateRemoteSyncEvidence(
  value,
  branch,
  checkpointCommits,
  durableHead,
  requiredStage,
) {
  /** @type {string[]} */
  const errors = [];
  if (
    value.schemaVersion !== 1 ||
    value.enabled !== true ||
    typeof value.remote !== "string" ||
    value.remote.length === 0 ||
    value.branch !== branch ||
    !["PASS", "HUMAN_GATE"].includes(value.status) ||
    !Array.isArray(value.checkpoints)
  ) {
    errors.push("Remote Checkpoint Sync evidence has an invalid base contract");
    return { valid: false, errors };
  }
  const checkpointEvidenceValid = value.checkpoints.every(
    (/** @type {any} */ entry) =>
      entry?.stage === "CHECKPOINT" &&
      entry.status === "PASS" &&
      /^[a-f0-9]{40}$/u.test(entry.localHead) &&
      entry.remoteHead === entry.localHead,
  );
  if (!checkpointEvidenceValid) {
    errors.push("Remote Checkpoint Sync checkpoint evidence is invalid");
  }
  const evidenceHeads = value.checkpoints.map(
    (/** @type {any} */ entry) => entry.localHead,
  );
  const expectedHeads =
    value.status === "PASS"
      ? checkpointCommits
      : checkpointCommits.slice(0, evidenceHeads.length);
  if (JSON.stringify(evidenceHeads) !== JSON.stringify(expectedHeads)) {
    errors.push("Remote Checkpoint Sync evidence is not graph-ordered and complete");
  }
  if (value.status === "PASS" && !durableHead) {
    errors.push("Remote Checkpoint Sync PASS lacks a valid durable Git head");
  }
  if (
    value.status === "PASS" &&
    requiredStage === "HUMAN_GATE" &&
    (!value.humanGate ||
      value.humanGate.stage !== "HUMAN_GATE" ||
      value.humanGate.status !== "PASS" ||
      value.humanGate.localHead !== durableHead ||
      value.humanGate.remoteHead !== durableHead)
  ) {
    errors.push("Remote Checkpoint Sync PASS lacks durable Human Gate evidence");
  }
  if (
    value.status === "PASS" &&
    requiredStage === "READY_FOR_HUMAN" &&
    (!value.readyForHuman ||
      value.readyForHuman.stage !== "READY_FOR_HUMAN" ||
      value.readyForHuman.status !== "PASS" ||
      value.readyForHuman.localHead !== durableHead ||
      value.readyForHuman.remoteHead !== durableHead)
  ) {
    errors.push("Remote Checkpoint Sync PASS lacks durable READY_FOR_HUMAN evidence");
  }
  if (
    value.status === "HUMAN_GATE" &&
    (!value.blocker ||
      typeof value.blocker.reason !== "string" ||
      value.blocker.reason.length === 0 ||
      !/^[a-f0-9]{40}$/u.test(value.blocker.localHead) ||
      !durableHead ||
      value.blocker.localHead !==
        (checkpointCommits[evidenceHeads.length] ?? durableHead) ||
      (value.blocker.remoteHead !== null &&
        !/^[a-f0-9]{40}$/u.test(value.blocker.remoteHead)))
  ) {
    errors.push("Remote Checkpoint Sync Human Gate blocker is incomplete");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {string} runRoot
 * @param {string[]} names
 * @param {{ state?: Record<string, any>, graph?: Record<string, any>, humanGate?: Record<string, any>, advisor?: Record<string, any> }} [context]
 */
async function validateRequiredJsonArtifacts(runRoot, names, context = {}) {
  /** @type {string[]} */
  const errors = [];
  for (const name of names) {
    try {
      const stats = await lstat(path.join(runRoot, name));
      if (!stats.isFile() || stats.isSymbolicLink()) {
        errors.push(`required Run Artifact is unsafe: ${name}`);
        continue;
      }
      const value = JSON.parse(await readFile(path.join(runRoot, name), "utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length === 0 ||
        (value.schemaVersion !== undefined && value.schemaVersion !== 1)
      ) {
        errors.push(`required Run Artifact contract is invalid: ${name}`);
      } else {
        errors.push(...validateRunArtifactContract(name, value, context));
      }
    } catch {
      errors.push(`required Run Artifact is missing or invalid: ${name}`);
    }
  }
  return errors;
}

/**
 * @param {string} name
 * @param {Record<string, any>} value
 * @param {{ state?: Record<string, any>, graph?: Record<string, any>, humanGate?: Record<string, any>, advisor?: Record<string, any> }} context
 */
function validateRunArtifactContract(name, value, context) {
  /** @type {string[]} */
  const errors = [];
  const invalid = () => errors.push(`required Run Artifact semantic contract is invalid: ${name}`);
  if (name === "state.json") {
    if (!context.state || JSON.stringify(value) !== JSON.stringify(context.state)) {
      invalid();
    }
    return errors;
  }
  if (name === "ticket-graph.json") {
    if (!context.graph || JSON.stringify(value) !== JSON.stringify(context.graph)) {
      invalid();
    }
    return errors;
  }
  if (name === "human-gate.json") {
    if (
      !context.humanGate ||
      JSON.stringify(value) !== JSON.stringify(context.humanGate) ||
      !["DECISION", "MIGRATION_MANIFEST", "REMOTE_SYNC"].includes(value.kind) ||
      !["WAITING", "ANSWERED"].includes(value.status) ||
      !isEvidenceId(value.id) ||
      !/^[a-f0-9]{64}$/u.test(value.requestHash)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "research.json") {
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.facts) ||
      value.facts.length === 0 ||
      !value.facts.every(
        (/** @type {any} */ fact) =>
          fact &&
          isEvidenceId(fact.id) &&
          typeof fact.statement === "string" &&
          fact.statement.length > 0 &&
          isNonEmptyStringArray(fact.evidence) &&
          Array.isArray(fact.answersDecisionQuestions) &&
          fact.answersDecisionQuestions.every(isEvidenceId),
      )
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "task-profile.json") {
    if (
      value.schemaVersion !== 1 ||
      !["FAST", "STANDARD", "DEEP"].includes(value.selectedMode) ||
      value.selectedMode !== context.state?.mode ||
      !["FAST", "STANDARD", "DEEP"].includes(value.hardFloor) ||
      typeof value.rationale !== "string" ||
      value.rationale.length === 0 ||
      !value.taskEvidence ||
      typeof value.taskEvidence !== "object" ||
      Array.isArray(value.taskEvidence)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "verification.json") {
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.checks) ||
      !value.checks.every(
        (/** @type {any} */ check) =>
          check &&
          isEvidenceId(check.id) &&
          typeof check.role === "string" &&
          check.role.length > 0 &&
          ["PASS", "FAIL"].includes(check.status) &&
          Number.isInteger(check.exitCode),
      )
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "advisor.json") {
    if (
      value.schemaVersion !== 1 ||
      value.status !== "APPROVED" ||
      !isNonEmptyStringArray(value.ticketIds) ||
      !isNonEmptyStringArray(value.evidence) ||
      !Array.isArray(value.concerns) ||
      value.concerns.length !== 0 ||
      value.ticketIds.some(
        (/** @type {string} */ id) =>
          !context.graph?.tickets?.some((/** @type {any} */ ticket) => ticket?.id === id),
      )
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "advisor-rounds.json") {
    const findingCodes = new Set([
      "MISSING_VERIFICATION",
      "SCOPE_LEAK",
      "UNMAPPED_ACCEPTANCE",
      "UNSAFE_DEPENDENCY",
      "UNSUPPORTED_ASSUMPTION",
    ]);
    const validFinding = (/** @type {any} */ finding) =>
      finding &&
      JSON.stringify(Object.keys(finding).sort()) ===
        JSON.stringify(["code", "evidenceIds", "id", "message", "ticketId"]) &&
      isEvidenceId(finding.id) &&
      findingCodes.has(finding.code) &&
      typeof finding.message === "string" &&
      finding.message.length > 0 &&
      (finding.ticketId === null || isEvidenceId(finding.ticketId)) &&
      isNonEmptyStringArray(finding.evidenceIds) &&
      finding.evidenceIds.every(isEvidenceId);
    if (
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(["maxRounds", "rounds", "schemaVersion"]) ||
      value.schemaVersion !== 1 ||
      value.maxRounds !== 2 ||
      !Array.isArray(value.rounds) ||
      value.rounds.length < 1 ||
      value.rounds.length > value.maxRounds ||
      !value.rounds.every(
        (/** @type {any} */ round, /** @type {number} */ index) =>
          round &&
          JSON.stringify(Object.keys(round).sort()) ===
            JSON.stringify(["concerns", "round", "status"]) &&
          round.round === index + 1 &&
          ["APPROVED", "REVISE"].includes(round.status) &&
          Array.isArray(round.concerns) &&
          (
            round.status === "APPROVED"
              ? round.concerns.length === 0
              : round.concerns.length > 0 && round.concerns.every(validFinding)
          ),
      ) ||
      value.rounds.some(
        (/** @type {any} */ round, /** @type {number} */ index) =>
          round.status === "APPROVED" && index !== value.rounds.length - 1,
      ) ||
      value.rounds.at(-1)?.status !== "APPROVED" ||
      context.advisor?.status !== "APPROVED" ||
      JSON.stringify(value.rounds.at(-1)?.concerns) !==
        JSON.stringify(context.advisor?.concerns)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "spec-lite.json") {
    if (
      value.schemaVersion !== 1 ||
      typeof value.taskSummary !== "string" ||
      value.taskSummary.length === 0 ||
      !isNonEmptyStringArray(value.evidenceBackedFacts) ||
      !Array.isArray(value.acceptanceCriteria) ||
      value.acceptanceCriteria.length === 0 ||
      !Array.isArray(value.testingSeams) ||
      value.testingSeams.length === 0
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "ticket.json") {
    if (
      value.schemaVersion !== 1 ||
      !isEvidenceId(value.id) ||
      typeof value.objective !== "string" ||
      value.objective.length === 0 ||
      !isNonEmptyStringArray(value.acceptanceCriteria) ||
      !isNonEmptyStringArray(value.verificationIds) ||
      !Array.isArray(value.dependencies) ||
      !isNonEmptyStringArray(value.writeLease) ||
      !isNonEmptyStringArray(value.contextPaths) ||
      !context.graph?.tickets?.some((/** @type {any} */ ticket) => ticket?.id === value.id)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "context-packet.json") {
    if (
      value.schemaVersion !== 1 ||
      !isEvidenceId(value.ticketId) ||
      !Number.isInteger(value.attempt) ||
      value.attempt < 1 ||
      !isNonEmptyStringArray(value.factIds) ||
      !isNonEmptyStringArray(value.acceptanceCriteria) ||
      !isNonEmptyStringArray(value.verificationIds) ||
      !isNonEmptyStringArray(value.contextPaths) ||
      !isNonEmptyStringArray(value.writeLease) ||
      typeof value.workerWorktree !== "string" ||
      value.workerWorktree.length === 0 ||
      value.rootWriter !== false ||
      value.workerMayCommit !== false ||
      value.workerMaySpawnSubagents !== false
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "domain-decisions.json") {
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.decisions) ||
      value.decisions.length === 0 ||
      !value.decisions.every(
        (/** @type {any} */ decision) =>
          decision &&
          isEvidenceId(decision.id) &&
          ["CONTEXT", "ADR"].includes(decision.record) &&
          typeof decision.statement === "string" &&
          decision.statement.length > 0 &&
          isNonEmptyStringArray(decision.boundaryIds) &&
          isNonEmptyStringArray(decision.evidenceIds),
      ) ||
      !Array.isArray(value.contextPaths)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "domain-model.json") {
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.boundaries) ||
      value.boundaries.length === 0 ||
      !value.boundaries.every(
        (/** @type {any} */ boundary) =>
          boundary &&
          isEvidenceId(boundary.id) &&
          typeof boundary.name === "string" &&
          boundary.name.length > 0 &&
          isNonEmptyStringArray(boundary.evidenceIds),
      )
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "migration-contract.json") {
    if (
      !isEvidenceId(value.id) ||
      !isNonEmptyStringArray(value.preconditions) ||
      !isNonEmptyStringArray(value.postconditions)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "rollback-plan.json") {
    if (
      !isEvidenceId(value.id) ||
      !isNonEmptyStringArray(value.triggerConditions) ||
      !isNonEmptyStringArray(value.steps) ||
      !isNonEmptyStringArray(value.verificationIds)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "parallel-execution.json") {
    if (value.schemaVersion !== 1 || !Array.isArray(value.batches)) {
      invalid();
    }
    return errors;
  }
  if (name === "migration-manifest.json") {
    if (
      !validateDeepMigrationManifest(value) ||
      (context.humanGate && value.hash !== context.humanGate.manifestHash)
    ) {
      invalid();
    }
    return errors;
  }
  if (name === "manifest-approval.json") {
    if (
      value.schemaVersion !== 1 ||
      value.approved !== true ||
      !/^[a-f0-9]{64}$/u.test(value.manifestHash)
    ) {
      invalid();
    }
  }
  return errors;
}

/** @param {Record<string, any>} value */
function validateDeepMigrationManifest(value) {
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "MIGRATION_MANIFEST" ||
    value.hashAlgorithm !== "sha256" ||
    !Array.isArray(value.actions) ||
    value.actions.length === 0 ||
    new Set(value.actions.map((/** @type {any} */ action) => action?.path)).size !==
      value.actions.length
  ) {
    return false;
  }
  const actionsValid = value.actions.every((/** @type {any} */ action) => {
    if (
      !action ||
      !["MOVE", "REWRITE", "DELETE"].includes(action.action) ||
      !isSafeProjectPath(action.path) ||
      !/^[a-f0-9]{64}$/u.test(action.sourceSha256)
    ) {
      return false;
    }
    if (action.action === "MOVE") {
      return isSafeProjectPath(action.destination) && action.contentSha256 === undefined;
    }
    if (action.action === "REWRITE") {
      return (
        /^[a-f0-9]{64}$/u.test(action.contentSha256) &&
        action.destination === undefined
      );
    }
    return action.destination === undefined && action.contentSha256 === undefined;
  });
  return actionsValid && value.hash === computeMigrationManifestHash(value.actions);
}

/** @param {unknown} value */
function isEvidenceId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

/** @param {unknown} value */
function isNonEmptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

/** @param {string} runRoot @param {string} revision @param {string[]} names */
async function validateCommittedArtifactProof(runRoot, revision, names) {
  /** @type {string[]} */
  const errors = [];
  const worktree = path.resolve(runRoot, "..", "..", "..");
  const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
  for (const name of names) {
    const [current, committed] = await Promise.all([
      readFile(path.join(runRoot, name)).catch(() => null),
      readGitBlob(worktree, revision, `${artifactPath}/${name}`),
    ]);
    if (!current || !committed || !current.equals(committed)) {
      errors.push(`Run Artifact does not match durable Git evidence: ${name}`);
    }
  }
  return errors;
}

/**
 * @param {string} runRoot
 * @param {Record<string, any>} state
 * @param {Record<string, any>} graph
 * @param {string | null} durableRevision
 */
async function validateGraphRunArtifacts(runRoot, state, graph, durableRevision) {
  /** @type {string[]} */
  const errors = [];
  const requiredNames = [
    "advisor.json",
    "context-packet.json",
    "research.json",
    "spec-lite.json",
    "state.json",
    "task-profile.json",
    "ticket-graph.json",
    "ticket.json",
    "verification.json",
    ...(state.mode === "DEEP"
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
  errors.push(
    ...(await validateRequiredJsonArtifacts(runRoot, requiredNames, { state, graph })),
  );
  const advisor = await tryReadJson(path.join(runRoot, "advisor.json"));
  if (state.mode === "DEEP") {
    const [domainModel, migrationContract, manifest, approval, rollbackPlan] = await Promise.all([
      tryReadJson(path.join(runRoot, "domain-model.json")),
      tryReadJson(path.join(runRoot, "migration-contract.json")),
      tryReadJson(path.join(runRoot, "migration-manifest.json")),
      tryReadJson(path.join(runRoot, "manifest-approval.json")),
      tryReadJson(path.join(runRoot, "rollback-plan.json")),
    ]);
    const domainBoundaryIds = domainModel?.boundaries?.map(
      (/** @type {any} */ boundary) => boundary?.id,
    );
    const planValidation = validateDeepPlanContract(
      {
        schemaVersion: 1,
        domainBoundaryIds,
        tickets: graph.tickets,
        migrationContract,
        rollbackPlan,
        migrationManifest: manifest,
      },
      approval,
      { domainBoundaryIds },
    );
    if (!planValidation.valid) {
      errors.push("DEEP Migration Manifest is not bound to its durable approval");
    }
  }

  const reviewEvidence = expectedReviewArtifactHashes(graph.reviewRounds ?? []);
  errors.push(...reviewEvidence.errors);
  const expectsCorrectiveWork = graphHasCorrectiveReviewLinks(graph);
  const workerRejection = await tryReadJson(path.join(runRoot, "worker-rejection.json"));
  const hasWorkerRejection =
    workerRejection?.kind === "WORKER_CONTRACT_REJECTION";
  const allowedNames = new Set([
    ...requiredNames,
    ...(state.mode === "STANDARD" ? ["advisor-rounds.json"] : []),
    ...reviewEvidence.hashes.keys(),
    ...(expectsCorrectiveWork ? ["corrective-work.json"] : []),
    ...(hasWorkerRejection ? ["worker-rejection.json"] : []),
    "human-gate.json",
    "remote-sync.json",
    "result.json",
  ]);
  let entries = [];
  try {
    entries = await readdir(runRoot, { withFileTypes: true });
  } catch {
    errors.push("Run Artifact store is missing");
    return errors;
  }
  const actualNames = entries.map((entry) => entry.name).sort(compareEvidenceIds);
  const actualReviewNames = actualNames
    .filter((name) =>
      /^(?:(?:spec|quality)-review|solution-fitness)(?:-(?:[2-9]|[1-9][0-9]+))?\.json$/u
        .test(name),
    )
    .sort(compareEvidenceIds);
  if (
    JSON.stringify(actualReviewNames) !==
    JSON.stringify([...reviewEvidence.hashes.keys()].sort(compareEvidenceIds))
  ) {
    errors.push("Run review artifact set does not match graph history");
  }
  if (actualNames.includes("corrective-work.json") !== expectsCorrectiveWork) {
    errors.push("Run corrective-work artifact does not match graph history");
  }
  if (actualNames.includes("worker-rejection.json") !== hasWorkerRejection) {
    errors.push("Run Worker rejection artifact does not match terminal evidence");
  }
  for (const entry of entries) {
    if (!entry.isFile() || !allowedNames.has(entry.name)) {
      errors.push(`Run Artifact set contains an unsafe or unknown entry: ${entry.name}`);
      continue;
    }
    try {
      const source = await readFile(path.join(runRoot, entry.name));
      const value = JSON.parse(source.toString("utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length === 0 ||
        (value.schemaVersion !== undefined && value.schemaVersion !== 1)
      ) {
        errors.push(`Run Artifact contract is invalid: ${entry.name}`);
      }
      const expectedHash = reviewEvidence.hashes.get(entry.name);
      if (expectedHash && sha256(source) !== expectedHash) {
        errors.push(`Run review artifact hash changed: ${entry.name}`);
      }
      if (
        entry.name === "corrective-work.json" &&
        !correctiveWorkMatchesGraph(graph, value)
      ) {
        errors.push("Run corrective-work links do not match graph history");
      }
      if (
        entry.name === "worker-rejection.json" &&
        !workerRejectionMatchesGraph(graph, value, durableRevision)
      ) {
        errors.push("Run Worker rejection evidence does not match accepted durable HEAD");
      }
      if (entry.name === "advisor-rounds.json") {
        errors.push(
          ...validateRunArtifactContract(entry.name, value, {
            state,
            graph,
            advisor: advisor ?? undefined,
          }),
        );
      }
    } catch {
      errors.push(`Run Artifact is not valid JSON: ${entry.name}`);
    }
  }
  if (durableRevision) {
    errors.push(
      ...(await validateCommittedArtifactProof(
        runRoot,
        durableRevision,
        requiredNames.filter(
          (name) =>
            ![
              "context-packet.json",
              "state.json",
              "ticket-graph.json",
              "ticket.json",
            ].includes(name),
        ),
      )),
    );
  }
  return errors;
}

/** @param {Record<string, any>[]} reviewRounds */
function expectedReviewArtifactHashes(reviewRounds) {
  /** @type {string[]} */
  const errors = [];
  const hashes = new Map();
  for (const [index, round] of reviewRounds.entries()) {
    const expectedRound = index + 1;
    const expectedNames = [
      reviewArtifactName("quality", expectedRound),
      reviewArtifactName("spec", expectedRound),
      ...(round?.fitness?.required === true
        ? [reviewArtifactName("fitness", expectedRound)]
        : []),
    ].sort(compareEvidenceIds);
    const artifacts = Array.isArray(round?.artifacts) ? round.artifacts : [];
    const actualNames = artifacts
      .map((/** @type {any} */ artifact) => artifact?.name)
      .sort(compareEvidenceIds);
    if (
      round?.round !== expectedRound ||
      !Array.isArray(round?.findings) ||
      (round?.fitness !== undefined &&
        (round.fitness?.required !== true ||
          !["PASS", "DEGRADED", "BLOCKED"].includes(round.fitness?.status) ||
          typeof round.fitness?.codeFingerprint !== "string")) ||
      JSON.stringify(actualNames) !== JSON.stringify(expectedNames)
    ) {
      errors.push("Run review artifact history is not canonical");
      continue;
    }
    for (const artifact of artifacts) {
      if (
        typeof artifact.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
        hashes.has(artifact.name)
      ) {
        errors.push("Run review artifact history contains an invalid hash");
        continue;
      }
      hashes.set(artifact.name, artifact.sha256);
    }
  }
  return { errors, hashes };
}

/** @param {"fitness" | "spec" | "quality"} kind @param {number} round */
function reviewArtifactName(kind, round) {
  if (kind === "fitness") {
    return round === 1 ? "solution-fitness.json" : `solution-fitness-${round}.json`;
  }
  return round === 1 ? `${kind}-review.json` : `${kind}-review-${round}.json`;
}

/** @param {Record<string, any>} graph */
function graphHasCorrectiveReviewLinks(graph) {
  return (graph.reviewRounds ?? []).some(
    (/** @type {any} */ round) =>
      Array.isArray(round?.findings) && round.findings.length > 0,
  );
}

/** @param {Record<string, any>} graph @param {unknown} value */
function correctiveWorkMatchesGraph(graph, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const correctiveWork = /** @type {Record<string, any>} */ (value);
  const expectedRounds = (graph.reviewRounds ?? [])
    .filter((/** @type {any} */ round) =>
      Array.isArray(round?.findings) && round.findings.length > 0,
    )
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
  return (
    latestRound?.findings?.length === 0 &&
    correctiveWork.completedAfterReviewRound === latestRound.round
  );
}

/**
 * @param {Record<string, any>} graph
 * @param {unknown} value
 * @param {string | null} durableRevision
 */
function workerRejectionMatchesGraph(graph, value, durableRevision) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rejection = /** @type {Record<string, any>} */ (value);
  const ticketIds = new Set(
    (graph.tickets ?? []).map((/** @type {any} */ ticket) => ticket?.id),
  );
  return (
    JSON.stringify(Object.keys(rejection).sort()) ===
      JSON.stringify([
        "acceptedIntegration",
        "kind",
        "reason",
        "schemaVersion",
        "silentMerge",
        "sourceTicketIds",
        "status",
      ]) &&
    rejection.schemaVersion === 1 &&
    rejection.kind === "WORKER_CONTRACT_REJECTION" &&
    rejection.status === "BLOCKED" &&
    rejection.silentMerge === false &&
    isNonEmptyStringArray(rejection.sourceTicketIds) &&
    rejection.sourceTicketIds.every(
      (/** @type {string} */ ticketId) => ticketIds.has(ticketId),
    ) &&
    rejection.reason &&
    JSON.stringify(Object.keys(rejection.reason).sort()) ===
      JSON.stringify(["checkId", "detail", "evidenceIds"]) &&
    isEvidenceId(rejection.reason.checkId) &&
    typeof rejection.reason.detail === "string" &&
    rejection.reason.detail.length > 0 &&
    rejection.reason.detail.length <= 512 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(rejection.reason.detail) &&
    isNonEmptyStringArray(rejection.reason.evidenceIds) &&
    rejection.reason.evidenceIds.every(isEvidenceId) &&
    rejection.acceptedIntegration &&
    JSON.stringify(Object.keys(rejection.acceptedIntegration).sort()) ===
      JSON.stringify(["changed", "head"]) &&
    /^[a-f0-9]{40}$/u.test(rejection.acceptedIntegration.head) &&
    rejection.acceptedIntegration.head === durableRevision &&
    rejection.acceptedIntegration.changed === false
  );
}

/**
 * @param {string} runRoot
 * @param {Record<string, any>} state
 * @param {Record<string, any> | null} graph
 * @param {{ readinessCommit?: boolean }} [options]
 */
async function validateRunFrontier(runRoot, state, graph, options = {}) {
  /** @type {string[]} */
  const errors = [];
  if (
    !graph ||
    graph.schemaVersion !== 1 ||
    graph.runId !== state.runId ||
    graph.branch !== state.branch ||
    graph.baseCommit !== state.baseCommit ||
    typeof graph.requestHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(graph.requestHash) ||
    !Array.isArray(graph.executionOrder) ||
    !Array.isArray(graph.tickets) ||
    (graph.reviewRounds !== undefined && !Array.isArray(graph.reviewRounds))
  ) {
    return {
      valid: false,
      errors: ["ticket graph is missing or not bound to the non-terminal run state"],
      frontier: [],
      checkpointCommits: [],
      durableHead: null,
    };
  }
  const ticketIds = new Set();
  for (const ticket of graph.tickets) {
    if (
      !ticket ||
      typeof ticket.id !== "string" ||
      ticket.id.length === 0 ||
      ticketIds.has(ticket.id)
    ) {
      errors.push("ticket IDs must be present and unique");
      continue;
    }
    ticketIds.add(ticket.id);
  }
  if (ticketIds.size !== graph.tickets.length) {
    errors.push("ticket collection contains invalid identities");
  }
  if (
    new Set(graph.executionOrder).size !== graph.executionOrder.length ||
    graph.executionOrder.some(
      (/** @type {unknown} */ ticketId) =>
        typeof ticketId !== "string" || !ticketIds.has(ticketId),
    )
  ) {
    errors.push("execution order must contain unique known ticket IDs");
  }
  const completed = new Set();
  /** @type {string[]} */
  const checkpointCommits = [];
  for (const ticketId of graph.executionOrder) {
    const frontier = graph.tickets
      .filter(
        (/** @type {any} */ candidate) =>
          candidate &&
          typeof candidate === "object" &&
          !completed.has(candidate.id) &&
          Array.isArray(candidate.dependencies) &&
          candidate.dependencies.every(
            (/** @type {string} */ dependency) => completed.has(dependency),
          ),
      )
      .sort((/** @type {any} */ left, /** @type {any} */ right) =>
        compareEvidenceIds(left.id, right.id),
      );
    const ticket = graph.tickets.find(
      (/** @type {any} */ candidate) => candidate?.id === ticketId,
    );
    if (
      !ticket ||
      frontier[0]?.id !== ticketId ||
      ticket.status !== "COMPLETE" ||
      !/^[a-f0-9]{40}$/u.test(ticket.checkpointCommit) ||
      !Array.isArray(ticket.dependencies) ||
      !ticket.dependencies.every((/** @type {string} */ dependency) => completed.has(dependency))
    ) {
      errors.push(`execution order has invalid checkpoint evidence for ${ticketId}`);
      continue;
    }
    completed.add(ticketId);
    checkpointCommits.push(ticket.checkpointCommit);
  }
  for (const ticket of graph.tickets) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
      errors.push("ticket graph contains a non-object ticket");
      continue;
    }
    if (
      !Array.isArray(ticket.dependencies) ||
      ticket.dependencies.some((/** @type {string} */ dependency) => !ticketIds.has(dependency))
    ) {
      errors.push(`ticket ${ticket.id ?? "unknown"} has invalid dependencies`);
    }
    if (ticket.status === "COMPLETE" && !completed.has(ticket.id)) {
      errors.push(`ticket ${ticket.id ?? "unknown"} is COMPLETE but absent from execution order`);
    }
    if (
      ticket.status !== "COMPLETE" &&
      ticket.checkpointCommit !== null &&
      ticket.checkpointCommit !== undefined
    ) {
      errors.push(`ticket ${ticket.id ?? "unknown"} has a checkpoint without COMPLETE status`);
    }
  }
  const frontier = graph.tickets
    .filter(
      (/** @type {any} */ ticket) =>
        ticket &&
        typeof ticket === "object" &&
        !completed.has(ticket.id) &&
        Array.isArray(ticket.dependencies) &&
        ticket.dependencies.every((/** @type {string} */ dependency) => completed.has(dependency)),
    )
    .map((/** @type {any} */ ticket) => ticket.id)
    .sort(compareEvidenceIds);
  if (frontier.length === 0 && completed.size !== graph.tickets.length) {
    errors.push("unfinished graph has no deterministic frontier");
  }

  const worktree = path.resolve(runRoot, "..", "..", "..");
  const [branch, head] = await Promise.all([
    runGitText(worktree, ["branch", "--show-current"]),
    runGitText(worktree, ["rev-parse", "HEAD"]),
  ]);
  const durableBase =
    graph.decisionCommit === null || graph.decisionCommit === undefined
      ? state.baseCommit
      : graph.decisionCommit;
  const ticketHead = checkpointCommits.at(-1) ?? durableBase;
  let expectedHead = ticketHead;
  if (options.readinessCommit && head) {
    const [parents, subject] = await Promise.all([
      runGitText(worktree, ["show", "-s", "--format=%P", head]),
      runGitText(worktree, ["show", "-s", "--format=%s", head]),
    ]);
    if (
      parents !== ticketHead ||
      !subject?.includes(`record ${state.mode} run readiness (${state.runId})`)
    ) {
      errors.push("Git readiness proof does not match the durable ticket checkpoint");
    } else {
      expectedHead = head;
    }
  }
  if (branch !== state.branch) {
    errors.push("Git checkpoint proof does not match the run branch");
  }
  if (head !== expectedHead) {
    errors.push("Git checkpoint proof does not match the durable HEAD");
  }
  if (!/^[a-f0-9]{40}$/u.test(durableBase)) {
    errors.push("Git checkpoint proof has an invalid durable base");
  }
  const gitProofValid =
    branch === state.branch &&
    head === expectedHead &&
    /^[a-f0-9]{40}$/u.test(durableBase) &&
    (!options.readinessCommit || expectedHead !== ticketHead);
  errors.push(
    ...(await validateGraphRunArtifacts(
      runRoot,
      state,
      graph,
      gitProofValid ? expectedHead : null,
    )),
  );
  if (gitProofValid) {
    let previous = durableBase;
    let latestCommittedGraph = null;
    if (new Set(checkpointCommits).size !== checkpointCommits.length) {
      errors.push("Git checkpoint proof reuses a checkpoint commit");
    }
    const artifactPath = path.relative(worktree, runRoot).replaceAll("\\", "/");
    for (const [index, checkpoint] of checkpointCommits.entries()) {
      const ticketId = graph.executionOrder[index];
      const [exists, isDescendant, parents, subject, committedGraph] = await Promise.all([
        runGitText(worktree, ["cat-file", "-e", `${checkpoint}^{commit}`]),
        runGitText(worktree, ["merge-base", "--is-ancestor", previous, checkpoint]),
        runGitText(worktree, ["show", "-s", "--format=%P", checkpoint]),
        runGitText(worktree, ["show", "-s", "--format=%s", checkpoint]),
        readGitJson(worktree, checkpoint, `${artifactPath}/ticket-graph.json`),
      ]);
      if (exists === null || isDescendant === null) {
        errors.push(`Git checkpoint proof is missing or out of order for ${checkpoint}`);
      }
      const committedTicket = committedGraph?.tickets?.find(
        (/** @type {any} */ ticket) => ticket?.id === ticketId,
      );
      if (
        parents !== previous ||
        !subject?.includes(`complete ${state.mode} ticket ${ticketId}`) ||
        JSON.stringify(committedGraph?.executionOrder) !==
          JSON.stringify(graph.executionOrder.slice(0, index)) ||
        committedTicket?.status !== "IN_PROGRESS" ||
        committedTicket?.verification?.status !== "PASS" ||
        committedTicket?.checkpointCommit
      ) {
        errors.push(`Git checkpoint transaction proof is invalid for ${ticketId}`);
      }
      latestCommittedGraph = committedGraph;
      previous = checkpoint;
    }
    if (
      checkpointCommits.length === 0 ||
      !latestCommittedGraph ||
      JSON.stringify(immutableTicketGraphContract(latestCommittedGraph)) !==
        JSON.stringify(immutableTicketGraphContract(graph))
    ) {
      errors.push("current ticket graph is not bound to the latest durable checkpoint plan");
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    frontier,
    checkpointCommits,
    durableHead: gitProofValid ? expectedHead : null,
    remoteSyncRequired:
      gitProofValid &&
      (
        await readGitJson(
          worktree,
          expectedHead,
          `${path.relative(worktree, runRoot).replaceAll("\\", "/")}/remote-sync.json`,
        )
      )?.enabled === true,
  };
}

/** @param {Record<string, any>} graph */
function immutableTicketGraphContract(graph) {
  return {
    schemaVersion: graph?.schemaVersion,
    runId: graph?.runId,
    branch: graph?.branch,
    baseCommit: graph?.baseCommit,
    requestHash: graph?.requestHash,
    decisionCommit: graph?.decisionCommit ?? null,
    tickets: Array.isArray(graph?.tickets)
      ? graph.tickets.map((/** @type {any} */ ticket) => ({
          id: ticket?.id,
          objective: ticket?.objective,
          acceptanceCriteria: ticket?.acceptanceCriteria,
          verificationIds: ticket?.verificationIds,
          dependencies: ticket?.dependencies,
          writeLease: ticket?.writeLease,
          contractIds: ticket?.contractIds,
          contextPaths: ticket?.contextPaths,
          sourceFinding: ticket?.sourceFinding,
        }))
      : null,
  };
}

/** @param {string} left @param {string} right */
function compareEvidenceIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {string | null} status @param {string[]} allowedPaths */
function gitStatusContainsOnly(status, allowedPaths) {
  if (status === null) {
    return false;
  }
  const allowed = new Set(allowedPaths);
  const lines = status.split(/\r?\n/u).filter(Boolean);
  return (
    lines.length === 0 ||
    lines.every((line, index) => {
      const match =
        /^(?:\?\? |[MADRC] {2}| [MADRC] )(.+)$/u.exec(line) ??
        (index === 0 ? /^[MADRC] (.+)$/u.exec(line) : null);
      return match !== null && allowed.has(match[1].replaceAll("\\", "/"));
    })
  );
}

/** @param {string} targetInput @param {{ dryRun?: boolean }} [options] */
export async function repairRuntime(targetInput, options = {}) {
  const target = path.resolve(targetInput);
  const diagnosis = await diagnoseRuntime(targetInput);
  const repairPlan = diagnosis.diagnoses
    .filter((entry) => entry.repairAction === "AUTOMATIC_REPAIR")
    .map((entry) => ({
      path: String(entry.path),
      action: "RESTORE_GIT_BLOB",
      sourceRevision: "HEAD",
    }));
  if (options.dryRun) {
    return {
      ...diagnosis,
      operation: "REPAIR_DRY_RUN",
      mutated: false,
      repairPlan,
    };
  }
  if (diagnosis.status === "BLOCKED" || repairPlan.length === 0) {
    return {
      ...diagnosis,
      operation: "REPAIR",
      mutated: false,
      repairPlan,
      repairs: [],
      verification: {
        status: diagnosis.status === "READY" ? "PASS" : "BLOCKED",
        evidenceIds: diagnosis.evidence.map((entry) => entry.id),
      },
    };
  }

  /** @type {string[]} */
  const attemptedRepairs = [];
  /** @type {string[]} */
  const completedRepairs = [];
  try {
  const repairHead = await runGitText(target, ["rev-parse", "HEAD"]);
  if (!repairHead || !/^[a-f0-9]{40}$/u.test(repairHead)) {
    throw new Error("Repair policy validation failed because the trusted HEAD is unavailable.");
  }
  const manifest = JSON.parse(
    await readFile(path.join(target, ...MANIFEST_PATH.split("/")), "utf8"),
  );
  const manifestSha256 = sha256(
    await readFile(path.join(target, ...MANIFEST_PATH.split("/"))),
  );
  const manifestValidation = validateRuntimeManifest(manifest);
  const committedManifestSource = await readGitBlob(target, repairHead, MANIFEST_PATH);
  let committedManifest = null;
  try {
    committedManifest = committedManifestSource
      ? JSON.parse(committedManifestSource.toString("utf8"))
      : null;
  } catch {
    // The policy validation below fails closed.
  }
  const committedManifestValidation = validateRuntimeManifest(committedManifest);
  if (
    !manifestValidation.valid ||
    !committedManifestValidation.valid ||
    JSON.stringify(runtimeOwnershipContract(committedManifest)) !==
      JSON.stringify(runtimeOwnershipContract(manifest))
  ) {
    throw new Error("Repair policy validation failed because the Runtime manifest changed.");
  }
  /** @type {Array<{ path: string, content: Buffer, pathSnapshot: Record<string, any>, observedSha256: string | null }>} */
  const validatedRepairs = [];
  for (const plan of repairPlan) {
    const entry = manifest.files.find(
      (/** @type {any} */ candidate) => candidate.path === plan.path,
    );
    const blob = entry ? await readGitBlob(target, repairHead, entry.path) : null;
    const content = blob && entry ? repairContentForHash(blob, entry.sha256) : null;
    const policy = validateAutomaticRepairPolicy(entry, content);
    const pathSnapshot = await inspectRepairPath(target, plan.path);
    if (!policy.valid || !content || !pathSnapshot.valid) {
      throw new Error(`Repair policy validation failed for ${plan.path}: ${policy.errors.join("; ")}`);
    }
    validatedRepairs.push({
      path: plan.path,
      content,
      pathSnapshot,
      observedSha256: await currentFileSha256(target, plan.path),
    });
  }

  const stagingRoot = await mkdtemp(
    path.join(path.dirname(target), ".runtime-doctor-repair-"),
  );
  const [targetDevice, stagingDevice] = await Promise.all([
    lstat(target).then((stats) => stats.dev),
    lstat(stagingRoot).then((stats) => stats.dev),
  ]);
  if (targetDevice !== stagingDevice) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw new Error("Repair staging is not on the Target Project filesystem.");
  }
  /** @type {Array<{ path: string, replace: () => Promise<void>, release: () => Promise<void> }>} */
  const pinnedNamespaces = [];
  try {
    for (const repair of validatedRepairs) {
      const temporary = path.join(stagingRoot, randomUUID());
      await writeFile(temporary, repair.content);
      const pinned = {
        path: repair.path,
        ...(await pinRepairNamespace(
          target,
          repair.path,
          repair.pathSnapshot,
          temporary,
          sha256(repair.content),
        )),
      };
      pinnedNamespaces.push(pinned);
      const currentPathSnapshot = await inspectRepairPath(target, repair.path);
      const currentManifestSha256 = sha256(
        await readFile(path.join(target, ...MANIFEST_PATH.split("/"))),
      );
      const currentHead = await runGitText(target, ["rev-parse", "HEAD"]);
      if (
        !sameRepairPathSnapshot(repair.pathSnapshot, currentPathSnapshot) ||
        currentManifestSha256 !== manifestSha256 ||
        currentHead !== repairHead ||
        (await currentFileSha256(target, repair.path)) !== repair.observedSha256
      ) {
        throw new Error(`Repair preconditions changed before mutation: ${repair.path}`);
      }
      attemptedRepairs.push(repair.path);
      await pinned.replace();
      const repairedPathSnapshot = await inspectRepairPath(target, repair.path);
      const repairedSha256 = await currentFileSha256(target, repair.path);
      const expectedRepairSha256 = sha256(repair.content);
      if (
        !repairedPathSnapshot.valid ||
        !sameRepairAncestors(repair.pathSnapshot, repairedPathSnapshot) ||
        repairedSha256 !== expectedRepairSha256
      ) {
        throw new Error(
            `Repair verification failed after mutation: ${repair.path}; ` +
            `path=${repairedPathSnapshot.valid}; ` +
            `ancestors=${sameRepairAncestors(repair.pathSnapshot, repairedPathSnapshot)}; ` +
            `checksum=${repairedSha256 === expectedRepairSha256}; ` +
            `expectedSha256=${expectedRepairSha256}; actualSha256=${repairedSha256}`,
        );
      }
      completedRepairs.push(repair.path);
    }
  } finally {
    await Promise.all(pinnedNamespaces.map((entry) => entry.release()));
    await rm(stagingRoot, { recursive: true, force: true });
  }
  const verification = await diagnoseRuntime(target);
  return {
    ...verification,
    operation: "REPAIR",
    mutated: validatedRepairs.length > 0,
    repairPlan,
    repairs: validatedRepairs.map((repair) => ({
      path: repair.path,
      action: "RESTORE_GIT_BLOB",
      status: "PASS",
    })),
    preRepairDiagnoses: diagnosis.diagnoses,
    verification: {
      status: verification.evidence.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL",
      evidenceIds: verification.evidence.map((entry) => entry.id),
    },
  };
  } catch (error) {
    return createRepairFailureReport(
      diagnosis,
      repairPlan,
      attemptedRepairs,
      completedRepairs,
      error,
    );
  }
}

/**
 * @param {string} target
 * @param {Array<Record<string, unknown>>} evidence
 * @param {Array<Record<string, unknown>>} diagnoses
 * @param {Set<string>} seenRunIds
 */
async function inspectRegisteredRunWorktrees(target, evidence, diagnoses, seenRunIds) {
  const output = await runGitText(target, ["worktree", "list", "--porcelain"]);
  if (output === null) {
    evidence.push({
      id: "registered-worktrees",
      status: "MISSING",
      path: ".git/worktrees",
      details: ["registered Git worktrees could not be enumerated"],
    });
    return;
  }
  const worktrees = output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)))
    .sort(compareEvidenceIds);
  evidence.push({
    id: "registered-worktrees",
    status: "PASS",
    path: ".git/worktrees",
    entries: worktrees.length,
  });
  const targetPath = path.resolve(target);
  let storeSequence = 0;
  for (const worktree of worktrees) {
    if (samePlatformPath(worktree, targetPath)) {
      continue;
    }
    const store = path.join(worktree, ...RUNS_PATH.split("/"));
    storeSequence += 1;
    let entries;
    try {
      entries = await readdir(store, { withFileTypes: true });
    } catch (error) {
      evidence.push({
        id: `run-worktree-store:${storeSequence}`,
        status:
          error && typeof error === "object" && "code" in error && error.code === "ENOENT"
            ? "MISSING"
            : "INVALID",
        path: RUNS_PATH,
        worktree,
        details: ["registered worktree Run State Store could not be inspected"],
      });
      continue;
    }
    evidence.push({
      id: `run-worktree-store:${storeSequence}`,
      status: "PASS",
      path: RUNS_PATH,
      worktree,
      entries: entries.length,
    });
    for (const entry of entries.sort((left, right) => compareEvidenceIds(left.name, right.name))) {
      if (entry.isDirectory()) {
        await inspectRun(
          path.join(store, entry.name),
          entry.name,
          evidence,
          diagnoses,
          seenRunIds,
        );
      } else if (entry.name !== ".gitkeep" || !entry.isFile()) {
        evidence.push({
          id: `run-worktree-entry:${storeSequence}:${entry.name}`,
          status: "INVALID",
          path: `${RUNS_PATH}/${entry.name}`,
          worktree,
          details: ["Run State Store entries must be real directories"],
        });
      }
    }
  }
}

/** @param {Record<string, any>} manifest */
function runtimeOwnershipContract(manifest) {
  return {
    schemaVersion: manifest?.schemaVersion,
    runtimeVersion: manifest.runtimeVersion,
    files: manifest.files
      .map((/** @type {any} */ file) => ({
        path: file.path,
        sha256: file.sha256,
        ownership: file.ownership,
        generated: file.generated,
        protected: file.protected,
        repair: file.repair ?? null,
      }))
      .sort((/** @type {any} */ left, /** @type {any} */ right) =>
        compareEvidenceIds(left.path, right.path),
      ),
  };
}

/** @param {string} left @param {string} right */
function samePlatformPath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/** @param {Record<string, any> | undefined} entry @param {Buffer | null} source */
export function validateAutomaticRepairPolicy(entry, source) {
  /** @type {string[]} */
  const errors = [];
  if (!entry) {
    return { valid: false, errors: ["manifest ownership entry is missing"] };
  }
  if (entry.ownership !== "PROJECT_RUNTIME") {
    errors.push("ownership must equal PROJECT_RUNTIME");
  }
  if (entry.generated !== true) {
    errors.push("file must be manifest-declared generated content");
  }
  if (entry.protected !== false) {
    errors.push("protected files cannot be repaired automatically");
  }
  if (entry.repair?.kind !== "git-blob" || entry.repair.revision !== "HEAD") {
    errors.push("repair source must be the manifest-declared HEAD Git blob");
  }
  if (!source || sha256(source) !== entry.sha256) {
    errors.push("repair source bytes must match the manifest checksum");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {string} target
 * @param {Array<Record<string, any>>} files
 * @param {Array<Record<string, unknown>>} evidence
 * @param {Array<Record<string, unknown>>} diagnoses
 * @param {boolean} manifestOwnershipConfirmed
 */
async function inspectRuntimeFiles(
  target,
  files,
  evidence,
  diagnoses,
  manifestOwnershipConfirmed,
) {
  for (const file of files) {
    const pathContract = await inspectRepairPath(target, file.path);
    evidence.push({
      id: `repair-path:${file.path}`,
      status: pathContract.valid ? "PASS" : "INVALID",
      path: file.path,
      details: pathContract.errors,
    });
    const absolute = path.join(target, ...file.path.split("/"));
    let content = null;
    let missing = false;
    try {
      content = await readFile(absolute);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        missing = true;
      }
    }
    const actualHash = content ? sha256(content) : null;
    const matches = actualHash === file.sha256;
    evidence.push({
      id: `runtime-file:${file.path}`,
      status: matches ? "PASS" : missing ? "MISSING" : "INVALID",
      path: file.path,
      ownership: file.ownership ?? "LEGACY_RUNTIME_UNCONFIRMED",
      expectedSha256: file.sha256,
      actualSha256: actualHash,
    });
    if (matches && pathContract.valid) {
      continue;
    }
    if (matches) {
      diagnoses.push({
        kind: "RUNTIME_PATH_UNSAFE",
        path: file.path,
        ownership: file.ownership ?? "LEGACY_RUNTIME_UNCONFIRMED",
        generated: file.generated,
        protected: file.protected,
        repairAction: "HUMAN_GATE",
        evidenceIds: [`runtime-file:${file.path}`, `repair-path:${file.path}`],
      });
      continue;
    }

    const repairSourceId = `repair-source:${file.path}`;
    const repairTransactionId = `repair-transaction:${file.path}`;
    const repairTransaction = await inspectRepairTransactionCapability();
    evidence.push({
      id: repairTransactionId,
      status: repairTransaction.valid ? "PASS" : "MISSING",
      path: file.path,
      mechanism: repairTransaction.mechanism,
      details: repairTransaction.errors,
    });
    let sourceMatches = false;
    let repairContent = null;
    if (file.repair?.kind === "git-blob" && file.repair.revision === "HEAD") {
      const source = await readGitBlob(target, "HEAD", file.path);
      repairContent = source ? repairContentForHash(source, file.sha256) : null;
      const sourceHash = repairContent ? sha256(repairContent) : source ? sha256(source) : null;
      sourceMatches = sourceHash === file.sha256;
      evidence.push({
        id: repairSourceId,
        status: sourceMatches ? "PASS" : source ? "INVALID" : "MISSING",
        path: file.path,
        revision: "HEAD",
        expectedSha256: file.sha256,
        actualSha256: sourceHash,
      });
    } else {
      evidence.push({
        id: repairSourceId,
        status: "MISSING",
        path: file.path,
        revision: null,
      });
    }
    const automatic =
      validateAutomaticRepairPolicy(file, sourceMatches ? repairContent : null).valid &&
      pathContract.valid &&
      repairTransaction.valid &&
      manifestOwnershipConfirmed;
    diagnoses.push({
      kind: missing ? "RUNTIME_FILE_MISSING" : "RUNTIME_CHECKSUM_DRIFT",
      path: file.path,
      ownership: file.ownership ?? "LEGACY_RUNTIME_UNCONFIRMED",
      generated: file.generated,
      protected: file.protected,
      repairAction: automatic ? "AUTOMATIC_REPAIR" : "HUMAN_GATE",
      evidenceIds: [
        `runtime-file:${file.path}`,
        `repair-path:${file.path}`,
        repairSourceId,
        repairTransactionId,
      ],
    });
  }
}

/** @param {string} target @param {string} projectPath */
async function inspectRepairPath(target, projectPath) {
  /** @type {string[]} */
  const errors = [];
  const targetRealPath = await realpath(target);
  const segments = projectPath.split("/");
  /** @type {Array<Record<string, unknown>>} */
  const ancestors = [];
  const targetStats = await lstat(target);
  ancestors.push({
    path: "",
    device: targetStats.dev,
    inode: targetStats.ino,
    resolved: targetRealPath,
  });
  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    errors.push("Target Project root is not a real directory");
  }
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const stats = await lstat(current);
      const resolved = await realpath(current);
      ancestors.push({
        path: path.relative(target, current).replaceAll("\\", "/"),
        device: stats.dev,
        inode: stats.ino,
        resolved,
      });
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        errors.push(`ancestor is not a real directory: ${path.relative(target, current)}`);
      }
      if (!isWithinRoot(targetRealPath, resolved)) {
        errors.push(`ancestor escapes the Target Project: ${path.relative(target, current)}`);
      }
    } catch {
      errors.push(`ancestor cannot be inspected: ${path.relative(target, current)}`);
    }
  }
  const destination = path.join(target, ...segments);
  let destinationIdentity = null;
  try {
    const stats = await lstat(destination);
    destinationIdentity = {
      exists: true,
      device: stats.dev,
      inode: stats.ino,
      symbolicLink: stats.isSymbolicLink(),
      regularFile: stats.isFile(),
    };
    if (!stats.isFile() || stats.isSymbolicLink()) {
      errors.push("destination is not a real regular file");
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      errors.push("destination cannot be inspected");
    }
    destinationIdentity = { exists: false };
  }
  return {
    valid: errors.length === 0,
    errors,
    targetRealPath,
    ancestors,
    destination: destinationIdentity,
  };
}

/** @param {string} root @param {string} candidate */
function isWithinRoot(root, candidate) {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

/** @param {Record<string, any>} expected @param {Record<string, any>} actual */
function sameRepairPathSnapshot(expected, actual) {
  return expected.valid && actual.valid && JSON.stringify(expected) === JSON.stringify(actual);
}

/** @param {Record<string, any>} expected @param {Record<string, any>} actual */
function sameRepairAncestors(expected, actual) {
  return (
    expected.valid &&
    actual.valid &&
    expected.targetRealPath === actual.targetRealPath &&
    JSON.stringify(expected.ancestors) === JSON.stringify(actual.ancestors)
  );
}

/**
 * @param {string} target
 * @param {string} projectPath
 * @param {Record<string, any>} snapshot
 * @param {string} temporary
 * @param {string} expectedSha256
 */
async function pinRepairNamespace(
  target,
  projectPath,
  snapshot,
  temporary,
  expectedSha256,
) {
  if (process.platform === "win32") {
    return pinWindowsRepairDirectories(
      target,
      projectPath,
      snapshot,
      temporary,
      expectedSha256,
    );
  }
  throw new Error("Safe automatic repair is unavailable on this platform.");
}

async function inspectRepairTransactionCapability() {
  if (process.platform === "win32") {
    try {
      const stats = await lstat(WINDOWS_POWERSHELL_PATH);
      if (stats.isFile() && !stats.isSymbolicLink()) {
        return { valid: true, mechanism: "WINDOWS_PINNED_NAMESPACE_RENAME", errors: [] };
      }
    } catch {
      // Fall through to the fail-closed result.
    }
  }
  return {
    valid: false,
    mechanism: null,
    errors: ["safe handle-relative replacement is unavailable on this platform"],
  };
}

/**
 * @param {string} target
 * @param {string} projectPath
 * @param {Record<string, any>} snapshot
 * @param {string} temporary
 * @param {string} expectedSha256
 */
async function pinWindowsRepairDirectories(
  target,
  projectPath,
  snapshot,
  temporary,
  expectedSha256,
) {
  const directoryPaths = snapshot.ancestors.map((/** @type {any} */ ancestor) =>
    path.join(target, ...String(ancestor.path).split("/")),
  );
  try {
    await lstat(WINDOWS_POWERSHELL_PATH);
  } catch {
    throw new Error("Trusted System32 PowerShell is unavailable for safe repair.");
  }
  const helperSource = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class RuntimeDoctorDirectoryPin {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetFileInformationByHandle(
        SafeFileHandle file,
        int informationClass,
        IntPtr information,
        uint bufferSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct FileAttributeTagInfo {
        public uint FileAttributes;
        public uint ReparseTag;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle file,
        out ByHandleFileInformation information);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(
        SafeFileHandle file,
        int informationClass,
        out FileAttributeTagInfo information,
        uint bufferSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint GetFileType(SafeFileHandle file);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle file,
        StringBuilder path,
        uint pathLength,
        uint flags);

    public static SafeFileHandle OpenDirectory(string fileName) {
        return CreateFileW(
            fileName,
            0x00000001,
            0x00000001 | 0x00000002,
            IntPtr.Zero,
            3,
            0x02000000,
            IntPtr.Zero);
    }

    public static SafeFileHandle OpenSource(string fileName) {
        return CreateFileW(
            fileName,
            0x80000000 | 0x00010000,
            0x00000001,
            IntPtr.Zero,
            3,
            0x00200000,
            IntPtr.Zero);
    }

    public static void ValidateSource(
        SafeFileHandle source,
        string expectedPath,
        string expectedRoot) {
        FileAttributeTagInfo attributes;
        if (!GetFileInformationByHandleEx(
                source,
                9,
                out attributes,
                (uint)Marshal.SizeOf(typeof(FileAttributeTagInfo)))) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        if (
            GetFileType(source) != 1 ||
            (attributes.FileAttributes & 0x00000010) != 0 ||
            (attributes.FileAttributes & 0x00000400) != 0) {
            throw new InvalidOperationException(
                "Pinned repair source is not a regular non-reparse disk file.");
        }
        var finalPath = FinalPath(source);
        var sourcePath = Path.GetFullPath(expectedPath);
        var sourceRoot = Path.GetFullPath(expectedRoot)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (
            !String.Equals(finalPath, sourcePath, StringComparison.OrdinalIgnoreCase) ||
            !finalPath.StartsWith(
                sourceRoot + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase)) {
            throw new InvalidOperationException(
                "Pinned repair source escaped its exact staging path.");
        }
    }

    public static string FinalPath(SafeFileHandle file) {
        var finalPathBuffer = new StringBuilder(32768);
        var finalPathLength = GetFinalPathNameByHandleW(
            file,
            finalPathBuffer,
            (uint)finalPathBuffer.Capacity,
            0);
        if (finalPathLength == 0 || finalPathLength >= finalPathBuffer.Capacity) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        var finalPath = finalPathBuffer.ToString(0, (int)finalPathLength);
        if (finalPath.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) {
            finalPath = @"\\" + finalPath.Substring(8);
        } else if (finalPath.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase)) {
            finalPath = finalPath.Substring(4);
        }
        return Path.GetFullPath(finalPath);
    }

    public static string Hash(SafeFileHandle source) {
        var borrowed = new SafeFileHandle(source.DangerousGetHandle(), false);
        using (var stream = new FileStream(borrowed, FileAccess.Read)) {
            using (var algorithm = SHA256.Create()) {
                var bytes = algorithm.ComputeHash(stream);
                var text = new StringBuilder(bytes.Length * 2);
                foreach (var value in bytes) text.Append(value.ToString("x2"));
                return text.ToString();
            }
        }
    }

    public static bool SameFile(SafeFileHandle left, SafeFileHandle right) {
        ByHandleFileInformation leftInformation;
        ByHandleFileInformation rightInformation;
        if (
            !GetFileInformationByHandle(left, out leftInformation) ||
            !GetFileInformationByHandle(right, out rightInformation)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        return
            leftInformation.VolumeSerialNumber == rightInformation.VolumeSerialNumber &&
            leftInformation.FileIndexHigh == rightInformation.FileIndexHigh &&
            leftInformation.FileIndexLow == rightInformation.FileIndexLow;
    }

    public static void Rename(
        SafeFileHandle source,
        string destinationName) {
        if (destinationName.Length >= 3 && destinationName[1] == ':') {
            destinationName = @"\??\" + destinationName;
        }
        var name = Encoding.Unicode.GetBytes(destinationName);
        var rootOffset = IntPtr.Size == 8 ? 8 : 4;
        var lengthOffset = rootOffset + IntPtr.Size;
        var nameOffset = lengthOffset + 4;
        var size = nameOffset + name.Length + 2;
        var buffer = Marshal.AllocHGlobal(size);
        try {
            for (var index = 0; index < size; index++) Marshal.WriteByte(buffer, index, 0);
            Marshal.WriteByte(buffer, 0, 1);
            Marshal.WriteIntPtr(buffer, rootOffset, IntPtr.Zero);
            Marshal.WriteInt32(buffer, lengthOffset, name.Length);
            Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
            if (!SetFileInformationByHandle(source, 3, buffer, (uint)size)) {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }
}
"@

$encodedPaths = [Console]::In.ReadLine()
$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPaths))
$config = ConvertFrom-Json $json
$handles = New-Object System.Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]
$source = $null
try {
    foreach ($directoryPath in $config.paths) {
        $handle = [RuntimeDoctorDirectoryPin]::OpenDirectory([string]$directoryPath)
        if ($handle.IsInvalid) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            $handle.Dispose()
            throw "Cannot pin repair directory: $directoryPath ($errorCode)"
        }
        $handles.Add($handle)
    }
    $source = [RuntimeDoctorDirectoryPin]::OpenSource([string]$config.source)
    if ($source.IsInvalid) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        $source.Dispose()
        throw "Cannot pin repair source: $errorCode"
    }
    [RuntimeDoctorDirectoryPin]::ValidateSource(
        $source,
        [string]$config.source,
        [string]$config.sourceRoot)
    if ([RuntimeDoctorDirectoryPin]::Hash($source) -ne [string]$config.expectedSha256) {
        throw "Pinned repair source checksum does not match validated bytes."
    }
    [Console]::Out.WriteLine("PINNED")
    [Console]::Out.Flush()
    $command = [Console]::In.ReadLine()
    if ($command -eq "REPLACE") {
        [RuntimeDoctorDirectoryPin]::Rename(
            $source,
            [string]$config.destination)
        $renamedPath = [RuntimeDoctorDirectoryPin]::FinalPath($source)
        $expectedPath = [IO.Path]::GetFullPath([string]$config.destination)
        if (![String]::Equals(
                $renamedPath,
                $expectedPath,
                [StringComparison]::OrdinalIgnoreCase)) {
            $destination = [RuntimeDoctorDirectoryPin]::OpenSource($expectedPath)
            try {
                if (
                    $destination.IsInvalid -or
                    ![RuntimeDoctorDirectoryPin]::SameFile($source, $destination)) {
                    throw "Pinned repair source renamed to unexpected path: $renamedPath"
                }
            } finally {
                $destination.Dispose()
            }
        }
        [Console]::Out.WriteLine("REPLACED")
        [Console]::Out.Flush()
        $releaseCommand = [Console]::In.ReadLine()
        if ($releaseCommand -ne "RELEASE") {
            throw "Repair handle transaction did not receive RELEASE."
        }
    } elseif ($command -ne "ABORT") {
        throw "Repair handle transaction received an invalid command."
    }
} finally {
    if ($null -ne $source) {
        $source.Dispose()
    }
    foreach ($handle in $handles) {
        $handle.Dispose()
    }
}
`;
  const encodedCommand = Buffer.from(helperSource, "utf16le").toString("base64");
  const child = spawn(
    WINDOWS_POWERSHELL_PATH,
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
    {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const closePromise = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const pinnedPromise = new Promise((resolve, reject) => {
    let stdout = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("Timed out while pinning Windows repair directories."));
      }
    }, 10_000);
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!settled && stdout.includes("\n")) {
        settled = true;
        clearTimeout(timer);
        const line = stdout.split(/\r?\n/u)[0];
        if (line === "PINNED") {
          resolve(undefined);
        } else {
          reject(new Error(`Windows repair namespace pin failed: ${line || stderr}`));
        }
      }
    });
    child.once("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Windows repair namespace pin exited early: ${stderr}`));
      }
    });
  });
  child.stdin.write(
    `${Buffer.from(
      JSON.stringify({
        paths: directoryPaths,
        source: temporary,
        sourceRoot: path.dirname(temporary),
        expectedSha256,
        destination: path.join(target, ...projectPath.split("/")),
      }),
      "utf8",
    ).toString("base64")}\n`,
  );
  try {
    await pinnedPromise;
  } catch (error) {
    child.stdin.end();
    await closePromise;
    throw error;
  }
  let replaced = false;
  let released = false;
  /** @param {string} expectedLine */
  const waitForOutputLine = (expectedLine) =>
    new Promise((resolve, reject) => {
      let stdout = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Timed out waiting for Windows repair ${expectedLine}.`));
        }
      }, 10_000);
      /** @param {string} chunk */
      const onData = (chunk) => {
        stdout += chunk;
        if (!settled && stdout.split(/\r?\n/u).includes(expectedLine)) {
          settled = true;
          clearTimeout(timer);
          child.stdout.off("data", onData);
          resolve(undefined);
        }
      };
      child.stdout.on("data", onData);
      child.once("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.stdout.off("data", onData);
          reject(
            new Error(
              `Windows repair handle transaction exited before ${expectedLine}: ${stderr}`,
            ),
          );
        }
      });
    });
  return {
    replace: async () => {
      if (replaced) {
        return;
      }
      replaced = true;
      const replacedPromise = waitForOutputLine("REPLACED");
      child.stdin.write("REPLACE\n");
      await replacedPromise;
    },
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      child.stdin.end(`${replaced ? "RELEASE" : "ABORT"}\n`);
      const result = /** @type {{ code: number | null, signal: NodeJS.Signals | null }} */ (
        await closePromise
      );
      if (result.code !== 0) {
        throw new Error(
          `Windows repair handle transaction failed: ${stderr || result.signal}`,
        );
      }
    },
  };
}

/** @param {string} target @param {string} projectPath */
async function currentFileSha256(target, projectPath) {
  try {
    return sha256(await readFile(path.join(target, ...projectPath.split("/"))));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * @param {Record<string, any>} diagnosis
 * @param {Array<Record<string, any>>} repairPlan
 * @param {string[]} attemptedRepairs
 * @param {string[]} completedRepairs
 * @param {unknown} error
 */
export function createRepairFailureReport(
  diagnosis,
  repairPlan,
  attemptedRepairs,
  completedRepairs,
  error,
) {
  const attempted = new Set(attemptedRepairs);
  const completed = new Set(completedRepairs);
  const message = String(error instanceof Error ? error.message : error || "Unknown repair failure")
    .replace(/\s+/gu, " ")
    .slice(0, 1_000);
  const repairEvidence = {
    id: "repair-execution",
    status: "INVALID",
    details: [message],
  };
  return {
    ...diagnosis,
    operation: "REPAIR",
    status: "BLOCKED",
    terminal: true,
    mutated: attempted.size > 0,
    evidence: [...diagnosis.evidence, repairEvidence],
    diagnoses: [
      ...diagnosis.diagnoses,
      {
        kind: "REPAIR_FAILURE",
        ownership: "PROJECT_RUNTIME",
        repairAction: "HUMAN_GATE",
        paths: [...attempted].sort(),
        evidenceIds: [repairEvidence.id],
      },
    ],
    repairPlan,
    repairs: repairPlan.map((plan) => ({
      path: plan.path,
      action: plan.action,
      status: completed.has(plan.path)
        ? "PASS"
        : attempted.has(plan.path)
          ? "FAIL"
          : "NOT_RUN",
    })),
    preRepairDiagnoses: diagnosis.diagnoses,
    verification: {
      status: "BLOCKED",
      evidenceIds: [repairEvidence.id],
    },
    blocker: {
      reason: "REPAIR_FAILED",
      evidenceIds: [repairEvidence.id],
    },
  };
}

/**
 * @param {"READY" | "DEGRADED" | "BLOCKED"} status
 * @param {Array<Record<string, unknown>>} evidence
 * @param {Array<Record<string, unknown>>} diagnoses
 */
function doctorReport(status, evidence, diagnoses) {
  const remoteSyncGate = diagnoses.find(
    (diagnosis) =>
      diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
      diagnosis.repairAction === "HUMAN_GATE",
  );
  const runResumeGate = diagnoses.find(
    (diagnosis) =>
      diagnosis.kind === "UNFINISHED_RUN" &&
      diagnosis.repairAction === "HUMAN_GATE",
  );
  const humanGatePaths = diagnoses
    .filter(
      (diagnosis) =>
        diagnosis.kind !== "REMOTE_SYNC_PROBLEM" &&
        diagnosis.kind !== "UNFINISHED_RUN" &&
        diagnosis.repairAction === "HUMAN_GATE",
    )
    .map((diagnosis) => String(diagnosis.path))
    .sort();
  return {
    schemaVersion: 1,
    operation: "DIAGNOSE",
    status,
    terminal: true,
    mutated: false,
    evidence,
    diagnoses,
    ...(remoteSyncGate
      ? {
          humanGate: {
            kind: "REMOTE_SYNC",
            required: true,
            approved: false,
            remote: remoteSyncGate.remote,
            branch: remoteSyncGate.branch,
            reason: remoteSyncGate.reason,
            localHead: remoteSyncGate.localHead,
            remoteHead: remoteSyncGate.remoteHead,
          },
        }
      : runResumeGate
        ? {
            humanGate: {
              kind: "RUN_RESUME",
              required: true,
              approved: false,
              runId: runResumeGate.runId,
              gateKind: runResumeGate.gateKind,
              gateId: runResumeGate.gateId,
            },
          }
      : humanGatePaths.length > 0
      ? {
          humanGate: {
            kind: "RUNTIME_OWNERSHIP",
            required: true,
            approved: false,
            paths: humanGatePaths,
          },
        }
      : {}),
    ...(status === "BLOCKED"
      ? {
          blocker: {
            reason:
              remoteSyncGate
                ? remoteSyncGate.reason
                : runResumeGate
                  ? "HUMAN_GATE_REQUIRED"
                : humanGatePaths.length > 0
                ? "AUTOMATIC_REPAIR_FORBIDDEN"
                : "RUNTIME_EVIDENCE_INSUFFICIENT",
            evidenceIds: remoteSyncGate
              ? remoteSyncGate.evidenceIds
              : runResumeGate
                ? runResumeGate.evidenceIds
              : evidence
                  .filter((entry) => entry.status !== "PASS")
                  .map((entry) => entry.id),
          },
        }
      : {}),
  };
}

/**
 * @param {string} target
 * @param {string} projectPath
 * @param {Array<Record<string, unknown>>} evidence
 * @param {string} id
 */
async function readRequiredJson(target, projectPath, evidence, id) {
  try {
    return JSON.parse(await readFile(path.join(target, ...projectPath.split("/")), "utf8"));
  } catch (error) {
    evidence.push({
      id,
      status:
        error && typeof error === "object" && "code" in error && error.code === "ENOENT"
          ? "MISSING"
          : "INVALID",
      path: projectPath,
    });
    return null;
  }
}

/** @param {string} file @returns {Promise<Record<string, any> | null>} */
async function tryReadJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    return {};
  }
}

/**
 * @param {string} cwd
 * @param {string} revision
 * @param {string} projectPath
 * @returns {Promise<Buffer | null>}
 */
async function readGitBlob(cwd, revision, projectPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["show", `${revision}:${projectPath}`], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.resume();
    child.once("error", reject);
    child.once("close", (code) => resolve(code === 0 ? Buffer.concat(chunks) : null));
  });
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
async function readGitJson(cwd, revision, projectPath) {
  const source = await readGitBlob(cwd, revision, projectPath);
  if (!source) {
    return null;
  }
  try {
    return JSON.parse(source.toString("utf8"));
  } catch {
    return null;
  }
}

/** @param {string} cwd @param {string[]} args @returns {Promise<string | null>} */
async function runGitText(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.once("error", reject);
    child.once("close", (code) => resolve(code === 0 ? stdout.trim() : null));
  });
}

/** @param {Buffer} source @param {string} expectedSha256 */
function repairContentForHash(source, expectedSha256) {
  if (sha256(source) === expectedSha256) {
    return source;
  }
  const text = source.toString("utf8");
  if (!text.includes("\uFFFD") && !text.includes("\r")) {
    const crlf = Buffer.from(text.replaceAll("\n", "\r\n"), "utf8");
    if (sha256(crlf) === expectedSha256) {
      return crlf;
    }
  }
  return null;
}
