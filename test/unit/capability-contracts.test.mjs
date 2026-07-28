import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCapabilityCandidate,
  validateCapabilityGap,
} from "../../skills/engineering-loop/runtime/capability-contracts.mjs";

const gap = {
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
  existingCapabilitiesChecked: [
    {
      id: "project-runtime",
      evidenceId: "runtime-command-registry",
      reasonInsufficient: "No registered command renders DOT input.",
      missingBehaviorIds: ["render-dot-diagram"],
    },
    {
      id: "project-dependencies",
      evidenceId: "package-lock-inspection",
      reasonInsufficient: "No installed dependency provides Graphviz rendering.",
      missingBehaviorIds: ["render-dot-diagram"],
    },
  ],
};

const candidate = {
  schemaVersion: 1,
  id: "graphviz-renderer",
  kind: "CLI",
  provenance: "VERIFIED",
  source: "https://example.test/graphviz-renderer",
  license: "MIT",
  revision: "a".repeat(40),
  checksum: "b".repeat(64),
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
    missingBehavior: gap.missingBehavior,
    requiredBehaviorId: gap.requiredBehavior.id,
    evidenceIds: ["candidate-smoke-contract"],
  },
  requestedActions: {
    globalInstall: false,
    credentials: false,
    writeEnabledMcp: false,
    paidProbe: false,
  },
};

test("capability discovery requires a concrete evidence-bound gap", () => {
  assert.deepEqual(validateCapabilityGap(gap), gap);
  for (const invalid of [
    { ...gap, missingBehavior: "Use a fashionable tool." },
    { ...gap, taskEvidenceIds: [] },
    { ...gap, existingCapabilitiesChecked: [] },
    {
      ...gap,
      existingCapabilitiesChecked: [
        { id: "project-runtime", evidenceId: "runtime-check", reasonInsufficient: "No fit." },
      ],
    },
    {
      ...gap,
      existingCapabilitiesChecked: [
        {
          id: "project-runtime",
          evidenceId: "",
          reasonInsufficient: "Not modern enough.",
          missingBehaviorIds: ["render-dot-diagram"],
        },
      ],
    },
    {
      ...gap,
      missingBehavior: "Install another tool because we would like to try it.",
      trigger: { ...gap.trigger, status: "PASS" },
    },
  ]) {
    assert.throws(
      () => validateCapabilityGap(invalid),
      /capability gap/iu,
    );
  }
});

test("candidate qualification requires complete supply-chain and task-fit evidence", () => {
  assert.deepEqual(evaluateCapabilityCandidate(gap, candidate), {
    status: "QUALIFIED",
    findings: [],
    humanGate: null,
  });

  for (const field of [
    "provenance",
    "source",
    "license",
    "revision",
    "checksum",
    "permissions",
    "scripts",
    "instructions",
    "maintenance",
    "conflicts",
    "taskFit",
  ]) {
    const incomplete = /** @type {Record<string, any>} */ (structuredClone(candidate));
    delete incomplete[field];
    const result = evaluateCapabilityCandidate(gap, incomplete);
    assert.equal(result.status, "REJECTED", field);
    assert.match(result.findings.join("\n"), new RegExp(field, "iu"), field);
  }
});

test("unsafe candidates are rejected before installation", () => {
  const adversarial = /** @type {Array<[Record<string, any>, string]>} */ ([
    [{ ...candidate, provenance: "UNKNOWN" }, "provenance"],
    [{ ...candidate, source: "file:///untrusted/candidate" }, "source"],
    [{ ...candidate, source: "https://user:password@example.test/candidate" }, "source"],
    [{ ...candidate, scripts: ["postinstall"] }, "scripts"],
    [{
      ...candidate,
      instructions: { status: "CONFLICTING", evidenceId: "instruction-audit" },
    }, "instructions"],
    [{ ...candidate, permissions: ["project-read", "host-write"] }, "permissions"],
    [{ ...candidate, conflicts: ["project-runtime"] }, "conflicts"],
    [{
      ...candidate,
      taskFit: { ...candidate.taskFit, missingBehavior: "A different behavior." },
    }, "taskFit"],
  ]);
  for (const [unsafeCandidate, finding] of adversarial) {
    const result = evaluateCapabilityCandidate(gap, unsafeCandidate);
    assert.equal(result.status, "REJECTED", finding);
    assert.match(result.findings.join("\n"), new RegExp(finding, "iu"), finding);
  }
});

test("trust or cost expansion stops at a Human Gate", () => {
  for (const action of ["globalInstall", "credentials", "writeEnabledMcp", "paidProbe"]) {
    const gated = /** @type {Record<string, any>} */ (structuredClone(candidate));
    gated.requestedActions[action] = true;
    const result = evaluateCapabilityCandidate(gap, gated);
    assert.equal(result.status, "HUMAN_GATE", action);
    assert.ok(result.humanGate);
    assert.equal(result.humanGate.approved, false);
    assert.deepEqual(result.humanGate.requestedActions, [action]);
    assert.match(result.humanGate.approvalHash, /^[a-f0-9]{64}$/u);
  }
  const gated = structuredClone(candidate);
  gated.requestedActions.paidProbe = true;
  const original = evaluateCapabilityCandidate(gap, gated);
  const changed = evaluateCapabilityCandidate(gap, { ...gated, license: "Apache-2.0" });
  assert.notEqual(
    original.humanGate?.approvalHash,
    changed.humanGate?.approvalHash,
    "every trust input must change the exact Human Gate hash",
  );
});
