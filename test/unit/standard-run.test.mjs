import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const fixturePath = fileURLToPath(new URL("../fixtures/standard-run", import.meta.url));
const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);

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

test("STANDARD refuses a Root checkpoint when ticket verification evidence is stale", async () => {
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
    assert.equal(report.run.checkpointCommit, null);
    assert.equal(report.run.head, prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
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
    assert.equal(report.run.checkpointCommit, null);
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
