import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertRemoteSyncPolicy,
  checkpointCommitsInExecutionOrder,
  selectDeterministicFrontier,
  standardRequestBindingHash,
} from "../../skills/engineering-loop/runtime/engine.mjs";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const fixturePath = fileURLToPath(new URL("../fixtures/standard-run", import.meta.url));
const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);

test("STANDARD frontier and checkpoint order are locale-independent and graph-ordered", () => {
  const frontier = selectDeterministicFrontier(
    [
      { id: "ticket_a", dependencies: [] },
      { id: "Ticket-Z", dependencies: [] },
      { id: "ticket-a", dependencies: [] },
    ],
    new Set(),
  );
  assert.deepEqual(frontier.map((ticket) => ticket.id), ["Ticket-Z", "ticket-a", "ticket_a"]);
  assert.deepEqual(
    checkpointCommitsInExecutionOrder({
      executionOrder: ["TICKET-B", "TICKET-Z", "TICKET-A"],
      tickets: [
        { id: "TICKET-A", checkpointCommit: "commit-a" },
        { id: "TICKET-B", checkpointCommit: "commit-b" },
        { id: "TICKET-Z", checkpointCommit: "commit-z" },
      ],
    }),
    ["commit-b", "commit-z", "commit-a"],
  );
});

test("Remote Checkpoint Sync policy rejects protected branches, merge, and force", () => {
  const safe = {
    action: "push",
    force: false,
    remote: "origin",
    runBranch: "run/standard/example",
    currentBranch: "run/standard/example",
    integrationBranch: "develop",
    stableBranch: "main",
  };
  assert.doesNotThrow(() => assertRemoteSyncPolicy(safe));
  assert.throws(
    () => assertRemoteSyncPolicy({ ...safe, action: "merge" }),
    /push action/u,
  );
  assert.throws(
    () => assertRemoteSyncPolicy({ ...safe, force: true }),
    /force/u,
  );
  assert.throws(
    () => assertRemoteSyncPolicy({ ...safe, runBranch: "develop" }),
    /protected branch/u,
  );
  assert.throws(
    () => assertRemoteSyncPolicy({ ...safe, currentBranch: "run/standard/other" }),
    /current STANDARD Run Branch/u,
  );
});

test("STANDARD request binding excludes only human answers and keeps remote sync immutable", () => {
  const request = {
    schemaVersion: 1,
    task: { summary: "decision" },
    settings: { remoteCheckpointSync: { enabled: true, remote: "origin" } },
    humanAnswers: { "DECISION-1": "engineers" },
  };
  assert.equal(
    standardRequestBindingHash(request),
    standardRequestBindingHash({ ...request, humanAnswers: { "DECISION-1": "operators" } }),
  );
  assert.notEqual(
    standardRequestBindingHash(request),
    standardRequestBindingHash({
      ...request,
      settings: { remoteCheckpointSync: { enabled: false, remote: "origin" } },
    }),
  );
});

test("ambiguous STANDARD records research before one durable decision gate and never starts Worker", async () => {
  const prepared = await prepareTarget("decision-waiting");
  try {
    const contextBefore = await readFile(path.join(prepared.target, ".engineering", "CONTEXT.md"), "utf8");
    const result = await invokeRun(prepared.target, "decision-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "HUMAN_GATE");
    assert.equal(report.terminal, false);
    assert.equal(report.run.workerCount, 0);
    assert.deepEqual(
      report.stateHistory.map((/** @type {any} */ entry) => entry.state),
      ["CLASSIFIED", "ISOLATED", "REPOSITORY_RESEARCH", "HUMAN_GATE"],
    );
    assert.equal(report.humanGate.kind, "DECISION");
    assert.equal(report.humanGate.status, "WAITING");
    assert.equal(report.humanGate.question.prompt, "Which audience should the public message address?");
    assert.equal(report.humanGate.question.recommendation.answer, "engineers");
    assert.equal(report.humanGate.question.alternatives.length, 1);
    assert.match(report.humanGate.question.alternatives[0].consequence, /operations-facing/u);
    assert.deepEqual(report.humanGate.researchFactIds, ["fact-public-message"]);

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const artifactTree = await snapshotTree(artifactRoot);
    assert.deepEqual(
      artifactTree.map((entry) => entry.path),
      ["human-gate.json", "research.json", "result.json", "state.json", "task-profile.json", "verification.json"],
    );
    assert.equal(await readFile(path.join(prepared.target, ".engineering", "CONTEXT.md"), "utf8"), contextBefore);
    assert.deepEqual(await git(prepared.target, "status", "--porcelain"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("question audit rejects a decision already answered by repository facts", async () => {
  const prepared = await prepareTarget("decision-known-fact", async (target) => {
    const researchPath = path.join(target, "scripts", "research.mjs");
    const source = await readFile(researchPath, "utf8");
    await writeFile(
      researchPath,
      source.replace('answersDecisionQuestions: [],', 'answersDecisionQuestions: ["DECISION-AUDIENCE"],'),
      "utf8",
    );
  });
  try {
    const result = await invokeRun(prepared.target, "decision-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.stage, "DECISION_GATE");
    assert.equal(report.failure.checkId, "question-audit");
    assert.equal(report.run.workerCount, 0);
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "IMPLEMENTING"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a human answer resumes the same STANDARD run, updates CONTEXT once, and skips reversible ADR", async () => {
  const prepared = await prepareTarget("decision-resume");
  try {
    const waiting = JSON.parse((await invokeRun(prepared.target, "decision-request.json")).stdout);
    const resumed = await invokeRun(prepared.target, "decision-request.json", "DECISION-AUDIENCE=engineers");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.run.id, waiting.run.id);
    assert.equal(report.run.branch, waiting.run.branch);
    assert.equal(report.run.workerCount, 1);
    assert.equal("humanGate" in report, false);
    assert.ok(report.stateHistory.some((/** @type {any} */ entry) => entry.state === "DECISION_RECORDED"));

    const context = await gitShow(prepared.target, report.run.head, ".engineering/CONTEXT.md");
    assert.equal((context.match(/engineering-loop:decision:DECISION-AUDIENCE/gu) ?? []).length, 1);
    assert.match(context, /Public audience: The public message is intended for engineers\./u);
    assert.equal(await git(prepared.target, "ls-tree", "-r", "--name-only", report.run.head, ".engineering/adrs"), ".engineering/adrs/.gitkeep");
    const gate = await gitShowJson(prepared.target, report.run.head, `${report.run.artifactPath}/human-gate.json`);
    assert.equal(gate.status, "ANSWERED");
    assert.equal(gate.answer.value, "engineers");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a hard-to-reverse surprising answer creates exactly one linked ADR", async () => {
  const prepared = await prepareTarget("decision-adr");
  try {
    const waiting = JSON.parse((await invokeRun(prepared.target, "hard-decision-request.json")).stdout);
    const resumed = await invokeRun(prepared.target, "hard-decision-request.json", "DECISION-AUDIENCE=engineers");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.run.id, waiting.run.id);
    const adrs = (await git(prepared.target, "ls-tree", "-r", "--name-only", report.run.head, ".engineering/adrs"))
      .split(/\r?\n/u)
      .filter((/** @type {string} */ entry) => entry.endsWith(".md"));
    assert.deepEqual(adrs, [".engineering/adrs/ADR-DECISION-AUDIENCE.md"]);
    const adr = await gitShow(prepared.target, report.run.head, adrs[0]);
    assert.match(adr, /DECISION-AUDIENCE/u);
    assert.match(adr, /engineers/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a fresh clone resumes a synchronized waiting decision gate without chat history", async () => {
  const prepared = await prepareTarget("d2c");
  try {
    const requestPath = path.join(prepared.target, "decision-request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    request.settings = { remoteCheckpointSync: { enabled: true, remote: "origin" } };
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
    await git(prepared.target, "add", "decision-request.json");
    await git(prepared.target, "commit", "-m", "test: enable decision gate sync");
    prepared.developBefore = await git(prepared.target, "rev-parse", "develop");
    const remote = await attachBareRemote(prepared);

    const waitingResult = await invokeRun(prepared.target, "decision-request.json");
    assert.equal(waitingResult.code, 1, `${waitingResult.stdout}\n${waitingResult.stderr}`);
    const waiting = JSON.parse(waitingResult.stdout);
    assert.equal(waiting.status, "HUMAN_GATE");
    assert.equal((await remoteRunBranches(remote)).length, 1);

    const secondTarget = path.join(prepared.sandbox, "m2");
    await git(prepared.sandbox, "-c", "core.autocrlf=false", "clone", remote, secondTarget);
    await git(secondTarget, "config", "core.autocrlf", "false");
    await git(secondTarget, "branch", "main", "origin/main");
    await git(secondTarget, "config", "user.name", "Decision Machine");
    await git(secondTarget, "config", "user.email", "decision-machine@example.invalid");
    const resumed = await invokeRun(secondTarget, "decision-request.json", "DECISION-AUDIENCE=engineers");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.run.id, waiting.run.id);
    assert.equal(report.run.branch, waiting.run.branch);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.remoteSync.restoredFromRemote, true);
    assert.ok(report.stateHistory.some((/** @type {any} */ entry) => entry.state === "DECISION_RECORDED"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("Remote Checkpoint Sync is opt-in and publishes only the current Run Branch", async () => {
  const disabled = await prepareTarget("sync-default-off");
  try {
    const remote = await attachBareRemote(disabled);
    const refsBefore = await remoteRefs(remote);
    const result = await invokeRun(disabled.target, "graph-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(await remoteRefs(remote), refsBefore);
  } finally {
    await rm(disabled.sandbox, { recursive: true, force: true });
  }

  const enabled = await prepareTarget("sync-enabled");
  try {
    const remote = await attachBareRemote(enabled);
    const refsBefore = await remoteRefs(remote);
    const result = await invokeRun(enabled.target, "sync-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.equal(report.remoteSync.enabled, true);
    assert.equal(report.remoteSync.status, "PASS");
    assert.equal(report.remoteSync.remote, "origin");
    assert.equal(report.remoteSync.branch, report.run.branch);

    const refsAfter = await remoteRefs(remote);
    const changedRefs = Object.keys(refsAfter).filter((name) => refsAfter[name] !== refsBefore[name]);
    assert.deepEqual(changedRefs, [`refs/heads/${report.run.branch}`]);
    assert.equal(refsAfter[`refs/heads/${report.run.branch}`], report.run.head);
    assert.equal(refsAfter["refs/heads/develop"], refsBefore["refs/heads/develop"]);
    assert.equal(refsAfter["refs/heads/main"], refsBefore["refs/heads/main"]);

    const syncArtifact = await gitShowJson(
      enabled.target,
      report.run.head,
      `${report.run.artifactPath}/remote-sync.json`,
    );
    assert.equal(syncArtifact.status, "PASS");
    assert.equal(syncArtifact.remote, "origin");
    assert.equal(syncArtifact.branch, report.run.branch);
    assert.ok(syncArtifact.checkpoints.length >= 1);
    assert.ok(syncArtifact.checkpoints.every((/** @type {any} */ entry) => entry.status === "PASS"));
  } finally {
    await rm(enabled.sandbox, { recursive: true, force: true });
  }
});

test("remote divergence stops at a Human Gate without overwriting either history", async () => {
  const prepared = await prepareTarget("sync-divergence");
  try {
    const remote = await attachBareRemote(prepared);
    const interrupted = await invokeRun(prepared.target, "sync-restart-request.json");
    assert.notEqual(interrupted.code, 0);
    const runBranch = (await remoteRunBranches(remote))[0];
    assert.ok(runBranch);
    const runId = runBranch.split("/").at(-1);
    assert.ok(runId);
    const worktree = `${prepared.target}.engineering-worktrees/${runId}`;
    const localCheckpoint = await git(worktree, "rev-parse", "HEAD");

    const adversary = path.join(prepared.sandbox, "adversary");
    await git(prepared.sandbox, "clone", remote, adversary);
    await git(adversary, "config", "user.name", "Remote Writer");
    await git(adversary, "config", "user.email", "remote-writer@example.invalid");
    await git(adversary, "switch", runBranch);
    await writeFile(path.join(adversary, "remote-owner.txt"), "remote history\n", "utf8");
    await git(adversary, "add", "remote-owner.txt");
    await git(adversary, "commit", "-m", "test: add independent remote history");
    await git(adversary, "push", "origin", runBranch);
    const remoteDivergedHead = (await remoteRefs(remote))[`refs/heads/${runBranch}`];

    const resumed = await invokeRun(prepared.target, "sync-restart-request.json");
    assert.equal(resumed.code, 1, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "HUMAN_GATE");
    assert.equal(report.terminal, false);
    assert.equal(report.accepted, false);
    assert.equal(report.blocker.reason, "REMOTE_DIVERGENCE");
    assert.equal(report.humanGate.kind, "REMOTE_SYNC");
    assert.equal(report.humanGate.status, "WAITING");
    assert.equal(report.humanGate.question.alternatives.length, 1);
    assert.equal(report.blocker.remoteHead, remoteDivergedHead);
    assert.notEqual(report.blocker.localHead, remoteDivergedHead);
    assert.equal((await remoteRefs(remote))[`refs/heads/${runBranch}`], remoteDivergedHead);
    assert.equal(await git(worktree, "merge-base", "--is-ancestor", localCheckpoint, report.run.head), "");
    const durableGate = JSON.parse(
      await readFile(path.join(worktree, ...report.run.artifactPath.split("/"), "human-gate.json"), "utf8"),
    );
    assert.equal(durableGate.blocker.reason, "REMOTE_DIVERGENCE");
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a fresh clone resumes the same remote STANDARD frontier without chat history", async () => {
  const prepared = await prepareTarget("sync-two-clone");
  try {
    const remote = await attachBareRemote(prepared);
    const interrupted = await invokeRun(prepared.target, "sync-restart-request.json");
    assert.notEqual(interrupted.code, 0);
    const runBranch = (await remoteRunBranches(remote))[0];
    assert.ok(runBranch);
    const runId = runBranch.split("/").at(-1);
    assert.ok(runId);

    const secondTarget = path.join(prepared.sandbox, "second-machine");
    await git(prepared.sandbox, "-c", "core.autocrlf=false", "clone", remote, secondTarget);
    await git(secondTarget, "config", "core.autocrlf", "false");
    await git(secondTarget, "branch", "main", "origin/main");
    await git(secondTarget, "config", "user.name", "Second Machine");
    await git(secondTarget, "config", "user.email", "second-machine@example.invalid");
    const resumed = await invokeRun(secondTarget, "sync-restart-request.json");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    assert.equal(resumed.stderr, "");
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.equal(report.run.id, runId);
    assert.equal(report.run.branch, runBranch);
    assert.equal(report.remoteSync.status, "PASS");
    assert.ok(report.stateHistory.some((/** @type {any} */ entry) => entry.state === "RESUMED"));
    assert.deepEqual(report.executionOrder, ["TICKET-1", "TICKET-2", "TICKET-3"]);
    assert.equal((await remoteRefs(remote))[`refs/heads/${runBranch}`], report.run.head);
    const graph = await gitShowJson(
      secondTarget,
      report.run.head,
      `${report.run.artifactPath}/ticket-graph.json`,
    );
    assert.equal(graph.tickets.find((/** @type {any} */ ticket) => ticket.id === "TICKET-2").attempts, 1);
    assert.equal("chat" in graph, false);
    const syncArtifact = await gitShowJson(
      secondTarget,
      report.run.head,
      `${report.run.artifactPath}/remote-sync.json`,
    );
    assert.deepEqual(
      syncArtifact.checkpoints.map((/** @type {any} */ entry) => entry.localHead),
      report.run.checkpointCommits,
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("resume records PASS only after a previously rejected checkpoint reaches remote", async () => {
  const prepared = await prepareTarget("sync-rejected-retry");
  try {
    const remote = await attachBareRemote(prepared);
    const rejectingHook = path.join(remote, "hooks", "pre-receive");
    await writeFile(rejectingHook, "#!/bin/sh\nexit 1\n", "utf8");

    const rejected = await invokeRun(prepared.target, "sync-request.json");
    assert.equal(rejected.code, 1, `${rejected.stdout}\n${rejected.stderr}`);
    const gate = JSON.parse(rejected.stdout);
    assert.equal(gate.status, "HUMAN_GATE");
    assert.equal(gate.blocker.reason, "REMOTE_SYNC_REJECTED");
    assert.deepEqual(gate.remoteSync.checkpoints, []);
    assert.deepEqual(await remoteRunBranches(remote), []);

    await rm(rejectingHook, { force: true });
    const resumed = await invokeRun(prepared.target, "sync-request.json");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    const artifact = await gitShowJson(
      prepared.target,
      report.run.head,
      `${report.run.artifactPath}/remote-sync.json`,
    );
    assert.deepEqual(
      artifact.checkpoints.map((/** @type {any} */ entry) => entry.localHead),
      report.run.checkpointCommits,
    );
    assert.ok(artifact.checkpoints.every((/** @type {any} */ entry) => entry.remoteHead === entry.localHead));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("remote resume rejects an unexpected Run Artifact before checkout", async () => {
  const prepared = await prepareTarget("sync-unsafe-remote-artifact");
  try {
    const remote = await attachBareRemote(prepared);
    const interrupted = await invokeRun(prepared.target, "sync-restart-request.json");
    assert.notEqual(interrupted.code, 0);
    const runBranch = (await remoteRunBranches(remote))[0];
    assert.ok(runBranch);
    const runId = runBranch.split("/").at(-1);
    assert.ok(runId);

    const adversary = path.join(prepared.sandbox, "artifact-adversary");
    await git(prepared.sandbox, "clone", remote, adversary);
    await git(adversary, "config", "user.name", "Artifact Writer");
    await git(adversary, "config", "user.email", "artifact-writer@example.invalid");
    await git(adversary, "switch", runBranch);
    const unexpected = path.join(adversary, ".engineering", "runs", runId, "unexpected.json");
    await writeFile(unexpected, "{}\n", "utf8");
    await git(adversary, "add", ".");
    await git(adversary, "commit", "-m", "test: forge unexpected Run Artifact");
    await git(adversary, "push", "origin", runBranch);

    const secondTarget = path.join(prepared.sandbox, "unsafe-second-machine");
    await git(prepared.sandbox, "-c", "core.autocrlf=false", "clone", remote, secondTarget);
    await git(secondTarget, "config", "core.autocrlf", "false");
    await git(secondTarget, "branch", "main", "origin/main");
    const resumed = await invokeRun(secondTarget, "sync-restart-request.json");
    assert.equal(resumed.code, 1);
    assert.match(resumed.stderr, /Run Artifact set is not allowlisted/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("remote resume rejects an unreferenced valid review artifact before checkout", async () => {
  const prepared = await prepareTarget("sync-review-artifact");
  try {
    const remote = await attachBareRemote(prepared);
    const interrupted = await invokeRun(prepared.target, "sync-restart-request.json");
    assert.notEqual(interrupted.code, 0);
    const runBranch = (await remoteRunBranches(remote))[0];
    assert.ok(runBranch);
    const runId = runBranch.split("/").at(-1);
    assert.ok(runId);

    const adversary = path.join(prepared.sandbox, "review-adversary");
    await git(prepared.sandbox, "clone", remote, adversary);
    await git(adversary, "config", "user.name", "Review Artifact Writer");
    await git(adversary, "config", "user.email", "review-artifact-writer@example.invalid");
    await git(adversary, "switch", runBranch);
    const unreferenced = path.join(
      adversary,
      ".engineering",
      "runs",
      runId,
      "spec-review-2.json",
    );
    await writeFile(
      unreferenced,
      `${JSON.stringify({
        schemaVersion: 1,
        status: "PASS",
        context: {
          role: "SPEC_REVIEWER",
          fresh: true,
          readOnly: true,
          packetHash: "a".repeat(64),
          codeFingerprint: "b".repeat(64),
          reviewRound: 2,
        },
        coverage: ["AC-1"],
        evidence: ["forged-evidence"],
        unverified: [],
        findings: [],
      }, null, 2)}\n`,
      "utf8",
    );
    await git(adversary, "add", ".");
    await git(adversary, "commit", "-m", "test: forge unreferenced review artifact");
    await git(adversary, "push", "origin", runBranch);

    const secondTarget = path.join(prepared.sandbox, "review-second");
    await git(prepared.sandbox, "-c", "core.autocrlf=false", "clone", remote, secondTarget);
    await git(secondTarget, "config", "core.autocrlf", "false");
    await git(secondTarget, "branch", "main", "origin/main");
    const resumed = await invokeRun(secondTarget, "sync-restart-request.json");
    assert.equal(resumed.code, 1);
    assert.match(resumed.stderr, /Run Artifact set is not allowlisted/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("one-ticket STANDARD run reaches READY_FOR_HUMAN through the bounded lifecycle", async () => {
  const prepared = await prepareTarget("success");
  try {
    const result = await invokeRun(prepared.target, "standard-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.equal(report.taskProfile.selectedMode, "STANDARD");
    assert.match(report.run.branch, /^run\/standard\//u);
    assert.equal(report.run.rootWriter, true);
    assert.equal(report.run.workerCount, 1);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");

    assert.deepEqual(
      report.stateHistory.map((/** @type {any} */ entry) => entry.state),
      [
        "CLASSIFIED",
        "ISOLATED",
        "REPOSITORY_RESEARCH",
        "SPEC_LITE",
        "TICKET_PLANNING",
        "ADVISOR_GATE",
        "IMPLEMENTING",
        "TICKET_VERIFICATION",
        "CHECKPOINT",
        "SPEC_REVIEW",
        "QUALITY_REVIEW",
        "FULL_VERIFICATION",
        "READY_FOR_HUMAN",
      ],
    );
    assert.equal(report.advisor.status, "APPROVED");
    assert.deepEqual(report.coverage, [
      { acceptanceCriterion: "AC-1", ticket: "TICKET-1", verificationIds: ["ticket-message-test", "observed-behavior"] },
    ]);
    assert.equal(report.specReview.context.role, "SPEC_REVIEWER");
    assert.equal(report.specReview.context.fresh, true);
    assert.equal(report.specReview.context.readOnly, true);
    assert.match(report.specReview.context.packetHash, /^[a-f0-9]{64}$/u);
    assert.equal(report.qualityReview.context.role, "QUALITY_REVIEWER");
    assert.equal(report.qualityReview.context.fresh, true);
    assert.equal(report.qualityReview.context.readOnly, true);
    assert.match(report.qualityReview.context.packetHash, /^[a-f0-9]{64}$/u);
    assert.deepEqual(
      report.verification.checks
        .filter((/** @type {any} */ check) => check.id === "ticket-message-test")
        .map((/** @type {any} */ check) => check.role),
      ["worker-ticket-verification", "ticket-verification"],
    );

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const artifactTree = await snapshotTree(artifactRoot);
    assert.deepEqual(
      artifactTree.map((entry) => entry.path),
      [
        "advisor.json",
        "context-packet.json",
        "quality-review.json",
        "research.json",
        "result.json",
        "spec-lite.json",
        "spec-review.json",
        "state.json",
        "task-profile.json",
        "ticket-graph.json",
        "ticket.json",
        "verification.json",
      ],
    );
    const artifacts = Object.fromEntries(
      await Promise.all(
        artifactTree.map(async ({ path: artifact }) => [
          artifact,
          JSON.parse(await readFile(path.join(artifactRoot, artifact), "utf8")),
        ]),
      ),
    );
    assert.equal(artifacts["research.json"].facts[0].evidence[0], "src/message.mjs");
    assert.deepEqual(artifacts["spec-lite.json"].testingSeams[0].verificationIds, ["ticket-message-test"]);
    assert.equal(artifacts["context-packet.json"].workerMayCommit, false);
    assert.equal(artifacts["context-packet.json"].workerMaySpawnSubagents, false);
    assert.equal("chat" in artifacts["context-packet.json"], false);

    const subjects = (await git(prepared.target, "log", "--format=%s", `${prepared.developBefore}..${report.run.head}`)).split(/\r?\n/u);
    assert.equal(subjects.length, 2);
    assert.ok(subjects.every((/** @type {string} */ subject) => !/worker/iu.test(subject)));
    assert.match(subjects.join("\n"), /complete STANDARD ticket/iu);
    assert.match(subjects.join("\n"), /record STANDARD run readiness/iu);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("multi-ticket STANDARD executes a deterministic blockers-first graph with fresh checkpoints", async () => {
  const prepared = await prepareTarget("dependency-graph");
  try {
    const result = await invokeRun(prepared.target, "graph-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.deepEqual(report.executionOrder, ["TICKET-1", "TICKET-2", "TICKET-3"]);
    assert.equal(report.run.workerCount, 3);
    assert.equal(report.run.checkpointCommits.length, 3);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const graph = JSON.parse(await readFile(path.join(artifactRoot, "ticket-graph.json"), "utf8"));
    assert.deepEqual(graph.executionOrder, ["TICKET-1", "TICKET-2", "TICKET-3"]);
    assert.deepEqual(
      graph.tickets.map((/** @type {any} */ ticket) => ({
        id: ticket.id,
        blockers: ticket.dependencies,
        status: ticket.status,
      })),
      [
        { id: "TICKET-1", blockers: [], status: "COMPLETE" },
        { id: "TICKET-2", blockers: ["TICKET-1"], status: "COMPLETE" },
        { id: "TICKET-3", blockers: ["TICKET-1"], status: "COMPLETE" },
      ],
    );

    /** @type {Record<string, string[]>} */
    const expectedLeases = {
      "TICKET-1": ["src/message.mjs"],
      "TICKET-2": ["src/audience.mjs"],
      "TICKET-3": ["src/punctuation.mjs"],
    };
    for (const ticket of graph.tickets) {
      assert.match(ticket.checkpointCommit, /^[a-f0-9]{40}$/u);
      assert.ok(Number.isInteger(ticket.verification.verifiedAtEpochSeconds));
      const commitEpoch = Number(await git(prepared.target, "show", "-s", "--format=%ct", ticket.checkpointCommit));
      assert.ok(commitEpoch >= ticket.verification.verifiedAtEpochSeconds);
      const packet = await gitShowJson(
        prepared.target,
        ticket.checkpointCommit,
        `${report.run.artifactPath}/context-packet.json`,
      );
      assert.equal(packet.ticketId, ticket.id);
      assert.deepEqual(packet.writeLease, expectedLeases[ticket.id]);
      assert.equal("chat" in packet, false);
      assert.equal("conversation" in packet, false);
    }

    const checkpointSubjects = (
      await git(prepared.target, "log", "--reverse", "--format=%s", `${prepared.developBefore}..${report.run.head}`)
    ).split(/\r?\n/u);
    assert.deepEqual(checkpointSubjects.slice(0, 3).map((/** @type {string} */ subject) => subject.match(/TICKET-\d/u)?.[0]), [
      "TICKET-1",
      "TICKET-2",
      "TICKET-3",
    ]);
    assert.match(checkpointSubjects.at(-1), /record STANDARD run readiness/iu);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("one blocking review finding becomes one corrective ticket and fresh reruns reach READY_FOR_HUMAN", async () => {
  const prepared = await prepareTarget("corrective-one");
  try {
    const result = await invokeRun(prepared.target, "corrective-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.deepEqual(report.executionOrder, ["TICKET-1", "CORRECTION-R1-1"]);
    assert.equal(report.run.workerCount, 2);
    assert.equal(report.specReview.status, "PASS");
    assert.equal(report.specReview.context.reviewRound, 2);
    assert.equal(report.qualityReview.context.reviewRound, 2);
    assert.equal(report.verification.fullRelevant.status, "PASS");
    assert.equal(report.verification.fullRelevant.afterExecutionCount, 2);

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const graph = JSON.parse(await readFile(path.join(artifactRoot, "ticket-graph.json"), "utf8"));
    assert.equal(graph.reviewRounds.length, 2);
    assert.equal(graph.reviewRounds[0].findings.length, 1);
    assert.deepEqual(graph.reviewRounds[0].findings[0], {
      findingId: "FINDING-1",
      reviewArtifact: "spec-review.json",
      correctiveTicketId: "CORRECTION-R1-1",
    });
    const correction = graph.tickets.find(
      (/** @type {any} */ ticket) => ticket.id === "CORRECTION-R1-1",
    );
    assert.deepEqual(correction.sourceFinding, {
      artifact: "spec-review.json",
      role: "SPEC_REVIEWER",
      id: "FINDING-1",
    });
    assert.deepEqual(correction.dependencies, []);
    assert.deepEqual(correction.writeLease, ["src/message.mjs"]);
    assert.deepEqual(correction.verificationIds, ["ticket-message-test"]);
    assert.equal(correction.status, "COMPLETE");
    assert.equal(correction.verification.phase, "TARGETED_VERIFICATION");

    const originalSpecSource = await readFile(path.join(artifactRoot, "spec-review.json"));
    assert.equal(
      createHash("sha256").update(originalSpecSource).digest("hex"),
      graph.reviewRounds[0].artifacts.find(
        (/** @type {any} */ artifact) => artifact.name === "spec-review.json",
      ).sha256,
    );
    assert.equal(JSON.parse(originalSpecSource.toString("utf8")).status, "BLOCKED");
    assert.equal(
      JSON.parse(await readFile(path.join(artifactRoot, "spec-review-2.json"), "utf8")).status,
      "PASS",
    );
    const correctiveWork = JSON.parse(
      await readFile(path.join(artifactRoot, "corrective-work.json"), "utf8"),
    );
    assert.equal(correctiveWork.status, "COMPLETE");
    assert.equal(correctiveWork.completedAfterReviewRound, 2);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("dependent blocking findings execute corrective tickets blockers first", async () => {
  const prepared = await prepareTarget("corrective-dependencies");
  try {
    const result = await invokeRun(prepared.target, "corrective-graph-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.deepEqual(report.executionOrder, [
      "TICKET-1",
      "TICKET-2",
      "TICKET-3",
      "CORRECTION-R1-1",
      "CORRECTION-R1-2",
    ]);
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const graph = JSON.parse(await readFile(path.join(artifactRoot, "ticket-graph.json"), "utf8"));
    const corrections = graph.tickets.filter((/** @type {any} */ ticket) => ticket.sourceFinding);
    assert.deepEqual(
      corrections.map((/** @type {any} */ ticket) => ({
        id: ticket.id,
        finding: ticket.sourceFinding.id,
        blockers: ticket.dependencies,
        status: ticket.status,
      })),
      [
        {
          id: "CORRECTION-R1-1",
          finding: "FINDING-A",
          blockers: [],
          status: "COMPLETE",
        },
        {
          id: "CORRECTION-R1-2",
          finding: "FINDING-B",
          blockers: ["CORRECTION-R1-1"],
          status: "COMPLETE",
        },
      ],
    );
    assert.ok(corrections.every((/** @type {any} */ ticket) => ticket.verification.status === "PASS"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("false-green reviewers cannot override a failing instrumental test", async () => {
  const prepared = await prepareTarget("false-green", async (target) => {
    await writeFile(
      path.join(target, "test", "message.test.mjs"),
      'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("instrumental failure", () => assert.fail("expected failure"));\n',
      "utf8",
    );
  });
  try {
    const result = await invokeRun(prepared.target, "standard-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    assert.equal(
      JSON.parse(await readFile(path.join(artifactRoot, "spec-review.json"), "utf8")).status,
      "PASS",
    );
    assert.equal(
      JSON.parse(await readFile(path.join(artifactRoot, "quality-review.json"), "utf8")).status,
      "PASS",
    );
    assert.equal(report.failure.stage, "FULL_VERIFICATION");
    assert.equal(report.failure.checkId, "full-test");
    assert.equal(report.releaseStateReached, false);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("interrupted STANDARD graph resumes from durable state without chat history", async () => {
  const prepared = await prepareTarget("dependency-graph-resume");
  try {
    const interrupted = await invokeRun(prepared.target, "restart-request.json");
    assert.notEqual(interrupted.code, 0);

    const branches = (
      await git(prepared.target, "for-each-ref", "--format=%(refname:short)", "refs/heads/run/standard/")
    ).split(/\r?\n/u).filter(Boolean);
    assert.equal(branches.length, 1);
    const runId = branches[0].split("/").at(-1);
    assert.ok(runId);
    const interruptedWorktree = `${prepared.target}.engineering-worktrees/${runId}`;
    const interruptedGraph = JSON.parse(
      await readFile(
        path.join(interruptedWorktree, ".engineering", "runs", runId, "ticket-graph.json"),
        "utf8",
      ),
    );
    assert.deepEqual(interruptedGraph.executionOrder, ["TICKET-1"]);
    assert.equal(interruptedGraph.tickets.find((/** @type {any} */ ticket) => ticket.id === "TICKET-2").attempts, 1);

    const committedGraph = await gitShowJson(
      prepared.target,
      branches[0],
      `.engineering/runs/${runId}/ticket-graph.json`,
    );
    assert.equal(
      committedGraph.tickets.find((/** @type {any} */ ticket) => ticket.id === "TICKET-1").status,
      "IN_PROGRESS",
    );
    await writeFile(
      path.join(interruptedWorktree, ".engineering", "runs", runId, "ticket-graph.json"),
      `${JSON.stringify(committedGraph, null, 2)}\n`,
      "utf8",
    );

    const postCommitRestart = await invokeRun(prepared.target, "restart-request.json");
    assert.notEqual(postCommitRestart.code, 0);
    const resumed = await invokeRun(prepared.target, "restart-request.json");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.run.id, runId);
    assert.equal(report.run.branch, branches[0]);
    assert.deepEqual(report.executionOrder, ["TICKET-1", "TICKET-2", "TICKET-3"]);
    assert.deepEqual(report.run.checkpointCommits.slice(0, 1), [interruptedGraph.tickets[0].checkpointCommit]);
    const finalGraph = JSON.parse(
      await readFile(
        path.join(report.run.worktree, ...report.run.artifactPath.split("/"), "ticket-graph.json"),
        "utf8",
      ),
    );
    assert.equal(finalGraph.tickets.find((/** @type {any} */ ticket) => ticket.id === "TICKET-2").attempts, 2);
    assert.ok(report.stateHistory.some((/** @type {any} */ entry) => entry.state === "RESUMED"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("STANDARD blocks readiness when final verification makes checkpoint evidence stale", async () => {
  const prepared = await prepareTarget("stale-evidence");
  try {
    const result = await invokeRun(prepared.target, "stale-evidence-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.releaseStateReached, false);
    assert.deepEqual(report.failure, {
      stage: "FULL_VERIFICATION",
      checkId: "full-verification-freshness",
      role: "schema",
      exitCode: 1,
    });
    assert.match(report.run.checkpointCommit, /^[a-f0-9]{40}$/u);
    assert.equal(report.run.head, report.run.checkpointCommit);
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), report.run.checkpointCommit);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("STANDARD rejects an Advisor result outside the strict evidence-bound schema", async () => {
  const prepared = await prepareTarget("advisor-schema", async (target) => {
    await writeFile(
      path.join(target, "scripts", "advisor.mjs"),
      `const ticketIds = JSON.parse(process.env.ENGINEERING_ADVISOR_TICKETS);\nconst evidence = JSON.parse(process.env.ENGINEERING_ADVISOR_EVIDENCE);\nprocess.stdout.write(JSON.stringify({ schemaVersion: 1, status: "APPROVED", ticketIds, evidence, concerns: [], unexpected: true }));\n`,
      "utf8",
    );
  });
  try {
    const result = await invokeRun(prepared.target, "standard-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.stage, "ADVISOR_GATE");
    assert.equal(report.failure.checkId, "advisor-approval");
    assert.equal(report.run.checkpointCommit, null);
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "IMPLEMENTING"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("STANDARD blocks when one independent reviewer does not verify its review packet", async () => {
  const prepared = await prepareTarget("review-packet", async (target) => {
    await writeFile(
      path.join(target, "scripts", "quality-review.mjs"),
      `const packet = JSON.parse(process.env.ENGINEERING_REVIEW_PACKET ? await (await import("node:fs/promises")).readFile(process.env.ENGINEERING_REVIEW_PACKET, "utf8") : "null");\nprocess.stdout.write(JSON.stringify({ schemaVersion: 1, status: "PASS", packetHash: "wrong", coverage: packet.requirements, evidence: ["artifact-hashes"], unverified: [] }));\n`,
      "utf8",
    );
  });
  try {
    const result = await invokeRun(prepared.target, "standard-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.stage, "QUALITY_REVIEW");
    assert.equal(report.failure.checkId, "quality-review-schema");
    assert.match(report.run.checkpointCommit, /^[a-f0-9]{40}$/u);
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    assert.ok((await readFile(path.join(artifactRoot, "spec-review.json"), "utf8")).includes("SPEC_REVIEWER"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/** @param {string} label @param {(target: string) => Promise<void>} [prepareFixture] */
async function prepareTarget(label, prepareFixture) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-standard-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await prepareFixture?.(target);
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Engineering Loop Test");
  await git(target, "config", "user.email", "engineering-loop@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: add STANDARD fixture");
  const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  const registry = await readFile(path.join(target, "verification-registry.json"), "utf8");
  await writeFile(path.join(target, ".engineering", "verification", "registry.json"), registry, "utf8");
  await git(target, "add", ".engineering");
  await git(target, "commit", "-m", "chore: prepare project runtime");
  await git(target, "branch", "main");
  return {
    sandbox,
    target,
    developBefore: await git(target, "rev-parse", "develop"),
    mainBefore: await git(target, "rev-parse", "main"),
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

/** @param {string} remote */
async function remoteRefs(remote) {
  const output = await git(remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads");
  return Object.fromEntries(
    output.split(/\r?\n/u).filter(Boolean).map((/** @type {string} */ line) => line.split(" ")),
  );
}

/** @param {string} remote */
async function remoteRunBranches(remote) {
  const output = await git(remote, "for-each-ref", "--format=%(refname:short)", "refs/heads/run/standard");
  return output.split(/\r?\n/u).filter(Boolean);
}

/** @param {string} target @param {string} requestPath @param {string} [humanAnswer] */
function invokeRun(target, requestPath, humanAnswer) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      requestPath,
      ...(humanAnswer ? ["--human-answer", humanAnswer] : []),
    ],
    { cwd: target },
  );
}

/** @param {string} cwd @param {...string} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(result.code, 0, `git ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
async function gitShowJson(cwd, revision, projectPath) {
  return JSON.parse(await gitShow(cwd, revision, projectPath));
}

/** @param {string} cwd @param {string} revision @param {string} projectPath */
function gitShow(cwd, revision, projectPath) {
  return git(cwd, "show", `${revision}:${projectPath}`);
}
