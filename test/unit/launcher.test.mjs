import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const negativeFixture = fileURLToPath(
  new URL("../fixtures/negative-invocation/case.json", import.meta.url),
);

test("negative invocation fixture stops before readiness and leaves target unchanged", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-negative-"));
  const target = path.join(sandbox, "target project");
  await mkdir(target);
  await writeFile(path.join(target, "sentinel.txt"), "unchanged\n", "utf8");
  const before = await snapshotTree(target);

  try {
    /** @type {{ request: string, explicitInvocation: boolean, expected: { exitCode: number, status: string, probeExecuted: boolean } }} */
    const fixture = JSON.parse(await readFile(negativeFixture, "utf8"));
    assert.doesNotMatch(fixture.request, /\$engineering-loop/);
    const args = [
      launcherPath,
      ...(fixture.explicitInvocation ? ["--explicit"] : []),
      "--target",
      target,
    ];
    const result = await runProcess(process.execPath, args);
    assert.equal(result.code, fixture.expected.exitCode, result.stderr);
    assert.equal(result.stderr, "");
    /** @type {{ status: string, probeExecuted: boolean, mutated: boolean }} */
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, fixture.expected.status);
    assert.equal(report.probeExecuted, fixture.expected.probeExecuted);
    assert.equal(report.mutated, false);
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("valid pinned runtime evidence returns READY without mutation", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-ready-"));
  const target = path.join(sandbox, "prepared target");
  const runtimeDirectory = path.join(target, ".engineering", "runtime");
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(
    path.join(runtimeDirectory, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, runtimeVersion: "1.0.0" }, null, 2)}\n`,
    "utf8",
  );
  const before = await snapshotTree(target);

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY");
    assert.equal(report.mutated, false);
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("explicit invocation returns deterministic ONBOARDING_REQUIRED diagnostics", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-empty-"));
  const target = path.join(sandbox, "empty target");
  await mkdir(target);
  const before = await snapshotTree(target);

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    /** @type {{ schemaVersion: number, status: string, terminal: boolean, probeExecuted: boolean, mutated: boolean, target: { kind: string }, checks: { id: string, status: string }[], summary: string, nextAction: string }} */
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.status, "ONBOARDING_REQUIRED");
    assert.equal(report.terminal, true);
    assert.equal(report.probeExecuted, true);
    assert.equal(report.mutated, false);
    assert.equal(report.target.kind, "directory");
    assert.deepEqual(
      report.checks.map(({ id, status }) => ({ id, status })),
      [
        { id: "target-directory", status: "PASS" },
        { id: "engineering-control-plane", status: "MISSING" },
        { id: "project-runtime-manifest", status: "MISSING" },
      ],
    );
    assert.match(report.summary, /runtime evidence/i);
    assert.match(report.nextAction, /explicit onboarding/i);
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
