import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const fixturePath = fileURLToPath(
  new URL("../fixtures/standard-run", import.meta.url),
);
const onboardingPath = fileURLToPath(
  new URL(
    "../../skills/engineering-loop/scripts/onboard.mjs",
    import.meta.url,
  ),
);

test("two unresolved Advisor REVISE rounds create a terminal Human Gate before Worker", async () => {
  const prepared = await prepareTarget("revision-exhausted", async (target) => {
    await writeFile(
      path.join(target, "scripts", "planner.mjs"),
      `process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  tickets: [{
    id: "TICKET-1",
    objective: "Plan without acceptance coverage.",
    acceptanceCriteria: [],
    verificationIds: ["ticket-message-test", "observed-behavior"],
    dependencies: [],
    writeLease: ["src/message.mjs"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"]
  }]
}));\n`,
    );
    await writeFile(
      path.join(target, "scripts", "advisor.mjs"),
      `const findings = JSON.parse(process.env.ENGINEERING_ADVISOR_FINDINGS ?? "[]");
const ticketIds = JSON.parse(process.env.ENGINEERING_ADVISOR_TICKETS ?? "[]");
const evidence = JSON.parse(process.env.ENGINEERING_ADVISOR_EVIDENCE ?? "[]");
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  status: findings.length > 0 ? "REVISE" : "APPROVED",
  ticketIds,
  evidence,
  concerns: findings
}));\n`,
    );
  });
  try {
    const result = await invokeRun(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.terminal, true);
    assert.equal(report.run.workerCount, 0);
    assert.deepEqual(
      report.stateHistory.map((/** @type {any} */ entry) => entry.state),
      [
        "CLASSIFIED",
        "ISOLATED",
        "REPOSITORY_RESEARCH",
        "SPEC_LITE",
        "TICKET_PLANNING",
        "ADVISOR_GATE",
        "TICKET_PLANNING",
        "ADVISOR_GATE",
        "HUMAN_GATE",
        "BLOCKED",
      ],
    );
    assert.deepEqual(report.failure, {
      stage: "ADVISOR_GATE",
      checkId: "advisor-revision-exhausted",
      role: "schema",
      exitCode: 1,
    });
    const artifactRoot = path.join(
      report.run.worktree,
      ...report.run.artifactPath.split("/"),
    );
    const rounds = JSON.parse(
      await readFile(path.join(artifactRoot, "advisor-rounds.json"), "utf8"),
    );
    assert.equal(rounds.rounds.length, 2);
    assert.deepEqual(
      rounds.rounds.map((/** @type {any} */ round) => round.status),
      ["REVISE", "REVISE"],
    );
    assert.ok(
      rounds.rounds.every((/** @type {any} */ round) =>
        round.concerns.some(
          (/** @type {any} */ finding) =>
            finding.code === "UNMAPPED_ACCEPTANCE",
        ),
      ),
    );
    const gate = JSON.parse(
      await readFile(path.join(artifactRoot, "human-gate.json"), "utf8"),
    );
    assert.equal(gate.kind, "ADVISOR_REVISION_EXHAUSTED");
    assert.equal(gate.status, "WAITING");
    assert.equal(gate.revisionRounds, 2);
    assert.ok(gate.unresolvedFindings.length > 0);
    assert.equal(
      await git(
        prepared.target,
        "branch",
        "--list",
        "run/standard/*",
      ).then(Boolean),
      true,
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

for (const scenario of [
  {
    label: "missing-verification",
    code: "MISSING_VERIFICATION",
    from: 'verificationIds: ["ticket-message-test", "observed-behavior"],',
    to: 'verificationIds: ["ticket-message-test"],',
  },
  {
    label: "unsafe-dependency",
    code: "UNSAFE_DEPENDENCY",
    from: "dependencies: [],",
    to: 'dependencies: ["MISSING-TICKET"],',
  },
  {
    label: "unsupported-assumption",
    code: "UNSUPPORTED_ASSUMPTION",
    topLevel: 'assumptions: ["The missing dependency is probably safe."],',
  },
  {
    label: "scope-leak",
    code: "SCOPE_LEAK",
    from: 'writeLease: ["src/message.mjs"],',
    to: 'writeLease: ["README.md"],',
  },
]) {
  test(`Advisor REVISE reports ${scenario.code} before Worker`, async () => {
    const prepared = await prepareTarget(scenario.label, async (target) => {
      const ticket =
        scenario.from && scenario.to
          ? validTicketSource().replace(scenario.from, scenario.to)
          : validTicketSource();
      await writeFile(
        path.join(target, "scripts", "planner.mjs"),
        `process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  ${scenario.topLevel ?? ""}
  tickets: [{${ticket}}]
}));\n`,
      );
      await writeFile(
        path.join(target, "scripts", "advisor.mjs"),
        echoingAdvisorSource(),
      );
    });
    try {
      const result = await invokeRun(prepared.target);
      assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
      const report = JSON.parse(result.stdout);
      assert.equal(report.status, "BLOCKED");
      assert.equal(report.run.workerCount, 0);
      const artifactRoot = path.join(
        report.run.worktree,
        ...report.run.artifactPath.split("/"),
      );
      const rounds = JSON.parse(
        await readFile(path.join(artifactRoot, "advisor-rounds.json"), "utf8"),
      );
      assert.equal(rounds.rounds.length, 2);
      assert.ok(
        rounds.rounds.every((/** @type {any} */ round) =>
          round.concerns.some(
            (/** @type {any} */ finding) => finding.code === scenario.code,
          ),
        ),
      );
      assert.ok(
        !report.stateHistory.some(
          (/** @type {any} */ entry) => entry.state === "IMPLEMENTING",
        ),
      );
    } finally {
      await rm(prepared.sandbox, { recursive: true, force: true });
    }
  });
}

test("generic Advisor feedback is rejected by the strict REVISE schema", async () => {
  const prepared = await prepareTarget("generic-feedback", async (target) => {
    await writeFile(
      path.join(target, "scripts", "planner.mjs"),
      `process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  tickets: [{${validTicketSource().replace(
    'acceptanceCriteria: ["AC-1"],',
    "acceptanceCriteria: [],",
  )}}]
}));\n`,
    );
    await writeFile(
      path.join(target, "scripts", "advisor.mjs"),
      `const ticketIds = JSON.parse(process.env.ENGINEERING_ADVISOR_TICKETS ?? "[]");
const evidence = JSON.parse(process.env.ENGINEERING_ADVISOR_EVIDENCE ?? "[]");
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  status: "REVISE",
  ticketIds,
  evidence,
  concerns: ["Please improve the plan."]
}));\n`,
    );
  });
  try {
    const result = await invokeRun(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.failure, {
      stage: "ADVISOR_GATE",
      checkId: "advisor-approval",
      role: "schema",
      exitCode: 1,
    });
    assert.equal(report.run.workerCount, 0);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a corrected second-round plan may be approved and executed", async () => {
  const prepared = await prepareTarget("second-round-approved", async (target) => {
    await writeFile(
      path.join(target, "scripts", "planner.mjs"),
      `const round = Number(process.env.ENGINEERING_PLANNER_REVISION_ROUND ?? "1");
const ticket = {${validTicketSource()}};
if (round === 1) ticket.acceptanceCriteria = [];
process.stdout.write(JSON.stringify({ schemaVersion: 1, tickets: [ticket] }));\n`,
    );
    await writeFile(
      path.join(target, "scripts", "advisor.mjs"),
      echoingAdvisorSource(),
    );
  });
  try {
    const result = await invokeRun(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.run.workerCount, 1);
    const artifactRoot = path.join(
      report.run.worktree,
      ...report.run.artifactPath.split("/"),
    );
    const rounds = JSON.parse(
      await readFile(path.join(artifactRoot, "advisor-rounds.json"), "utf8"),
    );
    assert.deepEqual(
      rounds.rounds.map((/** @type {any} */ round) => round.status),
      ["REVISE", "APPROVED"],
    );
    assert.ok(
      report.stateHistory.some(
        (/** @type {any} */ entry) => entry.state === "IMPLEMENTING",
      ),
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

function validTicketSource() {
  return `
    id: "TICKET-1",
    objective: "Deliver the public STANDARD message behavior end to end.",
    acceptanceCriteria: ["AC-1"],
    verificationIds: ["ticket-message-test", "observed-behavior"],
    dependencies: [],
    writeLease: ["src/message.mjs"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"]
  `;
}

function echoingAdvisorSource() {
  return `const findings = JSON.parse(process.env.ENGINEERING_ADVISOR_FINDINGS ?? "[]");
const ticketIds = JSON.parse(process.env.ENGINEERING_ADVISOR_TICKETS ?? "[]");
const evidence = JSON.parse(process.env.ENGINEERING_ADVISOR_EVIDENCE ?? "[]");
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  status: findings.length > 0 ? "REVISE" : "APPROVED",
  ticketIds,
  evidence,
  concerns: findings
}));\n`;
}

/** @param {string} label @param {(target: string) => Promise<void>} mutate */
async function prepareTarget(label, mutate) {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), `engineering-loop-advisor-${label}-`),
  );
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await mutate(target);
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Engineering Loop Test");
  await git(target, "config", "user.email", "engineering-loop@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: add Advisor fixture");
  const onboarding = await runProcess(process.execPath, [
    onboardingPath,
    "--target",
    target,
  ]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  await writeFile(
    path.join(target, ".engineering", "verification", "registry.json"),
    await readFile(path.join(target, "verification-registry.json"), "utf8"),
  );
  await git(target, "add", ".engineering");
  await git(target, "commit", "-m", "chore: prepare project runtime");
  await git(target, "branch", "main");
  return { sandbox, target };
}

/** @param {string} target */
function invokeRun(target) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      "standard-request.json",
    ],
    { cwd: target },
  );
}

/** @param {string} cwd @param {...string} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
