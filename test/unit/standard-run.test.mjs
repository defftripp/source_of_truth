import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkpointCommitsInExecutionOrder,
  selectDeterministicFrontier,
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
      checkId: "verification-freshness",
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

/** @param {string} target @param {string} requestPath */
function invokeRun(target, requestPath) {
  return runProcess(
    process.execPath,
    [path.join(target, ".engineering", "runtime", "engine.mjs"), "--run-request", requestPath],
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
  return JSON.parse(await git(cwd, "show", `${revision}:${projectPath}`));
}
