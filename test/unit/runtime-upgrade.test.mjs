import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";
import { validateMigrationManifest } from "../../skills/engineering-loop/runtime/contracts.mjs";

const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const skillRoot = fileURLToPath(
  new URL("../../skills/engineering-loop", import.meta.url),
);

test("upgrade blocks before mutation while a feature Engineering Run is active", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-upgrade-active-"));
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const runRoot = path.join(target, ".engineering", "runs", "active-feature");
    await mkdir(runRoot);
    await writeJson(path.join(runRoot, "state.json"), {
      schemaVersion: 1,
      runId: "active-feature",
      mode: "STANDARD",
      branch: "run/active-feature",
      baseCommit: "0".repeat(40),
      currentState: "IMPLEMENTATION",
      terminal: false,
      history: [
        {
          sequence: 1,
          state: "IMPLEMENTATION",
          status: "COMPLETE",
        },
      ],
    });
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: active feature run");

    const beforeTree = await snapshotTree(target);
    const beforeHead = await git(target, "rev-parse", "HEAD");
    const result = await invokeLauncher(target, "--upgrade");

    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.operation, "UPGRADE");
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mutated, false);
    assert.equal(report.blocker.reason, "ACTIVE_ENGINEERING_RUN");
    assert.deepEqual(await snapshotTree(target), beforeTree);
    assert.equal(await git(target, "rev-parse", "HEAD"), beforeHead);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("upgrade dry-run reports the pinned runtime and upstream contract diff", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-upgrade-diff-"));
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const manifestPath = path.join(target, ".engineering", "runtime", "manifest.json");
    const statePath = path.join(target, ".engineering", "state", "project.json");
    const adoptionPath = path.join(
      target,
      ".engineering",
      "runtime",
      "upstream-adoption.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.runtimeVersion = "1.0.0";
    await writeJson(manifestPath, manifest);
    await writeJson(statePath, {
      schemaVersion: 1,
      status: "PREPARED_PROJECT",
      runtimeVersion: "1.0.0",
    });
    const adoption = JSON.parse(await readFile(adoptionPath, "utf8"));
    adoption.entries[0].revision = "a".repeat(40);
    adoption.entries[0].localDelta = "Legacy local adaptation.";
    const adoptionSource = Buffer.from(
      `${JSON.stringify(adoption, null, 2)}\n`,
      "utf8",
    );
    await writeFile(adoptionPath, adoptionSource);
    manifest.files.find(
      (/** @type {any} */ entry) =>
        entry.path === ".engineering/runtime/upstream-adoption.json",
    ).sha256 = createHash("sha256").update(adoptionSource).digest("hex");
    await writeJson(manifestPath, manifest);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: legacy pinned runtime");

    const before = await snapshotTree(target);
    const result = await invokeLauncher(target, "--upgrade", "--dry-run");

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.operation, "UPGRADE");
    assert.equal(report.status, "READY");
    assert.equal(report.mode, "DRY_RUN");
    assert.equal(report.mutated, false);
    assert.deepEqual(report.runtimeDiff, {
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
    });
    assert.deepEqual(report.upstreamDiff, [
      {
        name: "matt-pocock-skills-methodology",
        changes: {
          localDelta: {
            from: "Legacy local adaptation.",
            to: "Reduced to the bounded preparation and verification contract for issue #18.",
          },
          revision: {
            from: "a".repeat(40),
            to: "9603c1cc8118d08bc1b3bf34cf714f62178dea3b",
          },
        },
      },
    ]);
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "upgrade-candidate-provenance" && entry.status === "PASS",
        ),
    );
    assert.deepEqual(report.candidateProvenance.adoptionMatrix.entries[0], {
      name: "matt-pocock-skills-methodology",
      source: "https://github.com/mattpocock/skills",
      revision: "9603c1cc8118d08bc1b3bf34cf714f62178dea3b",
      checksum: report.candidateProvenance.adoptionMatrix.entries[0].checksum,
      license: "MIT",
      adoption: "ADAPT",
      artifact: ".engineering/runtime/methodology.md",
      localDelta:
        "Reduced to the bounded preparation and verification contract for issue #18.",
      compatibilityEvidence: "Onboarding contract and Prepared Project smoke suites.",
      upgradeProcedure:
        "Review the pinned upstream diff, update the local adaptation and checksum, then run npm run verify.",
    });
    assert.match(
      report.candidateProvenance.adoptionMatrix.entries[0].checksum,
      /^[a-f0-9]{64}$/u,
    );
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("failing candidate compatibility preserves the installed runtime", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-compatibility-"),
  );
  const target = path.join(sandbox, "target");
  const candidateSkill = path.join(sandbox, "candidate-skill");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: installed runtime");

    await cp(skillRoot, candidateSkill, { recursive: true });
    await writeFile(
      path.join(candidateSkill, "runtime", "engine.mjs"),
      "process.exitCode = 7;\n",
    );

    const before = await snapshotTree(target);
    const beforeHead = await git(target, "rev-parse", "HEAD");
    const result = await invokeLauncherAt(
      path.join(candidateSkill, "scripts", "readiness.mjs"),
      target,
      "--upgrade",
    );

    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.operation, "UPGRADE");
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mutated, false);
    assert.equal(report.blocker.reason, "COMPATIBILITY_FAILED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "upgrade-candidate-compatibility" &&
          entry.status === "INVALID",
      ),
    );
    assert.deepEqual(await snapshotTree(target), before);
    assert.equal(await git(target, "rev-parse", "HEAD"), beforeHead);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("upgrade reports an already-current pinned runtime without mutation", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-current-"),
  );
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: current pinned runtime");

    const before = await snapshotTree(target);
    const beforeHead = await git(target, "rev-parse", "HEAD");
    const result = await invokeLauncher(target, "--upgrade");
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY");
    assert.equal(report.mode, "UP_TO_DATE");
    assert.equal(report.mutated, false);
    assert.deepEqual(await snapshotTree(target), before);
    assert.equal(await git(target, "rev-parse", "HEAD"), beforeHead);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("destructive runtime scope requires the exact Migration Manifest hash", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-human-gate-"),
  );
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const legacyPath = path.join(
      target,
      ".engineering",
      "runtime",
      "legacy-runtime.mjs",
    );
    const legacyContent = Buffer.from("export const legacy = true;\n", "utf8");
    await writeFile(legacyPath, legacyContent);
    const manifestPath = path.join(target, ".engineering", "runtime", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files.push({
      path: ".engineering/runtime/legacy-runtime.mjs",
      sha256: createHash("sha256").update(legacyContent).digest("hex"),
      ownership: "PROJECT_RUNTIME",
      generated: true,
      protected: false,
      repair: { kind: "git-blob", revision: "HEAD" },
    });
    await writeJson(manifestPath, manifest);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: removable legacy runtime file");

    const before = await snapshotTree(target);
    const unapproved = await invokeLauncher(target, "--upgrade");
    assert.equal(unapproved.code, 1, `${unapproved.stdout}\n${unapproved.stderr}`);
    const proposal = JSON.parse(unapproved.stdout);
    assert.equal(proposal.status, "HUMAN_GATE");
    assert.equal(proposal.mutated, false);
    assert.equal(validateMigrationManifest(proposal.migrationManifest).valid, true);
    assert.deepEqual(proposal.migrationManifest.actions, [
      {
        action: "DELETE",
        path: ".engineering/runtime/legacy-runtime.mjs",
        ownership: "PROJECT_RUNTIME",
        rationale: "Remove a runtime-owned path absent from the pinned upgrade candidate.",
        risk: "HIGH",
        rollback: "Restore the exact pre-upgrade runtime bytes from the rollback journal.",
        destructive: true,
        sourceSha256: createHash("sha256").update(legacyContent).digest("hex"),
      },
    ]);
    assert.deepEqual(await snapshotTree(target), before);

    const wrongApproval = await invokeLauncher(
      target,
      "--upgrade",
      "--approve-hash",
      "0".repeat(64),
    );
    assert.equal(
      wrongApproval.code,
      1,
      `${wrongApproval.stdout}\n${wrongApproval.stderr}`,
    );
    assert.equal(JSON.parse(wrongApproval.stdout).status, "HUMAN_GATE");
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("overwriting a protected local runtime override requires a Human Gate", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-protected-"),
  );
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const manifestPath = path.join(target, ".engineering", "runtime", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const methodology = manifest.files.find(
      (/** @type {any} */ entry) =>
        entry.path === ".engineering/runtime/methodology.md",
    );
    methodology.ownership = "LOCAL_OVERRIDE";
    methodology.generated = false;
    methodology.protected = true;
    delete methodology.repair;
    await writeJson(manifestPath, manifest);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: protected local runtime override");

    const before = await snapshotTree(target);
    const result = await invokeLauncher(target, "--upgrade");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "HUMAN_GATE");
    assert.deepEqual(
      report.migrationManifest.actions.map(
        (/** @type {any} */ action) => ({
          action: action.action,
          path: action.path,
          ownership: action.ownership,
        }),
      ),
      [
        {
          action: "REWRITE",
          path: ".engineering/runtime/methodology.md",
          ownership: "LOCAL_OVERRIDE",
        },
      ],
    );
    assert.equal(validateMigrationManifest(report.migrationManifest).valid, true);
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("overwriting an existing unowned candidate destination requires a Human Gate", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-unowned-collision-"),
  );
  const target = path.join(sandbox, "target");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const manifestPath = path.join(
      target,
      ".engineering",
      "runtime",
      "manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files = manifest.files.filter(
      (/** @type {any} */ entry) =>
        entry.path !== ".engineering/runtime/methodology.md",
    );
    await writeJson(manifestPath, manifest);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: unowned runtime collision");

    const before = await snapshotTree(target);
    const result = await invokeLauncher(target, "--upgrade");
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "HUMAN_GATE");
    assert.deepEqual(
      report.migrationManifest.actions.map(
        (/** @type {any} */ action) => ({
          action: action.action,
          path: action.path,
          ownership: action.ownership,
        }),
      ),
      [
        {
          action: "REWRITE",
          path: ".engineering/runtime/methodology.md",
          ownership: "LOCAL_OVERRIDE",
        },
      ],
    );
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("successful upgrade commits the pinned runtime and reruns Doctor smoke", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-success-"),
  );
  const target = path.join(sandbox, "target");
  const isolatedHome = path.join(sandbox, "isolated-home");
  try {
    await mkdir(isolatedHome);
    await mkdir(path.join(target, "src"), { recursive: true });
    await writeFile(path.join(target, "src", "application.txt"), "application-v1\n");
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const manifestPath = path.join(target, ".engineering", "runtime", "manifest.json");
    const statePath = path.join(target, ".engineering", "state", "project.json");
    const adoptionPath = path.join(
      target,
      ".engineering",
      "runtime",
      "upstream-adoption.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.runtimeVersion = "1.0.0";
    await writeJson(manifestPath, manifest);
    await writeJson(statePath, {
      schemaVersion: 1,
      status: "PREPARED_PROJECT",
      runtimeVersion: "1.0.0",
    });
    const adoption = JSON.parse(await readFile(adoptionPath, "utf8"));
    adoption.entries[0].revision = "a".repeat(40);
    adoption.entries[0].localDelta = "Legacy local adaptation.";
    const adoptionSource = Buffer.from(
      `${JSON.stringify(adoption, null, 2)}\n`,
      "utf8",
    );
    await writeFile(adoptionPath, adoptionSource);
    manifest.files.find(
      (/** @type {any} */ entry) =>
        entry.path === ".engineering/runtime/upstream-adoption.json",
    ).sha256 = createHash("sha256").update(adoptionSource).digest("hex");
    await writeJson(manifestPath, manifest);
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: legacy runtime and application");

    const beforeApplication = await readFile(
      path.join(target, "src", "application.txt"),
      "utf8",
    );
    const beforeHead = await git(target, "rev-parse", "HEAD");
    const runsPath = path.join(target, ".engineering", "runs");
    const homeBefore = await snapshotTree(isolatedHome);
    const runsBefore = await snapshotTree(runsPath);
    const result = await runProcess(
      process.execPath,
      [launcherPath, "--explicit", "--upgrade", "--target", target],
      {
        env: {
          ...process.env,
          CODEX_HOME: path.join(isolatedHome, ".codex"),
          HOME: isolatedHome,
          USERPROFILE: isolatedHome,
        },
      },
    );

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.operation, "UPGRADE");
    assert.equal(report.status, "READY");
    assert.equal(report.mutated, true);
    assert.equal(report.runtimeDiff.fromVersion, "1.0.0");
    assert.equal(report.runtimeDiff.toVersion, "1.1.0");
    assert.equal(report.doctor.status, "READY");
    assert.ok(
      report.doctor.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "prepared-project-verification" && entry.status === "PASS",
      ),
    );
    assert.match(report.rollbackToken, /upgrade-rollback/iu);
    assert.notEqual(await git(target, "rev-parse", "HEAD"), beforeHead);
    assert.equal(
      await readFile(path.join(target, "src", "application.txt"), "utf8"),
      beforeApplication,
    );
    assert.equal(
      JSON.parse(await readFile(manifestPath, "utf8")).runtimeVersion,
      "1.1.0",
    );
    assert.equal(await git(target, "status", "--porcelain"), "");
    assert.deepEqual(await snapshotTree(isolatedHome), homeBefore);
    assert.deepEqual(await snapshotTree(runsPath), runsBefore);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("upgrade rollback restores runtime state without changing Application Core", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-rollback-"),
  );
  const target = path.join(sandbox, "target");
  try {
    await mkdir(path.join(target, "src"), { recursive: true });
    await writeFile(path.join(target, "src", "application.txt"), "application-v1\n");
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    const onboarded = await invokeLauncher(target, "--onboard");
    assert.equal(onboarded.code, 0, `${onboarded.stdout}\n${onboarded.stderr}`);

    const manifestPath = path.join(target, ".engineering", "runtime", "manifest.json");
    const statePath = path.join(target, ".engineering", "state", "project.json");
    const adoptionPath = path.join(
      target,
      ".engineering",
      "runtime",
      "upstream-adoption.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.runtimeVersion = "1.0.0";
    const adoption = JSON.parse(await readFile(adoptionPath, "utf8"));
    adoption.entries[0].revision = "a".repeat(40);
    const adoptionSource = Buffer.from(
      `${JSON.stringify(adoption, null, 2)}\n`,
      "utf8",
    );
    await writeFile(adoptionPath, adoptionSource);
    manifest.files.find(
      (/** @type {any} */ entry) =>
        entry.path === ".engineering/runtime/upstream-adoption.json",
    ).sha256 = createHash("sha256").update(adoptionSource).digest("hex");
    await writeJson(manifestPath, manifest);
    await writeJson(statePath, {
      schemaVersion: 1,
      status: "PREPARED_PROJECT",
      runtimeVersion: "1.0.0",
    });
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: rollback baseline");

    const applicationBefore = await readFile(
      path.join(target, "src", "application.txt"),
      "utf8",
    );
    const upgraded = await invokeLauncher(target, "--upgrade");
    assert.equal(upgraded.code, 0, `${upgraded.stdout}\n${upgraded.stderr}`);
    const upgradeReport = JSON.parse(upgraded.stdout);
    const upgradedHead = await git(target, "rev-parse", "HEAD");

    const rolledBack = await invokeLauncher(
      target,
      "--upgrade-rollback",
      upgradeReport.rollbackToken,
    );
    assert.equal(rolledBack.code, 0, `${rolledBack.stdout}\n${rolledBack.stderr}`);
    const rollbackReport = JSON.parse(rolledBack.stdout);
    assert.equal(rollbackReport.operation, "UPGRADE_ROLLBACK");
    assert.equal(rollbackReport.status, "ROLLED_BACK");
    assert.equal(rollbackReport.mutated, true);
    assert.equal(rollbackReport.runtimeVersion, "1.0.0");
    assert.notEqual(await git(target, "rev-parse", "HEAD"), upgradedHead);
    assert.equal(
      JSON.parse(await readFile(manifestPath, "utf8")).runtimeVersion,
      "1.0.0",
    );
    assert.equal(
      JSON.parse(await readFile(statePath, "utf8")).runtimeVersion,
      "1.0.0",
    );
    assert.equal(
      await readFile(path.join(target, "src", "application.txt"), "utf8"),
      applicationBefore,
    );
    assert.equal(await git(target, "status", "--porcelain"), "");
    await assert.rejects(readFile(upgradeReport.rollbackToken));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("upgrade rollback rejects a forged token outside launcher-owned temp storage", async () => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-forged-token-"),
  );
  const target = path.join(sandbox, "target");
  const forgedRoot = path.join(
    sandbox,
    "engineering-loop-upgrade-rollback-forged",
  );
  const token = path.join(forgedRoot, "upgrade-rollback.json");
  const sentinel = path.join(forgedRoot, "sentinel.txt");
  try {
    await mkdir(target);
    await git(target, "init", "-b", "dev");
    await git(target, "config", "user.name", "Upgrade Fixture");
    await git(target, "config", "user.email", "upgrade@example.test");
    await writeFile(path.join(target, "application.txt"), "unchanged\n");
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: forged rollback token");
    await mkdir(forgedRoot);
    await writeFile(sentinel, "must-survive\n");
    await writeJson(token, {
      schemaVersion: 1,
      kind: "RUNTIME_UPGRADE_ROLLBACK",
      target: await realpath(target),
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      upgradeCommit: await git(target, "rev-parse", "HEAD"),
      nonce: "00000000-0000-4000-8000-000000000000",
      entries: [],
    });

    const result = await invokeLauncher(target, "--upgrade-rollback", token);

    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mutated, false);
    assert.match(
      report.evidence[0].details.join("\n"),
      /outside the launcher-owned temporary directory/u,
    );
    assert.equal(await readFile(sentinel, "utf8"), "must-survive\n");
    assert.equal(await git(target, "status", "--porcelain"), "");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

/** @param {string} target @param {...string} args */
function invokeLauncher(target, ...args) {
  return invokeLauncherAt(launcherPath, target, ...args);
}

/** @param {string} launcher @param {string} target @param {...string} args */
function invokeLauncherAt(launcher, target, ...args) {
  return runProcess(process.execPath, [
    launcher,
    "--explicit",
    ...args,
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

/** @param {string} filePath @param {unknown} value */
async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
