import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACCEPTANCE_WEIGHTS,
  REQUIRED_ACCEPTANCE_STAGES,
  acceptanceReportHash,
  pendingAcceptanceReportHash,
  validateAcceptanceReport,
} from "../../skills/engineering-loop/scripts/accept.mjs";
import { scanQualificationPayload } from "../../skills/engineering-loop/scripts/qualify.mjs";
import { runProcess } from "../support/process.mjs";

const fixturePath = fileURLToPath(
  new URL("../fixtures/standard-run", import.meta.url),
);
const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);
const sourceRepository = fileURLToPath(new URL("../..", import.meta.url));

test("the real V1 acceptance lifecycle stops at READY_FOR_HUMAN", async () => {
  const prepared = await prepareTarget();
  try {
    const remote = await attachBareRemote(prepared);
    const refsBefore = await remoteRefs(remote);
    const sourceHeadBefore = await git(sourceRepository, "rev-parse", "HEAD");
    const interrupted = await invokeRun(
      prepared.target,
      "acceptance-request.json",
    );
    assert.notEqual(interrupted.code, 0);

    const runBranches = await remoteRunBranches(remote);
    assert.equal(runBranches.length, 1);
    const runBranch = runBranches[0];
    const remoteCheckpoint = (await remoteRefs(remote))[
      `refs/heads/${runBranch}`
    ];
    assert.match(remoteCheckpoint, /^[a-f0-9]{40}$/u);

    const resumedTarget = path.join(prepared.sandbox, "resumed-target");
    await git(
      prepared.sandbox,
      "-c",
      "core.autocrlf=false",
      "clone",
      remote,
      resumedTarget,
    );
    await git(resumedTarget, "config", "core.autocrlf", "false");
    await git(resumedTarget, "branch", "main", "origin/main");
    await git(resumedTarget, "config", "user.name", "Acceptance Resume");
    await git(
      resumedTarget,
      "config",
      "user.email",
      "acceptance-resume@example.invalid",
    );

    const resumed = await invokeRun(
      resumedTarget,
      "acceptance-request.json",
    );
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    assert.equal(resumed.stderr, "");
    const runtimeReport = JSON.parse(resumed.stdout);
    assert.equal(runtimeReport.status, "READY_FOR_HUMAN");
    assert.equal(runtimeReport.accepted, false);
    assert.ok(
      runtimeReport.stateHistory.some(
        (/** @type {any} */ entry) => entry.state === "RESUMED",
      ),
    );
    assert.deepEqual(runtimeReport.executionOrder, [
      "TICKET-1",
      "TICKET-2",
      "TICKET-3",
      "CORRECTION-R1-1",
    ]);
    assert.equal(runtimeReport.specReview.context.reviewRound, 2);
    assert.equal(runtimeReport.qualityReview.context.reviewRound, 2);
    assert.equal(runtimeReport.verification.fullRelevant.status, "PASS");
    assert.equal(
      runtimeReport.verification.fullRelevant.afterExecutionCount,
      4,
    );
    assert.equal(runtimeReport.remoteSync.status, "PASS");
    assert.equal(runtimeReport.remoteSync.branch, runBranch);

    const artifactRoot = path.join(
      runtimeReport.run.worktree,
      ...runtimeReport.run.artifactPath.split("/"),
    );
    const graph = JSON.parse(
      await readFile(path.join(artifactRoot, "ticket-graph.json"), "utf8"),
    );
    assert.equal(graph.reviewRounds.length, 2);
    assert.equal(graph.reviewRounds[0].findings.length, 1);
    assert.equal(graph.reviewRounds[1].findings.length, 0);
    const correction = graph.tickets.find(
      (/** @type {any} */ ticket) => ticket.id === "CORRECTION-R1-1",
    );
    assert.ok(correction);
    assert.equal(correction.status, "COMPLETE");
    assert.match(correction.checkpointCommit, /^[a-f0-9]{40}$/u);
    assert.equal(
      await gitExit(
        runtimeReport.run.worktree,
        "merge-base",
        "--is-ancestor",
        correction.checkpointCommit,
        runtimeReport.run.head,
      ),
      0,
    );

    const refsAfter = await remoteRefs(remote);
    const changedRefs = Object.keys(refsAfter).filter(
      (name) => refsAfter[name] !== refsBefore[name],
    );
    assert.deepEqual(changedRefs, [`refs/heads/${runBranch}`]);
    assert.equal(
      refsAfter[`refs/heads/${runBranch}`],
      runtimeReport.run.head,
    );
    assert.equal(refsAfter["refs/heads/develop"], refsBefore["refs/heads/develop"]);
    assert.equal(refsAfter["refs/heads/main"], refsBefore["refs/heads/main"]);
    assert.equal(
      await git(sourceRepository, "rev-parse", "HEAD"),
      sourceHeadBefore,
    );

    const acceptanceReport = await buildAcceptanceReport({
      prepared,
      runtimeReport,
      graph,
      correction,
      runBranch,
      remoteCheckpoint,
      refsBefore,
      refsAfter,
      sourceHeadBefore,
      finalHeadAt: await git(
        runtimeReport.run.worktree,
        "show",
        "-s",
        "--format=%cI",
        runtimeReport.run.head,
      ),
    });
    const scan = scanQualificationPayload(acceptanceReport);
    assert.deepEqual(scan, { status: "PASS", findings: [] });
    acceptanceReport.redaction.automatedScan = "PASS";
    assert.equal(validateAcceptanceReport(acceptanceReport).valid, false);
    const reviewedHash = acceptanceReportHash(acceptanceReport);
    const redaction = /** @type {Record<string, any>} */ (
      acceptanceReport.redaction
    );
    redaction.manualReview = "PASS";
    redaction.reviewedAt = new Date().toISOString();
    redaction.reviewedReportHash = reviewedHash;
    assert.deepEqual(validateAcceptanceReport(acceptanceReport), {
      valid: true,
      errors: [],
    });

    const evidenceFile = process.env.ENGINEERING_ACCEPTANCE_EVIDENCE_FILE;
    if (evidenceFile) {
      await mkdir(path.dirname(evidenceFile), { recursive: true });
      await writeFile(
        evidenceFile,
        `${JSON.stringify(acceptanceReport, null, 2)}\n`,
        "utf8",
      );
    }
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("acceptance validator rejects stale correction evidence and bad weights", () => {
  const report = minimalAcceptanceReport();
  assert.deepEqual(validateAcceptanceReport(report), {
    valid: true,
    errors: [],
  });

  const stale = structuredClone(report);
  stale.correction.freshChecks = false;
  assert.equal(validateAcceptanceReport(stale).valid, false);

  const staleTimestamp = structuredClone(report);
  staleTimestamp.correction.freshReviewsAt =
    staleTimestamp.correction.completedAt;
  assert.equal(validateAcceptanceReport(staleTimestamp).valid, false);

  const badWeights = structuredClone(report);
  badWeights.scorecard.categories[0].weight =
    /** @type {any} */ (14);
  assert.equal(validateAcceptanceReport(badWeights).valid, false);

  const missingEvidence = structuredClone(report);
  missingEvidence.scorecard.categories[0].evidenceIds = [
    "artifact:does-not-exist.json",
  ];
  missingEvidence.evidenceCatalog.push("artifact:does-not-exist.json");
  assert.equal(validateAcceptanceReport(missingEvidence).valid, false);

  const tamperedAfterReview = structuredClone(report);
  tamperedAfterReview.scorecard.categories[0].evidenceIds.push(
    tamperedAfterReview.scorecard.categories[1].evidenceIds[0],
  );
  assert.equal(validateAcceptanceReport(tamperedAfterReview).valid, false);

  for (const field of ["privateDataPersisted", "signedUrlsPersisted"]) {
    const redactionFailure = structuredClone(report);
    /** @type {Record<string, any>} */ (redactionFailure.redaction)[field] =
      true;
    redactionFailure.redaction.reviewedReportHash =
      pendingAcceptanceReportHash(redactionFailure);
    assert.equal(validateAcceptanceReport(redactionFailure).valid, false);
  }

  const changedProtectedRef = structuredClone(report);
  changedProtectedRef.remoteSync.changedRefs.push("refs/heads/main");
  changedProtectedRef.redaction.reviewedReportHash =
    pendingAcceptanceReportHash(changedProtectedRef);
  assert.equal(validateAcceptanceReport(changedProtectedRef).valid, false);

  const contradictoryRefSummary = structuredClone(report);
  contradictoryRefSummary.protectedRefs.mainAfter = "c".repeat(40);
  contradictoryRefSummary.redaction.reviewedReportHash =
    pendingAcceptanceReportHash(contradictoryRefSummary);
  assert.equal(validateAcceptanceReport(contradictoryRefSummary).valid, false);

  const nonMonotonicChronology = structuredClone(report);
  nonMonotonicChronology.chronology[1].observedAt =
    "2026-07-28T23:59:59.000Z";
  nonMonotonicChronology.redaction.reviewedReportHash =
    pendingAcceptanceReportHash(nonMonotonicChronology);
  assert.equal(validateAcceptanceReport(nonMonotonicChronology).valid, false);

  for (const stage of ["FRESH_REVIEWS", "FINAL_VERIFICATION"]) {
    const unboundFreshEvidence = structuredClone(report);
    const entry = unboundFreshEvidence.chronology.find(
      (/** @type {any} */ item) => item.stage === stage,
    );
    assert.ok(entry);
    entry.evidenceIds = entry.evidenceIds.filter(
      (/** @type {string} */ id) => !id.startsWith("commit:"),
    );
    unboundFreshEvidence.redaction.reviewedReportHash =
      pendingAcceptanceReportHash(unboundFreshEvidence);
    assert.equal(validateAcceptanceReport(unboundFreshEvidence).valid, false);
  }

  const accepted = structuredClone(report);
  accepted.accepted = true;
  assert.equal(validateAcceptanceReport(accepted).valid, false);
});

/** @param {Record<string, any>} input */
async function buildAcceptanceReport(input) {
  const correctionAt = Date.parse(input.correction.checkpointedAt);
  const finalAt = Date.parse(input.finalHeadAt);
  assert.ok(Number.isFinite(correctionAt));
  assert.ok(Number.isFinite(finalAt));
  assert.ok(finalAt >= correctionAt);
  const evidenceTime = new Date(correctionAt).toISOString();
  const finalTime = new Date(finalAt).toISOString();
  const checkpointIds = input.runtimeReport.run.checkpointCommits.map(
    (/** @type {string} */ commit) => `commit:${commit}`,
  );
  /** @type {Record<string, string[]>} */
  const chronologyEvidence = {
    PROJECT_PREPARATION: ["project:prepared", `commit:${input.prepared.baseHead}`],
    TASK_PROFILE_CLASSIFICATION: ["task-profile:STANDARD"],
    RESEARCH: ["artifact:research.json"],
    PLANNING: ["artifact:ticket-graph.json"],
    ADVISOR_GATE: ["artifact:advisor.json"],
    EXECUTION: checkpointIds,
    REMOTE_CHECKPOINT: [`commit:${input.remoteCheckpoint}`],
    DURABLE_RESUME: ["state:RESUMED", `commit:${input.remoteCheckpoint}`],
    REVIEW_BLOCKED: ["review-round:1", "finding:FINDING-1"],
    CONTROLLED_CORRECTION: [`commit:${input.correction.checkpointCommit}`],
    FRESH_REVIEWS: [
      "review-round:2",
      "spec-review:PASS",
      "quality-review:PASS",
      `commit:${input.runtimeReport.run.head}`,
    ],
    FINAL_VERIFICATION: [
      "verification:full-relevant:PASS",
      `commit:${input.runtimeReport.run.head}`,
    ],
    REMOTE_SYNC: [`remote-branch:${input.runBranch}`, "remote-sync:PASS"],
    READY_FOR_HUMAN: [
      `commit:${input.runtimeReport.run.head}`,
      "terminal:READY_FOR_HUMAN",
    ],
  };
  const chronology = REQUIRED_ACCEPTANCE_STAGES.map((stage, index) => ({
    sequence: index + 1,
    stage,
    observedAt: index >= 9 ? finalTime : evidenceTime,
    evidenceIds: chronologyEvidence[stage],
  }));
  /** @type {Record<string, string[]>} */
  const scoreEvidence = {
    "root-orchestration": ["terminal:READY_FOR_HUMAN", "state:RESUMED"],
    modes: ["task-profile:STANDARD"],
    research: ["artifact:research.json"],
    "specs-artifacts": ["artifact:spec-lite.json"],
    "tickets-graph": ["artifact:ticket-graph.json"],
    "planner-advisor": ["artifact:advisor.json", "artifact:advisor-rounds.json"],
    worker: checkpointIds,
    reviews: ["review-round:1", "review-round:2"],
    verification: ["verification:full-relevant:PASS"],
    "safety-recovery": ["state:RESUMED", "remote-sync:PASS"],
  };
  const aggregateDiff = input.runtimeReport.aggregateDiff;
  const artifactEvidence = aggregateDiff.files
    .filter(
      (/** @type {string} */ file) =>
        file.startsWith(".engineering/runs/") && file.endsWith(".json"),
    )
    .map(
      (/** @type {string} */ file) =>
        `artifact:${path.posix.basename(file)}`,
    );
  const factualEvidence = [
    "project:prepared",
    `commit:${input.prepared.baseHead}`,
    "task-profile:STANDARD",
    ...checkpointIds,
    `commit:${input.remoteCheckpoint}`,
    "state:RESUMED",
    "review-round:1",
    "finding:FINDING-1",
    `commit:${input.correction.checkpointCommit}`,
    "review-round:2",
    "spec-review:PASS",
    "quality-review:PASS",
    `commit:${input.runtimeReport.run.head}`,
    "verification:full-relevant:PASS",
    `remote-branch:${input.runBranch}`,
    "remote-sync:PASS",
    "terminal:READY_FOR_HUMAN",
  ];
  const evidenceCatalog = [...new Set([
    ...artifactEvidence,
    ...factualEvidence,
  ])].sort();
  const catalog = new Set(evidenceCatalog);
  const categories = Object.entries(ACCEPTANCE_WEIGHTS).map(
    ([id, weight]) => ({
      id,
      weight,
      score: scoreEvidence[id].every((evidenceId) => catalog.has(evidenceId))
        ? 100
        : 0,
      evidenceIds: scoreEvidence[id],
    }),
  );
  const weightedScore = categories.reduce(
    (sum, category) => sum + category.weight * category.score / 100,
    0,
  );
  const report = {
    schemaVersion: 1,
    issue: 37,
    status: "READY_FOR_HUMAN",
    terminal: true,
    accepted: false,
    generatedAt: finalTime,
    execution: {
      baseRevision: input.sourceHeadBefore,
      sourceFingerprint: createHash("sha256")
        .update(JSON.stringify([
          {
            path: "test/unit/acceptance-lifecycle.test.mjs",
            sha256: "c".repeat(64),
          },
        ]))
        .digest("hex"),
      sourceFiles: [
        {
          path: "test/unit/acceptance-lifecycle.test.mjs",
          sha256: "c".repeat(64),
        },
      ],
    },
    targetProject: {
      prepared: true,
      taskProfile: "STANDARD",
      runBranch: input.runBranch,
    },
    chronology,
    evidenceCatalog,
    resume: {
      status: "PASS",
      fromRemoteCheckpoint: true,
      checkpointCommit: input.remoteCheckpoint,
      chatHistoryUsed: false,
    },
    correction: {
      status: "PASS",
      findingId: "FINDING-1",
      ticketId: "CORRECTION-R1-1",
      commit: input.correction.checkpointCommit,
      completedAt: input.correction.checkpointedAt,
      reviewRound: 1,
      freshReviewRound: 2,
      freshReviewCommit: input.runtimeReport.run.head,
      freshReviewsAt: finalTime,
      freshChecks: true,
      finalVerificationCommit: input.runtimeReport.run.head,
      finalVerificationAt: finalTime,
      freshReviewDescendsFromCorrection: true,
      finalVerificationDescendsFromCorrection: true,
      finalHeadDescendsFromCorrection: true,
    },
    remoteSync: {
      status: "PASS",
      remote: "origin",
      branch: input.runBranch,
      head: input.runtimeReport.run.head,
      changedRefs: [`refs/heads/${input.runBranch}`],
      forcePush: false,
    },
    protectedRefs: {
      status: "PASS",
      developBefore: input.refsBefore["refs/heads/develop"],
      developAfter: input.refsAfter["refs/heads/develop"],
      mainBefore: input.refsBefore["refs/heads/main"],
      mainAfter: input.refsAfter["refs/heads/main"],
      sourceHeadBefore: input.sourceHeadBefore,
      sourceHeadAfter: input.sourceHeadBefore,
      developUnchanged: true,
      mainUnchanged: true,
      sourceRepositoryUnchanged: true,
      deploymentTriggered: false,
      issue16Closed: false,
    },
    aggregateDiff: {
      status: "PASS",
      base: aggregateDiff.base,
      head: aggregateDiff.head,
      files: aggregateDiff.files,
      hash: createHash("sha256")
        .update(JSON.stringify({
          base: aggregateDiff.base,
          head: aggregateDiff.head,
          files: aggregateDiff.files,
        }))
        .digest("hex"),
    },
    scorecard: {
      weightsTotal: 100,
      weightedScore,
      categories,
    },
    redaction: {
      automatedScan: "PENDING",
      manualReview: "PENDING",
      rawLogsPersisted: false,
      chatTranscriptPersisted: false,
      providerPayloadPersisted: false,
      privateDataPersisted: false,
      signedUrlsPersisted: false,
    },
  };
  return report;
}

function minimalAcceptanceReport() {
  const commit = "a".repeat(40);
  const categories = Object.entries(ACCEPTANCE_WEIGHTS).map(
    ([id, weight]) => ({
      id,
      weight,
      score: 100,
      evidenceIds: [`score:${id}`],
    }),
  );
  const chronologyEvidence = REQUIRED_ACCEPTANCE_STAGES.map(
    (stage) => `stage:${stage}`,
  );
  const scoreEvidence = categories.flatMap((entry) => entry.evidenceIds);
  const evidenceCatalog = [...new Set([
    ...chronologyEvidence,
    ...scoreEvidence,
    `commit:${commit}`,
    `commit:${"b".repeat(40)}`,
  ])];
  const sourceFiles = [
    {
      path: "test/unit/acceptance-lifecycle.test.mjs",
      sha256: "c".repeat(64),
    },
  ];
  const report = {
    schemaVersion: 1,
    issue: 37,
    status: "READY_FOR_HUMAN",
    terminal: true,
    accepted: false,
    execution: {
      baseRevision: commit,
      sourceFingerprint: createHash("sha256")
        .update(JSON.stringify(sourceFiles))
        .digest("hex"),
      sourceFiles,
    },
    targetProject: {
      prepared: true,
      taskProfile: "STANDARD",
      runBranch: "run/standard/example",
    },
    evidenceCatalog,
    chronology: REQUIRED_ACCEPTANCE_STAGES.map((stage, index) => ({
      sequence: index + 1,
      stage,
      observedAt: "2026-07-29T00:00:00.000Z",
      evidenceIds: [
        `stage:${stage}`,
        ...([
          "REMOTE_CHECKPOINT",
          "DURABLE_RESUME",
          "CONTROLLED_CORRECTION",
        ].includes(stage)
          ? [`commit:${commit}`]
          : []),
        ...(["FRESH_REVIEWS", "FINAL_VERIFICATION"].includes(stage)
          ? [`commit:${"b".repeat(40)}`]
          : []),
        ...(stage === "READY_FOR_HUMAN"
          ? [`commit:${"b".repeat(40)}`]
          : []),
      ],
    })),
    resume: {
      status: "PASS",
      fromRemoteCheckpoint: true,
      chatHistoryUsed: false,
      checkpointCommit: commit,
    },
    correction: {
      status: "PASS",
      commit,
      completedAt: "2026-07-29T00:00:00.000Z",
      reviewRound: 1,
      freshReviewRound: 2,
      freshReviewCommit: "b".repeat(40),
      freshReviewsAt: "2026-07-29T00:00:01.000Z",
      freshChecks: true,
      finalVerificationCommit: "b".repeat(40),
      finalVerificationAt: "2026-07-29T00:00:01.000Z",
      freshReviewDescendsFromCorrection: true,
      finalVerificationDescendsFromCorrection: true,
      finalHeadDescendsFromCorrection: true,
    },
    remoteSync: {
      status: "PASS",
      branch: "run/standard/example",
      head: "b".repeat(40),
      changedRefs: ["refs/heads/run/standard/example"],
      forcePush: false,
    },
    protectedRefs: {
      status: "PASS",
      developBefore: commit,
      developAfter: commit,
      mainBefore: commit,
      mainAfter: commit,
      sourceHeadBefore: commit,
      sourceHeadAfter: commit,
      developUnchanged: true,
      mainUnchanged: true,
      sourceRepositoryUnchanged: true,
      deploymentTriggered: false,
      issue16Closed: false,
    },
    aggregateDiff: {
      status: "PASS",
      base: commit,
      head: "b".repeat(40),
      files: ["src/message.mjs"],
      hash: createHash("sha256")
        .update(JSON.stringify({
          base: commit,
          head: "b".repeat(40),
          files: ["src/message.mjs"],
        }))
        .digest("hex"),
    },
    scorecard: { weightsTotal: 100, weightedScore: 100, categories },
    redaction: {
      automatedScan: "PASS",
      manualReview: "PASS",
      reviewedAt: "2026-07-29T00:00:02.000Z",
      reviewedReportHash: "",
      rawLogsPersisted: false,
      chatTranscriptPersisted: false,
      providerPayloadPersisted: false,
      privateDataPersisted: false,
      signedUrlsPersisted: false,
    },
  };
  report.redaction.reviewedReportHash = pendingAcceptanceReportHash(report);
  return report;
}

async function prepareTarget() {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-acceptance-real-"),
  );
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Acceptance Root");
  await git(target, "config", "user.email", "acceptance@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: create real acceptance target");
  const onboarding = await runProcess(process.execPath, [
    onboardingPath,
    "--target",
    target,
  ]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  const registry = await readFile(
    path.join(target, "verification-registry.json"),
    "utf8",
  );
  await writeFile(
    path.join(target, ".engineering", "verification", "registry.json"),
    registry,
    "utf8",
  );
  await git(target, "add", ".engineering");
  await git(target, "commit", "-m", "chore: prepare acceptance runtime");
  await git(target, "branch", "main");
  return {
    sandbox,
    target,
    baseHead: await git(target, "rev-parse", "develop"),
  };
}

/** @param {{ sandbox: string, target: string }} prepared */
async function attachBareRemote(prepared) {
  const remote = path.join(prepared.sandbox, "remote.git");
  await git(prepared.sandbox, "init", "--bare", remote);
  await git(prepared.target, "remote", "add", "origin", remote);
  await git(prepared.target, "push", "origin", "develop", "main");
  await git(remote, "symbolic-ref", "HEAD", "refs/heads/develop");
  return remote;
}

/** @param {string} target @param {string} requestPath */
function invokeRun(target, requestPath) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      requestPath,
    ],
    { cwd: target },
  );
}

/** @param {string} remote */
async function remoteRunBranches(remote) {
  const output = await git(
    remote,
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/run/standard",
  );
  return output.split(/\r?\n/u).filter(Boolean);
}

/** @param {string} remote */
async function remoteRefs(remote) {
  const output = await git(
    remote,
    "for-each-ref",
    "--format=%(refname) %(objectname)",
    "refs/heads",
  );
  return Object.fromEntries(
    output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((/** @type {string} */ line) => line.split(" ")),
  );
}

/** @param {string} cwd @param {...string} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(
    result.code,
    0,
    `git ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

/** @param {string} cwd @param {...string} args */
async function gitExit(cwd, ...args) {
  return (await runProcess("git", args, { cwd })).code;
}
