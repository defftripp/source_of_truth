import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(root, "test", "fixtures", "deep-run");
const onboardingPath = path.join(root, "skills", "engineering-loop", "scripts", "onboard.mjs");

test("one-ticket DEEP run reaches READY_FOR_HUMAN through the common planned lifecycle", async () => {
  const prepared = await prepareTarget("success");
  try {
    const waiting = await invokeRun(prepared.target, "deep-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const waitingReport = JSON.parse(waiting.stdout);
    assert.equal(waitingReport.status, "HUMAN_GATE");
    assert.equal(waitingReport.humanGate.kind, "MIGRATION_MANIFEST");
    assert.equal(waitingReport.humanGate.status, "WAITING");
    assert.equal(waitingReport.run.workerCount, 0);
    assert.equal(waitingReport.humanGate.manifestHash, "d5ad4d66a0d8b5d2db2d28fc1c82a4ebdc697f7db51cd75fbfd3e2c2aeee8f8d");
    assert.deepEqual(waitingReport.humanGate.destructivePaths, ["src/payment.mjs"]);
    assert.match(
      await git(prepared.target, "show", `${waitingReport.run.head}:.engineering/CONTEXT.md`),
      /payment ledger owns durable payment state/iu,
    );
    assert.match(
      await git(
        prepared.target,
        "show",
        `${waitingReport.run.head}:.engineering/adrs/ADR-decision-rollback.md`,
      ),
      /fact-rollback-owner/u,
    );

    const manifestAnswer = `migration-manifest=${waitingReport.humanGate.manifestHash}`;
    const result = await invokeRun(prepared.target, "deep-request.json", manifestAnswer);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.accepted, false);
    assert.equal(report.taskProfile.selectedMode, "DEEP");
    assert.match(report.run.branch, /^run\/deep\//u);
    assert.equal(report.run.workerCount, 1);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
    assert.deepEqual(report.stateHistory.map((/** @type {any} */ entry) => entry.state), [
      "CLASSIFIED",
      "ISOLATED",
      "REPOSITORY_RESEARCH",
      "DOMAIN_MODELING",
      "DECISION_RECORDING",
      "SPECIFICATION",
      "TICKET_PLANNING",
      "MIGRATION_CONTRACT",
      "ROLLBACK_PLAN",
      "MANIFEST_APPROVAL",
      "HUMAN_GATE",
      "RESUMED",
      "MANIFEST_APPROVED",
      "ADVISOR_GATE",
      "IMPLEMENTING",
      "TICKET_VERIFICATION",
      "CHECKPOINT",
      "SPEC_REVIEW",
      "QUALITY_REVIEW",
      "FULL_VERIFICATION",
      "READY_FOR_HUMAN",
    ]);
    assert.equal(report.advisor.status, "APPROVED");
    assert.equal(report.specReview.context.role, "SPEC_REVIEWER");
    assert.equal(report.qualityReview.context.role, "QUALITY_REVIEWER");
    assert.ok(report.verification.checks.some((/** @type {any} */ check) => check.role === "observed-behavior"));

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const domain = JSON.parse(await readFile(path.join(artifactRoot, "domain-model.json"), "utf8"));
    assert.deepEqual(domain.boundaries[0].evidenceIds, [
      "fact-payment-boundary",
      "fact-rollback-owner",
    ]);
    const decisions = JSON.parse(await readFile(path.join(artifactRoot, "domain-decisions.json"), "utf8"));
    assert.deepEqual(
      decisions.decisions.map((/** @type {any} */ decision) => decision.record),
      ["CONTEXT", "ADR"],
    );
    assert.deepEqual(decisions.contextPaths, [
      ".engineering/CONTEXT.md",
      ".engineering/adrs/ADR-decision-rollback.md",
    ]);
    assert.match(
      await git(prepared.target, "show", `${report.run.head}:.engineering/CONTEXT.md`),
      /payment ledger owns durable payment state/iu,
    );
    assert.match(
      await git(
        prepared.target,
        "show",
        `${report.run.head}:.engineering/adrs/ADR-decision-rollback.md`,
      ),
      /fact-rollback-owner/u,
    );
    const approval = JSON.parse(await readFile(path.join(artifactRoot, "manifest-approval.json"), "utf8"));
    assert.equal(approval.manifestHash, report.migrationManifest.hash);

    const subjects = (await git(
      prepared.target,
      "log",
      "--format=%s",
      `${prepared.developBefore}..${report.run.head}`,
    )).split(/\r?\n/u);
    assert.equal(subjects.length, 4);
    assert.ok(subjects.every((/** @type {string} */ subject) => !/worker/iu.test(subject)));
    assert.ok(subjects.every((/** @type {string} */ subject) => !/ACCEPTED/iu.test(subject)));

    const approvalRow = (await git(
      prepared.target,
      "log",
      "--format=%H%x09%s",
      `${prepared.developBefore}..${report.run.head}`,
    )).split(/\r?\n/u).find((/** @type {string} */ row) => row.includes("record DEEP Migration Manifest approval"));
    assert.ok(approvalRow);
    const approvalCommit = approvalRow.split("\t", 1)[0];
    await git(report.run.worktree, "reset", "--hard", approvalCommit);
    const approvalResumed = await invokeRun(prepared.target, "deep-request.json", manifestAnswer);
    assert.equal(approvalResumed.code, 0, `${approvalResumed.stdout}\n${approvalResumed.stderr}`);
    const approvalResumedReport = JSON.parse(approvalResumed.stdout);
    assert.equal(approvalResumedReport.status, "READY_FOR_HUMAN");
    assert.equal(approvalResumedReport.run.id, report.run.id);
    assert.ok(approvalResumedReport.stateHistory.some((/** @type {any} */ entry) => entry.state === "RESUMED"));

    await git(report.run.worktree, "reset", "--hard", approvalResumedReport.run.checkpointCommit);
    const resumed = await invokeRun(prepared.target, "deep-request.json", manifestAnswer);
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const resumedReport = JSON.parse(resumed.stdout);
    assert.equal(resumedReport.status, "READY_FOR_HUMAN");
    assert.equal(resumedReport.run.id, report.run.id);
    assert.ok(resumedReport.stateHistory.some((/** @type {any} */ entry) => entry.state === "RESUMED"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("changed destructive scope blocks the DEEP run before Advisor and Worker", async () => {
  const prepared = await prepareTarget("changed-scope");
  try {
    const result = await invokeRun(prepared.target, "changed-scope-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.stage, "MANIFEST_APPROVAL");
    assert.equal(report.run.workerCount, 0);
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "IMPLEMENTING"));
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "ADVISOR_GATE"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("tampered manifest-gate worktree is rejected instead of resumed", async () => {
  const prepared = await prepareTarget("tampered-gate");
  try {
    const waiting = await invokeRun(prepared.target, "deep-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const report = JSON.parse(waiting.stdout);
    const manifestPath = path.join(
      report.run.worktree,
      ...report.run.artifactPath.split("/"),
      "migration-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.actions[0].contentSha256 = "c".repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const resumed = await invokeRun(
      prepared.target,
      "deep-request.json",
      `migration-manifest=${report.humanGate.manifestHash}`,
    );
    assert.equal(resumed.code, 1, `${resumed.stdout}\n${resumed.stderr}`);
    assert.match(resumed.stderr, /manifest gate .* drift/iu);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("approval recovery rejects a WAITING gate not rooted directly at the integration base", async () => {
  const prepared = await prepareTarget("rewritten-gate");
  try {
    const waiting = await invokeRun(prepared.target, "deep-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const report = JSON.parse(waiting.stdout);
    const answer = `migration-manifest=${report.humanGate.manifestHash}`;
    const completed = await invokeRun(prepared.target, "deep-request.json", answer);
    assert.equal(completed.code, 0, `${completed.stdout}\n${completed.stderr}`);
    const completedReport = JSON.parse(completed.stdout);
    const approvalRow = (await git(
      prepared.target,
      "log",
      "--format=%H%x09%s",
      `${report.run.baseCommit}..${completedReport.run.head}`,
    )).split(/\r?\n/u).find((/** @type {string} */ row) => row.includes("record DEEP Migration Manifest approval"));
    assert.ok(approvalRow);
    const approvalCommit = approvalRow.split("\t", 1)[0];
    await git(report.run.worktree, "reset", "--hard", report.run.baseCommit);
    await writeFile(
      path.join(report.run.worktree, "src", "payment.mjs"),
      'export const paymentStatus = "forged-before-gate";\n',
      "utf8",
    );
    await git(report.run.worktree, "add", "src/payment.mjs");
    await git(report.run.worktree, "commit", "-m", "test: forge pre-gate state");
    await git(report.run.worktree, "cherry-pick", report.run.head);
    await git(report.run.worktree, "cherry-pick", approvalCommit);

    const resumed = await invokeRun(
      prepared.target,
      "deep-request.json",
      answer,
    );
    assert.equal(resumed.code, 1, `${resumed.stdout}\n${resumed.stderr}`);
    assert.match(resumed.stderr, /manifest approval .* durable gate/iu);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("missing mandatory DEEP evidence is BLOCKED and never a DEGRADED success", async () => {
  const prepared = await prepareTarget("missing-evidence");
  try {
    const result = await invokeRun(prepared.target, "missing-evidence-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.stage, "DOMAIN_MODELING");
    assert.notEqual(report.status, "DEGRADED");
    assert.equal(report.releaseStateReached, false);
    assert.equal(report.run.workerCount, 0);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/** @param {string} label */
async function prepareTarget(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-deep-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Engineering Loop Test");
  await git(target, "config", "user.email", "engineering-loop@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: add DEEP fixture");
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
