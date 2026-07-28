import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";
import { snapshotTree } from "../support/snapshot.mjs";
import { createRepairFailureReport } from "../../skills/engineering-loop/runtime/doctor-contracts.mjs";

const onboardingPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/onboard.mjs", import.meta.url),
);
const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);
const fixturePath = fileURLToPath(new URL("../fixtures/new-project", import.meta.url));
const standardFixturePath = fileURLToPath(new URL("../fixtures/standard-run", import.meta.url));
const deepFixturePath = fileURLToPath(new URL("../fixtures/deep-run", import.meta.url));

test("healthy Prepared Project diagnosis is READY and read-only", async () => {
  const prepared = await prepareTarget("healthy", true);
  try {
    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");

    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY");
    assert.equal(report.mutated, false);
    assert.deepEqual(report.diagnoses.map((/** @type {any} */ diagnosis) => diagnosis.kind), [
      "HEALTHY_PREPARED_PROJECT",
    ]);
    assert.ok(report.evidence.length >= 5);
    assert.ok(report.evidence.every((/** @type {any} */ entry) => entry.status === "PASS"));
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("Doctor validates installed capability files and rejects drift or links", async () => {
  const prepared = await prepareTarget("capability-drift", true);
  const capabilitiesRoot = path.join(
    prepared.target,
    ".engineering",
    "capabilities",
  );
  const installPath = path.join(capabilitiesRoot, "graphviz-renderer");
  const installedFile = path.join(installPath, "index.mjs");
  const source = 'export const render = () => "diagram";\n';
  const files = [{
    path: "index.mjs",
    sha256: createHash("sha256").update(source).digest("hex"),
  }];
  const registry = {
    schemaVersion: 1,
    entries: [{
      id: "graphviz-renderer",
      kind: "CLI",
      source: "https://example.test/graphviz-renderer",
      revision: "a".repeat(40),
      checksum: createHash("sha256")
        .update(JSON.stringify(files))
        .digest("hex"),
      files,
      installPath: ".engineering/capabilities/graphviz-renderer",
      smokeStatus: "PASS",
      qualification: {
        provenance: "VERIFIED",
        license: "MIT",
        permissions: ["project-read"],
        scripts: [],
        instructions: { status: "COMPATIBLE", evidenceId: "instruction-audit" },
        maintenance: { status: "MAINTAINED", evidenceId: "release-history" },
        conflicts: [],
        taskFit: {
          missingBehavior: "Render deterministic Graphviz output.",
          requiredBehaviorId: "render-dot-diagram",
          evidenceIds: ["capability-gap-render-dot"],
        },
      },
    }],
  };
  try {
    await mkdir(installPath);
    await writeFile(installedFile, source, "utf8");
    await writeJson(path.join(capabilitiesRoot, "registry.json"), registry);

    const healthy = await invokeDoctor(prepared.target);
    assert.equal(healthy.code, 0, `${healthy.stdout}\n${healthy.stderr}`);
    assert.ok(
      JSON.parse(healthy.stdout).evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "capability:graphviz-renderer" && entry.status === "PASS",
      ),
    );

    const coordinatedRegistry = structuredClone(registry);
    coordinatedRegistry.entries[0].files[0].sha256 = createHash("sha256")
      .update("tampered\n")
      .digest("hex");
    await writeFile(installedFile, "tampered\n", "utf8");
    await writeJson(
      path.join(capabilitiesRoot, "registry.json"),
      coordinatedRegistry,
    );
    const coordinatedTamper = await invokeDoctor(prepared.target);
    assert.equal(
      coordinatedTamper.code,
      1,
      `${coordinatedTamper.stdout}\n${coordinatedTamper.stderr}`,
    );
    assert.ok(
      JSON.parse(coordinatedTamper.stdout).evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "capability-registry-contract" &&
          entry.status === "INVALID",
      ),
    );

    await writeJson(path.join(capabilitiesRoot, "registry.json"), registry);
    await writeFile(installedFile, "tampered\n", "utf8");
    const drifted = await invokeDoctor(prepared.target);
    assert.equal(drifted.code, 1, `${drifted.stdout}\n${drifted.stderr}`);
    const driftedReport = JSON.parse(drifted.stdout);
    assert.equal(driftedReport.status, "BLOCKED");
    assert.ok(
      driftedReport.diagnoses.some(
        (/** @type {any} */ entry) => entry.kind === "CAPABILITY_DRIFT",
      ),
    );

    await rm(installPath, { recursive: true });
    const externalDirectory = path.join(prepared.sandbox, "external-capability");
    await mkdir(externalDirectory);
    await writeFile(path.join(externalDirectory, "index.mjs"), source, "utf8");
    await symlink(externalDirectory, installPath, "junction");
    const linked = await invokeDoctor(prepared.target);
    assert.equal(linked.code, 1, `${linked.stdout}\n${linked.stderr}`);
    assert.ok(
      JSON.parse(linked.stdout).evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "capability:graphviz-renderer" &&
          entry.status === "INVALID" &&
          entry.details.some((/** @type {string} */ detail) =>
            /symbolic link|not a regular directory/iu.test(detail),
          ),
      ),
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("legacy #18 Prepared Project remains READY without gaining automatic repair authority", async () => {
  const prepared = await prepareTarget("legacy-prepared-project", true);
  const manifestPath = path.join(prepared.target, ".engineering", "runtime", "manifest.json");
  const projectStatePath = path.join(prepared.target, ".engineering", "state", "project.json");
  const doctorPath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "doctor-contracts.mjs",
  );
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.schemaVersion = 1;
    manifest.runtimeVersion = "1.0.0";
    manifest.files = manifest.files
      .filter(
        (/** @type {any} */ entry) =>
          entry.path !== ".engineering/runtime/doctor-contracts.mjs",
      )
      .map((/** @type {any} */ entry) => ({
        path: entry.path,
        sha256: entry.sha256,
      }));
    await writeJson(manifestPath, manifest);
    await writeJson(projectStatePath, {
      schemaVersion: 1,
      status: "PREPARED_PROJECT",
      runtimeVersion: "1.0.0",
    });
    await unlink(doctorPath);
    await git(prepared.target, "add", ".engineering");
    await git(prepared.target, "commit", "-m", "fixture: legacy issue 18 runtime");

    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "runtime-manifest-contract" && entry.status === "PASS",
      ),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("forged Prepared Project smoke registration is blocking evidence", async () => {
  const prepared = await prepareTarget("forged-smoke-registration", true);
  const registryPath = path.join(
    prepared.target,
    ".engineering",
    "verification",
    "registry.json",
  );
  try {
    await writeJson(registryPath, {
      schemaVersion: 1,
      checks: [{ id: "prepared-project-smoke", command: "echo forged" }],
    });
    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "prepared-project-verification" && entry.status === "INVALID",
      ),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("registered Prepared Project smoke must execute successfully before READY", async () => {
  const prepared = await prepareTarget("failing-smoke-execution", true);
  const enginePath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "engine.mjs",
  );
  const manifestPath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "manifest.json",
  );
  try {
    const failingEngine = Buffer.from("process.exitCode = 7;\n", "utf8");
    await writeFile(enginePath, failingEngine);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const engineEntry = manifest.files.find(
      (/** @type {any} */ entry) =>
        entry.path === ".engineering/runtime/engine.mjs",
    );
    engineEntry.sha256 = createHash("sha256").update(failingEngine).digest("hex");
    await writeJson(manifestPath, manifest);
    await git(prepared.target, "add", ".engineering/runtime");
    await git(prepared.target, "commit", "-m", "fixture: failing registered smoke");

    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "prepared-project-verification" &&
          entry.status === "INVALID" &&
          entry.details.includes("registered smoke exited with code 7"),
      ),
      JSON.stringify(report, null, 2),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("registered smoke executable must be manifest-owned before execution", async () => {
  const prepared = await prepareTarget("unowned-smoke-executable", true);
  const enginePath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "engine.mjs",
  );
  const markerPath = path.join(prepared.target, ".engineering", "smoke-ran");
  const manifestPath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "manifest.json",
  );
  try {
    await writeFile(
      enginePath,
      'import { writeFileSync } from "node:fs";\n' +
        'writeFileSync(".engineering/smoke-ran", "executed\\n");\n',
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files = manifest.files.filter(
      (/** @type {any} */ entry) =>
        entry.path !== ".engineering/runtime/engine.mjs",
    );
    await writeJson(manifestPath, manifest);
    await git(prepared.target, "add", ".engineering/runtime");
    await git(prepared.target, "commit", "-m", "fixture: unowned smoke executable");

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "prepared-project-verification" &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "prepared-project-smoke executable is not pinned by the runtime manifest",
          ),
      ),
      JSON.stringify(report, null, 2),
    );
    await assert.rejects(readFile(markerPath));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test(
  "registered smoke uses the trusted launcher Node instead of a target shadow binary",
  { skip: process.platform !== "win32" },
  async () => {
    const prepared = await prepareTarget("shadow-node-executable", true);
    const shadowNodePath = path.join(prepared.target, "node.exe");
    try {
      await cp(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", shadowNodePath);
      const result = await invokeDoctor(prepared.target);
      assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).status, "READY");
    } finally {
      await rm(prepared.sandbox, { recursive: true, force: true });
    }
  },
);

test("repair failures return explicit BLOCKED evidence without a stack trace", () => {
  const report = createRepairFailureReport(
    {
      schemaVersion: 1,
      operation: "DIAGNOSE",
      status: "DEGRADED",
      terminal: true,
      mutated: false,
      evidence: [{ id: "runtime-manifest-contract", status: "PASS" }],
      diagnoses: [
        {
          kind: "CHECKSUM_DRIFT",
          path: ".engineering/runtime/engine.mjs",
          repairAction: "AUTOMATIC_REPAIR",
        },
      ],
    },
    [
      {
        path: ".engineering/runtime/engine.mjs",
        action: "RESTORE_GIT_BLOB",
        sourceRevision: "HEAD",
      },
    ],
    [".engineering/runtime/engine.mjs"],
    [],
    new Error("Repair verification failed after mutation"),
  );

  assert.equal(report.status, "BLOCKED");
  assert.equal(report.operation, "REPAIR");
  assert.equal(report.mutated, true);
  assert.deepEqual(report.repairs, [
    {
      path: ".engineering/runtime/engine.mjs",
      action: "RESTORE_GIT_BLOB",
      status: "FAIL",
    },
  ]);
  assert.deepEqual(report.evidence.at(-1), {
    id: "repair-execution",
    status: "INVALID",
    details: ["Repair verification failed after mutation"],
  });
  assert.deepEqual(report.blocker, {
    reason: "REPAIR_FAILED",
    evidenceIds: ["repair-execution"],
  });
  assert.equal(JSON.stringify(report).includes("stack"), false);
});

test("missing and drifted owned generated runtime files are repairable and dry-run is read-only", async () => {
  const prepared = await prepareTarget("owned-drift", true);
  const runtimePath = ".engineering/runtime/engine.mjs";
  const absoluteRuntimePath = path.join(prepared.target, ...runtimePath.split("/"));
  const original = await readFile(absoluteRuntimePath);
  try {
    await unlink(absoluteRuntimePath);
    const missing = await invokeDoctor(prepared.target);
    assert.equal(missing.code, 0, `${missing.stdout}\n${missing.stderr}`);
    const missingReport = JSON.parse(missing.stdout);
    assert.equal(missingReport.status, "DEGRADED");
    assert.deepEqual(
      missingReport.diagnoses.find(
        (/** @type {any} */ diagnosis) => diagnosis.path === runtimePath,
      ),
      {
        kind: "RUNTIME_FILE_MISSING",
        path: runtimePath,
        ownership: "PROJECT_RUNTIME",
        generated: true,
        protected: false,
        repairAction: "AUTOMATIC_REPAIR",
        evidenceIds: [
          `runtime-file:${runtimePath}`,
          `repair-path:${runtimePath}`,
          `repair-source:${runtimePath}`,
          `repair-transaction:${runtimePath}`,
        ],
      },
    );

    await writeFile(absoluteRuntimePath, "drifted runtime\n");
    const beforeDryRun = await snapshotTree(prepared.target);
    const dryRun = await invokeRepair(prepared.target, "--dry-run");
    assert.equal(dryRun.code, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
    const dryRunReport = JSON.parse(dryRun.stdout);
    assert.equal(dryRunReport.operation, "REPAIR_DRY_RUN");
    assert.equal(dryRunReport.status, "DEGRADED");
    assert.equal(dryRunReport.mutated, false);
    assert.deepEqual(dryRunReport.repairPlan, [
      {
        path: runtimePath,
        action: "RESTORE_GIT_BLOB",
        sourceRevision: "HEAD",
      },
    ]);
    assert.deepEqual(await snapshotTree(prepared.target), beforeDryRun);
    assert.notDeepEqual(await readFile(absoluteRuntimePath), original);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("explicit repair restores the manifest checksum and recomputes verification", async () => {
  const prepared = await prepareTarget("deterministic-repair", true);
  const runtimePath = ".engineering/runtime/engine.mjs";
  const absoluteRuntimePath = path.join(prepared.target, ...runtimePath.split("/"));
  const original = await readFile(absoluteRuntimePath);
  try {
    await writeFile(absoluteRuntimePath, "drifted runtime\n");
    const repaired = await invokeRepair(prepared.target);
    assert.equal(repaired.code, 0, `${repaired.stdout}\n${repaired.stderr}`);
    const report = JSON.parse(repaired.stdout);
    assert.equal(report.operation, "REPAIR");
    assert.equal(report.status, "READY");
    assert.equal(report.mutated, true);
    assert.deepEqual(report.repairs, [
      {
        path: runtimePath,
        action: "RESTORE_GIT_BLOB",
        status: "PASS",
      },
    ]);
    assert.equal(report.verification.status, "PASS");
    assert.ok(report.verification.evidenceIds.includes(`runtime-file:${runtimePath}`));
    assert.deepEqual(await readFile(absoluteRuntimePath), original);

    const manifest = JSON.parse(
      await readFile(
        path.join(prepared.target, ".engineering", "runtime", "manifest.json"),
        "utf8",
      ),
    );
    const entry = manifest.files.find(
      (/** @type {any} */ candidate) => candidate.path === runtimePath,
    );
    const runtimeEvidence = report.evidence.find(
      (/** @type {any} */ candidate) => candidate.id === `runtime-file:${runtimePath}`,
    );
    assert.equal(runtimeEvidence.status, "PASS");
    assert.equal(runtimeEvidence.actualSha256, entry.sha256);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("protected, user-owned, and local override drift is blocked without mutation", async () => {
  const prepared = await prepareTarget("protected-drift", true);
  const manifestPath = path.join(prepared.target, ".engineering", "runtime", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const policies = [
    {
      path: ".engineering/runtime/deep-contracts.mjs",
      ownership: "PROJECT_RUNTIME",
      generated: true,
      protected: true,
    },
    {
      path: ".engineering/runtime/fitness-contracts.mjs",
      ownership: "USER_OWNED",
      generated: false,
      protected: false,
    },
    {
      path: ".engineering/runtime/mode-policy.mjs",
      ownership: "LOCAL_OVERRIDE",
      generated: false,
      protected: false,
    },
  ];
  try {
    for (const policy of policies) {
      const entry = manifest.files.find(
        (/** @type {any} */ candidate) => candidate.path === policy.path,
      );
      Object.assign(entry, policy);
      delete entry.repair;
      await writeFile(
        path.join(prepared.target, ...policy.path.split("/")),
        `deliberate drift for ${policy.ownership}\n`,
      );
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const before = await Promise.all(
      policies.map((policy) =>
        readFile(path.join(prepared.target, ...policy.path.split("/"))),
      ),
    );

    const result = await invokeRepair(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mutated, false);
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "runtime-manifest-ownership" && entry.status === "INVALID",
      ),
    );
    assert.deepEqual(report.repairs, []);
    assert.equal(report.humanGate.required, true);
    assert.deepEqual(
      report.humanGate.paths,
      policies.map((policy) => policy.path).sort(),
    );
    for (const policy of policies) {
      const diagnosis = report.diagnoses.find(
        (/** @type {any} */ candidate) => candidate.path === policy.path,
      );
      assert.equal(diagnosis.kind, "RUNTIME_CHECKSUM_DRIFT");
      assert.equal(diagnosis.ownership, policy.ownership);
      assert.equal(diagnosis.repairAction, "HUMAN_GATE");
    }
    const after = await Promise.all(
      policies.map((policy) =>
        readFile(path.join(prepared.target, ...policy.path.split("/"))),
      ),
    );
    assert.deepEqual(after, before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("forged checkpoint hashes without Git and artifact proof never become resumable", async () => {
  const prepared = await prepareTarget("unfinished-run");
  const runId = "run-unfinished";
  const runRoot = path.join(prepared.target, ".engineering", "runs", runId);
  const baseCommit = "1".repeat(40);
  const firstCheckpoint = "2".repeat(40);
  try {
    await mkdir(runRoot);
    await writeJson(path.join(runRoot, "state.json"), {
      schemaVersion: 1,
      runId,
      mode: "STANDARD",
      branch: "run/standard/run-unfinished",
      baseCommit,
      currentState: "CHECKPOINT",
      terminal: false,
      history: [
        { sequence: 1, state: "CLASSIFIED", status: "COMPLETE" },
        { sequence: 2, state: "CHECKPOINT", status: "COMPLETE" },
      ],
    });
    await writeJson(path.join(runRoot, "ticket-graph.json"), {
      schemaVersion: 1,
      runId,
      requestHash: "3".repeat(64),
      branch: "run/standard/run-unfinished",
      baseCommit,
      executionOrder: ["TICKET-1"],
      tickets: [
        {
          id: "TICKET-1",
          dependencies: [],
          status: "COMPLETE",
          checkpointCommit: firstCheckpoint,
        },
        {
          id: "TICKET-2",
          dependencies: ["TICKET-1"],
          status: "OPEN",
          checkpointCommit: null,
        },
        {
          id: "TICKET-3",
          dependencies: ["TICKET-2"],
          status: "OPEN",
          checkpointCommit: null,
        },
      ],
    });
    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(
      report.diagnoses.some(
        (/** @type {any} */ diagnosis) => diagnosis.kind === "UNFINISHED_RUN",
      ),
      false,
    );
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-frontier:${runId}` &&
          entry.status === "INVALID" &&
          entry.details.some((/** @type {string} */ detail) =>
            detail.includes("Git checkpoint proof"),
          ),
      ),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);

    const malformedGraphPath = path.join(runRoot, "ticket-graph.json");
    const malformedGraph = JSON.parse(await readFile(malformedGraphPath, "utf8"));
    malformedGraph.reviewRounds = [null];
    malformedGraph.tickets[2].dependencies = null;
    await writeJson(malformedGraphPath, malformedGraph);
    const malformed = await invokeDoctor(prepared.target);
    assert.equal(malformed.code, 1, `${malformed.stdout}\n${malformed.stderr}`);
    const malformedReport = JSON.parse(malformed.stdout);
    assert.equal(malformedReport.status, "BLOCKED");
    assert.ok(
      malformedReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-frontier:${runId}` && entry.status === "INVALID",
      ),
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("remote sync problem is a separate evidence-backed diagnosis", async () => {
  const prepared = await prepareTarget("remote-sync-problem", true);
  const runId = "run-sync-blocked";
  const runRoot = path.join(prepared.target, ".engineering", "runs", runId);
  const baseCommit = await git(prepared.target, "rev-parse", "HEAD");
  try {
    await mkdir(runRoot);
    await writeJson(path.join(runRoot, "state.json"), {
      schemaVersion: 1,
      runId,
      mode: "STANDARD",
      branch: "develop",
      baseCommit,
      currentState: "HUMAN_GATE",
      terminal: false,
      history: [{ sequence: 1, state: "HUMAN_GATE", status: "COMPLETE" }],
    });
    await writeJson(path.join(runRoot, "ticket-graph.json"), {
      schemaVersion: 1,
      runId,
      requestHash: "5".repeat(64),
      branch: "develop",
      baseCommit,
      executionOrder: [],
      tickets: [
        {
          id: "TICKET-1",
          dependencies: [],
          status: "OPEN",
          checkpointCommit: null,
        },
      ],
    });
    await writeJson(path.join(runRoot, "remote-sync.json"), {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: "develop",
      status: "HUMAN_GATE",
      checkpoints: [],
      blocker: {
        reason: "REMOTE_DIVERGENCE",
        localHead: baseCommit,
        remoteHead: "7".repeat(40),
      },
    });
    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    const syncDiagnosis = report.diagnoses.find(
      (/** @type {any} */ diagnosis) => diagnosis.kind === "REMOTE_SYNC_PROBLEM",
    );
    assert.deepEqual(syncDiagnosis, {
      kind: "REMOTE_SYNC_PROBLEM",
      runId,
      ownership: "PROJECT_RUNTIME",
      repairAction: "HUMAN_GATE",
      remote: "origin",
      branch: "develop",
      reason: "REMOTE_DIVERGENCE",
      localHead: baseCommit,
      remoteHead: "7".repeat(40),
      evidenceIds: [`remote-sync:${runId}`],
    });
    assert.deepEqual(report.humanGate, {
      kind: "REMOTE_SYNC",
      required: true,
      approved: false,
      remote: "origin",
      branch: "develop",
      reason: "REMOTE_DIVERGENCE",
      localHead: baseCommit,
      remoteHead: "7".repeat(40),
    });
    assert.equal(report.blocker.reason, "REMOTE_DIVERGENCE");
    assert.deepEqual(await snapshotTree(prepared.target), before);

    const remoteSyncPath = path.join(runRoot, "remote-sync.json");
    const forged = JSON.parse(await readFile(remoteSyncPath, "utf8"));
    forged.blocker.localHead = "6".repeat(40);
    await writeJson(remoteSyncPath, forged);
    const forgedResult = await invokeDoctor(prepared.target);
    const forgedReport = JSON.parse(forgedResult.stdout);
    const forgedDiagnosis = forgedReport.diagnoses.find(
      (/** @type {any} */ diagnosis) => diagnosis.kind === "REMOTE_SYNC_PROBLEM",
    );
    assert.equal(forgedDiagnosis.reason, "REMOTE_SYNC_EVIDENCE_INVALID");
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("forged remote sync PASS without graph-ordered checkpoint evidence is a sync problem", async () => {
  const prepared = await prepareTarget("forged-sync-pass");
  const runId = "run-forged-sync";
  const runRoot = path.join(prepared.target, ".engineering", "runs", runId);
  const baseCommit = "8".repeat(40);
  try {
    await mkdir(runRoot);
    await writeJson(path.join(runRoot, "state.json"), {
      schemaVersion: 1,
      runId,
      mode: "STANDARD",
      branch: "run/standard/run-forged-sync",
      baseCommit,
      currentState: "CHECKPOINT",
      terminal: false,
      history: [{ sequence: 1, state: "CHECKPOINT", status: "COMPLETE" }],
    });
    await writeJson(path.join(runRoot, "ticket-graph.json"), {
      schemaVersion: 1,
      runId,
      requestHash: "9".repeat(64),
      branch: "run/standard/run-forged-sync",
      baseCommit,
      executionOrder: ["TICKET-1"],
      tickets: [
        {
          id: "TICKET-1",
          dependencies: [],
          status: "COMPLETE",
          checkpointCommit: "a".repeat(40),
        },
        {
          id: "TICKET-2",
          dependencies: ["TICKET-1"],
          status: "OPEN",
          checkpointCommit: null,
        },
      ],
    });
    await writeJson(path.join(runRoot, "remote-sync.json"), {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: "run/standard/run-forged-sync",
      status: "PASS",
      checkpoints: [
        {
          stage: "CHECKPOINT",
          status: "PASS",
          localHead: "a".repeat(40),
          remoteHead: "a".repeat(40),
        },
      ],
    });
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    const diagnosis = report.diagnoses.find(
      (/** @type {any} */ candidate) => candidate.kind === "REMOTE_SYNC_PROBLEM",
    );
    assert.equal(diagnosis.reason, "REMOTE_SYNC_EVIDENCE_INVALID");
    assert.deepEqual(diagnosis.evidenceIds, [`remote-sync:${runId}`]);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("missing required evidence is never diagnosed READY", async () => {
  const prepared = await prepareTarget("missing-evidence");
  const registryPath = path.join(
    prepared.target,
    ".engineering",
    "verification",
    "registry.json",
  );
  try {
    await unlink(registryPath);
    const before = await snapshotTree(prepared.target);
    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.notEqual(report.status, "READY");
    assert.ok(
      report.diagnoses.some(
        (/** @type {any} */ diagnosis) => diagnosis.kind === "MISSING_EVIDENCE",
      ),
    );
    assert.equal(report.blocker.reason, "RUNTIME_EVIDENCE_INSUFFICIENT");
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("working-tree ownership metadata without a committed manifest is never READY", async () => {
  const prepared = await prepareTarget("uncommitted-ownership", true);
  try {
    await git(
      prepared.target,
      "rm",
      "--cached",
      "--",
      ".engineering/runtime/manifest.json",
    );
    await git(prepared.target, "commit", "-m", "test: remove committed ownership proof");
    const before = await snapshotTree(prepared.target);

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "runtime-manifest-ownership" &&
          entry.status === "MISSING" &&
          entry.revision === "HEAD",
      ),
      JSON.stringify(report, null, 2),
    );
    assert.ok(
      report.diagnoses.some(
        (/** @type {any} */ diagnosis) => diagnosis.kind === "MISSING_EVIDENCE",
      ),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("hidden and forged terminal run entries are blocking evidence", async () => {
  const prepared = await prepareTarget("unsafe-run-store", true);
  const runsRoot = path.join(prepared.target, ".engineering", "runs");
  const externalRun = path.join(prepared.sandbox, "external-run");
  try {
    await mkdir(externalRun);
    await symlink(externalRun, path.join(runsRoot, "hidden-run"), "junction");
    const forgedRunRoot = path.join(runsRoot, "forged-terminal");
    await mkdir(forgedRunRoot);
    await writeJson(path.join(forgedRunRoot, "state.json"), {
      schemaVersion: 1,
      runId: "forged-terminal",
      mode: "STANDARD",
      branch: "develop",
      baseCommit: await git(prepared.target, "rev-parse", "HEAD"),
      currentState: "READY_FOR_HUMAN",
      terminal: true,
      history: [
        {
          sequence: 1,
          state: "READY_FOR_HUMAN",
          status: "COMPLETE",
        },
      ],
    });
    const before = await snapshotTree(prepared.target);

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "run-entry:hidden-run" && entry.status === "INVALID",
      ),
      JSON.stringify(report, null, 2),
    );
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "run-terminal:forged-terminal" &&
          entry.status === "INVALID",
      ),
      JSON.stringify(report, null, 2),
    );
    assert.deepEqual(await snapshotTree(prepared.target), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("terminal Remote Sync PASS requires readiness-stage durable evidence", async () => {
  const prepared = await prepareStandardTarget("terminal-sync-proof");
  try {
    const completed = await invokeRun(prepared.target, "standard-request.json");
    assert.equal(completed.code, 0, `${completed.stdout}\n${completed.stderr}`);
    const completedReport = JSON.parse(completed.stdout);
    assert.equal(completedReport.status, "READY_FOR_HUMAN");
    const runRoot = path.join(
      completedReport.run.worktree,
      ".engineering",
      "runs",
      completedReport.run.id,
    );
    const remoteSyncPath = path.join(runRoot, "remote-sync.json");
    const checkpointSync = {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: completedReport.run.branch,
      status: "PASS",
      checkpoints: completedReport.run.checkpointCommits.map(
        (/** @type {string} */ commit) => ({
          stage: "CHECKPOINT",
          status: "PASS",
          localHead: commit,
          remoteHead: commit,
        }),
      ),
    };
    await writeJson(remoteSyncPath, checkpointSync);
    await git(
      completedReport.run.worktree,
      "add",
      "--",
      `${completedReport.run.artifactPath}/remote-sync.json`,
    );
    await git(completedReport.run.worktree, "commit", "--amend", "--no-edit");
    await rm(remoteSyncPath);

    const missing = await invokeDoctor(prepared.target);
    assert.equal(missing.code, 1, `${missing.stdout}\n${missing.stderr}`);
    const missingReport = JSON.parse(missing.stdout);
    assert.ok(
      missingReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_SYNC_EVIDENCE_MISSING",
      ),
      JSON.stringify(missingReport, null, 2),
    );

    await writeJson(remoteSyncPath, checkpointSync);

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_SYNC_EVIDENCE_INVALID",
      ),
      JSON.stringify(report, null, 2),
    );
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `remote-sync:${completedReport.run.id}` &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "Remote Checkpoint Sync PASS lacks durable READY_FOR_HUMAN evidence",
          ),
      ),
      JSON.stringify(report, null, 2),
    );

    const graph = JSON.parse(await readFile(path.join(runRoot, "ticket-graph.json"), "utf8"));
    const state = JSON.parse(await readFile(path.join(runRoot, "state.json"), "utf8"));
    const readinessHead = await git(completedReport.run.worktree, "rev-parse", "HEAD");
    const humanGate = {
      schemaVersion: 1,
      id: "REMOTE-SYNC-REMOTE_DIVERGENCE",
      kind: "REMOTE_SYNC",
      status: "WAITING",
      requestHash: graph.requestHash,
      createdFromState: "READY_FOR_HUMAN",
      researchFactIds: [],
      question: {
        prompt: "How should divergent histories be reconciled?",
        recommendation: {
          answer: "inspect-and-reconcile",
          consequence: "Preserve both histories.",
        },
        alternatives: [],
      },
      answer: null,
      contextPaths: [],
    };
    state.currentState = "HUMAN_GATE";
    state.terminal = false;
    state.history.push({
      sequence: state.history.length + 1,
      state: "HUMAN_GATE",
      status: "COMPLETE",
    });
    await writeJson(path.join(runRoot, "human-gate.json"), humanGate);
    await writeJson(path.join(runRoot, "state.json"), state);
    await writeJson(path.join(runRoot, "result.json"), {
      schemaVersion: 1,
      status: "HUMAN_GATE",
      terminal: false,
      humanGate,
    });
    await writeJson(path.join(runRoot, "remote-sync.json"), {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: completedReport.run.branch,
      status: "HUMAN_GATE",
      checkpoints: completedReport.run.checkpointCommits.map(
        (/** @type {string} */ commit) => ({
          stage: "CHECKPOINT",
          status: "PASS",
          localHead: commit,
          remoteHead: commit,
        }),
      ),
      blocker: {
        reason: "REMOTE_DIVERGENCE",
        remote: "origin",
        branch: completedReport.run.branch,
        localHead: readinessHead,
        remoteHead: completedReport.run.checkpointCommits.at(-1),
      },
    });

    const gated = await invokeDoctor(prepared.target);
    assert.equal(gated.code, 1, `${gated.stdout}\n${gated.stderr}`);
    const gatedReport = JSON.parse(gated.stdout);
    assert.equal(gatedReport.status, "BLOCKED");
    assert.ok(
      gatedReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_DIVERGENCE" &&
          diagnosis.localHead === readinessHead,
      ),
      JSON.stringify(gatedReport, null, 2),
    );
    assert.ok(
      gatedReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "UNFINISHED_RUN" &&
          diagnosis.resumable === true &&
          diagnosis.gateKind === "REMOTE_SYNC" &&
          diagnosis.frontier[0] === `HUMAN_GATE:${humanGate.id}`,
      ),
      JSON.stringify(gatedReport, null, 2),
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("launcher-owned Doctor repairs a drifted target Doctor without executing it", async () => {
  const prepared = await prepareTarget("doctor-bootstrap", true);
  const doctorPath = path.join(
    prepared.target,
    ".engineering",
    "runtime",
    "doctor-contracts.mjs",
  );
  try {
    const originalDoctor = await readFile(doctorPath);
    const maliciousDoctor = 'throw new Error("drifted Doctor executed");\n';
    await writeFile(doctorPath, maliciousDoctor);
    const result = await invokeRepair(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "READY");
    assert.equal(report.mutated, true);
    assert.ok(
      report.preRepairDiagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "RUNTIME_CHECKSUM_DRIFT" &&
          diagnosis.path === ".engineering/runtime/doctor-contracts.mjs",
      ),
    );
    assert.deepEqual(await readFile(doctorPath), originalDoctor);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("valid graphless STANDARD decision gate remains an evidence-backed resumable frontier", async () => {
  const prepared = await prepareStandardTarget("decision-gate-doctor");
  try {
    const waiting = await invokeRun(prepared.target, "decision-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const waitingReport = JSON.parse(waiting.stdout);
    assert.equal(waitingReport.status, "HUMAN_GATE");

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "DEGRADED");
    const unfinished = report.diagnoses.find(
      (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
    );
    assert.deepEqual(unfinished, {
      kind: "UNFINISHED_RUN",
      runId: waitingReport.run.id,
      ownership: "PROJECT_RUNTIME",
      repairAction: "HUMAN_GATE",
      resumable: true,
      frontier: [`HUMAN_GATE:${waitingReport.humanGate.id}`],
      checkpointCommits: [],
      gateKind: "DECISION",
      gateId: waitingReport.humanGate.id,
      evidenceIds: [
        `run-state:${waitingReport.run.id}`,
        `run-human-gate:${waitingReport.run.id}`,
      ],
    });
    assert.deepEqual(report.humanGate, {
      kind: "RUN_RESUME",
      required: true,
      approved: false,
      runId: waitingReport.run.id,
      gateKind: "DECISION",
      gateId: waitingReport.humanGate.id,
    });
    assert.equal("blocker" in report, false);

    const runRoot = path.join(
      waitingReport.run.worktree,
      ".engineering",
      "runs",
      waitingReport.run.id,
    );
    const remoteSyncPath = path.join(runRoot, "remote-sync.json");
    await writeJson(remoteSyncPath, {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: waitingReport.run.branch,
      status: "PASS",
      checkpoints: [],
    });
    const forgedRemote = await invokeDoctor(prepared.target);
    assert.equal(forgedRemote.code, 1, `${forgedRemote.stdout}\n${forgedRemote.stderr}`);
    const forgedRemoteReport = JSON.parse(forgedRemote.stdout);
    assert.ok(
      forgedRemoteReport.diagnoses.some(
        (/** @type {any} */ candidate) =>
          candidate.kind === "REMOTE_SYNC_PROBLEM" &&
          candidate.reason === "REMOTE_SYNC_EVIDENCE_INVALID",
      ),
      JSON.stringify(forgedRemoteReport, null, 2),
    );
    assert.ok(
      forgedRemoteReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `remote-sync:${waitingReport.run.id}` &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "Remote Checkpoint Sync PASS lacks durable Human Gate evidence",
          ),
      ),
      JSON.stringify(forgedRemoteReport, null, 2),
    );
    await rm(remoteSyncPath, { force: true });

    const originalState = await readFile(path.join(runRoot, "state.json"));
    const originalHumanGate = await readFile(path.join(runRoot, "human-gate.json"));
    const originalResult = await readFile(path.join(runRoot, "result.json"));
    const durableHumanGateHead = await git(waitingReport.run.worktree, "rev-parse", "HEAD");
    const remoteGate = {
      schemaVersion: 1,
      id: "REMOTE-SYNC-REMOTE_DIVERGENCE",
      kind: "REMOTE_SYNC",
      status: "WAITING",
      requestHash: JSON.parse(originalHumanGate.toString("utf8")).requestHash,
      createdFromState: "HUMAN_GATE",
      researchFactIds: [],
      question: {
        prompt: "How should the Human Gate sync divergence be reconciled?",
        recommendation: {
          answer: "inspect-and-reconcile",
          consequence: "Preserve both histories.",
        },
        alternatives: [],
      },
      answer: null,
      contextPaths: [],
    };
    const remoteState = JSON.parse(originalState.toString("utf8"));
    remoteState.history.push({
      sequence: remoteState.history.length + 1,
      state: "HUMAN_GATE",
      status: "COMPLETE",
    });
    await writeJson(path.join(runRoot, "human-gate.json"), remoteGate);
    await writeJson(path.join(runRoot, "state.json"), remoteState);
    await writeJson(path.join(runRoot, "result.json"), {
      schemaVersion: 1,
      status: "HUMAN_GATE",
      terminal: false,
      humanGate: remoteGate,
    });
    await writeJson(remoteSyncPath, {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: waitingReport.run.branch,
      status: "HUMAN_GATE",
      checkpoints: [],
      blocker: {
        reason: "REMOTE_DIVERGENCE",
        remote: "origin",
        branch: waitingReport.run.branch,
        localHead: durableHumanGateHead,
        remoteHead: waitingReport.run.baseCommit,
      },
    });
    const remoteGateResult = await invokeDoctor(prepared.target);
    assert.equal(
      remoteGateResult.code,
      1,
      `${remoteGateResult.stdout}\n${remoteGateResult.stderr}`,
    );
    const remoteGateReport = JSON.parse(remoteGateResult.stdout);
    assert.ok(
      remoteGateReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_DIVERGENCE" &&
          diagnosis.localHead === durableHumanGateHead,
      ),
      JSON.stringify(remoteGateReport, null, 2),
    );
    assert.ok(
      remoteGateReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "UNFINISHED_RUN" &&
          diagnosis.resumable === true &&
          diagnosis.frontier[0] === `HUMAN_GATE:${remoteGate.id}`,
      ),
      JSON.stringify(remoteGateReport, null, 2),
    );
    await writeFile(path.join(runRoot, "state.json"), originalState);
    await writeFile(path.join(runRoot, "human-gate.json"), originalHumanGate);
    await writeFile(path.join(runRoot, "result.json"), originalResult);
    await rm(remoteSyncPath, { force: true });

    const researchPath = path.join(runRoot, "research.json");
    const originalResearch = await readFile(researchPath);
    await writeFile(researchPath, "{\"schemaVersion\":1}\n");
    const corrupted = await invokeDoctor(prepared.target);
    assert.equal(corrupted.code, 1, `${corrupted.stdout}\n${corrupted.stderr}`);
    const corruptedReport = JSON.parse(corrupted.stdout);
    assert.equal(
      corruptedReport.diagnoses.some(
        (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
      ),
      false,
    );
    assert.ok(
      corruptedReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-human-gate:${waitingReport.run.id}` &&
          entry.status === "INVALID" &&
          entry.details.some((/** @type {string} */ detail) =>
            detail.includes("research.json"),
          ),
      ),
    );

    await writeFile(researchPath, originalResearch);
    const statePath = path.join(runRoot, "state.json");
    const forgedState = JSON.parse(await readFile(statePath, "utf8"));
    forgedState.mode = "FAKE";
    await writeJson(statePath, forgedState);
    const forged = await invokeDoctor(prepared.target);
    assert.equal(forged.code, 1, `${forged.stdout}\n${forged.stderr}`);
    const forgedReport = JSON.parse(forged.stdout);
    assert.equal(
      forgedReport.diagnoses.some(
        (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
      ),
      false,
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("valid DEEP migration manifest gate is reported as a resumable Human Gate", async () => {
  const prepared = await prepareDeepTarget("manifest-gate-doctor");
  try {
    const waiting = await invokeRun(prepared.target, "deep-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const waitingReport = JSON.parse(waiting.stdout);
    assert.equal(waitingReport.humanGate.kind, "MIGRATION_MANIFEST");

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "DEGRADED");
    const unfinished = report.diagnoses.find(
      (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
    );
    assert.ok(unfinished, JSON.stringify(report, null, 2));
    assert.equal(unfinished.runId, waitingReport.run.id);
    assert.equal(unfinished.resumable, true);
    assert.deepEqual(unfinished.frontier, [
      `HUMAN_GATE:${waitingReport.humanGate.id}`,
    ]);
    assert.equal(unfinished.gateKind, "MIGRATION_MANIFEST");
    assert.deepEqual(report.humanGate, {
      kind: "RUN_RESUME",
      required: true,
      approved: false,
      runId: waitingReport.run.id,
      gateKind: "MIGRATION_MANIFEST",
      gateId: waitingReport.humanGate.id,
    });

    const runRoot = path.join(
      waitingReport.run.worktree,
      ".engineering",
      "runs",
      waitingReport.run.id,
    );
    const migrationManifestPath = path.join(runRoot, "migration-manifest.json");
    const migrationManifestProjectPath =
      `${waitingReport.run.artifactPath}/migration-manifest.json`;
    const originalManifest = await readFile(migrationManifestPath);
    const unrelatedManifest = JSON.parse(originalManifest.toString("utf8"));
    unrelatedManifest.hash = "0".repeat(64);
    await writeJson(migrationManifestPath, unrelatedManifest);
    await git(waitingReport.run.worktree, "add", "--", migrationManifestProjectPath);
    await git(waitingReport.run.worktree, "commit", "--amend", "--no-edit");
    const unrelated = await invokeDoctor(prepared.target);
    assert.equal(unrelated.code, 1, `${unrelated.stdout}\n${unrelated.stderr}`);
    const unrelatedReport = JSON.parse(unrelated.stdout);
    assert.equal(
      unrelatedReport.diagnoses.some(
        (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
      ),
      false,
    );
    assert.ok(
      unrelatedReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-human-gate:${waitingReport.run.id}` &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "required Run Artifact semantic contract is invalid: migration-manifest.json",
          ),
      ),
      JSON.stringify(unrelatedReport, null, 2),
    );
    await writeFile(migrationManifestPath, originalManifest);
    await git(waitingReport.run.worktree, "add", "--", migrationManifestProjectPath);
    await git(waitingReport.run.worktree, "commit", "--amend", "--no-edit");

    const deepRemoteSyncPath = path.join(runRoot, "remote-sync.json");
    await writeJson(deepRemoteSyncPath, {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: waitingReport.run.branch,
      status: "PENDING",
      checkpoints: [],
    });
    await git(
      waitingReport.run.worktree,
      "add",
      "--",
      `${waitingReport.run.artifactPath}/remote-sync.json`,
    );
    await git(waitingReport.run.worktree, "commit", "--amend", "--no-edit");
    const syncedGateHead = await git(waitingReport.run.worktree, "rev-parse", "HEAD");
    await writeJson(deepRemoteSyncPath, {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: waitingReport.run.branch,
      status: "PASS",
      checkpoints: [],
      humanGate: {
        stage: "HUMAN_GATE",
        status: "PASS",
        localHead: syncedGateHead,
        remoteHead: syncedGateHead,
      },
    });
    const syncedGate = await invokeDoctor(prepared.target);
    assert.equal(syncedGate.code, 0, `${syncedGate.stdout}\n${syncedGate.stderr}`);
    const syncedGateReport = JSON.parse(syncedGate.stdout);
    assert.ok(
      syncedGateReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "UNFINISHED_RUN" &&
          diagnosis.resumable === true &&
          diagnosis.gateKind === "MIGRATION_MANIFEST",
      ),
      JSON.stringify(syncedGateReport, null, 2),
    );
    assert.ok(
      syncedGateReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `remote-sync:${waitingReport.run.id}` &&
          entry.status === "PASS",
      ),
      JSON.stringify(syncedGateReport, null, 2),
    );

    const humanGate = JSON.parse(await readFile(path.join(runRoot, "human-gate.json"), "utf8"));
    humanGate.status = "ANSWERED";
    humanGate.answer = { value: humanGate.manifestHash };
    const state = JSON.parse(await readFile(path.join(runRoot, "state.json"), "utf8"));
    state.currentState = "MANIFEST_APPROVED";
    state.history.push({
      sequence: state.history.length + 1,
      state: "MANIFEST_APPROVED",
      status: "COMPLETE",
    });
    await writeJson(path.join(runRoot, "human-gate.json"), humanGate);
    await writeJson(path.join(runRoot, "manifest-approval.json"), {
      schemaVersion: 1,
      manifestHash: humanGate.manifestHash,
      approved: true,
    });
    await writeJson(path.join(runRoot, "state.json"), state);
    await rm(path.join(runRoot, "result.json"), { force: true });
    await git(
      waitingReport.run.worktree,
      "add",
      "--",
      `.engineering/runs/${waitingReport.run.id}`,
    );
    await git(
      waitingReport.run.worktree,
      "commit",
      "-m",
      `chore: record DEEP Migration Manifest approval (${waitingReport.run.id})`,
    );

    const approvalResult = await invokeDoctor(prepared.target);
    assert.equal(approvalResult.code, 0, `${approvalResult.stdout}\n${approvalResult.stderr}`);
    const approvalReport = JSON.parse(approvalResult.stdout);
    const approvalRun = approvalReport.diagnoses.find(
      (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
    );
    assert.equal(approvalReport.status, "DEGRADED");
    assert.equal(approvalRun.repairAction, "RESUME");
    assert.deepEqual(approvalRun.frontier, ["APPROVAL_CHECKPOINT"]);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("duplicate run IDs across registered worktrees are explicit blocking evidence", async () => {
  const prepared = await prepareStandardTarget("duplicate-run-evidence");
  try {
    const waiting = await invokeRun(prepared.target, "decision-request.json");
    assert.equal(waiting.code, 1, `${waiting.stdout}\n${waiting.stderr}`);
    const waitingReport = JSON.parse(waiting.stdout);
    const runId = waitingReport.run.id;
    const sourceRunRoot = path.join(
      waitingReport.run.worktree,
      ".engineering",
      "runs",
      runId,
    );
    const duplicateRunRoot = path.join(prepared.target, ".engineering", "runs", runId);
    await cp(sourceRunRoot, duplicateRunRoot, { recursive: true });

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-duplicate:${runId}` && entry.status === "INVALID",
      ),
    );
    assert.deepEqual(
      report.diagnoses.find(
        (/** @type {any} */ diagnosis) => diagnosis.kind === "DUPLICATE_RUN_EVIDENCE",
      ),
      {
        kind: "DUPLICATE_RUN_EVIDENCE",
        runId,
        path: `.engineering/runs/${runId}`,
        ownership: "PROJECT_RUNTIME",
        repairAction: "HUMAN_GATE",
        evidenceIds: [`run-duplicate:${runId}`],
      },
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("an inaccessible registered worktree is missing evidence and never READY", async () => {
  const prepared = await prepareTarget("missing-worktree-evidence", true);
  const missingWorktree = path.join(prepared.sandbox, "registered-but-missing");
  try {
    await git(
      prepared.target,
      "worktree",
      "add",
      "-b",
      "fixture/missing-worktree-evidence",
      missingWorktree,
    );
    await rm(missingWorktree, { recursive: true, force: true });

    const result = await invokeDoctor(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.path === ".engineering/runs" &&
          entry.worktree === missingWorktree &&
          entry.status === "MISSING",
      ),
      JSON.stringify(report, null, 2),
    );
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("automatic repair rejects a symlinked runtime ancestor and preserves external content", async () => {
  const prepared = await prepareTarget("symlink-confinement", true);
  const runtimeRoot = path.join(prepared.target, ".engineering", "runtime");
  const externalRuntime = path.join(prepared.sandbox, "external-runtime");
  const externalEngine = path.join(externalRuntime, "engine.mjs");
  try {
    await cp(runtimeRoot, externalRuntime, { recursive: true });
    await rm(runtimeRoot, { recursive: true });
    await symlink(externalRuntime, runtimeRoot, "junction");
    await writeFile(externalEngine, "external drift must survive\n");
    const before = await readFile(externalEngine);

    const result = await invokeRepair(prepared.target);
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.mutated, false);
    const diagnosis = report.diagnoses.find(
      (/** @type {any} */ candidate) =>
        candidate.path === ".engineering/runtime/engine.mjs",
    );
    assert.equal(diagnosis.repairAction, "HUMAN_GATE");
    assert.ok(
      report.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === "repair-path:.engineering/runtime/engine.mjs" &&
          entry.status === "INVALID",
      ),
    );
    assert.deepEqual(await readFile(externalEngine), before);
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

test("repair preserves a real STANDARD frontier and resume continues without chat history", async () => {
  const prepared = await prepareStandardTarget("repair-resume");
  const runtimePath = ".engineering/runtime/engine.mjs";
  const absoluteRuntimePath = path.join(prepared.target, ...runtimePath.split("/"));
  try {
    const interrupted = await invokeRun(prepared.target, "restart-request.json");
    assert.notEqual(interrupted.code, 0);
    const worktreeOutput = await git(prepared.target, "worktree", "list", "--porcelain");
    const interruptedWorktree = worktreeOutput
      .split(/\r?\n/u)
      .filter((/** @type {string} */ line) => line.startsWith("worktree "))
      .map((/** @type {string} */ line) => line.slice("worktree ".length))
      .find(
        (/** @type {string} */ candidate) =>
          path.resolve(candidate) !== path.resolve(prepared.target),
      );
    assert.ok(interruptedWorktree, worktreeOutput);
    const runIds = (
      await readdir(path.join(interruptedWorktree, ".engineering", "runs"))
    ).filter((entry) => entry !== ".gitkeep");
    assert.equal(runIds.length, 1);
    const interruptedRunId = runIds[0];
    const graphPath = path.join(
      interruptedWorktree,
      ".engineering",
      "runs",
      interruptedRunId,
      "ticket-graph.json",
    );
    const interruptedRunRoot = path.dirname(graphPath);
    const originalGraph = await readFile(graphPath);
    const originalState = await readFile(path.join(interruptedRunRoot, "state.json"));
    const checkpointGraph = JSON.parse(originalGraph.toString("utf8"));
    const checkpointHead = await git(interruptedWorktree, "rev-parse", "HEAD");
    const checkpointGate = {
      schemaVersion: 1,
      id: "REMOTE-SYNC-REMOTE_SYNC_REJECTED",
      kind: "REMOTE_SYNC",
      status: "WAITING",
      requestHash: checkpointGraph.requestHash,
      createdFromState: "CHECKPOINT",
      researchFactIds: [],
      question: {
        prompt: "How should the checkpoint sync failure be reconciled?",
        recommendation: {
          answer: "inspect-and-reconcile",
          consequence: "Preserve the durable checkpoint.",
        },
        alternatives: [],
      },
      answer: null,
      contextPaths: [],
    };
    const checkpointState = JSON.parse(originalState.toString("utf8"));
    checkpointState.currentState = "HUMAN_GATE";
    checkpointState.history.push({
      sequence: checkpointState.history.length + 1,
      state: "HUMAN_GATE",
      status: "COMPLETE",
    });
    await writeJson(path.join(interruptedRunRoot, "human-gate.json"), checkpointGate);
    await writeJson(path.join(interruptedRunRoot, "state.json"), checkpointState);
    await writeJson(path.join(interruptedRunRoot, "result.json"), {
      schemaVersion: 1,
      status: "HUMAN_GATE",
      terminal: false,
      humanGate: checkpointGate,
    });
    const checkpointRemoteSync = {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: checkpointGraph.branch,
      status: "HUMAN_GATE",
      checkpoints: checkpointGraph.executionOrder.map(
        (/** @type {string} */ ticketId) => {
          const commit = checkpointGraph.tickets.find(
            (/** @type {any} */ ticket) => ticket.id === ticketId,
          ).checkpointCommit;
          return {
            stage: "CHECKPOINT",
            status: "PASS",
            localHead: commit,
            remoteHead: commit,
          };
        },
      ),
      blocker: {
        reason: "REMOTE_SYNC_REJECTED",
        remote: "origin",
        branch: checkpointGraph.branch,
        localHead: checkpointHead,
        remoteHead: null,
      },
    };
    await writeJson(
      path.join(interruptedRunRoot, "remote-sync.json"),
      checkpointRemoteSync,
    );
    const checkpointGateResult = await invokeDoctor(prepared.target);
    assert.equal(
      checkpointGateResult.code,
      1,
      `${checkpointGateResult.stdout}\n${checkpointGateResult.stderr}`,
    );
    const checkpointGateReport = JSON.parse(checkpointGateResult.stdout);
    assert.ok(
      checkpointGateReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_SYNC_REJECTED" &&
          diagnosis.localHead === checkpointHead,
      ),
      JSON.stringify(checkpointGateReport, null, 2),
    );
    assert.ok(
      checkpointGateReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "UNFINISHED_RUN" &&
          diagnosis.resumable === true &&
          diagnosis.frontier[0] === `HUMAN_GATE:${checkpointGate.id}`,
      ),
      JSON.stringify(checkpointGateReport, null, 2),
    );
    await rm(path.join(interruptedRunRoot, "remote-sync.json"), { force: true });
    const missingGateSync = await invokeDoctor(prepared.target);
    assert.equal(missingGateSync.code, 1, `${missingGateSync.stdout}\n${missingGateSync.stderr}`);
    const missingGateSyncReport = JSON.parse(missingGateSync.stdout);
    assert.ok(
      missingGateSyncReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_SYNC_EVIDENCE_MISSING",
      ),
      JSON.stringify(missingGateSyncReport, null, 2),
    );

    await writeFile(path.join(interruptedRunRoot, "state.json"), originalState);
    await rm(path.join(interruptedRunRoot, "human-gate.json"), { force: true });
    await rm(path.join(interruptedRunRoot, "result.json"), { force: true });
    await rm(path.join(interruptedRunRoot, "remote-sync.json"), { force: true });

    await writeJson(path.join(interruptedRunRoot, "remote-sync.json"), {
      schemaVersion: 1,
      enabled: true,
      remote: "origin",
      branch: checkpointGraph.branch,
      status: "PENDING",
      checkpoints: [],
    });
    await git(
      interruptedWorktree,
      "add",
      "--",
      `${path.relative(interruptedWorktree, interruptedRunRoot).replaceAll("\\", "/")}/remote-sync.json`,
    );
    await git(interruptedWorktree, "commit", "--amend", "--no-edit");
    const syncEnabledCheckpointHead = await git(interruptedWorktree, "rev-parse", "HEAD");
    const syncEnabledGraph = JSON.parse(originalGraph.toString("utf8"));
    syncEnabledGraph.tickets.find(
      (/** @type {any} */ ticket) => ticket.id === "TICKET-1",
    ).checkpointCommit = syncEnabledCheckpointHead;
    await writeJson(graphPath, syncEnabledGraph);
    await rm(path.join(interruptedRunRoot, "remote-sync.json"), { force: true });
    const missingCheckpointSync = await invokeDoctor(prepared.target);
    assert.equal(
      missingCheckpointSync.code,
      1,
      `${missingCheckpointSync.stdout}\n${missingCheckpointSync.stderr}`,
    );
    const missingCheckpointSyncReport = JSON.parse(missingCheckpointSync.stdout);
    assert.ok(
      missingCheckpointSyncReport.diagnoses.some(
        (/** @type {any} */ diagnosis) =>
          diagnosis.kind === "REMOTE_SYNC_PROBLEM" &&
          diagnosis.reason === "REMOTE_SYNC_EVIDENCE_MISSING" &&
          diagnosis.localHead === syncEnabledCheckpointHead,
      ),
      JSON.stringify(missingCheckpointSyncReport, null, 2),
    );
    await git(interruptedWorktree, "reset", "--hard", checkpointHead);
    await writeFile(graphPath, originalGraph);
    await writeFile(path.join(interruptedRunRoot, "state.json"), originalState);

    const tamperedGraph = JSON.parse(originalGraph.toString("utf8"));
    tamperedGraph.tickets.find(
      (/** @type {any} */ ticket) => ticket.id === "TICKET-2",
    ).writeLease = ["src/outside-durable-plan.mjs"];
    await writeJson(graphPath, tamperedGraph);
    const tampered = await invokeDoctor(prepared.target);
    assert.equal(tampered.code, 1, `${tampered.stdout}\n${tampered.stderr}`);
    const tamperedReport = JSON.parse(tampered.stdout);
    assert.equal(tamperedReport.status, "BLOCKED");
    assert.equal(
      tamperedReport.diagnoses.some(
        (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
      ),
      false,
    );
    assert.ok(
      tamperedReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-frontier:${interruptedRunId}` &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "current ticket graph is not bound to the latest durable checkpoint plan",
          ),
      ),
      JSON.stringify(tamperedReport, null, 2),
    );
    await writeFile(graphPath, originalGraph);

    const advisorRoundsPath = path.join(interruptedRunRoot, "advisor-rounds.json");
    const originalAdvisorRounds = await readFile(advisorRoundsPath);
    const tamperedAdvisorRounds = JSON.parse(originalAdvisorRounds.toString("utf8"));
    tamperedAdvisorRounds.rounds.at(-1).status = "REVISE";
    tamperedAdvisorRounds.rounds.at(-1).concerns = [{
      id: "advisor-finding-001",
      code: "UNMAPPED_ACCEPTANCE",
      message: "Forged unresolved finding.",
      ticketId: "TICKET-1",
      evidenceIds: ["acceptance-criterion-AC-1"],
    }];
    await writeJson(advisorRoundsPath, tamperedAdvisorRounds);
    const tamperedAdvisorAudit = await invokeDoctor(prepared.target);
    assert.equal(
      tamperedAdvisorAudit.code,
      1,
      `${tamperedAdvisorAudit.stdout}\n${tamperedAdvisorAudit.stderr}`,
    );
    const tamperedAdvisorAuditReport = JSON.parse(tamperedAdvisorAudit.stdout);
    assert.ok(
      tamperedAdvisorAuditReport.evidence.some(
        (/** @type {any} */ entry) =>
          entry.id === `run-frontier:${interruptedRunId}` &&
          entry.status === "INVALID" &&
          entry.details.includes(
            "required Run Artifact semantic contract is invalid: advisor-rounds.json",
          ),
      ),
      JSON.stringify(tamperedAdvisorAuditReport, null, 2),
    );
    await writeFile(advisorRoundsPath, originalAdvisorRounds);

    await writeFile(absoluteRuntimePath, "drifted runtime before resume\n");
    const diagnosis = await invokeDoctor(prepared.target);
    assert.equal(diagnosis.code, 0, `${diagnosis.stdout}\n${diagnosis.stderr}`);
    const diagnosisReport = JSON.parse(diagnosis.stdout);
    assert.equal(diagnosisReport.status, "DEGRADED");
    assert.ok(
      diagnosisReport.diagnoses.some(
        (/** @type {any} */ candidate) =>
          candidate.kind === "RUNTIME_CHECKSUM_DRIFT" && candidate.path === runtimePath,
      ),
    );
    const unfinished = diagnosisReport.diagnoses.find(
      (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
    );
    assert.deepEqual(unfinished.frontier, ["TICKET-2", "TICKET-3"]);

    const repaired = await invokeRepair(prepared.target);
    assert.equal(repaired.code, 0, `${repaired.stdout}\n${repaired.stderr}`);
    const repairReport = JSON.parse(repaired.stdout);
    assert.equal(repairReport.status, "DEGRADED");
    assert.equal(repairReport.verification.status, "PASS");
    assert.deepEqual(
      repairReport.diagnoses.find(
        (/** @type {any} */ candidate) => candidate.kind === "UNFINISHED_RUN",
      ).frontier,
      ["TICKET-2", "TICKET-3"],
    );

    const resumed = await invokeRun(prepared.target, "restart-request.json");
    assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
    const report = JSON.parse(resumed.stdout);
    assert.equal(report.status, "READY_FOR_HUMAN");
    assert.deepEqual(report.executionOrder, ["TICKET-1", "TICKET-2", "TICKET-3"]);
    assert.ok(report.stateHistory.some((/** @type {any} */ entry) => entry.state === "RESUMED"));
  } finally {
    await rm(prepared.sandbox, { recursive: true, force: true });
  }
});

/** @param {string} label @param {boolean} [initializeGit] */
async function prepareTarget(label, initializeGit = false) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-doctor-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(fixturePath, target, { recursive: true });
  const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  if (initializeGit) {
    await git(target, "init", "-b", "develop");
    await git(target, "config", "user.email", "doctor@example.test");
    await git(target, "config", "user.name", "Runtime Doctor Test");
    await git(target, "add", ".");
    await git(target, "commit", "-m", "fixture: prepare project");
  }
  return { sandbox, target };
}

/** @param {string} label */
async function prepareStandardTarget(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-doctor-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(standardFixturePath, target, { recursive: true });
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Runtime Doctor Test");
  await git(target, "config", "user.email", "doctor@example.test");
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
  return { sandbox, target };
}

/** @param {string} label */
async function prepareDeepTarget(label) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), `engineering-loop-doctor-${label}-`));
  const target = path.join(sandbox, "target");
  await cp(deepFixturePath, target, { recursive: true });
  await git(target, "init", "--initial-branch=develop");
  await git(target, "config", "core.autocrlf", "false");
  await git(target, "config", "user.name", "Runtime Doctor Test");
  await git(target, "config", "user.email", "doctor@example.test");
  await git(target, "add", ".");
  await git(target, "commit", "-m", "fixture: add DEEP project");
  const onboarding = await runProcess(process.execPath, [onboardingPath, "--target", target]);
  assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
  await cp(
    path.join(target, "verification-registry.json"),
    path.join(target, ".engineering", "verification", "registry.json"),
  );
  await git(target, "add", ".engineering");
  await git(target, "commit", "-m", "fixture: prepare runtime");
  await git(target, "branch", "main");
  return { sandbox, target };
}

/** @param {string} target @param {string[]} args */
async function invokeDoctor(target, ...args) {
  return runProcess(process.execPath, [
    launcherPath,
    "--explicit",
    "--doctor",
    "--target",
    target,
    ...args,
  ]);
}

/** @param {string} target @param {string[]} args */
async function invokeRepair(target, ...args) {
  return runProcess(process.execPath, [
    launcherPath,
    "--explicit",
    "--repair",
    "--target",
    target,
    ...args,
  ]);
}

/** @param {string} target @param {string} requestPath */
function invokeRun(target, requestPath) {
  return runProcess(
    process.execPath,
    [
      path.join(target, ".engineering", "runtime", "engine.mjs"),
      "--run-request",
      requestPath,
    ],
    { cwd: target },
  );
}

/** @param {string} cwd @param {string[]} args */
async function git(cwd, ...args) {
  const result = await runProcess("git", args, { cwd });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

/** @param {string} file @param {unknown} value */
async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
