import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeMigrationManifestHash,
  MIGRATION_ACTIONS,
  MIGRATION_OWNERS,
  MIGRATION_RISKS,
  migrationDestructiveScope,
  validateMigrationManifest,
} from "../../skills/engineering-loop/runtime/contracts.mjs";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";

const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const nodeFixture = fileURLToPath(new URL("../fixtures/legacy-node", import.meta.url));
const pythonFixture = fileURLToPath(
  new URL("../fixtures/legacy-python", import.meta.url),
);
const adversarialFixture = fileURLToPath(
  new URL("../fixtures/legacy-adversarial", import.meta.url),
);
const canonFixture = fileURLToPath(new URL("../fixtures/legacy-canon", import.meta.url));

test("normalization proposal preserves a Node Application Core and its conventions", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-normalize-node-"));
  const target = path.join(sandbox, "legacy target");
  await cp(nodeFixture, target, { recursive: true });
  const before = await snapshotTree(target);

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    /** @type {any} */
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "NORMALIZATION_PROPOSED");
    assert.equal(report.mutated, false);
    assert.equal(report.manifest.humanGate.required, true);
    assert.equal(report.manifest.humanGate.approved, false);

    const conventionIds = report.manifest.inventory.conventions.map(
      (/** @type {any} */ convention) => convention.id,
    );
    assert.ok(conventionIds.includes("node-package"));
    assert.ok(conventionIds.includes("npm-lockfile"));
    assert.ok(conventionIds.includes("github-actions"));
    assert.ok(conventionIds.includes("build-tooling"));
    assert.ok(conventionIds.includes("project-documentation"));
    assert.ok(conventionIds.includes("typescript-config"));
    assert.deepEqual(report.manifest.inventory.applicationCore, ["src/app.mjs"]);
    for (const conventionPath of [".gitignore", ".github/workflows/ci.yml"]) {
      const action = report.manifest.actions.find(
        (/** @type {any} */ candidate) => candidate.path === conventionPath,
      );
      assert.equal(action.action, "KEEP", conventionPath);
      assert.equal(action.ownership, "PROJECT_CONVENTION", conventionPath);
    }

    const applicationAction = report.manifest.actions.find(
      (/** @type {any} */ action) => action.path === "src/app.mjs",
    );
    assert.equal(applicationAction.action, "KEEP");
    assert.equal(applicationAction.ownership, "APPLICATION_CORE");
    assert.equal(applicationAction.destructive, false);
    assert.equal(
      report.manifest.actions.some(
        (/** @type {any} */ action) =>
          action.path.startsWith("src/") && action.destructive,
      ),
      false,
    );
    assert.deepEqual(await snapshotTree(target), before);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("normalization separates a legacy agent control plane from a Hugo Application Core", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-canon-"));
  const target = path.join(sandbox, "legacy canon");
  await cp(canonFixture, target, { recursive: true });

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    /** @type {any} */
    const manifest = JSON.parse(result.stdout).manifest;
    const conventionIds = manifest.inventory.conventions.map(
      (/** @type {any} */ convention) => convention.id,
    );
    assert.ok(conventionIds.includes("hugo-project"));
    assert.ok(conventionIds.includes("legacy-agent-control-plane"));
    assert.deepEqual(manifest.inventory.applicationCore, [
      "content/post.md",
      "layouts/index.html",
      "static/llms.txt",
    ]);

    for (const conventionPath of [
      "agents/planner.md",
      "develop/TODO.md",
      "hooks/pre-implementation.md",
      "memory/MEMORY.md",
      "playbooks/feature.md",
      "registries/capabilities.json",
      "rules/testing.mdc",
    ]) {
      const action = manifest.actions.find(
        (/** @type {any} */ candidate) => candidate.path === conventionPath,
      );
      assert.equal(action.action, "KEEP", conventionPath);
      assert.equal(action.ownership, "PROJECT_CONVENTION", conventionPath);
    }
    for (const protectedPath of [".cursor/plans/legacy.md", "AGENTS.md"]) {
      const action = manifest.actions.find(
        (/** @type {any} */ candidate) => candidate.path === protectedPath,
      );
      assert.equal(action.action, "PROTECT", protectedPath);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("ambiguous, sensitive, and deliberate local paths default to PROTECT", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-protect-"));
  const target = path.join(sandbox, "adversarial target");
  await cp(adversarialFixture, target, { recursive: true });

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    /** @type {any} */
    const manifest = JSON.parse(result.stdout).manifest;
    const protectedPaths = [
      ".custom-tool",
      ".cache/debug.py",
      ".env.production",
      ".github/workflows/.env.production",
      ".cursor/rules/project.mdc",
      ".engineering/CONTEXT.md",
      ".kube/config",
      ".ssh/id_rsa",
      "AGENTS.md",
      "agents/credentials.json",
      "build/generated.ts",
      "config/credentials.json",
      "docs/signing.key",
      "notes.txt",
      "secrets/signing.key",
      "token.json",
      "tmp/scratch.sql",
      "vendor/plugin.js",
    ];
    for (const protectedPath of protectedPaths) {
      const actions = manifest.actions.filter(
        (/** @type {any} */ action) => action.path === protectedPath,
      );
      assert.equal(actions.length, 1, protectedPath);
      assert.equal(actions[0].action, "PROTECT", protectedPath);
      assert.equal(actions[0].ownership, "LOCAL_OVERRIDE", protectedPath);
      assert.equal(actions[0].risk, "HIGH", protectedPath);
      assert.equal(actions[0].destructive, false, protectedPath);
    }
    assert.equal(
      manifest.destructiveScope.some((/** @type {any} */ action) =>
        protectedPaths.includes(action.path),
      ),
      false,
    );
    assert.deepEqual(manifest.inventory.applicationCore, [
      "backend/domain.py",
      "src/app.mjs",
    ]);
    assert.deepEqual(validateMigrationManifest(manifest), { valid: true, errors: [] });
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("normalization blocks CREATE beneath a file ancestor", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-conflict-"));
  const target = path.join(sandbox, "conflicting target");
  await cp(nodeFixture, target, { recursive: true });
  await writeFile(path.join(target, ".engineering"), "local control-plane file\n", "utf8");
  const before = await snapshotTree(target);

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    /** @type {any} */
    const manifest = JSON.parse(result.stdout).manifest;
    const controlPlaneAction = manifest.actions.find(
      (/** @type {any} */ action) => action.path === ".engineering",
    );
    assert.equal(controlPlaneAction.action, "PROTECT");
    assert.equal(
      manifest.actions.some(
        (/** @type {any} */ action) =>
          action.action === "CREATE" && action.path.startsWith(".engineering/"),
      ),
      false,
    );
    assert.ok(manifest.conflicts.length > 0);
    assert.equal(
      manifest.conflicts.every(
        (/** @type {any} */ conflict) => conflict.blocker === ".engineering",
      ),
      true,
    );
    assert.deepEqual(validateMigrationManifest(manifest), { valid: true, errors: [] });
    assert.deepEqual(await snapshotTree(target), before);

    const unsafeManifest = structuredClone(manifest);
    unsafeManifest.actions.push(
      migrationAction(
        "CREATE",
        ".engineering/runtime",
        "PROJECT_RUNTIME",
        "LOW",
        false,
      ),
    );
    unsafeManifest.hash = computeMigrationManifestHash(unsafeManifest.actions);
    const unsafeResult = validateMigrationManifest(unsafeManifest);
    assert.equal(unsafeResult.valid, false);
    assert.ok(unsafeResult.errors.some((error) => error.includes("ancestor")));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("Migration Manifest is complete and its hash binds every path and action", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-manifest-"));
  const target = path.join(sandbox, "manifest target");
  await cp(nodeFixture, target, { recursive: true });

  try {
    const first = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    const second = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);
    /** @type {any} */
    const firstManifest = JSON.parse(first.stdout).manifest;
    /** @type {any} */
    const secondManifest = JSON.parse(second.stdout).manifest;
    assert.deepEqual(validateMigrationManifest(firstManifest), { valid: true, errors: [] });
    assert.match(firstManifest.hash, /^[a-f0-9]{64}$/u);
    assert.equal(firstManifest.hashAlgorithm, "sha256");
    assert.equal(firstManifest.hash, secondManifest.hash);
    assert.deepEqual(firstManifest.destructiveScope, []);
    const createPaths = new Set(
      firstManifest.actions
        .filter((/** @type {any} */ action) => action.action === "CREATE")
        .map((/** @type {any} */ action) => action.path),
    );
    for (const canonicalPath of [
      ".engineering/adrs/.gitkeep",
      ".engineering/plans/.gitkeep",
      ".engineering/runs/.gitkeep",
      ".engineering/specs/.gitkeep",
      ".engineering/tickets/.gitkeep",
    ]) {
      assert.ok(createPaths.has(canonicalPath), canonicalPath);
    }

    for (const action of firstManifest.actions) {
      for (const field of [
        "action",
        "path",
        "ownership",
        "rationale",
        "risk",
        "rollback",
        "destructive",
      ]) {
        assert.ok(Object.hasOwn(action, field), `${action.path} is missing ${field}`);
      }
    }

    const changedPath = structuredClone(firstManifest.actions);
    changedPath[0].path = `${changedPath[0].path}-changed`;
    assert.notEqual(computeMigrationManifestHash(changedPath), firstManifest.hash);

    const changedAction = structuredClone(firstManifest.actions);
    changedAction[0].action = changedAction[0].action === "KEEP" ? "PROTECT" : "KEEP";
    assert.notEqual(computeMigrationManifestHash(changedAction), firstManifest.hash);

    for (const field of [
      "action",
      "path",
      "ownership",
      "rationale",
      "risk",
      "rollback",
      "destructive",
    ]) {
      const incomplete = structuredClone(firstManifest);
      delete incomplete.actions[0][field];
      const incompleteResult = validateMigrationManifest(incomplete);
      assert.equal(incompleteResult.valid, false, field);
      assert.ok(
        incompleteResult.errors.some((error) => error.includes(field)),
        `${field}: ${incompleteResult.errors.join("\n")}`,
      );
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("Migration Manifest schema represents every supported action kind", () => {
  const digest = "a".repeat(64);
  const actions = [
    migrationAction("KEEP", "src/app.mjs", "APPLICATION_CORE", "NONE", false, digest),
    migrationAction("CREATE", ".engineering", "PROJECT_RUNTIME", "LOW", false),
    {
      ...migrationAction(
        "MOVE",
        "develop/plan.md",
        "PROJECT_CONVENTION",
        "MEDIUM",
        true,
        digest,
      ),
      destination: ".engineering/plans/plan.md",
    },
    migrationAction(
      "REWRITE",
      "memory/state.json",
      "PROJECT_CONVENTION",
      "HIGH",
      true,
      digest,
    ),
    migrationAction(
      "DELETE",
      "work/stale.cache",
      "PROJECT_CONVENTION",
      "HIGH",
      true,
      digest,
    ),
    migrationAction(
      "PROTECT",
      ".env.local",
      "LOCAL_OVERRIDE",
      "HIGH",
      false,
      digest,
    ),
  ];
  const destructiveScope = migrationDestructiveScope(actions);
  const manifest = {
    schemaVersion: 1,
    kind: "MIGRATION_MANIFEST",
    inventory: {
      ignoredPaths: [".git"],
      entries: actions
        .filter((action) => action.action !== "CREATE")
        .map((action) => ({ path: action.path, kind: "file", sha256: digest })),
      conventions: [],
      applicationCore: ["src/app.mjs"],
    },
    actions,
    conflicts: [],
    destructiveScope,
    hashAlgorithm: "sha256",
    hash: computeMigrationManifestHash(actions),
    humanGate: { required: true, approved: false },
  };

  assert.deepEqual(
    actions.map((action) => action.action),
    MIGRATION_ACTIONS,
  );
  assert.deepEqual(
    destructiveScope.map((action) => action.action),
    ["MOVE", "REWRITE", "DELETE"],
  );
  assert.deepEqual(validateMigrationManifest(manifest), { valid: true, errors: [] });
});

/**
 * @param {(typeof MIGRATION_ACTIONS)[number]} action
 * @param {string} actionPath
 * @param {(typeof MIGRATION_OWNERS)[number]} ownership
 * @param {(typeof MIGRATION_RISKS)[number]} risk
 * @param {boolean} destructive
 * @param {string} [sourceSha256]
 */
function migrationAction(action, actionPath, ownership, risk, destructive, sourceSha256) {
  return {
    action,
    path: actionPath,
    ownership,
    rationale: `Exercise the ${action} contract.`,
    risk,
    rollback: `Rollback the ${action} action.`,
    destructive,
    ...(sourceSha256 ? { sourceSha256 } : {}),
  };
}

test("normalization recognizes a custom Python layout without universalizing it", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-normalize-python-"));
  const target = path.join(sandbox, "python target");
  await cp(pythonFixture, target, { recursive: true });

  try {
    const result = await runProcess(process.execPath, [
      launcherPath,
      "--explicit",
      "--normalize",
      "--target",
      target,
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    /** @type {any} */
    const report = JSON.parse(result.stdout);
    const conventionIds = report.manifest.inventory.conventions.map(
      (/** @type {any} */ convention) => convention.id,
    );
    assert.ok(conventionIds.includes("python-project"));
    assert.ok(conventionIds.includes("ruff"));
    assert.deepEqual(report.manifest.inventory.applicationCore, [
      "service/api.py",
      "tests/test_api.py",
    ]);
    assert.equal(
      report.manifest.actions.some(
        (/** @type {any} */ action) =>
          action.path === "src" || action.path.startsWith("src/"),
      ),
      false,
    );
    assert.equal(
      report.manifest.actions
        .filter((/** @type {any} */ action) => action.path.startsWith("service/"))
        .every(
          (/** @type {any} */ action) =>
            action.action === "KEEP" && action.ownership === "APPLICATION_CORE",
        ),
      true,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
