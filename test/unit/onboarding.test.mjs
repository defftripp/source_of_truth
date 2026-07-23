import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateAdoptionMatrix,
  validateRuntimeManifest,
  verifyFileChecksums,
} from "../../skills/engineering-loop/runtime/contracts.mjs";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);
const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const fixturePath = fileURLToPath(new URL("../fixtures/new-project", import.meta.url));

test("onboarding preserves the Application Core and creates a complete pinned shell", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-onboard-"));
  const target = path.join(sandbox, "new target");
  await cp(fixturePath, target, { recursive: true });
  const applicationBefore = await applicationSnapshot(target);

  try {
    const result = await runProcess(process.execPath, [onboardingPath, "--target", target]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "PREPARED_PROJECT");
    assert.equal(report.runtimeVersion, "1.0.0");
    assert.equal(report.projectState, ".engineering/state/project.json");
    assert.equal(report.smoke.status, "PASS");

    const tree = await snapshotTree(target);
    const paths = new Set(tree.map((entry) => entry.path));
    for (const requiredPath of [
      ".engineering/AGENTS.md",
      ".engineering/CONTEXT.md",
      ".engineering/README.md",
      ".engineering/adrs/.gitkeep",
      ".engineering/plans/.gitkeep",
      ".engineering/runs/.gitkeep",
      ".engineering/specs/.gitkeep",
      ".engineering/tickets/.gitkeep",
      ".engineering/runtime/contracts.mjs",
      ".engineering/runtime/deep-contracts.mjs",
      ".engineering/runtime/engine.mjs",
      ".engineering/runtime/manifest.json",
      ".engineering/runtime/methodology.md",
      ".engineering/runtime/mode-policy.mjs",
      ".engineering/runtime/parallel-eligibility.mjs",
      ".engineering/runtime/upstream-adoption.json",
      ".engineering/state/project.json",
      ".engineering/verification/registry.json",
    ]) {
      assert.ok(paths.has(requiredPath), `missing canonical path: ${requiredPath}`);
    }
    assert.deepEqual(await applicationSnapshot(target), applicationBefore);

    const manifest = JSON.parse(
      await readFile(path.join(target, ".engineering", "runtime", "manifest.json"), "utf8"),
    );
    assert.deepEqual(validateRuntimeManifest(manifest), { valid: true, errors: [] });
    assert.deepEqual(await verifyFileChecksums(target, manifest.files), {
      valid: true,
      errors: [],
    });
    const matrix = JSON.parse(
      await readFile(
        path.join(target, ".engineering", "runtime", "upstream-adoption.json"),
        "utf8",
      ),
    );
    assert.deepEqual(validateAdoptionMatrix(matrix), { valid: true, errors: [] });
    assert.equal(matrix.entries[0].revision, "9603c1cc8118d08bc1b3bf34cf714f62178dea3b");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("Global Launcher onboards and delegates Engineering Runs to project-owned state", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-delegation-"));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });

  try {
    const onboarding = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--onboard",
      "--target",
      target,
    ]);
    assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
    const prepared = JSON.parse(onboarding.stdout);
    assert.equal(prepared.status, "PREPARED_PROJECT");
    assert.equal(prepared.delegated, true);
    assert.equal(prepared.runtimeVersion, "1.0.0");
    assert.deepEqual(prepared.project, {
      status: "PREPARED_PROJECT",
      statePath: ".engineering/state/project.json",
    });

    const run = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--run",
      "--target",
      target,
    ]);
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    assert.deepEqual(JSON.parse(run.stdout), prepared);

    const repeatedOnboarding = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--onboard",
      "--target",
      target,
    ]);
    assert.equal(repeatedOnboarding.code, 0, repeatedOnboarding.stderr);
    assert.equal(JSON.parse(repeatedOnboarding.stdout).status, "READY");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("replacement Global Launcher cannot replace an installed pinned runtime", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-isolation-"));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });

  try {
    const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
    assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);

    const installedRuntime = path.join(target, ".engineering", "runtime");
    const runtimeBefore = await snapshotTree(installedRuntime);
    const replacementRoot = path.join(sandbox, "replacement-global-launcher");
    const replacementScripts = path.join(replacementRoot, "scripts");
    const replacementRuntime = path.join(replacementRoot, "runtime");
    await mkdir(replacementScripts, { recursive: true });
    await mkdir(replacementRuntime, { recursive: true });
    const replacementLauncher = path.join(replacementScripts, "readiness.mjs");
    const source = await readFile(launcherPath, "utf8");
    await writeFile(
      replacementLauncher,
      `${source}\n// Replacement Global Launcher 99.0.0.\n`,
      "utf8",
    );
    await writeFile(
      path.join(replacementRuntime, "engine.mjs"),
      'export const RUNTIME_VERSION = "99.0.0";\n',
      "utf8",
    );
    assert.match(await readFile(replacementLauncher, "utf8"), /99\.0\.0/);

    const run = await runProcess(process.execPath, [
      replacementLauncher,
      "--explicit",
      "--run",
      "--target",
      target,
    ]);
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    const report = JSON.parse(run.stdout);
    assert.equal(report.runtimeVersion, "1.0.0");
    assert.equal(report.status, "PREPARED_PROJECT");
    assert.deepEqual(await snapshotTree(installedRuntime), runtimeBefore);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("requesting a run before onboarding preserves ONBOARDING_REQUIRED exit semantics", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-run-before-onboard-"));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  try {
    const run = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--run",
      "--target",
      target,
    ]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, "ONBOARDING_REQUIRED");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

/** @param {string} target */
async function applicationSnapshot(target) {
  return (await snapshotTree(target)).filter((entry) => !entry.path.startsWith(".engineering"));
}
