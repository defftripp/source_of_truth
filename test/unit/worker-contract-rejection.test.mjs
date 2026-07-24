import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);
const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const fixturePath = fileURLToPath(new URL("../fixtures/standard-run", import.meta.url));

const cases = [
  ["scope-worker", "worker-result-conflict"],
  ["commit-worker", "root-writer"],
  ["spawn-worker", "worker-subagent-spawn"],
  ["partial-worker", "worker-partial-result"],
  ["conflict-worker", "worker-ticket-code-conflict"],
  ["failing-worker", "ticket-message-test"],
  ["verification-scope-worker", "worker-result-conflict"],
  ["verification-lease-worker", "verification-freshness"],
  ["stale-index-worker", "verification-freshness"],
];

for (const [workerId, checkId] of cases) {
  test(`${workerId} is rejected before a Root checkpoint`, async () => {
    const prepared = await prepareTarget(workerId);
    try {
      const result = await invokeRun(prepared.target, workerId);
      assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
      assert.notEqual(result.stdout, "", result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.status, "BLOCKED");
      assert.equal(report.failure.stage, "IMPLEMENTING");
      assert.equal(report.failure.checkId, checkId);
      assert.deepEqual(report.run.checkpointCommits, []);
      assert.equal(await git(report.run.worktree, "rev-parse", "HEAD"), prepared.developBefore);

      const artifactRoot = path.join(
        report.run.worktree,
        ...report.run.artifactPath.split("/"),
      );
      const diagnostic = JSON.parse(
        await readFile(path.join(artifactRoot, "worker-rejection.json"), "utf8"),
      );
      assert.equal(diagnostic.kind, "WORKER_CONTRACT_REJECTION");
      assert.equal(diagnostic.status, "BLOCKED");
      assert.equal(diagnostic.reason.checkId, checkId);
      assert.ok(diagnostic.reason.evidenceIds.length > 0);
      assert.deepEqual(diagnostic.sourceTicketIds, ["TICKET-1"]);
      assert.deepEqual(diagnostic.acceptedIntegration, {
        head: prepared.developBefore,
        changed: false,
      });
      const serialized = JSON.stringify(diagnostic).toLowerCase();
      for (const denied of ["stdout", "stderr", "transcript", "secret", "token", "chat"]) {
        assert.equal(serialized.includes(denied), false, denied);
      }
      assert.equal(serialized.includes("secret-token"), false);
      if (workerId === "scope-worker") {
        const doctor = await invokeDoctor(prepared.target);
        assert.equal(doctor.code, 1, `${doctor.stdout}\n${doctor.stderr}`);
        assert.equal(
          doctor.stdout.includes("Run Worker rejection artifact does not match terminal evidence"),
          false,
          doctor.stdout,
        );
        assert.equal(
          doctor.stdout.includes("Run Artifact set contains an unsafe or unknown entry: worker-rejection.json"),
          false,
          doctor.stdout,
        );
        const rejectionPath = path.join(artifactRoot, "worker-rejection.json");
        const tamperedRejection = JSON.parse(await readFile(rejectionPath, "utf8"));
        tamperedRejection.acceptedIntegration.head = "0".repeat(40);
        await writeFile(
          rejectionPath,
          `${JSON.stringify(tamperedRejection, null, 2)}\n`,
          "utf8",
        );
        const tamperedDoctor = await invokeDoctor(prepared.target);
        assert.equal(tamperedDoctor.code, 1);
        assert.equal(
          tamperedDoctor.stdout.includes(
            "Run Worker rejection evidence does not match accepted durable HEAD",
          ),
          true,
          tamperedDoctor.stdout,
        );
      }
    } finally {
      await rm(prepared.sandbox, { recursive: true, force: true });
    }
  });
}

test("a corrected retry uses a fresh Context Packet and checkpoints the same ticket", async () => {
  const prepared = await prepareTarget("recovery");
  try {
    const blocked = await invokeRun(prepared.target, "partial-worker");
    assert.equal(blocked.code, 1, `${blocked.stdout}\n${blocked.stderr}`);
    assert.notEqual(blocked.stdout, "", blocked.stderr);
    const blockedReport = JSON.parse(blocked.stdout);
    const blockedPacket = await readFile(
      path.join(
        blockedReport.run.worktree,
        ...blockedReport.run.artifactPath.split("/"),
        "context-packet.json",
      ),
      "utf8",
    );

    const recovered = await invokeRun(prepared.target, "bounded-worker");
    assert.equal(recovered.code, 0, `${recovered.stdout}\n${recovered.stderr}`);
    const recoveredReport = JSON.parse(recovered.stdout);
    assert.equal(recoveredReport.status, "READY_FOR_HUMAN");
    assert.deepEqual(recoveredReport.executionOrder, ["TICKET-1"]);
    assert.equal(recoveredReport.run.checkpointCommits.length, 1);
    const recoveredPacket = await readFile(
      path.join(
        recoveredReport.run.worktree,
        ...recoveredReport.run.artifactPath.split("/"),
        "context-packet.json",
      ),
      "utf8",
    );
    assert.notEqual(recoveredPacket, blockedPacket);
    assert.equal(JSON.parse(recoveredPacket).ticketId, "TICKET-1");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/** @param {string} label */
async function prepareTarget(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `worker-contract-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  const baseRequest = JSON.parse(
    await readFile(path.join(target, "standard-request.json"), "utf8"),
  );
  for (const workerId of [...cases.map(([id]) => id), "bounded-worker"]) {
    const request = structuredClone(baseRequest);
    request.commands.worker = workerId;
    if (
      workerId === "verification-scope-worker" ||
      workerId === "verification-lease-worker"
    ) {
      const verificationId =
        workerId === "verification-scope-worker"
          ? "leaky-ticket-verification"
          : "mutating-ticket-verification";
      request.commands.planner =
        workerId === "verification-scope-worker"
          ? "verification-scope-planner"
          : "verification-lease-planner";
      request.commands.ticketVerification = verificationId;
      for (const criterion of request.standard.acceptanceCriteria) {
        criterion.verificationIds = criterion.verificationIds.map(
          (/** @type {string} */ id) => (id === "ticket-message-test" ? verificationId : id),
        );
      }
      for (const seam of request.standard.testingSeams) {
        seam.verificationIds = seam.verificationIds.map(
          (/** @type {string} */ id) => (id === "ticket-message-test" ? verificationId : id),
        );
      }
    }
    await writeFile(
      path.join(target, `worker-contract-${workerId}.json`),
      `${JSON.stringify(request, null, 2)}\n`,
      "utf8",
    );
  }
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Worker Contract Test");
  await git(target, "config", "user.email", "worker-contract@example.test");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "fixture: add STANDARD project");
  const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  await cp(
    path.join(target, "verification-registry.json"),
    path.join(target, ".engineering", "verification", "registry.json"),
  );
  await git(target, "add", ".engineering");
  await git(target, "commit", "-m", "fixture: prepare runtime");
  await git(target, "branch", "main");
  if (label === "stale-index-worker") {
    await writeFile(
      path.join(target, ".gitattributes"),
      "src/message.mjs filter=stale-index\n",
      "utf8",
    );
    await git(target, "add", ".gitattributes");
    await git(target, "commit", "-m", "fixture: add staged-content filter");
    await git(
      target,
      "config",
      "filter.stale-index.clean",
      "node scripts/stale-index-filter.mjs",
    );
  }
  return {
    sandbox,
    target,
    developBefore: await git(target, "rev-parse", "develop"),
  };
}

/** @param {string} target @param {string} workerId */
async function invokeRun(target, workerId) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      `worker-contract-${workerId}.json`,
    ],
    { cwd: target },
  );
}

/** @param {string} target */
function invokeDoctor(target) {
  return runProcess(process.execPath, [
    launcherPath,
    "--explicit",
    "--doctor",
    "--target",
    target,
  ]);
}

/** @param {string} cwd @param {...string} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
