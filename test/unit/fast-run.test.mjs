import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const fixturePath = fileURLToPath(new URL("../fixtures/fast-run", import.meta.url));
const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);

test("black-box FAST run reaches READY_FOR_HUMAN with isolated evidence", async () => {
  const prepared = await prepareTarget("success");
  try {
    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.terminal, true);
    assert.equal(report.accepted, false);
    assert.equal(report.taskProfile.selectedMode, "FAST");
    assert.equal(report.taskProfile.hardFloor, "FAST");
    assert.equal(report.taskProfile.routineConfirmationRequired, false);
    assert.deepEqual(report.taskProfile.taskEvidence, {
      scope: "LOCAL",
      risk: "LOW",
      ambiguity: "NONE",
      reversibility: "EASY",
    });
    assert.deepEqual(report.taskProfile.writeLease, ["src/message.mjs"]);
    assert.match(report.taskProfile.rationale, /prepared.*clean.*low-risk.*local/iu);
    assert.deepEqual(report.taskProfile.repositoryEvidence, {
      preparedProject: true,
      gitRepository: true,
      cleanWorktree: true,
      integrationBranch: "develop",
      stableBranch: "main",
      registeredCommands: true,
    });

    assert.match(report.run.branch, /^run\/fast\//u);
    assert.equal(report.run.rootWriter, true);
    assert.equal(report.run.workerCount, 0);
    assert.ok(path.isAbsolute(report.run.worktree));
    assert.notEqual(report.run.worktree, prepared.target);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
    assert.equal(
      (await readFile(path.join(prepared.target, "src", "message.mjs"), "utf8")).replaceAll("\r\n", "\n"),
      'export const message = "hello";\n',
    );
    assert.equal(await readFile(path.join(report.run.worktree, "src", "message.mjs"), "utf8"), 'export const message = "hello from FAST";\n');

    assert.deepEqual(
      report.stateHistory.map((/** @type {any} */ entry) => entry.state),
      [
        "CLASSIFIED",
        "ISOLATED",
        "IMPLEMENTING",
        "FOCUSED_VERIFICATION",
        "QUALITY_REVIEW",
        "FULL_VERIFICATION",
        "READY_FOR_HUMAN",
      ],
    );
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => [
      "INTERVIEW",
      "SPEC",
      "TICKET_PLANNING",
      "CAPABILITY_DISCOVERY",
      "CAPABILITY_INSTALL",
      "ACCEPTED",
    ].includes(entry.state)));
    assert.equal(report.qualityReview.status, "PASS");
    assert.deepEqual(
      report.verification.checks.map((/** @type {any} */ { role, status }) => ({ role, status })),
      [
        { role: "focused-test", status: "PASS" },
        { role: "test", status: "PASS" },
        { role: "typecheck", status: "PASS" },
        { role: "build", status: "PASS" },
        { role: "observed-behavior", status: "PASS" },
      ],
    );

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const artifactTree = await snapshotTree(artifactRoot);
    assert.deepEqual(
      artifactTree.map((entry) => entry.path),
      ["quality-review.json", "result.json", "state.json", "task-profile.json", "verification.json"],
    );
    const artifactSource = (
      await Promise.all(artifactTree.map((entry) => readFile(path.join(artifactRoot, entry.path), "utf8")))
    ).join("\n");
    assert.doesNotMatch(
      artifactSource,
      /sourceCopies|rawLogs|secrets|chatTranscripts|hello from FAST|capability/iu,
    );
    assert.ok(!artifactTree.some((entry) => /interview|spec|ticket/iu.test(entry.path)));
    const durableResult = JSON.parse(await readFile(path.join(artifactRoot, "result.json"), "utf8"));
    assert.equal("stat" in durableResult.aggregateDiff, false);

    assert.ok(report.aggregateDiff.files.includes("src/message.mjs"));
    assert.ok(report.aggregateDiff.files.includes(`${report.run.artifactPath}/result.json`));
    assert.match(report.aggregateDiff.stat, /src\/message\.mjs/u);
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), report.run.head);
    const commits = await git(prepared.target, "log", "--format=%s", `${prepared.developBefore}..${report.run.head}`);
    assert.match(commits, /record FAST run readiness/u);
    assert.match(commits, /complete FAST task/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a small cross-file task completes the FAST lifecycle without spec or tickets", async () => {
  const prepared = await prepareTarget("cross-file");
  try {
    const result = await invokeRun(prepared.target, "cross-file-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));

    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.equal(report.taskProfile.selectedMode, "FAST");
    assert.equal(report.taskProfile.hardFloor, "FAST");
    assert.equal(report.taskProfile.routineConfirmationRequired, false);
    assert.deepEqual(report.taskProfile.writeLease, ["src/message.mjs", "src/suffix.mjs"]);
    const request = JSON.parse(
      await readFile(path.join(prepared.target, "cross-file-request.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(request.task), [
      "summary",
      "scope",
      "risk",
      "ambiguity",
      "reversibility",
    ]);
    assert.ok(report.aggregateDiff.files.includes("src/message.mjs"));
    assert.ok(report.aggregateDiff.files.includes("src/suffix.mjs"));
    assert.ok(
      !report.stateHistory.some((/** @type {any} */ entry) =>
        ["INTERVIEW", "SPEC", "TICKET_PLANNING"].includes(entry.state),
      ),
    );
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    assert.ok(!(await readdir(artifactRoot)).some((name) => /spec|ticket/iu.test(name)));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("invocation reports a STANDARD selection without executing the FAST lifecycle", async () => {
  const prepared = await prepareTarget("standard-selection", "verification-registry.json", async (target) => {
    const requestPath = path.join(target, "cross-file-request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    request.task.scope = "MULTI_PART";
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  });
  try {
    const result = await invokeRun(prepared.target, "cross-file-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));

    assert.equal(report.status, "MODE_SELECTED");
    assert.equal(report.terminal, false);
    assert.equal(report.taskProfile.selectedMode, "STANDARD");
    assert.equal(report.taskProfile.hardFloor, "STANDARD");
    assert.equal(report.taskProfile.routineConfirmationRequired, false);
    assert.equal("run" in report, false);
    assert.equal(await git(prepared.target, "branch", "--list", "run/*"), "");
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("Root escalation is visible in invocation output only when evidence is recorded", async () => {
  const evidence = "The public contract rollout needs coordinated review.";
  const prepared = await prepareTarget("root-escalation", "verification-registry.json", async (target) => {
    const requestPath = path.join(target, "fast-request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    request.rootEscalation = { mode: "STANDARD", evidence: [evidence] };
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  });
  try {
    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = /** @type {any} */ (JSON.parse(result.stdout));

    assert.equal(report.status, "MODE_SELECTED");
    assert.equal(report.taskProfile.hardFloor, "FAST");
    assert.equal(report.taskProfile.selectedMode, "STANDARD");
    assert.deepEqual(report.taskProfile.rootEscalation, {
      mode: "STANDARD",
      evidence: [evidence],
    });
    assert.match(report.taskProfile.rationale, /STANDARD.*coordinated review/iu);
    assert.equal(await git(prepared.target, "branch", "--list", "run/*"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("invocation rejects a Root mode below the deterministic hard floor", async () => {
  const prepared = await prepareTarget("silent-downgrade", "verification-registry.json", async (target) => {
    const requestPath = path.join(target, "fast-request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    request.task.risk = "HIGH";
    request.rootEscalation = {
      mode: "STANDARD",
      evidence: ["Prefer a shorter workflow."],
    };
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  });
  try {
    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /below the DEEP hard floor/iu);
    assert.equal(await git(prepared.target, "branch", "--list", "run/*"), "");
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a passing Quality Review cannot override a failing instrumental check", async () => {
  const prepared = await prepareTarget("false-green");
  try {
    const result = await invokeRun(prepared.target, "false-green-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.terminal, true);
    assert.equal(report.accepted, false);
    assert.equal(report.releaseStateReached, false);
    assert.equal(report.qualityReview.status, "PASS");
    assert.deepEqual(report.failure, {
      stage: "FULL_VERIFICATION",
      checkId: "false-green",
      role: "test",
      exitCode: 1,
    });
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => ["READY_FOR_HUMAN", "ACCEPTED"].includes(entry.state)));
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");

    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const resultArtifact = JSON.parse(await readFile(path.join(artifactRoot, "result.json"), "utf8"));
    assert.equal(resultArtifact.status, "BLOCKED");
    assert.equal(resultArtifact.releaseStateReached, false);
    assert.equal("stdout" in resultArtifact, false);
    assert.equal("stderr" in resultArtifact, false);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST rejects a request that omits a repository-required relevant check", async () => {
  const prepared = await prepareTarget("incomplete", "incomplete-verification-registry.json");
  try {
    const result = await invokeRun(prepared.target, "incomplete-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /required FAST check false-green is missing/iu);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "branch", "--list", "run/fast/*"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks output beyond the exact Write Lease before committing", async () => {
  const prepared = await prepareTarget("unsafe-output");
  try {
    const result = await invokeRun(prepared.target, "unsafe-output-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.failure, {
      stage: "ARTIFACT_VALIDATION",
      checkId: "write-lease",
      role: "scope",
      exitCode: 1,
    });
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks unsafe Quality Review payloads instead of persisting them", async () => {
  const prepared = await prepareTarget("unsafe-review");
  try {
    const result = await invokeRun(prepared.target, "unsafe-quality-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.failure, {
      stage: "QUALITY_REVIEW",
      checkId: "unsafe-quality-review",
      role: "quality-review",
      exitCode: 1,
    });
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const artifactSource = (
      await Promise.all((await snapshotTree(artifactRoot)).map((entry) => readFile(path.join(artifactRoot, entry.path), "utf8")))
    ).join("\n");
    assert.doesNotMatch(artifactSource, /unsafe-review-payload/iu);
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST rejects duplicate registry IDs before resolving required checks", async () => {
  const prepared = await prepareTarget("duplicate-registry", "duplicate-registry.json");
  try {
    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /registry command IDs must be unique: typecheck/iu);
    assert.equal(await git(prepared.target, "branch", "--list", "run/fast/*"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks a registered command that creates its own out-of-lease commit", async () => {
  const prepared = await prepareTarget("commit-bypass");
  try {
    const result = await invokeRun(prepared.target, "commit-bypass-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.failure, {
      stage: "ARTIFACT_VALIDATION",
      checkId: "root-writer",
      role: "scope",
      exitCode: 1,
    });
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "READY_FOR_HUMAN"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks forged Run Artifacts before a Root checkpoint commit", async () => {
  const prepared = await prepareTarget("artifact-forgery");
  try {
    const result = await invokeRun(prepared.target, "artifact-forgery-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.failure, {
      stage: "ARTIFACT_VALIDATION",
      checkId: "run-artifacts",
      role: "schema",
      exitCode: 1,
    });
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    const taskProfile = JSON.parse(await readFile(path.join(artifactRoot, "task-profile.json"), "utf8"));
    assert.equal(taskProfile.selectedMode, "FAST");
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST removes a forbidden extra Run Artifact and returns structured BLOCKED", async () => {
  const prepared = await prepareTarget("extra-artifact");
  try {
    const result = await invokeRun(prepared.target, "extra-artifact-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "run-artifacts");
    const artifactRoot = path.join(report.run.worktree, ...report.run.artifactPath.split("/"));
    assert.deepEqual(
      (await snapshotTree(artifactRoot)).map((entry) => entry.path),
      ["quality-review.json", "result.json", "state.json", "task-profile.json", "verification.json"],
    );
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST rejects non-canonical Write Lease paths before creating a Run Branch", async () => {
  const prepared = await prepareTarget("noncanonical-lease");
  try {
    const result = await invokeRun(prepared.target, "noncanonical-lease-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /canonical project-relative Application Core paths/iu);
    assert.equal(await git(prepared.target, "branch", "--list", "run/fast/*"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST prevents a registered command from committing and resetting to hide history", async () => {
  const prepared = await prepareTarget("commit-reset");
  try {
    const result = await invokeRun(prepared.target, "commit-reset-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "root-writer");
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
    assert.doesNotMatch(await git(prepared.target, "reflog", "show", "--format=%gs", report.run.branch), /hidden command commit/iu);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST prevents protected ref mutation and preserves main", async () => {
  const prepared = await prepareTarget("protected-ref");
  try {
    const result = await invokeRun(prepared.target, "protected-ref-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "repository-isolation");
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "rev-parse", "develop"), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST Git checks see the real Run worktree through the shadow index", async () => {
  const prepared = await prepareTarget("shadow-status");
  try {
    const result = await invokeRun(prepared.target, "status-check-request.json");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).status, "READY_FOR_HUMAN");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST restores a deleted protected ref and dirty Integration worktree before blocking", async () => {
  const prepared = await prepareTarget("deleted-protected-ref");
  try {
    const result = await invokeRun(prepared.target, "deleted-protected-ref-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "repository-isolation");
    assert.equal(await git(prepared.target, "rev-parse", "main"), prepared.mainBefore);
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
    assert.equal(
      (await readFile(path.join(prepared.target, "src", "message.mjs"), "utf8")).replaceAll("\r\n", "\n"),
      'export const message = "hello";\n',
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST restores and blocks direct mutation of the Integration worktree", async () => {
  const prepared = await prepareTarget("dirty-integration");
  try {
    const result = await invokeRun(prepared.target, "dirty-integration-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "repository-isolation");
    assert.equal(await git(prepared.target, "status", "--porcelain"), "");
    assert.equal(await git(prepared.target, "branch", "--show-current"), "develop");
    assert.equal(
      (await readFile(path.join(prepared.target, "src", "message.mjs"), "utf8")).replaceAll("\r\n", "\n"),
      'export const message = "hello";\n',
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks when a clean filter forges staged Run Artifacts", async () => {
  const prepared = await prepareTarget("clean-filter");
  try {
    await writeFile(path.join(prepared.target, ".gitattributes"), ".engineering/runs/**/task-profile.json filter=forge\n", "utf8");
    await git(prepared.target, "add", ".gitattributes");
    await git(prepared.target, "commit", "-m", "test: configure artifact clean filter");
    await git(prepared.target, "branch", "-f", "main", "develop");
    await git(prepared.target, "config", "filter.forge.clean", "node scripts/filter-forge.mjs");
    await git(prepared.target, "config", "filter.forge.smudge", "node scripts/filter-pass.mjs");
    await git(prepared.target, "config", "filter.forge.required", "true");
    prepared.developBefore = await git(prepared.target, "rev-parse", "develop");
    prepared.mainBefore = await git(prepared.target, "rev-parse", "main");

    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "index-artifacts");
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST does not enter READY_FOR_HUMAN when terminal evidence staging fails", async () => {
  const prepared = await prepareTarget("terminal-clean-filter");
  try {
    await writeFile(path.join(prepared.target, ".gitattributes"), ".engineering/runs/**/result.json filter=forge\n", "utf8");
    await git(prepared.target, "add", ".gitattributes");
    await git(prepared.target, "commit", "-m", "test: configure terminal evidence clean filter");
    await git(prepared.target, "branch", "-f", "main", "develop");
    await git(prepared.target, "config", "filter.forge.clean", "node scripts/filter-forge.mjs");
    await git(prepared.target, "config", "filter.forge.required", "true");
    prepared.developBefore = await git(prepared.target, "rev-parse", "develop");
    prepared.mainBefore = await git(prepared.target, "rev-parse", "main");

    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "index-artifacts");
    assert.ok(!report.stateHistory.some((/** @type {any} */ entry) => entry.state === "READY_FOR_HUMAN"));
    const state = JSON.parse(
      await readFile(path.join(report.run.worktree, ...report.run.artifactPath.split("/"), "state.json"), "utf8"),
    );
    assert.ok(!state.history.some((/** @type {any} */ entry) => entry.state === "READY_FOR_HUMAN"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST blocks when a clean filter changes tested leased source while staging", async () => {
  const prepared = await prepareTarget("leased-clean-filter");
  try {
    await writeFile(path.join(prepared.target, ".gitattributes"), "src/message.mjs filter=forge\n", "utf8");
    await git(prepared.target, "add", ".gitattributes");
    await git(prepared.target, "commit", "-m", "test: configure leased source clean filter");
    await git(prepared.target, "branch", "-f", "main", "develop");
    await git(prepared.target, "config", "filter.forge.clean", "node scripts/filter-forge.mjs");
    await git(prepared.target, "config", "filter.forge.smudge", "node scripts/filter-pass.mjs");
    await git(prepared.target, "config", "filter.forge.required", "true");
    prepared.developBefore = await git(prepared.target, "rev-parse", "develop");
    prepared.mainBefore = await git(prepared.target, "rev-parse", "main");

    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = /** @type {any} */ (JSON.parse(result.stdout));
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.failure.checkId, "index-artifacts");
    assert.equal(await git(prepared.target, "rev-parse", report.run.branch), prepared.developBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST rejects unsafe registry IDs before they can reach durable evidence", async () => {
  const prepared = await prepareTarget("unsafe-registry-id");
  try {
    const registryPath = path.join(prepared.target, ".engineering", "verification", "registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.checks.push({ id: "raw\noutput", role: "test", requiredForFast: false, command: ["node", "--version"] });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await git(prepared.target, "add", registryPath);
    await git(prepared.target, "commit", "-m", "test: add unsafe registry id");

    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /registry entry .* is invalid/iu);
    assert.equal(await git(prepared.target, "branch", "--list", "run/fast/*"), "");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("FAST cleans command guard files when command spawning throws", async () => {
  const prepared = await prepareTarget("guard-cleanup");
  try {
    const registryPath = path.join(prepared.target, ".engineering", "verification", "registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    registry.checks.find((/** @type {any} */ entry) => entry.id === "apply-obvious-local-change").command = [
      "missing-engineering-loop-command",
    ];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await git(prepared.target, "add", registryPath);
    await git(prepared.target, "commit", "-m", "test: configure missing command");

    const result = await invokeRun(prepared.target, "fast-request.json");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    const guardEntries = await readdir(`${prepared.target}.engineering-worktrees`);
    assert.ok(!guardEntries.some((entry) => entry.startsWith(".command-guard-")));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/**
 * @param {string} label
 * @param {string} [registryName]
 * @param {(target: string) => Promise<void>} [prepareFixture]
 */
async function prepareTarget(label, registryName = "verification-registry.json", prepareFixture) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-fast-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  await prepareFixture?.(target);
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "user.name", "Engineering Loop Test");
  await git(target, "config", "user.email", "engineering-loop@example.invalid");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "test: add FAST fixture");

  const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  const registry = await readFile(path.join(target, registryName), "utf8");
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
async function invokeRun(target, requestPath) {
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
