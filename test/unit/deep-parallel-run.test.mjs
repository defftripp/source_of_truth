import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(root, "test", "fixtures", "deep-parallel-run");
const onboardingPath = path.join(root, "skills", "engineering-loop", "scripts", "onboard.mjs");

test("disjoint DEEP tickets overlap in time in separate Worker worktrees", async () => {
  const prepared = await prepareTarget("disjoint");
  try {
    const report = await completeRun(prepared.target, "disjoint-request.json");

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.deepEqual(report.executionOrder, ["TICKET-A", "TICKET-B"]);
    assert.equal(report.run.workerCount, 2);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const parallel = JSON.parse(
      await readFile(path.join(artifactRoot, "parallel-execution.json"), "utf8"),
    );
    assert.equal(parallel.batches.length, 1);
    assert.equal(parallel.batches[0].execution, "PARALLEL");
    const [left, right] = parallel.batches[0].workers;
    assert.notEqual(normalizePath(left.worktree), normalizePath(right.worktree));
    assert.ok(intervalsOverlap(left, right), JSON.stringify(parallel.batches[0].workers, null, 2));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("overlapping DEEP Write Leases execute strictly sequentially", async () => {
  const prepared = await prepareTarget("overlapping-lease");
  try {
    const report = await completeRun(prepared.target, "overlapping-lease-request.json");
    const parallel = await readParallelArtifact(report);
    const workers = parallel.batches.flatMap((/** @type {any} */ batch) => batch.workers);

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.run.workerCount, 2);
    assert.ok(
      parallel.batches.some((/** @type {any} */ batch) =>
        batch.reasons.some((/** @type {any} */ reason) => reason.kind === "WRITE_LEASE_OVERLAP")
      ),
    );
    assert.equal(workers.length, 2);
    assert.equal(intervalsOverlap(workers[0], workers[1]), false);
    assert.ok(parallel.batches.every((/** @type {any} */ batch) => batch.execution === "SEQUENTIAL"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("overlapping DEEP contracts execute strictly sequentially", async () => {
  const prepared = await prepareTarget("overlapping-contract");
  try {
    const report = await completeRun(prepared.target, "overlapping-contract-request.json");
    const parallel = await readParallelArtifact(report);
    const workers = parallel.batches.flatMap((/** @type {any} */ batch) => batch.workers);

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.ok(
      parallel.batches.some((/** @type {any} */ batch) =>
        batch.reasons.some((/** @type {any} */ reason) => reason.kind === "CONTRACT_OVERLAP")
      ),
    );
    assert.equal(workers.length, 2);
    assert.equal(intervalsOverlap(workers[0], workers[1]), false);
    assert.ok(parallel.batches.every((/** @type {any} */ batch) => batch.execution === "SEQUENTIAL"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a Worker commit or integration attempt is BLOCKED before Root acceptance", async () => {
  const prepared = await prepareTarget("forbidden-worker");
  try {
    const report = await runThroughGate(prepared.target, "forbidden-worker-request.json");

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "root-writer");
    assert.equal(report.run.checkpointCommit, null);
    assert.deepEqual(report.run.checkpointCommits, []);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    const corrective = await readRunArtifact(report, "corrective-work.json");
    assert.equal(corrective.status, "BLOCKED");
    assert.equal(corrective.silentMerge, false);
    assert.equal(corrective.acceptedIntegration.changed, false);
    assert.equal(corrective.acceptedIntegration.head, report.run.head);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("forbidden Worker Git on a new path restores the accepted clean worktree", async () => {
  const prepared = await prepareTarget("forbidden-new-path");
  try {
    const report = await runThroughGate(prepared.target, "forbidden-new-path-request.json");

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "root-writer");
    await assert.rejects(
      readFile(path.join(report.run.worktree, "src", "new.mjs"), "utf8"),
      (/** @type {any} */ error) => error?.code === "ENOENT",
    );
    assert.equal(await git(report.run.worktree, "status", "--porcelain", "--", "src/new.mjs"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a conflicting Worker result creates BLOCKED corrective work without changing accepted integration", async () => {
  const prepared = await prepareTarget("conflicting-worker");
  try {
    const report = await runThroughGate(prepared.target, "conflicting-worker-request.json");

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "worker-result-conflict");
    assert.equal(report.run.checkpointCommit, null);
    const corrective = await readRunArtifact(report, "corrective-work.json");
    assert.deepEqual(corrective.sourceTicketIds, ["TICKET-A", "TICKET-B"]);
    assert.equal(corrective.acceptedIntegration.head, report.run.head);
    assert.equal(corrective.acceptedIntegration.changed, false);
    assert.match(await git(report.run.worktree, "show", "HEAD:src/a.mjs"), /initial-a/u);
    assert.match(await git(report.run.worktree, "show", "HEAD:src/b.mjs"), /initial-b/u);
    assert.doesNotMatch(await readFile(path.join(report.run.worktree, "src", "a.mjs"), "utf8"), /conflict/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("pending parallel results are revalidated before the first Root checkpoint", async () => {
  const prepared = await prepareTarget("mutating-targeted");
  try {
    const report = await runThroughGate(prepared.target, "mutating-targeted-request.json");

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "worker-result-divergence");
    assert.equal(report.run.checkpointCommit, null);
    assert.match(await readFile(path.join(report.run.worktree, "src", "a.mjs"), "utf8"), /initial-a/u);
    assert.match(await readFile(path.join(report.run.worktree, "src", "b.mjs"), "utf8"), /initial-b/u);
    const corrective = await readRunArtifact(report, "corrective-work.json");
    assert.deepEqual(corrective.sourceTicketIds, ["TICKET-A", "TICKET-B"]);
    assert.equal(corrective.acceptedIntegration.head, report.run.head);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("resume removes stale registered Worker worktrees before parallel relaunch", async () => {
  const prepared = await prepareTarget("stale-wt");
  try {
    const waiting = await invokeRun(prepared.target, "disjoint-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const gate = JSON.parse(waiting.stdout);
    const workerParent = path.join(
      `${prepared.target}.engineering-worktrees`,
      `${gate.run.id}-workers`,
    );
    for (const ticketId of ["TICKET-A", "TICKET-B"]) {
      await git(
        prepared.target,
        "worktree",
        "add",
        "--detach",
        path.join(workerParent, ticketId),
        gate.run.head,
      );
    }

    const completed = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
    );
    assert.equal(completed.code, 0, `${completed.stdout}\n${completed.stderr}`);
    const report = JSON.parse(completed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.doesNotMatch(await git(prepared.target, "worktree", "list", "--porcelain"), /-workers/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("resume discards and replays a bounded pre-commit Worker result from durable HEAD", async () => {
  const prepared = await prepareTarget("precommit-resume");
  try {
    const waiting = await invokeRun(prepared.target, "disjoint-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const gate = JSON.parse(waiting.stdout);
    const interrupted = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
      {
        ...process.env,
        NODE_ENV: "test",
        ENGINEERING_TEST_FAIL_BEFORE_CHECKPOINT_COMMIT: "TICKET-B",
      },
    );
    assert.equal(interrupted.code, 1);
    assert.match(interrupted.stderr, /Test fault before checkpoint commit for TICKET-B/u);

    const durableHead = await git(gate.run.worktree, "rev-parse", "HEAD");
    assert.notEqual(await git(gate.run.worktree, "status", "--porcelain"), "");
    const resumed = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
    );
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    const parallel = await readParallelArtifact(report);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.executionOrder.at(-1), "TICKET-B");
    assert.equal(report.run.checkpointCommits[0], durableHead);
    assert.equal(report.run.checkpointCommits.length, 2);
    assert.deepEqual(
      parallel.batches.flatMap((/** @type {any} */ batch) => batch.integrations)
        .map((/** @type {any} */ integration) => integration.ticketId),
      ["TICKET-A", "TICKET-B"],
    );
    assert.equal(await git(report.run.worktree, "status", "--porcelain", "--", "src"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("resume reinitializes parallel evidence when the first checkpoint was not committed", async () => {
  const prepared = await prepareTarget("first-pre");
  try {
    const waiting = await invokeRun(prepared.target, "disjoint-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const gate = JSON.parse(waiting.stdout);
    const interrupted = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
      {
        ...process.env,
        NODE_ENV: "test",
        ENGINEERING_TEST_FAIL_BEFORE_CHECKPOINT_COMMIT: "TICKET-A",
      },
    );
    assert.equal(interrupted.code, 1);
    assert.match(interrupted.stderr, /Test fault before checkpoint commit for TICKET-A/u);

    const approvalHead = await git(gate.run.worktree, "rev-parse", "HEAD");
    assert.notEqual(await git(gate.run.worktree, "status", "--porcelain"), "");
    const resumed = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
    );
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    const parallel = await readParallelArtifact(report);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.run.checkpointCommits.length, 2);
    assert.notEqual(report.run.checkpointCommits[0], approvalHead);
    assert.deepEqual(report.executionOrder, ["TICKET-A", "TICKET-B"]);
    assert.equal(
      parallel.batches.flatMap((/** @type {any} */ batch) => batch.integrations).length,
      2,
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("resume reconciles a durable pending integration after checkpoint commit", async () => {
  const prepared = await prepareTarget("checkpoint-resume");
  try {
    const waiting = await invokeRun(prepared.target, "disjoint-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const gate = JSON.parse(waiting.stdout);
    const crashed = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
      {
        ...process.env,
        NODE_ENV: "test",
        ENGINEERING_TEST_FAIL_AFTER_CHECKPOINT_COMMIT: "TICKET-B",
      },
    );
    assert.equal(crashed.code, 1);
    assert.match(crashed.stderr, /Test fault after checkpoint commit for TICKET-B/u);

    const checkpointB = await git(gate.run.worktree, "rev-parse", "HEAD");
    const checkpointA = await git(gate.run.worktree, "rev-parse", "HEAD^");
    const committedParallel = JSON.parse(
      await git(
        gate.run.worktree,
        "show",
        `HEAD:${gate.run.artifactPath}/parallel-execution.json`,
      ),
    );
    assert.deepEqual(
      committedParallel.batches[0].integrations.map(
        (/** @type {any} */ integration) => ({
          ticketId: integration.ticketId,
          state: integration.state,
          checkpointCommit: integration.checkpointCommit,
        }),
      ),
      [
        {
          ticketId: "TICKET-A",
          state: "CHECKPOINTED",
          checkpointCommit: checkpointA,
        },
        {
          ticketId: "TICKET-B",
          state: "CHECKPOINT_PENDING",
          checkpointCommit: null,
        },
      ],
    );

    const parallelPath = path.join(
      gate.run.worktree,
      ...gate.run.artifactPath.split("/"),
      "parallel-execution.json",
    );
    const driftedParallel = JSON.parse(JSON.stringify(committedParallel));
    driftedParallel.batches[0].workers[0].worktree = "tampered-worker-root";
    await writeFile(parallelPath, `${JSON.stringify(driftedParallel, null, 2)}\n`, "utf8");
    const rejected = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
    );
    assert.equal(rejected.code, 1);
    assert.match(rejected.stderr, /parallel evidence drift/u);
    await writeFile(parallelPath, `${JSON.stringify(committedParallel, null, 2)}\n`, "utf8");

    const resumed = await invokeRun(
      prepared.target,
      "disjoint-request.json",
      `migration-manifest=${gate.humanGate.manifestHash}`,
    );
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    const parallel = await readParallelArtifact(report);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.deepEqual(report.run.checkpointCommits, [checkpointA, checkpointB]);
    assert.deepEqual(
      parallel.batches[0].integrations.map(
        (/** @type {any} */ integration) => ({
          ticketId: integration.ticketId,
          state: integration.state,
          checkpointCommit: integration.checkpointCommit,
        }),
      ),
      [
        {
          ticketId: "TICKET-A",
          state: "CHECKPOINTED",
          checkpointCommit: report.run.checkpointCommits[0],
        },
        {
          ticketId: "TICKET-B",
          state: "CHECKPOINTED",
          checkpointCommit: report.run.checkpointCommits[1],
        },
      ],
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("Root targets every accepted result before checkpoint and runs full verification last", async () => {
  const prepared = await prepareTarget("verification-sequence");
  try {
    const report = await completeRun(prepared.target, "disjoint-request.json");
    const parallel = await readParallelArtifact(report);
    const targeted = report.verification.checks.filter(
      (/** @type {any} */ check) => check.phase === "TARGETED_VERIFICATION",
    );
    const full = report.verification.checks.filter(
      (/** @type {any} */ check) => check.phase === "FULL_VERIFICATION",
    );

    assert.deepEqual(targeted.map((/** @type {any} */ check) => check.ticketId), [
      "TICKET-A",
      "TICKET-B",
    ]);
    assert.ok(targeted.every((/** @type {any} */ check) => check.status === "PASS"));
    assert.ok(full.length > 0);
    assert.ok(Math.max(...targeted.map((/** @type {any} */ check) => check.sequence)) <
      Math.min(...full.map((/** @type {any} */ check) => check.sequence)));
    assert.deepEqual(
      parallel.batches[0].integrations.map((/** @type {any} */ integration) => ({
        ticketId: integration.ticketId,
        targeted: integration.targetedVerificationStatus,
        checkpoint: integration.checkpointCommit,
      })),
      [
        { ticketId: "TICKET-A", targeted: "PASS", checkpoint: report.run.checkpointCommits[0] },
        { ticketId: "TICKET-B", targeted: "PASS", checkpoint: report.run.checkpointCommits[1] },
      ],
    );
    assert.equal(parallel.fullVerification.afterIntegrationCount, 2);
    assert.equal(parallel.fullVerification.status, "PASS");
    assert.ok(parallel.fullVerification.startedAtEpochMs >=
      Math.max(...parallel.batches[0].workers.map((/** @type {any} */ worker) => worker.endedAtEpochMs)));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/** @param {Record<string, any>} report */
async function readParallelArtifact(report) {
  const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
  return JSON.parse(await readFile(path.join(artifactRoot, "parallel-execution.json"), "utf8"));
}

/** @param {Record<string, any>} report @param {string} name */
async function readRunArtifact(report, name) {
  const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
  return JSON.parse(await readFile(path.join(artifactRoot, name), "utf8"));
}

/** @param {string} target @param {string} requestPath */
async function runThroughGate(target, requestPath) {
  const waiting = await invokeRun(target, requestPath);
  assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
  const gate = JSON.parse(waiting.stdout);
  assert.equal(gate.status, "HUMAN_GATE");
  const completed = await invokeRun(
    target,
    requestPath,
    `migration-manifest=${gate.humanGate.manifestHash}`,
  );
  assert.equal(completed.code, 1, `${completed.stdout}\n${completed.stderr}`);
  return JSON.parse(completed.stdout);
}

/** @param {string} target @param {string} requestPath */
async function completeRun(target, requestPath) {
  const waiting = await invokeRun(target, requestPath);
  assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
  const gate = JSON.parse(waiting.stdout);
  assert.equal(gate.status, "HUMAN_GATE");
  const completed = await invokeRun(
    target,
    requestPath,
    `migration-manifest=${gate.humanGate.manifestHash}`,
  );
  assert.equal(completed.code, 0, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(completed.stderr, "");
  return JSON.parse(completed.stdout);
}

/** @param {string} label */
async function prepareTarget(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-deep-parallel-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Engineering Loop Test");
  await git(target, "config", "user.email", "engineering-loop@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: add guarded DEEP fixture");
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

/** @param {string} target @param {string} requestPath @param {string} [humanAnswer] @param {NodeJS.ProcessEnv} [env] */
function invokeRun(target, requestPath, humanAnswer, env) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      requestPath,
      ...(humanAnswer ? ["--human-answer", humanAnswer] : []),
    ],
    { cwd: target, env },
  );
}

/** @param {Record<string, any>} left @param {Record<string, any>} right */
function intervalsOverlap(left, right) {
  return left.startedAtEpochMs < right.endedAtEpochMs &&
    right.startedAtEpochMs < left.endedAtEpochMs;
}

/** @param {string} value */
function normalizePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** @param {string} cwd @param {...string} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(result.code, 0, `git ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
