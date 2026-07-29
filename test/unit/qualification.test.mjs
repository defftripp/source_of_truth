import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_SUITE_HASH,
  QUALIFICATION_SUITE,
  evaluateQualification,
  requiredFixtureArtifactScans,
  scanQualificationPayload,
  scanTrackedQualificationArtifacts,
  validateQualificationSuite,
} from "../../skills/engineering-loop/scripts/qualify.mjs";
import { runProcess } from "../support/process.mjs";

const qualifyPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/qualify.mjs", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const REQUIRED_FIXTURES = [
  "new-project",
  "unprepared-legacy",
  "healthy-prepared-project",
  "drifted-runtime",
  "dirty-worktree",
  "remote-divergence",
  "interrupted-resume",
];

const REQUIRED_SCENARIOS = [
  "simple-without-bureaucracy",
  "ambiguous-task",
  "missing-tests",
  "ticket-code-conflict",
  "failed-advisor",
  "partial-worker",
  "false-green-review",
  "scope-expansion",
  "overlapping-writers",
  "restart-after-interruption",
];

const REQUIRED_COMPONENTS = [
  "classifier",
  "state-transitions",
  "artifact-schemas",
  "manifest-hashing",
  "ownership",
  "git-safety",
  "sync-divergence",
  "capability-qualification",
];
const EXPECTED_CANONICAL_SUITE_HASH =
  "26de612dd877e2ceeb0411a8883bd95cc801eb2f7f708f2104df59bc097e5b86";

test("qualification suite pins every mandatory fixture, scenario, and component", () => {
  assert.equal(CANONICAL_SUITE_HASH, EXPECTED_CANONICAL_SUITE_HASH);
  const validation = validateQualificationSuite(QUALIFICATION_SUITE);
  assert.deepEqual(validation, { valid: true, errors: [] });
  assert.deepEqual(
    QUALIFICATION_SUITE.fixtures.map((entry) => entry.id).sort(),
    [...REQUIRED_FIXTURES].sort(),
  );
  assert.deepEqual(
    QUALIFICATION_SUITE.scenarios.map((entry) => entry.id).sort(),
    [...REQUIRED_SCENARIOS].sort(),
  );
  assert.deepEqual(
    QUALIFICATION_SUITE.components.map((entry) => entry.id).sort(),
    [...REQUIRED_COMPONENTS].sort(),
  );

  const incomplete = structuredClone(QUALIFICATION_SUITE);
  incomplete.scenarios = incomplete.scenarios.filter(
    (entry) => entry.id !== "false-green-review",
  );
  const rejected = validateQualificationSuite(incomplete);
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join("\n"), /false-green-review/u);

  const relabeled = structuredClone(QUALIFICATION_SUITE);
  const falseGreen = relabeled.scenarios.find(
    (entry) => entry.id === "false-green-review",
  );
  assert.ok(falseGreen);
  falseGreen.testFile = "test/unit/fast-run.test.mjs";
  falseGreen.testName =
    "a small cross-file task completes the FAST lifecycle without spec or tickets";
  const relabelRejected = validateQualificationSuite(relabeled);
  assert.equal(relabelRejected.valid, false);
  assert.match(relabelRejected.errors.join("\n"), /canonical manifest/iu);

  const allEvidence = [
    ...QUALIFICATION_SUITE.fixtures,
    ...QUALIFICATION_SUITE.scenarios,
    ...QUALIFICATION_SUITE.components,
  ];
  const evidenceResults = new Map();
  for (const entry of allEvidence) {
    evidenceResults.set(`${entry.testFile}\u0000${entry.testName}`, {
      artifactScan: {
        status: "PASS",
        scannedTargets: 1,
        scannedPaths: 1,
        scannedRevisions: 1,
        findings: [],
      },
    });
  }
  const requiredScans = requiredFixtureArtifactScans(
    allEvidence,
    evidenceResults,
  );
  assert.deepEqual(
    requiredScans.map((entry) => entry.evidenceId).sort(),
    [...REQUIRED_FIXTURES, ...REQUIRED_SCENARIOS].sort(),
  );
  assert.ok(requiredScans.some((entry) => entry.evidenceId === "remote-divergence"));
  assert.ok(!requiredScans.some((entry) => entry.evidenceId === "sync-divergence"));
});

test("one failed mandatory scenario makes qualification BLOCKED", () => {
  const passing = qualificationInput();
  const passed = evaluateQualification(passing);
  assert.equal(passed.status, "PASS");
  assert.equal(passed.terminal, true);
  assert.equal(passed.rawLogsPersisted, false);
  assert.equal(passed.chatTranscriptPersisted, false);
  assert.equal(passed.platform.required, "win32");
  assert.equal(passed.additionalPlatform.status, "V1_LIMITATION");

  passing.scenarioResults[0].status = "FAIL";
  const blocked = evaluateQualification(passing);
  assert.equal(blocked.status, "BLOCKED");
  assert.deepEqual(blocked.failedMandatoryIds, [
    passing.scenarioResults[0].id,
  ]);

  const failedFixture = qualificationInput();
  failedFixture.fixtureResults[0].status = "FAIL";
  const fixtureBlocked = evaluateQualification(failedFixture);
  assert.equal(fixtureBlocked.status, "BLOCKED");
  assert.deepEqual(fixtureBlocked.failedMandatoryIds, [
    `fixture:${failedFixture.fixtureResults[0].id}`,
  ]);
});

test("qualification report deny-list rejects secrets, raw logs, chat, and signed URLs", () => {
  assert.deepEqual(scanQualificationPayload({
    schemaVersion: 1,
    status: "PASS",
    evidenceIds: ["scenario:simple-without-bureaucracy"],
  }), { status: "PASS", findings: [] });

  for (const payload of [
    { token: "fixture-secret-value" },
    { accessToken: "ordinary-secret-value" },
    { apiKey: "ordinary-secret-value" },
    { rawLog: "unbounded child output" },
    { stdout: "raw command output" },
    { stderr: "raw command error" },
    { commandOutput: "raw command output" },
    { chatTranscript: "user and assistant transcript" },
    { evidenceUrl: "https://example.test/result?X-Amz-Signature=abc" },
    { evidenceIds: ["sk-proj-example-secret-material"] },
  ]) {
    const scan = scanQualificationPayload(payload);
    assert.equal(scan.status, "FAIL");
    assert.ok(scan.findings.length > 0);
  }
});

test("qualification deny-list scans the staged artifact blob and checkpoint history", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "v1-qualification-index-"));
  try {
    assert.deepEqual(
      await scanTrackedQualificationArtifacts(sandbox, {
        allowNoRepository: true,
      }),
      {
        status: "PASS",
        findings: [],
        scannedPaths: 0,
        scannedRevisions: 0,
        repositoryStatus: "NOT_APPLICABLE",
      },
    );
    await writeFile(path.join(sandbox, ".git"), "corrupt metadata\n", "utf8");
    const corrupt = await scanTrackedQualificationArtifacts(sandbox, {
      allowNoRepository: true,
    });
    assert.equal(corrupt.status, "FAIL");
    assert.match(
      corrupt.findings.join("\n"),
      /tracked artifact inventory is unavailable/iu,
    );
    await rm(path.join(sandbox, ".git"), { force: true });
    await runProcess("git", ["init", "--initial-branch=dev"], { cwd: sandbox });
    await runProcess("git", ["config", "user.name", "Qualification Test"], {
      cwd: sandbox,
    });
    await runProcess(
      "git",
      ["config", "user.email", "qualification@example.invalid"],
      { cwd: sandbox },
    );
    const artifactDirectory = path.join(sandbox, ".engineering", "runs", "run-1");
    const artifactPath = path.join(artifactDirectory, "result.json");
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(
      artifactPath,
      `${JSON.stringify({ apiKey: "ordinary-secret-value" })}\n`,
      "utf8",
    );
    await runProcess("git", ["add", ".engineering"], { cwd: sandbox });
    await writeFile(
      artifactPath,
      `${JSON.stringify({ status: "PASS" })}\n`,
      "utf8",
    );

    const staged = await scanTrackedQualificationArtifacts(sandbox);
    assert.equal(staged.status, "FAIL");
    assert.match(staged.findings.join("\n"), /apiKey.*forbidden/iu);

    await runProcess("git", ["commit", "-m", "test: unsafe checkpoint"], {
      cwd: sandbox,
    });
    const historical = await scanTrackedQualificationArtifacts(sandbox);
    assert.equal(historical.status, "FAIL");
    assert.match(
      historical.findings.join("\n"),
      /checkpoint history contains forbidden artifact material/iu,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("qualification CLI rejects output traversal and linked ancestors before execution", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "v1-qualification-path-"));
  const target = path.join(sandbox, "target");
  const external = path.join(sandbox, "external");
  try {
    await mkdir(target);
    await mkdir(external);
    const traversal = await runProcess(process.execPath, [
      qualifyPath,
      "--target",
      target,
      "--output",
      "../escape.json",
    ]);
    assert.equal(traversal.code, 1);
    assert.match(traversal.stderr, /directly under/iu);

    await symlink(external, path.join(target, ".engineering"), "junction");
    const linked = await runProcess(process.execPath, [
      qualifyPath,
      "--target",
      target,
      "--output",
      ".engineering/qualification/report.json",
    ]);
    assert.equal(linked.code, 1);
    assert.match(linked.stderr, /regular project paths/iu);
    await assert.rejects(
      readFile(path.join(external, "qualification", "report.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("qualification CLI exits non-zero when an injected mandatory child fails", async () => {
  const output =
    `.engineering/qualification/injected-${randomUUID().toLowerCase()}.json`;
  const absoluteOutput = path.join(
    repositoryRoot,
    ...output.split("/"),
  );
  try {
    const result = await runProcess(process.execPath, [
      qualifyPath,
      "--target",
      repositoryRoot,
      "--output",
      output,
      "--inject-failure",
      "false-green-review",
    ]);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(await readFile(absoluteOutput, "utf8"));
    assert.equal(report.status, "BLOCKED");
    assert.ok(report.failedMandatoryIds.includes("false-green-review"));
    assert.ok(
      report.scenarioResults.some(
        (/** @type {any} */ entry) =>
          entry.id === "false-green-review" &&
          entry.status === "FAIL" &&
          entry.evidenceIds.includes("self-test-child-exit:7"),
      ),
    );
  } finally {
    await rm(absoluteOutput, { force: true });
  }
});

function qualificationInput() {
  return {
    suite: QUALIFICATION_SUITE,
    fixtureResults: QUALIFICATION_SUITE.fixtures.map((entry) => ({
      id: entry.id,
      status: "PASS",
      evidenceIds: [`test:${entry.testName}`],
    })),
    scenarioResults: QUALIFICATION_SUITE.scenarios.map((entry) => ({
      id: entry.id,
      status: "PASS",
      evidenceIds: [`test:${entry.testName}`],
    })),
    componentResults: QUALIFICATION_SUITE.components.map((entry) => ({
      id: entry.id,
      status: "PASS",
      evidenceIds: [`test-file:${entry.testFile}`],
    })),
    platform: {
      current: "win32",
      required: "win32",
      status: "PASS",
      evidenceIds: ["platform-smoke"],
    },
    denyList: { status: "PASS", findings: [] },
  };
}
