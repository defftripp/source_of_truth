import assert from "node:assert/strict";
import test from "node:test";
import {
  deepAdvisorEvidence,
  validateDeepPlanContract,
  validateDeepResearchContract,
} from "../../skills/engineering-loop/runtime/deep-contracts.mjs";
import { computeMigrationManifestHash } from "../../skills/engineering-loop/runtime/contracts.mjs";
import { createMigrationManifestHumanGate } from "../../skills/engineering-loop/runtime/engine.mjs";

const approvedManifestHash = "d5ad4d66a0d8b5d2db2d28fc1c82a4ebdc697f7db51cd75fbfd3e2c2aeee8f8d";

test("Migration Manifest Human Gate exposes the complete MOVE scope", () => {
  const gate = createMigrationManifestHumanGate("request-hash", ["fact-move"], {
    hash: "a".repeat(64),
    actions: [{ action: "MOVE", path: "src/old.mjs", destination: "src/new.mjs" }],
  });

  assert.deepEqual(gate.destructivePaths, ["src/new.mjs", "src/old.mjs"]);
  assert.deepEqual(gate.question.alternatives, []);
});

test("DEEP research links required high-risk evidence to domain boundaries and allowed CONTEXT/ADR decisions", () => {
  assert.deepEqual(validateDeepResearchContract(researchContract(), {
    requiredEvidenceIds: ["fact-payment-boundary", "fact-rollback-owner"],
  }), { valid: true, status: "READY", errors: [] });
});

test("missing high-risk evidence is invalid instead of becoming degraded evidence", () => {
  const research = researchContract();
  research.facts = research.facts.filter((fact) => fact.id !== "fact-rollback-owner");

  const result = validateDeepResearchContract(research, {
    requiredEvidenceIds: ["fact-payment-boundary", "fact-rollback-owner"],
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, "BLOCKED");
  assert.match(result.errors.join("\n"), /required high-risk evidence.*fact-rollback-owner/iu);
});

for (const field of ["tickets", "migrationContract", "rollbackPlan", "migrationManifest"]) {
  test(`Advisor prerequisites reject a DEEP plan without ${field}`, () => {
    const plan = /** @type {Record<string, any>} */ (planContract());
    delete plan[field];

    const result = validateDeepPlanContract(plan, {
      schemaVersion: 1,
      manifestHash: approvedManifestHash,
      approved: true,
    });

    assert.equal(result.valid, false);
    assert.equal(result.status, "REVISE");
    assert.match(result.errors.join("\n"), new RegExp(field, "iu"));
  });
}

test("exact approval is bound to the complete destructive Migration Manifest scope", () => {
  const approved = validateDeepPlanContract(planContract(), {
    schemaVersion: 1,
    manifestHash: approvedManifestHash,
    approved: true,
  });
  assert.deepEqual(approved, { valid: true, status: "READY_FOR_ADVISOR", errors: [] });

  const changed = planContract();
  changed.migrationManifest.actions[0].path = "src/refunds.mjs";
  const rejected = validateDeepPlanContract(changed, {
    schemaVersion: 1,
    manifestHash: approvedManifestHash,
    approved: true,
  });
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join("\n"), /manifest hash|approval/iu);
});

test("destructive scope omitting required source or replacement hashes is REVISE", () => {
  const incomplete = /** @type {any} */ (planContract());
  delete incomplete.migrationManifest.actions[0].contentSha256;
  incomplete.migrationManifest.hash = computeMigrationManifestHash(incomplete.migrationManifest.actions);

  const result = validateDeepPlanContract(incomplete, {
    schemaVersion: 1,
    manifestHash: incomplete.migrationManifest.hash,
    approved: true,
  });

  assert.equal(result.status, "REVISE");
  assert.match(result.errors.join("\n"), /migrationManifest/iu);
});

for (const scenario of ["MOVE without destination", "duplicate action path"]) {
  test(`${scenario} cannot receive exact manifest approval`, () => {
    const incomplete = /** @type {any} */ (planContract());
    if (scenario === "MOVE without destination") {
      incomplete.migrationManifest.actions = [{
        action: "MOVE",
        path: "src/payment.mjs",
        sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }];
    } else {
      incomplete.migrationManifest.actions.push({ ...incomplete.migrationManifest.actions[0] });
    }
    incomplete.migrationManifest.hash = computeMigrationManifestHash(incomplete.migrationManifest.actions);

    const result = validateDeepPlanContract(incomplete, {
      schemaVersion: 1,
      manifestHash: incomplete.migrationManifest.hash,
      approved: true,
    });

    assert.equal(result.status, "REVISE");
    assert.match(result.errors.join("\n"), /migrationManifest/iu);
  });
}

test("Advisor evidence covers graph, domain, migration, rollback, and exact approval", () => {
  assert.deepEqual(deepAdvisorEvidence(planContract(), approvedManifestHash), [
    "deep-domain-boundary-payment-ledger",
    "deep-manifest-approval-d5ad4d66a0d8b5d2",
    "deep-migration-contract-migration-payment-ledger",
    "deep-rollback-plan-rollback-payment-ledger",
  ]);
});

test("DEEP planning binds researched boundaries and approved destructive scope to the Write Lease", () => {
  const plan = planContract();
  plan.domainBoundaryIds = ["invented-boundary"];

  const result = validateDeepPlanContract(plan, {
    schemaVersion: 1,
    manifestHash: approvedManifestHash,
    approved: true,
  }, {
    domainBoundaryIds: ["payment-ledger"],
    writeLease: ["src/other.mjs"],
  });

  assert.equal(result.status, "REVISE");
  assert.match(result.errors.join("\n"), /researched domain boundaries/iu);
  assert.match(result.errors.join("\n"), /destructive scope.*Write Lease/iu);
});

function researchContract() {
  return {
    schemaVersion: 1,
    facts: [
      {
        id: "fact-payment-boundary",
        statement: "Payment writes are isolated behind the ledger module.",
        evidence: ["src/payment.mjs"],
        answersDecisionQuestions: [],
      },
      {
        id: "fact-rollback-owner",
        statement: "Operations owns the rollback verification.",
        evidence: ["test/payment.test.mjs"],
        answersDecisionQuestions: [],
      },
    ],
    domainModel: {
      boundaries: [
        {
          id: "payment-ledger",
          name: "Payment ledger",
          responsibilities: ["Persist idempotent payment state."],
          evidenceIds: ["fact-payment-boundary", "fact-rollback-owner"],
        },
      ],
      decisions: [
        {
          id: "decision-ledger-owner",
          record: "CONTEXT",
          statement: "The payment ledger owns durable payment state.",
          boundaryIds: ["payment-ledger"],
          evidenceIds: ["fact-payment-boundary"],
        },
        {
          id: "decision-rollback",
          record: "ADR",
          statement: "Rollback restores the previous ledger implementation.",
          boundaryIds: ["payment-ledger"],
          evidenceIds: ["fact-rollback-owner"],
        },
      ],
    },
  };
}

function planContract() {
  return {
    schemaVersion: 1,
    domainBoundaryIds: ["payment-ledger"],
    tickets: [
      {
        id: "TICKET-1",
        dependencies: [],
      },
    ],
    migrationContract: {
      id: "migration-payment-ledger",
      preconditions: ["fact-payment-boundary"],
      postconditions: ["payment behavior is instrumentally verified"],
    },
    rollbackPlan: {
      id: "rollback-payment-ledger",
      triggerConditions: ["instrumental verification fails"],
      steps: ["Restore the previous payment module from the checkpoint."],
      verificationIds: ["payment-test"],
    },
    migrationManifest: {
      schemaVersion: 1,
      kind: "MIGRATION_MANIFEST",
      hashAlgorithm: "sha256",
      hash: approvedManifestHash,
      actions: [
        {
          action: "REWRITE",
          path: "src/payment.mjs",
          sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          contentSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    },
  };
}
