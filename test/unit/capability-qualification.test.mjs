import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  qualifyProjectLocalCapability,
} from "../../skills/engineering-loop/runtime/capability-contracts.mjs";
import { sha256 } from "../../skills/engineering-loop/runtime/contracts.mjs";
import { snapshotTree } from "../support/snapshot.mjs";
import { runProcess } from "../support/process.mjs";

const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);

test("a pinned capability installs project-locally and passes smoke", async () => {
  const prepared = await prepareTarget("success", false);
  try {
    const result = /** @type {any} */ (
      await qualifyProjectLocalCapability(prepared.target, prepared.request)
    );
    assert.equal(result.status, "INSTALLED");
    assert.equal(result.projectLocal, true);
    assert.equal(result.installPath, ".engineering/capabilities/graphviz-renderer");
    assert.deepEqual(result.smoke, {
      status: "PASS",
      kind: "CAPABILITY_CONTENT_ASSERTION",
      evidenceId: "capability-gap-render-dot",
    });
    assert.equal(
      await readFile(
        path.join(prepared.target, ".engineering", "capabilities", "graphviz-renderer", "index.mjs"),
        "utf8",
      ),
      'export const render = () => "diagram";\n',
    );
    const registry = JSON.parse(
      await readFile(
        path.join(prepared.target, ".engineering", "capabilities", "registry.json"),
        "utf8",
      ),
    );
    assert.deepEqual(registry.entries, [{
      id: "graphviz-renderer",
      kind: "CLI",
      source: prepared.request.candidate.source,
      revision: prepared.request.candidate.revision,
      checksum: prepared.request.candidate.checksum,
      files: prepared.request.candidate.files,
      installPath: ".engineering/capabilities/graphviz-renderer",
      smokeStatus: "PASS",
      qualification: {
        provenance: "VERIFIED",
        license: "MIT",
        permissions: ["project-read"],
        scripts: [],
        instructions: {
          status: "COMPATIBLE",
          evidenceId: "instruction-audit",
        },
        maintenance: {
          status: "MAINTAINED",
          evidenceId: "release-history",
        },
        conflicts: [],
        taskFit: {
          missingBehavior: "Render a deterministic Graphviz diagram from a DOT file.",
          requiredBehaviorId: "render-dot-diagram",
          evidenceIds: ["capability-gap-render-dot"],
        },
      },
    }]);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a failing smoke restores the project tree and registry exactly", async () => {
  const prepared = await prepareTarget("rollback", true);
  try {
    const before = await snapshotTree(prepared.target);
    const result = /** @type {any} */ (
      await qualifyProjectLocalCapability(prepared.target, prepared.request)
    );
    assert.equal(result.status, "REJECTED");
    assert.deepEqual(result.findings, ["project-local capability smoke failed"]);
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("Human Gate actions never mutate the project-local capability registry", async () => {
  const prepared = await prepareTarget("human-gate", false);
  try {
    prepared.request.candidate.requestedActions.writeEnabledMcp = true;
    const registryPath = path.join(
      prepared.target,
      ".engineering",
      "capabilities",
      "registry.json",
    );
    const registryBefore = await readFile(registryPath, "utf8");
    const result = /** @type {any} */ (
      await qualifyProjectLocalCapability(prepared.target, prepared.request)
    );
    assert.equal(result.status, "HUMAN_GATE");
    assert.equal(result.humanGate.approved, false);
    assert.match(result.humanGate.artifactPath, /^\.engineering\/capabilities\/human-gates\//u);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(prepared.target, ...result.humanGate.artifactPath.split("/")),
          "utf8",
        ),
      ),
      result.humanGate,
    );
    assert.equal(await readFile(registryPath, "utf8"), registryBefore);
    assert.equal(
      (await snapshotTree(prepared.target)).some(
        (entry) =>
          entry.path.startsWith(".engineering/capabilities/graphviz-renderer/"),
      ),
      false,
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("the installed Project Runtime exposes explicit capability qualification", async () => {
  const prepared = await prepareOnboardedTarget();
  try {
    const runtimeTarget = path.join(prepared.target, ".engineering", "runtime");
    await writeFile(
      path.join(prepared.target, "capability-request.json"),
      `${JSON.stringify(prepared.request, null, 2)}\n`,
      "utf8",
    );
    const result = await runProcess(
      process.execPath,
      [
        path.join(runtimeTarget, "engine.mjs"),
        "--qualify-capability",
        "capability-request.json",
      ],
      { cwd: prepared.target },
    );
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "INSTALLED");
    assert.equal(report.projectLocal, true);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a linked candidate quarantine is rejected without touching external content", async () => {
  const prepared = await prepareTarget("linked-quarantine", false);
  const stagedPath = path.join(
    prepared.target,
    ".engineering",
    "capability-candidates",
    "graphviz-renderer",
  );
  const externalPath = path.join(prepared.sandbox, "external-candidate");
  try {
    await rename(stagedPath, externalPath);
    await symlink(externalPath, stagedPath, "junction");
    const externalBefore = await snapshotTree(externalPath);
    const result = await qualifyProjectLocalCapability(prepared.target, prepared.request);
    assert.equal(result.status, "REJECTED");
    assert.match(result.findings.join("\n"), /linked|confined/iu);
    assert.deepEqual(await snapshotTree(externalPath), externalBefore);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("candidate-provided executable smoke is rejected without execution", async () => {
  const prepared = await prepareTarget("executable-smoke", false);
  try {
    /** @type {any} */ (prepared.request.candidate).smoke = ["node", "smoke.mjs"];
    const before = await snapshotTree(prepared.target);
    const result = await qualifyProjectLocalCapability(prepared.target, prepared.request);
    assert.equal(result.status, "REJECTED");
    assert.match(result.findings.join("\n"), /package contract/iu);
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("portable package paths reject Windows aliases and case-fold collisions", async () => {
  for (const files of [
    [
      { path: "index.mjs", sha256: "a".repeat(64) },
      { path: "INDEX.MJS", sha256: "b".repeat(64) },
    ],
    [{ path: "CON.mjs", sha256: "a".repeat(64) }],
    [{ path: "trailing.", sha256: "a".repeat(64) }],
  ]) {
    const prepared = await prepareTarget(`portable-${files[0].path}`, false);
    try {
      prepared.request.candidate.files = files;
      prepared.request.candidate.checksum = sha256(JSON.stringify(files));
      const before = await snapshotTree(prepared.target);
      const result = await qualifyProjectLocalCapability(prepared.target, prepared.request);
      assert.equal(result.status, "REJECTED");
      assert.match(result.findings.join("\n"), /package file evidence/iu);
      assert.deepEqual(await snapshotTree(prepared.target), before);
    } finally {
      await rm(prepared.sandbox, { recursive: true, force: true });
    }
  }
});

test("an interrupted publish journal is recovered before a fresh qualification", async () => {
  const prepared = await prepareTarget("journal-recovery", false);
  const transactionId = "11111111-1111-4111-8111-111111111111";
  const tempPath = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
    `.candidate-graphviz-renderer-${transactionId}`,
  );
  const journalPath = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
    ".transactions",
    `${transactionId}.json`,
  );
  try {
    await mkdir(tempPath);
    await writeFile(
      path.join(tempPath, "index.mjs"),
      'export const render = () => "diagram";\n',
      "utf8",
    );
    await mkdir(path.dirname(journalPath));
    const registryPath = path.join(
      prepared.target,
      ".engineering",
      "capabilities",
      "registry.json",
    );
    const registrySource = await readFile(registryPath, "utf8");
    await writeFile(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        transactionId,
        candidateId: "graphviz-renderer",
        tempPath:
          `.engineering/capabilities/.candidate-graphviz-renderer-${transactionId}`,
        installPath: ".engineering/capabilities/graphviz-renderer",
        registrySource,
        registryEntry: registryEntryFor(prepared.request),
      }, null, 2)}\n`,
      "utf8",
    );
    const result = await qualifyProjectLocalCapability(prepared.target, prepared.request);
    assert.equal(result.status, "INSTALLED");
    await assert.rejects(
      readFile(path.join(tempPath, "index.mjs"), "utf8"),
      /ENOENT/u,
    );
    await assert.rejects(readFile(journalPath, "utf8"), /ENOENT/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("concurrent qualification is serialized by a project-local lock", async () => {
  const prepared = await prepareTarget("concurrent", false);
  try {
    const results = await Promise.all([
      qualifyProjectLocalCapability(prepared.target, prepared.request),
      qualifyProjectLocalCapability(prepared.target, prepared.request),
    ]);
    assert.deepEqual(
      results.map((/** @type {any} */ result) => result.status).sort(),
      ["INSTALLED", "REJECTED"],
    );
    const registry = JSON.parse(
      await readFile(
        path.join(prepared.target, ".engineering", "capabilities", "registry.json"),
        "utf8",
      ),
    );
    assert.equal(registry.entries.length, 1);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a stale qualification lock is quarantined before takeover", async () => {
  const prepared = await prepareTarget("stale-lock", false);
  const lockPath = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
    ".qualification-lock",
  );
  try {
    await mkdir(lockPath);
    await writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        pid: 2147483647,
        token: "33333333-3333-4333-8333-333333333333",
        startedAt: "2000-01-01T00:00:00.000Z",
      }, null, 2)}\n`,
      "utf8",
    );
    const result = await qualifyProjectLocalCapability(
      prepared.target,
      prepared.request,
    );
    assert.equal(result.status, "INSTALLED");
    await assert.rejects(readFile(path.join(lockPath, "owner.json"), "utf8"), /ENOENT/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("bounded atomic-write remnants are recovered under the lock", async () => {
  const prepared = await prepareTarget("atomic-remnants", false);
  const capabilitiesRoot = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
  );
  const transactionsRoot = path.join(capabilitiesRoot, ".transactions");
  const rootRemnant = path.join(
    capabilitiesRoot,
    "registry.json.44444444-4444-4444-8444-444444444444.tmp",
  );
  const journalRemnant = path.join(
    transactionsRoot,
    "55555555-5555-4555-8555-555555555555.json.66666666-6666-4666-8666-666666666666.tmp",
  );
  try {
    await mkdir(transactionsRoot);
    await writeFile(rootRemnant, "partial registry\n", "utf8");
    await writeFile(journalRemnant, "partial journal\n", "utf8");
    const result = await qualifyProjectLocalCapability(
      prepared.target,
      prepared.request,
    );
    assert.equal(result.status, "INSTALLED");
    await assert.rejects(readFile(rootRemnant, "utf8"), /ENOENT/u);
    await assert.rejects(readFile(journalRemnant, "utf8"), /ENOENT/u);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("qualification rejects a coordinatedly tampered existing registry", async () => {
  const prepared = await prepareTarget("tampered-registry", false);
  try {
    const registryPath = path.join(
      prepared.target,
      ".engineering",
      "capabilities",
      "registry.json",
    );
    const entry = structuredClone(registryEntryFor(prepared.request));
    entry.id = "existing";
    entry.installPath = ".engineering/capabilities/existing";
    entry.files[0].sha256 = "f".repeat(64);
    await writeFile(
      registryPath,
      `${JSON.stringify({ schemaVersion: 1, entries: [entry] }, null, 2)}\n`,
      "utf8",
    );
    const before = await snapshotTree(prepared.target);
    const result = await qualifyProjectLocalCapability(
      prepared.target,
      prepared.request,
    );
    assert.equal(result.status, "REJECTED");
    assert.match(result.findings.join("\n"), /registry conflicts/iu);
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("a stale or forged journal has no destructive recovery authority", async () => {
  const prepared = await prepareTarget("forged-journal", false);
  const transactionId = "22222222-2222-4222-8222-222222222222";
  const journalPath = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
    ".transactions",
    `${transactionId}.json`,
  );
  try {
    const registryPath = path.join(
      prepared.target,
      ".engineering",
      "capabilities",
      "registry.json",
    );
    const unrelatedRegistry = {
      schemaVersion: 1,
      entries: [{ ...registryEntryFor(prepared.request), id: "existing" }],
    };
    const registrySource = `${JSON.stringify(unrelatedRegistry, null, 2)}\n`;
    await writeFile(
      registryPath,
      registrySource,
      "utf8",
    );
    const installPath = path.join(
      prepared.target,
      ".engineering",
      "capabilities",
      "graphviz-renderer",
    );
    await mkdir(installPath);
    await writeFile(
      path.join(installPath, "index.mjs"),
      'export const render = () => "diagram";\n',
      "utf8",
    );
    await mkdir(path.dirname(journalPath));
    await writeFile(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        transactionId,
        candidateId: "graphviz-renderer",
        tempPath:
          `.engineering/capabilities/.candidate-graphviz-renderer-${transactionId}`,
        installPath: ".engineering/capabilities/graphviz-renderer",
        registrySource,
        registryEntry: registryEntryFor(prepared.request),
      }, null, 2)}\n`,
      "utf8",
    );
    const before = await snapshotTree(prepared.target);
    const result = await qualifyProjectLocalCapability(prepared.target, prepared.request);
    assert.equal(result.status, "REJECTED");
    assert.match(result.findings.join("\n"), /registry snapshot conflicts/iu);
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

async function prepareOnboardedTarget() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "capability-runtime-cli-"));
  const target = path.join(sandbox, "target");
  await mkdir(target);
  const onboarding = await runProcess(
    process.execPath,
    [onboardingPath, "--target", target],
  );
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  return {
    sandbox,
    target,
    request: await stageCapabilityRequest(target, false),
  };
}

/** @param {string} label @param {boolean} failingSmoke */
async function prepareTarget(label, failingSmoke) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `capability-${label}-`));
  const target = path.join(sandbox, "target");
  const request = await stageCapabilityRequest(target, failingSmoke);
  const registryPath = path.join(target, ".engineering", "capabilities", "registry.json");
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(
    registryPath,
    `${JSON.stringify({ schemaVersion: 1, entries: [] }, null, 2)}\n`,
    "utf8",
  );
  return { sandbox, target, request };
}

/** @param {string} target @param {boolean} failingSmoke */
async function stageCapabilityRequest(target, failingSmoke) {
  const stagedPath = path.join(
    target,
    ".engineering",
    "capability-candidates",
    "graphviz-renderer",
  );
  await mkdir(stagedPath, { recursive: true });
  const sources = {
    "index.mjs": 'export const render = () => "diagram";\n',
  };
  for (const [file, source] of Object.entries(sources)) {
    await writeFile(path.join(stagedPath, file), source, "utf8");
  }
  const verificationRegistryPath = path.join(
    target,
    ".engineering",
    "verification",
    "registry.json",
  );
  const verificationRegistry = await readFile(verificationRegistryPath, "utf8")
    .then((source) => JSON.parse(source))
    .catch(() => ({ schemaVersion: 1, checks: [] }));
  verificationRegistry.checks.push({
    id: "capability-gap-render-dot",
    kind: "CAPABILITY_CONTENT_ASSERTION",
    path: "index.mjs",
    includes: failingSmoke
      ? "export const missingBehavior = true;"
      : 'export const render = () => "diagram";',
  });
  await mkdir(path.dirname(verificationRegistryPath), { recursive: true });
  await writeFile(
    verificationRegistryPath,
    `${JSON.stringify(verificationRegistry, null, 2)}\n`,
    "utf8",
  );
  const files = Object.entries(sources).map(([file, source]) => ({
    path: file,
    sha256: sha256(source),
  }));
  return {
      gap: {
        schemaVersion: 1,
        missingBehavior: "Render a deterministic Graphviz diagram from a DOT file.",
        taskEvidenceIds: ["task-output-contract"],
        requiredBehavior: {
          id: "render-dot-diagram",
          inputs: ["dot-file"],
          outputs: ["svg-diagram"],
          verificationIds: ["capability-gap-render-dot"],
        },
        trigger: {
          kind: "MISSING_REQUIRED_BEHAVIOR",
          behaviorId: "render-dot-diagram",
          status: "FAIL",
          evidenceIds: ["task-output-contract"],
        },
        existingCapabilitiesChecked: [{
          id: "project-runtime",
          evidenceId: "runtime-command-registry",
          reasonInsufficient: "No registered command renders DOT input.",
          missingBehaviorIds: ["render-dot-diagram"],
        }],
      },
      candidate: {
        schemaVersion: 1,
        id: "graphviz-renderer",
        kind: "CLI",
        provenance: "VERIFIED",
        source: "https://example.test/graphviz-renderer",
        license: "MIT",
        revision: "a".repeat(40),
        checksum: sha256(JSON.stringify(files)),
        permissions: ["project-read"],
        scripts: [],
        instructions: {
          status: "COMPATIBLE",
          evidenceId: "instruction-audit",
        },
        maintenance: { status: "MAINTAINED", evidenceId: "release-history" },
        conflicts: [],
        taskFit: {
          missingBehavior: "Render a deterministic Graphviz diagram from a DOT file.",
          requiredBehaviorId: "render-dot-diagram",
          evidenceIds: ["capability-gap-render-dot"],
        },
        requestedActions: {
          globalInstall: false,
          credentials: false,
          writeEnabledMcp: false,
          paidProbe: false,
        },
        stagedPath: ".engineering/capability-candidates/graphviz-renderer",
        files,
        smoke: {
          schemaVersion: 1,
          kind: "REGISTERED_CONTENT_ASSERTION",
          evidenceId: "capability-gap-render-dot",
        },
      },
  };
}

/** @param {Record<string, any>} request */
function registryEntryFor(request) {
  const candidate = request.candidate;
  return {
    id: candidate.id,
    kind: candidate.kind,
    source: candidate.source,
    revision: candidate.revision,
    checksum: candidate.checksum,
    files: candidate.files,
    installPath: `.engineering/capabilities/${candidate.id}`,
    smokeStatus: "PASS",
    qualification: {
      provenance: candidate.provenance,
      license: candidate.license,
      permissions: candidate.permissions,
      scripts: candidate.scripts,
      instructions: candidate.instructions,
      maintenance: candidate.maintenance,
      conflicts: candidate.conflicts,
      taskFit: candidate.taskFit,
    },
  };
}
